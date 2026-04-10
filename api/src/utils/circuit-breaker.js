/**
 * Circuit Breaker (PH-007)
 *
 * Prevents cascading failures when an external service (Memgraph, Qdrant, GNN)
 * is temporarily unavailable. Three states:
 *
 *   CLOSED   → Normal operation. Failures are counted.
 *   OPEN     → Service considered down. Calls short-circuit to fallback.
 *              Transitions to HALF_OPEN after resetTimeout.
 *   HALF_OPEN → Allows a limited number of trial requests.
 *              Success → CLOSED. Failure → back to OPEN.
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 15000 });
 *   const result = await breaker.execute(
 *     () => memgraph.runQuery('MATCH ...'),       // primary
 *     () => []                                     // fallback
 *   );
 *
 * @module utils/circuit-breaker
 */

'use strict';

class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} [options.failureThreshold=5]  Consecutive failures before opening
   * @param {number} [options.resetTimeout=30000]  ms to wait before half-open
   * @param {number} [options.halfOpenMax=1]        Trial requests in half-open state
   * @param {string} [options.name='unnamed']       Label for logging
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.halfOpenMax = options.halfOpenMax ?? 1;
    this.name = options.name || 'unnamed';

    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureAt = 0;
    this.halfOpenAttempts = 0;
  }

  /**
   * Execute a function through the circuit breaker.
   * @param {Function} fn        The primary operation (async)
   * @param {Function} [fallback] Optional fallback when circuit is OPEN
   * @returns {Promise<*>}
   */
  async execute(fn, fallback) {
    // OPEN → check if enough time has passed to try half-open
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureAt >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
      } else {
        // Still OPEN — use fallback
        if (typeof fallback === 'function') return fallback();
        throw new Error(`CircuitBreaker [${this.name}] is OPEN — service unavailable`);
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      if (typeof fallback === 'function') return fallback();
      throw error;
    }
  }

  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.halfOpenMax) {
        this.state = 'CLOSED';
        this.failures = 0;
        console.log(`[CircuitBreaker:${this.name}] HALF_OPEN → CLOSED (recovered)`);
      }
    } else {
      this.failures = 0;
    }
  }

  _onFailure() {
    this.failures++;
    this.lastFailureAt = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker:${this.name}] HALF_OPEN → OPEN (trial failed)`);
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker:${this.name}] CLOSED → OPEN (${this.failures} consecutive failures)`);
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt ? new Date(this.lastFailureAt).toISOString() : null
    };
  }

  /** Force reset to CLOSED (e.g. after manual recovery) */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureAt = 0;
    this.halfOpenAttempts = 0;
  }
}

// ──────────────────────────────────────────────────────────────────
// Registry — named singletons for each service
// ──────────────────────────────────────────────────────────────────

const _registry = new Map();

/**
 * Get or create a named circuit breaker (singleton per name).
 */
function getCircuitBreaker(name, options = {}) {
  if (!_registry.has(name)) {
    _registry.set(name, new CircuitBreaker({ name, ...options }));
  }
  return _registry.get(name);
}

/**
 * Get all circuit breaker states.
 */
function getAllStates() {
  const states = {};
  for (const [name, breaker] of _registry) {
    states[name] = breaker.getState();
  }
  return states;
}

module.exports = { CircuitBreaker, getCircuitBreaker, getAllStates };
