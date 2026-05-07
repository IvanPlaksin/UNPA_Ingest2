/**
 * RuntimeEngine
 *
 * Thin facade that orchestrates all GXE Runtime components.
 * Provides a single entry point for graph execution.
 * Part of GXE Runtime Environment P0.
 *
 * @module runtime/RuntimeEngine
 */

const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { ExecutionStateMachine, ExecutionState } = require('./state/ExecutionStateMachine');
const { PortManager } = require('./dataflow/PortManager');
const { DataFlowManager } = require('./dataflow/DataFlowManager');
const { NodeRunner } = require('./execution/NodeRunner');
const { ExecutionContext } = require('./execution/ExecutionContext');
const { TopologicalScheduler, SchedulerStrategy, FailureStrategy } = require('./scheduler/TopologicalScheduler');

// Try to import GraphValidator (soft dependency)
let GraphValidator;
try {
  const graphValidator = require('../services/graph/graph-validator');
  GraphValidator = graphValidator.GraphValidator;
} catch (e) {
  // GraphValidator not available - will skip validation
  GraphValidator = null;
}

// Graph type system
const { graphClassificationService, GraphType } = require('../services/graph-classification.service');
const { GraphTypeError } = require('../errors/GraphTypeError');

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  maxConcurrency: 10,
  maxNodeRetries: 3,
  nodeTimeoutMs: 60000,
  graphTimeoutMs: 300000,
  schedulingStrategy: SchedulerStrategy.PARALLEL_BOUNDED,
  errorStrategy: FailureStrategy.FAIL_FAST,
  enableMetrics: true,
  enableValidation: true
};

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * RuntimeEngine - Main facade for GXE graph execution
 * @extends EventEmitter
 */
