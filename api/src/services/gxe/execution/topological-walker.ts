/**
 * GXE Execution Engine - Topological Walker
 *
 * Phase 0: Foundation (Day 7)
 *
 * Main graph execution loop that walks nodes in topological order,
 * collects inputs, executes tools, and stores outputs.
 */

import {
  ToolPortSpec,
} from '../compiler/compiler-types';

import {
  ExecutionNode,
  ExecutionEdge,
} from '../compiler/ir-types';

import {
  getToolSpec,
} from '../compiler/tool-port-registry';

import {
  ExecutionContext,
  SSEEmitter,
  NullSSEEmitter,
} from './execution-context';

import {
  ServiceContainer,
  getInputMapping,
} from './service-container';

import { withRetry, createPolicyFromToolSpec, DEFAULT_RETRY_POLICY } from './retry-policy';

import {
  createStartEvent,
  createCompleteEvent,
  createFailedEvent,
} from './sse-emitter';

import {
  executeControlFlow,
  isControlFlowNode,
} from './control-flow';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validated graph ready for execution.
 * Contains nodes, edges, and topological order.
 */
export interface ValidatedGraph {
  id: string;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  topologicalOrder: string[];
  params: Record<string, unknown>;
}

/**
 * Walker execution result summary (different from ExecutionContext.ExecutionResult).
 */
export interface WalkerResult {
  executionId: string;
  success: boolean;
  context: ExecutionContext;
  durationMs: number;
  nodeStats: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  error?: string;
  failedNodeId?: string;
}

/**
 * Node execution function type for control flow callbacks.
 */
export type ExecuteNodeFunction = (
  nodeId: string
) => Promise<Record<string, unknown> | null>;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build adjacency map from edges.
 */
function buildAdjacencyMap(edges: ExecutionEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const edge of edges) {
    const sourceId = edge.source.nodeId;
    const targetId = edge.target.nodeId;

    if (sourceId === '__params') continue;

    const existing = adjacency.get(sourceId) || [];
    if (!existing.includes(targetId)) {
      existing.push(targetId);
    }
    adjacency.set(sourceId, existing);
  }

  return adjacency;
}

/**
 * Build edge lookup by target node:port.
 */
