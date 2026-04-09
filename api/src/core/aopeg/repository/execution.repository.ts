/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG EXECUTION REPOSITORY
 * Memgraph-based persistence for Execution entities
 * Implements IExecutionStore interface from execution-orchestrator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Execution,
  ExecutionStatus,
  NodeExecutionMetrics,
} from '../types/core.types';
import { IExecutionStore } from '../engine/execution-orchestrator';
import { AOPEG_LABELS, AOPEG_QUERIES } from './aopeg.schema';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface MemgraphSession {
  run(cypher: string, params?: Record<string, unknown>): Promise<{
    records: Array<{
      get(key: string): { properties: Record<string, unknown> } | unknown;
      toObject(): Record<string, unknown>;
    }>;
  }>;
  close(): Promise<void>;
}

interface MemgraphDriver {
  session(): MemgraphSession;
}

interface MemgraphServiceInterface {
  driver: MemgraphDriver;
  executeQuery(cypher: string, params?: Record<string, unknown>): Promise<{
    records: Array<{
      get(key: string): { properties: Record<string, unknown> } | unknown;
      toObject(): Record<string, unknown>;
    }>;
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function recordToExecution(
  record: Record<string, unknown>,
  nodeExecutions: NodeExecutionMetrics[] = []
): Execution {
  return {
    id: record.id as string,
    graphId: record.graphId as string,
    graphVersion: record.graphVersion as string,
    status: record.status as ExecutionStatus,
    input: parseJson(record.input as string),
    output: parseJson(record.output as string),
    variables: parseJson(record.variables as string) || {},
    pathTaken: parseJson<string[]>(record.pathTaken as string) || [],
    nodeExecutions,
    error: record.error as string | undefined,
    startTime: record.startTime ? new Date(record.startTime as string) : new Date(),
    endTime: record.endTime ? new Date(record.endTime as string) : undefined,
    totalDuration: record.totalDuration as number | undefined,
    finalQualityScore: record.finalQualityScore as number | undefined,
  };
}

function recordToNodeExecution(record: Record<string, unknown>): NodeExecutionMetrics {
  return {
    nodeId: record.nodeId as string,
    executorType: record.executorType as string,
    startTime: record.startTime ? new Date(record.startTime as string) : new Date(),
    endTime: record.endTime ? new Date(record.endTime as string) : new Date(),
    duration: record.duration as number,
    success: record.success as boolean,
    qualityScore: record.qualityScore as number | undefined,
    error: record.error as string | undefined,
    metrics: parseJson(record.metrics as string),
    retryCount: record.retryCount as number | undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION REPOSITORY
// ────────────────────────────────────────────────────────────────────────────

export class ExecutionRepository implements IExecutionStore {
  private memgraphService: MemgraphServiceInterface;

  constructor(memgraphService: MemgraphServiceInterface) {
    this.memgraphService = memgraphService;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EXECUTION CRUD
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Save a new execution
   */
  async save(execution: Execution): Promise<void> {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.CREATE_EXECUTION, {
        id: execution.id,
        graphId: execution.graphId,
        graphVersion: execution.graphVersion,
        status: execution.status,
        input: serializeJson(execution.input),
        output: serializeJson(execution.output),
        variables: serializeJson(execution.variables),
        pathTaken: serializeJson(execution.pathTaken),
        error: execution.error || null,
        startTime: execution.startTime.toISOString(),
        endTime: execution.endTime?.toISOString() || null,
        totalDuration: execution.totalDuration || null,
        finalQualityScore: execution.finalQualityScore || null,
      });

      // Save node executions
      for (const nodeExec of execution.nodeExecutions) {
        await this.saveNodeExecution(execution.id, nodeExec);
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Get execution by ID
   */
  async get(executionId: string): Promise<Execution | null> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_EXECUTION_BY_ID,
      { executionId }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const execData = (record.get('e') as { properties: Record<string, unknown> })?.properties;

    if (!execData) {
      return null;
    }

    const nodeExecsData = record.get('nodeExecutions') as Array<{ properties: Record<string, unknown> }> || [];
    const nodeExecutions = nodeExecsData.map(ne => recordToNodeExecution(ne.properties));

    return recordToExecution(execData, nodeExecutions);
  }

  /**
   * Update an existing execution
   */
  async update(executionId: string, updates: Partial<Execution>): Promise<void> {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.UPDATE_EXECUTION, {
        id: executionId,
        status: updates.status || null,
        output: serializeJson(updates.output),
        pathTaken: serializeJson(updates.pathTaken),
        error: updates.error || null,
        endTime: updates.endTime?.toISOString() || null,
        totalDuration: updates.totalDuration || null,
        finalQualityScore: updates.finalQualityScore || null,
      });

      // Save new node executions
      if (updates.nodeExecutions) {
        for (const nodeExec of updates.nodeExecutions) {
          await this.saveNodeExecution(executionId, nodeExec);
        }
      }
    } finally {
      await session.close();
    }
  }

  /**
   * List executions with optional filtering
   */
  async list(
    graphId?: string,
    limit = 100,
    offset = 0
  ): Promise<Execution[]> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.LIST_EXECUTIONS,
      {
        graphId: graphId || null,
        status: null,
        limit,
        offset,
      }
    );

    const executions: Execution[] = [];

    for (const record of result.records) {
      const execData = (record.get('e') as { properties: Record<string, unknown> })?.properties;
      if (execData) {
        // Fetch full execution with node executions
        const fullExec = await this.get(execData.id as string);
        if (fullExec) {
          executions.push(fullExec);
        }
      }
    }

    return executions;
  }

  /**
   * List executions with status filter
   */
  async listByStatus(
    status: ExecutionStatus,
    graphId?: string,
    limit = 100,
    offset = 0
  ): Promise<Execution[]> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.LIST_EXECUTIONS,
      {
        graphId: graphId || null,
        status,
        limit,
        offset,
      }
    );

