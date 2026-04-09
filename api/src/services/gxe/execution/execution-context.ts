/**
 * GXE Execution Engine - Execution Context
 *
 * Phase 0: Foundation (Day 6)
 *
 * Central object for managing the lifecycle of a single graph execution.
 * Created when Execute is pressed, lives until completion (or error),
 * contains all intermediate data and status tracking.
 */

import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Node execution status.
 */
export type NodeExecutionState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Detailed node status.
 */
export interface NodeStatus {
  state: NodeExecutionState;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  outputPreview?: string;
  skipReason?: string;
}

/**
 * Execution error.
 */
export interface ExecutionError {
  nodeId: string;
  message: string;
  code?: string;
  timestamp: Date;
  details?: unknown;
}

/**
 * SSE event types.
 */
export type SSEEvent =
  | { type: 'execution_start'; executionId: string; nodeCount: number; estimatedMs: number }
  | { type: 'node_status'; nodeId: string; status: NodeExecutionState; durationMs?: number; error?: string; outputPreview?: string }
  | { type: 'execution_complete'; totalDurationMs: number; successCount: number; failedCount: number; skippedCount: number }
  | { type: 'execution_failed'; error: string; failedNodeId?: string };

/**
 * SSE emitter interface.
 */
export interface SSEEmitter {
  emit(event: SSEEvent): void;
  close(): void;
}

/**
 * Execution result summary.
 */
export interface ExecutionResult {
  executionId: string;
  graphId: string;
  passed: boolean;
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs: number;
  nodeResults: Map<string, NodeStatus>;
  outputs: Map<string, unknown>;
  errors: ExecutionError[];
  stats: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execution context manages the state of a single graph execution.
 */
export class ExecutionContext {
  readonly executionId: string;
  readonly graphId: string;
  readonly startedAt: Date;
  completedAt?: Date;

  // Topological execution order from validator
  readonly topologicalOrder: string[];

  // Forward adjacency for downstream marking
  private adjacency: Map<string, string[]>;

  // ═══ CORE STATE ═══

  // User-provided parameters
  private params: Record<string, unknown>;

  // Output storage: "nodeId:portName" → value
  private nodeOutputs: Map<string, unknown>;

  // Node execution status
  private nodeStatuses: Map<string, NodeStatus>;

  // Nodes marked for skipping
  private skippedNodes: Set<string>;

  // Error accumulator
  readonly errors: ExecutionError[];

  // SSE emitter reference
  private emitter: SSEEmitter | null;

  constructor(
    graphId: string,
    topologicalOrder: string[],
    adjacency: Map<string, string[]>,
    params: Record<string, unknown> = {},
    emitter: SSEEmitter | null = null
  ) {
    this.executionId = uuidv4();
    this.graphId = graphId;
    this.startedAt = new Date();
    this.topologicalOrder = topologicalOrder;
    this.adjacency = adjacency;
    this.params = params;
    this.emitter = emitter;

    this.nodeOutputs = new Map();
    this.nodeStatuses = new Map();
    this.skippedNodes = new Set();
    this.errors = [];

    // Initialize all nodes as pending
    for (const nodeId of topologicalOrder) {
      this.nodeStatuses.set(nodeId, { state: 'pending' });
    }

    // Store params as pseudo-outputs
    for (const [key, value] of Object.entries(params)) {
      this.nodeOutputs.set(`__params:${key}`, value);
    }
  }

  // ═══ OUTPUT MANAGEMENT ═══

  /**
   * Store output value for a node port.
   */
  setOutput(nodeId: string, portName: string, value: unknown): void {
    const key = `${nodeId}:${portName}`;
    this.nodeOutputs.set(key, value);
  }

  /**
   * Get output value from a node port.
   */
  getOutput(nodeId: string, portName: string): unknown | undefined {
    const key = `${nodeId}:${portName}`;
    return this.nodeOutputs.get(key);
  }

  /**
   * Check if output exists for a node port.
   */
  hasOutput(nodeId: string, portName: string): boolean {
    const key = `${nodeId}:${portName}`;
    return this.nodeOutputs.has(key);
  }

  /**
   * Get all outputs for a node.
   */
  getNodeOutputs(nodeId: string): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    const prefix = `${nodeId}:`;

