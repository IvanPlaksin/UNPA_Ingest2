/**
 * RetryPolicy
 *
 * Configurable retry policy with multiple backoff strategies.
 * Extracted from TopologicalScheduler for reusability.
 * Part of GXE Runtime Environment P1.
 *
 * @module runtime/resilience/RetryPolicy
 */

// ═══════════════════════════════════════════════════════════════════════════
// BACKOFF TYPES
// ═══════════════════════════════════════════════════════════════════════════

const BackoffType = {
  EXPONENTIAL: 'EXPONENTIAL',
  LINEAR: 'LINEAR',
  FIXED: 'FIXED'
};

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT RETRYABLE ERRORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Errors that are retryable by default.
 * NODE_TIMEOUT and EXECUTION_ERROR can succeed on retry (transient failures).
 */
const DEFAULT_RETRYABLE_ERRORS = new Set([
  'NODE_TIMEOUT',
  'EXECUTION_ERROR',
  'PROPAGATION_ERROR'
]);

/**
 * Errors that are NOT retryable (retry won't help).
 */
const NON_RETRYABLE_ERRORS = new Set([
  'TOOL_NOT_FOUND',
  'INVALID_INPUT',
  'INVALID_OUTPUT'
]);

// ═══════════════════════════════════════════════════════════════════════════
// RETRY POLICY CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configurable retry policy with backoff
 */
class RetryPolicy {
  /**
   * Default configuration
   */
  static DEFAULT_CONFIG = {
    maxAttempts: 3,
    backoffType: BackoffType.EXPONENTIAL,
    baseDelayMs: 1000,
    maxDelayMs: 15000,
    jitter: true,
    retryableErrors: null // null = use defaults
  };

  /**
   * @param {Object} config
   * @param {number} [config.maxAttempts=3] - Maximum number of attempts
   * @param {string} [config.backoffType='EXPONENTIAL'] - Backoff strategy
   * @param {number} [config.baseDelayMs=1000] - Base delay in milliseconds
   * @param {number} [config.maxDelayMs=15000] - Maximum delay in milliseconds
   * @param {boolean} [config.jitter=true] - Add random jitter to delay
   * @param {Set<string>|null} [config.retryableErrors=null] - Set of retryable error codes
   */
  constructor(config = {}) {
    this._config = {
      ...RetryPolicy.DEFAULT_CONFIG,
      ...config
    };

    // Convert array to Set if provided
    if (Array.isArray(this._config.retryableErrors)) {
      this._config.retryableErrors = new Set(this._config.retryableErrors);
    }

    // Track current attempt (for stateful usage)
    this._currentAttempt = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Determine if an operation should be retried
   *
   * @param {number} attempt - Current attempt number (1-based)
   * @param {Object} error - Error object with code property
   * @param {string} error.code - Error code
   * @returns {boolean}
   */
  shouldRetry(attempt, error) {
    // Check attempt limit
    if (attempt >= this._config.maxAttempts) {
      return false;
    }

    // Get error code
    const errorCode = error?.code || error?.error || (typeof error === 'string' ? error : null);

    if (!errorCode) {
      return false;
    }

    // Check if error is explicitly non-retryable
    if (NON_RETRYABLE_ERRORS.has(errorCode)) {
      return false;
    }

    // Check custom retryable errors if specified
    if (this._config.retryableErrors !== null) {
      return this._config.retryableErrors.has(errorCode);
    }

    // Use default retryable errors
    return DEFAULT_RETRYABLE_ERRORS.has(errorCode);
  }

  /**
   * Calculate delay before next retry
   *
   * @param {number} attempt - Current attempt number (1-based)
   * @returns {number} - Delay in milliseconds
   */
  getDelay(attempt) {
    let delay;

    switch (this._config.backoffType) {
      case BackoffType.EXPONENTIAL:
        // baseDelay * 2^(attempt-1)
        delay = this._config.baseDelayMs * Math.pow(2, attempt - 1);
        break;

      case BackoffType.LINEAR:
        // baseDelay * attempt
        delay = this._config.baseDelayMs * attempt;
        break;

      case BackoffType.FIXED:
      default:
        delay = this._config.baseDelayMs;
        break;
    }

    // Apply max delay cap
    delay = Math.min(delay, this._config.maxDelayMs);

    // Add jitter if enabled
    if (this._config.jitter) {
      const jitterAmount = Math.random() * this._config.baseDelayMs * 0.5;
      delay += jitterAmount;
    }

    return Math.round(delay);
  }

  /**
   * Reset the policy state (for reuse)
   */
  reset() {
    this._currentAttempt = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get maximum attempts
   * @returns {number}
   */
  get maxAttempts() {
    return this._config.maxAttempts;
  }

  /**
   * Get backoff type
   * @returns {string}
   */
  get backoffType() {
    return this._config.backoffType;
  }

  /**
   * Get base delay
   * @returns {number}
   */
  get baseDelayMs() {
    return this._config.baseDelayMs;
  }

  /**
   * Get max delay
   * @returns {number}
   */
  get maxDelayMs() {
    return this._config.maxDelayMs;
  }

  /**
   * Check if jitter is enabled
   * @returns {boolean}
   */
  get jitterEnabled() {
    return this._config.jitter;
  }

  /**
   * Get configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this._config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an error code is retryable
   * @param {string} errorCode
   * @returns {boolean}
   */
  isErrorRetryable(errorCode) {
    if (NON_RETRYABLE_ERRORS.has(errorCode)) {
      return false;
    }

    if (this._config.retryableErrors !== null) {
      return this._config.retryableErrors.has(errorCode);
    }

    return DEFAULT_RETRYABLE_ERRORS.has(errorCode);
  }

  /**
   * Get all delays for all attempts (useful for testing/debugging)
   * @returns {number[]}
   */
  getAllDelays() {
    const delays = [];
    for (let attempt = 1; attempt < this._config.maxAttempts; attempt++) {
      delays.push(this.getDelay(attempt));
    }
    return delays;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a retry policy with exponential backoff
 * @param {number} maxAttempts
 * @param {number} baseDelayMs
 * @returns {RetryPolicy}
 */
function exponentialBackoff(maxAttempts = 3, baseDelayMs = 1000) {
  return new RetryPolicy({
    maxAttempts,
    baseDelayMs,
    backoffType: BackoffType.EXPONENTIAL
  });
}

/**
 * Create a retry policy with linear backoff
 * @param {number} maxAttempts
 * @param {number} baseDelayMs
 * @returns {RetryPolicy}
 */
function linearBackoff(maxAttempts = 3, baseDelayMs = 1000) {
  return new RetryPolicy({
    maxAttempts,
    baseDelayMs,
    backoffType: BackoffType.LINEAR
  });
}

/**
 * Create a retry policy with fixed delay
 * @param {number} maxAttempts
 * @param {number} delayMs
 * @returns {RetryPolicy}
 */
function fixedDelay(maxAttempts = 3, delayMs = 1000) {
  return new RetryPolicy({
    maxAttempts,
    baseDelayMs: delayMs,
    backoffType: BackoffType.FIXED
  });
}

/**
 * Create a no-retry policy
 * @returns {RetryPolicy}
 */
function noRetry() {
  return new RetryPolicy({ maxAttempts: 1 });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  RetryPolicy,
  BackoffType,
  DEFAULT_RETRYABLE_ERRORS,
  NON_RETRYABLE_ERRORS,
  exponentialBackoff,
  linearBackoff,
  fixedDelay,
  noRetry
};
