/**
 * GXE Graph Compiler - Type Check Bridge
 *
 * Phase 0: Foundation (Day 5)
 *
 * Bridges raw graph nodes/edges to ExecutionPlan format for type checking.
 * This is NOT the compiler - it's an adapter for validating LLM-generated
 * or manually constructed graphs before execution.
 *
 * Flow:
 * Frontend graph (nodes + edges)
 *         │
 *         ▼
 * buildTypeCheckablePlan()  ← This module
 *         │
 *         ▼
 * typeCheckPlan()           ← type-checker.ts
 *         │
 *         ▼
 * TypeCheckResult
 */

import {
  ToolPortSpec,
  PortDefinition,
  PortType,
  textType,
  jsonType,
  anyType,
} from './compiler-types';

import {
  ExecutionPlan,
  ExecutionNode,
  ExecutionEdge,
  InputPortBinding,
  OutputPortBinding,
  ProcessGraph,
  IntentSpec,
  ParamSpec,
  ExecutionPlanTypeCheck,
} from './ir-types';

import {
  getToolSpec,
  toolExists,
  getInputPorts,
  getOutputPorts,
} from './tool-port-registry';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Raw graph node from frontend/LLM.
 */
export interface RawGraphNode {
  id: string;
  toolId: string;
  label?: string;
  config?: Record<string, unknown>;
}

/**
 * Raw graph edge from frontend/LLM.
 */
