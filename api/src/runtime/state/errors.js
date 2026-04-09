/**
 * Runtime State Machine Errors
 * @module runtime/state/errors
 */

/**
 * Error thrown when an invalid state transition is attempted
 */
class InvalidTransitionError extends Error {
  /**
   * @param {string} from - Current state
   * @param {string} trigger - Attempted trigger
   * @param {string} [message] - Optional custom message
   */
  constructor(from, trigger, message) {
    super(message || `Invalid transition: cannot trigger '${trigger}' from state '${from}'`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.trigger = trigger;
  }
}

/**
 * Error thrown when guard condition fails
 */
class GuardFailedError extends Error {
  /**
   * @param {string} from - Current state
   * @param {string} to - Target state
   * @param {string} trigger - Trigger that was attempted
   */
  constructor(from, to, trigger) {
    super(`Guard failed for transition ${from} -> ${to} (trigger: '${trigger}')`);
    this.name = 'GuardFailedError';
    this.from = from;
    this.to = to;
    this.trigger = trigger;
  }
}

module.exports = {
  InvalidTransitionError,
  GuardFailedError
};
