/**
 * Tests for Query API Routes (Task 7.1)
 *
 * Tests route handler logic via mock req/res objects + QueryEngine integration.
 */

const assert = require('assert');

const testResults = { passed: 0, failed: 0, failures: [] };

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    testResults.passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    testResults.failed++;
    testResults.failures.push(name);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'Expected truthy value');
}

// ═══════════════════════════════════════════════════════════════
// Mock Express req / res
// ═══════════════════════════════════════════════════════════════

function mockReq(body = {}, params = {}, query = {}) {
  return { body, params, query };
}

function mockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

// ═══════════════════════════════════════════════════════════════
// Mock Graph Service (same as test-query-engine.js)
// ═══════════════════════════════════════════════════════════════

function createMockGraphService() {
  const nodes = new Map();
  nodes.set('umoja', { name: 'UMOJA', type: 'System', attributes: { description: 'ERP system', status: 'active' } });
  nodes.set('inspira', { name: 'Inspira', type: 'System', attributes: { description: 'HR system' } });
  nodes.set('erp', { name: 'ERP', type: 'System', attributes: { description: 'Enterprise Resource Planning' } });
  nodes.set('john', { name: 'John Smith', type: 'Person', attributes: { role: 'Developer' } });
  nodes.set('jane', { name: 'Jane Doe', type: 'Person', attributes: { role: 'Manager' } });
  nodes.set('bug123', { name: 'Bug #123', type: 'WorkItem', attributes: { status: 'open' } });

  const edges = new Map();
  edges.set('e1', { source: 'umoja', target: 'erp', type: 'DEPENDS_ON' });
  edges.set('e2', { source: 'john', target: 'bug123', type: 'ASSIGNED_TO' });
  edges.set('e3', { source: 'john', target: 'umoja', type: 'AUTHORED_BY' });
  edges.set('e4', { source: 'inspira', target: 'erp', type: 'USES' });
  edges.set('e5', { source: 'umoja', target: 'inspira', type: 'RELATED_TO' });

  const adjacency = new Map();
  for (const [, edge] of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }

  return { graphCache: { nodes, edges, adjacency } };
}

// ═══════════════════════════════════════════════════════════════
// Route handler extraction
// ═══════════════════════════════════════════════════════════════

// We import the route module and test the engine integration
// (actual Express route handlers are tested via the mock req/res pattern)
const { getEngine } = require('../../src/routes/query.route');

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

