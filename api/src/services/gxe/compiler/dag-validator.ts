/**
 * GXE Graph Compiler - DAG Validator
 *
 * Phase 0: Foundation (Day 4-5)
 *
 * Validates directed acyclic graph structure and execution readiness.
 *
 * Validation Levels:
 * - Level 0: Structural Integrity (Day 4)
 * - Level 1: DAG Properties (Day 4)
 * - Level 2: Flow Integrity (Day 4)
 * - Level 3: Tool Validity (Day 5)
 * - Level 4: Type Safety (Day 5 - delegates to typeCheckPlan)
 * - Level 5: Execution Readiness (Day 5)
 *
 * Execution stops at first failed level - no point checking types if graph has cycles.
 */

import { ToolPortSpec, TypeCheckResult } from './compiler-types';
import { ExecutionPlan, ExecutionNode, ExecutionEdge, DAGNode, DAGEdge, ParamSpec } from './ir-types';
import { getToolSpec, toolExists } from './tool-port-registry';
import { typeCheckPlan } from './type-checker';
import { buildTypeCheckablePlan, RawGraphNode, RawGraphEdge } from './type-check-bridge';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Graph structures computed once and shared across levels.
 */
export interface GraphStructures {
  /** Forward adjacency: nodeId → [targetNodeIds] */
  adjacency: Map<string, string[]>;
  /** Reverse adjacency: nodeId → [sourceNodeIds] */
  reverseAdjacency: Map<string, string[]>;
  /** In-degree count per node */
  inDegree: Map<string, number>;
  /** Out-degree count per node */
  outDegree: Map<string, number>;
  /** Set of all node IDs */
  nodeIds: Set<string>;
}

/**
 * Level 0 result: Structural integrity.
 */
export interface StructuralResult {
  passed: boolean;
  errors: Array<{
    code: 'EMPTY_GRAPH' | 'INVALID_EDGE_REF' | 'SELF_LOOP' | 'DUPLICATE_EDGE';
    message: string;
    nodeId?: string;
    edgeKey?: string;
  }>;
}

/**
 * Level 1 result: DAG properties.
 */
export interface DAGResult {
  passed: boolean;
  isDAG: boolean;
  /** Topological order - CRITICAL for Execution Engine */
  topologicalOrder: string[];
  /** Nodes involved in cycles (for UI highlighting) */
  cycleNodes: string[];
  /** Number of disconnected subgraphs */
  connectedComponents: number;
}

/**
 * Level 2 result: Flow integrity.
 */
export interface FlowResult {
  passed: boolean;
  entryNodes: string[];
  exitNodes: string[];
  /** Nodes not reachable from any entry (UI: red) */
  unreachableFromEntry: string[];
  /** Nodes with no path to any exit (UI: orange) */
  unreachableToExit: string[];
  /** Isolated nodes with no edges (UI: gray dashed) */
  orphanNodes: string[];
}

/**
 * Level 3 result: Tool validity.
 */
export interface ToolValidityResult {
  passed: boolean;
  errors: Array<{
    code: 'UNKNOWN_TOOL' | 'MISSING_REQUIRED_CONFIG';
    nodeId: string;
    toolId?: string;
    message: string;
  }>;
}

/**
 * Level 5 result: Execution readiness.
 */
export interface ExecutionReadinessResult {
  passed: boolean;
  missingParams: string[];
  warnings: string[];
  /** Estimated total duration (critical path) in ms */
  estimatedDurationMs: number;
}

/**
 * Complete validation result aggregating all levels.
 */
export interface ValidationResult {
  /** Overall success - all levels passed */
  passed: boolean;
  /** Highest completed level (0-5) */
  completedLevel: number;
  /** Level-specific results */
  structural: StructuralResult;
  dag?: DAGResult;
  flow?: FlowResult;
  toolValidity?: ToolValidityResult;
  typeCheck?: TypeCheckResult;
  executionReadiness?: ExecutionReadinessResult;
  /** Summary of all errors */
  errors: Array<{
    level: number;
    code: string;
    message: string;
    nodeId?: string;
  }>;
  /** Summary of all warnings */
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build all graph structures in a single pass.
 */
export function buildGraphStructures(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>
): GraphStructures {
  const nodeIds = new Set(nodes.map(n => n.id));
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  // Initialize all nodes
  for (const node of nodes) {
    adjacency.set(node.id, []);
    reverseAdjacency.set(node.id, []);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }

  // Process edges
  for (const edge of edges) {
    const sourceId = edge.source.nodeId;
    const targetId = edge.target.nodeId;

    // Skip edges from __params
    if (sourceId === '__params') continue;

    if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
      adjacency.get(sourceId)!.push(targetId);
      reverseAdjacency.get(targetId)!.push(sourceId);
      inDegree.set(targetId, inDegree.get(targetId)! + 1);
      outDegree.set(sourceId, outDegree.get(sourceId)! + 1);
    }
  }

