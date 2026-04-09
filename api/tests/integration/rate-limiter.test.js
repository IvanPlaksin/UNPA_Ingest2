/**
 * Rate Limiter Tests (PH-002)
 *
 * Run: node api/tests/integration/rate-limiter.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    errors.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}
function assert(c, m) { if (!c) throw new Error(`Assertion failed: ${m}`); }
function assertEq(a, b, l) { if (a !== b) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Rate Limiter Tests (PH-002)');
  console.log('═══════════════════════════════════════════════════\n');

  const { rateLimit, TIERS } = require('../../src/middleware/rate-limiter.middleware');

  console.log('1. Configuration');

  await test('5 tier configurations defined', () => {
    assertEq(Object.keys(TIERS).length, 5, 'tier count');
    assert(TIERS.aiChat, 'aiChat tier');
    assert(TIERS.patternAnalysis, 'patternAnalysis tier');
    assert(TIERS.patternReplace, 'patternReplace tier');
    assert(TIERS.workspaceAgent, 'workspaceAgent tier');
    assert(TIERS.general, 'general tier');
  });

  await test('aiChat: 20 req/min, patternReplace: 5 req/min', () => {
    assertEq(TIERS.aiChat.points, 20, 'aiChat points');
    assertEq(TIERS.patternReplace.points, 5, 'patternReplace points');
    assertEq(TIERS.general.points, 200, 'general points');
  });

  console.log('\n2. Middleware behaviour');

  await test('rateLimit returns a function', () => {
    const mw = rateLimit('aiChat');
    assertEq(typeof mw, 'function', 'is function');
  });

  await test('middleware allows requests within limit', async () => {
    const mw = rateLimit('general');

    // Simulate req/res/next
    const headers = {};
    const req = { ip: 'test-allow-' + Date.now(), method: 'POST', headers: {} };
    const res = {
      status: null,
      _headers: {},
      set: (obj) => Object.assign(res._headers, obj),
      status: function(code) { res._status = code; return { json: (body) => { res._body = body; } }; }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await mw(req, res, next);

    assertEq(nextCalled, true, 'next() called');
    assert(res._headers['X-RateLimit-Limit'] === '200', 'limit header');
    assert(parseInt(res._headers['X-RateLimit-Remaining']) >= 198, 'remaining > 198');
  });

  await test('middleware blocks after limit exceeded (low-limit tier)', async () => {
    const tier = 'patternReplace'; // 5 req/min
    const mw = rateLimit(tier);
    const testKey = 'test-block-' + Date.now();

    let blocked = false;
    let lastStatus = 0;
    let retryAfterSeen = false;

    for (let i = 0; i < 8; i++) {
      const req = { ip: testKey, headers: {} };
      const res = {
        _headers: {},
        set: (obj) => Object.assign(res._headers, obj),
        status: function(code) {
          lastStatus = code;
          return {
            json: (body) => {
              if (code === 429) {
                blocked = true;
                retryAfterSeen = !!body.error?.retryAfter;
              }
            }
          };
        }
      };
      let nextCalled = false;
      await mw(req, res, () => { nextCalled = true; });

      if (blocked) break;
    }

    assertEq(blocked, true, 'should block after 5 requests');
    assertEq(lastStatus, 429, 'HTTP 429');
    assertEq(retryAfterSeen, true, 'retryAfter in body');
  });

  await test('headers include X-RateLimit-Limit, Remaining, Reset', async () => {
    const mw = rateLimit('general');
    const req = { ip: 'test-headers-' + Date.now(), headers: {} };
    const res = { _headers: {}, set: (obj) => Object.assign(res._headers, obj) };
    await mw(req, res, () => {});

    assert(res._headers['X-RateLimit-Limit'], 'Limit header present');
    assert(res._headers['X-RateLimit-Remaining'], 'Remaining header present');
    assert(res._headers['X-RateLimit-Reset'], 'Reset header present');
  });

  await test('429 response includes Retry-After header', async () => {
    const mw = rateLimit('patternReplace');
    const testKey = 'test-retry2-' + Date.now();

    // Exhaust the limit (5 allowed + 1 to trigger 429)
    let lastHeaders = {};
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      const req = { ip: testKey, headers: {} };
      const captured = { headers: {} };
      const res = {
        _headers: {},
        set: function(keyOrObj, val) {
          if (typeof keyOrObj === 'string') captured.headers[keyOrObj] = val;
          else Object.assign(captured.headers, keyOrObj);
        },
        status: (code) => ({
          json: () => { if (code === 429) blocked = true; }
        })
      };
      await mw(req, res, () => {});
      if (blocked) {
        lastHeaders = captured.headers;
        break;
      }
    }

    assertEq(blocked, true, 'should block');
    assert(lastHeaders['Retry-After'], 'Retry-After header present');
    assert(parseInt(lastHeaders['Retry-After']) > 0, 'Retry-After > 0');
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

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
