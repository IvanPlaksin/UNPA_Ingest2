/**
 * GXE Execution Engine - Control Flow
 *
 * Phase 0: Foundation (Day 7)
 *
 * Control flow node execution handlers for conditional branching,
 * parallel execution, and other flow control patterns.
 */

import { ExecutionContext } from './execution-context';
import { ServiceContainer } from './service-container';
import { ValidatedGraph, ExecuteNodeFunction } from './topological-walker';
import { ExecutionEdge } from '../compiler/ir-types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Control flow node types.
 */
export type ControlFlowType =
  | 'control.condition'
  | 'control.switch'
  | 'control.parallel'
  | 'control.loop'
  | 'control.try_catch';

/**
 * Condition operators for comparison.
 */
export type ConditionOperator =
  | 'eq'    // equals
  | 'neq'   // not equals
  | 'gt'    // greater than
  | 'gte'   // greater than or equal
  | 'lt'    // less than
  | 'lte'   // less than or equal
  | 'contains'
  | 'not_contains'
  | 'matches'     // regex match
  | 'truthy'
  | 'falsy';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a tool ID is a control flow node.
 */
export function isControlFlowNode(toolId: string): boolean {
  return toolId.startsWith('control.');
}

/**
 * Execute a control flow node.
 *
 * @param nodeId - Current node ID
 * @param toolId - Control flow type (e.g., 'control.condition')
 * @param inputs - Input values for the control node
 * @param context - Execution context
 * @param graph - Validated graph
 * @param serviceContainer - Service container (unused for control flow)
 * @param executeNodeFn - Callback to execute child nodes
 * @returns Control flow result
 */