class RuntimeEngine extends EventEmitter {
  /**
   * @param {Object} mcpRegistry - MCP tool registry
   * @param {Object} [config] - Runtime configuration
   */
  constructor(mcpRegistry, config = {}) {
    super();

    if (!mcpRegistry) {
      throw new Error('RuntimeEngine requires mcpRegistry');
    }

    this._mcpRegistry = mcpRegistry;
    this._config = { ...DEFAULT_CONFIG, ...config };

    // Per-execution state (created in execute())
    this._executionId = null;
    this._stateMachine = null;
    this._scheduler = null;
    this._globalTimerId = null;
    this._portManager = null;
    this._dataFlowManager = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN EXECUTION METHOD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute a graph
   *
   * @param {Object} dag - { nodes: Node[], edges: Edge[] }
   * @param {Object} [inputData] - Input data for entry nodes
   * @param {Object} [executionConfig] - Per-execution config overrides
   * @returns {Promise<ExecutionResult>}
   */
  async execute(dag, inputData = {}, executionConfig = {}) {
    // 1. Create execution ID (use provided or generate)
    this._executionId = executionConfig.executionId || randomUUID();

    // 2. Merge config
    const config = { ...this._config, ...executionConfig };

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE: TYPE GATE (before try/catch so GraphTypeError propagates directly)
    // ═══════════════════════════════════════════════════════════════════════

    const graphType = dag.graphType || GraphType.EXECUTABLE;
    const graphSubType = dag.graphSubType || null;

    // Check special cases first (more specific error messages)
    if (graphClassificationService.requiresInstantiation(graphType)) {
      throw new GraphTypeError(
        `Graph type '${graphType}' requires instantiation before execution. ` +
        `Use TemplateService.instantiate() first.`,
        graphType
      );
    }

    if (graphClassificationService.requiresCompilation(graphType)) {
      throw new GraphTypeError(
        `Graph type '${graphType}' requires compilation to EXECUTABLE. ` +
        `Use ProcessCompiler.compile() first.`,
        graphType
      );
    }

    if (!graphClassificationService.canExecute(graphType)) {
      throw new GraphTypeError(
        `Cannot execute graph of type '${graphType}'. ` +
        `Executable types: ${graphClassificationService.getExecutableTypes().join(', ')}`,
        graphType,
        graphClassificationService.getExecutableTypes()
      );
    }

    // Apply type-aware execution config
    const typeConfig = this._getTypeExecutionConfig(graphType, graphSubType);

    console.log(`[RuntimeEngine] Executing graph type=${graphType}${graphSubType ? '/' + graphSubType : ''} id=${this._executionId}`);

    // 3. Create state machine (initial state is CREATED by default)
    this._stateMachine = new ExecutionStateMachine();
    const startTime = Date.now();

    let validationResult = null;
    let workingDag = dag;

    try {
      // 4. Transition to INITIALIZING
      await this._stateMachine.transition('initialize');

      this.emit('execution:stateChange', {
        executionId: this._executionId,
        from: 'CREATED',
        to: 'INITIALIZING'
      });

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE: VALIDATION
      // ═══════════════════════════════════════════════════════════════════════

      if (config.enableValidation && GraphValidator) {
        const validator = new GraphValidator(this._mcpRegistry);
        validationResult = validator.validate(dag);

        if (!validationResult.valid) {
          // Check if errors are fixable
          const fatalErrors = this._getFatalErrors(validationResult.errors);

          if (fatalErrors.length > 0) {
            // Fatal errors - cannot continue
            await this._stateMachine.transition('validation_failed');

            return this._buildResult({
              status: 'FAILED',
              error: {
                code: 'VALIDATION_FAILED',
                errors: validationResult.errors,
                fatalErrors
              },
              startTime,
              validation: validationResult,
              dag: workingDag
            });
          }

          // Attempt auto-fix
          workingDag = validator.autoFix(dag);
          validationResult.autoFixed = true;

          this.emit('execution:validationFixed', {
            executionId: this._executionId,
            originalErrors: validationResult.errors
          });
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE: INITIALIZATION
      // ═══════════════════════════════════════════════════════════════════════

      // Create PortManager
      this._portManager = new PortManager();

      // Register ports for each node — collect missing tools
      const missingTools = [];
      for (const node of workingDag.nodes) {
        // Support multiple formats: executorType (AOPEG), data.toolId, data.kind
        const toolId = node.executorType || node.data?.toolId || node.data?.tool || node.data?.kind;

        if (toolId) {
          const tool = this._mcpRegistry.getTool(toolId);

          if (tool) {
            const toolDef = tool.getDefinition();
            this._portManager.registerPorts(node.id, toolDef);
          } else {
            // Tool not found - collect error
            console.warn(`[RuntimeEngine] Tool not found: ${toolId} for node ${node.id}`);
            missingTools.push({ nodeId: node.id, label: node.data?.label || node.id, toolId, kind: node.data?.kind });
            this._portManager.registerPorts(node.id, { inputSchema: {}, outputSchema: {} });
          }
        } else {
          // No tool ID at all
          missingTools.push({ nodeId: node.id, label: node.data?.label || node.id, toolId: null, kind: node.data?.kind });
          this._portManager.registerPorts(node.id, { inputSchema: {}, outputSchema: {} });
        }
      }

      // Fail execution if tools are missing
      if (missingTools.length > 0) {
        const details = missingTools.map(t =>
          `  - ${t.nodeId} (${t.label}): tool "${t.toolId || 'none'}" not found (kind: ${t.kind || 'unknown'})`
        ).join('\n');
        const errMsg = `Tool validation failed: ${missingTools.length}/${workingDag.nodes.length} nodes have unresolved tools.\n${details}`;

        this.emit('execution:toolValidationFailed', {
          executionId: this._executionId,
          missingTools,
          message: errMsg,
        });

        // Emit execution:failed so SSE streamer picks it up
        this.emit('execution:failed', {
          executionId: this._executionId,
          error: errMsg,
          missingTools,
          failedNodes: missingTools.map(t => t.nodeId),
        });

        await this._stateMachine.transition('validation_failed').catch(() => {});
        return {
          executionId: this._executionId,
          status: 'FAILED',
          error: errMsg,
          missingTools,
          nodeResults: Object.fromEntries(
            missingTools.map(t => [t.nodeId, { status: 'FAILED', error: `Tool not found: ${t.toolId || 'none'}` }])
          ),
        };
      }

      // Create DataFlowManager
      this._dataFlowManager = new DataFlowManager(this._portManager, workingDag.edges);

      // Create ExecutionContext for cross-node data access
      this._executionContext = new ExecutionContext(inputData);

      // Create NodeRunner
      const nodeRunner = new NodeRunner();

      // Create TopologicalScheduler
      this._scheduler = new TopologicalScheduler(
        workingDag,
        nodeRunner,
        this._dataFlowManager,
        this._portManager,
        this._mcpRegistry,
        {
          maxConcurrency: config.maxConcurrency,
          maxNodeRetries: config.maxNodeRetries,
          nodeTimeoutMs: config.nodeTimeoutMs,
          strategy: config.schedulingStrategy,
          failureStrategy: config.errorStrategy,
          executionId: this._executionId,
          executionContext: this._executionContext
        }
      );

      // Transition to READY
      await this._stateMachine.transition('initialized');

      this.emit('execution:stateChange', {
        executionId: this._executionId,
        from: 'INITIALIZING',
        to: 'READY'
      });

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE: INPUT INJECTION
      // ═══════════════════════════════════════════════════════════════════════

      // Find entry nodes and inject input data
      const entryNodes = this._findEntryNodes(workingDag);

      if (Object.keys(inputData).length > 0) {
        for (const entryNodeId of entryNodes) {
          // Set entire inputData as the default _input port (entry nodes typically
          // have a single _input port, not named ports for each field)
          const defaultPort = this._portManager.getDefaultInputPort(entryNodeId);
          if (defaultPort) {
            this._portManager.setPortData(entryNodeId, defaultPort.id, inputData);
          }
          // Also try setting individual fields as named ports (for nodes that
          // declare explicit input port names matching the field names)
          for (const [portId, value] of Object.entries(inputData)) {
            this._portManager.setPortData(entryNodeId, portId, value);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE: EXECUTION
      // ═══════════════════════════════════════════════════════════════════════

      // Transition to RUNNING
      await this._stateMachine.transition('start');

      this.emit('execution:stateChange', {
        executionId: this._executionId,
        from: 'READY',
        to: 'RUNNING'
      });

      // Set up global timeout
      let timeoutReached = false;
      this._globalTimerId = setTimeout(() => {
        timeoutReached = true;
        this._stateMachine.transition('global_timeout').catch(() => {});
        this._cancelAllActive();
      }, config.graphTimeoutMs);

      // Proxy scheduler events
      this._setupSchedulerEventProxy();

      // Start scheduler execution
      const schedulerResult = await this._scheduler.start();

      // Clear global timeout
      if (this._globalTimerId) {
        clearTimeout(this._globalTimerId);
        this._globalTimerId = null;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE: COMPLETION
      // ═══════════════════════════════════════════════════════════════════════

      if (timeoutReached) {
        // Already transitioned to TIMED_OUT
        return this._buildResult({
          status: 'TIMED_OUT',
          schedulerResult,
          startTime,
          validation: validationResult,
          dag: workingDag
        });
      }

      // Determine final state based on scheduler result
      if (schedulerResult.status === 'WAITING_FOR_INPUT') {
        // Execution paused — waiting for human input
        await this._stateMachine.transition('await_signal');

        this.emit('execution:stateChange', {
          executionId: this._executionId,
          from: 'RUNNING',
          to: 'WAITING'
        });

        return this._buildResult({
          status: 'WAITING_FOR_INPUT',
          schedulerResult,
          startTime,
          validation: validationResult,
          dag: workingDag,
          waitingNodes: schedulerResult.waitingNodes
        });
      } else if (schedulerResult.metrics.nodesFailed === 0) {
        await this._stateMachine.transition('all_exits_done');

        this.emit('execution:stateChange', {
          executionId: this._executionId,
          from: 'RUNNING',
          to: 'COMPLETED'
        });

        return this._buildResult({
          status: 'COMPLETED',
          schedulerResult,
          startTime,
          validation: validationResult,
          dag: workingDag
        });
      } else {
        await this._stateMachine.transition('unrecoverable_error');

        this.emit('execution:stateChange', {
          executionId: this._executionId,
          from: 'RUNNING',
          to: 'FAILED'
        });

        return this._buildResult({
          status: 'FAILED',
          schedulerResult,
          startTime,
          validation: validationResult,
          dag: workingDag
        });
      }

    } catch (err) {
      // Cleanup timeout
      if (this._globalTimerId) {
        clearTimeout(this._globalTimerId);
        this._globalTimerId = null;
      }

      // Try to transition to FAILED
      try {
        await this._stateMachine.transition('unrecoverable_error');
      } catch (transitionErr) {
        // Already in terminal state
      }

      return this._buildResult({
        status: 'FAILED',
        error: {
          code: 'UNEXPECTED_ERROR',
          message: err.message,
          stack: err.stack
        },
        startTime,
        validation: validationResult,
        dag: workingDag || dag
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current execution state
   * @returns {string}
   */
  getState() {
    return this._stateMachine?.state ?? 'IDLE';
  }

  /**
   * Get current progress
   * @returns {Object}
   */
  getProgress() {
    if (!this._scheduler) {
      return {
        state: this.getState(),
        completed: 0,
        total: 0,
        percentage: 0,
        active: 0
      };
    }

    const schedulerProgress = this._scheduler.getProgress();
    return {
      state: this.getState(),
      ...schedulerProgress
    };
  }

  /**
   * Pause execution
   * @returns {Promise<boolean>}
   */
  async pause() {
    if (!this._stateMachine) return false;

    try {
      await this._stateMachine.transition('pause');

      this.emit('execution:stateChange', {
        executionId: this._executionId,
        to: 'PAUSED'
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Resume execution
   * @returns {Promise<boolean>}
   */
  async resume() {
    if (!this._stateMachine) return false;

    try {
      await this._stateMachine.transition('resume');

      this.emit('execution:stateChange', {
        executionId: this._executionId,
        to: 'RUNNING'
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Cancel execution
   * @returns {Promise<boolean>}
   */
  async cancel() {
    if (!this._stateMachine) return false;

    try {
      await this._stateMachine.transition('cancel');
      this._cancelAllActive();

      this.emit('execution:stateChange', {
        executionId: this._executionId,
        to: 'CANCELLED'
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find entry nodes (no incoming edges)
   * @private
   */
  _findEntryNodes(dag) {
    const hasIncoming = new Set();
    for (const edge of dag.edges) {
      hasIncoming.add(edge.target);
    }
    return dag.nodes
      .filter(n => !hasIncoming.has(n.id))
      .map(n => n.id);
  }

  /**
   * Find exit nodes (no outgoing edges)
   * @private
   */
  _findExitNodes(dag) {
    const hasOutgoing = new Set();
    for (const edge of dag.edges) {
      hasOutgoing.add(edge.source);
    }
    return dag.nodes
      .filter(n => !hasOutgoing.has(n.id))
      .map(n => n.id);
  }

  /**
   * Get execution config based on graph type and subType.
   * Controls checkpoint, saga, readOnly, and other behavioral flags.
   * @private
   */
  _getTypeExecutionConfig(graphType, graphSubType) {
    if (graphType === GraphType.VALIDATION) {
      return { useCheckpoint: false, useSaga: false, readOnly: true };
    }

    if (graphType === GraphType.COMPOSITE) {
      return { useCheckpoint: true, useSaga: true, isolateSubGraphs: true };
    }

    if (graphType === GraphType.EXECUTABLE) {
      switch (graphSubType) {
        case 'dialog':
          return { useCheckpoint: true, useSaga: false, reExecutionPattern: true };
        case 'business':
          return { useCheckpoint: false, useSaga: true, compensateOnFailure: true };
        case 'extraction':
          return { useCheckpoint: true, useSaga: false, spiralExecution: true };
        default:
          return { useCheckpoint: false, useSaga: false };
      }
    }

    return {};
  }

  /**
   * Get fatal validation errors (cannot be auto-fixed)
   * @private
   */
  _getFatalErrors(errors) {
    const fatalCodes = new Set([
      'EMPTY_GRAPH',
      'GRAPH_HAS_CYCLES',
      'NO_ENTRY_NODE',
      'NO_EXIT_NODE'
    ]);
    return errors.filter(e => fatalCodes.has(e.code));
  }

  /**
   * Cancel all active nodes
   * @private
   */
  _cancelAllActive() {
    // This would require scheduler to expose cancel functionality
    // For now, just emit the event
    this.emit('execution:cancelling', {
      executionId: this._executionId
    });
  }

  /**
   * Setup event proxying from scheduler
   * @private
   */
  _setupSchedulerEventProxy() {
    if (!this._scheduler) return;

    // Proxy all scheduler events
    const eventsToProxy = [
      'node:stateChange',
      'node:completed',
      'node:failed',
      'node:waitingInput',
      'scheduler:decision',
      'scheduler:initialized',
      'execution:progress',
      'execution:completed',
      'execution:failed',
      'execution:waitingForInput'  // BACKLOG-0046: needed for resume-continue cycle
    ];

    for (const eventName of eventsToProxy) {
      this._scheduler.on(eventName, (data) => {
        this.emit(eventName, {
          executionId: this._executionId,
          ...data
        });
      });
    }
  }

  /**
   * CC-029: Record execution to Memgraph (fire-and-forget).
   * @private
   */
  _recordExecution({ status, dag, startTime, endTime, totalDurationMs, schedulerResult, error }) {
    try {
      const { ExecutionRecorder } = require('./persistence/ExecutionRecorder');
      const memgraph = this._config.memgraph || this._mcpRegistry?.memgraph;
      if (!memgraph) return;

      const recorder = new ExecutionRecorder(memgraph);
      recorder.recordExecution({
        graphId: dag?.id || dag?.name || 'unknown',
        graphName: dag?.name || '',
        catalogEntryId: dag?.catalogEntryId || dag?.entryId || '',
        status,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        durationMs: totalDurationMs,
        executedBy: this._config.executedBy || 'system',
        input: null, // Don't store full input (could be large)
        output: null,
        error: error || null,
        metrics: schedulerResult?.metrics || {},
        nodeResults: schedulerResult?.nodeResults || null,
        recordNodeDetails: this._config.recordNodeDetails === true
      }).catch(err => {
        console.warn('[RuntimeEngine] ExecutionRecorder failed:', err.message);
      });
    } catch (e) {
      // ExecutionRecorder not available — skip silently
    }
  }

  /**
   * Build execution result object
   * @private
   */
  _buildResult({ status, schedulerResult, error, startTime, validation, dag, waitingNodes }) {
    const endTime = Date.now();
    const totalDurationMs = endTime - startTime;

    // CC-029: Fire-and-forget execution recording (non-blocking)
    if (status !== 'WAITING_FOR_INPUT' && this._config.recordExecutions !== false) {
      this._recordExecution({ status, dag, startTime, endTime, totalDurationMs, schedulerResult, error });
    }

    // Collect output from exit nodes
    const output = {};
    if (schedulerResult && dag) {
      const exitNodes = this._findExitNodes(dag);
      for (const exitNodeId of exitNodes) {
        const nodeResult = schedulerResult.nodeResults?.[exitNodeId];
        if (nodeResult?.status === 'SUCCEEDED') {
          output[exitNodeId] = nodeResult.output;
        }
      }
    }

    // Build node results
    const nodeResults = {};
    if (schedulerResult?.nodeResults) {
      for (const [nodeId, result] of Object.entries(schedulerResult.nodeResults)) {
        nodeResults[nodeId] = {
          status: result.status,
          output: result.output ?? null,
          error: result.error ?? null,
          details: result.details ?? null, // Include error details for debugging
          attempts: result.attempt ?? 1,
          durationMs: result.metrics?.wallTimeMs ?? 0
        };
      }
    }

    // Build metrics
    const metrics = {
      totalDurationMs,
      nodesTotal: schedulerResult?.metrics?.totalNodes ?? 0,
      nodesSucceeded: schedulerResult?.metrics?.nodesSucceeded ?? 0,
      nodesFailed: schedulerResult?.metrics?.nodesFailed ?? 0,
      nodesSkipped: schedulerResult?.metrics?.nodesSkipped ?? 0,
      nodesCancelled: schedulerResult?.metrics?.nodesCancelled ?? 0,
      retriesTotal: schedulerResult?.metrics?.totalRetries ?? 0
    };

    return {
      executionId: this._executionId,
      status,
      graphType: dag?.graphType || null,
      graphSubType: dag?.graphSubType || null,
      output,
      error: error ?? null,
      metrics,
      nodeResults,
      validation: validation ?? null,
      waitingNodes: waitingNodes ?? null,
      history: this._stateMachine?.history ?? []
    };
  }
}

// Note: resumeExecution is added via prototype to keep the class clean
// since it's called externally by the Resume API controller.
/**
 * Resume execution after WAITING_FOR_INPUT
 *
 * @param {string} executionId - Must match current execution
 * @param {Object} params
 * @param {string} params.nodeId - Node to resume
 * @param {Object} params.output - User-provided input payload
 * @returns {Promise<Object>}
 */
RuntimeEngine.prototype.resumeExecution = async function(executionId, { nodeId, output }) {
  if (this._executionId !== executionId) {
    throw new Error(`Execution ${executionId} not found on this engine instance`);
  }

  if (!this._stateMachine || this._stateMachine.state !== 'WAITING') {
    throw new Error(`Execution is not in WAITING state (current: ${this._stateMachine?.state})`);
  }

  // Transition back to RUNNING
  await this._stateMachine.transition('signal_received');

  this.emit('execution:stateChange', {
    executionId: this._executionId,
    from: 'WAITING',
    to: 'RUNNING'
  });

  // Resume the node in scheduler
  await this._scheduler.resumeNode(nodeId, output);

  // After resume, scheduler may have paused at next WAIT_FOR_INPUT node
  // Need to wait briefly for scheduler to finish processing the next node
  await new Promise(r => setTimeout(r, 100));

  if (this._scheduler.hasWaitingNodes) {
    try {
      await this._stateMachine.transition('await_signal');
      this.emit('execution:stateChange', {
        executionId: this._executionId,
        from: 'RUNNING',
        to: 'WAITING'
      });
    } catch (e) {
      // State machine might already be in WAITING if event handler beat us
      console.log(`[RuntimeEngine] await_signal transition failed (state=${this._stateMachine.state}):`, e.message);
    }
  }

  return { status: this._stateMachine.state };
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  RuntimeEngine,
  DEFAULT_CONFIG
};
