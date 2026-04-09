/**
 * Unit tests for AuditLogger
 */

const { AuditLogger } = require('../AuditLogger');

function createMockRedis() {
  const lists = {};
  return {
    async lpush(key, val) {
      if (!lists[key]) lists[key] = [];
      lists[key].unshift(val);
    },
    async ltrim(key, start, end) {
      if (lists[key]) lists[key] = lists[key].slice(start, end + 1);
    },
    async lrange(key, start, end) {
      if (!lists[key]) return [];
      return lists[key].slice(start, end === -1 ? undefined : end + 1);
    }
  };
}

describe('AuditLogger', () => {
  let logger, redis;

  beforeEach(() => {
    redis = createMockRedis();
    logger = new AuditLogger(redis);
  });

  describe('log()', () => {
    it('should create audit entry with all fields', async () => {
      const entry = await logger.log({
        action: 'LAUNCH',
        executionId: 'exec-1',
        operator: 'user@example.com',
        source: 'api',
        details: { graphId: 'g1' }
      });

      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('LAUNCH');
      expect(entry.executionId).toBe('exec-1');
      expect(entry.operator).toBe('user@example.com');
      expect(entry.timestamp).toBeDefined();
    });
  });

  describe('query()', () => {
    it('should return all entries', async () => {
      await logger.log({ action: 'LAUNCH', executionId: 'exec-1' });
      await logger.log({ action: 'PAUSE', executionId: 'exec-1' });
      await logger.log({ action: 'CANCEL', executionId: 'exec-2' });

      const entries = await logger.query();
      expect(entries.length).toBe(3);
    });

    it('should filter by executionId', async () => {
      await logger.log({ action: 'LAUNCH', executionId: 'exec-1' });
      await logger.log({ action: 'LAUNCH', executionId: 'exec-2' });

      const entries = await logger.query({ executionId: 'exec-1' });
      expect(entries.length).toBe(1);
      expect(entries[0].executionId).toBe('exec-1');
    });

    it('should filter by action', async () => {
      await logger.log({ action: 'LAUNCH', executionId: 'exec-1' });
      await logger.log({ action: 'CANCEL', executionId: 'exec-1' });

      const entries = await logger.query({ action: 'CANCEL' });
      expect(entries.length).toBe(1);
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await logger.log({ action: 'LAUNCH', executionId: `exec-${i}` });
      }

      const entries = await logger.query({ limit: 3 });
      expect(entries.length).toBe(3);
    });
  });
});