function buildEdgesByTarget(edges: ExecutionEdge[]): Map<string, ExecutionEdge[]> {
  const map = new Map<string, ExecutionEdge[]>();

  for (const edge of edges) {
    const key = `${edge.target.nodeId}:${edge.target.port}`;
    const existing = map.get(key) || [];
    existing.push(edge);
    map.set(key, existing);
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a validated graph in topological order.
 *
 * @param graph - Validated graph with nodes, edges, and topological order
 * @param emitter - SSE emitter for streaming status updates
 * @param serviceContainer - Container for resolving tool services
 * @returns Execution result with context and statistics
 */
export async function executeGraph(
  graph: ValidatedGraph,
  emitter: SSEEmitter = new NullSSEEmitter(),
  serviceContainer: ServiceContainer
): Promise<WalkerResult> {
  const startTime = Date.now();

  // Build adjacency map for downstream marking
  const adjacency = buildAdjacencyMap(graph.edges);

  // Create execution context
  const context = new ExecutionContext(
    graph.id,
    graph.topologicalOrder,
    adjacency,
    graph.params,
    emitter
  );

  // Emit execution start
  context.emitStart(0); // Estimated time not calculated

  // Build lookup maps
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const edgesByTarget = buildEdgesByTarget(graph.edges);

  // Track execution state
  let failedNodeId: string | undefined;
  let executionError: string | undefined;

  try {
    // Walk nodes in topological order
    for (const nodeId of graph.topologicalOrder) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        throw new Error(`Node not found in graph: ${nodeId}`);
      }

      // Check if node was skipped (by upstream failure or control flow)
      if (context.isSkipped(nodeId)) {
        continue;
      }

      // Get tool spec
      const toolSpec = getToolSpec(node.toolId);
      if (!toolSpec) {
        context.markFailed(nodeId, `Unknown tool: ${node.toolId}`);
        context.markDownstreamSkipped(nodeId, `Upstream node '${nodeId}' failed`);
        failedNodeId = nodeId;
        executionError = `Unknown tool: ${node.toolId}`;
        break;
      }

      // Check required inputs from potentially skipped sources
      const inputsValid = checkRequiredInputs(
        nodeId,
        toolSpec,
        edgesByTarget,
        context
      );

      if (!inputsValid) {
        // Node was marked as skipped by checkRequiredInputs
        continue;
      }

      // Collect inputs for this node
      let inputs: Record<string, unknown>;
      try {
        inputs = collectInputs(nodeId, toolSpec, edgesByTarget, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.markFailed(nodeId, message);
        context.markDownstreamSkipped(nodeId, `Upstream node '${nodeId}' failed`);
        failedNodeId = nodeId;
        executionError = message;
        break;
      }

      // Mark node as running
      context.markRunning(nodeId);

      // Execute the node
      let result: Record<string, unknown>;
      try {
        if (isControlFlowNode(node.toolId)) {
          // Execute control flow
          result = await executeControlFlow(
            nodeId,
            node.toolId,
            inputs,
            context,
            graph,
            serviceContainer,
            createExecuteNodeFn(graph, context, serviceContainer, nodeMap, edgesByTarget)
          );
        } else {
          // Execute regular tool
          result = await executeToolCall(
            nodeId,
            toolSpec,
            inputs,
            serviceContainer
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.markFailed(nodeId, message);
        context.markDownstreamSkipped(nodeId, `Upstream node '${nodeId}' failed`);
        failedNodeId = nodeId;
        executionError = message;
        break;
      }

      // Store outputs
      storeOutputs(nodeId, toolSpec, result, context);

      // Generate preview and mark completed
      const preview = generatePreview(node.toolId, result);
      context.markCompleted(nodeId, preview);
    }
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
  }

  // Calculate statistics
  const durationMs = Date.now() - startTime;
  const stats = context.getStats();
  const success = !executionError && stats.failed === 0;

  // Emit final event
  if (success) {
    context.complete();
  } else {
    context.fail(executionError || 'Unknown error', failedNodeId);
  }

  return {
    executionId: context.executionId,
    success,
    context,
    durationMs,
    nodeStats: {
      total: graph.nodes.length,
      completed: stats.completed,
      failed: stats.failed,
      skipped: stats.skipped,
    },
    error: executionError,
    failedNodeId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if required inputs are available (source not skipped).
 * Returns false and marks node as skipped if required input is unavailable.
 */
function checkRequiredInputs(
  nodeId: string,
  toolSpec: ToolPortSpec,
  edgesByTarget: Map<string, ExecutionEdge[]>,
  context: ExecutionContext
): boolean {
  for (const port of toolSpec.inputPorts) {
    // Skip optional ports and ports with defaults
    if (!port.required || port.default !== undefined) {
      continue;
    }

    const key = `${nodeId}:${port.name}`;
    const incomingEdges = edgesByTarget.get(key) || [];

    if (incomingEdges.length === 0) {
      // No edge - will be caught by collectInputs if no param
      continue;
    }

    const edge = incomingEdges[0];

    // Skip param edges
    if (edge.source.nodeId === '__params') {
      continue;
    }

    // Check if source node is skipped
    if (context.isSkipped(edge.source.nodeId)) {
      context.markSkipped(
        nodeId,
        `Required input '${port.name}' from skipped node '${edge.source.nodeId}'`
      );
      return false;
    }
  }

  return true;
}

/**
 * Collect inputs for a node from edges, params, and defaults.
 */
function collectInputs(
  nodeId: string,
  toolSpec: ToolPortSpec,
  edgesByTarget: Map<string, ExecutionEdge[]>,
  context: ExecutionContext
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};

  for (const port of toolSpec.inputPorts) {
    const key = `${nodeId}:${port.name}`;
    const incomingEdges = edgesByTarget.get(key) || [];

    if (incomingEdges.length > 0) {
      const edge = incomingEdges[0]; // Take first edge

      let value: unknown;

      if (edge.source.nodeId === '__params') {
        // Input from params
        value = context.getParam(edge.source.port);
      } else {
        // Input from another node's output
        value = context.getOutput(edge.source.nodeId, edge.source.port);
      }

      // TODO: Apply adapter if present when edge has adapter field

      inputs[port.name] = value;

    } else if (port.default !== undefined) {
      // Use default value
      inputs[port.name] = port.default;

    } else if (port.required) {
      // Required port with no source and no default
      throw new Error(`Missing required input: ${port.name} for node ${nodeId}`);
    }
    // Optional port with no source and no default - simply omit
  }

  return inputs;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a tool call with retry policy.
 */
async function executeToolCall(
  nodeId: string,
  toolSpec: ToolPortSpec,
  inputs: Record<string, unknown>,
  serviceContainer: ServiceContainer
): Promise<Record<string, unknown>> {
  const serviceId = deriveServiceId(toolSpec.toolId);
  const method = deriveMethodName(toolSpec.toolId);

  // Get input mapping for positional arguments
  const inputMapping = getInputMapping(serviceId, method);

  // Create retry policy from tool spec
  const retryPolicy = createPolicyFromToolSpec(
    toolSpec.retryable,
    toolSpec.estimatedDurationMs
  );

  // Execute with retry
  const result = await withRetry(
    async () => {
      const callResult = await serviceContainer.callService(
        serviceId,
        method,
        inputs,
        inputMapping
      );

      if (!callResult.success) {
        throw new Error(callResult.error || 'Service call failed');
      }

      return callResult.data || {};
    },
    retryPolicy,
    toolSpec.retryable
  );

  return result;
}

/**
 * Derive service ID from tool ID.
 * Example: 'text.sanitize' -> 'TextSanitizer'
 */
function deriveServiceId(toolId: string): string {
  const [category, action] = toolId.split('.');

  const actionMap: Record<string, string> = {
    'sanitize': 'TextSanitizer',
    'detect_language': 'LanguageDetector',
    'chunk': 'TextChunker',
    'normalize': 'TextNormalizer',
    'entities': 'EntityExtractor',
    'relations': 'RelationExtractor',
    'embed': 'TEIService',
    'search': 'QdrantService',
    'write': 'QdrantService',
    'query': 'MemgraphService',
    'create_node': 'MemgraphService',
    'create_edge': 'MemgraphService',
    'generate': 'LLMService',
    'classify': 'LLMService',
  };

  return actionMap[action] || `${category}Service`;
}

/**
 * Derive method name from tool ID.
 * Example: 'text.sanitize' -> 'sanitize'
 */
function deriveMethodName(toolId: string): string {
  const [_, action] = toolId.split('.');

  const methodMap: Record<string, string> = {
    'detect_language': 'detect',
    'entities': 'extract',
    'relations': 'extract',
    'create_node': 'createNode',
    'create_edge': 'createEdge',
  };

  return methodMap[action] || action;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store tool outputs in execution context.
 */
function storeOutputs(
  nodeId: string,
  toolSpec: ToolPortSpec,
  result: Record<string, unknown>,
  context: ExecutionContext
): void {
  for (const port of toolSpec.outputPorts) {
    const value = result[port.name];
    if (value !== undefined) {
      context.setOutput(nodeId, port.name, value);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a human-readable preview string for tool output.
 */
function generatePreview(toolId: string, result: Record<string, unknown>): string {
  const stats = result.stats as Record<string, unknown> | undefined;
  const usage = result.usage as Record<string, unknown> | undefined;

  switch (toolId) {
    case 'text.sanitize':
      return `Sanitized (${stats?.chars_removed ?? 0} chars removed)`;

    case 'text.chunk':
      return `${result.chunk_count ?? '?'} chunks`;

    case 'text.detect_language':
      const confidence = result.confidence as number;
      return `Language: ${result.language} (${confidence ? (confidence * 100).toFixed(0) : '?'}%)`;

    case 'text.normalize':
      return 'Text normalized';

    case 'vector.embed':
      const embedding = result.embedding as unknown[] | undefined;
      return `Embedding ${embedding?.length ?? '?'}d`;

    case 'vector.search':
      return `${result.result_count ?? 0} results`;

    case 'vector.write':
      return `Stored: ${result.point_id}`;

    case 'extraction.entities':
      return `${result.entity_count ?? 0} entities`;

    case 'extraction.relations':
      const relations = result.relations as unknown[] | undefined;
      return `${relations?.length ?? 0} relations`;

    case 'graph.create_node':
      return `Node created`;

    case 'graph.create_edge':
      return `Edge created`;

    case 'graph.query':
      return `${result.record_count ?? 0} records`;

    case 'ai.generate':
      return `${usage?.completion_tokens ?? '?'} tokens`;

    case 'ai.classify':
      const classConfidence = result.confidence as number;
      return `${result.category} (${classConfidence ? (classConfidence * 100).toFixed(0) : '?'}%)`;

    case 'control.condition':
      return `Condition: ${result.result}`;

    case 'control.parallel':
      return `${result.branch_count ?? 0} branches`;

    default:
      return 'Completed';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE NODE FUNCTION FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an executeNode function for control flow callbacks.
 */
function createExecuteNodeFn(
  graph: ValidatedGraph,
  context: ExecutionContext,
  serviceContainer: ServiceContainer,
  nodeMap: Map<string, ExecutionNode>,
  edgesByTarget: Map<string, ExecutionEdge[]>
): ExecuteNodeFunction {
  return async (nodeId: string): Promise<Record<string, unknown> | null> => {
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Check if already executed or skipped
    const status = context.getStatus(nodeId);
    if (status.state === 'completed' || status.state === 'skipped' || status.state === 'failed') {
      return null;
    }

    // Get tool spec
    const toolSpec = getToolSpec(node.toolId);
    if (!toolSpec) {
      context.markFailed(nodeId, `Unknown tool: ${node.toolId}`);
      return null;
    }

    // Check required inputs
    if (!checkRequiredInputs(nodeId, toolSpec, edgesByTarget, context)) {
      return null;
    }

    // Collect inputs
    const inputs = collectInputs(nodeId, toolSpec, edgesByTarget, context);

    // Mark running
    context.markRunning(nodeId);

    // Execute
    let result: Record<string, unknown>;

    if (isControlFlowNode(node.toolId)) {
      result = await executeControlFlow(
        nodeId,
        node.toolId,
        inputs,
        context,
        graph,
        serviceContainer,
        createExecuteNodeFn(graph, context, serviceContainer, nodeMap, edgesByTarget)
      );
    } else {
      result = await executeToolCall(nodeId, toolSpec, inputs, serviceContainer);
    }

    // Store outputs
    storeOutputs(nodeId, toolSpec, result, context);

    // Mark completed
    const preview = generatePreview(node.toolId, result);
    context.markCompleted(nodeId, preview);

    return result;
  };
}
