/**
 * RuntimeSSEStreamer Tests
 */

const { RuntimeSSEStreamer, SSE_EVENTS } = require('../RuntimeSSEStreamer');
const { EventEmitter } = require('node:events');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create mock Express response
 */
function createMockResponse() {
  const chunks = [];
  return {
    chunks,
    headersSent: false,
    headers: {},
    setHeader: jest.fn((key, value) => {
      chunks.length; // Just to make linter happy
      // Store headers for verification
      if (!createMockResponse._headers) createMockResponse._headers = {};
      createMockResponse._headers[key] = value;
    }),
    write: jest.fn((chunk) => {
      chunks.push(chunk);
      return true;
    }),
    end: jest.fn(),

    /**
     * Parse SSE events from chunks
     */
    getEvents() {
      const text = chunks.join('');
      const events = [];
      const blocks = text.split('\n\n').filter(Boolean);

      for (const block of blocks) {
        if (block.startsWith(':')) continue; // heartbeat

        const lines = block.split('\n');
        const eventLine = lines.find(l => l.startsWith('event:'));
        const dataLine = lines.find(l => l.startsWith('data:'));

        if (eventLine && dataLine) {
          events.push({
            type: eventLine.replace('event: ', ''),
            data: JSON.parse(dataLine.replace('data: ', ''))
          });
        }
      }
      return events;
    },

    /**
     * Check if heartbeat was sent
     */
    hasHeartbeat() {
      return chunks.some(c => c === ':heartbeat\n\n');
    }
  };
}

/**
 * Create mock Express request
 */
function createMockRequest() {
  const listeners = {};
  return {
    setTimeout: jest.fn(),
    on: jest.fn((event, cb) => {
      listeners[event] = cb;
    }),
    _trigger: (event) => {
      if (listeners[event]) listeners[event]();
    },
    _listeners: listeners
  };
}

/**
 * Create mock RuntimeEngine
 */
