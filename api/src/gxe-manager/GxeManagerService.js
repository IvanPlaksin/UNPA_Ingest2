/**
 * GxeManagerService
 *
 * Central orchestrator for multiple graph executions.
 * Sits above RuntimeEngine — manages many concurrent executions,
 * their lifecycle, triggers, signals, and monitoring.
 *
 * Phase 1: MANUAL trigger, launch/get/list, event forwarding, Memgraph persist.
 *
 * @module gxe-manager/GxeManagerService
 */

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const {
  ExecutionStatus,
  TERMINAL_STATUSES,
  TriggerType,
  Priority,
  PRIORITY_WEIGHT,
  createExecutionRecord
} = require('./types/execution.types');

const LOG_TAG = '[GxeManager]';

class GxeManagerService extends EventEmitter {
  /**
   * @param {Object} deps
   * @param {import('./ExecutionRegistry').ExecutionRegistry} deps.registry
   * @param {Object} deps.mcpRegistry - MCP tool registry (for RuntimeEngine)
   * @param {Function} deps.RuntimeEngine - RuntimeEngine constructor
   * @param {Object} deps.graphCatalog - graphCatalogService instance
   * @param {Object} deps.memgraphService - For cold-storage persist
   * @param {Object} [deps.runtimeConfig] - Default RuntimeEngine config overrides
   */
  constructor(deps) {
    super();

    if (!deps.registry) throw new Error(`${LOG_TAG} registry is required`);
    if (!deps.mcpRegistry) throw new Error(`${LOG_TAG} mcpRegistry is required`);
    if (!deps.RuntimeEngine) throw new Error(`${LOG_TAG} RuntimeEngine constructor is required`);
    if (!deps.graphCatalog) throw new Error(`${LOG_TAG} graphCatalog is required`);

    this.registry = deps.registry;
    this.mcpRegistry = deps.mcpRegistry;
    this.RuntimeEngine = deps.RuntimeEngine;
    this.graphCatalog = deps.graphCatalog;
    this.memgraphService = deps.memgraphService || null;
    this.runtimeConfig = deps.runtimeConfig || {};

    /** @type {Map<string, import('../runtime/RuntimeEngine')>} executionId → RuntimeEngine instance */
    this.engines = new Map();

    /** @type {Map<string, Object>} executionId → execution result (after completion) */
    this.results = new Map();

    this._started = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  async start() {
    if (this._started) return;
    this._started = true;
    console.log(`${LOG_TAG} Started`);
    this.emit('manager.started');
  }

  async stop() {
    if (!this._started) return;
    this._started = false;

    // Cancel all running executions gracefully
    for (const [executionId, engine] of this.engines) {
      try {
        if (typeof engine.cancel === 'function') {
          await engine.cancel();
        }
        await this.registry.updateStatus(executionId, ExecutionStatus.CANCELLED, {
          completedAt: Date.now()
        });
      } catch (err) {
        console.error(`${LOG_TAG} Error cancelling ${executionId}:`, err.message);
      }
    }
    this.engines.clear();

    console.log(`${LOG_TAG} Stopped`);
    this.emit('manager.stopped');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAUNCH EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Launch a graph execution
   * @param {string} graphId - CatalogEntry ID
   * @param {Object} [inputPayload={}] - Input data for entry nodes
   * @param {Object} [options={}]
   * @param {string} [options.priority='NORMAL']
   * @param {string} [options.triggerType='MANUAL']
   * @param {string} [options.triggerId]
   * @param {string} [options.parentExecutionId]
   * @param {string} [options.transactionId]
   * @param {number} [options.timeoutSeconds]
   * @param {Object} [options.metadata]
   * @param {string|number} [options.graphVersion='latest']
   * @returns {Promise<import('./types/execution.types').ExecutionRecord>}
   */
  async launch(graphId, inputPayload = {}, options = {}) {
    if (!this._started) {
      throw new Error(`${LOG_TAG} Service not started. Call start() first.`);
    }

    // 1. Create ExecutionRecord
    const record = createExecutionRecord({
      graphId,
      graphVersion: options.graphVersion || 'latest',
      triggerType: options.triggerType || TriggerType.MANUAL,
      triggerId: options.triggerId || null,
      priority: options.priority || Priority.NORMAL,
      inputPayload,
      parentExecutionId: options.parentExecutionId || null,
      transactionId: options.transactionId || null,
      timeoutAt: options.timeoutSeconds
        ? Date.now() + options.timeoutSeconds * 1000
        : null,
      metadata: options.metadata || {}
    });

    // 2. Register in registry (status = QUEUED)
    await this.registry.register(record);
    console.log(`${LOG_TAG} Registered execution ${record.executionId} for graph ${graphId}`);
    this.emit('execution.queued', { executionId: record.executionId, graphId });

    // 3. For MANUAL — start immediately. Other triggers will go through queue (Phase 2)
    await this._startExecution(record);

    return record;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL: Pause / Resume / Cancel
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pause a running execution
   * @param {string} executionId
   */
  async pause(executionId) {
    const engine = this.engines.get(executionId);
    if (!engine) throw new Error(`${LOG_TAG} No active engine for ${executionId}`);

    if (typeof engine.pause === 'function') {
      await engine.pause();
    }
    await this.registry.updateStatus(executionId, ExecutionStatus.PAUSED, {
      pausedAt: Date.now()
    });
    this.emit('execution.paused', { executionId, reason: 'manual' });
  }

  /**
   * Resume a paused execution with optional signal data
   * @param {string} executionId
   * @param {Object} [signalPayload={}]
   */
  async resume(executionId, signalPayload = {}) {
    const engine = this.engines.get(executionId);
    if (!engine) throw new Error(`${LOG_TAG} No active engine for ${executionId}`);

    // Create a promise that resolves when engine settles (WAITING or COMPLETED/FAILED)
    const settled = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('RUNNING'), 10000);

      const onWaiting = () => {
        clearTimeout(timeout);
        engine.removeListener('execution:waitingForInput', onWaiting);
        engine.removeListener('execution:completed', onCompleted);
        engine.removeListener('execution:stateChange', onFailed);
        resolve('WAITING');
      };

      const onCompleted = () => {
        clearTimeout(timeout);
        engine.removeListener('execution:waitingForInput', onWaiting);
        engine.removeListener('execution:completed', onCompleted);
        engine.removeListener('execution:stateChange', onFailed);
        resolve('COMPLETED');
      };

      const onFailed = (ev) => {
        if (ev.to === 'FAILED' || ev.to === 'COMPLETED') {
          clearTimeout(timeout);
          engine.removeListener('execution:waitingForInput', onWaiting);
          engine.removeListener('execution:completed', onCompleted);
          engine.removeListener('execution:stateChange', onFailed);
          resolve(ev.to);
        }
      };

      engine.on('execution:waitingForInput', onWaiting);
      engine.on('execution:completed', onCompleted);
      engine.on('execution:stateChange', onFailed);
    });

    // Resume the engine
    if (signalPayload.nodeId && typeof engine.resumeExecution === 'function') {
      await engine.resumeExecution(executionId, {
        nodeId: signalPayload.nodeId,
        output: signalPayload.payload || signalPayload
      });
    } else if (typeof engine.resume === 'function') {
      await engine.resume(signalPayload);
    }

    // Wait for engine to settle at next state
    const settledState = await settled;
    console.log(`${LOG_TAG} Resume settled: ${settledState}`);

    // Map settled state to registry status
    const statusMap = {
      'WAITING': ExecutionStatus.WAITING,
      'COMPLETED': ExecutionStatus.COMPLETED,
      'FAILED': ExecutionStatus.FAILED,
      'RUNNING': ExecutionStatus.RUNNING
    };
    const newStatus = statusMap[settledState] || ExecutionStatus.RUNNING;
    await this.registry.updateStatus(executionId, newStatus, { pausedAt: null });

    this.emit('execution.resumed', { executionId, settledState });
  }

