/**
 * Structured Logging + Metrics Tests (PH-005)
 *
 * Tests:
 *   1. Logger — levels, redaction, child loggers, request context
 *   2. Metrics service — counters, histograms, percentiles, reset
 *   3. Metrics middleware — endpoint tracking
 *
 * Run: node api/tests/integration/metrics-logging.test.js
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
  console.log('  Structured Logging + Metrics (PH-005)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  // ── 1. Logger ──────────────────────────────────────────────────

  console.log('1. Structured Logger');

  const logger = require('../../src/utils/logger');

  await test('logger has log methods', () => {
    assert(typeof logger.info === 'function', 'info');
    assert(typeof logger.warn === 'function', 'warn');
    assert(typeof logger.error === 'function', 'error');
    assert(typeof logger.debug === 'function', 'debug');
  });

  await test('logger.child creates child logger', () => {
    const child = logger.child('TestModule');
    assert(child !== logger, 'different instance');
    assert(typeof child.info === 'function', 'has info');
    assertEq(child.module, 'TestModule', 'module name');
  });

  await test('logger redacts sensitive data', () => {
    const redacted = logger._redact({
      username: 'ivan',
      password: 'secret123',
      apiKey: 'key-xxx',
      token: 'tok-yyy',
      data: 'safe'
    });
    assertEq(redacted.username, 'ivan', 'username preserved');
    assertEq(redacted.password, '[REDACTED]', 'password redacted');
    assertEq(redacted.apiKey, '[REDACTED]', 'apiKey redacted');
    assertEq(redacted.token, '[REDACTED]', 'token redacted');
    assertEq(redacted.data, 'safe', 'data preserved');
  });

  await test('logger redacts nested sensitive fields', () => {
    const redacted = logger._redact({
      config: {
        password: 'secret',
        host: 'localhost'
      }
    });
    assertEq(redacted.config.password, '[REDACTED]', 'nested redaction');
    assertEq(redacted.config.host, 'localhost', 'nested safe');
  });

  await test('logger has domain-specific children', () => {
    assert(logger.workspace, 'workspace logger');
    assert(logger.catalog, 'catalog logger');
    assert(logger.agent, 'agent logger');
    assert(logger.security, 'security logger');
  });

  await test('logger.withRequest creates contextual logger', () => {
    const req = {
      requestId: 'req-123',
      headers: { 'x-user-id': 'user-456' },
      params: { id: 'ws-789' }
    };
    const ctxLogger = logger.withRequest(req);
    assertEq(ctxLogger.context.requestId, 'req-123', 'requestId');
    assertEq(ctxLogger.context.workspaceId, 'ws-789', 'workspaceId');
  });

  // ── 2. Metrics Service ─────────────────────────────────────────

  console.log('\n2. Metrics Service');

  const metrics = require('../../src/services/observability/metrics.service');
  metrics.reset();

  await test('increment counter', () => {
    metrics.increment('test.counter');
    metrics.increment('test.counter');
    metrics.increment('test.counter');
    assertEq(metrics.getCounter('test.counter'), 3, 'counter');
  });

  await test('increment by custom value', () => {
    metrics.increment('test.bulk', 10);
    assertEq(metrics.getCounter('test.bulk'), 10, 'bulk');
  });

  await test('recordValue and getHistogramStats', () => {
    metrics.reset();
    metrics.recordValue('test.duration', 100);
    metrics.recordValue('test.duration', 200);
    metrics.recordValue('test.duration', 300);

    const stats = metrics.getHistogramStats('test.duration');
    assertEq(stats.count, 3, 'count');
    assertEq(stats.avg, 200, 'avg');
    assertEq(stats.min, 100, 'min');
    assertEq(stats.max, 300, 'max');
  });

  await test('getHistogramStats p95', () => {
    metrics.reset();
    for (let i = 1; i <= 100; i++) {
      metrics.recordValue('test.p95', i);
    }
    const stats = metrics.getHistogramStats('test.p95');
    assert(stats.p95 >= 94 && stats.p95 <= 96, `p95 should be ~95, got ${stats.p95}`);
  });

  await test('recordRanked and getTopK', () => {
    metrics.reset();
    metrics.recordRanked('test.tools', 'search');
    metrics.recordRanked('test.tools', 'search');
    metrics.recordRanked('test.tools', 'search');
    metrics.recordRanked('test.tools', 'analyze');
    metrics.recordRanked('test.tools', 'analyze');
    metrics.recordRanked('test.tools', 'validate');

    const top = metrics.getTopK('test.tools', 3);
    assertEq(top.length, 3, 'top 3');
    assertEq(top[0].key, 'search', 'first');
    assertEq(top[0].count, 3, 'first count');
    assertEq(top[1].key, 'analyze', 'second');
  });

  await test('reset clears everything', () => {
    metrics.increment('before.reset');
    metrics.recordValue('before.reset.hist', 42);
    metrics.reset();

    assertEq(metrics.getCounter('before.reset'), 0, 'counter cleared');
    const stats = metrics.getHistogramStats('before.reset.hist');
    assertEq(stats.count, 0, 'histogram cleared');
  });

  await test('getSummary returns structured data', () => {
    metrics.reset();
    metrics.increment('codex.search.count', 5);
    metrics.increment('agent.tool.calls.count', 3);

    const summary = metrics.getSummary();
    assert(summary.uptime, 'has uptime');
    assert(summary.uptime.since, 'has since');
    assertEq(summary.codex.searchCount, 5, 'codex count');
    assertEq(summary.agents.totalToolCalls, 3, 'agent count');
  });

  await test('recordToolCall tracks name and duration', () => {
    metrics.reset();
    metrics.recordToolCall('workspace_create_draft', 150);
    metrics.recordToolCall('workspace_create_draft', 250);
    metrics.recordToolCall('workspace_search_drafts', 50);

    assertEq(metrics.getCounter('agent.tool.calls.count'), 3, 'total');
    const top = metrics.getTopK('agent.tool.calls.by_name');
    assertEq(top[0].key, 'workspace_create_draft', 'top tool');
    assertEq(top[0].count, 2, 'top count');
  });

  // ── 3. Metrics Middleware ──────────────────────────────────────

  console.log('\n3. Metrics Middleware');

  const { getMetricName, TRACKED_PATTERNS } = require('../../src/middleware/metrics.middleware');

  await test('getMetricName matches tracked route', () => {
    const req = {
      method: 'POST',
      baseUrl: '/api/v1/workspaces',
      route: { path: '/:id/agent/message' }
    };
    assertEq(getMetricName(req), 'workspace_agent_message', 'metric name');
  });

  await test('getMetricName returns null for untracked route', () => {
    const req = {
      method: 'GET',
      baseUrl: '/api/v1/health',
      route: { path: '/' }
    };
    assertEq(getMetricName(req), null, 'null for untracked');
  });

  await test('getMetricName returns null without route', () => {
    const req = { method: 'GET', path: '/health' };
    assertEq(getMetricName(req), null, 'null without route');
  });

  await test('TRACKED_PATTERNS has all critical endpoints', () => {
    const keys = Object.keys(TRACKED_PATTERNS);
    assert(keys.length >= 8, `should have 8+ tracked endpoints, got ${keys.length}`);
    assert(keys.some(k => k.includes('assistant/chat')), 'has assistant chat');
    assert(keys.some(k => k.includes('agent/message')), 'has agent message');
    assert(keys.some(k => k.includes('patterns/analyze')), 'has pattern analyze');
  });

  // ── 4. Request Logger ──────────────────────────────────────────

  console.log('\n4. Request Logger');

  const { generateRequestId } = require('../../src/middleware/request-logger');

  await test('generateRequestId returns unique IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    assert(id1 !== id2, 'should be unique');
    assert(id1.startsWith('req-'), 'should start with req-');
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