function createMockRuntimeEngine() {
  const emitter = new EventEmitter();
  return {
    on: (event, handler) => emitter.on(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    emit: (event, data) => emitter.emit(event, data),
    getState: jest.fn(() => 'RUNNING'),
    getProgress: jest.fn(() => ({ completed: 2, total: 5, percentage: 40 })),
    _emitter: emitter
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - Construction', () => {
  test('requires runtimeEngine', () => {
    expect(() => new RuntimeSSEStreamer()).toThrow('requires a runtimeEngine');
    expect(() => new RuntimeSSEStreamer(null)).toThrow('requires a runtimeEngine');
  });

  test('accepts valid runtimeEngine', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    expect(streamer).toBeDefined();
    expect(streamer.runtimeEngine).toBe(engine);
  });

  test('initial state is not closed', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    expect(streamer.closed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: ATTACH
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - attach', () => {
  let engine, streamer, req, res;

  beforeEach(() => {
    engine = createMockRuntimeEngine();
    streamer = new RuntimeSSEStreamer(engine);
    req = createMockRequest();
    res = createMockResponse();
  });

  test('sets correct SSE headers', () => {
    streamer.attach(req, res, 'exec-1');

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });

  test('disables request timeout', () => {
    streamer.attach(req, res, 'exec-1');
    expect(req.setTimeout).toHaveBeenCalledWith(0);
  });

  test('sends connected event with executionId', () => {
    streamer.attach(req, res, 'exec-123');

    const events = res.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].type).toBe('connected');
    expect(events[0].data.executionId).toBe('exec-123');
    expect(events[0].data.timestamp).toBeDefined();
  });

  test('stores executionId', () => {
    streamer.attach(req, res, 'exec-456');
    expect(streamer.executionId).toBe('exec-456');
  });

  test('registers close handler', () => {
    streamer.attach(req, res, 'exec-1');
    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  test('cannot attach when closed', () => {
    streamer.attach(req, res, 'exec-1');
    streamer.detach();

    expect(() => streamer.attach(req, res, 'exec-2')).toThrow('Cannot attach: streamer is closed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: ENGINE EVENT FORWARDING
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - Engine Events', () => {
  let engine, streamer, req, res;

  beforeEach(() => {
    engine = createMockRuntimeEngine();
    streamer = new RuntimeSSEStreamer(engine);
    req = createMockRequest();
    res = createMockResponse();
    streamer.attach(req, res, 'exec-1');
  });

  afterEach(() => {
    streamer.detach();
  });

  test('node:stateChange to EXECUTING → SSE node:started', () => {
    engine.emit('node:stateChange', {
      nodeId: 'n1',
      toolId: 'text.sanitize',
      from: 'QUEUED',
      to: 'EXECUTING',
      attempt: 1
    });

    const events = res.getEvents();
    const started = events.find(e => e.type === 'node:started');

    expect(started).toBeDefined();
    expect(started.data.nodeId).toBe('n1');
    expect(started.data.toolId).toBe('text.sanitize');
    expect(started.data.executionId).toBe('exec-1');
  });

  test('node:completed → SSE node:completed', () => {
    engine.emit('node:completed', {
      nodeId: 'n1',
      output: { result: 'test' },
      metrics: { wallTimeMs: 100 }
    });

    const events = res.getEvents();
    const completed = events.find(e => e.type === 'node:completed');

    expect(completed).toBeDefined();
    expect(completed.data.nodeId).toBe('n1');
    expect(completed.data.output).toEqual({ result: 'test' });
    expect(completed.data.metrics).toEqual({ wallTimeMs: 100 });
  });

  test('node:failed with willRetry=true → SSE node:retry', () => {
    engine.emit('node:failed', {
      nodeId: 'n1',
      error: 'EXECUTION_ERROR',
      attempt: 1,
      willRetry: true,
      nextDelay: 1000
    });

    const events = res.getEvents();
    const retry = events.find(e => e.type === 'node:retry');

    expect(retry).toBeDefined();
    expect(retry.data.nodeId).toBe('n1');
    expect(retry.data.error).toBe('EXECUTION_ERROR');
    expect(retry.data.attempt).toBe(1);
    expect(retry.data.nextAttemptIn).toBe(1000);
  });

  test('node:failed with willRetry=false → SSE node:failed', () => {
    engine.emit('node:failed', {
      nodeId: 'n1',
      error: 'FATAL_ERROR',
      attempt: 3,
      willRetry: false
    });

    const events = res.getEvents();
    const failed = events.find(e => e.type === 'node:failed');

    expect(failed).toBeDefined();
    expect(failed.data.nodeId).toBe('n1');
    expect(failed.data.error).toBe('FATAL_ERROR');
    expect(failed.data.attempt).toBe(3);
  });

  test('execution:progress → SSE execution:progress', () => {
    engine.emit('execution:progress', {
      completed: 3,
      total: 5,
      percentage: 60,
      activeNodes: ['n3', 'n4']
    });

    const events = res.getEvents();
    const progress = events.find(e => e.type === 'execution:progress');

    expect(progress).toBeDefined();
    expect(progress.data.completed).toBe(3);
    expect(progress.data.total).toBe(5);
    expect(progress.data.percentage).toBe(60);
    expect(progress.data.activeNodes).toEqual(['n3', 'n4']);
  });

  test('execution:completed → SSE execution:completed + auto-detach', (done) => {
    engine.emit('execution:completed', {
      metrics: { totalDuration: 500 },
      totalDurationMs: 500,
      nodeResults: { n1: { status: 'SUCCEEDED' } }
    });

    const events = res.getEvents();
    const completed = events.find(e => e.type === 'execution:completed');

    expect(completed).toBeDefined();
    expect(completed.data.status).toBe('COMPLETED');
    expect(completed.data.duration).toBe(500);

    // Wait for auto-detach
    setTimeout(() => {
      expect(streamer.closed).toBe(true);
      done();
    }, 600);
  });

  test('execution:failed → SSE execution:failed + auto-detach', (done) => {
    engine.emit('execution:failed', {
      error: { code: 'TIMEOUT', message: 'Graph timeout' },
      failedNodes: ['n2'],
      metrics: {}
    });

    const events = res.getEvents();
    const failed = events.find(e => e.type === 'execution:failed');

    expect(failed).toBeDefined();
    expect(failed.data.status).toBe('FAILED');
    expect(failed.data.failedNodes).toEqual(['n2']);

    // Wait for auto-detach
    setTimeout(() => {
      expect(streamer.closed).toBe(true);
      done();
    }, 600);
  });

  test('execution:stateChange to PAUSED → SSE execution:paused', () => {
    engine.emit('execution:stateChange', {
      from: 'RUNNING',
      to: 'PAUSED'
    });

    const events = res.getEvents();
    const paused = events.find(e => e.type === 'execution:paused');

    expect(paused).toBeDefined();
    expect(paused.data.from).toBe('RUNNING');
  });

  test('execution:stateChange PAUSED → RUNNING → SSE execution:resumed', () => {
    engine.emit('execution:stateChange', {
      from: 'PAUSED',
      to: 'RUNNING'
    });

    const events = res.getEvents();
    const resumed = events.find(e => e.type === 'execution:resumed');

    expect(resumed).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: HEARTBEAT
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - Heartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('sends heartbeat every 15 seconds', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');

    // No heartbeat yet
    expect(res.hasHeartbeat()).toBe(false);

    // Advance time
    jest.advanceTimersByTime(15000);

    // Should have heartbeat now
    expect(res.hasHeartbeat()).toBe(true);

    streamer.detach();
  });

  test('stops heartbeat on detach', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.detach();

    const writeCalls = res.write.mock.calls.length;

    // Advance time
    jest.advanceTimersByTime(30000);

    // No new writes
    expect(res.write.mock.calls.length).toBe(writeCalls);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: DETACH
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - detach', () => {
  test('sets closed to true', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    expect(streamer.closed).toBe(false);

    streamer.detach();
    expect(streamer.closed).toBe(true);
  });

  test('calls res.end()', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.detach();

    expect(res.end).toHaveBeenCalled();
  });

  test('removes engine listeners', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');

    // Verify listeners exist
    expect(engine._emitter.listenerCount('node:completed')).toBeGreaterThan(0);

    streamer.detach();

    // Verify listeners removed
    expect(engine._emitter.listenerCount('node:completed')).toBe(0);
  });

  test('engine events after detach do not write to res', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.detach();

    const writeCalls = res.write.mock.calls.length;

    // Try to emit event
    engine.emit('node:completed', { nodeId: 'test' });

    // Should not add new writes
    expect(res.write.mock.calls.length).toBe(writeCalls);
  });

  test('detach is idempotent', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.detach();
    streamer.detach();
    streamer.detach();

    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('req.close triggers detach', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    expect(streamer.closed).toBe(false);

    // Simulate client disconnect
    req._trigger('close');

    expect(streamer.closed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: MANUAL EVENTS
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - Manual Events', () => {
  test('sendManualEvent sends custom event', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.sendManualEvent('custom:event', { foo: 'bar' });

    const events = res.getEvents();
    const custom = events.find(e => e.type === 'custom:event');

    expect(custom).toBeDefined();
    expect(custom.data.foo).toBe('bar');
    expect(custom.data.executionId).toBe('exec-1');
  });

  test('sendManualEvent returns false when closed', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.detach();

    const result = streamer.sendManualEvent('test', {});
    expect(result).toBe(false);
  });

  test('sendValidationWarning sends validation:warning event', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-1');
    streamer.sendValidationWarning({
      warnings: ['Orphan edge removed'],
      fixed: [{ type: 'orphan_edge', id: 'e-1' }],
      stats: { nodeCount: 3 }
    });

    const events = res.getEvents();
    const warning = events.find(e => e.type === 'validation:warning');

    expect(warning).toBeDefined();
    expect(warning.data.warnings).toContain('Orphan edge removed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: PAYLOAD CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeSSEStreamer - Payload Consistency', () => {
  test('all events include executionId and timestamp', () => {
    const engine = createMockRuntimeEngine();
    const streamer = new RuntimeSSEStreamer(engine);
    const req = createMockRequest();
    const res = createMockResponse();

    streamer.attach(req, res, 'exec-check');

    // Emit various events
    engine.emit('node:stateChange', { nodeId: 'n1', to: 'EXECUTING' });
    engine.emit('node:completed', { nodeId: 'n1', output: {} });
    engine.emit('execution:progress', { completed: 1, total: 2, percentage: 50 });

    const events = res.getEvents();

    for (const event of events) {
      expect(event.data.executionId).toBe('exec-check');
      expect(event.data.timestamp).toBeDefined();
      expect(typeof event.data.timestamp).toBe('number');
    }

    streamer.detach();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: SSE_EVENTS CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

describe('SSE_EVENTS Constants', () => {
  test('has all expected event types', () => {
    expect(SSE_EVENTS.CONNECTED).toBe('connected');
    expect(SSE_EVENTS.NODE_STARTED).toBe('node:started');
    expect(SSE_EVENTS.NODE_COMPLETED).toBe('node:completed');
    expect(SSE_EVENTS.NODE_FAILED).toBe('node:failed');
    expect(SSE_EVENTS.NODE_RETRY).toBe('node:retry');
    expect(SSE_EVENTS.EXECUTION_PROGRESS).toBe('execution:progress');
    expect(SSE_EVENTS.EXECUTION_COMPLETED).toBe('execution:completed');
    expect(SSE_EVENTS.EXECUTION_FAILED).toBe('execution:failed');
    expect(SSE_EVENTS.EXECUTION_CANCELLED).toBe('execution:cancelled');
    expect(SSE_EVENTS.EXECUTION_PAUSED).toBe('execution:paused');
    expect(SSE_EVENTS.EXECUTION_RESUMED).toBe('execution:resumed');
  });
});