    const executions: Execution[] = [];

    for (const record of result.records) {
      const execData = (record.get('e') as { properties: Record<string, unknown> })?.properties;
      if (execData) {
        const fullExec = await this.get(execData.id as string);
        if (fullExec) {
          executions.push(fullExec);
        }
      }
    }

    return executions;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NODE EXECUTION TRACKING
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Save a node execution record
   */
  async saveNodeExecution(
    executionId: string,
    nodeExec: NodeExecutionMetrics
  ): Promise<void> {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.CREATE_NODE_EXECUTION, {
        id: uuidv4(),
        executionId,
        nodeId: nodeExec.nodeId,
        executorType: nodeExec.executorType,
        startTime: nodeExec.startTime.toISOString(),
        endTime: nodeExec.endTime.toISOString(),
        duration: nodeExec.duration,
        success: nodeExec.success,
        qualityScore: nodeExec.qualityScore || null,
        error: nodeExec.error || null,
        metrics: serializeJson(nodeExec.metrics),
        retryCount: nodeExec.retryCount || 0,
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Get node executions for an execution
   */
  async getNodeExecutions(executionId: string): Promise<NodeExecutionMetrics[]> {
    const query = `
      MATCH (e:${AOPEG_LABELS.EXECUTION} {id: $executionId})
        -[:${AOPEG_LABELS.EXECUTION}]->(ne:${AOPEG_LABELS.NODE_EXECUTION})
      RETURN ne
      ORDER BY ne.startTime ASC
    `;

    const result = await this.memgraphService.executeQuery(query, { executionId });

    return result.records.map(record => {
      const data = (record.get('ne') as { properties: Record<string, unknown> })?.properties;
      return recordToNodeExecution(data as Record<string, unknown>);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get execution statistics for a graph
   */
  async getGraphExecutionStats(graphId: string): Promise<{
    totalExecutions: number;
    completedCount: number;
    failedCount: number;
    avgDuration: number;
    avgQualityScore: number;
    successRate: number;
  }> {
    const query = `
      MATCH (e:${AOPEG_LABELS.EXECUTION} {graphId: $graphId})
      RETURN
        count(e) as total,
        count(CASE WHEN e.status = 'COMPLETED' THEN 1 END) as completed,
        count(CASE WHEN e.status = 'FAILED' THEN 1 END) as failed,
        avg(e.totalDuration) as avgDuration,
        avg(e.finalQualityScore) as avgQualityScore
    `;

    const result = await this.memgraphService.executeQuery(query, { graphId });

    if (result.records.length === 0) {
      return {
        totalExecutions: 0,
        completedCount: 0,
        failedCount: 0,
        avgDuration: 0,
        avgQualityScore: 0,
        successRate: 0,
      };
    }

    const record = result.records[0].toObject();
    const total = Number(record.total) || 0;
    const completed = Number(record.completed) || 0;

    return {
      totalExecutions: total,
      completedCount: completed,
      failedCount: Number(record.failed) || 0,
      avgDuration: Number(record.avgDuration) || 0,
      avgQualityScore: Number(record.avgQualityScore) || 0,
      successRate: total > 0 ? completed / total : 0,
    };
  }

  /**
   * Get executor performance statistics
   */
  async getExecutorPerformance(executorType: string): Promise<{
    executionCount: number;
    avgDuration: number;
    successRate: number;
    avgQualityScore: number;
  }> {
    const query = `
      MATCH (ne:${AOPEG_LABELS.NODE_EXECUTION} {executorType: $executorType})
      RETURN
        count(ne) as total,
        avg(ne.duration) as avgDuration,
        count(CASE WHEN ne.success = true THEN 1 END) as successful,
        avg(ne.qualityScore) as avgQualityScore
    `;

    const result = await this.memgraphService.executeQuery(query, { executorType });

    if (result.records.length === 0) {
      return {
        executionCount: 0,
        avgDuration: 0,
        successRate: 0,
        avgQualityScore: 0,
      };
    }

    const record = result.records[0].toObject();
    const total = Number(record.total) || 0;
    const successful = Number(record.successful) || 0;

    return {
      executionCount: total,
      avgDuration: Number(record.avgDuration) || 0,
      successRate: total > 0 ? successful / total : 0,
      avgQualityScore: Number(record.avgQualityScore) || 0,
    };
  }

  /**
   * Get recent executions
   */
  async getRecentExecutions(limit = 10): Promise<Execution[]> {
    return this.list(undefined, limit, 0);
  }

  /**
   * Get active (running) executions
   */
  async getActiveExecutions(): Promise<Execution[]> {
    return this.listByStatus('RUNNING');
  }

  /**
   * Delete old executions
   */
  async deleteOldExecutions(beforeDate: Date): Promise<number> {
    const query = `
      MATCH (e:${AOPEG_LABELS.EXECUTION})
      WHERE e.startTime < datetime($beforeDate)
      OPTIONAL MATCH (e)-[:${AOPEG_LABELS.EXECUTION}]->(ne:${AOPEG_LABELS.NODE_EXECUTION})
      WITH e, ne, e.id as executionId
      DETACH DELETE e, ne
      RETURN count(DISTINCT executionId) as deletedCount
    `;

    const result = await this.memgraphService.executeQuery(query, {
      beforeDate: beforeDate.toISOString(),
    });

    if (result.records.length === 0) {
      return 0;
    }

    return Number(result.records[0].toObject().deletedCount) || 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ────────────────────────────────────────────────────────────────────────────

let executionRepositoryInstance: ExecutionRepository | null = null;

/**
 * Get or create the execution repository instance
 */
export function getExecutionRepository(
  memgraphService: MemgraphServiceInterface
): ExecutionRepository {
  if (!executionRepositoryInstance) {
    executionRepositoryInstance = new ExecutionRepository(memgraphService);
  }
  return executionRepositoryInstance;
}

/**
 * Create a new execution repository with specific service
 */
export function createExecutionRepository(
  memgraphService: MemgraphServiceInterface
): ExecutionRepository {
  return new ExecutionRepository(memgraphService);
}
