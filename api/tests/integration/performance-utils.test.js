/**
 * Performance Utilities Tests (PH-006)
 *
 * Tests: withTimeout, TimeoutError, TIMEOUTS, pattern-matcher timeouts
 *
 * Run: node api/tests/integration/performance-utils.test.js
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
  console.log('  Performance Utilities (PH-006)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  // ── 1. withTimeout ─────────────────────────────────────────────

  console.log('1. withTimeout utility');

  const { withTimeout, TimeoutError, TIMEOUTS } = require('../../src/utils/timeout');

  await test('resolves fast promise before timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'Test');
    assertEq(result, 'ok', 'result');
  });

  await test('rejects slow promise with TimeoutError', async () => {
    const slow = new Promise(resolve => setTimeout(() => resolve('late'), 500));
    try {
      await withTimeout(slow, 50, 'SlowOp');
      assert(false, 'should have thrown');
    } catch (err) {
      assertEq(err.name, 'TimeoutError', 'error name');
      assertEq(err.code, 'TIMEOUT', 'error code');
      assert(err.message.includes('SlowOp'), 'includes operation name');
      assert(err.message.includes('50ms'), 'includes timeout value');
    }
  });

  await test('passes through rejection from original promise', async () => {
    const failing = Promise.reject(new Error('original error'));
    try {
      await withTimeout(failing, 1000, 'Test');
      assert(false, 'should have thrown');
    } catch (err) {
      assertEq(err.message, 'original error', 'passes through');
    }
  });

  await test('TimeoutError instanceof Error', () => {
    const err = new TimeoutError('test');
    assert(err instanceof Error, 'is Error');
    assertEq(err.name, 'TimeoutError', 'name');
    assertEq(err.code, 'TIMEOUT', 'code');
  });

  // ── 2. TIMEOUTS constants ─────────────────────────────────────

  console.log('\n2. TIMEOUTS constants');

  await test('TIMEOUTS has all expected keys', () => {
    assert(TIMEOUTS.EMBED_TEXT === 10000, 'EMBED_TEXT');
    assert(TIMEOUTS.PATTERN_ANALYZE === 30000, 'PATTERN_ANALYZE');
    assert(TIMEOUTS.PATTERN_MATCH === 15000, 'PATTERN_MATCH');
    assert(TIMEOUTS.PATTERN_REPLACE === 20000, 'PATTERN_REPLACE');
    assert(TIMEOUTS.AI_COMPLETION === 120000, 'AI_COMPLETION');
    assert(TIMEOUTS.AI_TOOL_CALL === 30000, 'AI_TOOL_CALL');
    assert(TIMEOUTS.GRAPH_QUERY === 10000, 'GRAPH_QUERY');
  });

  await test('all TIMEOUTS are positive numbers', () => {
    for (const [key, val] of Object.entries(TIMEOUTS)) {
      assert(typeof val === 'number' && val > 0, `${key} should be positive number, got ${val}`);
    }
  });

  // ── 3. Pattern Matcher timeouts ────────────────────────────────

  console.log('\n3. Pattern Matcher timeout config');

  // We can't test the full service (needs Memgraph), but we can verify the timeout config exists
  const patternMatcherSource = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../src/services/catalog/pattern-matcher.service.js'),
    'utf8'
  );

  await test('pattern-matcher.service.js has TIMEOUTS config', () => {
    assert(patternMatcherSource.includes('TIMEOUTS'), 'has TIMEOUTS');
    assert(patternMatcherSource.includes('analyzePatterns'), 'has analyzePatterns timeout');
    assert(patternMatcherSource.includes('findMatches'), 'has findMatches timeout');
    assert(patternMatcherSource.includes('executeReplacement'), 'has executeReplacement timeout');
  });

  await test('pattern-matcher has withTimeout function', () => {
    assert(patternMatcherSource.includes('withTimeout'), 'has withTimeout');
  });

  await test('pattern-matcher timeout values are reasonable', () => {
    // Extract timeout values from source
    const match30 = patternMatcherSource.match(/analyzePatterns:\s*(\d+)/);
    const match15 = patternMatcherSource.match(/findMatches:\s*(\d+)/);
    const match20 = patternMatcherSource.match(/executeReplacement:\s*(\d+)/);

    assert(match30 && parseInt(match30[1]) >= 15000, 'analyzePatterns >= 15s');
    assert(match15 && parseInt(match15[1]) >= 10000, 'findMatches >= 10s');
    assert(match20 && parseInt(match20[1]) >= 15000, 'executeReplacement >= 15s');
  });

  // ── 4. Cache utility ──────────────────────────────────────────

  console.log('\n4. SimpleCache (frontend file existence check)');

  const fs = require('fs');
  const path = require('path');

  await test('cache.js exists in mcp/src/utils/', () => {
    const cachePath = path.resolve(__dirname, '../../../mcp/src/utils/cache.js');
    assert(fs.existsSync(cachePath), 'cache.js exists');
  });

  await test('useDebounce.js has throttle/debounce callbacks', () => {
    const hookPath = path.resolve(__dirname, '../../../mcp/src/hooks/useDebounce.js');
    const content = fs.readFileSync(hookPath, 'utf8');
    assert(content.includes('useDebouncedCallback'), 'has useDebouncedCallback');
    assert(content.includes('useThrottledCallback'), 'has useThrottledCallback');
  });

  await test('UnifiedToolCatalog uses debounced search', () => {
    const catalogPath = path.resolve(__dirname, '../../../mcp/src/components/Catalog/UnifiedToolCatalog.jsx');
    const content = fs.readFileSync(catalogPath, 'utf8');
    assert(content.includes('useDebounce'), 'imports useDebounce');
    assert(content.includes('debouncedSearch'), 'uses debouncedSearch');
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
