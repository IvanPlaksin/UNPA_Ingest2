/**
 * Runtime Adapter for Immutable Graph
 * UN ProjectAdvisor - Integration with GXE RuntimeEngine
 *
 * Purpose: Records execution patterns and results to enable:
 * - Pattern learning from successful executions
 * - Performance tracking for optimization
 * - Feedback loop for graph builder improvement
 */

import { v4 as uuidv4 } from 'uuid';
import { ImmutableGraphService } from '../immutable-graph.service';
import {
  NodeVersion,
  EdgeVersion,
  Namespace,
  CreateNodeInput,
  CreateEdgeInput
} from '../../../types/immutable-graph.types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecutionResult {
  executionId: string;
  dagId: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL_FAILURE' | 'TIMED_OUT';
  metrics: ExecutionMetrics;
  nodeResults: Map<string, NodeResult>;
  dag: DAGSnapshot;
  context: ExecutionContext;
}

export interface ExecutionMetrics {
  totalDurationMs: number;
  nodesSucceeded: number;
  nodesFailed: number;
  nodesSkipped: number;
  retriesTotal: number;
}

export interface NodeResult {
  nodeId: string;
  toolId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
  durationMs: number;
  attempts: number;
  error?: string;
}

export interface DAGSnapshot {
  id: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  entryNodeId?: string;
  exitNodeIds?: string[];
}

export interface DAGNode {
  id: string;
  executorType: string;
  parameters: Record<string, unknown>;
}

export interface DAGEdge {
  id: string;
  source: string;
  target: string;
}

export interface ExecutionContext {
  taskCategory: string;
  taskDescription?: string;
  userId?: string;
  timestamp: Date;
}

export interface PatternRecord {
  patternId: string;
  dagHash: string;
  taskCategory: string;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  lastUsedAt: Date;
  createdAt: Date;
  dag: DAGSnapshot;
}

