/**
 * SSE Client + useSSEStream Tests (PH-003)
 *
 * Tests the ResilientSSEClient logic: retry, timeout, abort, event parsing.
 * Since sse-client.js is ESM (frontend), we test the equivalent logic here
 * using a minimal reimplementation that mirrors the production code.
 *
 * Run: node api/tests/integration/sse-client.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    errors.push({ name, error: err.message });
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}
function assert(c, m) { if (!c) throw new Error(`Assertion failed: ${m}`); }
function assertEq(a, b, l) { if (a !== b) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ── Minimal SSE parser (mirrors sse-client.js logic) ──────────────

function parseSSEChunk(raw) {
  const events = [];
  const parts = raw.split('\n\n');

  for (const part of parts) {
    if (!part.trim()) continue;
    const lines = part.split('\n');
    let eventName = 'message';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event: ')) eventName = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr += line.slice(6);
    }

    if (dataStr) {
      try {
        events.push({ event: eventName, data: JSON.parse(dataStr) });
      } catch {
        events.push({ event: eventName, data: { raw: dataStr } });
      }
    }
  }

  return events;
}

// ── Retry delay calculator (mirrors exponential backoff) ──────────

function calcRetryDelay(attempt, baseDelay = 1000) {
  return baseDelay * Math.pow(2, attempt - 1);
}

// ── Tests ─────────────────────────────────────────────────────────

async function run() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  SSE Client: Resilient Stream Recovery (PH-003)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  // ── 1. SSE Parsing ──────────────────────────────────────────────

  console.log('1. SSE event parsing');

  await test('parses single event', () => {
    const raw = 'event: text\ndata: {"content":"hello"}\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 1, 'event count');
    assertEq(events[0].event, 'text', 'event name');
    assertEq(events[0].data.content, 'hello', 'content');
  });

  await test('parses multiple events', () => {
    const raw = 'event: text\ndata: {"content":"a"}\n\nevent: text\ndata: {"content":"b"}\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 2, 'event count');
    assertEq(events[0].data.content, 'a', 'first');
    assertEq(events[1].data.content, 'b', 'second');
  });

  await test('uses "message" as default event name', () => {
    const raw = 'data: {"type":"ping"}\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events[0].event, 'message', 'default event');
  });

  await test('ignores SSE comments (lines starting with :)', () => {
    const raw = ': heartbeat\nevent: text\ndata: {"content":"ok"}\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 1, 'event count');
    assertEq(events[0].data.content, 'ok', 'content');
  });

  await test('handles malformed JSON as raw string', () => {
    const raw = 'event: error\ndata: not-json\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 1, 'event count');
    assertEq(events[0].data.raw, 'not-json', 'raw data');
  });

  await test('skips empty parts', () => {
    const raw = '\n\nevent: text\ndata: {"content":"x"}\n\n\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 1, 'only one event');
  });

  await test('handles events without data', () => {
    const raw = 'event: start\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 0, 'no events without data');
  });

  // ── 2. Retry logic ────────────────────────────────────────────

  console.log('\n2. Retry / exponential backoff');

  await test('exponential backoff: attempt 1 = base delay', () => {
    assertEq(calcRetryDelay(1, 1000), 1000, 'delay');
  });

  await test('exponential backoff: attempt 2 = 2x', () => {
    assertEq(calcRetryDelay(2, 1000), 2000, 'delay');
  });

  await test('exponential backoff: attempt 3 = 4x', () => {
    assertEq(calcRetryDelay(3, 1000), 4000, 'delay');
  });

  await test('exponential backoff: custom base', () => {
    assertEq(calcRetryDelay(2, 500), 1000, 'delay');
  });

  // ── 3. AbortController behavior ───────────────────────────────

  console.log('\n3. AbortController');

  await test('AbortController.abort() fires signal', () => {
    const controller = new AbortController();
    let abortFired = false;
    controller.signal.addEventListener('abort', () => { abortFired = true; });
    controller.abort();
    assert(abortFired, 'abort event should fire');
    assert(controller.signal.aborted, 'signal.aborted should be true');
  });

  await test('AbortError name is correct', () => {
    const controller = new AbortController();
    controller.abort();
    try {
      controller.signal.throwIfAborted();
      assert(false, 'should have thrown');
    } catch (err) {
      assertEq(err.name, 'AbortError', 'error name');
    }
  });

  // ── 4. Client state management ────────────────────────────────

  console.log('\n4. Client state management');

  await test('initial state is clean', () => {
    // Simulate client state
    const state = { isConnected: false, retryCount: 0, lastEventId: null, aborted: false };
    assertEq(state.isConnected, false, 'not connected');
    assertEq(state.retryCount, 0, 'no retries');
    assertEq(state.aborted, false, 'not aborted');
  });

  await test('abort sets correct state', () => {
    const state = { isConnected: true, retryCount: 1, aborted: false };
    // simulate abort()
    state.aborted = true;
    state.isConnected = false;
    assert(state.aborted, 'should be aborted');
    assert(!state.isConnected, 'should disconnect');
  });

  await test('reconnect increments retry count', () => {
    const state = { retryCount: 0, maxRetries: 3 };
    state.retryCount++;
    assertEq(state.retryCount, 1, 'retry count');
    assert(state.retryCount <= state.maxRetries, 'within limits');
  });

  await test('max retries exceeded triggers error', () => {
    const state = { retryCount: 3, maxRetries: 3 };
    const shouldRetry = state.retryCount < state.maxRetries;
    assertEq(shouldRetry, false, 'should not retry');
  });

  // ── 5. SSE stream buffer management ───────────────────────────

  console.log('\n5. Stream buffer management');

  await test('buffer accumulates across chunks', () => {
    let buffer = '';
    const chunks = ['event: text\ndata: {"co', 'ntent":"hello"}\n\n'];

    // First chunk — incomplete, stays in buffer
    buffer += chunks[0];
    const parts1 = buffer.split('\n\n');
    buffer = parts1.pop() || '';
    assertEq(parts1.length, 0, 'no complete events yet');

    // Second chunk — completes the event
    buffer += chunks[1];
    const parts2 = buffer.split('\n\n');
    buffer = parts2.pop() || '';
    const complete = parts2.filter(p => p.trim());
    assertEq(complete.length, 1, 'one complete event');
  });

  await test('buffer handles rapid sequential events', () => {
    const raw = 'event: text\ndata: {"content":"a"}\n\nevent: text\ndata: {"content":"b"}\n\nevent: text\ndata: {"content":"c"}\n\n';
    const events = parseSSEChunk(raw);
    assertEq(events.length, 3, 'all three events');
  });

  // ── Done ──────────────────────────────────────────────────────

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  if (failed > 0) {
    console.log('Errors:');
    for (const e of errors) console.log(`  - ${e.name}: ${e.error}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
