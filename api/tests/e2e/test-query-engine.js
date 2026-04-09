/**
 * Tests for Unified Query Engine (Task 6.4)
 */

const assert = require('assert');

const testResults = { passed: 0, failed: 0, failures: [] };

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  \u2713 ${name}`);
        testResults.passed++;
      }).catch(err => {
        console.log(`  \u2717 ${name}: ${err.message}`);
        testResults.failed++;
        testResults.failures.push(name);
      });
    }
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
// Mock Graph Service
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
// TESTS
// ═══════════════════════════════════════════════════════════════

const { QueryEngine, createQueryEngine } = require('../../src/services/query');

function testBasics() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Basics');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  test('Instantiation', () => {
    const engine = new QueryEngine();
    assertTrue(engine !== null);
    assertEqual(engine.options.defaultMode, 'full');
    assertEqual(engine.options.defaultFormat, 'detailed');
    assertTrue(engine.options.enableCache);
  });

  test('Custom options', () => {
    const engine = createQueryEngine({
      defaultMode: 'quick',
      enableCache: false,
      maxCacheSize: 50
    });
    assertEqual(engine.options.defaultMode, 'quick');
    assertEqual(engine.options.enableCache, false);
    assertEqual(engine.options.maxCacheSize, 50);
  });

  test('Set graph service', () => {
    const engine = createQueryEngine({});
    const mock = createMockGraphService();
    engine.setGraphService(mock);
    assertTrue(engine.graphService !== null);
    assertTrue(engine.executor.graphService !== null);
  });
}

async function testFullMode() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Full Mode');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService() });

  await test('Full query - factual', async () => {
    const result = await engine.query('What is UMOJA?');
    assertTrue(result.success !== undefined, 'Should have success field');
    assertTrue(result.answer !== undefined, 'Should have answer');
    assertTrue(result.intent !== undefined, 'Should have intent');
    assertTrue(result.metadata !== undefined, 'Should have metadata');
    assertEqual(result.metadata.mode, 'full');
  });

  await test('Full query - relational', async () => {
    const result = await engine.query('Who created Bug #123?');
    assertTrue(result.answer !== undefined);
    assertEqual(result.intent, 'relational');
  });

  await test('Full query - path', async () => {
    const result = await engine.query('Find path from UMOJA to ERP');
    assertTrue(result.answer !== undefined);
    assertEqual(result.intent, 'path');
  });

  await test('Full query - aggregation', async () => {
    const result = await engine.query('How many systems are there?');
    assertTrue(result.answer !== undefined);
    assertEqual(result.intent, 'aggregation');
  });

  await test('Full query with format', async () => {
    const result = await engine.query('What is UMOJA?', { format: 'brief' });
    assertTrue(typeof result.answer === 'string');
    assertEqual(result.metadata.format, 'brief');
  });
}

async function testQuickMode() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Quick Mode');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService() });

  await test('Quick lookup', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'quick' });
    assertTrue(result.answer !== undefined);
    assertEqual(result.metadata.mode, 'quick');
  });

  await test('Quick lookup with missing entity', async () => {
    const result = await engine.query('What is NonExistent?', { mode: 'quick' });
    assertTrue(result.answer !== undefined);
  });
}

async function testExplainMode() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Explain Mode');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService() });

  await test('Explain mode shows pipeline steps', async () => {
    const result = await engine.query('What is UMOJA?', { mode: 'explain' });
    assertTrue(result.explanation !== undefined, 'Should have explanation');
    assertEqual(result.explanation.steps.length, 4, 'Should have 4 pipeline steps');
    assertEqual(result.explanation.steps[0].name, 'Parse');
    assertEqual(result.explanation.steps[1].name, 'Plan');
    assertEqual(result.explanation.steps[2].name, 'Execute');
    assertEqual(result.explanation.steps[3].name, 'Generate Answer');
  });

  await test('Explain steps have durations', async () => {
    const result = await engine.query('Find path from UMOJA to ERP', { mode: 'explain' });
    for (const step of result.explanation.steps) {
      assertTrue(step.duration !== undefined, `Step ${step.name} should have duration`);
      assertTrue(step.result !== undefined, `Step ${step.name} should have result`);
    }
  });

  await test('Explain parse step has intent', async () => {
    const result = await engine.query('Compare UMOJA and Inspira', { mode: 'explain' });
    assertEqual(result.explanation.steps[0].result.intent, 'comparison');
    assertTrue(result.explanation.steps[0].result.entities.length >= 2);
  });
}

async function testConvenienceMethods() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Convenience Methods');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService() });

  await test('ask()', async () => {
    const result = await engine.ask('What is UMOJA?');
    assertTrue(result.answer !== undefined);
    assertEqual(result.metadata.mode, 'full');
  });

  await test('lookup()', async () => {
    const result = await engine.lookup('UMOJA');
    assertTrue(result.answer !== undefined);
    assertEqual(result.metadata.mode, 'quick');
  });

  await test('findPath()', async () => {
    const result = await engine.findPath('UMOJA', 'ERP');
    assertTrue(result.answer !== undefined);
    assertEqual(result.intent, 'path');
  });

  await test('count()', async () => {
    const result = await engine.count('system');
    assertTrue(result.answer !== undefined);
  });

  await test('list()', async () => {
    const result = await engine.list('system');
    assertTrue(result.answer !== undefined);
  });

  await test('getRelations()', async () => {
    const result = await engine.getRelations('UMOJA');
    assertTrue(result.answer !== undefined);
    assertEqual(result.intent, 'relational');
  });

  await test('compare()', async () => {
    const result = await engine.compare('UMOJA', 'Inspira');
    assertTrue(result.answer !== undefined);
    assertEqual(result.intent, 'comparison');
  });
}

async function testCaching() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Caching');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService(), enableCache: true });

  await test('Cache miss on first query', async () => {
    const result = await engine.query('What is UMOJA?');
    assertTrue(!result.fromCache, 'First query should not be from cache');
  });

  await test('Cache hit on repeated query', async () => {
    const result = await engine.query('What is UMOJA?');
    assertTrue(result.fromCache === true, 'Repeated query should be from cache');
  });

  await test('Cache bypass with noCache', async () => {
    const result = await engine.query('What is UMOJA?', { noCache: true });
    assertTrue(!result.fromCache, 'noCache should bypass cache');
  });

  await test('Clear cache', async () => {
    engine.clearCache();
    const cacheStats = engine.getCacheStats();
    assertEqual(cacheStats.size, 0, 'Cache should be empty after clear');
  });

  await test('Cache stats', async () => {
    const stats = engine.getCacheStats();
    assertTrue(stats.size !== undefined);
    assertTrue(stats.maxSize !== undefined);
    assertTrue(stats.hitRate !== undefined);
  });

  await test('Cache disabled', async () => {
    const noCacheEngine = createQueryEngine({ graphService: createMockGraphService(), enableCache: false });
    await noCacheEngine.query('What is UMOJA?');
    const result = await noCacheEngine.query('What is UMOJA?');
    assertTrue(!result.fromCache, 'Should not cache when disabled');
  });
}

async function testGraphManagement() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Graph Management');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService() });

  await test('Get graph stats', async () => {
    const stats = engine.getGraphStats();
    assertTrue(stats.nodes > 0, `Should have nodes, got ${stats.nodes}`);
    assertTrue(stats.edges > 0, `Should have edges, got ${stats.edges}`);
  });

  await test('Add nodes', async () => {
    const before = engine.getGraphStats().nodes;
    engine.addNodes([{ id: 'new_node', name: 'NewSystem', type: 'System' }]);
    const after = engine.getGraphStats().nodes;
    assertEqual(after, before + 1, 'Should add one node');
  });

  await test('Add edges', async () => {
    const before = engine.getGraphStats().edges;
    engine.addEdges([{ source: 'new_node', target: 'umoja', type: 'DEPENDS_ON' }]);
    const after = engine.getGraphStats().edges;
    assertEqual(after, before + 1, 'Should add one edge');
  });

  await test('Adding nodes clears cache', async () => {
    await engine.query('What is UMOJA?'); // populate cache
    assertTrue(engine.cache.size > 0, 'Cache should have entries');
    engine.addNodes([{ id: 'x', name: 'X', type: 'System' }]);
    assertEqual(engine.cache.size, 0, 'Cache should be cleared after adding nodes');
  });
}

async function testStatistics() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Statistics');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const engine = createQueryEngine({ graphService: createMockGraphService(), enableCache: false });

  await engine.query('What is UMOJA?');
  await engine.query('Find path from UMOJA to ERP');
  await engine.query('List all systems');

  await test('Total queries tracked', async () => {
    const stats = engine.getStats();
    assertEqual(stats.totalQueries, 3);
    assertEqual(stats.successfulQueries, 3);
    assertEqual(stats.failedQueries, 0);
  });

  await test('Query time tracking', async () => {
    const stats = engine.getStats();
    assertTrue(stats.avgQueryTime >= 0);
    assertTrue(stats.totalQueryTime > 0);
  });

  await test('By intent tracking', async () => {
    const stats = engine.getStats();
    assertTrue(Object.keys(stats.byIntent).length > 0);
  });

  await test('By mode tracking', async () => {
    const stats = engine.getStats();
    assertTrue(stats.byMode.full >= 3);
  });

  await test('Component stats included', async () => {
    const stats = engine.getStats();
    assertTrue(stats.components !== undefined);
    assertTrue(stats.components.parser !== undefined);
    assertTrue(stats.components.planner !== undefined);
    assertTrue(stats.components.executor !== undefined);
    assertTrue(stats.components.answerGenerator !== undefined);
  });

  await test('Reset stats', async () => {
    engine.resetStats();
    const stats = engine.getStats();
    assertEqual(stats.totalQueries, 0);
    assertEqual(stats.successfulQueries, 0);
  });
}

async function testModuleExports() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Module Exports');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  test('All exports present', () => {
    const mod = require('../../src/services/query');
    // Types
    assertTrue(mod.QueryIntent !== undefined, 'QueryIntent');
    assertTrue(mod.QueryOperation !== undefined, 'QueryOperation');
    assertTrue(mod.ParsedQuery !== undefined, 'ParsedQuery');
    assertTrue(mod.ExecutionPlan !== undefined, 'ExecutionPlan');
    assertTrue(mod.QueryResult !== undefined, 'QueryResult');
    // Components
    assertTrue(mod.QueryParser !== undefined, 'QueryParser');
    assertTrue(mod.QueryPlanner !== undefined, 'QueryPlanner');
    assertTrue(mod.QueryExecutor !== undefined, 'QueryExecutor');
    assertTrue(mod.AnswerGenerator !== undefined, 'AnswerGenerator');
    // Engine
    assertTrue(mod.QueryEngine !== undefined, 'QueryEngine');
    assertTrue(mod.createQueryEngine !== undefined, 'createQueryEngine');
    assertTrue(mod.queryEngine !== undefined, 'queryEngine singleton');
  });
}

// ═══════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551           Unified Query Engine Tests (Task 6.4)               \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');

  try {
    testBasics();
    await testFullMode();
    await testQuickMode();
    await testExplainMode();
    await testConvenienceMethods();
    await testCaching();
    await testGraphManagement();
    await testStatistics();
    await testModuleExports();

    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

    if (testResults.failures.length > 0) {
      console.log('\nFailed tests:');
      testResults.failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

runAllTests();