    this.nodeOutputs.forEach((value, key) => {
      if (key.startsWith(prefix)) {
        const portName = key.slice(prefix.length);
        outputs[portName] = value;
      }
    });

    return outputs;
  }

  // ═══ PARAM MANAGEMENT ═══

  /**
   * Get user parameter value.
   */
  getParam(key: string): unknown | undefined {
    return this.params[key];
  }

  /**
   * Check if parameter exists.
   */
  hasParam(key: string): boolean {
    return key in this.params;
  }

  /**
   * Get all parameters.
   */
  getAllParams(): Record<string, unknown> {
    return { ...this.params };
  }

  // ═══ STATUS MANAGEMENT ═══

  /**
   * Set node execution status.
   * Automatically emits SSE event.
   */
  setStatus(nodeId: string, status: Partial<NodeStatus>): void {
    const current = this.nodeStatuses.get(nodeId) || { state: 'pending' };
    const updated: NodeStatus = { ...current, ...status };
    this.nodeStatuses.set(nodeId, updated);

    // Auto-emit SSE event
    if (this.emitter && status.state) {
      this.emitter.emit({
        type: 'node_status',
        nodeId,
        status: status.state,
        durationMs: updated.durationMs,
        error: updated.error,
        outputPreview: updated.outputPreview,
      });
    }
  }

  /**
   * Get node status.
   */
  getStatus(nodeId: string): NodeStatus {
    return this.nodeStatuses.get(nodeId) || { state: 'pending' };
  }

  /**
   * Mark node as running.
   */
  markRunning(nodeId: string): void {
    this.setStatus(nodeId, {
      state: 'running',
      startedAt: new Date(),
    });
  }

  /**
   * Mark node as completed.
   */
  markCompleted(nodeId: string, outputPreview?: string): void {
    const status = this.getStatus(nodeId);
    const startedAt = status.startedAt || new Date();
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    this.setStatus(nodeId, {
      state: 'completed',
      completedAt,
      durationMs,
      outputPreview,
    });
  }

  /**
   * Mark node as failed.
   */
  markFailed(nodeId: string, error: string): void {
    const status = this.getStatus(nodeId);
    const startedAt = status.startedAt || new Date();
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    this.setStatus(nodeId, {
      state: 'failed',
      completedAt,
      durationMs,
      error,
    });

    this.errors.push({
      nodeId,
      message: error,
      timestamp: completedAt,
    });
  }

  // ═══ SKIP MANAGEMENT ═══

  /**
   * Mark node as skipped.
   */
  markSkipped(nodeId: string, reason: string): void {
    this.skippedNodes.add(nodeId);
    this.setStatus(nodeId, {
      state: 'skipped',
      skipReason: reason,
    });
  }

  /**
   * Check if node is skipped.
   */
  isSkipped(nodeId: string): boolean {
    return this.skippedNodes.has(nodeId);
  }

  /**
   * Check if node is completed.
   */
  isCompleted(nodeId: string): boolean {
    const status = this.getStatus(nodeId);
    return status.state === 'completed';
  }