export async function executeControlFlow(
  nodeId: string,
  toolId: string,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  graph: ValidatedGraph,
  serviceContainer: ServiceContainer,
  executeNodeFn: ExecuteNodeFunction
): Promise<Record<string, unknown>> {
  switch (toolId) {
    case 'control.condition':
      return executeCondition(nodeId, inputs, context, graph);

    case 'control.parallel':
      return executeParallel(nodeId, inputs, context, graph, executeNodeFn);

    case 'control.switch':
      return executeSwitch(nodeId, inputs, context, graph);

    case 'control.loop':
      return executeLoop(nodeId, inputs, context, graph, executeNodeFn);

    case 'control.try_catch':
      return executeTryCatch(nodeId, inputs, context, graph, executeNodeFn);

    default:
      throw new Error(`Unknown control flow type: ${toolId}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a condition node.
 * Evaluates the condition and skips the inactive branch.
 */
async function executeCondition(
  nodeId: string,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  graph: ValidatedGraph
): Promise<Record<string, unknown>> {
  const value = inputs.value;
  const operator = (inputs.operator as ConditionOperator) || 'truthy';
  const comparand = inputs.comparand;

  // Evaluate condition
  const result = evaluateCondition(value, operator, comparand);

  // Find outgoing edges from this condition node
  const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);

  // Separate edges by label (true/false branch)
  // Edges should have a 'label' property indicating the branch
  const trueEdges = outEdges.filter(e => getBranchLabel(e) === 'true');
  const falseEdges = outEdges.filter(e => getBranchLabel(e) === 'false');

  // Determine which branch to skip
  const inactiveEdges = result ? falseEdges : trueEdges;

  // Skip all nodes reachable ONLY through inactive edges
  for (const edge of inactiveEdges) {
    skipBranch(edge.target.nodeId, nodeId, result, context, graph);
  }

  return { result };
}

/**
 * Evaluate a condition expression.
 */
function evaluateCondition(
  value: unknown,
  operator: ConditionOperator,
  comparand?: unknown
): boolean {
  switch (operator) {
    case 'truthy':
      return Boolean(value);

    case 'falsy':
      return !Boolean(value);

    case 'eq':
      return value === comparand;

    case 'neq':
      return value !== comparand;

    case 'gt':
      return Number(value) > Number(comparand);

    case 'gte':
      return Number(value) >= Number(comparand);

    case 'lt':
      return Number(value) < Number(comparand);

    case 'lte':
      return Number(value) <= Number(comparand);

    case 'contains':
      if (typeof value === 'string' && typeof comparand === 'string') {
        return value.includes(comparand);
      }
      if (Array.isArray(value)) {
        return value.includes(comparand);
      }
      return false;

    case 'not_contains':
      if (typeof value === 'string' && typeof comparand === 'string') {
        return !value.includes(comparand);
      }
      if (Array.isArray(value)) {
        return !value.includes(comparand);
      }
      return true;

    case 'matches':
      if (typeof value === 'string' && typeof comparand === 'string') {
        try {
          return new RegExp(comparand).test(value);
        } catch {
          return false;
        }
      }
      return false;

    default:
      return Boolean(value);
  }
}

/**
 * Get branch label from edge.
 * Supports multiple ways of specifying branch:
 * - edge.label
 * - edge.source.port (e.g., 'true_branch', 'false_branch')
 */
function getBranchLabel(edge: ExecutionEdge): string {
  // Check for explicit label
  const anyEdge = edge as unknown as Record<string, unknown>;
  if (anyEdge.label) {
    return String(anyEdge.label);
  }

  // Check source port name for branch indicator
  const port = edge.source.port.toLowerCase();
  if (port.includes('true') || port === 'yes' || port === 'then') {
    return 'true';
  }
  if (port.includes('false') || port === 'no' || port === 'else') {
    return 'false';
  }

  // Default to true branch
  return 'true';
}

/**
 * Skip a branch of nodes starting from startNodeId.
 * Stops at join points (nodes with other active inputs).
 */
function skipBranch(
  startNodeId: string,
  conditionNodeId: string,
  conditionResult: boolean,
  context: ExecutionContext,
  graph: ValidatedGraph
): void {
  const queue: string[] = [startNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);

    // Check if this node has other active inputs (join point)
    const incomingEdges = graph.edges.filter(e => e.target.nodeId === nodeId);
    const hasActiveSource = incomingEdges.some(e => {
      // Skip the edge from condition node
      if (e.source.nodeId === conditionNodeId) {
        return false;
      }
      // Check if source is not skipped and not in current skip path
      return !context.isSkipped(e.source.nodeId) && !visited.has(e.source.nodeId);
    });

    if (hasActiveSource && nodeId !== startNodeId) {
      // Join point - don't skip, it has other inputs
      continue;
    }

    // Mark node as skipped
    context.markSkipped(
      nodeId,
      `Condition '${conditionNodeId}' evaluated to ${conditionResult}`
    );

    // Continue to downstream nodes
    const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);
    for (const edge of outEdges) {
      queue.push(edge.target.nodeId);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PARALLEL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a parallel node.
 * Runs all branches concurrently using Promise.all.
 */
async function executeParallel(
  nodeId: string,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  graph: ValidatedGraph,
  executeNodeFn: ExecuteNodeFunction
): Promise<Record<string, unknown>> {
  // Find outgoing edges from this parallel node
  const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);
  const branchStarts = outEdges.map(e => e.target.nodeId);

  // Deduplicate branch starts (in case multiple edges to same node)
  const uniqueBranchStarts = [...new Set(branchStarts)];

  if (uniqueBranchStarts.length === 0) {
    return { branch_count: 0 };
  }

  // Execute branches in parallel
  const branchPromises = uniqueBranchStarts.map(async (startId) => {
    // Collect all nodes in this branch
    const branchNodes = collectBranchNodes(startId, nodeId, graph);

    // Execute nodes in branch order
    for (const branchNodeId of branchNodes) {
      try {
        await executeNodeFn(branchNodeId);
      } catch (error) {
        // Error in branch - continue with other branches
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error in parallel branch starting at ${startId}:`, message);
      }
    }
  });

  await Promise.all(branchPromises);

  return { branch_count: uniqueBranchStarts.length };
}

/**
 * Collect all nodes in a branch until reaching a join point.
 * Returns nodes in topological order.
 */
