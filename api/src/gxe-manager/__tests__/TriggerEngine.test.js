/**
 * Unit tests for TriggerEngine
 */

const { TriggerEngine } = require('../TriggerEngine');
const { EventEmitter } = require('node:events');

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockGxeManager() {
  const em = new EventEmitter();
  const launchCalls = [];

  em.launch = jest.fn(async (graphId, payload, options) => {
    const record = {
      executionId: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      graphId,
      inputPayload: payload,
      ...options
    };
    launchCalls.push(record);
    return record;
  });

  em.cancel = jest.fn(async () => {});
  em.resume = jest.fn(async () => {});
  em.getExecution = jest.fn(async (id) => ({ executionId: id, graphId: 'test-graph' }));

  em.registry = {
    getActiveByGraph: jest.fn(async () => [])
  };

  em._launchCalls = launchCalls;
  return em;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('TriggerEngine', () => {
  let gxeManager;
  let triggerEngine;

  beforeEach(async () => {
    gxeManager = createMockGxeManager();
    triggerEngine = new TriggerEngine({
      gxeManager,
      queueManager: null,
      memgraphService: null
    });
    await triggerEngine.initialize();
  });

  afterEach(async () => {
    await triggerEngine.shutdown();
  });

  describe('registerTrigger()', () => {
    it('should register a MANUAL trigger', async () => {
      const trigger = await triggerEngine.registerTrigger({
        graphId: 'g1',
        type: 'MANUAL'
      });

      expect(trigger.triggerId).toBeDefined();
      expect(trigger.graphId).toBe('g1');
      expect(trigger.type).toBe('MANUAL');
      expect(trigger.enabled).toBe(true);
      expect(triggerEngine.triggers.size).toBe(1);
    });

    it('should validate required fields', async () => {
      await expect(triggerEngine.registerTrigger({ type: 'MANUAL' }))
        .rejects.toThrow('graphId is required');

      await expect(triggerEngine.registerTrigger({ graphId: 'g1' }))
        .rejects.toThrow('type is required');
    });

    it('should validate CRON requires schedule', async () => {
      await expect(triggerEngine.registerTrigger({ graphId: 'g1', type: 'CRON' }))
        .rejects.toThrow('schedule is required');
    });

    it('should validate SIGNAL requires signalType', async () => {
      await expect(triggerEngine.registerTrigger({ graphId: 'g1', type: 'SIGNAL' }))
        .rejects.toThrow('signalType is required');
    });

    it('should validate DEPENDENCY requires sourceGraphId', async () => {
      await expect(triggerEngine.registerTrigger({ graphId: 'g1', type: 'DEPENDENCY' }))
        .rejects.toThrow('sourceGraphId is required');
    });

    it('should emit trigger.registered event', async () => {
      const handler = jest.fn();
      triggerEngine.on('trigger.registered', handler);

      await triggerEngine.registerTrigger({ graphId: 'g1', type: 'MANUAL' });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'MANUAL' }));
    });
  });

  describe('unregisterTrigger()', () => {
    it('should remove trigger', async () => {
      const trigger = await triggerEngine.registerTrigger({ graphId: 'g1', type: 'MANUAL' });
      await triggerEngine.unregisterTrigger(trigger.triggerId);
      expect(triggerEngine.triggers.size).toBe(0);
    });

    it('should throw for unknown trigger', async () => {
      await expect(triggerEngine.unregisterTrigger('unknown'))
        .rejects.toThrow('not found');
    });
  });

  describe('enableTrigger() / disableTrigger()', () => {
    it('should toggle enabled state', async () => {
      const trigger = await triggerEngine.registerTrigger({
        graphId: 'g1',
        type: 'MANUAL',
        enabled: false
      });

      expect(trigger.enabled).toBe(false);

      await triggerEngine.enableTrigger(trigger.triggerId);
      expect(triggerEngine.triggers.get(trigger.triggerId).enabled).toBe(true);

      await triggerEngine.disableTrigger(trigger.triggerId);
      expect(triggerEngine.triggers.get(trigger.triggerId).enabled).toBe(false);
    });
  });

  describe('listTriggers()', () => {
    it('should filter by type', async () => {
      await triggerEngine.registerTrigger({ graphId: 'g1', type: 'MANUAL' });
      await triggerEngine.registerTrigger({
        graphId: 'g2', type: 'SIGNAL', signalType: 'webhook'
      });

      const manual = triggerEngine.listTriggers({ type: 'MANUAL' });
      expect(manual.length).toBe(1);
      expect(manual[0].graphId).toBe('g1');
    });

    it('should filter by graphId', async () => {
      await triggerEngine.registerTrigger({ graphId: 'g1', type: 'MANUAL' });
      await triggerEngine.registerTrigger({ graphId: 'g2', type: 'MANUAL' });

      const results = triggerEngine.listTriggers({ graphId: 'g2' });
      expect(results.length).toBe(1);
    });
  });

  describe('SIGNAL trigger', () => {
    it('should fire on matching signal', async () => {
      await triggerEngine.registerTrigger({
        graphId: 'webhook-graph',
        type: 'SIGNAL',
        signalType: 'EXTERNAL_CALLBACK'
      });

      await triggerEngine.handleIncomingSignal({
        signalType: 'EXTERNAL_CALLBACK',
        action: 'START',
        payload: { data: 'test' }
      });

      expect(gxeManager.launch).toHaveBeenCalledWith(
        'webhook-graph',
        expect.objectContaining({ data: 'test' }),
        expect.objectContaining({ triggerType: 'SIGNAL' })
      );
    });

    it('should not fire on non-matching signal', async () => {
      await triggerEngine.registerTrigger({
        graphId: 'webhook-graph',
        type: 'SIGNAL',
        signalType: 'EXTERNAL_CALLBACK'
      });

      await triggerEngine.handleIncomingSignal({
        signalType: 'HUMAN_INPUT',
        action: 'START',
        payload: {}
      });

      expect(gxeManager.launch).not.toHaveBeenCalled();
    });

    it('should apply filter expression', async () => {
      await triggerEngine.registerTrigger({
        graphId: 'filtered-graph',
        type: 'SIGNAL',
        signalType: 'EXTERNAL_CALLBACK',
        filterExpression: 'category==IT'
      });

      // Non-matching
      await triggerEngine.handleIncomingSignal({
        signalType: 'EXTERNAL_CALLBACK',
        payload: { category: 'HR' }
      });
      expect(gxeManager.launch).not.toHaveBeenCalled();

      // Matching
      await triggerEngine.handleIncomingSignal({
        signalType: 'EXTERNAL_CALLBACK',
        payload: { category: 'IT' }
      });
      expect(gxeManager.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('DEPENDENCY trigger', () => {
    it('should fire when source graph completes successfully', async () => {
      await triggerEngine.registerTrigger({
        graphId: 'downstream-graph',
        type: 'DEPENDENCY',
        sourceGraphId: 'upstream-graph',
        condition: 'ON_SUCCESS'
      });

      // Simulate completion
      gxeManager.emit('execution.completed', {
        executionId: 'exec-1',
        graphId: 'upstream-graph',
        result: {}
      });

      // Wait for async processing
      await new Promise(r => setTimeout(r, 50));

      expect(gxeManager.launch).toHaveBeenCalledWith(
        'downstream-graph',
        expect.objectContaining({ _sourceGraphId: 'upstream-graph' }),
        expect.objectContaining({ triggerType: 'DEPENDENCY' })
      );
    });

    it('should NOT fire on failure when condition is ON_SUCCESS', async () => {
      await triggerEngine.registerTrigger({
        graphId: 'downstream-graph',
        type: 'DEPENDENCY',
        sourceGraphId: 'upstream-graph',
        condition: 'ON_SUCCESS'
      });

      gxeManager.emit('execution.failed', {
        executionId: 'exec-1',
        graphId: 'upstream-graph',
        error: 'test error'
      });

      await new Promise(r => setTimeout(r, 50));
      expect(gxeManager.launch).not.toHaveBeenCalled();
    });

    it('should fire on failure when condition is ON_FAILURE', async () => {
      // Override getExecution to return correct graphId for the failed execution
      gxeManager.getExecution = jest.fn(async () => ({
        executionId: 'exec-1',
        graphId: 'upstream-graph'
      }));

      await triggerEngine.registerTrigger({
        graphId: 'error-handler-graph',
        type: 'DEPENDENCY',
        sourceGraphId: 'upstream-graph',
        condition: 'ON_FAILURE'
      });

      gxeManager.emit('execution.failed', {
        executionId: 'exec-1',
        graphId: 'upstream-graph',
        error: 'test error'
      });

      await new Promise(r => setTimeout(r, 50));
      expect(gxeManager.launch).toHaveBeenCalledTimes(1);
    });

    it('should apply input mapping', async () => {
      await triggerEngine.registerTrigger({
        graphId: 'mapped-graph',
        type: 'DEPENDENCY',
        sourceGraphId: 'upstream-graph',
        condition: 'ON_SUCCESS',
        inputMapping: {
          result_data: 'result.output'
        }
      });

      gxeManager.emit('execution.completed', {
        executionId: 'exec-1',
        graphId: 'upstream-graph',
        result: { output: { value: 42 } }
      });

      await new Promise(r => setTimeout(r, 50));

      expect(gxeManager.launch).toHaveBeenCalledWith(
        'mapped-graph',
        expect.objectContaining({
          result_data: { value: 42 }
        }),
        expect.anything()
      );
    });
  });

  describe('concurrency policy', () => {
    it('should skip when policy is SKIP and graph is active', async () => {
      gxeManager.registry.getActiveByGraph.mockResolvedValue([
        { executionId: 'existing', status: 'RUNNING' }
      ]);

      const trigger = await triggerEngine.registerTrigger({
        graphId: 'g1',
        type: 'MANUAL',
        concurrencyPolicy: 'SKIP'
      });

      const skipped = jest.fn();
      triggerEngine.on('trigger.skipped', skipped);

      const result = await triggerEngine._fire(trigger.triggerId);
      expect(result).toBeNull();
      expect(skipped).toHaveBeenCalled();
    });

    it('should allow when policy is ALLOW even if graph is active', async () => {
      gxeManager.registry.getActiveByGraph.mockResolvedValue([
        { executionId: 'existing', status: 'RUNNING' }
      ]);

      const trigger = await triggerEngine.registerTrigger({
        graphId: 'g1',
        type: 'MANUAL',
        concurrencyPolicy: 'ALLOW'
      });

      const result = await triggerEngine._fire(trigger.triggerId);
      expect(result).not.toBeNull();
      expect(gxeManager.launch).toHaveBeenCalled();
    });

    it('should cancel existing when policy is REPLACE', async () => {
      gxeManager.registry.getActiveByGraph.mockResolvedValue([
        { executionId: 'old-exec', status: 'RUNNING' }
      ]);

      const trigger = await triggerEngine.registerTrigger({
        graphId: 'g1',
        type: 'MANUAL',
        concurrencyPolicy: 'REPLACE'
      });

      await triggerEngine._fire(trigger.triggerId);
      expect(gxeManager.cancel).toHaveBeenCalledWith('old-exec', 'replaced_by_trigger');
      expect(gxeManager.launch).toHaveBeenCalled();
    });
  });

  describe('INTERVAL trigger', () => {
    it('should activate and fire on interval', async () => {
      jest.useFakeTimers();

      const trigger = await triggerEngine.registerTrigger({
        graphId: 'interval-graph',
        type: 'INTERVAL',
        intervalMs: 5000
      });

      expect(triggerEngine._intervalHandles.has(trigger.triggerId)).toBe(true);

      jest.advanceTimersByTime(5000);
      // Allow async to process
      await Promise.resolve();

      jest.useRealTimers();
    });

    it('should clear interval on deactivate', async () => {
      const trigger = await triggerEngine.registerTrigger({
        graphId: 'interval-graph',
        type: 'INTERVAL',
        intervalMs: 5000
      });

      expect(triggerEngine._intervalHandles.has(trigger.triggerId)).toBe(true);

      await triggerEngine.disableTrigger(trigger.triggerId);
      expect(triggerEngine._intervalHandles.has(trigger.triggerId)).toBe(false);
    });
  });

  describe('_evaluateFilter()', () => {
    it('should match equality', () => {
      expect(triggerEngine._evaluateFilter('category==IT', { category: 'IT' })).toBe(true);
      expect(triggerEngine._evaluateFilter('category==HR', { category: 'IT' })).toBe(false);
    });

    it('should match greater than', () => {
      expect(triggerEngine._evaluateFilter('priority>3', { priority: 5 })).toBe(true);
      expect(triggerEngine._evaluateFilter('priority>3', { priority: 2 })).toBe(false);
    });

    it('should match less than', () => {
      expect(triggerEngine._evaluateFilter('count<10', { count: 5 })).toBe(true);
      expect(triggerEngine._evaluateFilter('count<10', { count: 15 })).toBe(false);
    });
  });
});
