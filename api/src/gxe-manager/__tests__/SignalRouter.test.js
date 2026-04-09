/**
 * Unit tests for SignalRouter
 */

const { SignalRouter } = require('../SignalRouter');
const { EventEmitter } = require('node:events');

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockRedis() {
  const store = {};
  const lists = {};
  return {
    async get(key) { return store[key] || null; },
    async set(key, val, ...args) { store[key] = val; },
    async del(key) { delete store[key]; },
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
    },
    async lset(key, idx, val) {
      if (lists[key]) lists[key][idx] = val;
    },
    async lrem(key, count, val) {
      if (!lists[key]) return;
      lists[key] = lists[key].filter(v => v !== val);
    },
    _store: store,
    _lists: lists
  };
}

function createMockRegistry() {
  return {
    get: jest.fn(async (id) => ({
      executionId: id,
      graphId: 'test-graph',
      status: 'PAUSED',
      currentNodeId: 'node-1'
    })),
    getByResumeToken: jest.fn(async (token) => {
      if (token === 'valid-token') return { executionId: 'exec-1', nodeId: 'node-1' };
      return null;
    }),
    consumeResumeToken: jest.fn(async () => {})
  };
}

function createMockGxeManager() {
  const em = new EventEmitter();
  em.resume = jest.fn(async () => {});
  em.cancel = jest.fn(async () => {});
  return em;
}

function createMockTriggerEngine() {
  return {
    handleIncomingSignal: jest.fn(async () => {})
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('SignalRouter', () => {
  let router, redis, registry, gxeManager, triggerEngine;

  beforeEach(() => {
    redis = createMockRedis();
    registry = createMockRegistry();
    gxeManager = createMockGxeManager();
    triggerEngine = createMockTriggerEngine();

    router = new SignalRouter({ registry, gxeManager, triggerEngine, redis });
  });

  describe('routeIncomingSignal()', () => {
    it('should route RESUME with executionId', async () => {
      const result = await router.routeIncomingSignal({
        signalType: 'HUMAN_INPUT',
        action: 'RESUME',
        executionId: 'exec-1',
        payload: { answer: 'yes' },
        idempotencyKey: 'key-1'
      });

      expect(result.status).toBe('resumed');
      expect(gxeManager.resume).toHaveBeenCalledWith('exec-1', expect.objectContaining({
        payload: { answer: 'yes' }
      }));
    });

    it('should route RESUME with resumeToken', async () => {
      const result = await router.routeIncomingSignal({
        signalType: 'EXTERNAL_CALLBACK',
        action: 'RESUME',
        resumeToken: 'valid-token',
        payload: { data: 'callback' },
        idempotencyKey: 'key-2'
      });

      expect(result.status).toBe('resumed');
      expect(result.executionId).toBe('exec-1');
      expect(registry.consumeResumeToken).toHaveBeenCalledWith('valid-token');
    });

    it('should reject invalid resume token', async () => {
      await expect(router.routeIncomingSignal({
        signalType: 'EXTERNAL_CALLBACK',
        action: 'RESUME',
        resumeToken: 'invalid-token',
        idempotencyKey: 'key-3'
      })).rejects.toThrow('not found or expired');
    });

    it('should reject RESUME for non-paused execution', async () => {
      registry.get.mockResolvedValue({ executionId: 'exec-1', status: 'RUNNING' });

      await expect(router.routeIncomingSignal({
        signalType: 'MANUAL',
        action: 'RESUME',
        executionId: 'exec-1',
        idempotencyKey: 'key-4'
      })).rejects.toThrow('not paused');
    });

    it('should route CANCEL signal', async () => {
      const result = await router.routeIncomingSignal({
        signalType: 'CANCELLATION',
        action: 'CANCEL',
        executionId: 'exec-1',
        payload: { reason: 'user request' },
        idempotencyKey: 'key-5'
      });

      expect(result.status).toBe('cancelled');
      expect(gxeManager.cancel).toHaveBeenCalled();
    });

    it('should route START signal to TriggerEngine', async () => {
      const result = await router.routeIncomingSignal({
        signalType: 'WEBHOOK',
        action: 'START',
        payload: { data: 'webhook' },
        idempotencyKey: 'key-6'
      });

      expect(result.status).toBe('processed');
      expect(triggerEngine.handleIncomingSignal).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should detect duplicate signals', async () => {
      await router.routeIncomingSignal({
        signalType: 'MANUAL',
        action: 'RESUME',
        executionId: 'exec-1',
        idempotencyKey: 'dup-key'
      });

      const result = await router.routeIncomingSignal({
        signalType: 'MANUAL',
        action: 'RESUME',
        executionId: 'exec-1',
        idempotencyKey: 'dup-key'
      });

      expect(result.status).toBe('duplicate');
      // resume should only be called once
      expect(gxeManager.resume).toHaveBeenCalledTimes(1);
    });
  });

  describe('dead letter queue', () => {
    it('should send failed signals to DLQ', async () => {
      registry.get.mockResolvedValue(null); // execution not found

      try {
        await router.routeIncomingSignal({
          signalType: 'MANUAL',
          action: 'RESUME',
          executionId: 'nonexistent',
          idempotencyKey: 'dlq-key'
        });
      } catch (e) {
        // Expected
      }

      const dlq = await router.getDLQEntries();
      expect(dlq.length).toBe(1);
      expect(dlq[0].signal.executionId).toBe('nonexistent');
    });
  });
});