  /**
   * Reset node status to pending.
   * Used by loop control flow to re-execute nodes.
   */
  resetNodeStatus(nodeId: string): void {
    this.skippedNodes.delete(nodeId);
    this.nodeStatuses.set(nodeId, { state: 'pending' });

    // Clear outputs for this node
    const outputPrefix = `${nodeId}:`;
    const keysToDelete: string[] = [];
    this.nodeOutputs.forEach((_, key) => {
      if (key.startsWith(outputPrefix)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.nodeOutputs.delete(key));
  }

  /**
   * Reset multiple nodes to pending.
   * Used by loop control flow to reset a subgraph.
   */
  resetNodes(nodeIds: string[]): void {
    for (const nodeId of nodeIds) {
      this.resetNodeStatus(nodeId);
    }
  }

  /**
   * Mark all downstream nodes as skipped after a failure.
   *
   * Uses BFS through adjacency to find affected nodes.
   * Stops at nodes with other active inputs (join points).
   */
  markDownstreamSkipped(failedNodeId: string, reason: string): void {
    const queue = [failedNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const downstream = this.adjacency.get(currentId) || [];
      for (const nextId of downstream) {
        // Skip if already processed or skipped
        if (this.isSkipped(nextId)) continue;

        // Mark as skipped
        this.markSkipped(nextId, reason);
        queue.push(nextId);
      }
    }
  }

  // ═══ LIFECYCLE ═══

  /**
   * Mark execution as complete.
   */
  complete(): void {
    this.completedAt = new Date();

    const stats = this.getStats();

    if (this.emitter) {
      this.emitter.emit({
        type: 'execution_complete',
        totalDurationMs: this.getTotalDurationMs(),
        successCount: stats.completed,
        failedCount: stats.failed,
        skippedCount: stats.skipped,
      });
      this.emitter.close();
    }
  }

  /**
   * Mark execution as failed.
   */
  fail(error: string, failedNodeId?: string): void {
    this.completedAt = new Date();

    if (this.emitter) {
      this.emitter.emit({
        type: 'execution_failed',
        error,
        failedNodeId,
      });
      this.emitter.close();
    }
  }

  /**
   * Emit execution start event.
   */
  emitStart(estimatedMs: number): void {
    if (this.emitter) {
      this.emitter.emit({
        type: 'execution_start',
        executionId: this.executionId,
        nodeCount: this.topologicalOrder.length,
        estimatedMs,
      });
    }
  }

  // ═══ STATISTICS ═══

  /**
   * Get execution statistics.
   */
  getStats(): { total: number; completed: number; failed: number; skipped: number; pending: number; running: number } {
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    let pending = 0;
    let running = 0;

    this.nodeStatuses.forEach(status => {
      switch (status.state) {
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'skipped': skipped++; break;
        case 'pending': pending++; break;
        case 'running': running++; break;
      }
    });

    return {
      total: this.topologicalOrder.length,
      completed,
      failed,
      skipped,
      pending,
      running,
    };
  }

  /**
   * Get total execution duration.
   */
  getTotalDurationMs(): number {
    const endTime = this.completedAt || new Date();
    return endTime.getTime() - this.startedAt.getTime();
  }

  /**
   * Check if execution passed (all completed, no failures).
   */
  isPassed(): boolean {
    const stats = this.getStats();
    return stats.failed === 0 && stats.pending === 0 && stats.running === 0;
  }

  // ═══ SERIALIZATION ═══

  /**
   * Convert to execution result for storage/feedback.
   */
  toResult(): ExecutionResult {
    const stats = this.getStats();

    return {
      executionId: this.executionId,
      graphId: this.graphId,
      passed: this.isPassed(),
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      totalDurationMs: this.getTotalDurationMs(),
      nodeResults: new Map(this.nodeStatuses),
      outputs: new Map(this.nodeOutputs),
      errors: [...this.errors],
      stats: {
        total: stats.total,
        completed: stats.completed,
        failed: stats.failed,
        skipped: stats.skipped,
      },
    };
  }

  /**
   * Get serializable JSON representation.
   */
  toJSON(): Record<string, unknown> {
    const stats = this.getStats();
    const nodeResults: Record<string, NodeStatus> = {};
    this.nodeStatuses.forEach((v, k) => { nodeResults[k] = v; });

    const outputs: Record<string, unknown> = {};
    this.nodeOutputs.forEach((v, k) => { outputs[k] = v; });

    return {
      executionId: this.executionId,
      graphId: this.graphId,
      passed: this.isPassed(),
      startedAt: this.startedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      totalDurationMs: this.getTotalDurationMs(),
      nodeResults,
      outputs,
      errors: this.errors,
      stats,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NULL EMITTER (for non-SSE execution)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Null emitter for synchronous execution without SSE.
 */
export class NullSSEEmitter implements SSEEmitter {
  emit(_event: SSEEvent): void {
    // No-op
  }

  close(): void {
    // No-op
  }
}

/**
 * Console emitter for debugging.
 */
export class ConsoleSSEEmitter implements SSEEmitter {
  emit(event: SSEEvent): void {
    console.log('[GXE SSE]', JSON.stringify(event));
  }

  close(): void {
    console.log('[GXE SSE] Connection closed');
  }
}
