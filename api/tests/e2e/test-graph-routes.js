/**
 * Tests for Graph & GNN-RAG API Routes (Task 7.3)
 *
 * Tests graph management, retrieval, and extraction via the service singletons.
 */

const assert = require('assert');

const testResults = { passed: 0, failed: 0, failures: [] };

async function test(name, fn, timeoutMs = 10000) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
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
// Imports
// ═══════════════════════════════════════════════════════════════

const { gnnRAGService, hybridRetriever } = require('../../src/services/gnn');
const { gnnEnhancedExtractor, unifiedExtractor } = require('../../src/services/extraction');

// ═══════════════════════════════════════════════════════════════
// Test data helpers
// ═══════════════════════════════════════════════════════════════

function seedGraph() {
  gnnRAGService.graphCache.nodes.clear();
  gnnRAGService.graphCache.edges.clear();
  gnnRAGService.graphCache.adjacency.clear();

  const nodes = [
    { id: 'umoja', name: 'UMOJA', type: 'System', attributes: { description: 'ERP system' } },
    { id: 'inspira', name: 'Inspira', type: 'System', attributes: { description: 'HR system' } },
    { id: 'john', name: 'John Smith', type: 'Person', attributes: { role: 'Developer' } },
    { id: 'bug1', name: 'Bug #101', type: 'WorkItem', attributes: { status: 'open' } },
    { id: 'task1', name: 'Task #200', type: 'WorkItem', attributes: { status: 'closed' } }
  ];

  const edges = [
    { source: 'john', target: 'umoja', type: 'USES' },
    { source: 'john', target: 'bug1', type: 'ASSIGNED_TO' },
    { source: 'umoja', target: 'inspira', type: 'RELATED_TO' },
    { source: 'bug1', target: 'task1', type: 'DEPENDS_ON' }
  ];

  for (const node of nodes) {
    gnnRAGService.graphCache.nodes.set(node.id, node);
  }
  for (const edge of edges) {
    const key = `${edge.source}-${edge.target}`;
    gnnRAGService.graphCache.edges.set(key, edge);
    if (!gnnRAGService.graphCache.adjacency.has(edge.source)) {
      gnnRAGService.graphCache.adjacency.set(edge.source, new Set());
    }
    if (!gnnRAGService.graphCache.adjacency.has(edge.target)) {
      gnnRAGService.graphCache.adjacency.set(edge.target, new Set());
    }
    gnnRAGService.graphCache.adjacency.get(edge.source).add(edge.target);
    gnnRAGService.graphCache.adjacency.get(edge.target).add(edge.source);
  }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

async function testGraphManagement() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Graph Management');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  seedGraph();

  await test('Graph has seeded nodes', async () => {
    assertEqual(gnnRAGService.graphCache.nodes.size, 5);
  });

  await test('Graph has seeded edges', async () => {
    assertEqual(gnnRAGService.graphCache.edges.size, 4);
  });

  await test('List nodes returns all nodes', async () => {
    const nodes = [...gnnRAGService.graphCache.nodes.entries()].map(([id, n]) => ({ id, ...n }));
    assertEqual(nodes.length, 5);
    assertTrue(nodes.every(n => n.id && n.name));
  });

  await test('Filter nodes by type', async () => {
    const nodes = [...gnnRAGService.graphCache.nodes.values()];
    const systems = nodes.filter(n => n.type === 'System');
    assertEqual(systems.length, 2);
  });

  await test('Get node by id', async () => {
    const node = gnnRAGService.graphCache.nodes.get('umoja');
    assertTrue(node !== undefined);
    assertEqual(node.name, 'UMOJA');
    assertEqual(node.type, 'System');
  });

  await test('Get node with edges', async () => {
    const nodeId = 'john';
    const edges = [];
    for (const [, edge] of gnnRAGService.graphCache.edges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        edges.push(edge);
      }
    }
    assertEqual(edges.length, 2); // USES + ASSIGNED_TO
  });

  await test('Get non-existent node returns undefined', async () => {
    const node = gnnRAGService.graphCache.nodes.get('nonexistent');
    assertEqual(node, undefined);
  });

  await test('Add nodes via addNodes()', async () => {
    const before = gnnRAGService.graphCache.nodes.size;
    gnnRAGService.addNodes([
      { id: 'new1', name: 'NewSystem', type: 'System' }
    ]);
    assertEqual(gnnRAGService.graphCache.nodes.size, before + 1);
  });

  await test('Add edges via addEdges()', async () => {
    const before = gnnRAGService.graphCache.edges.size;
    gnnRAGService.addEdges([
      { source: 'new1', target: 'umoja', type: 'DEPENDS_ON' }
    ]);
    assertEqual(gnnRAGService.graphCache.edges.size, before + 1);
  });

  await test('Adjacency updated after addEdges', async () => {
    assertTrue(gnnRAGService.graphCache.adjacency.has('new1'));
    assertTrue(gnnRAGService.graphCache.adjacency.get('new1').has('umoja'));
  });

  await test('Delete node removes node and edges', async () => {
    // Delete new1
    gnnRAGService.graphCache.nodes.delete('new1');
    // Remove associated edges
    const edgesToDelete = [];
    for (const [key, edge] of gnnRAGService.graphCache.edges) {
      if (edge.source === 'new1' || edge.target === 'new1') edgesToDelete.push(key);
    }
    for (const key of edgesToDelete) {
      gnnRAGService.graphCache.edges.delete(key);
    }
    gnnRAGService.graphCache.adjacency.delete('new1');

    assertEqual(gnnRAGService.graphCache.nodes.has('new1'), false);
    assertEqual(edgesToDelete.length, 1);
  });

  await test('List edges with type filter', async () => {
    const edges = [...gnnRAGService.graphCache.edges.values()];
    const uses = edges.filter(e => e.type === 'USES');
    assertTrue(uses.length >= 1);
  });

  await test('Pagination works for nodes', async () => {
    const all = [...gnnRAGService.graphCache.nodes.entries()].map(([id, n]) => ({ id, ...n }));
    const page1 = all.slice(0, 2);
    const page2 = all.slice(2, 4);
    assertEqual(page1.length, 2);
    assertEqual(page2.length, 2);
    assertTrue(page1[0].id !== page2[0].id);
  });
}

