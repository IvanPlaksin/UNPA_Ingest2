/**
 * ConcurrencyGovernor
 *
 * Controls how many executions can run concurrently:
 *   - Global limit (total running across all graphs)
 *   - Per-graph limit
 *   - Per-priority limit
 *   - Resource rate limiting (LLM calls/min, GNN calls/min, etc.)
 *
 * Uses Redis sorted sets for sliding-window rate limiting.
 *
 * @module gxe-manager/ConcurrencyGovernor
 */

const { ExecutionStatus } = require('./types/execution.types');

const LOG_TAG = '[ConcurrencyGovernor]';

const DEFAULT_CONFIG = {
  globalMaxConcurrent: 50,
  perGraphMaxConcurrent: 10,
  perPriorityLimits: {
    CRITICAL: 15,
    HIGH: 20,
    NORMAL: 30,
    LOW: 10,
    BACKGROUND: 5
  },
  resourceQuotas: {
    llm: 100,    // calls per minute
    gnn: 50,
    memgraph: 200
  }
};

const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

class ConcurrencyGovernor {
  /**
   * @param {import('./ExecutionRegistry').ExecutionRegistry} registry
   * @param {import('ioredis').Redis} redisClient
   * @param {Object} [config]
   */
  constructor(registry, redisClient, config = {}) {
    this.registry = registry;
    this.redis = redisClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (config.perPriorityLimits) {
      this.config.perPriorityLimits = { ...DEFAULT_CONFIG.perPriorityLimits, ...config.perPriorityLimits };
    }
    if (config.resourceQuotas) {
      this.config.resourceQuotas = { ...DEFAULT_CONFIG.resourceQuotas, ...config.resourceQuotas };
    }
  }

  /**
   * Check if a new execution can start
   * @param {string} graphId
   * @param {string} [priority='NORMAL']
   * @returns {Promise<{allowed: boolean, reason?: string}>}
   */
  async canStart(graphId, priority = 'NORMAL') {
    // Check global limit
    const globalCheck = await this._checkGlobalLimit();
    if (!globalCheck.allowed) return globalCheck;

    // Check per-graph limit
    const graphCheck = await this._checkGraphLimit(graphId);
    if (!graphCheck.allowed) return graphCheck;

    // Check per-priority limit
    const priorityCheck = await this._checkPriorityLimit(priority);
    if (!priorityCheck.allowed) return priorityCheck;

    return { allowed: true };
  }

  async _checkGlobalLimit() {
    const counts = await this.registry.countByStatus();
    const running = (counts[ExecutionStatus.RUNNING] || 0)
      + (counts[ExecutionStatus.INITIALIZING] || 0);

    if (running >= this.config.globalMaxConcurrent) {
      return { allowed: false, reason: `Global limit reached (${running}/${this.config.globalMaxConcurrent})` };
    }
    return { allowed: true };
  }

  async _checkGraphLimit(graphId) {
    const active = await this.registry.getActiveByGraph(graphId);
    const running = active.filter(r =>
      r.status === ExecutionStatus.RUNNING || r.status === ExecutionStatus.INITIALIZING
    ).length;

    if (running >= this.config.perGraphMaxConcurrent) {
      return { allowed: false, reason: `Per-graph limit reached for ${graphId} (${running}/${this.config.perGraphMaxConcurrent})` };
    }
    return { allowed: true };
  }

  async _checkPriorityLimit(priority) {
    const limit = this.config.perPriorityLimits[priority];
    if (!limit) return { allowed: true };

    // Count running executions at this priority level via Redis
    const key = `gxe:by-priority:${priority}`;
    const count = await this.redis.zcard(key);

    if (count >= limit) {
      return { allowed: false, reason: `Priority limit reached for ${priority} (${count}/${limit})` };
    }
    return { allowed: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE RATE LIMITING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a resource call is within rate limits
   * @param {string} resourceType - 'llm' | 'gnn' | 'memgraph'
   * @returns {Promise<boolean>}
   */
  async checkResourceQuota(resourceType) {
    const limit = this.config.resourceQuotas[resourceType];
    if (!limit) return true;

    const key = `gxe:rate:${resourceType}`;
    const now = Date.now();

    // Sliding window: remove expired, count current
    await this.redis.zremrangebyscore(key, 0, now - RATE_LIMIT_WINDOW_MS);
    const count = await this.redis.zcard(key);

    return count < limit;
  }

  /**
   * Record a resource usage event
   * @param {string} resourceType
   */
  async recordResourceUsage(resourceType) {
    const key = `gxe:rate:${resourceType}`;
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).substr(2, 6)}`;

    await this.redis.zadd(key, now, member);
    await this.redis.expire(key, 120); // 2 min TTL for cleanup
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPACITY REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get a snapshot of current capacity
   * @returns {Promise<Object>}
   */
  async getCapacityReport() {
    const counts = await this.registry.countByStatus();
    const running = (counts[ExecutionStatus.RUNNING] || 0)
      + (counts[ExecutionStatus.INITIALIZING] || 0);

    const resourceUsage = {};
    for (const type of Object.keys(this.config.resourceQuotas)) {
      const key = `gxe:rate:${type}`;
      await this.redis.zremrangebyscore(key, 0, Date.now() - RATE_LIMIT_WINDOW_MS);
      const current = await this.redis.zcard(key);
      resourceUsage[type] = {
        current,
        limit: this.config.resourceQuotas[type],
        available: this.config.resourceQuotas[type] - current
      };
    }

    return {
      global: {
        running,
        limit: this.config.globalMaxConcurrent,
        available: Math.max(0, this.config.globalMaxConcurrent - running)
      },
      executionCounts: counts,
      resourceUsage,
      limits: this.config,
      timestamp: Date.now()
    };
  }

  /**
   * Wait until capacity is available (with timeout)
   * @param {string} graphId
   * @param {string} priority
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<boolean>}
   */
  async waitForCapacity(graphId, priority, timeoutMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.canStart(graphId, priority);
      if (result.allowed) return true;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return false;
  }
}

module.exports = { ConcurrencyGovernor };