export interface RecordResult {
  patternId: string;
  executionRecorded: boolean;
  patternUpdated: boolean;
  isNewPattern: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bridges RuntimeEngine execution results to ImmutableGraph
 * Enables pattern learning and feedback loop
 */
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  // CODEX-NS §4.5: ExecutionRecords belong in META namespace (system telemetry, not project data)
  private static readonly PATTERN_NAMESPACE = Namespace.META;

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'gxe-patterns'
  ) {}

  /**
   * Record an execution result and update pattern statistics
   */
  async recordExecution(result: ExecutionResult): Promise<RecordResult> {
    const dagHash = this.computeDAGHash(result.dag);
    const isSuccess = result.status === 'COMPLETED';

    // Find or create pattern
    let pattern = await this.findPattern(dagHash);
    let isNewPattern = false;

    if (!pattern) {
      pattern = await this.createPattern(result.dag, result.context, dagHash);
      isNewPattern = true;
    }

    // Update pattern statistics
    await this.updatePatternStats(pattern, result.metrics, isSuccess);

    // Record individual execution
    await this.createExecutionRecord(result, pattern.entityId);

    return {
      patternId: pattern.entityId,
      executionRecorded: true,
      patternUpdated: !isNewPattern,
      isNewPattern
    };
  }

  /**
   * Find patterns matching a task category
   */
  async findPatternsByCategory(
    taskCategory: string,
    minSuccessRate: number = 0.7,
    limit: number = 5
  ): Promise<PatternRecord[]> {
    const patterns = await this.graphService.queryNodes({
      namespace: RuntimeAdapter.PATTERN_NAMESPACE,
      projectId: this.projectId,
      nodeType: RuntimeAdapter.PATTERN_NODE_TYPE
    });

    const matching = patterns
      .filter(p => p.properties.taskCategory === taskCategory)
      .map(p => this.nodeToPatternRecord(p))
      .filter(p => this.getSuccessRate(p) >= minSuccessRate)
      .sort((a, b) => {
        // Sort by success rate, then by recency
        const rateA = this.getSuccessRate(a);
        const rateB = this.getSuccessRate(b);
        if (rateA !== rateB) return rateB - rateA;
        return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
      })
      .slice(0, limit);

    return matching;
  }

  /**
   * Get the best pattern for a task
   */
  async getBestPattern(taskCategory: string): Promise<PatternRecord | null> {
    const patterns = await this.findPatternsByCategory(taskCategory, 0.5, 1);
    return patterns.length > 0 ? patterns[0] : null;
  }

  /**
   * Get execution history for a pattern
   */
  async getPatternExecutions(
    patternId: string,
    limit: number = 10
  ): Promise<NodeVersion[]> {
    const edges = await this.graphService.getConnectedEdges(patternId);
    const executionIds = edges
      .filter(e => e.edgeType === 'HAS_EXECUTION')
      .map(e => e.targetEntityId);

    const executions = await Promise.all(
      executionIds.slice(0, limit).map(id =>
        this.graphService.getNodeHistory(id, { limit: 1 })
      )
    );

    return executions.flat();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private computeDAGHash(dag: DAGSnapshot): string {
    // Hash based on structure: node types + edge connections
    const nodeSignatures = dag.nodes
      .map(n => `${n.id}:${n.executorType}`)
      .sort()
      .join('|');

    const edgeSignatures = dag.edges
      .map(e => `${e.source}->${e.target}`)
      .sort()
      .join('|');

    const combined = `${nodeSignatures}::${edgeSignatures}`;

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return `dag-${Math.abs(hash).toString(16)}`;
  }

  private async findPattern(dagHash: string): Promise<NodeVersion | null> {
    const patterns = await this.graphService.queryNodes({
      namespace: RuntimeAdapter.PATTERN_NAMESPACE,
      projectId: this.projectId,
      nodeType: RuntimeAdapter.PATTERN_NODE_TYPE
    });

    return patterns.find(p => p.properties.dagHash === dagHash) || null;
  }

  private async createPattern(
    dag: DAGSnapshot,
    context: ExecutionContext,
    dagHash: string
  ): Promise<NodeVersion> {
    const input: CreateNodeInput = {
      namespace: RuntimeAdapter.PATTERN_NAMESPACE,
      projectId: this.projectId,
      nodeType: RuntimeAdapter.PATTERN_NODE_TYPE,
      properties: {
        dagHash,
        taskCategory: context.taskCategory,
        taskDescription: context.taskDescription || '',
        successCount: 0,
        failureCount: 0,
        avgDurationMs: 0,
        totalDurationMs: 0,
        executionCount: 0,
        lastUsedAt: context.timestamp.toISOString(),
        createdAt: context.timestamp.toISOString(),
        dag: JSON.stringify(dag),
        nodeCount: dag.nodes.length,
        edgeCount: dag.edges.length,
        executorTypes: dag.nodes.map(n => n.executorType).join(',')
      },
      validTimeStart: context.timestamp,
      changeReason: 'New execution pattern discovered',
      changedBy: 'runtime-adapter'
    };

    return this.graphService.createNode(input);
  }

  private async updatePatternStats(
    pattern: NodeVersion,
    metrics: ExecutionMetrics,
    isSuccess: boolean
  ): Promise<void> {
    const props = pattern.properties;
    const execCount = (props.executionCount as number) + 1;
    const totalDuration = (props.totalDurationMs as number) + metrics.totalDurationMs;

    await this.graphService.updateNode({
      entityId: pattern.entityId,
      newProperties: {
        ...props,
        successCount: (props.successCount as number) + (isSuccess ? 1 : 0),
        failureCount: (props.failureCount as number) + (isSuccess ? 0 : 1),
        executionCount: execCount,
        totalDurationMs: totalDuration,
        avgDurationMs: totalDuration / execCount,
        lastUsedAt: new Date().toISOString()
      },
      changeReason: `Execution recorded (${isSuccess ? 'success' : 'failure'})`,
      changedBy: 'runtime-adapter'
    });
  }

  private async createExecutionRecord(
    result: ExecutionResult,
    patternId: string
  ): Promise<NodeVersion> {
    // Create execution record node
    const execNode: CreateNodeInput = {
      namespace: RuntimeAdapter.PATTERN_NAMESPACE,
      projectId: this.projectId,
      nodeType: RuntimeAdapter.EXECUTION_NODE_TYPE,
      properties: {
        executionId: result.executionId,
        dagId: result.dagId,
        status: result.status,
        totalDurationMs: result.metrics.totalDurationMs,
        nodesSucceeded: result.metrics.nodesSucceeded,
        nodesFailed: result.metrics.nodesFailed,
        nodesSkipped: result.metrics.nodesSkipped,
        retriesTotal: result.metrics.retriesTotal,
        nodeResults: JSON.stringify(Array.from(result.nodeResults.entries())),
        taskCategory: result.context.taskCategory,
        userId: result.context.userId || 'anonymous',
        executedAt: result.context.timestamp.toISOString()
      },
      validTimeStart: result.context.timestamp,
      changeReason: 'Execution completed',
      changedBy: 'runtime-adapter'
    };

    const execRecord = await this.graphService.createNode(execNode);

    // Link to pattern
    const edgeInput: CreateEdgeInput = {
      sourceEntityId: patternId,
      targetEntityId: execRecord.entityId,
      edgeType: 'HAS_EXECUTION',
      namespace: RuntimeAdapter.PATTERN_NAMESPACE,
      properties: {
        executedAt: result.context.timestamp.toISOString(),
        status: result.status
      },
      changeReason: 'Link execution to pattern',
      changedBy: 'runtime-adapter'
    };

    await this.graphService.createEdge(edgeInput);

    return execRecord;
  }

  private nodeToPatternRecord(node: NodeVersion): PatternRecord {
    return {
      patternId: node.entityId,
      dagHash: node.properties.dagHash as string,
      taskCategory: node.properties.taskCategory as string,
      successCount: node.properties.successCount as number,
      failureCount: node.properties.failureCount as number,
      avgDurationMs: node.properties.avgDurationMs as number,
      lastUsedAt: new Date(node.properties.lastUsedAt as string),
      createdAt: new Date(node.properties.createdAt as string),
      dag: JSON.parse(node.properties.dag as string)
    };
  }

  private getSuccessRate(pattern: PatternRecord): number {
    const total = pattern.successCount + pattern.failureCount;
    return total > 0 ? pattern.successCount / total : 0;
  }
}
