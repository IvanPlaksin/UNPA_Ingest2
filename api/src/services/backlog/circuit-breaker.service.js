/**
 * Circuit Breaker Service — prevents anomalous token consumption.
 *
 * Monitors token usage per cycle against estimated budgets.
 * Three levels: WARNING → THROTTLE → BREAK
 * Emits events for notification system.
 */

'use strict';

const EventEmitter = require('events');

let _tokenTracker = null;
function tracker() {
  if (!_tokenTracker) _tokenTracker = require('./token-tracker.service');
  return _tokenTracker;
}

let _complexity = null;
function complexity() {
  if (!_complexity) _complexity = require('./complexity-estimator');
  return _complexity;
}

const STATES = { CLOSED: 'CLOSED', WARNING: 'WARNING', THROTTLE: 'THROTTLE', OPEN: 'OPEN' };

class CircuitBreakerService extends EventEmitter {
  constructor() {
    super();
    this._states = new Map(); // cycleId → state
    this._globalLimit = 500_000; // absolute max tokens per cycle
    this._globalCostLimit = 5.0; // absolute max USD per cycle
  }

  /**
   * Check if a cycle should be allowed to continue
   */
  async check(cycleId) {
    const usage = await tracker().getCycleUsage(cycleId);
    const state = this._getState(cycleId);

    // Get estimated budget from complexity
    let budget = null;
    try {
      const cycleService = require('./execution-cycle.service');
      const cycle = await cycleService.getCycle(cycleId);
      if (cycle) {
        const comp = await complexity().getComplexity(cycle.backlogId);
        if (comp) {
          budget = complexity().estimateTokenBudget(comp.score);
        }
      }
    } catch { /* no budget available */ }

    const warningThreshold = budget?.warningThreshold || Math.round(this._globalLimit * 0.6);
    const breakerThreshold = budget?.breakerThreshold || this._globalLimit;

    const result = {
      cycleId,
      currentTokens: usage.totalTokens,
      currentCost: usage.totalCost,
      callCount: usage.callCount,
      budget: budget ? { estimated: budget.estimatedBudget, warning: warningThreshold, breaker: breakerThreshold } : null,
      globalLimit: this._globalLimit,
      state: STATES.CLOSED
    };

    // Check thresholds
    if (usage.totalTokens >= breakerThreshold || usage.totalCost >= this._globalCostLimit) {
      result.state = STATES.OPEN;
      this._setState(cycleId, STATES.OPEN);
      this.emit('breaker', { level: 'BREAK', cycleId, tokens: usage.totalTokens, cost: usage.totalCost, threshold: breakerThreshold });
    } else if (usage.totalTokens >= warningThreshold) {
      result.state = STATES.WARNING;
      this._setState(cycleId, STATES.WARNING);
      if (state !== STATES.WARNING) {
        this.emit('breaker', { level: 'WARNING', cycleId, tokens: usage.totalTokens, cost: usage.totalCost, threshold: warningThreshold });
      }
    } else {
      this._setState(cycleId, STATES.CLOSED);
    }

    result.allowed = result.state !== STATES.OPEN;
    return result;
  }

  /**
   * Force reset breaker for a cycle (admin override)
   */
  reset(cycleId) {
    this._states.delete(cycleId);
    this.emit('breaker', { level: 'RESET', cycleId });
    return { cycleId, state: STATES.CLOSED };
  }

  /**
   * Set global limits
   */
  setLimits({ maxTokens, maxCost } = {}) {
    if (maxTokens) this._globalLimit = maxTokens;
    if (maxCost) this._globalCostLimit = maxCost;
    return { maxTokens: this._globalLimit, maxCost: this._globalCostLimit };
  }

  /**
   * Get current limits
   */
  getLimits() {
    return { maxTokens: this._globalLimit, maxCost: this._globalCostLimit };
  }

  _getState(cycleId) {
    return this._states.get(cycleId) || STATES.CLOSED;
  }

  _setState(cycleId, state) {
    this._states.set(cycleId, state);
  }
}

module.exports = new CircuitBreakerService();
