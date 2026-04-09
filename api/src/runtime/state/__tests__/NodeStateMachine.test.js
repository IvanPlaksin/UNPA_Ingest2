/**
 * Tests for NodeStateMachine
 */

const { NodeStateMachine, NodeState } = require('../NodeStateMachine');
const { InvalidTransitionError } = require('../errors');

describe('NodeStateMachine', () => {
  let sm;

  beforeEach(() => {
    sm = new NodeStateMachine('test-node-1');
  });

  describe('initialization', () => {
    test('starts in PENDING state by default', () => {
      expect(sm.state).toBe(NodeState.PENDING);
    });

    test('can start with custom initial state', () => {
      const sm2 = new NodeStateMachine('node-2', NodeState.READY);
      expect(sm2.state).toBe(NodeState.READY);
    });

    test('stores nodeId', () => {
      expect(sm.nodeId).toBe('test-node-1');
    });

    test('attempt starts at 1', () => {
      expect(sm.attempt).toBe(1);
    });

    test('is not terminal initially', () => {
      expect(sm.isTerminal).toBe(false);
    });

    test('is not active initially', () => {
      expect(sm.isActive).toBe(false);
    });

    test('lastError is null initially', () => {
      expect(sm.lastError).toBeNull();
    });
  });

  describe('happy path transitions', () => {
    test('PENDING → READY → QUEUED → EXECUTING → SUCCEEDED', async () => {
      // PENDING → READY
      await sm.transition('deps_satisfied');
      expect(sm.state).toBe(NodeState.READY);

      // READY → QUEUED
      await sm.transition('scheduled');
      expect(sm.state).toBe(NodeState.QUEUED);

      // QUEUED → EXECUTING
      await sm.transition('execute');
      expect(sm.state).toBe(NodeState.EXECUTING);
      expect(sm.isActive).toBe(true);

      // EXECUTING → SUCCEEDED
      await sm.transition('success');
      expect(sm.state).toBe(NodeState.SUCCEEDED);
      expect(sm.isTerminal).toBe(true);
      expect(sm.isActive).toBe(false);

      // Check history
      expect(sm.history).toHaveLength(4);
    });
  });

  describe('retry behavior', () => {
    test('EXECUTING → RETRYING → EXECUTING → SUCCEEDED with retry', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      expect(sm.attempt).toBe(1);

      // First error - retries not exhausted
      await sm.transition('error', { retriesExhausted: false });
      expect(sm.state).toBe(NodeState.RETRYING);
      expect(sm.isActive).toBe(true);

      // Retry
      await sm.transition('retry');
      expect(sm.state).toBe(NodeState.EXECUTING);
      expect(sm.attempt).toBe(2); // Incremented

      // Another error
      await sm.transition('error', { retriesExhausted: false });
      expect(sm.state).toBe(NodeState.RETRYING);

      // Retry again
      await sm.transition('retry');
      expect(sm.attempt).toBe(3);

      // Success on third attempt
      await sm.transition('success');
      expect(sm.state).toBe(NodeState.SUCCEEDED);
      expect(sm.attempt).toBe(3);
    });

    test('EXECUTING → FAILED when retries exhausted', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      // Error with retries exhausted
      await sm.transition('error', { retriesExhausted: true });
      expect(sm.state).toBe(NodeState.FAILED);
      expect(sm.isTerminal).toBe(true);
    });

    test('attempt counter increments on each retry', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      expect(sm.attempt).toBe(1);

      for (let i = 2; i <= 5; i++) {
        await sm.transition('error', { retriesExhausted: false });
        await sm.transition('retry');
        expect(sm.attempt).toBe(i);
      }
    });
  });

  describe('skip path', () => {
    test('READY → SKIPPED on condition_false', async () => {
      await sm.transition('deps_satisfied');
      expect(sm.state).toBe(NodeState.READY);

      await sm.transition('condition_false');
      expect(sm.state).toBe(NodeState.SKIPPED);
      expect(sm.isTerminal).toBe(true);
    });
  });

  describe('cancel transitions', () => {
    test('can cancel from PENDING', async () => {
      await sm.transition('cancel');
      expect(sm.state).toBe(NodeState.CANCELLED);
      expect(sm.isTerminal).toBe(true);
    });

    test('can cancel from QUEUED', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');

      await sm.transition('cancel');
      expect(sm.state).toBe(NodeState.CANCELLED);
    });

    test('can cancel from EXECUTING', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      await sm.transition('cancel');
      expect(sm.state).toBe(NodeState.CANCELLED);
    });
  });

  describe('invalid transitions', () => {
    test('throws InvalidTransitionError for invalid transition', async () => {
      // Cannot go directly from PENDING to EXECUTING
      await expect(sm.transition('execute')).rejects.toThrow(InvalidTransitionError);
    });

    test('cannot transition from terminal state', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');
      await sm.transition('success');

      // Cannot execute again from SUCCEEDED
      await expect(sm.transition('execute')).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('retriesExhausted method', () => {
    test('returns true when attempt >= maxRetries', () => {
      expect(sm.retriesExhausted(1)).toBe(true);  // attempt=1, max=1
      expect(sm.retriesExhausted(2)).toBe(false); // attempt=1, max=2
    });

    test('returns correct value after retries', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      // First retry
      await sm.transition('error', { retriesExhausted: false });
      await sm.transition('retry');
      expect(sm.attempt).toBe(2);
      expect(sm.retriesExhausted(2)).toBe(true);
      expect(sm.retriesExhausted(3)).toBe(false);
    });
  });

  describe('error tracking', () => {
    test('stores last error', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      const errorObj = { message: 'Test error', code: 'TEST_001' };
      await sm.transition('error', { retriesExhausted: false, error: errorObj });

      expect(sm.lastError).toEqual(errorObj);
    });

    test('lastError is updated on each error', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      const error1 = { message: 'First error' };
      await sm.transition('error', { retriesExhausted: false, error: error1 });
      expect(sm.lastError).toEqual(error1);

      await sm.transition('retry');

      const error2 = { message: 'Second error' };
      await sm.transition('error', { retriesExhausted: true, error: error2 });
      expect(sm.lastError).toEqual(error2);
    });
  });

  describe('execution timing', () => {
    test('tracks execution start time', async () => {
      expect(sm.executionDurationMs).toBeNull();

      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');

      const beforeExecute = Date.now();
      await sm.transition('execute');
      const afterExecute = Date.now();

      expect(sm.executionDurationMs).toBeGreaterThanOrEqual(0);
      expect(sm.executionDurationMs).toBeLessThanOrEqual(afterExecute - beforeExecute + 10);
    });

    test('tracks completion time on terminal state', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      // Small delay to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 5));

      await sm.transition('success');

      expect(sm.executionDurationMs).toBeGreaterThanOrEqual(5);
    });
  });

  describe('event emission', () => {
    test('emits transition event', async () => {
      const handler = jest.fn();
      sm.on('transition', handler);

      await sm.transition('deps_satisfied');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        from: 'PENDING',
        to: 'READY',
        trigger: 'deps_satisfied'
      }));
    });

    test('emits enter:STATE event', async () => {
      const handler = jest.fn();
      sm.on('enter:READY', handler);

      await sm.transition('deps_satisfied');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('serialization', () => {
    test('toJSON includes node-specific fields', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      const json = sm.toJSON();

      expect(json.nodeId).toBe('test-node-1');
      expect(json.state).toBe('EXECUTING');
      expect(json.attempt).toBe(1);
      expect(json.startedAt).toBeDefined();
      expect(json.history).toHaveLength(3);
    });

    test('fromJSON restores state machine', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');
      await sm.transition('error', { retriesExhausted: false, error: { msg: 'test' } });
      await sm.transition('retry');

      const json = sm.toJSON();
      const restored = NodeStateMachine.fromJSON(json);

      expect(restored.nodeId).toBe(sm.nodeId);
      expect(restored.state).toBe(sm.state);
      expect(restored.attempt).toBe(sm.attempt);
      expect(restored.history).toEqual(sm.history);
    });
  });

  describe('guard conditions', () => {
    test('error triggers FAILED when retriesExhausted=true', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      await sm.transition('error', { retriesExhausted: true });
      expect(sm.state).toBe(NodeState.FAILED);
    });

    test('error triggers RETRYING when retriesExhausted=false', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      await sm.transition('error', { retriesExhausted: false });
      expect(sm.state).toBe(NodeState.RETRYING);
    });

    test('error uses first rule when ctx is null (testing)', async () => {
      await sm.transition('deps_satisfied');
      await sm.transition('scheduled');
      await sm.transition('execute');

      // Without context, guards are skipped and first matching rule is used.
      // FAILED rule comes first in the transition table.
      await sm.transition('error');
      expect(sm.state).toBe(NodeState.FAILED);
    });
  });
});
