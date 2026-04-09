/**
 * ExecutionStateMachine
 *
 * FSM for graph execution lifecycle. Manages 10 states with defined transitions.
 * Part of GXE Runtime Environment P0.
 *
 * States: CREATED → INITIALIZING → READY → RUNNING → COMPLETED
 * With branching for PAUSED, WAITING, FAILED, CANCELLED, TIMED_OUT
 *
 * @module runtime/state/ExecutionStateMachine
 */

const { BaseFSM } = require('./BaseFSM');

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION STATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'CREATED'|'INITIALIZING'|'READY'|'RUNNING'|'PAUSED'|'WAITING'|'COMPLETED'|'FAILED'|'CANCELLED'|'TIMED_OUT'} ExecutionState
 */

const ExecutionState = {
  // Preparatory states
  CREATED: 'CREATED',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  // Active states
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  WAITING: 'WAITING',
  // Terminal states
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT'
};

const TERMINAL_STATES = new Set([
  ExecutionState.COMPLETED,
  ExecutionState.FAILED,
  ExecutionState.CANCELLED,
  ExecutionState.TIMED_OUT
]);

const ACTIVE_STATES = new Set([
  ExecutionState.RUNNING,
  ExecutionState.WAITING
]);

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION TABLE
// ═══════════════════════════════════════════════════════════════════════════

/** @type {import('./BaseFSM').TransitionRule[]} */
const TRANSITION_TABLE = [
  // Preparatory transitions
  { from: 'CREATED', to: 'INITIALIZING', trigger: 'initialize' },
  { from: 'INITIALIZING', to: 'READY', trigger: 'initialized', guard: (ctx) => ctx?.validationPassed !== false },
  { from: 'INITIALIZING', to: 'FAILED', trigger: 'validation_failed', guard: (ctx) => ctx?.validationPassed === false },

  // Start execution
  { from: 'READY', to: 'RUNNING', trigger: 'start' },

  // Running transitions
  { from: 'RUNNING', to: 'RUNNING', trigger: 'node_completed' }, // Self-loop
  { from: 'RUNNING', to: 'PAUSED', trigger: 'pause' },
  { from: 'RUNNING', to: 'WAITING', trigger: 'await_signal' },
  { from: 'RUNNING', to: 'COMPLETED', trigger: 'all_exits_done', guard: (ctx) => ctx?.allExitNodesCompleted !== false },
  { from: 'RUNNING', to: 'FAILED', trigger: 'unrecoverable_error' },
  { from: 'RUNNING', to: 'TIMED_OUT', trigger: 'global_timeout' },
  { from: 'RUNNING', to: 'CANCELLED', trigger: 'cancel' },

  // Paused transitions
  { from: 'PAUSED', to: 'RUNNING', trigger: 'resume' },
  { from: 'PAUSED', to: 'CANCELLED', trigger: 'cancel' },

  // Waiting transitions
  { from: 'WAITING', to: 'RUNNING', trigger: 'signal_received' },
  { from: 'WAITING', to: 'CANCELLED', trigger: 'cancel' },
  { from: 'WAITING', to: 'TIMED_OUT', trigger: 'signal_timeout' },

  // Restart from terminal states
  { from: 'COMPLETED', to: 'CREATED', trigger: 'restart' },
  { from: 'FAILED', to: 'CREATED', trigger: 'restart' },
  { from: 'CANCELLED', to: 'CREATED', trigger: 'restart' },
  { from: 'TIMED_OUT', to: 'CREATED', trigger: 'restart' }
];

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION STATE MACHINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Finite State Machine for graph execution lifecycle
 * @extends BaseFSM
 */
class ExecutionStateMachine extends BaseFSM {
  /**
   * @param {ExecutionState} [initialState='CREATED'] - Initial state
   */
  constructor(initialState = ExecutionState.CREATED) {
    super(initialState, TRANSITION_TABLE, TERMINAL_STATES, ACTIVE_STATES);
  }

  /**
   * Restore state machine from JSON
   * @param {Object} json - Serialized state
   * @returns {ExecutionStateMachine}
   */
  static fromJSON(json) {
    const sm = new ExecutionStateMachine(json.state);
    sm._history = json.history || [];
    sm._createdAt = json.createdAt || Date.now();
    return sm;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ExecutionStateMachine,
  ExecutionState,
  TERMINAL_STATES,
  ACTIVE_STATES,
  TRANSITION_TABLE
};