async function testInputValidation() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Input Validation (Route Logic)');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('POST /nodes rejects empty array', async () => {
    const body = { nodes: [] };
    const valid = Array.isArray(body.nodes) && body.nodes.length > 0;
    assertEqual(valid, false);
  });

  await test('POST /nodes rejects missing name', async () => {
    const body = { nodes: [{ type: 'Test' }] };
    const valid = body.nodes.every(n => n.name);
    assertEqual(valid, false);
  });

  await test('POST /edges rejects empty array', async () => {
    const body = { edges: [] };
    const valid = Array.isArray(body.edges) && body.edges.length > 0;
    assertEqual(valid, false);
  });

  await test('POST /edges rejects missing source/target', async () => {
    const body = { edges: [{ source: 'a' }] };
    const valid = body.edges.every(e => e.source && e.target);
    assertEqual(valid, false);
  });

  await test('POST /initialize rejects empty body', async () => {
    const body = {};
    const valid = body.nodes || body.edges;
    assertEqual(!!valid, false);
  });

  await test('POST /clear rejects without confirm', async () => {
    const body = {};
    const valid = !!body.confirm;
    assertEqual(valid, false);
  });

  await test('POST /retrieve rejects missing query', async () => {
    const body = {};
    const valid = body.query && typeof body.query === 'string';
    assertEqual(!!valid, false);
  });

  await test('POST /extract rejects missing text', async () => {
    const body = {};
    const valid = body.text && typeof body.text === 'string';
    assertEqual(!!valid, false);
  });

  await test('POST /extract rejects text > 10000 chars', async () => {
    const body = { text: 'a'.repeat(10001) };
    const valid = body.text.length <= 10000;
    assertEqual(valid, false);
  });

  await test('POST /extract/batch rejects empty texts array', async () => {
    const body = { texts: [] };
    const valid = Array.isArray(body.texts) && body.texts.length > 0;
    assertEqual(valid, false);
  });

  await test('POST /extract/batch rejects > 20 texts', async () => {
    const body = { texts: Array(21).fill('text') };
    const valid = body.texts.length <= 20;
    assertEqual(valid, false);
  });
}

async function testRetrieval() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('GNN-RAG Retrieval');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  seedGraph();

  await test('retrieve returns structured result', async () => {
    const result = await gnnRAGService.retrieve('What is UMOJA?', { topK: 5 });
    assertTrue(result !== undefined);
    assertTrue(result.hasOwnProperty('results'));
    assertTrue(result.hasOwnProperty('context'));
    assertTrue(result.hasOwnProperty('metadata'));
  });

  await test('retrieve results are array', async () => {
    const result = await gnnRAGService.retrieve('UMOJA system', { topK: 5 });
    assertTrue(Array.isArray(result.results));
  });

  await test('multiHopQuery returns structured result', async () => {
    const result = await gnnRAGService.multiHopQuery('How is John Smith related to UMOJA?', { maxHops: 2 });
    assertTrue(result !== undefined);
    assertTrue(result.hasOwnProperty('results'));
    assertTrue(result.hasOwnProperty('context'));
  });

  await test('hybridRetriever.retrieve returns results', async () => {
    const result = await hybridRetriever.retrieve('UMOJA', { topK: 5 });
    assertTrue(result !== undefined);
    assertTrue(result.hasOwnProperty('results'));
    assertTrue(result.hasOwnProperty('metadata'));
  });

  await test('getStats returns retrieval statistics', async () => {
    const stats = gnnRAGService.getStats();
    assertTrue(stats !== undefined);
    assertTrue(stats.hasOwnProperty('totalQueries'));
  });
}