function collectBranchNodes(
  startNodeId: string,
  parallelNodeId: string,
  graph: ValidatedGraph
): string[] {
  const branchNodes: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [startNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (visited.has(nodeId)) {
      continue;
    }

    // Check if this is a join point (multiple inputs from different branches)
    const incomingEdges = graph.edges.filter(e => e.target.nodeId === nodeId);
    const uniqueSources = new Set(incomingEdges.map(e => e.source.nodeId));

    // If more than one source (excluding parallel node), it's a join point
    const nonParallelSources = Array.from(uniqueSources).filter(s => s !== parallelNodeId);
    if (nonParallelSources.length > 1 && nodeId !== startNodeId) {
      // Join point - don't include in this branch
      continue;
    }

    visited.add(nodeId);
    branchNodes.push(nodeId);

    // Continue to downstream
    const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);
    for (const edge of outEdges) {
      queue.push(edge.target.nodeId);
    }
  }

  // Sort by topological order from graph
  const orderMap = new Map(graph.topologicalOrder.map((id, idx) => [id, idx]));
  branchNodes.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));

  return branchNodes;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find join node for parallel branches.
 * A join node is a node that receives inputs from multiple parallel branches.
 */
export function findJoinNode(
  parallelNodeId: string,
  graph: ValidatedGraph
): string | null {
  // Find all branch starts
  const outEdges = graph.edges.filter(e => e.source.nodeId === parallelNodeId);
  const branchStarts = new Set(outEdges.map(e => e.target.nodeId));

  // Traverse each branch to find common descendant
  const branchDescendants: Set<string>[] = [];

  for (const startId of branchStarts) {
    const descendants = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (descendants.has(nodeId)) continue;
      descendants.add(nodeId);

      const nextEdges = graph.edges.filter(e => e.source.nodeId === nodeId);
      for (const edge of nextEdges) {
        queue.push(edge.target.nodeId);
      }
    }

    branchDescendants.push(descendants);
  }

  // Find intersection - nodes reachable from all branches
  if (branchDescendants.length === 0) {
    return null;
  }

  let commonNodes = branchDescendants[0];
  for (let i = 1; i < branchDescendants.length; i++) {
    const intersection = new Set<string>();
    for (const node of commonNodes) {
      if (branchDescendants[i].has(node)) {
        intersection.add(node);
      }
    }
    commonNodes = intersection;
  }

  if (commonNodes.size === 0) {
    return null;
  }

  // Return the first common node in topological order
  for (const nodeId of graph.topologicalOrder) {
    if (commonNodes.has(nodeId)) {
      return nodeId;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SWITCH EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a switch node.
 * Routes execution to one of multiple branches based on value matching.
 *
 * Expected inputs:
 * - value: The value to switch on
 * - cases: Object mapping case values to branch names, or derived from edge labels
 *
 * Edge labeling convention:
 * - Edge labels should match case values (e.g., "case:error", "case:success", "default")
 */
async function executeSwitch(
  nodeId: string,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  graph: ValidatedGraph
): Promise<Record<string, unknown>> {
  const value = inputs.value;
  const valueStr = String(value ?? '');

  // Find outgoing edges from this switch node
  const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);

  // Match value to edge labels
  let matchedEdge: ExecutionEdge | null = null;
  let defaultEdge: ExecutionEdge | null = null;

  for (const edge of outEdges) {
    const label = getSwitchCaseLabel(edge);

    if (label === 'default') {
      defaultEdge = edge;
    } else if (label === valueStr || label === `case:${valueStr}`) {
      matchedEdge = edge;
    }
  }

  // Use matched edge or fall back to default
  const activeEdge = matchedEdge || defaultEdge;

  if (!activeEdge) {
    // No matching case and no default - skip all branches
    for (const edge of outEdges) {
      skipBranch(edge.target.nodeId, nodeId, false, context, graph);
    }
    return { matched_case: null, value: valueStr };
  }

  // Skip all non-active branches
  for (const edge of outEdges) {
    if (edge !== activeEdge) {
      skipBranch(edge.target.nodeId, nodeId, false, context, graph);
    }
  }

  const matchedCase = matchedEdge ? valueStr : 'default';
  return { matched_case: matchedCase, value: valueStr };
}

/**
 * Get switch case label from edge.
 */
function getSwitchCaseLabel(edge: ExecutionEdge): string {
  const anyEdge = edge as unknown as Record<string, unknown>;

  // Check for explicit label
  if (anyEdge.label) {
    return String(anyEdge.label);
  }

  // Check source port name
  const port = edge.source.port.toLowerCase();
  if (port === 'default' || port.includes('default')) {
    return 'default';
  }

  // Remove 'case:' prefix if present
  if (port.startsWith('case_') || port.startsWith('case:')) {
    return port.replace(/^case[_:]/, '');
  }

  return port;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOOP EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a loop node.
 * Repeatedly executes a subgraph until a condition is met.
 *
 * Expected inputs:
 * - items: Array to iterate over (for for-each style)
 * - condition: Boolean or expression to evaluate (for while style)
 * - max_iterations: Safety limit (default: 100)
 *
 * Loop body is determined by:
 * - Edge labeled "body" or port "body" leads to loop body start
 * - Edge labeled "done" or port "done" leads to post-loop continuation
 */
async function executeLoop(
  nodeId: string,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  graph: ValidatedGraph,
  executeNodeFn: ExecuteNodeFunction
): Promise<Record<string, unknown>> {
  const items = inputs.items as unknown[] | undefined;
  const maxIterations = (inputs.max_iterations as number) || 100;

  // Find body and done edges
  const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);
  let bodyEdge: ExecutionEdge | null = null;
  let doneEdge: ExecutionEdge | null = null;

  for (const edge of outEdges) {
    const label = getLoopLabel(edge);
    if (label === 'body' || label === 'loop') {
      bodyEdge = edge;
    } else if (label === 'done' || label === 'exit' || label === 'after') {
      doneEdge = edge;
    }
  }

  if (!bodyEdge) {
    // No body - just pass through
    return { iterations: 0, items_processed: 0 };
  }

  // Collect nodes in loop body
  const bodyNodes = collectBranchNodes(bodyEdge.target.nodeId, nodeId, graph);

  let iterations = 0;
  const results: unknown[] = [];

  // For-each style: iterate over items
  if (items && Array.isArray(items)) {
    for (const item of items) {
      if (iterations >= maxIterations) {
        console.warn(`[Loop ${nodeId}] Max iterations (${maxIterations}) reached`);
        break;
      }

      // Set current item as loop variable
      context.setOutput(nodeId, 'current_item', item);
      context.setOutput(nodeId, 'current_index', iterations);

      // Reset body nodes for re-execution
      context.resetNodes(bodyNodes);

      // Execute body nodes
      for (const bodyNodeId of bodyNodes) {
        try {
          await executeNodeFn(bodyNodeId);
        } catch (error) {
          console.error(`[Loop ${nodeId}] Error in body node ${bodyNodeId}:`, error);
          // Continue to next iteration on error
          break;
        }
      }

      // Collect result from last body node
      const lastBodyNode = bodyNodes[bodyNodes.length - 1];
      if (lastBodyNode) {
        const bodyResult = context.getOutput(lastBodyNode, 'result') || context.getOutput(lastBodyNode, 'output');
        results.push(bodyResult);
      }

      iterations++;
    }
  } else {
    // While style: check condition each iteration
    while (iterations < maxIterations) {
      // Check condition
      const condition = context.getOutput(nodeId, 'condition') ?? inputs.condition;
      if (!evaluateCondition(condition, 'truthy')) {
        break;
      }

      context.setOutput(nodeId, 'current_index', iterations);

      // Reset and execute body
      context.resetNodes(bodyNodes);

      for (const bodyNodeId of bodyNodes) {
        try {
          await executeNodeFn(bodyNodeId);
        } catch (error) {
          console.error(`[Loop ${nodeId}] Error in body node ${bodyNodeId}:`, error);
          break;
        }
      }

      iterations++;
    }
  }

  // Skip done branch if no done edge
  if (doneEdge) {
    // Done branch will be executed normally by topological walker
  }

  return {
    iterations,
    items_processed: items?.length || 0,
    results,
  };
}

/**
 * Get loop label from edge.
 */
function getLoopLabel(edge: ExecutionEdge): string {
  const anyEdge = edge as unknown as Record<string, unknown>;

  if (anyEdge.label) {
    return String(anyEdge.label).toLowerCase();
  }

  return edge.source.port.toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// TRY-CATCH EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a try-catch node.
 * Executes try branch and catches errors, routing to catch branch on failure.
 *
 * Expected edge labels:
 * - "try" or "body": The main execution path
 * - "catch" or "error": Error handling path
 * - "finally": Always executed after try or catch (optional)
 */
async function executeTryCatch(
  nodeId: string,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
  graph: ValidatedGraph,
  executeNodeFn: ExecuteNodeFunction
): Promise<Record<string, unknown>> {
  // Find try, catch, and finally edges
  const outEdges = graph.edges.filter(e => e.source.nodeId === nodeId);
  let tryEdge: ExecutionEdge | null = null;
  let catchEdge: ExecutionEdge | null = null;
  let finallyEdge: ExecutionEdge | null = null;

  for (const edge of outEdges) {
    const label = getTryCatchLabel(edge);
    if (label === 'try' || label === 'body') {
      tryEdge = edge;
    } else if (label === 'catch' || label === 'error') {
      catchEdge = edge;
    } else if (label === 'finally') {
      finallyEdge = edge;
    }
  }

  if (!tryEdge) {
    return { success: false, error: 'No try branch defined' };
  }

  // Collect nodes in try branch
  const tryNodes = collectBranchNodes(tryEdge.target.nodeId, nodeId, graph);
  const catchNodes = catchEdge ? collectBranchNodes(catchEdge.target.nodeId, nodeId, graph) : [];
  const finallyNodes = finallyEdge ? collectBranchNodes(finallyEdge.target.nodeId, nodeId, graph) : [];

  let success = true;
  let caughtError: string | null = null;

  // Execute try branch
  try {
    for (const tryNodeId of tryNodes) {
      await executeNodeFn(tryNodeId);

      // Check if node failed
      const status = context.getStatus(tryNodeId);
      if (status.state === 'failed') {
        throw new Error(status.error || `Node ${tryNodeId} failed`);
      }
    }

    // Try succeeded - skip catch branch
    if (catchEdge) {
      for (const catchNodeId of catchNodes) {
        context.markSkipped(catchNodeId, 'Try block succeeded');
      }
    }
  } catch (error) {
    success = false;
    caughtError = error instanceof Error ? error.message : String(error);

    // Store error for catch branch
    context.setOutput(nodeId, 'error', caughtError);
    context.setOutput(nodeId, 'error_type', error instanceof Error ? error.name : 'Error');

    // Execute catch branch if available
    if (catchEdge && catchNodes.length > 0) {
      try {
        for (const catchNodeId of catchNodes) {
          await executeNodeFn(catchNodeId);
        }
      } catch (catchError) {
        console.error(`[TryCatch ${nodeId}] Error in catch branch:`, catchError);
      }
    }

    // Skip remaining try nodes
    for (const tryNodeId of tryNodes) {
      if (!context.isCompleted(tryNodeId) && !context.isSkipped(tryNodeId)) {
        context.markSkipped(tryNodeId, `Error caught: ${caughtError}`);
      }
    }
  }

  // Execute finally branch (always)
  if (finallyEdge && finallyNodes.length > 0) {
    try {
      for (const finallyNodeId of finallyNodes) {
        await executeNodeFn(finallyNodeId);
      }
    } catch (finallyError) {
      console.error(`[TryCatch ${nodeId}] Error in finally branch:`, finallyError);
    }
  }

  return {
    success,
    error: caughtError,
    try_nodes_executed: tryNodes.filter(id => context.isCompleted(id)).length,
    catch_executed: !success && catchNodes.length > 0,
  };
}

/**
 * Get try-catch label from edge.
 */
function getTryCatchLabel(edge: ExecutionEdge): string {
  const anyEdge = edge as unknown as Record<string, unknown>;

  if (anyEdge.label) {
    return String(anyEdge.label).toLowerCase();
  }

  return edge.source.port.toLowerCase();
}
