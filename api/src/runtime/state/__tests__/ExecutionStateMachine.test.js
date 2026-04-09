/**
 * Tests for ExecutionStateMachine
 */

const { ExecutionStateMachine, ExecutionState } = require('../ExecutionStateMachine');
const { InvalidTransitionError } = require('../errors');

describe('ExecutionStateMachine', () => {
  let sm;

  beforeEach(() => {
    sm = new ExecutionStateMachine();
  });

  describe('initialization', () => {
    test('starts in CREATED state by default', () => {
      expect(sm.state).toBe(ExecutionState.CREATED);
    });

    test('can start with custom initial state', () => {
      const sm2 = new ExecutionStateMachine(ExecutionState.READY);
      expect(sm2.state).toBe(ExecutionState.READY);
    });

    test('history is empty initially', () => {
      expect(sm.history).toEqual([]);
    });

    test('is not terminal initially', () => {
      expect(sm.isTerminal).toBe(false);
    });

    test('is not active initially', () => {
      expect(sm.isActive).toBe(false);
    });
  });

  describe('happy path transitions', () => {
    test('CREATED → INITIALIZING → READY → RUNNING → COMPLETED', async () => {
      // CREATED → INITIALIZING
      await sm.transition('initialize');
      expect(sm.state).toBe(ExecutionState.INITIALIZING);

      // INITIALIZING → READY
      await sm.transition('initialized', { validationPassed: true });
      expect(sm.state).toBe(ExecutionState.READY);

      // READY → RUNNING
      await sm.transition('start');
      expect(sm.state).toBe(ExecutionState.RUNNING);
      expect(sm.isActive).toBe(true);

      // RUNNING → COMPLETED
      await sm.transition('all_exits_done', { allExitNodesCompleted: true });
      expect(sm.state).toBe(ExecutionState.COMPLETED);
      expect(sm.isTerminal).toBe(true);
      expect(sm.isActive).toBe(false);

      // Check history
      expect(sm.history).toHaveLength(4);
      expect(sm.history[0].trigger).toBe('initialize');
      expect(sm.history[3].trigger).toBe('all_exits_done');
    });
  });

  describe('self-loop transitions', () => {
    test('RUNNING → RUNNING on node_completed', async () => {
      // Get to RUNNING state
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      expect(sm.state).toBe(ExecutionState.RUNNING);

      // Self-loop
      await sm.transition('node_completed');
      expect(sm.state).toBe(ExecutionState.RUNNING);

      // Another self-loop
      await sm.transition('node_completed');
      expect(sm.state).toBe(ExecutionState.RUNNING);

      // History should record both self-loops
      const nodeCompletedTransitions = sm.history.filter(h => h.trigger === 'node_completed');
      expect(nodeCompletedTransitions).toHaveLength(2);
    });
  });

  describe('pause/resume transitions', () => {
    test('RUNNING → PAUSED → RUNNING', async () => {
      // Get to RUNNING state
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      // Pause
      await sm.transition('pause');
      expect(sm.state).toBe(ExecutionState.PAUSED);
      expect(sm.isActive).toBe(false);

      // Resume
      await sm.transition('resume');
      expect(sm.state).toBe(ExecutionState.RUNNING);
      expect(sm.isActive).toBe(true);
    });
  });

  describe('cancel transitions', () => {
    test('can cancel from RUNNING', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      await sm.transition('cancel');
      expect(sm.state).toBe(ExecutionState.CANCELLED);
      expect(sm.isTerminal).toBe(true);
    });

    test('can cancel from PAUSED', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('pause');

      await sm.transition('cancel');
      expect(sm.state).toBe(ExecutionState.CANCELLED);
    });

    test('can cancel from WAITING', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('await_signal');
      expect(sm.state).toBe(ExecutionState.WAITING);

      await sm.transition('cancel');
      expect(sm.state).toBe(ExecutionState.CANCELLED);
    });
  });

  describe('restart transitions', () => {
    test('can restart from COMPLETED', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('all_exits_done', { allExitNodesCompleted: true });
      expect(sm.state).toBe(ExecutionState.COMPLETED);

      await sm.transition('restart');
      expect(sm.state).toBe(ExecutionState.CREATED);
      expect(sm.isTerminal).toBe(false);
    });

    test('can restart from FAILED', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('unrecoverable_error');
      expect(sm.state).toBe(ExecutionState.FAILED);

      await sm.transition('restart');
      expect(sm.state).toBe(ExecutionState.CREATED);
    });

    test('can restart from CANCELLED', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('cancel');

      await sm.transition('restart');
      expect(sm.state).toBe(ExecutionState.CREATED);
    });

    test('can restart from TIMED_OUT', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('global_timeout');
      expect(sm.state).toBe(ExecutionState.TIMED_OUT);

      await sm.transition('restart');
      expect(sm.state).toBe(ExecutionState.CREATED);
    });
  });

  describe('invalid transitions', () => {
    test('throws InvalidTransitionError for invalid transition', async () => {
      // Cannot go directly from CREATED to COMPLETED
      await expect(sm.transition('all_exits_done')).rejects.toThrow(InvalidTransitionError);
    });

    test('InvalidTransitionError has correct properties', async () => {
      try {
        await sm.transition('invalid_trigger');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidTransitionError);
        expect(error.from).toBe('CREATED');
        expect(error.trigger).toBe('invalid_trigger');
      }
    });

    test('cannot start without initializing', async () => {
      await expect(sm.transition('start')).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('guard conditions', () => {
    test('guard blocks transition when condition fails', async () => {
      await sm.transition('initialize');

      // Guard should block if validationPassed is false
      const result = await sm.transition('initialized', { validationPassed: false });
      expect(result).toBe(false);
      expect(sm.state).toBe(ExecutionState.INITIALIZING); // State unchanged
    });

    test('guard allows transition when condition passes', async () => {
      await sm.transition('initialize');

      const result = await sm.transition('initialized', { validationPassed: true });
      expect(result).toBe(true);
      expect(sm.state).toBe(ExecutionState.READY);
    });

    test('guard is skipped when ctx is null (for testing)', async () => {
      await sm.transition('initialize');

      // Without context, guard is skipped
      const result = await sm.transition('initialized');
      expect(result).toBe(true);
      expect(sm.state).toBe(ExecutionState.READY);
    });
  });

  describe('event emission', () => {
    test('emits transition event', async () => {
      const handler = jest.fn();
      sm.on('transition', handler);

      await sm.transition('initialize');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        from: 'CREATED',
        to: 'INITIALIZING',
        trigger: 'initialize'
      }));
    });

    test('emits enter:STATE event', async () => {
      const handler = jest.fn();
      sm.on('enter:INITIALIZING', handler);

      await sm.transition('initialize');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('emits exit:STATE event', async () => {
      const handler = jest.fn();
      sm.on('exit:CREATED', handler);

      await sm.transition('initialize');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('can unsubscribe from events', async () => {
      const handler = jest.fn();
      sm.on('transition', handler);
      sm.off('transition', handler);

      await sm.transition('initialize');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('history tracking', () => {
    test('records all transitions with timestamps', async () => {
      const beforeTime = Date.now();

      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      const afterTime = Date.now();

      expect(sm.history).toHaveLength(3);
      sm.history.forEach(entry => {
        expect(entry.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(entry.timestamp).toBeLessThanOrEqual(afterTime);
      });
    });

    test('history is immutable (returns copy)', () => {
      sm.history.push({ fake: 'entry' });
      expect(sm.history).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    test('canTransition returns correct values', () => {
      expect(sm.canTransition('initialize')).toBe(true);
      expect(sm.canTransition('start')).toBe(false);
      expect(sm.canTransition('invalid')).toBe(false);
    });

    test('getAvailableTriggers returns valid triggers', () => {
      const triggers = sm.getAvailableTriggers();
      expect(triggers).toContain('initialize');
      expect(triggers).not.toContain('start');
    });
  });

  describe('serialization', () => {
    test('toJSON captures current state', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');

      const json = sm.toJSON();
      expect(json.state).toBe('READY');
      expect(json.history).toHaveLength(2);
      expect(json.isTerminal).toBe(false);
      expect(json.isActive).toBe(false);
    });

    test('fromJSON restores state machine', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      const json = sm.toJSON();
      const restored = ExecutionStateMachine.fromJSON(json);

      expect(restored.state).toBe(sm.state);
      expect(restored.history).toEqual(sm.history);
    });
  });

  describe('waiting state transitions', () => {
    test('RUNNING → WAITING → RUNNING on signal', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      // Enter waiting
      await sm.transition('await_signal');
      expect(sm.state).toBe(ExecutionState.WAITING);
      expect(sm.isActive).toBe(true); // WAITING is considered active

      // Signal received
      await sm.transition('signal_received');
      expect(sm.state).toBe(ExecutionState.RUNNING);
    });

    test('WAITING → TIMED_OUT on signal_timeout', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');
      await sm.transition('await_signal');

      await sm.transition('signal_timeout');
      expect(sm.state).toBe(ExecutionState.TIMED_OUT);
      expect(sm.isTerminal).toBe(true);
    });
  });

  describe('failure transitions', () => {
    test('INITIALIZING → FAILED on validation_failed', async () => {
      await sm.transition('initialize');

      await sm.transition('validation_failed', { validationPassed: false });
      expect(sm.state).toBe(ExecutionState.FAILED);
    });

    test('RUNNING → FAILED on unrecoverable_error', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      await sm.transition('unrecoverable_error');
      expect(sm.state).toBe(ExecutionState.FAILED);
    });

    test('RUNNING → TIMED_OUT on global_timeout', async () => {
      await sm.transition('initialize');
      await sm.transition('initialized');
      await sm.transition('start');

      await sm.transition('global_timeout');
      expect(sm.state).toBe(ExecutionState.TIMED_OUT);
    });
  });
});
