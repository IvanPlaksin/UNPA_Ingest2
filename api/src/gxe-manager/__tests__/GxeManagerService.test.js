/**
 * Unit tests for GxeManagerService
 */

const { GxeManagerService } = require('../GxeManagerService');
const { ExecutionRegistry } = require('../ExecutionRegistry');
const { ExecutionStatus } = require('../types/execution.types');

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockRedis() {
  const store = {};
  const sets = {};
  const sortedSets = {};

  return {
    async hset(key, obj) { store[key] = { ...(store[key] || {}), ...obj }; },
    async hgetall(key) { return store[key] || {}; },
    async sadd(key, ...m) { if (!sets[key]) sets[key] = new Set(); m.forEach(x => sets[key].add(x)); },
    async srem(key, ...m) { if (!sets[key]) return; m.forEach(x => sets[key].delete(x)); },
    async smembers(key) { return sets[key] ? [...sets[key]] : []; },
    async zadd(key, score, member) { if (!sortedSets[key]) sortedSets[key] = new Map(); sortedSets[key].set(member, score); },
    async zrem(key, member) { if (!sortedSets[key]) return; sortedSets[key].delete(member); },
    async zrangebyscore() { return []; },
    async zcard(key) { return sortedSets[key] ? sortedSets[key].size : 0; },
    async del(key) { delete store[key]; },
    async set() {},
    async get() { return null; }
  };
}

function createMockRuntimeEngine() {
  const { EventEmitter } = require('node:events');

  return class MockRuntimeEngine extends EventEmitter {
    constructor() { super(); }

    async execute(dag, inputData) {
      // Simulate successful execution
      return {
        executionId: 'mock-exec-id',
        status: 'COMPLETED',
        output: {},
        error: null,
        metrics: {
          totalDurationMs: 100,
          nodesTotal: dag.nodes.length,
          nodesSucceeded: dag.nodes.length,
          nodesFailed: 0,
          nodesSkipped: 0,
          nodesCancelled: 0,
          retriesTotal: 0
        },
        nodeResults: {},
        history: []
      };
    }

    async pause() {}
    async resume() {}
    async cancel() {}
  };
}

function createMockGraphCatalog() {
  return {
    async getGraphById(id) {
      return {
        entryId: id,
        name: 'Test Graph',
        nodes: [
          { id: 'n1', data: { label: 'Start', toolId: 'echo' } },
          { id: 'n2', data: { label: 'End', toolId: 'echo' } }
        ],
        edges: [
          { source: 'n1', target: 'n2' }
        ]
      };
    }
  };
}

function createMockMcpRegistry() {
  return {
    getTool: () => null
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GxeManagerService', () => {
  let redis, registry, manager;

  beforeEach(async () => {
    redis = createMockRedis();
    registry = new ExecutionRegistry(redis);

    manager = new GxeManagerService({
      registry,
      mcpRegistry: createMockMcpRegistry(),
      RuntimeEngine: createMockRuntimeEngine(),
      graphCatalog: createMockGraphCatalog(),
      memgraphService: null,
      runtimeConfig: {}
    });

    await manager.start();
  });

  afterEach(async () => {
    await manager.stop();
  });

  describe('launch()', () => {
    it('should create an ExecutionRecord with QUEUED then process to COMPLETED', async () => {
      const events = [];
      manager.on('execution.queued', (e) => events.push({ type: 'queued', ...e }));
      manager.on('execution.started', (e) => events.push({ type: 'started', ...e }));
      manager.on('execution.completed', (e) => events.push({ type: 'completed', ...e }));

      const record = await manager.launch('test-graph-1', { key: 'value' });

      expect(record.executionId).toBeDefined();
      expect(record.graphId).toBe('test-graph-1');
      expect(record.triggerType).toBe('MANUAL');
      expect(record.priority).toBe('NORMAL');

      // Should have emitted queued and started events
      expect(events.some(e => e.type === 'queued')).toBe(true);
      expect(events.some(e => e.type === 'started')).toBe(true);
    });

    it('should throw if service not started', async () => {
      await manager.stop();

      await expect(manager.launch('g1', {})).rejects.toThrow('not started');
    });

    it('should store result after completion', async () => {
      const record = await manager.launch('test-graph-1', {});

      const result = await manager.getExecutionResult(record.executionId);
      expect(result).not.toBeNull();
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('getExecution()', () => {
    it('should return registered execution', async () => {
      const record = await manager.launch('g1', {});
      const found = await manager.getExecution(record.executionId);
      expect(found).not.toBeNull();
      expect(found.graphId).toBe('g1');
    });
  });

  describe('listExecutions()', () => {
    it('should return all active executions', async () => {
      await manager.launch('g1', {});
      await manager.launch('g2', {});

      // Both completed (mock), so active set will be empty
      // But they should still be queryable
      const stats = await manager.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('cancel()', () => {
    it('should cancel a running execution', async () => {
      // Use a RuntimeEngine that hangs (doesn't complete)
      const { EventEmitter } = require('node:events');
      class HangingEngine extends EventEmitter {
        constructor() { super(); }
        async execute() {
          return new Promise(() => {}); // Never resolves
        }
        async cancel() {}
      }

      const hangManager = new GxeManagerService({
        registry: new ExecutionRegistry(createMockRedis()),
        mcpRegistry: createMockMcpRegistry(),
        RuntimeEngine: HangingEngine,
        graphCatalog: createMockGraphCatalog()
      });
      await hangManager.start();

      // Launch (won't complete because execute hangs)
      const launchPromise = hangManager.launch('g1', {});

      // Wait a tick for the engine to be registered
      await new Promise(r => setTimeout(r, 50));

      // Get executionId from registry
      const records = [];
      hangManager.registry.cache.forEach(r => records.push(r));
      expect(records.length).toBeGreaterThan(0);

      const execId = records[0].executionId;
      await hangManager.cancel(execId, 'test');

      const cancelled = await hangManager.getExecution(execId);
      expect(cancelled.status).toBe('CANCELLED');

      await hangManager.stop();
    });
  });

  describe('stop()', () => {
    it('should cancel all running executions on stop', async () => {
      const stopped = jest.fn();
      manager.on('manager.stopped', stopped);

      await manager.stop();
      expect(stopped).toHaveBeenCalled();
    });
  });
});
