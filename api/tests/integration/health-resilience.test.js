/**
 * Health & Resilience Integration Tests (INT-006)
 *
 * Tests circuit breakers, resilient DB wrappers, and health endpoint
 * working together in degraded scenarios.
 *
 * Run: node api/tests/integration/health-resilience.test.js
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
  console.log('  Health & Resilience Integration (INT-006)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  const { CircuitBreaker, getCircuitBreaker, getAllStates } = require('../../src/utils/circuit-breaker');
  const { ResilientRedis } = require('../../src/db/resilient-redis');
  const { ResilientMemgraph } = require('../../src/db/resilient-memgraph');
  const { ResilientQdrant } = require('../../src/db/resilient-qdrant');

  // ── 1. Circuit Breaker → Resilient Redis ──────────────────────

  console.log('1. ResilientRedis with failing backend');

  await test('Redis GET degrades to memory fallback', async () => {
    const failClient = {
      get: () => Promise.reject(new Error('ECONNREFUSED')),
      set: () => Promise.reject(new Error('ECONNREFUSED')),
      del: () => Promise.reject(new Error('ECONNREFUSED')),
      incr: () => Promise.reject(new Error('ECONNREFUSED')),
      ping: () => Promise.reject(new Error('ECONNREFUSED'))
    };

    const redis = new ResilientRedis(failClient, {
      useFallback: true,
      failureThreshold: 1,
      resetTimeout: 60000
    });

    // SET stores in fallback
    const setResult = await redis.set('key', 'value');
    assertEq(setResult, 'OK', 'fallback SET');

    // GET reads from fallback
    const getResult = await redis.get('key');
    assertEq(getResult, 'value', 'fallback GET');
  });

  await test('Redis INCR works in fallback (rate limiting fail-open)', async () => {
    const failClient = {
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
      del: () => Promise.reject(new Error('down')),
      incr: () => Promise.reject(new Error('down')),
      ping: () => Promise.reject(new Error('down'))
    };

    const redis = new ResilientRedis(failClient, {
      useFallback: true,
      failureThreshold: 1,
      resetTimeout: 60000
    });

    const r1 = await redis.incr('counter');
    const r2 = await redis.incr('counter');
    const r3 = await redis.incr('counter');
    assertEq(r3, 3, 'memory counter incremented');
  });

  await test('Redis healthCheck reports unhealthy when down', async () => {
    const failClient = { ping: () => Promise.reject(new Error('timeout')) };
    const redis = new ResilientRedis(failClient, { failureThreshold: 1, resetTimeout: 60000 });

    const health = await redis.healthCheck();
    assertEq(health.healthy, false, 'unhealthy');
    assert(health.error, 'has error message');
  });

  // ── 2. ResilientMemgraph ──────────────────────────────────────

  console.log('\n2. ResilientMemgraph with failing backend');

  await test('Memgraph read query returns empty on failure', async () => {
    const failDriver = {
      session: () => ({
        run: () => Promise.reject(new Error('connection lost')),
        close: async () => {}
      }),
      verifyConnectivity: () => Promise.reject(new Error('refused'))
    };

    const mg = new ResilientMemgraph(failDriver, {
      failureThreshold: 1,
      resetTimeout: 60000
    });

    const result = await mg.query('MATCH (n) RETURN n');
    assert(Array.isArray(result), 'returns array');
    assertEq(result.length, 0, 'empty result');
  });

  await test('Memgraph write query propagates error', async () => {
    const failDriver = {
      session: () => ({
        run: () => Promise.reject(new Error('write failed')),
        close: async () => {}
      })
    };

    const mg = new ResilientMemgraph(failDriver, {
      failureThreshold: 1,
      resetTimeout: 60000
    });

    try {
      await mg.write('CREATE (n:Test {name: "test"})');
      assert(false, 'should throw');
    } catch (err) {
      assert(err.message.includes('write failed') || err.message.includes('OPEN'), 'propagates error');
    }
  });

  await test('Memgraph healthCheck reports unhealthy', async () => {
    const failDriver = {
      session: () => ({
        run: () => Promise.reject(new Error('down')),
        close: async () => {}
      })
    };

    const mg = new ResilientMemgraph(failDriver, {
      failureThreshold: 1,
      resetTimeout: 60000
    });

    const health = await mg.healthCheck();
    assertEq(health.healthy, false, 'unhealthy');
  });

  // ── 3. ResilientQdrant ────────────────────────────────────────

  console.log('\n3. ResilientQdrant with failing backend');

  await test('Qdrant search returns empty on failure', async () => {
    const failClient = {
      search: () => Promise.reject(new Error('qdrant down')),
      getCollections: () => Promise.reject(new Error('qdrant down'))
    };

    const qdrant = new ResilientQdrant(failClient, {
      failureThreshold: 1,
      resetTimeout: 60000
    });

    const results = await qdrant.search('collection', [0.1, 0.2, 0.3]);
    assert(Array.isArray(results), 'returns array');
    assertEq(results.length, 0, 'empty');
  });

  await test('Qdrant upsert propagates error (write must not silently fail)', async () => {
    const failClient = {
      upsert: () => Promise.reject(new Error('qdrant write failed'))
    };

    const qdrant = new ResilientQdrant(failClient, {
      failureThreshold: 1,
      resetTimeout: 60000
    });

    try {
      await qdrant.upsert('collection', [{ id: 1, vector: [0.1], payload: {} }]);
      assert(false, 'should throw');
    } catch (err) {
      assert(err.message.includes('write failed') || err.message.includes('OPEN'), 'error propagated');
    }
  });

  // ── 4. Circuit breaker registry ───────────────────────────────

  console.log('\n4. Circuit breaker registry across services');

  await test('getAllStates reflects all registered breakers', () => {
    // Previous tests registered redis, memgraph, qdrant breakers
    const states = getAllStates();
    assert(Object.keys(states).length >= 3, `has 3+ breakers, got ${Object.keys(states).length}`);
  });

  await test('breakers maintain independent state', () => {
    const b1 = new CircuitBreaker({ name: 'svc-a', failureThreshold: 2 });
    const b2 = new CircuitBreaker({ name: 'svc-b', failureThreshold: 2 });

    // Fail b1 to OPEN
    b1._onFailure(); b1._onFailure();
    assertEq(b1.state, 'OPEN', 'b1 open');
    assertEq(b2.state, 'CLOSED', 'b2 still closed');
  });

  // ── 5. Recovery scenario ──────────────────────────────────────

  console.log('\n5. Full recovery scenario');

  await test('service recovers after backend comes back', async () => {
    // Use standalone breaker to avoid registry interference
    const breaker = new CircuitBreaker({ name: 'recovery-test', failureThreshold: 2, resetTimeout: 50 });

    let shouldFail = true;

    // Phase 1: Fail the breaker
    for (let i = 0; i < 2; i++) {
      await breaker.execute(
        () => Promise.reject(new Error('down')),
        () => 'fallback'
      );
    }
    assertEq(breaker.state, 'OPEN', 'breaker opens');

    // Phase 2: Wait for reset timeout
    await new Promise(r => setTimeout(r, 80));

    // Phase 3: Backend comes back → half-open → success → closed
    shouldFail = false;
    const result = await breaker.execute(
      () => Promise.resolve('recovered'),
      () => 'fallback'
    );
    assertEq(result, 'recovered', 'uses real backend');
    assertEq(breaker.state, 'CLOSED', 'breaker closed after recovery');
  });

  // ── 6. Timeout utility integration ────────────────────────────

  console.log('\n6. Timeout utility');

  const { withTimeout, TimeoutError, TIMEOUTS } = require('../../src/utils/timeout');

  await test('withTimeout wraps circuit breaker operations', async () => {
    const breaker = new CircuitBreaker({ name: 'timeout-test', failureThreshold: 3 });

    const result = await withTimeout(
      breaker.execute(() => Promise.resolve('fast')),
      1000,
      'test-op'
    );
    assertEq(result, 'fast', 'passes through');
  });

  await test('withTimeout rejects slow circuit breaker operations', async () => {
    const breaker = new CircuitBreaker({ name: 'timeout-slow', failureThreshold: 3 });

    try {
      await withTimeout(
        breaker.execute(() => new Promise(r => setTimeout(() => r('slow'), 500))),
        50,
        'slow-op'
      );
      assert(false, 'should timeout');
    } catch (err) {
      assert(err instanceof TimeoutError || err.message.includes('timed out'), 'timeout error');
    }
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
