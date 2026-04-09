/**
 * Unit tests for ExecutionRegistry
 */

const { ExecutionRegistry } = require('../ExecutionRegistry');
const { createExecutionRecord, ExecutionStatus } = require('../types/execution.types');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK REDIS
// ═══════════════════════════════════════════════════════════════════════════

function createMockRedis() {
  const store = {};
  const sets = {};
  const sortedSets = {};

  return {
    _store: store,
    _sets: sets,
    _sortedSets: sortedSets,

    async hset(key, obj) {
      store[key] = { ...(store[key] || {}), ...obj };
    },
    async hgetall(key) {
      return store[key] || {};
    },
    async sadd(key, ...members) {
      if (!sets[key]) sets[key] = new Set();
      members.forEach(m => sets[key].add(m));
    },
    async srem(key, ...members) {
      if (!sets[key]) return;
      members.forEach(m => sets[key].delete(m));
    },
    async smembers(key) {
      return sets[key] ? [...sets[key]] : [];
    },
    async zadd(key, score, member) {
      if (!sortedSets[key]) sortedSets[key] = new Map();
      sortedSets[key].set(member, score);
    },
    async zrem(key, member) {
      if (!sortedSets[key]) return;
      sortedSets[key].delete(member);
    },
    async zrangebyscore(key, min, max) {
      if (!sortedSets[key]) return [];
      const entries = [];
      for (const [member, score] of sortedSets[key]) {
        const lo = min === '-inf' ? -Infinity : Number(min);
        const hi = max === '+inf' ? Infinity : Number(max);
        if (score >= lo && score <= hi) entries.push(member);
      }
      return entries;
    },
    async zcard(key) {
      return sortedSets[key] ? sortedSets[key].size : 0;
    },
    async zunionstore(dest, numKeys, ...keys) {
      sortedSets[dest] = new Map();
      for (const k of keys) {
        if (sortedSets[k]) {
          for (const [m, s] of sortedSets[k]) {
            sortedSets[dest].set(m, s);
          }
        }
      }
    },
    async del(key) {
      delete store[key];
      delete sets[key];
      delete sortedSets[key];
    },
    async set(key, value, ...args) {
      store[key] = value;
    },
    async get(key) {
      return store[key] || null;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ExecutionRegistry', () => {
  let redis;
  let registry;

  beforeEach(() => {
    redis = createMockRedis();
    registry = new ExecutionRegistry(redis);
  });

  describe('register()', () => {
    it('should save record to cache and Redis', async () => {
      const record = createExecutionRecord({ graphId: 'test-graph' });

      await registry.register(record);

      // Check cache
      expect(registry.cache.has(record.executionId)).toBe(true);
      expect(registry.cache.get(record.executionId).graphId).toBe('test-graph');

      // Check Redis hash
      const key = `gxe:exec:${record.executionId}`;
      expect(redis._store[key]).toBeDefined();
      expect(redis._store[key].graphId).toBe('test-graph');
    });

    it('should add to active set when not terminal', async () => {
      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      const active = await redis.smembers('gxe:active');
      expect(active).toContain(record.executionId);
    });

    it('should add to status sorted set', async () => {
      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      const members = await redis.zrangebyscore('gxe:by-status:QUEUED', '-inf', '+inf');
      expect(members).toContain(record.executionId);
    });

    it('should emit registered event', async () => {
      const handler = jest.fn();
      registry.on('registered', handler);

      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      expect(handler).toHaveBeenCalledWith({
        executionId: record.executionId,
        status: 'QUEUED'
      });
    });
  });

  describe('get()', () => {
    it('should return from cache if available', async () => {
      const record = createExecutionRecord({ graphId: 'cached' });
      await registry.register(record);

      const result = await registry.get(record.executionId);
      expect(result.graphId).toBe('cached');
    });

    it('should fallback to Redis when not in cache', async () => {
      const record = createExecutionRecord({ graphId: 'redis-only' });
      await registry.register(record);

      // Clear cache
      registry.cache.clear();

      const result = await registry.get(record.executionId);
      expect(result).not.toBeNull();
      expect(result.graphId).toBe('redis-only');
    });

    it('should return null for unknown ID', async () => {
      const result = await registry.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus()', () => {
    it('should transition status and update metadata', async () => {
      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      const updated = await registry.updateStatus(
        record.executionId,
        ExecutionStatus.RUNNING,
        { startedAt: 12345 }
      );

      expect(updated.status).toBe('RUNNING');
      expect(updated.startedAt).toBe(12345);
    });

    it('should move between sorted sets', async () => {
      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      await registry.updateStatus(record.executionId, ExecutionStatus.RUNNING);

      const queued = await redis.zrangebyscore('gxe:by-status:QUEUED', '-inf', '+inf');
      const running = await redis.zrangebyscore('gxe:by-status:RUNNING', '-inf', '+inf');
      expect(queued).not.toContain(record.executionId);
      expect(running).toContain(record.executionId);
    });

    it('should remove from active set on terminal status', async () => {
      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      await registry.updateStatus(record.executionId, ExecutionStatus.COMPLETED, {
        completedAt: Date.now()
      });

      const active = await redis.smembers('gxe:active');
      expect(active).not.toContain(record.executionId);
    });

    it('should emit statusChanged event', async () => {
      const handler = jest.fn();
      registry.on('statusChanged', handler);

      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);
      await registry.updateStatus(record.executionId, ExecutionStatus.RUNNING);

      expect(handler).toHaveBeenCalledWith({
        executionId: record.executionId,
        from: 'QUEUED',
        to: 'RUNNING',
        metadata: {}
      });
    });
  });

  describe('query()', () => {
    it('should return active executions by default', async () => {
      const r1 = createExecutionRecord({ graphId: 'g1' });
      const r2 = createExecutionRecord({ graphId: 'g2' });
      await registry.register(r1);
      await registry.register(r2);

      const results = await registry.query();
      expect(results.length).toBe(2);
    });

    it('should filter by single status', async () => {
      const r1 = createExecutionRecord({ graphId: 'g1' });
      const r2 = createExecutionRecord({ graphId: 'g2' });
      await registry.register(r1);
      await registry.register(r2);
      await registry.updateStatus(r1.executionId, ExecutionStatus.RUNNING);

      const results = await registry.query({ status: ['RUNNING'] });
      expect(results.length).toBe(1);
      expect(results[0].executionId).toBe(r1.executionId);
    });
  });

  describe('resume tokens', () => {
    it('should save and resolve resume token', async () => {
      await registry.saveResumeToken('exec-1', 'node-5', 'token-abc', 3600);

      const result = await registry.getByResumeToken('token-abc');
      expect(result).toEqual({ executionId: 'exec-1', nodeId: 'node-5' });
    });

    it('should return null for unknown token', async () => {
      const result = await registry.getByResumeToken('unknown');
      expect(result).toBeNull();
    });

    it('should consume (delete) token', async () => {
      await registry.saveResumeToken('exec-1', 'node-5', 'token-del', 3600);
      await registry.consumeResumeToken('token-del');

      const result = await registry.getByResumeToken('token-del');
      expect(result).toBeNull();
    });
  });

  describe('countByStatus()', () => {
    it('should return counts per status', async () => {
      const r1 = createExecutionRecord({ graphId: 'g1' });
      const r2 = createExecutionRecord({ graphId: 'g2' });
      await registry.register(r1);
      await registry.register(r2);

      const counts = await registry.countByStatus();
      expect(counts.QUEUED).toBe(2);
      expect(counts.RUNNING).toBe(0);
    });
  });

  describe('archive()', () => {
    it('should remove execution from Redis and cache', async () => {
      const record = createExecutionRecord({ graphId: 'g1' });
      await registry.register(record);

      await registry.archive(record.executionId);

      expect(registry.cache.has(record.executionId)).toBe(false);
      const fromRedis = await registry.get(record.executionId);
      expect(fromRedis).toBeNull();
    });
  });
});
