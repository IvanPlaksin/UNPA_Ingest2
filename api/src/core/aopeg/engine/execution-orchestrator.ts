/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXECUTION ORCHESTRATOR
 * High-level orchestration layer that manages graph execution lifecycle
 * Wraps GraphWalker with execution tracking, events, and persistence
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ExecutionGraph,
  ExecutionContext,
  Execution,
  ExecutionStatus,
  NodeExecutionMetrics,
  NodeExecutionResult,
  createExecutionContext,
} from '../types/core.types';
import { GraphWalker, createGraphWalker } from './graph-walker';
import { pluginRegistry } from '../registry/plugin-registry';

// ────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR EVENTS
// ────────────────────────────────────────────────────────────────────────────

export interface OrchestratorEvents {
  'execution:queued': { executionId: string; graphId: string };
  'execution:started': { executionId: string; graphId: string };
  'execution:completed': { execution: Execution };
  'execution:failed': { executionId: string; error: string };
  'execution:cancelled': { executionId: string };
  'node:started': { executionId: string; nodeId: string; executorType: string };
  'node:completed': { executionId: string; nodeId: string; metrics: NodeExecutionMetrics };
  'node:failed': { executionId: string; nodeId: string; error: string };
  'node:retry': { executionId: string; nodeId: string; attempt: number; maxRetries: number };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION OPTIONS
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutionOptions {
  /** Override default parameters */
  parameters?: Record<string, unknown>;
  /** Variables to inject */
  variables?: Record<string, unknown>;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Timeout for entire execution (ms) */
  timeout?: number;
  /** Whether to run in background */
  async?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION STORE INTERFACE
// ────────────────────────────────────────────────────────────────────────────

export interface IExecutionStore {
  save(execution: Execution): Promise<void>;
  get(executionId: string): Promise<Execution | null>;
  update(executionId: string, updates: Partial<Execution>): Promise<void>;
  list(graphId?: string, limit?: number, offset?: number): Promise<Execution[]>;
}

// ────────────────────────────────────────────────────────────────────────────
// IN-MEMORY EXECUTION STORE (Default)
// ────────────────────────────────────────────────────────────────────────────

export class InMemoryExecutionStore implements IExecutionStore {
  private executions: Map<string, Execution> = new Map();

  async save(execution: Execution): Promise<void> {
    this.executions.set(execution.id, { ...execution });
  }

  async get(executionId: string): Promise<Execution | null> {
    return this.executions.get(executionId) || null;
  }

  async update(executionId: string, updates: Partial<Execution>): Promise<void> {
    const existing = this.executions.get(executionId);
    if (existing) {
      this.executions.set(executionId, { ...existing, ...updates });
    }
  }

  async list(graphId?: string, limit = 100, offset = 0): Promise<Execution[]> {
    let results = Array.from(this.executions.values());

    if (graphId) {
      results = results.filter(e => e.graphId === graphId);
    }

    return results
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(offset, offset + limit);
  }

  clear(): void {
    this.executions.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH STORE INTERFACE
// ────────────────────────────────────────────────────────────────────────────

export interface IGraphStore {
  get(graphId: string): Promise<ExecutionGraph | null>;
  save(graph: ExecutionGraph): Promise<void>;
  list(domain?: string, status?: string): Promise<ExecutionGraph[]>;
  updateStats(graphId: string, execution: Execution): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// IN-MEMORY GRAPH STORE (Default)
// ────────────────────────────────────────────────────────────────────────────

export class InMemoryGraphStore implements IGraphStore {
  private graphs: Map<string, ExecutionGraph> = new Map();

  async get(graphId: string): Promise<ExecutionGraph | null> {
    return this.graphs.get(graphId) || null;
  }

  async save(graph: ExecutionGraph): Promise<void> {
    this.graphs.set(graph.id, { ...graph });
  }

  async list(domain?: string, status?: string): Promise<ExecutionGraph[]> {
    let results = Array.from(this.graphs.values());

    if (domain) {
      results = results.filter(g => g.domain === domain);
    }
    if (status) {
      results = results.filter(g => g.status === status);
    }

    return results;
  }

  async updateStats(graphId: string, execution: Execution): Promise<void> {
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

  clear(): void {
    this.graphs.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────

export class ExecutionOrchestrator extends EventEmitter {
  private activeExecutions: Map<string, {
    execution: Execution;
    walker: GraphWalker;
    abortController: AbortController;
  }> = new Map();

  constructor(
    private executionStore: IExecutionStore = new InMemoryExecutionStore(),
    private graphStore: IGraphStore = new InMemoryGraphStore()
  ) {
    super();
  }

  /**
   * Execute a graph with given input
   */
  async execute(
    graph: ExecutionGraph,
    input: unknown,
    options: ExecutionOptions = {}
  ): Promise<Execution> {
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

    const execution: Execution = {
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
  async executeById(
    graphId: string,
    input: unknown,
    options: ExecutionOptions = {}
  ): Promise<Execution> {
    const graph = await this.graphStore.get(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }
    return this.execute(graph, input, options);
  }

  /**
   * Run the actual execution
   */
  private async runExecution(
    graph: ExecutionGraph,
    execution: Execution,
    options: ExecutionOptions
  ): Promise<Execution> {
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
      let result: NodeExecutionResult;

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

      if (!result.success && result.errors.length > 0) {
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
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<T> {
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
  private subscribeToWalkerEvents(walker: GraphWalker, execution: Execution): void {
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

      const metrics: NodeExecutionMetrics = {
        nodeId,
        executorType: node?.executorType || 'unknown',
        startTime: new Date(Date.now() - duration),
        endTime: new Date(),
        duration,
        success: result.success,
        qualityScore: result.qualityScore,
        error: result.errors[0]?.message,
        metrics: result.metrics?.customMetrics,
        retryCount: (result.metadata.retryCount as number) || 0,
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

    walker.on('node:retry', ({ nodeId, attempt, maxRetries, error }) => {
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
  async cancel(executionId: string): Promise<boolean> {
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
  async getExecution(executionId: string): Promise<Execution | null> {
    return this.executionStore.get(executionId);
  }

  /**
   * List executions
   */
  async listExecutions(
    graphId?: string,
    limit = 100,
    offset = 0
  ): Promise<Execution[]> {
    return this.executionStore.list(graphId, limit, offset);
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): Array<{ executionId: string; graphId: string; startTime: Date }> {
    return Array.from(this.activeExecutions.entries()).map(([id, data]) => ({
      executionId: id,
      graphId: data.execution.graphId,
      startTime: data.execution.startTime,
    }));
  }

  /**
   * Register a graph
   */
  async registerGraph(graph: ExecutionGraph): Promise<void> {
    await this.graphStore.save(graph);
  }

  /**
   * Get a graph
   */
  async getGraph(graphId: string): Promise<ExecutionGraph | null> {
    return this.graphStore.get(graphId);
  }

  /**
   * List graphs
   */
  async listGraphs(domain?: string, status?: string): Promise<ExecutionGraph[]> {
    return this.graphStore.list(domain, status);
  }

  /**
   * Set execution store
   */
  setExecutionStore(store: IExecutionStore): void {
    this.executionStore = store;
  }

  /**
   * Set graph store
   */
  setGraphStore(store: IGraphStore): void {
    this.graphStore = store;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ────────────────────────────────────────────────────────────────────────────

let orchestratorInstance: ExecutionOrchestrator | null = null;

/**
 * Get or create the orchestrator instance
 */
export function getOrchestrator(): ExecutionOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ExecutionOrchestrator();
  }
  return orchestratorInstance;
}

/**
 * Create a new orchestrator with custom stores
 */
export function createOrchestrator(
  executionStore?: IExecutionStore,
  graphStore?: IGraphStore
): ExecutionOrchestrator {
  return new ExecutionOrchestrator(executionStore, graphStore);
}