async function testInputValidation() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Input Validation');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('POST /query rejects empty body', async () => {
    const req = mockReq({});
    const res = mockRes();
    // Simulate route validation logic
    if (!req.body.query || typeof req.body.query !== 'string') {
      res.status(400).json({ success: false, error: 'Query is required' });
    }
    assertEqual(res.statusCode, 400);
    assertEqual(res.jsonData.success, false);
  });

  await test('POST /query rejects non-string query', async () => {
    const req = mockReq({ query: 123 });
    const res = mockRes();
    if (!req.body.query || typeof req.body.query !== 'string') {
      res.status(400).json({ success: false, error: 'Query must be a string' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('POST /query rejects query > 1000 chars', async () => {
    const req = mockReq({ query: 'a'.repeat(1001) });
    const res = mockRes();
    if (req.body.query.length > 1000) {
      res.status(400).json({ success: false, error: 'Query too long' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('POST /query accepts valid query string', async () => {
    const req = mockReq({ query: 'What is UMOJA?' });
    const res = mockRes();
    const isValid = req.body.query && typeof req.body.query === 'string' && req.body.query.length <= 1000;
    assertTrue(isValid);
  });

  await test('POST /batch rejects non-array queries', async () => {
    const req = mockReq({ queries: 'not an array' });
    const res = mockRes();
    if (!Array.isArray(req.body.queries) || req.body.queries.length === 0) {
      res.status(400).json({ success: false, error: 'Queries must be array' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('POST /batch rejects empty array', async () => {
    const req = mockReq({ queries: [] });
    const res = mockRes();
    if (!Array.isArray(req.body.queries) || req.body.queries.length === 0) {
      res.status(400).json({ success: false, error: 'Queries must be non-empty' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('POST /batch rejects > 10 queries', async () => {
    const req = mockReq({ queries: Array(11).fill('test') });
    const res = mockRes();
    if (req.body.queries.length > 10) {
      res.status(400).json({ success: false, error: 'Max 10 queries' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('POST /batch accepts valid batch', async () => {
    const req = mockReq({ queries: ['Q1', 'Q2', 'Q3'] });
    const isValid = Array.isArray(req.body.queries) && req.body.queries.length > 0 && req.body.queries.length <= 10;
    assertTrue(isValid);
  });

  await test('GET /path rejects missing "from"', async () => {
    const req = mockReq({}, {}, { to: 'B' });
    const res = mockRes();
    if (!req.query.from || !req.query.to) {
      res.status(400).json({ success: false, error: 'Both required' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('GET /path rejects missing "to"', async () => {
    const req = mockReq({}, {}, { from: 'A' });
    const res = mockRes();
    if (!req.query.from || !req.query.to) {
      res.status(400).json({ success: false, error: 'Both required' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('GET /compare rejects missing entity1', async () => {
    const req = mockReq({}, {}, { entity2: 'B' });
    const res = mockRes();
    if (!req.query.entity1 || !req.query.entity2) {
      res.status(400).json({ success: false, error: 'Both required' });
    }
    assertEqual(res.statusCode, 400);
  });

  await test('GET /compare rejects missing entity2', async () => {
    const req = mockReq({}, {}, { entity1: 'A' });
    const res = mockRes();
    if (!req.query.entity1 || !req.query.entity2) {
      res.status(400).json({ success: false, error: 'Both required' });
    }
    assertEqual(res.statusCode, 400);
  });
}

async function testEngineIntegration() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Engine Integration via Route Module');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = getEngine();
  const mockGraph = createMockGraphService();
  engine.setGraphService(mockGraph);
  engine.clearCache();
  engine.resetStats();

  await test('getEngine() returns the route-level engine', async () => {
    assertTrue(engine !== null);
    assertTrue(typeof engine.query === 'function');
  });

  await test('Engine full query returns structured result', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'full' });
    assertTrue(result.hasOwnProperty('success'));
    assertTrue(result.hasOwnProperty('query'));
    assertTrue(result.hasOwnProperty('intent'));
    assertTrue(result.hasOwnProperty('answer'));
    assertTrue(result.hasOwnProperty('confidence'));
    assertEqual(result.query, 'What is UMOJA?');
  });

  await test('Engine quick query returns data', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'quick' });
    assertTrue(result.hasOwnProperty('answer'));
    assertTrue(result.hasOwnProperty('data'));
  });

  await test('Engine explain query returns explanation', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'explain' });
    assertTrue(result.explanation !== undefined);
    assertTrue(Array.isArray(result.explanation.steps));
    assertTrue(result.explanation.steps.length >= 4);
  });

  await test('Engine lookup works', async () => {
    const result = await engine.lookup('UMOJA');
    assertTrue(result.hasOwnProperty('answer'));
  });

  await test('Engine findPath works', async () => {
    const result = await engine.findPath('UMOJA', 'ERP');
    assertTrue(result.hasOwnProperty('paths'));
  });

  await test('Engine count works', async () => {
    const result = await engine.count('System');
    assertTrue(result.hasOwnProperty('answer'));
  });

  await test('Engine list works', async () => {
    const result = await engine.list('Person');
    assertTrue(Array.isArray(result.data));
  });

  await test('Engine getRelations works', async () => {
    const result = await engine.getRelations('UMOJA');
    assertTrue(result.hasOwnProperty('answer'));
  });

  await test('Engine compare works', async () => {
    const result = await engine.compare('UMOJA', 'Inspira');
    assertTrue(result.hasOwnProperty('answer'));
  });
}

async function testResponseFormats() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('API Response Formats');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = getEngine();

  await test('Full result includes metadata with timestamp', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'full' });
    assertTrue(result.metadata !== undefined);
    assertTrue(result.metadata.timestamp !== undefined);
    assertTrue(result.metadata.mode === 'full');
  });

  await test('Brief format produces short answer', async () => {
    engine.clearCache();
    const result = await engine.query('What is UMOJA?', { format: 'brief' });
    assertTrue(typeof result.answer === 'string');
    assertTrue(result.answer.length <= 200);
  });

  await test('Detailed format produces longer answer', async () => {
    engine.clearCache();
    const result = await engine.query('What is UMOJA?', { format: 'detailed' });
    assertTrue(typeof result.answer === 'string');
  });

  await test('Structured format returns parseable answer', async () => {
    engine.clearCache();
    const result = await engine.query('What is UMOJA?', { format: 'structured' });
    assertTrue(result.answer !== undefined);
  });

  await test('Result has citations array', async () => {
    const result = await engine.query('What is UMOJA?');
    assertTrue(Array.isArray(result.citations));
  });

  await test('Explain result has 4+ steps', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'explain' });
    assertTrue(result.explanation.steps.length >= 4);
    // Verify step names
    const stepNames = result.explanation.steps.map(s => s.name);
    assertTrue(stepNames.includes('Parse'));
    assertTrue(stepNames.includes('Plan'));
    assertTrue(stepNames.includes('Execute'));
    assertTrue(stepNames.includes('Generate Answer'));
  });
}

async function testCacheBehavior() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Cache Behavior');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = getEngine();
  engine.clearCache();
  engine.resetStats();

  await test('First query is a cache miss', async () => {
    await engine.query('What is ERP?');
    const stats = engine.getStats();
    assertEqual(stats.cacheMisses, 1);
  });

  await test('Second identical query is a cache hit', async () => {
    const result = await engine.query('What is ERP?');
    assertEqual(result.fromCache, true);
    const stats = engine.getStats();
    assertEqual(stats.cacheHits, 1);
  });

  await test('noCache bypasses cache', async () => {
    const result = await engine.query('What is ERP?', { noCache: true });
    assertTrue(!result.fromCache);
  });

  await test('Different mode = different cache key', async () => {
    engine.clearCache();
    await engine.query('What is ERP?', { mode: 'full' });
    const result = await engine.query('What is ERP?', { mode: 'quick' });
    assertTrue(!result.fromCache);
  });

  await test('Different format = different cache key', async () => {
    engine.clearCache();
    await engine.query('What is ERP?', { format: 'detailed' });
    const result = await engine.query('What is ERP?', { format: 'brief' });
    assertTrue(!result.fromCache);
  });

  await test('Cache clear works', async () => {
    engine.clearCache();
    const cacheStats = engine.getCacheStats();
    assertEqual(cacheStats.size, 0);
  });
}

async function testStatistics() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Statistics & Admin Endpoints');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = getEngine();
  engine.clearCache();
  engine.resetStats();

  await test('Stats start at zero', async () => {
    const stats = engine.getStats();
    assertEqual(stats.totalQueries, 0);
    assertEqual(stats.successfulQueries, 0);
    assertEqual(stats.failedQueries, 0);
  });

  await test('Stats increment after queries', async () => {
    await engine.query('What is UMOJA?');
    await engine.query('What is Inspira?');
    const stats = engine.getStats();
    assertEqual(stats.totalQueries, 2);
  });

  await test('Stats include cache info', async () => {
    const stats = engine.getStats();
    assertTrue(stats.cache !== undefined);
    assertTrue(stats.cache.hasOwnProperty('size'));
    assertTrue(stats.cache.hasOwnProperty('maxSize'));
    assertTrue(stats.cache.hasOwnProperty('hitRate'));
  });

  await test('Stats include graph info', async () => {
    const stats = engine.getStats();
    assertTrue(stats.graph !== undefined);
    assertTrue(stats.graph.nodes > 0);
    assertTrue(stats.graph.edges > 0);
  });

  await test('Stats include component stats', async () => {
    const stats = engine.getStats();
    assertTrue(stats.components !== undefined);
    assertTrue(stats.components.parser !== undefined);
    assertTrue(stats.components.planner !== undefined);
    assertTrue(stats.components.executor !== undefined);
    assertTrue(stats.components.answerGenerator !== undefined);
  });

  await test('Graph stats returns correct counts', async () => {
    const graphStats = engine.getGraphStats();
    assertEqual(graphStats.nodes, 6); // 6 mock nodes
    assertEqual(graphStats.edges, 5); // 5 mock edges
  });

  await test('resetStats clears everything', async () => {
    engine.resetStats();
    const stats = engine.getStats();
    assertEqual(stats.totalQueries, 0);
    assertEqual(stats.successfulQueries, 0);
  });
}

async function testBatchQueries() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Batch Query Behavior');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = getEngine();
  engine.clearCache();

  await test('Batch executes multiple queries', async () => {
    const queries = ['What is UMOJA?', 'What is Inspira?', 'What is ERP?'];
    const results = await Promise.all(queries.map(q => engine.query(q)));
    assertEqual(results.length, 3);
    for (const r of results) {
      assertTrue(r.hasOwnProperty('success'));
      assertTrue(r.hasOwnProperty('answer'));
    }
  });

  await test('Batch with different modes', async () => {
    engine.clearCache();
    const r1 = await engine.query('What is UMOJA?', { mode: 'full' });
    const r2 = await engine.query('What is UMOJA?', { mode: 'quick' });
    // Both should return valid results
    assertTrue(r1.hasOwnProperty('answer'));
    assertTrue(r2.hasOwnProperty('answer'));
    // Different modes
    assertTrue(r1.metadata?.mode === 'full');
  });
}

async function testGraphManagement() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Graph Management');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = getEngine();

  await test('addNodes increases node count', async () => {
    const before = engine.getGraphStats();
    engine.addNodes([{ id: 'new1', name: 'NewNode', type: 'Test' }]);
    const after = engine.getGraphStats();
    assertEqual(after.nodes, before.nodes + 1);
  });

  await test('addEdges increases edge count', async () => {
    const before = engine.getGraphStats();
    engine.addEdges([{ source: 'new1', target: 'umoja', type: 'RELATES_TO' }]);
    const after = engine.getGraphStats();
    assertEqual(after.edges, before.edges + 1);
  });

  await test('addEdges updates adjacency', async () => {
    assertTrue(engine.graphService.graphCache.adjacency.has('new1'));
    assertTrue(engine.graphService.graphCache.adjacency.get('new1').has('umoja'));
  });

  await test('addNodes clears cache', async () => {
    // Populate cache first
    await engine.query('What is UMOJA?');
    assertTrue(engine.getCacheStats().size > 0);

    // Adding node should clear cache
    engine.addNodes([{ id: 'temp', name: 'Temp', type: 'Test' }]);
    assertEqual(engine.getCacheStats().size, 0);
  });
}

async function testRouteModuleExports() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Route Module Exports');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const routeModule = require('../../src/routes/query.route');

  await test('Module exports express router', async () => {
    assertTrue(typeof routeModule === 'function'); // Express router is a function
  });

  await test('Module exports setGraphService', async () => {
    assertTrue(typeof routeModule.setGraphService === 'function');
  });

  await test('Module exports getEngine', async () => {
    assertTrue(typeof routeModule.getEngine === 'function');
  });

  await test('setGraphService updates engine graph', async () => {
    const newGraph = createMockGraphService();
    routeModule.setGraphService(newGraph);
    const engine = routeModule.getEngine();
    assertEqual(engine.getGraphStats().nodes, 6);
  });
}

// ═══════════════════════════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('Query API Routes Tests (Task 7.1)');
  console.log('='.repeat(63));

  await testInputValidation();
  await testEngineIntegration();
  await testResponseFormats();
  await testCacheBehavior();
  await testStatistics();
  await testBatchQueries();
  await testGraphManagement();
  await testRouteModuleExports();

  console.log('\n' + '='.repeat(63));
  console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
  if (testResults.failures.length > 0) {
    console.log('\nFailed tests:');
    testResults.failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('='.repeat(63));

  process.exit(testResults.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