  /**
   * Cancel execution
   * @param {string} executionId
   * @param {string} [reason='manual']
   */
  async cancel(executionId, reason = 'manual') {
    const engine = this.engines.get(executionId);
    if (engine && typeof engine.cancel === 'function') {
      await engine.cancel();
    }
    await this.registry.updateStatus(executionId, ExecutionStatus.CANCELLED, {
      completedAt: Date.now(),
      error: `Cancelled: ${reason}`
    });
    this.engines.delete(executionId);
    this.emit('execution.cancelled', { executionId, reason });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED CONTROL: Rollback, Override, Inject
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rollback execution to a previous state
   * @param {string} executionId
   * @param {Object} [options]
   * @param {string} [options.mode='RETRY_FAILED'] - RETRY_FAILED | SKIP_FAILED
   */
  async rollback(executionId, options = {}) {
    const record = await this.registry.get(executionId);
    if (!record) throw new Error(`${LOG_TAG} Execution not found: ${executionId}`);

    const allowed = [ExecutionStatus.PAUSED, ExecutionStatus.FAILED];
    if (!allowed.includes(record.status)) {
      throw new Error(`${LOG_TAG} Cannot rollback execution in status: ${record.status}`);
    }

    const mode = options.mode || 'RETRY_FAILED';
    const nodeStates = record.nodeStates || {};

    if (mode === 'RETRY_FAILED') {
      // Reset failed nodes to PENDING
      const failedNodes = Object.entries(nodeStates)
        .filter(([, s]) => s === 'FAILED' || s?.status === 'FAILED')
        .map(([id]) => id);

      if (failedNodes.length === 0) {
        throw new Error(`${LOG_TAG} No failed nodes to retry`);
      }

      for (const nodeId of failedNodes) {
        nodeStates[nodeId] = 'PENDING';
      }

      await this.registry.updateStatus(executionId, ExecutionStatus.RUNNING, {
        nodeStates,
        rollbackAt: Date.now()
      });

      this.emit('execution.rolledback', { executionId, mode, nodes: failedNodes });
      return { executionId, mode, retriedNodes: failedNodes };
    }

    if (mode === 'SKIP_FAILED') {
      const failedNodes = Object.entries(nodeStates)
        .filter(([, s]) => s === 'FAILED' || s?.status === 'FAILED')
        .map(([id]) => id);

      for (const nodeId of failedNodes) {
        nodeStates[nodeId] = 'SKIPPED';
      }

      await this.registry.updateStatus(executionId, ExecutionStatus.RUNNING, {
        nodeStates,
        rollbackAt: Date.now()
      });

      this.emit('execution.rolledback', { executionId, mode, nodes: failedNodes });
      return { executionId, mode, skippedNodes: failedNodes };
    }

    throw new Error(`${LOG_TAG} Unknown rollback mode: ${mode}`);
  }

  /**
   * Override an async wait — manually provide data instead of waiting for external system
   * @param {string} executionId
   * @param {Object} options
   * @param {string} options.nodeId - Node that is waiting
   * @param {Object} options.payload - Manual override data
   * @param {string} options.reason - Why the override is being done (required, min 10 chars)
   */
  async overrideAsyncWait(executionId, options) {
    if (!options.reason || options.reason.length < 10) {
      throw new Error(`${LOG_TAG} reason is required (min 10 chars)`);
    }

    const record = await this.registry.get(executionId);
    if (!record) throw new Error(`${LOG_TAG} Execution not found: ${executionId}`);

    if (record.status !== ExecutionStatus.PAUSED && record.status !== ExecutionStatus.WAITING) {
      throw new Error(`${LOG_TAG} Execution is not paused/waiting: ${record.status}`);
    }

    const nodeId = options.nodeId || record.currentNodeId;
    if (!nodeId) throw new Error(`${LOG_TAG} nodeId is required`);

    // Resume with override payload
    await this.resume(executionId, {
      nodeId,
      payload: options.payload || {},
      isOverride: true,
      overrideReason: options.reason
    });

    this.emit('execution.overrideWait', {
      executionId,
      nodeId,
      reason: options.reason
    });

    return { executionId, nodeId, status: 'overridden' };
  }

  /**
   * Inject a variable into a running execution's context
   * @param {string} executionId
   * @param {string} key - Variable name
   * @param {*} value - Variable value
   */
  async injectVariable(executionId, key, value) {
    const record = await this.registry.get(executionId);
    if (!record) throw new Error(`${LOG_TAG} Execution not found: ${executionId}`);

    // Update metadata with injected variable
    const metadata = record.metadata || {};
    if (!metadata._injectedVars) metadata._injectedVars = {};
    metadata._injectedVars[key] = { value, injectedAt: Date.now() };

    await this.registry.updateStatus(executionId, record.status, { metadata });

    // If there's an active engine, try to inject into its execution context
    const engine = this.engines.get(executionId);
    if (engine && engine._executionContext) {
      engine._executionContext.set(key, value);
    }

    this.emit('execution.variableInjected', { executionId, key });
    return { executionId, key, injectedAt: Date.now() };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async getExecution(executionId) {
    return this.registry.get(executionId);
  }

  async listExecutions(filters = {}) {
    return this.registry.query(filters);
  }

  async getExecutionResult(executionId) {
    return this.results.get(executionId) || null;
  }

  async getStats() {
    const byStatus = await this.registry.countByStatus();
    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    const activeCount = (byStatus.RUNNING || 0) + (byStatus.QUEUED || 0) +
      (byStatus.INITIALIZING || 0) + (byStatus.PAUSED || 0) + (byStatus.WAITING || 0);
    return { byStatus, total, activeCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Start Execution
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  async _startExecution(record) {
    const { executionId, graphId, graphVersion } = record;

    try {
      // 1. INITIALIZING
      await this.registry.updateStatus(executionId, ExecutionStatus.INITIALIZING, {
        startedAt: Date.now()
      });
      this.emit('execution.initializing', { executionId });

      // 2. Load graph from Catalog
      const graph = await this._loadGraph(graphId, graphVersion);
      if (!graph) {
        throw new Error(`Graph not found: ${graphId} v${graphVersion}`);
      }

      // 3. Create a dedicated RuntimeEngine instance
      const engine = new this.RuntimeEngine(this.mcpRegistry, this.runtimeConfig);
      this.engines.set(executionId, engine);

      // 4. Subscribe to RuntimeEngine events
      this._subscribeToRuntime(executionId, engine);

      // 5. Transition to RUNNING
      await this.registry.updateStatus(executionId, ExecutionStatus.RUNNING);
      this.emit('execution.started', { executionId, graphId });

      // 6. Execute (non-blocking — result handled via events and promise)
      const dag = this._extractDag(graph);
      const result = await engine.execute(dag, record.inputPayload, { executionId });

      // 7. Handle completion (if not already handled via events)
      await this._handleResult(executionId, result);

    } catch (err) {
      console.error(`${LOG_TAG} Execution ${executionId} failed:`, err.message);
      await this.registry.updateStatus(executionId, ExecutionStatus.FAILED, {
        completedAt: Date.now(),
        error: err.message
      });
      this.engines.delete(executionId);
      this.emit('execution.failed', { executionId, error: err.message });
    }
  }

  /** @private */
  async _loadGraph(graphId, version) {
    try {
      return await this.graphCatalog.getGraphById(graphId);
    } catch (err) {
      console.error(`${LOG_TAG} Failed to load graph ${graphId}:`, err.message);
      return null;
    }
  }

  /** @private */
  _extractDag(graph) {
    let nodes, edges;

    // Graph from catalog has { nodes, edges } in the GraphVersion content
    if (graph.nodes && graph.edges) {
      nodes = graph.nodes;
      edges = graph.edges;
    } else if (graph.content) {
      // Fallback: try content field
      const content = typeof graph.content === 'string' ? JSON.parse(graph.content) : graph.content;
      nodes = content.nodes || [];
      edges = content.edges || [];
    } else {
      return { nodes: [], edges: [] };
    }

    // Filter out tref visual binding nodes and USES_TOOL edges
    // RuntimeEngine should only receive executor nodes and flow edges
    const execNodes = nodes.filter(n => !n.data?.isToolRef);
    const flowEdges = edges.filter(e => e.label !== 'USES_TOOL');

    // Ensure each node has executorType for RuntimeEngine tool lookup
    for (const node of execNodes) {
      if (!node.executorType && node.data?.tool) {
        node.executorType = node.data.tool;
      }
      // Merge node config into parameters for executor access
      if (node.data?.config && !node.parameters) {
        node.parameters = node.data.config;
      }
    }

    console.log(`${LOG_TAG} Extracted DAG: ${execNodes.length} exec nodes (from ${nodes.length} total), ${flowEdges.length} flow edges (from ${edges.length} total)`);

    return { nodes: execNodes, edges: flowEdges };
    throw new Error('Graph has no nodes/edges');
  }

  /** @private */
  _subscribeToRuntime(executionId, engine) {
    engine.on('execution:stateChange', (data) => {
      this.emit('execution.runtimeState', { executionId, ...data });
    });

    engine.on('execution:failed', async (data) => {
      console.log(`${LOG_TAG} [EVENT] execution:failed for ${executionId}`);
      this.results.set(executionId, { ...data, status: 'FAILED' });
      try {
        await this.registry.updateStatus(executionId, ExecutionStatus.FAILED, {
          completedAt: Date.now(),
          error: data?.error || data?.failedNodes?.join(', ') || 'Execution failed',
          nodeStates: data?.nodeResults
        });
        console.log(`${LOG_TAG} Registry updated to FAILED for ${executionId}`);
      } catch (e) {
        console.error(`${LOG_TAG} Failed to update registry to FAILED:`, e.message);
      }
      this.engines.delete(executionId);
      this.emit('execution.nodeEvent', { executionId, event: 'failed', ...data });
    });

    // Handle WAITING_FOR_INPUT events (fires after resume when next node pauses)
    engine.on('execution:waitingForInput', async (waitResult) => {
      this.results.set(executionId, waitResult);
      await this.registry.updateStatus(executionId, ExecutionStatus.WAITING, {
        nodeStates: waitResult.nodeResults
      });
      this.emit('execution.waiting', { executionId, waitingNodes: waitResult.waitingNodes });
    });

    // Handle completion after resume cycles
    engine.on('execution:completed', async (completionResult) => {
      console.log(`${LOG_TAG} [EVENT] execution:completed for ${executionId}`, completionResult?.status);
      // Ensure status is set for _handleResult
      const result = { ...completionResult, status: completionResult?.status || 'COMPLETED' };
      this.results.set(executionId, result);
      await this._handleResult(executionId, result);
    });

    // Also listen for node completions to track progress
    engine.on('node:completed', (data) => {
      // Update results incrementally so getExecutionResult reflects current state
      const current = this.results.get(executionId) || {};
      if (!current.nodeResults) current.nodeResults = {};
      current.nodeResults[data.nodeId] = { status: 'SUCCEEDED', output: data.output };
      if (!current.metrics) current.metrics = {};
      current.metrics.nodesSucceeded = Object.values(current.nodeResults).filter(r => r.status === 'SUCCEEDED').length;
      this.results.set(executionId, current);
    });
  }

  /** @private */
  async _handleResult(executionId, result) {
    if (!result) return;

    // Store result
    this.results.set(executionId, result);

    // Map RuntimeEngine status → GxeManager status
    const statusMap = {
      'COMPLETED': ExecutionStatus.COMPLETED,
      'FAILED': ExecutionStatus.FAILED,
      'TIMED_OUT': ExecutionStatus.TIMED_OUT,
      'WAITING_FOR_INPUT': ExecutionStatus.WAITING
    };

    const newStatus = statusMap[result.status] || ExecutionStatus.COMPLETED;
    const metadata = { completedAt: Date.now() };

    if (result.error) {
      metadata.error = typeof result.error === 'string'
        ? result.error
        : result.error.message || JSON.stringify(result.error);
    }

    // Update node states from result
    if (result.nodeResults) {
      metadata.nodeStates = result.nodeResults;
    }

    await this.registry.updateStatus(executionId, newStatus, metadata);

    // Cleanup engine reference for terminal states
    if (TERMINAL_STATUSES.has(newStatus)) {
      this.engines.delete(executionId);

      // Persist to Memgraph (cold storage)
      if (this.memgraphService) {
        this._persistToMemgraph(executionId, result).catch(err => {
          console.error(`${LOG_TAG} Failed to persist ${executionId} to Memgraph:`, err.message);
        });
      }
    }

    this.emit(`execution.${newStatus.toLowerCase()}`, { executionId, result });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMGRAPH PERSISTENCE (Phase 1-T06)
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  async _persistToMemgraph(executionId, result) {
    const record = await this.registry.get(executionId);
    if (!record) return;

    const session = this.memgraphService.driver
      ? this.memgraphService.driver.session()
      : this.memgraphService.getSession?.();

    if (!session) {
      console.warn(`${LOG_TAG} No Memgraph session available for persist`);
      return;
    }

    try {
      await session.run(`
        CREATE (e:ExecutionRecord:META {
          executionId: $executionId,
          graphId: $graphId,
          graphVersion: $graphVersion,
          triggerType: $triggerType,
          status: $status,
          priority: $priority,
          createdAt: $createdAt,
          startedAt: $startedAt,
          completedAt: $completedAt,
          durationMs: $durationMs,
          nodesTotal: $nodesTotal,
          nodesSucceeded: $nodesSucceeded,
          nodesFailed: $nodesFailed,
          error: $error
        })
        WITH e
        OPTIONAL MATCH (c:CatalogEntry {entryId: $graphId})
        FOREACH (x IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END |
          CREATE (e)-[:EXECUTED_FROM]->(c)
        )
        RETURN e.executionId AS id
      `, {
        executionId: record.executionId,
        graphId: record.graphId || '',
        graphVersion: String(record.graphVersion || 'latest'),
        triggerType: record.triggerType || 'MANUAL',
        status: record.status,
        priority: record.priority || 'NORMAL',
        createdAt: record.createdAt || 0,
        startedAt: record.startedAt || 0,
        completedAt: record.completedAt || 0,
        durationMs: (record.completedAt && record.startedAt)
          ? record.completedAt - record.startedAt
          : 0,
        nodesTotal: result?.metrics?.nodesTotal || 0,
        nodesSucceeded: result?.metrics?.nodesSucceeded || 0,
        nodesFailed: result?.metrics?.nodesFailed || 0,
        error: record.error || ''
      });

      console.log(`${LOG_TAG} Persisted ${executionId} to Memgraph`);

      // Optionally archive from Redis after persist
      // await this.registry.archive(executionId);

    } finally {
      await session.close();
    }
  }
}

module.exports = { GxeManagerService };