  return { adjacency, reverseAdjacency, inDegree, outDegree, nodeIds };
}

/**
 * BFS traversal from start nodes using given adjacency.
 */
export function bfs(
  startIds: string[],
  adjacency: Map<string, string[]>
): Set<string> {
  const visited = new Set<string>();
  const queue = [...startIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 0: STRUCTURAL INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate structural integrity of the graph.
 *
 * Checks:
 * - 0.1 Non-empty graph
 * - 0.2 Edge reference validity
 * - 0.3 No self-loops
 * - 0.4 No duplicate edges
 */
export function validateStructural(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: { nodeId: string; port: string }; target: { nodeId: string; port: string } }>
): StructuralResult {
  const errors: StructuralResult['errors'] = [];

  // 0.1 Non-empty graph
  if (nodes.length === 0) {
    errors.push({
      code: 'EMPTY_GRAPH',
      message: 'Graph is empty — no nodes defined',
    });
    return { passed: false, errors };
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const edgeKeys = new Set<string>();

  for (const edge of edges) {
    // Skip __params edges for structural validation
    if (edge.source.nodeId === '__params') continue;

    // 0.2 Edge reference validity
    if (!nodeIds.has(edge.source.nodeId)) {
      errors.push({
        code: 'INVALID_EDGE_REF',
        message: `Edge references non-existent source node: ${edge.source.nodeId}`,
        nodeId: edge.source.nodeId,
      });
    }

    if (!nodeIds.has(edge.target.nodeId)) {
      errors.push({
        code: 'INVALID_EDGE_REF',
        message: `Edge references non-existent target node: ${edge.target.nodeId}`,
        nodeId: edge.target.nodeId,
      });
    }

    // 0.3 No self-loops
    if (edge.source.nodeId === edge.target.nodeId) {
      errors.push({
        code: 'SELF_LOOP',
        message: `Self-loop detected on node: ${edge.source.nodeId}`,
        nodeId: edge.source.nodeId,
      });
    }

    // 0.4 No duplicate edges
    const edgeKey = `${edge.source.nodeId}:${edge.source.port}→${edge.target.nodeId}:${edge.target.port}`;
    if (edgeKeys.has(edgeKey)) {
      errors.push({
        code: 'DUPLICATE_EDGE',
        message: `Duplicate edge: ${edgeKey}`,
        edgeKey,
      });
    }
    edgeKeys.add(edgeKey);
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 1: DAG PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kahn's algorithm for topological sort and cycle detection.
 *
 * Uses BFS variant for stable ordering of nodes with equal in-degree.
 */
export function kahnTopologicalSort(
  nodes: Array<{ id: string }>,
  structures: GraphStructures
): { isDAG: boolean; topologicalOrder: string[]; cycleNodes: string[] } {
  // Create working copy of in-degree
  const inDegree = new Map(structures.inDegree);
  const adjacency = structures.adjacency;

  // Initialize queue with zero in-degree nodes
  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  // Process nodes
  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!; // BFS: shift for stable order
    order.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (order.length === nodes.length) {
    return { isDAG: true, topologicalOrder: order, cycleNodes: [] };
  }

  // Identify nodes in cycles (not processed)
  const processedSet = new Set(order);
  const cycleNodes = nodes
    .filter(n => !processedSet.has(n.id))
    .map(n => n.id);

  return { isDAG: false, topologicalOrder: order, cycleNodes };
}

/**
 * Count connected components using undirected traversal.
 */
export function countComponents(
  nodes: Array<{ id: string }>,
  structures: GraphStructures
): number {
  // Build undirected adjacency
  const undirected = new Map<string, Set<string>>();
  for (const node of nodes) {
    undirected.set(node.id, new Set());
  }

  // Add both directions
  structures.adjacency.forEach((targets, nodeId) => {
    for (const target of targets) {
      undirected.get(nodeId)?.add(target);
      undirected.get(target)?.add(nodeId);
    }
  });

  // BFS to find components
  const visited = new Set<string>();
  let components = 0;

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      components++;
      const queue = [node.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const neighbors = undirected.get(current) || new Set();
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        });
      }
    }
  }

  return components;
}

