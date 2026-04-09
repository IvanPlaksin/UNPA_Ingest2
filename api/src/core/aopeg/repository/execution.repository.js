/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG EXECUTION REPOSITORY
 * Memgraph-based persistence for Execution entities
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const { AOPEG_LABELS, AOPEG_RELATIONSHIPS, AOPEG_QUERIES } = require('./aopeg.schema');

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

function serializeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function recordToExecution(record, nodeExecutions = []) {
  return {
    id: record.id,
    graphId: record.graphId,
    graphVersion: record.graphVersion,
    status: record.status,
    input: parseJson(record.input),
    output: parseJson(record.output),
    variables: parseJson(record.variables) || {},
    pathTaken: parseJson(record.pathTaken) || [],
    nodeExecutions,
    error: record.error,
    startTime: record.startTime ? new Date(record.startTime) : new Date(),
    endTime: record.endTime ? new Date(record.endTime) : undefined,
    totalDuration: record.totalDuration,
    finalQualityScore: record.finalQualityScore,
  };
}

function recordToNodeExecution(record) {
  return {
    nodeId: record.nodeId,
    executorType: record.executorType,
    startTime: record.startTime ? new Date(record.startTime) : new Date(),
    endTime: record.endTime ? new Date(record.endTime) : new Date(),
    duration: record.duration,
    success: record.success,
    qualityScore: record.qualityScore,
    error: record.error,
    metrics: parseJson(record.metrics),
    retryCount: record.retryCount,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION REPOSITORY
// ────────────────────────────────────────────────────────────────────────────

class ExecutionRepository {
  constructor(memgraphService) {
    this.memgraphService = memgraphService;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EXECUTION CRUD
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Save a new execution
   */
  async save(execution) {
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
  async get(executionId) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_EXECUTION_BY_ID,
      { executionId }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const execData = record.get('e')?.properties;

    if (!execData) {
      return null;
    }

    const nodeExecsData = record.get('nodeExecutions') || [];
    const nodeExecutions = nodeExecsData.map(ne => recordToNodeExecution(ne.properties));

    return recordToExecution(execData, nodeExecutions);
  }

  /**
   * Update an existing execution
   */
  async update(executionId, updates) {
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
  async list(graphId, limit = 100, offset = 0) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.LIST_EXECUTIONS,
      {
        graphId: graphId || null,
        status: null,
        limit: neo4j.int(limit),
        offset: neo4j.int(offset),
      }
    );

    const executions = [];

    for (const record of result.records) {
      const execData = record.get('e')?.properties;
      if (execData) {
        // Fetch full execution with node executions
        const fullExec = await this.get(execData.id);
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
  async listByStatus(status, graphId, limit = 100, offset = 0) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.LIST_EXECUTIONS,
      {
        graphId: graphId || null,
        status,
        limit: neo4j.int(limit),
        offset: neo4j.int(offset),
      }
    );

    const executions = [];

    for (const record of result.records) {
      const execData = record.get('e')?.properties;
      if (execData) {
        const fullExec = await this.get(execData.id);
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
  async saveNodeExecution(executionId, nodeExec) {
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
  async getNodeExecutions(executionId) {
    const query = `
      MATCH (e:${AOPEG_LABELS.EXECUTION} {id: $executionId})
        -[:${AOPEG_RELATIONSHIPS.EXECUTED_NODE}]->(ne:${AOPEG_LABELS.NODE_EXECUTION})
      RETURN ne
      ORDER BY ne.startTime ASC
    `;

    const result = await this.memgraphService.executeQuery(query, { executionId });

    return result.records.map(record => {
      const data = record.get('ne')?.properties;
      return recordToNodeExecution(data);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get execution statistics for a graph
   */
  async getGraphExecutionStats(graphId) {
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
  async getExecutorPerformance(executorType) {
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
  async getRecentExecutions(limit = 10) {
    return this.list(undefined, limit, 0);
  }

  /**
   * Get active (running) executions
   */
  async getActiveExecutions() {
    return this.listByStatus('RUNNING');
  }

  /**
   * Delete old executions
   */
  async deleteOldExecutions(beforeDate) {
    const query = `
      MATCH (e:${AOPEG_LABELS.EXECUTION})
      WHERE e.startTime < datetime($beforeDate)
      OPTIONAL MATCH (e)-[:${AOPEG_RELATIONSHIPS.EXECUTED_NODE}]->(ne:${AOPEG_LABELS.NODE_EXECUTION})
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

let executionRepositoryInstance = null;

/**
 * Get or create the execution repository instance
 */
function getExecutionRepository(memgraphService) {
  if (!executionRepositoryInstance) {
    executionRepositoryInstance = new ExecutionRepository(memgraphService);
  }
  return executionRepositoryInstance;
}

/**
 * Create a new execution repository with specific service
 */
function createExecutionRepository(memgraphService) {
  return new ExecutionRepository(memgraphService);
}

module.exports = {
  ExecutionRepository,
  getExecutionRepository,
  createExecutionRepository,
};
