/**
 * ExecutionRegistry
 *
 * Three-tier storage for execution records:
 *   1. In-memory Map (hot cache for active executions)
 *   2. Redis Hash + Sorted Sets (durable hot state, survives restart)
 *   3. Memgraph (cold storage for completed executions, queryable)
 *
 * Redis key layout:
 *   gxe:exec:{id}             — Hash with ExecutionRecord fields
 *   gxe:active                — Set of active executionIds
 *   gxe:by-status:{status}    — Sorted Set (score = timestamp)
 *   gxe:by-graph:{graphId}    — Sorted Set (score = createdAt)
 *   gxe:resume-token:{token}  — String → executionId:nodeId (with TTL)
 *
 * @module gxe-manager/ExecutionRegistry
 */

const { EventEmitter } = require('node:events');
const { ExecutionStatus, TERMINAL_STATUSES, ACTIVE_STATUSES } = require('./types/execution.types');

const PREFIX = 'gxe';
const EXEC_KEY = (id) => `${PREFIX}:exec:${id}`;
const ACTIVE_KEY = `${PREFIX}:active`;
const STATUS_KEY = (status) => `${PREFIX}:by-status:${status}`;
const GRAPH_KEY = (graphId) => `${PREFIX}:by-graph:${graphId}`;
const RESUME_TOKEN_KEY = (token) => `${PREFIX}:resume-token:${token}`;