/**
 * Validate DAG properties.
 *
 * Checks:
 * - 1.1 Cycle detection via Kahn's algorithm
 * - 1.2 Connected components count
 */
export function validateDAGProperties(
  nodes: Array<{ id: string }>,
  structures: GraphStructures
): DAGResult {
  const kahnResult = kahnTopologicalSort(nodes, structures);
  const connectedComponents = countComponents(nodes, structures);

  return {
    passed: kahnResult.isDAG,
    isDAG: kahnResult.isDAG,
    topologicalOrder: kahnResult.topologicalOrder,
    cycleNodes: kahnResult.cycleNodes,
    connectedComponents,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 2: FLOW INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate flow integrity.
 *
 * Checks:
 * - 2.1 Entry points exist (in-degree = 0)
 * - 2.2 Exit points exist (out-degree = 0)
 * - 2.3 Reachability from entry (forward BFS)
 * - 2.4 Reachability to exit (backward BFS)
 * - 2.5 Orphan detection
 */
export function validateFlowIntegrity(
  nodes: Array<{ id: string }>,
  structures: GraphStructures
): FlowResult {
  const { inDegree, outDegree, adjacency, reverseAdjacency } = structures;

  // 2.1 Entry points (in-degree = 0)
  const entryNodes = nodes
    .filter(n => inDegree.get(n.id) === 0)
    .map(n => n.id);

  // 2.2 Exit points (out-degree = 0)
  const exitNodes = nodes
    .filter(n => outDegree.get(n.id) === 0)
    .map(n => n.id);

  // 2.3 Forward reachability from entry
  const forwardReachable = bfs(entryNodes, adjacency);
  const unreachableFromEntry = nodes
    .filter(n => !forwardReachable.has(n.id))
    .map(n => n.id);

  // 2.4 Backward reachability to exit
  const backwardReachable = bfs(exitNodes, reverseAdjacency);
  const unreachableToExit = nodes
    .filter(n => !backwardReachable.has(n.id))
    .map(n => n.id);

  // 2.5 Orphan detection (no edges at all, except single-node graphs)
  const orphanNodes = nodes.length > 1
    ? nodes
        .filter(n => inDegree.get(n.id) === 0 && outDegree.get(n.id) === 0)
        .map(n => n.id)
    : [];

  // Flow is valid if no unreachable nodes and no orphans
  const passed =
    unreachableFromEntry.length === 0 &&
    unreachableToExit.length === 0 &&
    orphanNodes.length === 0;

  return {
    passed,
    entryNodes,
    exitNodes,
    unreachableFromEntry,
    unreachableToExit,
    orphanNodes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 3: TOOL VALIDITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that all nodes reference valid tools.
 */
export function validateToolValidity(
  nodes: Array<{ id: string; toolId: string; config?: Record<string, unknown> }>
): ToolValidityResult {
  const errors: ToolValidityResult['errors'] = [];

  for (const node of nodes) {
    // Check tool exists
    if (!toolExists(node.toolId)) {
      errors.push({
        code: 'UNKNOWN_TOOL',
        nodeId: node.id,
        toolId: node.toolId,
        message: `Unknown tool: ${node.toolId}`,
      });
      continue;
    }

    // Tool-specific config validation can be added here
    // For now, we just check tool existence
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL 5: EXECUTION READINESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate execution readiness.
 *
 * Checks:
 * - All required parameters are provided
 * - Estimates total execution duration (critical path)
 */
export function validateExecutionReadiness(
  nodes: Array<{ id: string; toolId: string }>,
  requiredParams: Record<string, ParamSpec>,
  providedParams: Record<string, unknown> = {},
  topologicalOrder: string[]
): ExecutionReadinessResult {
  const warnings: string[] = [];

  // Check for missing required parameters
  const missingParams: string[] = [];
  for (const [paramName, paramSpec] of Object.entries(requiredParams)) {
    if (paramSpec.required && !(paramName in providedParams)) {
      missingParams.push(paramName);
    }
  }

  // Estimate duration using critical path
  // For simplicity, sum all node durations in topological order
  // A more accurate calculation would use DAG critical path algorithm
  let estimatedDurationMs = 0;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const nodeId of topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (node) {
      const toolSpec = getToolSpec(node.toolId);
      if (toolSpec) {
        estimatedDurationMs += toolSpec.estimatedDurationMs;
      }
    }
  }

  // Add warnings for slow tools
  for (const nodeId of topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (node) {
      const toolSpec = getToolSpec(node.toolId);
      if (toolSpec && toolSpec.estimatedDurationMs > 3000) {
        warnings.push(`Node '${nodeId}' uses slow tool '${node.toolId}' (~${toolSpec.estimatedDurationMs}ms)`);
      }
    }
  }

  return {
    passed: missingParams.length === 0,
    missingParams,
    warnings,
    estimatedDurationMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate an execution plan or DAG.
 *
 * Runs validation levels sequentially, stopping at first failure.
 * This ensures we don't waste time checking types if the graph has cycles.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @param requiredParams - Required user parameters (optional)
 * @param providedParams - User-provided parameter values (optional)
 * @returns Complete validation result
 */
export function validateGraph(
  nodes: Array<{ id: string; toolId: string; config?: Record<string, unknown> }>,
  edges: Array<{ source: { nodeId: string; port: string }; target: { nodeId: string; port: string } }>,
  requiredParams: Record<string, ParamSpec> = {},
  providedParams: Record<string, unknown> = {}
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: string[] = [];

  // Level 0: Structural Integrity
  const structural = validateStructural(nodes, edges);
  if (!structural.passed) {
    for (const err of structural.errors) {
      errors.push({
        level: 0,
        code: err.code,
        message: err.message,
        nodeId: err.nodeId,
      });
    }
    return {
      passed: false,
      completedLevel: 0,
      structural,
      errors,
      warnings,
    };
  }

  // Build graph structures once
  const structures = buildGraphStructures(nodes, edges);

  // Level 1: DAG Properties
  const dag = validateDAGProperties(nodes, structures);
  if (!dag.passed) {
    errors.push({
      level: 1,
      code: 'CYCLE_DETECTED',
      message: `Graph contains cycles involving nodes: ${dag.cycleNodes.join(', ')}`,
    });
    return {
      passed: false,
      completedLevel: 1,
      structural,
      dag,
      errors,
      warnings,
    };
  }

  // Add warning for multiple components
  if (dag.connectedComponents > 1) {
    warnings.push(`Graph has ${dag.connectedComponents} disconnected components`);
  }

  // Level 2: Flow Integrity
  const flow = validateFlowIntegrity(nodes, structures);
  if (!flow.passed) {
    if (flow.unreachableFromEntry.length > 0) {
      for (const nodeId of flow.unreachableFromEntry) {
        errors.push({
          level: 2,
          code: 'UNREACHABLE_FROM_ENTRY',
          message: `Node '${nodeId}' is not reachable from any entry point`,
          nodeId,
        });
      }
    }
    if (flow.unreachableToExit.length > 0) {
      for (const nodeId of flow.unreachableToExit) {
        errors.push({
          level: 2,
          code: 'UNREACHABLE_TO_EXIT',
          message: `Node '${nodeId}' has no path to any exit point`,
          nodeId,
        });
      }
    }
    if (flow.orphanNodes.length > 0) {
      for (const nodeId of flow.orphanNodes) {
        errors.push({
          level: 2,
          code: 'ORPHAN_NODE',
          message: `Orphan node '${nodeId}': no incoming or outgoing edges`,
          nodeId,
        });
      }
    }
    return {
      passed: false,
      completedLevel: 2,
      structural,
      dag,
      flow,
      errors,
      warnings,
    };
  }

  // Level 3: Tool Validity
  const toolValidity = validateToolValidity(nodes);
  if (!toolValidity.passed) {
    for (const err of toolValidity.errors) {
      errors.push({
        level: 3,
        code: err.code,
        message: err.message,
        nodeId: err.nodeId,
      });
    }
    return {
      passed: false,
      completedLevel: 3,
      structural,
      dag,
      flow,
      toolValidity,
      errors,
      warnings,
    };
  }

  // Level 4: Type Safety (delegate to typeCheckPlan via bridge)
  const rawNodes: RawGraphNode[] = nodes.map(n => ({
    id: n.id,
    toolId: n.toolId,
    config: n.config,
  }));
  const rawEdges: RawGraphEdge[] = edges.map(e => ({
    source: { nodeId: e.source.nodeId, port: e.source.port },
    target: { nodeId: e.target.nodeId, port: e.target.port },
  }));

  const executionPlan = buildTypeCheckablePlan(rawNodes, rawEdges);
  const typeCheck = typeCheckPlan(executionPlan);

  if (!typeCheck.passed) {
    for (const err of typeCheck.errors) {
      errors.push({
        level: 4,
        code: err.type,
        message: err.message,
        nodeId: err.nodeId || err.edge?.targetNodeId,
      });
    }
    return {
      passed: false,
      completedLevel: 4,
      structural,
      dag,
      flow,
      toolValidity,
      typeCheck,
      errors,
      warnings,
    };
  }

  // Add type check warnings
  for (const warn of typeCheck.warnings) {
    warnings.push(warn.message);
  }

  // Level 5: Execution Readiness
  const executionReadiness = validateExecutionReadiness(
    nodes,
    requiredParams,
    providedParams,
    dag.topologicalOrder
  );
  warnings.push(...executionReadiness.warnings);

  if (!executionReadiness.passed) {
    for (const param of executionReadiness.missingParams) {
      errors.push({
        level: 5,
        code: 'MISSING_PARAM',
        message: `Required parameter '${param}' is not provided`,
      });
    }
    return {
      passed: false,
      completedLevel: 5,
      structural,
      dag,
      flow,
      toolValidity,
      typeCheck,
      executionReadiness,
      errors,
      warnings,
    };
  }

  // All levels passed
  return {
    passed: true,
    completedLevel: 5,
    structural,
    dag,
    flow,
    toolValidity,
    typeCheck,
    executionReadiness,
    errors: [],
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick check if graph is a valid DAG (no cycles).
 */
export function isValidDAG(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>
): boolean {
  const structures = buildGraphStructures(nodes, edges);
  const result = kahnTopologicalSort(nodes, structures);
  return result.isDAG;
}

/**
 * Get topological order for execution.
 */
export function getTopologicalOrder(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>
): string[] | null {
  const structures = buildGraphStructures(nodes, edges);
  const result = kahnTopologicalSort(nodes, structures);
  return result.isDAG ? result.topologicalOrder : null;
}

/**
 * Get nodes involved in cycles (if any).
 */
export function getCycleNodes(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>
): string[] {
  const structures = buildGraphStructures(nodes, edges);
  const result = kahnTopologicalSort(nodes, structures);
  return result.cycleNodes;
}

/**
 * Compute critical path duration.
 *
 * For a DAG, the critical path is the longest path from any entry to any exit.
 * This determines the minimum execution time (with infinite parallelism).
 */
export function computeCriticalPath(
  nodes: Array<{ id: string; toolId: string }>,
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>,
  topologicalOrder: string[]
): number {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const structures = buildGraphStructures(nodes, edges);

  // Distance to each node (longest path from any entry)
  const distance = new Map<string, number>();

  // Initialize all to 0
  for (const node of nodes) {
    distance.set(node.id, 0);
  }

  // Process in topological order
  for (const nodeId of topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const toolSpec = getToolSpec(node.toolId);
    const nodeDuration = toolSpec?.estimatedDurationMs ?? 0;

    // Update distance: max(incoming distances) + this node's duration
    const incoming = structures.reverseAdjacency.get(nodeId) || [];
    let maxIncoming = 0;
    for (const srcId of incoming) {
      maxIncoming = Math.max(maxIncoming, distance.get(srcId) ?? 0);
    }

    distance.set(nodeId, maxIncoming + nodeDuration);
  }

  // Critical path is the max distance to any exit node
  let criticalPath = 0;
  for (const nodeId of topologicalOrder) {
    const node = nodeMap.get(nodeId);
    if (node && structures.outDegree.get(nodeId) === 0) {
      criticalPath = Math.max(criticalPath, distance.get(nodeId) ?? 0);
    }
  }

  return criticalPath;
}
