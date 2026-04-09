/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXECUTION ORCHESTRATOR
 * High-level orchestration layer that manages graph execution lifecycle
 * Wraps GraphWalker with execution tracking, events, and persistence
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { GraphWalker, createGraphWalker } = require('./graph-walker');
const { pluginRegistry } = require('../registry/plugin-registry');

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Create Execution Context
// ────────────────────────────────────────────────────────────────────────────

function createExecutionContext(executionId, graphId, input, variables = {}) {
  return {
    executionId,
    graphId,
    input,
    variables: { ...variables },
    metadata: {},
    nodeOutputs: new Map(),
    sharedState: new Map(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// IN-MEMORY EXECUTION STORE (Default)
// ────────────────────────────────────────────────────────────────────────────

class InMemoryExecutionStore {
  constructor() {
    this.executions = new Map();
  }

  async save(execution) {
    this.executions.set(execution.id, { ...execution });
  }

  async get(executionId) {
    return this.executions.get(executionId) || null;
  }

  async update(executionId, updates) {
    const existing = this.executions.get(executionId);
    if (existing) {
      this.executions.set(executionId, { ...existing, ...updates });
    }
  }

  async list(graphId, limit = 100, offset = 0) {
    let results = Array.from(this.executions.values());

    if (graphId) {
      results = results.filter(e => e.graphId === graphId);
    }

    return results
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(offset, offset + limit);
  }

  clear() {
    this.executions.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// IN-MEMORY GRAPH STORE (Default)
// ────────────────────────────────────────────────────────────────────────────

class InMemoryGraphStore {
  constructor() {
    this.graphs = new Map();
  }

  async get(graphId) {
    return this.graphs.get(graphId) || null;
  }

  async save(graph) {
    this.graphs.set(graph.id, { ...graph });
  }

  async list(domain, status) {
    let results = Array.from(this.graphs.values());

    if (domain) {
      results = results.filter(g => g.domain === domain);
    }
    if (status) {
      results = results.filter(g => g.status === status);
    }

    return results;
  }

  async updateStats(graphId, execution) {
    const graph = this.graphs.get(graphId);
    if (!graph) return;

    const stats = graph.executionStats || {
      totalExecutions: 0,
      avgDuration: 0,
      avgQualityScore: 0,
      successRate: 0,
    };

    const n = stats.totalExecutions;
    stats.totalExecutions = n + 1;

    if (execution.totalDuration) {
      stats.avgDuration = (stats.avgDuration * n + execution.totalDuration) / (n + 1);
    }

    if (execution.finalQualityScore !== undefined) {
      stats.avgQualityScore = (stats.avgQualityScore * n + execution.finalQualityScore) / (n + 1);
    }

    const successCount = stats.successRate * n + (execution.status === 'COMPLETED' ? 1 : 0);
    stats.successRate = successCount / (n + 1);

    graph.executionStats = stats;
    this.graphs.set(graphId, graph);
  }

  clear() {
    this.graphs.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────

class ExecutionOrchestrator extends EventEmitter {
  constructor(executionStore, graphStore) {
    super();
    this.executionStore = executionStore || new InMemoryExecutionStore();
    this.graphStore = graphStore || new InMemoryGraphStore();
    this.activeExecutions = new Map();
  }

  /**
   * Execute a graph with given input
   */
  async execute(graph, input, options = {}) {
    // Validate graph executors are registered
    const executorTypes = graph.nodes.map(n => n.executorType);
    const validation = pluginRegistry.validateGraphExecutors(executorTypes);

    if (!validation.valid) {
      throw new Error(
        `Missing executors: ${validation.missingExecutors.join(', ')}`
      );
    }

    // Create execution record
    const executionId = uuidv4();
    const startTime = new Date();

    const execution = {
      id: executionId,
      graphId: graph.id,
      graphVersion: graph.version,
      status: 'QUEUED',
      input,
      variables: { ...graph.defaultParameters, ...options.variables },
      output: null,
      pathTaken: [],
      nodeExecutions: [],
      startTime,
    };

    // Save initial execution
    await this.executionStore.save(execution);
    this.emit('execution:queued', { executionId, graphId: graph.id });

    // Run execution
    if (options.async) {
      // Run in background
      this.runExecution(graph, execution, options).catch(error => {
        console.error(`[Orchestrator] Background execution failed:`, error);
      });
      return execution;
    }

    // Run synchronously
    return this.runExecution(graph, execution, options);
  }

  /**
   * Execute a graph by ID
   */
  async executeById(graphId, input, options = {}) {
    const graph = await this.graphStore.get(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    return this.execute(graph, input, options);
  }

  /**
   * Run the actual execution
   */
  async runExecution(graph, execution, options) {
    const abortController = new AbortController();

    // Update status to running
    execution.status = 'RUNNING';
    await this.executionStore.update(execution.id, { status: 'RUNNING' });
    this.emit('execution:started', { executionId: execution.id, graphId: graph.id });

    // Create execution context
    const context = createExecutionContext(
      execution.id,
      graph.id,
      execution.input,
      execution.variables
    );

    // Add custom metadata
    if (options.metadata) {
      Object.assign(context.metadata, options.metadata);
    }

    // Create walker
    const walker = createGraphWalker(graph);

    // Track active execution
    this.activeExecutions.set(execution.id, {
      execution,
      walker,
      abortController,
    });

    // Subscribe to walker events
    this.subscribeToWalkerEvents(walker, execution);

    try {
      // Execute with optional timeout
      let result;

      if (options.timeout) {
        result = await this.executeWithTimeout(
          walker.walk(context),
          options.timeout,
          abortController.signal
        );
      } else {
        result = await walker.walk(context);
      }

      // Update execution with result
      execution.status = result.success ? 'COMPLETED' : 'FAILED';
      execution.output = result.output;
      execution.endTime = new Date();
      execution.totalDuration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.finalQualityScore = result.qualityScore;

      if (!result.success && result.errors && result.errors.length > 0) {
        execution.error = result.errors.map(e => e.message).join('; ');
      }

      // Save final execution
      await this.executionStore.update(execution.id, execution);

      // Update graph stats
      await this.graphStore.updateStats(graph.id, execution);

      // Emit completion event
      if (execution.status === 'COMPLETED') {
        this.emit('execution:completed', { execution });
      } else {
        this.emit('execution:failed', {
          executionId: execution.id,
          error: execution.error || 'Unknown error',
        });
      }

      return execution;
    } catch (error) {
      // Handle execution error
      execution.status = 'FAILED';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.endTime = new Date();
      execution.totalDuration = execution.endTime.getTime() - execution.startTime.getTime();

      await this.executionStore.update(execution.id, execution);

      this.emit('execution:failed', {
        executionId: execution.id,
        error: execution.error,
      });

      throw error;
    } finally {
      // Cleanup
      this.activeExecutions.delete(execution.id);
    }
  }

  /**
   * Execute with timeout
   */
  executeWithTimeout(promise, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Execution cancelled'));
      });

      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Subscribe to walker events and forward them
   */
  subscribeToWalkerEvents(walker, execution) {
    walker.on('node:start', ({ nodeId, node }) => {
      execution.pathTaken.push(nodeId);
      this.emit('node:started', {
        executionId: execution.id,
        nodeId,
        executorType: node.executorType,
      });
    });

    walker.on('node:complete', ({ nodeId, result, duration }) => {
      const node = walker.getNode(nodeId);

      const metrics = {
        nodeId,
        executorType: node?.executorType || 'unknown',
        startTime: new Date(Date.now() - duration),
        endTime: new Date(),
        duration,
        success: result.success,
        qualityScore: result.qualityScore,
        error: result.errors?.[0]?.message,
        metrics: result.metrics?.customMetrics,
        retryCount: result.metadata?.retryCount || 0,
      };

      execution.nodeExecutions.push(metrics);

      this.emit('node:completed', {
        executionId: execution.id,
        nodeId,
        metrics,
      });
    });

    walker.on('node:error', ({ nodeId, error }) => {
      this.emit('node:failed', {
        executionId: execution.id,
        nodeId,
        error: error.message,
      });
    });

    walker.on('node:retry', ({ nodeId, attempt, maxRetries }) => {
      this.emit('node:retry', {
        executionId: execution.id,
        nodeId,
        attempt,
        maxRetries,
      });
    });
  }

  /**
   * Cancel an active execution
   */
  async cancel(executionId) {
    const active = this.activeExecutions.get(executionId);
    if (!active) {
      return false;
    }

    active.abortController.abort();
    active.execution.status = 'CANCELLED';
    active.execution.endTime = new Date();
    active.execution.totalDuration =
      active.execution.endTime.getTime() - active.execution.startTime.getTime();

    await this.executionStore.update(executionId, active.execution);

    this.emit('execution:cancelled', { executionId });

    return true;
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId) {
    return this.executionStore.get(executionId);
  }

  /**
   * List executions
   */
  async listExecutions(graphId, limit = 100, offset = 0) {
    return this.executionStore.list(graphId, limit, offset);
  }

  /**
   * Get active executions
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.entries()).map(([id, data]) => ({
      executionId: id,
      graphId: data.execution.graphId,
      startTime: data.execution.startTime,
    }));
  }

  /**
   * Register a graph
   */
  async registerGraph(graph) {
    await this.graphStore.save(graph);
  }

  /**
   * Get a graph
   */
  async getGraph(graphId) {
    return this.graphStore.get(graphId);
  }

  /**
   * List graphs
   */
  async listGraphs(domain, status) {
    return this.graphStore.list(domain, status);
  }

  /**
   * Set execution store
   */
  setExecutionStore(store) {
    this.executionStore = store;
  }

  /**
   * Set graph store
   */
  setGraphStore(store) {
    this.graphStore = store;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ────────────────────────────────────────────────────────────────────────────

let orchestratorInstance = null;

/**
 * Get or create the orchestrator instance
 */
function getOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = new ExecutionOrchestrator();
  }
  return orchestratorInstance;
}

/**
 * Create a new orchestrator with custom stores
 */
function createOrchestrator(executionStore, graphStore) {
  return new ExecutionOrchestrator(executionStore, graphStore);
}

module.exports = {
  ExecutionOrchestrator,
  getOrchestrator,
  createOrchestrator,
  InMemoryExecutionStore,
  InMemoryGraphStore,
  createExecutionContext,
};