class ExecutionRegistry extends EventEmitter {
  /**
   * @param {import('ioredis').Redis} redisClient - ioredis instance
   * @param {Object} [options]
   * @param {number} [options.cacheMaxSize=1000] - Max in-memory cache entries
   */
  constructor(redisClient, options = {}) {
    super();
    this.redis = redisClient;
    this.cache = new Map();
    this.cacheMaxSize = options.cacheMaxSize || 1000;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a new execution record
   * @param {import('./types/execution.types').ExecutionRecord} record
   */
  async register(record) {
    const { executionId } = record;

    // 1. In-memory cache
    this._cacheSet(executionId, record);

    // 2. Redis Hash
    const flat = this._flatten(record);
    await this.redis.hset(EXEC_KEY(executionId), flat);

    // 3. Redis active set
    if (!TERMINAL_STATUSES.has(record.status)) {
      await this.redis.sadd(ACTIVE_KEY, executionId);
    }

    // 4. Sorted sets for querying
    const ts = record.createdAt || Date.now();
    await this.redis.zadd(STATUS_KEY(record.status), ts, executionId);
    if (record.graphId) {
      await this.redis.zadd(GRAPH_KEY(record.graphId), ts, executionId);
    }

    this.emit('registered', { executionId, status: record.status });
    return record;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get execution record by ID
   * @param {string} executionId
   * @returns {Promise<import('./types/execution.types').ExecutionRecord|null>}
   */
  async get(executionId) {
    // 1. Check cache first
    if (this.cache.has(executionId)) {
      return this.cache.get(executionId);
    }

    // 2. Fallback to Redis
    const flat = await this.redis.hgetall(EXEC_KEY(executionId));
    if (!flat || Object.keys(flat).length === 0) {
      return null;
    }

    const record = this._unflatten(flat);
    this._cacheSet(executionId, record);
    return record;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Transition execution to a new status
   * @param {string} executionId
   * @param {import('./types/execution.types').ExecutionStatus} newStatus
   * @param {Object} [metadata={}] - Additional fields to update (e.g. startedAt, error)
   * @returns {Promise<import('./types/execution.types').ExecutionRecord|null>}
   */
  async updateStatus(executionId, newStatus, metadata = {}) {
    const record = await this.get(executionId);
    if (!record) return null;

    const oldStatus = record.status;

    // Update record
    record.status = newStatus;
    Object.assign(record, metadata);

    // 1. Update cache
    this._cacheSet(executionId, record);

    // 2. Update Redis hash
    const updates = { status: newStatus };
    for (const [k, v] of Object.entries(metadata)) {
      updates[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    }
    await this.redis.hset(EXEC_KEY(executionId), updates);

    // 3. Move between sorted sets if status changed
    if (oldStatus !== newStatus) {
      const ts = Date.now();
      await this.redis.zrem(STATUS_KEY(oldStatus), executionId);
      await this.redis.zadd(STATUS_KEY(newStatus), ts, executionId);
    }

    // 4. Active set management
    if (TERMINAL_STATUSES.has(newStatus)) {
      await this.redis.srem(ACTIVE_KEY, executionId);
    } else if (TERMINAL_STATUSES.has(oldStatus) && !TERMINAL_STATUSES.has(newStatus)) {
      await this.redis.sadd(ACTIVE_KEY, executionId);
    }

    this.emit('statusChanged', { executionId, from: oldStatus, to: newStatus, metadata });
    return record;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Query executions with filters
   * @param {Object} filters
   * @param {string[]} [filters.status] - Filter by statuses
   * @param {string} [filters.graphId] - Filter by graph
   * @param {number} [filters.since] - Epoch ms lower bound
   * @param {number} [filters.until] - Epoch ms upper bound
   * @param {number} [filters.limit=50] - Max results
   * @param {number} [filters.offset=0] - Skip
   * @returns {Promise<import('./types/execution.types').ExecutionRecord[]>}
   */
  async query(filters = {}) {
    const { status, graphId, since = '-inf', until = '+inf', limit = 50, offset = 0 } = filters;
    let executionIds = [];

    if (graphId) {
      // Query by graph
      executionIds = await this.redis.zrangebyscore(
        GRAPH_KEY(graphId),
        since === '-inf' ? '-inf' : since,
        until === '+inf' ? '+inf' : until
      );
    } else if (status && status.length === 1) {
      // Single status — use sorted set directly
      executionIds = await this.redis.zrangebyscore(
        STATUS_KEY(status[0]),
        since === '-inf' ? '-inf' : since,
        until === '+inf' ? '+inf' : until
      );
    } else if (status && status.length > 1) {
      // Multiple statuses — union
      const sets = status.map(s => STATUS_KEY(s));
      const tmpKey = `${PREFIX}:tmp:query:${Date.now()}`;
      await this.redis.zunionstore(tmpKey, sets.length, ...sets);
      executionIds = await this.redis.zrangebyscore(tmpKey, since === '-inf' ? '-inf' : since, until === '+inf' ? '+inf' : until);
      await this.redis.del(tmpKey);
    } else if (since !== '-inf' || until !== '+inf') {
      // Date range without status — query all status sets
      const allStatuses = Object.values(ExecutionStatus);
      const sets = allStatuses.map(s => STATUS_KEY(s));
      const tmpKey = `${PREFIX}:tmp:query:${Date.now()}`;
      await this.redis.zunionstore(tmpKey, sets.length, ...sets);
      executionIds = await this.redis.zrangebyscore(tmpKey, since, until);
      await this.redis.del(tmpKey);
    } else {
      // All active
      executionIds = await this.redis.smembers(ACTIVE_KEY);
    }

    // Apply offset + limit
    const paged = executionIds.slice(offset, offset + limit);

    // Fetch full records
    const records = [];
    for (const id of paged) {
      const rec = await this.get(id);
      if (rec) records.push(rec);
    }

    return records;
  }

  /**
   * Get all active executions for a given graph
   * @param {string} graphId
   * @returns {Promise<import('./types/execution.types').ExecutionRecord[]>}
   */
  async getActiveByGraph(graphId) {
    const all = await this.redis.zrangebyscore(GRAPH_KEY(graphId), '-inf', '+inf');
    const results = [];
    for (const id of all) {
      const rec = await this.get(id);
      if (rec && ACTIVE_STATUSES.has(rec.status)) {
        results.push(rec);
      }
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUME TOKENS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save a resume token mapping
   * @param {string} executionId
   * @param {string} nodeId
   * @param {string} token
   * @param {number} [ttlSeconds=86400] - Default 24h
   */
  async saveResumeToken(executionId, nodeId, token, ttlSeconds = 86400) {
    const value = `${executionId}:${nodeId}`;
    await this.redis.set(RESUME_TOKEN_KEY(token), value, 'EX', ttlSeconds);
  }

  /**
   * Resolve a resume token → { executionId, nodeId }
   * @param {string} token
   * @returns {Promise<{executionId: string, nodeId: string}|null>}
   */
  async getByResumeToken(token) {
    const value = await this.redis.get(RESUME_TOKEN_KEY(token));
    if (!value) return null;
    const [executionId, nodeId] = value.split(':');
    return { executionId, nodeId };
  }

  /**
   * Consume (delete) a resume token after use
   * @param {string} token
   */
  async consumeResumeToken(token) {
    await this.redis.del(RESUME_TOKEN_KEY(token));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Remove a completed/failed execution from Redis (after Memgraph persist)
   * @param {string} executionId
   */
  async archive(executionId) {
    const record = await this.get(executionId);
    if (!record) return;

    // Remove from all sets
    await this.redis.del(EXEC_KEY(executionId));
    await this.redis.srem(ACTIVE_KEY, executionId);
    await this.redis.zrem(STATUS_KEY(record.status), executionId);
    if (record.graphId) {
      await this.redis.zrem(GRAPH_KEY(record.graphId), executionId);
    }

    // Remove from cache
    this.cache.delete(executionId);

    this.emit('archived', { executionId });
  }

  /**
   * Count executions by status
   * @returns {Promise<Object>} { RUNNING: 4, PAUSED: 2, QUEUED: 8, ... }
   */
  async countByStatus() {
    const counts = {};
    for (const status of Object.values(ExecutionStatus)) {
      counts[status] = await this.redis.zcard(STATUS_KEY(status));
    }
    return counts;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Serialization / Cache
  // ═══════════════════════════════════════════════════════════════════════════

  _flatten(record) {
    const flat = {};
    for (const [key, val] of Object.entries(record)) {
      if (val === null || val === undefined) {
        flat[key] = '';
      } else if (typeof val === 'object') {
        flat[key] = JSON.stringify(val);
      } else {
        flat[key] = String(val);
      }
    }
    return flat;
  }

  _unflatten(flat) {
    const record = {};
    const numberFields = new Set(['createdAt', 'startedAt', 'pausedAt', 'completedAt', 'timeoutAt', 'retryCount']);
    const jsonFields = new Set(['inputPayload', 'metadata', 'nodeStates']);

    for (const [key, val] of Object.entries(flat)) {
      if (val === '') {
        record[key] = null;
      } else if (numberFields.has(key)) {
        record[key] = val ? Number(val) : null;
      } else if (jsonFields.has(key)) {
        try { record[key] = JSON.parse(val); } catch { record[key] = val; }
      } else {
        record[key] = val;
      }
    }
    return record;
  }

  _cacheSet(executionId, record) {
    // Evict oldest if over limit
    if (this.cache.size >= this.cacheMaxSize && !this.cache.has(executionId)) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(executionId, record);
  }
}

module.exports = { ExecutionRegistry };
