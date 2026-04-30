/**
 * TopologicalScheduler
 *
 * Central orchestrator for graph execution using Kahn's algorithm.
 * Event-driven, supports parallel execution, retry, and cascading cancel.
 * Part of GXE Runtime Environment P0.
 *
 * @module runtime/scheduler/TopologicalScheduler
 */

const { EventEmitter } = require('node:events');
const { NodeStateMachine, NodeState } = require('../state/NodeStateMachine');
const { NodeRunner, RunStatus } = require('../execution/NodeRunner');
const { CheckpointManager } = require('../resilience/CheckpointManager');
const { RetryPolicy } = require('../resilience/RetryPolicy');

// ═══════════════════════════════════════════════════════════════════════════
// DEFERRED PROMISE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deferred promise pattern for completion tracking
 */
class Deferred {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.isSettled = false;
  }

  _settle(fn, value) {
    if (!this.isSettled) {
      this.isSettled = true;
      fn(value);
    }
  }

  resolveOnce(value) {
    this._settle(this.resolve, value);
  }

  rejectOnce(error) {
    this._settle(this.reject, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULER STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════

const SchedulerStrategy = {
  SEQUENTIAL: 'SEQUENTIAL',       // One node at a time
  PARALLEL_BOUNDED: 'PARALLEL_BOUNDED', // Up to maxConcurrency
  PARALLEL_UNBOUNDED: 'PARALLEL_UNBOUNDED' // No limit
};

const FailureStrategy = {
  FAIL_FAST: 'FAIL_FAST',         // Cancel downstream on first failure
  CONTINUE_ON_ERROR: 'CONTINUE_ON_ERROR' // Continue parallel branches
};

// ═══════════════════════════════════════════════════════════════════════════
// TOPOLOGICAL SCHEDULER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Topological scheduler using Kahn's algorithm
 * @extends EventEmitter
 */
class TopologicalScheduler extends EventEmitter {
  /**
   * @param {Object} dag - { nodes: Node[], edges: Edge[] }
   * @param {NodeRunner} nodeRunner
   * @param {import('../dataflow/DataFlowManager').DataFlowManager} dataFlowManager
   * @param {import('../dataflow/PortManager').PortManager} portManager
   * @param {Object} mcpRegistry - MCP tool registry
   * @param {Object} config
   */
  constructor(dag, nodeRunner, dataFlowManager, portManager, mcpRegistry, config = {}) {
    super();

    this._dag = dag;
    this._nodeRunner = nodeRunner;
    this._dataFlowManager = dataFlowManager;
    this._portManager = portManager;
    this._mcpRegistry = mcpRegistry;

    // Configuration
    this._config = {
      maxConcurrency: config.maxConcurrency ?? 10,
      strategy: config.strategy ?? SchedulerStrategy.PARALLEL_BOUNDED,
      failureStrategy: config.failureStrategy ?? FailureStrategy.FAIL_FAST,
      nodeTimeoutMs: config.nodeTimeoutMs ?? 60000,
      executionId: config.executionId ?? `exec-${Date.now()}`
    };

    // Retry policy - accept instance or create from config
    this._retryPolicy = config.retryPolicy ?? new RetryPolicy({
      maxAttempts: config.maxNodeRetries ?? 3,
      baseDelayMs: config.retryBackoffBase ?? 1000,
      maxDelayMs: config.retryBackoffMax ?? 15000,
      jitter: true
    });

    // Node state machines
    /** @type {Map<string, NodeStateMachine>} */
    this._nodeStates = new Map();

    // Kahn's algorithm state
    /** @type {Map<string, number>} */
    this._inDegree = new Map();

    // Active executions
    /** @type {Map<string, Promise>} */
    this._activePromises = new Map();

    // Completion tracking
    this._completion = new Deferred();

    // Results storage
    this._nodeResults = new Map();

    // Metrics
    this._startTime = null;
    this._metrics = {
      nodesSucceeded: 0,
      nodesFailed: 0,
      nodesSkipped: 0,
      nodesCancelled: 0,
      totalRetries: 0
    };

    // Entry/exit nodes cache
    this._entryNodes = [];
    this._exitNodes = [];

    // Checkpoint manager (optional, injected for async execution support)
    this._checkpointManager = config.checkpointManager || null;

    // ExecutionContext for cross-node data (template resolution, condition evaluation)
    this._executionContext = config.executionContext || null;

    // Nodes waiting for input
    /** @type {Map<string, Object>} nodeId → waitContext */
    this._waitingNodes = new Map();

    // Track how many times each merge node was decremented via _skipUnreachable
    // (i.e., via non-taken branches). When this equals the total incoming edge count,
    // all paths to the merge node were passively skipped → skip the merge node too.
    /** @type {Map<string, number>} nodeId → passive skip decrement count */
    this._passiveDecrements = new Map();

    // Initialized flag
    this._initialized = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize scheduler state
   */
  initialize() {
    if (this._initialized) return;

    // Build inDegree map from edges
    // Support both ReactFlow (source/target) and AOPEG (sourceNodeId/targetNodeId) formats
    for (const node of this._dag.nodes) {
      this._inDegree.set(node.id, 0);
      this._nodeStates.set(node.id, new NodeStateMachine(node.id));
    }

    // Detect back-edges (edges forming cycles) via DFS so Kahn's algorithm works
    // Back-edges are excluded from in-degree calculation but still used for re-entry
    this._backEdges = this._detectBackEdges();

    for (const edge of this._dag.edges) {
      // Skip back-edges in in-degree calculation
      if (this._backEdges.has(edge.id || `${edge.source || edge.sourceNodeId}->${edge.target || edge.targetNodeId}`)) {
        continue;
      }
      const targetId = edge.target || edge.targetNodeId;
      const current = this._inDegree.get(targetId) || 0;
      this._inDegree.set(targetId, current + 1);
    }

    // Find entry nodes (inDegree = 0)
    this._entryNodes = this._dag.nodes
      .filter(n => this._inDegree.get(n.id) === 0)
      .map(n => n.id);

    // Find exit nodes (no outgoing edges)
    const nodesWithOutgoing = new Set(this._dag.edges.map(e => e.source || e.sourceNodeId));
    this._exitNodes = this._dag.nodes
      .filter(n => !nodesWithOutgoing.has(n.id))
      .map(n => n.id);

    // Mark entry nodes as READY
    for (const nodeId of this._entryNodes) {
      const sm = this._nodeStates.get(nodeId);
      sm.transition('deps_satisfied');
    }

    this._initialized = true;
    this._startTime = Date.now();

    this.emit('scheduler:initialized', {
      entryNodes: this._entryNodes,
      exitNodes: this._exitNodes,
      totalNodes: this._dag.nodes.length
    });
  }

  /**
   * Detect back-edges (edges that form cycles) using DFS.
   * Back-edges are excluded from in-degree calculation so Kahn's algorithm
   * can process DAGs with retry/loop edges (e.g. N06→N03 retry_extraction).
   * @returns {Set<string>} Set of edge IDs that are back-edges
   * @private
   */
  _detectBackEdges() {
    const backEdges = new Set();

    // Build adjacency list
    const adj = new Map();
    for (const node of this._dag.nodes) {
      adj.set(node.id, []);
    }
    for (const edge of this._dag.edges) {
      const src = edge.source || edge.sourceNodeId;
      const tgt = edge.target || edge.targetNodeId;
      adj.get(src)?.push({ target: tgt, edge });
    }

    // DFS coloring: WHITE=unvisited, GRAY=in-stack, BLACK=done
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const node of this._dag.nodes) {
      color.set(node.id, WHITE);
    }

    const dfs = (nodeId) => {
      color.set(nodeId, GRAY);
      for (const { target, edge } of (adj.get(nodeId) || [])) {
        if (color.get(target) === GRAY) {
          // Target is on the current DFS stack → back-edge (cycle)
          const edgeId = edge.id || `${edge.source || edge.sourceNodeId}->${edge.target || edge.targetNodeId}`;
          backEdges.add(edgeId);
        } else if (color.get(target) === WHITE) {
          dfs(target);
        }
      }
      color.set(nodeId, BLACK);
    };

    for (const node of this._dag.nodes) {
      if (color.get(node.id) === WHITE) {
        dfs(node.id);
      }
    }

    return backEdges;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Schedule ready nodes for execution
   * @returns {string[]} - Node IDs that were scheduled
   */
  scheduleReadyNodes() {
    const scheduled = [];

    // Find all READY nodes
    const readyNodes = [];
    for (const [nodeId, sm] of this._nodeStates) {
      if (sm.state === NodeState.READY) {
        readyNodes.push(nodeId);
      }
    }

    // Limit by concurrency
    const availableSlots = this._config.strategy === SchedulerStrategy.PARALLEL_UNBOUNDED
      ? readyNodes.length
      : Math.min(readyNodes.length, this._config.maxConcurrency - this._activePromises.size);

    const toSchedule = this._config.strategy === SchedulerStrategy.SEQUENTIAL
      ? readyNodes.slice(0, 1)
      : readyNodes.slice(0, availableSlots);

    // Schedule each node
    for (const nodeId of toSchedule) {
      const sm = this._nodeStates.get(nodeId);

      // Transition to QUEUED
      sm.transition('scheduled');

      this.emit('scheduler:decision', {
        nodeId,
        action: 'EXECUTE',
        concurrentActive: this._activePromises.size + 1
      });

      // Fire-and-forget execution
      const promise = this._executeNodeWithTracking(nodeId);
      this._activePromises.set(nodeId, promise);

      scheduled.push(nodeId);
    }

    this._emitProgress();
    return scheduled;
  }

  /**
   * Execute node with promise tracking
   * @private
   */
  async _executeNodeWithTracking(nodeId) {
    try {
      await this.executeNode(nodeId);
    } finally {
      this._activePromises.delete(nodeId);
      this._checkCompletion();
    }
  }

  /**
   * Execute a single node
   * @param {string} nodeId
   * @param {boolean} [isRetry=false] - Whether this is a retry execution
   */
  async executeNode(nodeId, isRetry = false) {
    const sm = this._nodeStates.get(nodeId);
    const node = this._dag.nodes.find(n => n.id === nodeId);

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Only transition from QUEUED on first execution (not retry)
    if (!isRetry) {
      // Transition to EXECUTING
      sm.transition('execute');

      this.emit('node:stateChange', {
        nodeId,
        from: 'QUEUED',
        to: 'EXECUTING',
        attempt: sm.attempt
      });
    }

    // Run the node - support both AOPEG (executorType) and React Flow (data.toolId/tool/kind) formats
    const toolId = node.executorType || node.data?.toolId || node.data?.tool || node.data?.kind;
    // Node parameters: AOPEG uses 'parameters', ReactFlow uses 'data.config' or 'data'
    const nodeParameters = node.parameters || node.data?.config || node.data || {};

    const result = await this._nodeRunner.run(nodeId, toolId, {
      mcpRegistry: this._mcpRegistry,
      portManager: this._portManager,
      dataFlowManager: this._dataFlowManager,
      globalVariables: new Map(),
      executionId: this._config.executionId,
      config: { nodeTimeoutMs: this._config.nodeTimeoutMs },
      nodeParameters,
      executionContext: this._executionContext
    });

    // Handle result
    if (result.status === RunStatus.SUCCEEDED) {
      await this._handleSuccess(nodeId, result);
    } else if (result.status === RunStatus.WAIT_FOR_INPUT) {
      await this._handleWaitForInput(nodeId, result, sm);
    } else {
      await this._handleFailure(nodeId, result, sm);
    }
  }

  /**
   * Handle successful node execution
   * @private
   */
  async _handleSuccess(nodeId, result) {
    const sm = this._nodeStates.get(nodeId);

    // Transition to SUCCEEDED
    sm.transition('success');
    this._metrics.nodesSucceeded++;

    // Store result
    this._nodeResults.set(nodeId, {
      status: 'SUCCEEDED',
      output: result.output,
      metrics: result.metrics,
      attempt: sm.attempt
    });

    this.emit('node:completed', {
      nodeId,
      output: result.output,
      metrics: result.metrics,
      attempt: sm.attempt
    });

    this.emit('node:stateChange', {
      nodeId,
      from: 'EXECUTING',
      to: 'SUCCEEDED',
      attempt: sm.attempt
    });

    // Notify completion and schedule next
    this._onNodeCompleted(nodeId);
  }

  /**
   * Handle failed node execution
   * @private
   */
  async _handleFailure(nodeId, result, sm) {
    // Use RetryPolicy to determine if we should retry
    const willRetry = this._retryPolicy.shouldRetry(sm.attempt, { code: result.error });

    this.emit('node:failed', {
      nodeId,
      error: result.error,
      details: result.details,
      attempt: sm.attempt,
      willRetry
    });

    if (willRetry) {
      // Retry with backoff
      this._metrics.totalRetries++;

      sm.transition('error', { retriesExhausted: false });

      this.emit('node:stateChange', {
        nodeId,
        from: 'EXECUTING',
        to: 'RETRYING',
        attempt: sm.attempt
      });

      // Calculate backoff using RetryPolicy
      const backoffMs = this._retryPolicy.getDelay(sm.attempt);

      await this._delay(backoffMs);

      // Transition back to EXECUTING (increments attempt counter)
      sm.transition('retry');

      this.emit('node:stateChange', {
        nodeId,
        from: 'RETRYING',
        to: 'EXECUTING',
        attempt: sm.attempt
      });

      // Recursive retry - pass isRetry=true to skip QUEUED→EXECUTING transition
      return this.executeNode(nodeId, true);
    } else {
      // Final failure - either max attempts reached or error is non-retryable
      sm.transition('error', { retriesExhausted: true });
      this._metrics.nodesFailed++;

      // Store failure
      this._nodeResults.set(nodeId, {
        status: 'FAILED',
        error: result.error,
        details: result.details,
        attempt: sm.attempt
      });

      this.emit('node:stateChange', {
        nodeId,
        from: 'EXECUTING',
        to: 'FAILED',
        attempt: sm.attempt
      });

      this._onNodeFailed(nodeId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAIT FOR INPUT HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle WAIT_FOR_INPUT result from executor
   * @private
   */
  async _handleWaitForInput(nodeId, result, sm) {
    // Transition node to WAITING_INPUT
    sm.transition('wait_input');

    // Store wait context
    this._waitingNodes.set(nodeId, result.waitContext);

    // Store result
    this._nodeResults.set(nodeId, {
      status: 'WAITING_INPUT',
      waitContext: result.waitContext,
      attempt: sm.attempt
    });

    this.emit('node:stateChange', {
      nodeId,
      from: 'EXECUTING',
      to: 'WAITING_INPUT',
      attempt: sm.attempt
    });

    this.emit('node:waitingInput', {
      nodeId,
      waitContext: result.waitContext,
      attempt: sm.attempt
    });

    // Save checkpoint if CheckpointManager is available
    if (this._checkpointManager) {
      await this._checkpointManager.saveWaitContext(
        this._config.executionId,
        nodeId,
        result.waitContext
      );
    }
  }

  /**
   * Resume a node that was waiting for input
   * Injects the received input and re-executes the downstream propagation
   *
   * @param {string} nodeId - Node ID to resume
   * @param {Object} inputPayload - Data received from the user
   * @returns {Promise<void>}
   */
  async resumeNode(nodeId, inputPayload) {
    const sm = this._nodeStates.get(nodeId);
    if (!sm || sm.state !== NodeState.WAITING_INPUT) {
      throw new Error(`Node ${nodeId} is not in WAITING_INPUT state`);
    }

    // Reset completion promise for next pause/completion cycle
    this._completion = new Deferred();

    // Transition back to EXECUTING
    sm.transition('input_received');

    this.emit('node:stateChange', {
      nodeId,
      from: 'WAITING_INPUT',
      to: 'EXECUTING'
    });

    // Inject received input as the node's output and propagate downstream
    console.log(`[Scheduler:resumeNode] ${nodeId} propagating output...`);
    const propagationResults = this._dataFlowManager.propagateOutput(nodeId, inputPayload);
    const failedPropagations = propagationResults.filter(r => !r.success);
    console.log(`[Scheduler:resumeNode] ${nodeId} propagation: ${propagationResults.length} total, ${failedPropagations.length} failed`);

    if (failedPropagations.length > 0) {
      console.log(`[Scheduler:resumeNode] ${nodeId} PROPAGATION FAILED:`, failedPropagations);
      sm.transition('error', { retriesExhausted: true });
      this._metrics.nodesFailed++;
      this._nodeResults.set(nodeId, {
        status: 'FAILED',
        error: 'PROPAGATION_ERROR',
        details: { failedEdges: failedPropagations },
        attempt: sm.attempt
      });
      this._onNodeFailed(nodeId);
      return;
    }

    // Mark as succeeded
    sm.transition('success');
    this._metrics.nodesSucceeded++;

    // Remove from waiting
    this._waitingNodes.delete(nodeId);

    this._nodeResults.set(nodeId, {
      status: 'SUCCEEDED',
      output: inputPayload,
      attempt: sm.attempt
    });

    this.emit('node:completed', {
      nodeId,
      output: inputPayload,
      attempt: sm.attempt
    });

    this.emit('node:stateChange', {
      nodeId,
      from: 'EXECUTING',
      to: 'SUCCEEDED'
    });

    // Clear checkpoint
    if (this._checkpointManager) {
      await this._checkpointManager.clearWaitContext(this._config.executionId);
    }

    // Continue graph execution
    console.log(`[Scheduler:resumeNode] ${nodeId} calling _onNodeCompleted...`);

    // Debug: check state of downstream nodes BEFORE _onNodeCompleted
    for (const edge of this._dag.edges) {
      const src = edge.source || edge.sourceNodeId;
      if (src === nodeId) {
        const tgt = edge.target || edge.targetNodeId;
        const tgtSm = this._nodeStates.get(tgt);
        const tgtDeg = this._inDegree.get(tgt);
        console.log(`[Scheduler:resumeNode] downstream ${tgt}: state=${tgtSm?.state}, inDegree=${tgtDeg}`);
      }
    }

    this._onNodeCompleted(nodeId);

    // Debug: check state AFTER _onNodeCompleted
    for (const edge of this._dag.edges) {
      const src = edge.source || edge.sourceNodeId;
      if (src === nodeId) {
        const tgt = edge.target || edge.targetNodeId;
        const tgtSm = this._nodeStates.get(tgt);
        const tgtDeg = this._inDegree.get(tgt);
        console.log(`[Scheduler:resumeNode] AFTER: ${tgt}: state=${tgtSm?.state}, inDegree=${tgtDeg}`);
      }
    }
    console.log(`[Scheduler:resumeNode] ${nodeId} resume complete. Active promises: ${this._activePromises.size}`);
  }

  /**
   * Check if there are nodes waiting for input
   * @returns {boolean}
   */
  get hasWaitingNodes() {
    return this._waitingNodes.size > 0;
  }

  /**
   * Get all waiting nodes with their contexts
   * @returns {Object}
   */
  getWaitingNodes() {
    return Object.fromEntries(this._waitingNodes);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Called when a node completes successfully
   * @private
   */
  _onNodeCompleted(nodeId) {
    // Get node result to check for conditional branching
    const nodeResult = this._nodeResults.get(nodeId);
    const outputData = nodeResult?.output;

    // Determine if this node produced a branch decision
    const branch = this._extractBranch(outputData);

    // Collect outgoing edges from this node
    const outEdges = [];
    for (const edge of this._dag.edges) {
      const edgeSource = edge.source || edge.sourceNodeId;
      if (edgeSource === nodeId) {
        outEdges.push(edge);
      }
    }

    // Check if this is a conditional branch (has non-default labeled outgoing edges + branch result)
    // 'default' labels are wildcards, not conditional branches
    const hasLabeledEdges = outEdges.some(e => e.label && e.label.toLowerCase() !== 'default');
    const isConditionalBranch = branch !== null && hasLabeledEdges;

    for (const edge of outEdges) {
      const edgeTarget = edge.target || edge.targetNodeId;
      const edgeLabel = edge.label;

      // Conditional branching: only activate the matching branch
      if (isConditionalBranch && edgeLabel) {
        if (!this._matchBranchLabel(edgeLabel, branch)) {
          // Non-matching branch: skip the target and its exclusive descendants
          this._skipUnreachable(edgeTarget, nodeId);
          continue;
        }
      }

      // Normal path: decrease inDegree
      const targetId = edgeTarget;
      const newDegree = (this._inDegree.get(targetId) || 1) - 1;
      this._inDegree.set(targetId, newDegree);

      // If target now has inDegree 0 and is PENDING, mark as READY
      if (newDegree === 0) {
        const targetSm = this._nodeStates.get(targetId);
        if (targetSm && targetSm.state === NodeState.PENDING) {
          targetSm.transition('deps_satisfied');

          this.emit('node:stateChange', {
            nodeId: targetId,
            from: 'PENDING',
            to: 'READY'
          });
        }
      }
    }

    // Schedule next batch
    this.scheduleReadyNodes();
  }

  /**
   * Extract branch decision from node output
   * @private
   * @returns {string|null} Branch name or null if no branch decision
   */
  _extractBranch(output) {
    if (!output || typeof output !== 'object') return null;

    // Direct branch field (from workflow.condition executor)
    if (output.branch !== undefined) return String(output.branch);

    // Nested in data wrapper (from AOPEGAdapter)
    if (output.data?.branch !== undefined) return String(output.data.branch);

    return null;
  }

  /**
   * Match an edge label against a branch result
   * @private
   */
  _matchBranchLabel(edgeLabel, branchResult) {
    if (!edgeLabel) return false;

    const label = edgeLabel.toLowerCase().trim();
    const result = branchResult.toLowerCase().trim();

    // 'default' label is a wildcard — always matches any branch
    if (label === 'default') return true;

    // Direct match
    if (label === result) return true;

    // Boolean-true synonyms
    const TRUE_LABELS = ['true', 'yes', 'approved', 'valid', 'found', 'in_stock', 'high_confidence', 'success'];
    const FALSE_LABELS = ['false', 'no', 'rejected', 'invalid', 'not_found', 'out_of_stock', 'low_confidence', 'failure'];

    if (result === 'true' && TRUE_LABELS.includes(label)) return true;
    if (result === 'false' && FALSE_LABELS.includes(label)) return true;

    return false;
  }

  /**
   * Skip a node from an untaken conditional branch and its exclusive descendants
   * @private
   */
  _skipUnreachable(targetId, conditionNodeId) {
    const sm = this._nodeStates.get(targetId);
    if (!sm || sm.isTerminal) return;

    if (sm.state === NodeState.PENDING) {
      // Check if this is a merge node (multiple incoming forward edges).
      // Merge nodes must NOT be skipped unconditionally — track how many times
      // _skipUnreachable is called on this node (i.e., non-taken branch decrements).
      // When passiveDecrements === incomingCount, ALL paths were non-taken → skip.
      // When passiveDecrements < incomingCount, at least one active path → READY.
      const incomingCount = this._dag.edges.filter(e => (e.target || e.targetNodeId) === targetId).length;
      if (incomingCount > 1) {
        const passive = (this._passiveDecrements.get(targetId) || 0) + 1;
        this._passiveDecrements.set(targetId, passive);

        const newDegree = (this._inDegree.get(targetId) || 1) - 1;
        this._inDegree.set(targetId, newDegree);
        if (newDegree === 0) {
          if (passive === incomingCount) {
            // Every incoming path was a non-taken branch → skip the merge node and propagate
            if (sm.canTransition('skip_branch')) sm.transition('skip_branch');
            else if (sm.canTransition('cancel')) sm.transition('cancel');
            this._metrics.nodesSkipped++;
            this._nodeResults.set(targetId, { status: 'SKIPPED', reason: 'All upstream paths skipped' });
            this.emit('node:stateChange', { nodeId: targetId, from: 'PENDING', to: 'SKIPPED' });
            for (const edge of this._dag.edges) {
              if ((edge.source || edge.sourceNodeId) === targetId) {
                this._skipUnreachable(edge.target || edge.targetNodeId, conditionNodeId);
              }
            }
          } else {
            // At least one active propagation reached this merge node → mark READY
            if (sm.canTransition('deps_satisfied')) {
              sm.transition('deps_satisfied');
              this.emit('node:stateChange', { nodeId: targetId, from: 'PENDING', to: 'READY' });
            }
          }
        }
        return;
      }

      // Single-input node: safe to skip
      if (sm.canTransition('skip_branch')) {
        sm.transition('skip_branch');
      } else if (sm.canTransition('cancel')) {
        sm.transition('cancel');
      }
      this._metrics.nodesSkipped++;

      this._nodeResults.set(targetId, {
        status: 'SKIPPED',
        reason: `Untaken branch from ${conditionNodeId}`
      });

      this.emit('node:stateChange', {
        nodeId: targetId,
        from: 'PENDING',
        to: 'SKIPPED'
      });

      // For each downstream node: either skip it (if all upstream skipped)
      // or decrement its inDegree (merge node with one skipped branch)
      for (const edge of this._dag.edges) {
        const edgeSource = edge.source || edge.sourceNodeId;
        if (edgeSource === targetId) {
          const downstreamId = edge.target || edge.targetNodeId;
          if (this._allUpstreamSkipped(downstreamId)) {
            this._skipUnreachable(downstreamId, conditionNodeId);
          } else {
            // Merge node: decrement inDegree since this skipped branch will never fire
            const newDegree = (this._inDegree.get(downstreamId) || 1) - 1;
            this._inDegree.set(downstreamId, newDegree);
            if (newDegree === 0) {
              const downSm = this._nodeStates.get(downstreamId);
              if (downSm && downSm.state === NodeState.PENDING && downSm.canTransition('deps_satisfied')) {
                downSm.transition('deps_satisfied');
                this.emit('node:stateChange', { nodeId: downstreamId, from: 'PENDING', to: 'READY' });
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check if all upstream nodes of a given node are skipped/cancelled
   * @private
   */
  _allUpstreamSkipped(nodeId) {
    for (const edge of this._dag.edges) {
      const edgeTarget = edge.target || edge.targetNodeId;
      if (edgeTarget === nodeId) {
        const sourceId = edge.source || edge.sourceNodeId;
        const sourceSm = this._nodeStates.get(sourceId);
        if (!sourceSm) continue;
        if (sourceSm.state !== NodeState.SKIPPED && sourceSm.state !== NodeState.CANCELLED) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Called when a node fails permanently
   * @private
   */
  _onNodeFailed(nodeId) {
    if (this._config.failureStrategy === FailureStrategy.FAIL_FAST) {
      // Cancel all downstream nodes
      const downstream = this._dataFlowManager.getAllDownstreamNodes(nodeId);

      for (const downstreamId of downstream) {
        const sm = this._nodeStates.get(downstreamId);
        if (sm && !sm.isTerminal && sm.state !== NodeState.EXECUTING) {
          // Cancel if not already terminal or executing
          if (sm.canTransition('cancel')) {
            sm.transition('cancel');
            this._metrics.nodesCancelled++;

            this._nodeResults.set(downstreamId, {
              status: 'CANCELLED',
              reason: `Upstream node ${nodeId} failed`
            });

            this.emit('scheduler:decision', {
              nodeId: downstreamId,
              action: 'CANCEL',
              reason: `Upstream node ${nodeId} failed`
            });

            this.emit('node:stateChange', {
              nodeId: downstreamId,
              from: sm.state,
              to: 'CANCELLED'
            });
          }
        }
      }
    } else {
      // CONTINUE_ON_ERROR: decrement inDegree of downstream nodes so they can proceed
      // with partial input (the failed node's output will be absent but execution continues)
      for (const edge of this._dag.edges) {
        const edgeSource = edge.source || edge.sourceNodeId;
        const edgeTarget = edge.target || edge.targetNodeId;

        if (edgeSource === nodeId) {
          const targetId = edgeTarget;
          const newDegree = (this._inDegree.get(targetId) || 1) - 1;
          this._inDegree.set(targetId, newDegree);

          if (newDegree === 0) {
            const targetSm = this._nodeStates.get(targetId);
            if (targetSm && targetSm.state === NodeState.PENDING) {
              targetSm.transition('deps_satisfied');

              this.emit('node:stateChange', {
                nodeId: targetId,
                from: 'PENDING',
                to: 'READY'
              });
            }
          }
        }
      }

      // Schedule any newly ready nodes
      this.scheduleReadyNodes();
    }

    // Check completion (might resolve with partial failure)
    this._checkCompletion();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETION DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if execution is complete
   * @private
   */
  _checkCompletion() {
    // Not complete if there are active executions
    if (this._activePromises.size > 0) {
      return;
    }

    // Check if all nodes are in terminal state or waiting for input
    let allTerminal = true;
    let hasReady = false;
    let hasWaiting = false;
    let hasPending = false;

    for (const [nodeId, sm] of this._nodeStates) {
      if (!sm.isTerminal) {
        allTerminal = false;
        if (sm.state === NodeState.READY) {
          hasReady = true;
        }
        if (sm.state === NodeState.WAITING_INPUT) {
          hasWaiting = true;
        }
        if (sm.state === NodeState.PENDING) {
          hasPending = true;
        }
      }
    }

    // If there are READY nodes, schedule them
    if (hasReady) {
      this.scheduleReadyNodes();
      return;
    }

    // If nodes are waiting for input, resolve with WAITING status
    if (hasWaiting && !hasReady) {
      this._pauseExecution();
      return;
    }

    // If PENDING nodes remain but nothing is active/ready/waiting,
    // they are unreachable (untaken conditional branches). Mark as SKIPPED.
    if (hasPending && !hasReady && !hasWaiting) {
      for (const [nodeId, sm] of this._nodeStates) {
        if (sm.state === NodeState.PENDING) {
          if (sm.canTransition('skip_branch')) {
            sm.transition('skip_branch');
          } else if (sm.canTransition('cancel')) {
            sm.transition('cancel');
          }
          this._metrics.nodesSkipped++;
          this._nodeResults.set(nodeId, {
            status: 'SKIPPED',
            reason: 'Unreachable after conditional branching'
          });
        }
      }
      allTerminal = true;
    }

    // If all terminal, complete
    if (allTerminal) {
      this._completeExecution();
    }
  }

  /**
   * Pause execution due to nodes waiting for input
   * @private
   */
  _pauseExecution() {
    const totalDurationMs = Date.now() - this._startTime;

    const executionResult = {
      status: 'WAITING_FOR_INPUT',
      waitingNodes: Object.fromEntries(this._waitingNodes),
      metrics: {
        ...this._metrics,
        totalDurationMs,
        totalNodes: this._dag.nodes.length
      },
      nodeResults: Object.fromEntries(this._nodeResults)
    };

    this.emit('execution:waitingForInput', executionResult);
    this._completion.resolveOnce(executionResult);
  }

  /**
   * Complete the execution
   * @private
   */
  _completeExecution() {
    const totalDurationMs = Date.now() - this._startTime;

    // Collect exit node outputs
    const outputs = {};
    for (const exitNodeId of this._exitNodes) {
      const result = this._nodeResults.get(exitNodeId);
      if (result?.status === 'SUCCEEDED') {
        outputs[exitNodeId] = result.output;
      }
    }

    const executionResult = {
      status: this._metrics.nodesFailed > 0 ? 'PARTIAL_FAILURE' : 'COMPLETED',
      outputs,
      metrics: {
        ...this._metrics,
        totalDurationMs,
        totalNodes: this._dag.nodes.length
      },
      nodeResults: Object.fromEntries(this._nodeResults)
    };

    if (this._metrics.nodesFailed === 0) {
      this.emit('execution:completed', executionResult);
      this._completion.resolveOnce(executionResult);
    } else {
      this.emit('execution:failed', {
        ...executionResult,
        failedNodes: Array.from(this._nodeResults.entries())
          .filter(([_, r]) => r.status === 'FAILED')
          .map(([id]) => id)
      });

      // Still resolve, not reject - let caller decide if partial failure is acceptable
      this._completion.resolveOnce(executionResult);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start execution and return completion promise
   * @returns {Promise<Object>}
   */
  async start() {
    this.initialize();
    this.scheduleReadyNodes();
    return this._completion.promise;
  }

  /**
   * Get current progress
   * @returns {Object}
   */
  getProgress() {
    const completed = this._metrics.nodesSucceeded +
                      this._metrics.nodesFailed +
                      this._metrics.nodesSkipped +
                      this._metrics.nodesCancelled;
    const total = this._dag.nodes.length;

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      active: this._activePromises.size,
      metrics: { ...this._metrics }
    };
  }

  /**
   * Get all node states
   * @returns {Object}
   */
  getNodeStates() {
    const states = {};
    for (const [nodeId, sm] of this._nodeStates) {
      states[nodeId] = {
        state: sm.state,
        attempt: sm.attempt,
        isTerminal: sm.isTerminal
      };
    }
    return states;
  }

  /**
   * Get active node count
   * @returns {number}
   */
  get activeCount() {
    return this._activePromises.size;
  }

  /**
   * Get completed count
   * @returns {number}
   */
  get completedCount() {
    return this._metrics.nodesSucceeded +
           this._metrics.nodesFailed +
           this._metrics.nodesSkipped +
           this._metrics.nodesCancelled;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Emit progress event
   * @private
   */
  _emitProgress() {
    this.emit('execution:progress', this.getProgress());
  }

  /**
   * Delay helper
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  TopologicalScheduler,
  SchedulerStrategy,
  FailureStrategy,
  Deferred
};
