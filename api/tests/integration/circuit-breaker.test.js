/**
 * Circuit Breaker + Resilient DB Tests (PH-007)
 *
 * Tests: CircuitBreaker states, registry, resilient wrappers
 *
 * Run: node api/tests/integration/circuit-breaker.test.js
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

async function run() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  Circuit Breaker + DB Resilience (PH-007)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  const { CircuitBreaker, getCircuitBreaker, getAllStates } = require('../../src/utils/circuit-breaker');

  // ── 1. CLOSED state ──────────────────────────────────────────

  console.log('1. CLOSED state');

  await test('allows operations through when CLOSED', async () => {
    const breaker = new CircuitBreaker({ name: 'test-closed', failureThreshold: 3 });
    const result = await breaker.execute(() => Promise.resolve('success'));
    assertEq(result, 'success', 'result');
    assertEq(breaker.state, 'CLOSED', 'state');
  });

  await test('counts failures without opening below threshold', async () => {
    const breaker = new CircuitBreaker({ name: 'test-count', failureThreshold: 5 });
    await breaker.execute(() => Promise.reject(new Error('fail')), () => 'fallback');
    await breaker.execute(() => Promise.reject(new Error('fail')), () => 'fallback');
    assertEq(breaker.state, 'CLOSED', 'still closed');
    assertEq(breaker.failures, 2, 'failure count');
  });

  await test('resets failure count on success', async () => {
    const breaker = new CircuitBreaker({ name: 'test-reset', failureThreshold: 5 });
    await breaker.execute(() => Promise.reject(new Error('fail')), () => null);
    await breaker.execute(() => Promise.reject(new Error('fail')), () => null);
    await breaker.execute(() => Promise.resolve('ok'));
    assertEq(breaker.failures, 0, 'reset to 0');
  });

  // ── 2. OPEN state ─────────────────────────────────────────────

  console.log('\n2. OPEN state');

  await test('transitions to OPEN after threshold', async () => {
    const breaker = new CircuitBreaker({ name: 'test-open', failureThreshold: 3 });
    for (let i = 0; i < 3; i++) {
      await breaker.execute(() => Promise.reject(new Error('fail')), () => null);
    }
    assertEq(breaker.state, 'OPEN', 'should be OPEN');
  });

  await test('uses fallback immediately when OPEN', async () => {
    const breaker = new CircuitBreaker({ name: 'test-open-fb', failureThreshold: 2, resetTimeout: 60000 });
    await breaker.execute(() => Promise.reject(new Error('fail')), () => null);
    await breaker.execute(() => Promise.reject(new Error('fail')), () => null);
    assertEq(breaker.state, 'OPEN', 'open');

    let primaryCalled = false;
    const result = await breaker.execute(
      () => { primaryCalled = true; return Promise.resolve('should not run'); },
      () => 'fallback'
    );
    assertEq(result, 'fallback', 'used fallback');
    assertEq(primaryCalled, false, 'primary not called');
  });

  await test('throws if OPEN and no fallback', async () => {
    const breaker = new CircuitBreaker({ name: 'test-open-throw', failureThreshold: 2, resetTimeout: 60000 });
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);

    try {
      await breaker.execute(() => Promise.resolve('x'));
      assert(false, 'should have thrown');
    } catch (err) {
      assert(err.message.includes('OPEN'), 'mentions OPEN');
    }
  });

  // ── 3. HALF_OPEN state ────────────────────────────────────────

  console.log('\n3. HALF_OPEN state');

  await test('transitions to HALF_OPEN after resetTimeout', async () => {
    const breaker = new CircuitBreaker({ name: 'test-half', failureThreshold: 2, resetTimeout: 50 });
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);
    assertEq(breaker.state, 'OPEN', 'open first');

    await new Promise(r => setTimeout(r, 80));
    await breaker.execute(() => Promise.resolve('test'));
    assertEq(breaker.state, 'CLOSED', 'should recover (halfOpenMax=1)');
  });

  await test('goes back to OPEN if half-open trial fails', async () => {
    const breaker = new CircuitBreaker({ name: 'test-half-fail', failureThreshold: 2, resetTimeout: 50, halfOpenMax: 2 });
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);

    await new Promise(r => setTimeout(r, 80));
    // First trial triggers HALF_OPEN
    await breaker.execute(() => Promise.reject(new Error('still broken')), () => null);
    assertEq(breaker.state, 'OPEN', 'back to OPEN');
  });

  // ── 4. Fallback ────────────────────────────────────────────────

  console.log('\n4. Fallback handling');

  await test('calls fallback function on failure', async () => {
    const breaker = new CircuitBreaker({ name: 'test-fb', failureThreshold: 5 });
    let fallbackError = null;
    const result = await breaker.execute(
      () => Promise.reject(new Error('primary fail')),
      (err) => { fallbackError = err; return 'fallback-value'; }
    );
    // Note: current implementation doesn't pass error to fallback
    assertEq(result, 'fallback-value', 'got fallback');
  });

  await test('propagates error if no fallback', async () => {
    const breaker = new CircuitBreaker({ name: 'test-no-fb', failureThreshold: 5 });
    try {
      await breaker.execute(() => Promise.reject(new Error('original error')));
      assert(false, 'should throw');
    } catch (err) {
      assertEq(err.message, 'original error', 'error propagated');
    }
  });

  // ── 5. getState & reset ────────────────────────────────────────

  console.log('\n5. State inspection and reset');

  await test('getState returns structured state', () => {
    const breaker = new CircuitBreaker({ name: 'test-state' });
    const state = breaker.getState();
    assertEq(state.name, 'test-state', 'name');
    assertEq(state.state, 'CLOSED', 'state');
    assertEq(state.failures, 0, 'failures');
  });

  await test('reset restores to CLOSED', async () => {
    const breaker = new CircuitBreaker({ name: 'test-rst', failureThreshold: 2 });
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);
    await breaker.execute(() => Promise.reject(new Error('f')), () => null);
    assertEq(breaker.state, 'OPEN', 'open');

    breaker.reset();
    assertEq(breaker.state, 'CLOSED', 'reset to closed');
    assertEq(breaker.failures, 0, 'failures reset');
  });

  // ── 6. Registry ────────────────────────────────────────────────

  console.log('\n6. Registry (getCircuitBreaker / getAllStates)');

  await test('getCircuitBreaker returns same instance', () => {
    const b1 = getCircuitBreaker('registry-test');
    const b2 = getCircuitBreaker('registry-test');
    assert(b1 === b2, 'same instance');
  });

  await test('getCircuitBreaker creates different for different names', () => {
    const b1 = getCircuitBreaker('reg-a');
    const b2 = getCircuitBreaker('reg-b');
    assert(b1 !== b2, 'different instances');
  });

  await test('getAllStates returns all registered breakers', () => {
    getCircuitBreaker('all-1');
    getCircuitBreaker('all-2');
    const states = getAllStates();
    assert(states['all-1'], 'has all-1');
    assert(states['all-2'], 'has all-2');
    assertEq(states['all-1'].state, 'CLOSED', 'all-1 closed');
  });

  // ── 7. Resilient wrappers exist ────────────────────────────────

  console.log('\n7. Resilient DB wrappers');

  const fs = require('fs');
  const path = require('path');

  await test('resilient-memgraph.js exports ResilientMemgraph', () => {
    const mod = require('../../src/db/resilient-memgraph');
    assert(mod.ResilientMemgraph, 'has ResilientMemgraph');
    assert(typeof mod.ResilientMemgraph === 'function', 'is constructor');
  });

  await test('resilient-qdrant.js exports ResilientQdrant', () => {
    const mod = require('../../src/db/resilient-qdrant');
    assert(mod.ResilientQdrant, 'has ResilientQdrant');
  });

  await test('resilient-redis.js exports ResilientRedis', () => {
    const mod = require('../../src/db/resilient-redis');
    assert(mod.ResilientRedis, 'has ResilientRedis');
  });

  await test('ResilientRedis fallback cache works', async () => {
    const { ResilientRedis } = require('../../src/db/resilient-redis');
    // Mock client that always fails
    const failClient = {
      get: () => Promise.reject(new Error('conn refused')),
      set: () => Promise.reject(new Error('conn refused')),
      del: () => Promise.reject(new Error('conn refused')),
      incr: () => Promise.reject(new Error('conn refused')),
      ping: () => Promise.reject(new Error('conn refused'))
    };

    const redis = new ResilientRedis(failClient, {
      useFallback: true,
      failureThreshold: 1,
      resetTimeout: 60000
    });

    // SET should store in fallback
    const setResult = await redis.set('test-key', 'test-value');
    assertEq(setResult, 'OK', 'fallback SET ok');

    // GET should read from fallback
    const getResult = await redis.get('test-key');
    assertEq(getResult, 'test-value', 'fallback GET ok');

    // INCR should work in fallback
    await redis.set('counter', '5');
    const incrResult = await redis.incr('counter');
    assertEq(incrResult, 6, 'fallback INCR ok');
  });

  await test('health route has /circuits endpoint', () => {
    const healthPath = path.resolve(__dirname, '../../src/routes/health.route.js');
    const content = fs.readFileSync(healthPath, 'utf8');
    assert(content.includes('/circuits'), 'has circuits endpoint');
    assert(content.includes('getAllStates'), 'uses getAllStates');
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