export interface RawGraphEdge {
  source: {
    nodeId: string;
    port: string;
  };
  target: {
    nodeId: string;
    port: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BRIDGE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert raw graph nodes and edges into an ExecutionPlan for type checking.
 *
 * This function:
 * 1. Looks up each node's toolId in the registry
 * 2. Creates ExecutionNode with full port definitions from registry
 * 3. Maps edges to ExecutionEdge format
 * 4. Extracts required parameters from entry nodes
 *
 * @param nodes - Raw graph nodes with toolId
 * @param edges - Raw graph edges with port references
 * @returns ExecutionPlan suitable for typeCheckPlan()
 */
export function buildTypeCheckablePlan(
  nodes: RawGraphNode[],
  edges: RawGraphEdge[]
): ExecutionPlan {
  // Build node lookup
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build edge lookup by target for finding sources
  const edgesByTarget = new Map<string, RawGraphEdge[]>();
  for (const edge of edges) {
    const key = `${edge.target.nodeId}:${edge.target.port}`;
    const existing = edgesByTarget.get(key) || [];
    existing.push(edge);
    edgesByTarget.set(key, existing);
  }

  // Build edge lookup by source for finding consumers
  const edgesBySource = new Map<string, string[]>();
  for (const edge of edges) {
    const key = `${edge.source.nodeId}:${edge.source.port}`;
    const existing = edgesBySource.get(key) || [];
    existing.push(`${edge.target.nodeId}:${edge.target.port}`);
    edgesBySource.set(key, existing);
  }

  // Convert nodes to ExecutionNode
  const executionNodes: ExecutionNode[] = [];
  const requiredParams: Record<string, ParamSpec> = {};

  for (const node of nodes) {
    const toolSpec = getToolSpec(node.toolId);

    if (!toolSpec) {
      // Unknown tool - create placeholder node
      // Type check will fail at port validation
      executionNodes.push(createPlaceholderNode(node));
      continue;
    }

    // Build input port bindings
    const inputPorts: InputPortBinding[] = toolSpec.inputPorts.map(portDef => {
      const edgeKey = `${node.id}:${portDef.name}`;
      const incomingEdges = edgesByTarget.get(edgeKey) || [];

      let source = '';
      if (incomingEdges.length > 0) {
        const edge = incomingEdges[0]; // Take first edge
        source = `${edge.source.nodeId}:${edge.source.port}`;
      } else if (portDef.default !== undefined) {
        // Has default value - no source needed
        source = '__default';
      } else if (portDef.required) {
        // Required with no source - mark as param
        source = `__params:${portDef.name}`;
        requiredParams[`${node.id}.${portDef.name}`] = {
          type: portTypeToParamType(portDef.type),
          label: `${node.label || node.id} - ${portDef.name}`,
          placeholder: portDef.description,
          required: true,
        };
      }

      return {
        name: portDef.name,
        type: portDef.type,
        source,
        required: portDef.required,
      };
    });

    // Build output port bindings
    const outputPorts: OutputPortBinding[] = toolSpec.outputPorts.map(portDef => {
      const edgeKey = `${node.id}:${portDef.name}`;
      const consumers = edgesBySource.get(edgeKey) || [];

      return {
        name: portDef.name,
        type: portDef.type,
        consumers,
      };
    });

    executionNodes.push({
      id: node.id,
      toolId: node.toolId,
      toolLevel: toolSpec.level,
      inputPorts,
      outputPorts,
      config: node.config || {},
      timeout: toolSpec.estimatedDurationMs * 2, // 2x estimated as timeout
      retryPolicy: {
        maxRetries: toolSpec.retryable ? 3 : 0,
        backoff: 'exponential',
      },
    });
  }

  // Convert edges to ExecutionEdge
  const executionEdges: ExecutionEdge[] = edges
    .filter(e => e.source.nodeId !== '__params')
    .map(edge => ({
      source: {
        nodeId: edge.source.nodeId,
        port: edge.source.port,
      },
      target: {
        nodeId: edge.target.nodeId,
        port: edge.target.port,
      },
      typeCompatible: false, // Will be set by type checker
    }));

  // Create minimal ProcessGraph and IntentSpec for the plan
  const minimalIntent: IntentSpec = {
    id: 'type-check-intent',
    originalText: 'Type check validation',
    goal: 'Validate graph types',
    goalType: 'pipeline',
    actors: [],
    constraints: [],
    domain: {
      primary: 'validation',
      unSystems: [],
      knowledgeLayer: 'code',
    },
    complexity: {
      level: 'simple',
      estimatedNodes: nodes.length,
      hasConditionalLogic: false,
      hasParallelPaths: false,
      hasExternalIntegrations: false,
      requiresHumanInLoop: false,
      decompositionDepth: 0,
    },
    dataEntities: [],
    createdAt: new Date().toISOString(),
  };

  const minimalProcessGraph: ProcessGraph = {
    id: 'type-check-process',
    intentId: minimalIntent.id,
    intent: minimalIntent,
    steps: [],
    flows: [],
    validation: {
      isDAG: true,
      hasUnreachableNodes: false,
      allPathsReachEnd: true,
      orphanNodes: [],
      warnings: [],
    },
    createdAt: new Date().toISOString(),
  };

  return {
    id: `type-check-plan-${Date.now()}`,
    processGraphId: minimalProcessGraph.id,
    processGraph: minimalProcessGraph,
    nodes: executionNodes,
    edges: executionEdges,
    requiredParams,
    typeCheck: {
      passed: false, // Will be updated by type checker
      errorCount: 0,
      warningCount: 0,
      autoInsertedAdapters: 0,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a placeholder node for unknown tools.
 */
function createPlaceholderNode(node: RawGraphNode): ExecutionNode {
  return {
    id: node.id,
    toolId: node.toolId,
    toolLevel: 1,
    inputPorts: [{
      name: 'input',
      type: anyType(),
      source: '',
      required: true,
    }],
    outputPorts: [{
      name: 'output',
      type: anyType(),
      consumers: [],
    }],
    config: node.config || {},
    timeout: 5000,
    retryPolicy: {
      maxRetries: 0,
      backoff: 'linear',
    },
  };
}

/**
 * Convert port type to param input type.
 */
function portTypeToParamType(type: PortType): ParamSpec['type'] {
  switch (type.kind) {
    case 'text':
      return 'text';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
    case 'list':
    case 'record':
      return 'textarea'; // JSON input
    default:
      return 'text';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate raw nodes have required fields.
 */
export function validateRawNodes(nodes: unknown[]): nodes is RawGraphNode[] {
  return nodes.every(n =>
    typeof n === 'object' &&
    n !== null &&
    'id' in n &&
    'toolId' in n &&
    typeof (n as any).id === 'string' &&
    typeof (n as any).toolId === 'string'
  );
}

/**
 * Validate raw edges have required fields.
 */
export function validateRawEdges(edges: unknown[]): edges is RawGraphEdge[] {
  return edges.every(e =>
    typeof e === 'object' &&
    e !== null &&
    'source' in e &&
    'target' in e &&
    typeof (e as any).source === 'object' &&
    typeof (e as any).target === 'object' &&
    typeof (e as any).source?.nodeId === 'string' &&
    typeof (e as any).source?.port === 'string' &&
    typeof (e as any).target?.nodeId === 'string' &&
    typeof (e as any).target?.port === 'string'
  );
}

/**
 * Extract node IDs from edges for validation.
 */
export function getReferencedNodeIds(edges: RawGraphEdge[]): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.source.nodeId !== '__params') {
      ids.add(edge.source.nodeId);
    }
    ids.add(edge.target.nodeId);
  }
  return ids;
}

/**
 * Find missing tools in nodes.
 */
export function findMissingTools(nodes: RawGraphNode[]): string[] {
  return nodes
    .filter(n => !toolExists(n.toolId))
    .map(n => n.toolId);
}
