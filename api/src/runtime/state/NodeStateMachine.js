/**
 * NodeStateMachine
 *
 * FSM for individual node execution lifecycle. Manages 9 states.
 * Part of GXE Runtime Environment P0.
 *
 * States: PENDING → READY → QUEUED → EXECUTING → SUCCEEDED
 * With branching for RETRYING, FAILED, SKIPPED, CANCELLED
 *
 * @module runtime/state/NodeStateMachine
 */

const { BaseFSM } = require('./BaseFSM');

// ═══════════════════════════════════════════════════════════════════════════
// NODE STATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'PENDING'|'READY'|'QUEUED'|'EXECUTING'|'RETRYING'|'SUCCEEDED'|'FAILED'|'SKIPPED'|'CANCELLED'} NodeState
 */

const NodeState = {
  // Active states
  PENDING: 'PENDING',
  READY: 'READY',
  QUEUED: 'QUEUED',
  EXECUTING: 'EXECUTING',
  RETRYING: 'RETRYING',
  WAITING_INPUT: 'WAITING_INPUT',
  // Terminal states
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED'
};

const TERMINAL_STATES = new Set([
  NodeState.SUCCEEDED,
  NodeState.FAILED,
  NodeState.SKIPPED,
  NodeState.CANCELLED
]);

const ACTIVE_STATES = new Set([
  NodeState.EXECUTING,
  NodeState.RETRYING,
  NodeState.WAITING_INPUT
]);

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION TABLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build transition table with access to instance (for actions)
 * @returns {import('./BaseFSM').TransitionRule[]}
 */
function buildTransitionTable() {
  return [
    // Dependencies satisfied → ready to be scheduled
    { from: 'PENDING', to: 'READY', trigger: 'deps_satisfied' },
    { from: 'PENDING', to: 'CANCELLED', trigger: 'cancel' },
    { from: 'PENDING', to: 'SKIPPED', trigger: 'skip_branch' },

    // Scheduler picks up node
    { from: 'READY', to: 'QUEUED', trigger: 'scheduled' },
    { from: 'READY', to: 'SKIPPED', trigger: 'condition_false' },

    // Execution
    { from: 'QUEUED', to: 'EXECUTING', trigger: 'execute' },
    { from: 'QUEUED', to: 'CANCELLED', trigger: 'cancel' },

    // Execution outcomes
    { from: 'EXECUTING', to: 'SUCCEEDED', trigger: 'success' },
    {
      from: 'EXECUTING',
      to: 'FAILED',
      trigger: 'error',
      guard: (ctx) => ctx?.retriesExhausted === true
    },
    {
      from: 'EXECUTING',
      to: 'RETRYING',
      trigger: 'error',
      guard: (ctx) => ctx?.retriesExhausted !== true
    },
    { from: 'EXECUTING', to: 'CANCELLED', trigger: 'cancel' },

    // Retry
    {
      from: 'RETRYING',
      to: 'EXECUTING',
      trigger: 'retry',
      // Action increments attempt counter - 'this' is bound to instance in BaseFSM
      action: function() { this._attempt++; }
    },

    // Wait for input
    { from: 'EXECUTING', to: 'WAITING_INPUT', trigger: 'wait_input' },
    { from: 'WAITING_INPUT', to: 'EXECUTING', trigger: 'input_received' },
    { from: 'WAITING_INPUT', to: 'CANCELLED', trigger: 'cancel' },
    { from: 'WAITING_INPUT', to: 'FAILED', trigger: 'wait_timeout' }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE STATE MACHINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Finite State Machine for individual node execution
 * @extends BaseFSM
 */
class NodeStateMachine extends BaseFSM {
  /**
   * @param {string} nodeId - Unique node identifier
   * @param {NodeState} [initialState='PENDING'] - Initial state
   */
  constructor(nodeId, initialState = NodeState.PENDING) {
    super(initialState, buildTransitionTable(), TERMINAL_STATES, ACTIVE_STATES);

    /** @type {string} */
    this._nodeId = nodeId;

    /** @type {number} */
    this._attempt = 1; // First attempt = 1

    /** @type {Object|null} */
    this._lastError = null;

    /** @type {number|null} */
    this._startedAt = null;

    /** @type {number|null} */
    this._completedAt = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get node ID
   * @returns {string}
   */
  get nodeId() {
    return this._nodeId;
  }

  /**
   * Get current attempt number (starts at 1)
   * @returns {number}
   */
  get attempt() {
    return this._attempt;
  }

  /**
   * Get last error if any
   * @returns {Object|null}
   */
  get lastError() {
    return this._lastError;
  }

  /**
   * Check if retries are exhausted
   * @param {number} maxRetries - Maximum retry count
   * @returns {boolean}
   */
  retriesExhausted(maxRetries) {
    return this._attempt >= maxRetries;
  }

  /**
   * Get execution duration (if started)
   * @returns {number|null}
   */
  get executionDurationMs() {
    if (!this._startedAt) return null;
    const end = this._completedAt || Date.now();
    return end - this._startedAt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERRIDES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Override transition to track execution timing
   * @param {string} trigger
   * @param {Object} [ctx]
   * @returns {Promise<boolean>}
   */
  async transition(trigger, ctx = null) {
    // Track execution start
    if (trigger === 'execute' && this._state === 'QUEUED') {
      this._startedAt = Date.now();
    }

    // Track error for retry context
    if (trigger === 'error' && ctx?.error) {
      this._lastError = ctx.error;
    }

    const result = await super.transition(trigger, ctx);

    // Track completion time for terminal states
    if (result && TERMINAL_STATES.has(this._state)) {
      this._completedAt = Date.now();
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Serialize to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      nodeId: this._nodeId,
      attempt: this._attempt,
      lastError: this._lastError,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      executionDurationMs: this.executionDurationMs
    };
  }

  /**
   * Restore from JSON
   * @param {Object} json
   * @returns {NodeStateMachine}
   */
  static fromJSON(json) {
    const sm = new NodeStateMachine(json.nodeId, json.state);
    sm._history = json.history || [];
    sm._createdAt = json.createdAt || Date.now();
    sm._attempt = json.attempt || 1;
    sm._lastError = json.lastError || null;
    sm._startedAt = json.startedAt || null;
    sm._completedAt = json.completedAt || null;
    return sm;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  NodeStateMachine,
  NodeState,
  TERMINAL_STATES,
  ACTIVE_STATES
};