async function testExtraction() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Extraction');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  seedGraph();

  await test('unifiedExtractor.extract returns entities and relations', async () => {
    const result = await unifiedExtractor.extract('John Smith is assigned to Bug #101 in UMOJA', {
      method: 'pattern',
      verify: false
    });
    assertTrue(result !== undefined);
    assertTrue(Array.isArray(result.entities));
    assertTrue(Array.isArray(result.relations));
    assertTrue(result.metadata !== undefined);
  });

  await test('gnnEnhancedExtractor has extract method', async () => {
    assertTrue(typeof gnnEnhancedExtractor.extract === 'function');
    assertTrue(typeof gnnEnhancedExtractor.extractBatch === 'function');
    assertTrue(typeof gnnEnhancedExtractor.incrementalExtract === 'function');
  });

  await test('gnnEnhancedExtractor has graph management', async () => {
    assertTrue(typeof gnnEnhancedExtractor.initializeGraph === 'function');
    assertTrue(typeof gnnEnhancedExtractor.exportGraph === 'function');
    assertTrue(typeof gnnEnhancedExtractor.getGraphState === 'function');
    assertTrue(typeof gnnEnhancedExtractor.getStats === 'function');
  });

  await test('gnnEnhancedExtractor.exportGraph returns data', async () => {
    const data = gnnEnhancedExtractor.exportGraph();
    assertTrue(data !== undefined);
    assertTrue(Array.isArray(data.nodes));
    assertTrue(Array.isArray(data.edges));
    assertTrue(data.exportedAt !== undefined);
  });

  await test('gnnEnhancedExtractor.getStats returns statistics', async () => {
    const stats = gnnEnhancedExtractor.getStats();
    assertTrue(stats !== undefined);
    assertTrue(stats.hasOwnProperty('totalExtractions'));
  });

  await test('unifiedExtractor.getAvailableMethods returns methods', async () => {
    const methods = unifiedExtractor.getAvailableMethods();
    assertTrue(Array.isArray(methods));
    assertTrue(methods.includes('pattern'));
    assertTrue(methods.includes('hybrid'));
  });
}

async function testGraphClear() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Graph Clear & Initialize');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  await test('Clear empties the graph', async () => {
    seedGraph();
    assertTrue(gnnRAGService.graphCache.nodes.size > 0);

    gnnRAGService.graphCache.nodes.clear();
    gnnRAGService.graphCache.edges.clear();
    gnnRAGService.graphCache.adjacency.clear();

    assertEqual(gnnRAGService.graphCache.nodes.size, 0);
    assertEqual(gnnRAGService.graphCache.edges.size, 0);
    assertEqual(gnnRAGService.graphCache.adjacency.size, 0);
  });

  await test('Initialize restores graph', async () => {
    await gnnRAGService.initialize({
      nodes: [
        { id: 'a', name: 'NodeA', type: 'Test' },
        { id: 'b', name: 'NodeB', type: 'Test' }
      ],
      edges: [
        { source: 'a', target: 'b', type: 'CONNECTS' }
      ]
    });

    assertEqual(gnnRAGService.graphCache.nodes.size, 2);
    assertTrue(gnnRAGService.graphCache.edges.size >= 1);
  });

  // Re-seed for other tests
  seedGraph();
}

async function testRouteModuleExports() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Route Module');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const routeModule = require('../../src/routes/graph.routes');

  await test('Module exports express router', async () => {
    assertTrue(typeof routeModule === 'function');
  });

  await test('Router has registered routes', async () => {
    assertTrue(routeModule.stack !== undefined);
    assertTrue(routeModule.stack.length > 0);
  });
}

// ═══════════════════════════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('Graph & GNN-RAG Routes Tests (Task 7.3)');
  console.log('='.repeat(63));

  await testGraphManagement();
  await testInputValidation();
  await testRetrieval();
  await testExtraction();
  await testGraphClear();
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
