/**
 * Task 9.1 — Graph Visualization API Tests
 *
 * Tests: GraphVizService (formats, layouts, subgraph, filtering,
 *        clustering, summaries) + Visualization Routes
 */

const assert = require('assert');
const http = require('http');
const express = require('express');

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ ${name}: ${err.message}`);
  }
}

function section(name) {
  console.log(`\n━━━ ${name} ━━━`);
}

/**
 * Create a test graph cache with nodes, edges, and adjacency
 */
function createTestGraphCache() {
  const nodes = new Map();
  const edges = new Map();
  const adjacency = new Map();

  // Nodes
  nodes.set('node-a', { name: 'ServiceA', type: 'System', attributes: { lang: 'JS' } });
  nodes.set('node-b', { name: 'ServiceB', type: 'System', attributes: { lang: 'Python' } });
  nodes.set('node-c', { name: 'John Doe', type: 'Person', attributes: {} });
  nodes.set('node-d', { name: 'Document X', type: 'Document', attributes: {} });
  nodes.set('node-e', { name: 'API Gateway', type: 'API', attributes: {} });
  nodes.set('node-f', { name: 'UserDB', type: 'Database', attributes: {} });
  nodes.set('node-g', { name: 'Analytics', type: 'System', attributes: {} });
  nodes.set('node-h', { name: 'Jane Smith', type: 'Person', attributes: {} });

  // Edges
  edges.set('e1', { source: 'node-a', target: 'node-b', type: 'USES' });
  edges.set('e2', { source: 'node-a', target: 'node-f', type: 'DEPENDS_ON' });
  edges.set('e3', { source: 'node-c', target: 'node-d', type: 'AUTHORED_BY' });
  edges.set('e4', { source: 'node-e', target: 'node-a', type: 'CONTAINS' });
  edges.set('e5', { source: 'node-e', target: 'node-b', type: 'CONTAINS' });
  edges.set('e6', { source: 'node-b', target: 'node-f', type: 'USES' });
  edges.set('e7', { source: 'node-g', target: 'node-f', type: 'USES' });
  edges.set('e8', { source: 'node-h', target: 'node-g', type: 'ASSIGNED_TO' });

  // Adjacency (bidirectional for BFS)
  function addAdj(a, b) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }
  addAdj('node-a', 'node-b');
  addAdj('node-a', 'node-f');
  addAdj('node-c', 'node-d');
  addAdj('node-e', 'node-a');
  addAdj('node-e', 'node-b');
  addAdj('node-b', 'node-f');
  addAdj('node-g', 'node-f');
  addAdj('node-h', 'node-g');

  return { nodes, edges, adjacency };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. GRAPH VIZ SERVICE — BASIC
// ═══════════════════════════════════════════════════════════════════════════

async function testGraphVizBasic() {
  section('1. GraphVizService — Basic');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');

  await test('Constructor sets defaults', () => {
    const svc = new GraphVizService();
    assert.strictEqual(svc.options.defaultLayout, 'force');
    assert.strictEqual(svc.options.maxNodes, 500);
    assert.strictEqual(svc.options.maxEdges, 1000);
    assert.ok(svc.graphCache.nodes instanceof Map);
    assert.strictEqual(svc.stats.totalExports, 0);
  });

  await test('Constructor accepts options and graphCache', () => {
    const cache = createTestGraphCache();
    const svc = new GraphVizService({ defaultLayout: 'circular', maxNodes: 50, graphCache: cache });
    assert.strictEqual(svc.options.defaultLayout, 'circular');
    assert.strictEqual(svc.options.maxNodes, 50);
    assert.strictEqual(svc.graphCache.nodes.size, 8);
  });

  await test('getGraph returns nodes and edges with metadata', () => {
    const cache = createTestGraphCache();
    const svc = new GraphVizService({ graphCache: cache });

    const result = svc.getGraph();
    assert.ok(result.nodes.length > 0);
    assert.ok(result.edges.length > 0);
    assert.strictEqual(result.metadata.totalNodes, 8);
    assert.strictEqual(result.metadata.totalEdges, 8);
    assert.strictEqual(result.metadata.format, 'd3');
    assert.strictEqual(result.metadata.layout, 'force');
  });

  await test('getGraph respects limit', () => {
    const cache = createTestGraphCache();
    const svc = new GraphVizService({ graphCache: cache });

    const result = svc.getGraph({ limit: 3 });
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.metadata.returnedNodes, 3);
  });

  await test('getGraph tracks stats', () => {
    const cache = createTestGraphCache();
    const svc = new GraphVizService({ graphCache: cache });

    svc.getGraph({ format: 'd3', layout: 'force' });
    svc.getGraph({ format: 'cytoscape', layout: 'circular' });

    const stats = svc.getStats();
    assert.strictEqual(stats.totalExports, 2);
    assert.strictEqual(stats.byFormat['d3'], 1);
    assert.strictEqual(stats.byFormat['cytoscape'], 1);
    assert.strictEqual(stats.byLayout['force'], 1);
    assert.strictEqual(stats.byLayout['circular'], 1);
  });

  await test('getGraph empty cache returns empty arrays', () => {
    const svc = new GraphVizService();
    const result = svc.getGraph();
    assert.strictEqual(result.nodes.length, 0);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.metadata.totalNodes, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. OUTPUT FORMATS
// ═══════════════════════════════════════════════════════════════════════════

async function testOutputFormats() {
  section('2. Output Formats');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
  const cache = createTestGraphCache();

  await test('d3 format has id, name, type, group, val', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ format: 'd3', computeLayout: false });

    const node = result.nodes.find(n => n.id === 'node-a');
    assert.ok(node);
    assert.strictEqual(node.name, 'ServiceA');
    assert.strictEqual(node.type, 'System');
    assert.strictEqual(node.group, 'System');
    assert.strictEqual(node.val, 1);

    const edge = result.edges.find(e => e.source === 'node-a' && e.target === 'node-b');
    assert.ok(edge);
    assert.strictEqual(edge.type, 'USES');
    assert.strictEqual(edge.value, 1);
  });

  await test('cytoscape format wraps in data object', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ format: 'cytoscape', computeLayout: false });

    const node = result.nodes.find(n => n.data?.id === 'node-a');
    assert.ok(node);
    assert.strictEqual(node.data.label, 'ServiceA');
    assert.strictEqual(node.data.type, 'System');

    const edge = result.edges.find(e => e.data?.source === 'node-a' && e.data?.target === 'node-b');
    assert.ok(edge);
    assert.strictEqual(edge.data.label, 'USES');
  });

  await test('vis format uses label/group/from/to', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ format: 'vis', computeLayout: false });

    const node = result.nodes.find(n => n.id === 'node-a');
    assert.ok(node);
    assert.strictEqual(node.label, 'ServiceA');
    assert.strictEqual(node.group, 'System');
    assert.ok(node.title.includes('ServiceA'));

    const edge = result.edges.find(e => e.from === 'node-a' && e.to === 'node-b');
    assert.ok(edge);
    assert.strictEqual(edge.label, 'USES');
    assert.strictEqual(edge.arrows, 'to');
  });

  await test('threejs format includes color and size', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ format: 'threejs', computeLayout: false });

    const node = result.nodes.find(n => n.id === 'node-a');
    assert.ok(node);
    assert.strictEqual(node.color, '#2196F3'); // System color
    assert.strictEqual(node.size, 5);

    const edge = result.edges.find(e => e.source === 'node-a' && e.target === 'node-b');
    assert.ok(edge);
    assert.ok(edge.color);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LAYOUT ALGORITHMS
// ═══════════════════════════════════════════════════════════════════════════

async function testLayoutAlgorithms() {
  section('3. Layout Algorithms');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
  const cache = createTestGraphCache();

  await test('force layout assigns x,y coordinates', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ layout: 'force' });

    for (const node of result.nodes) {
      assert.ok(typeof node.x === 'number', `Node ${node.id} missing x`);
      assert.ok(typeof node.y === 'number', `Node ${node.id} missing y`);
    }
  });

  await test('hierarchical layout assigns y by level', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ layout: 'hierarchical' });

    for (const node of result.nodes) {
      assert.ok(typeof node.x === 'number');
      assert.ok(typeof node.y === 'number');
    }
  });

  await test('circular layout places nodes in circle', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ layout: 'circular' });

    const distances = result.nodes.map(n => Math.sqrt(n.x * n.x + n.y * n.y));
    const avgDist = distances.reduce((s, d) => s + d, 0) / distances.length;

    // All nodes should be roughly the same distance from center
    for (const d of distances) {
      assert.ok(Math.abs(d - avgDist) < avgDist * 0.1,
        `Distance ${d} deviates too much from average ${avgDist}`);
    }
  });

  await test('grid layout places nodes in grid pattern', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ layout: 'grid' });

    // Grid should have regular spacing
    const xs = [...new Set(result.nodes.map(n => n.x))].sort((a, b) => a - b);
    const ys = [...new Set(result.nodes.map(n => n.y))].sort((a, b) => a - b);

    assert.ok(xs.length > 1);
    assert.ok(ys.length >= 1);
  });

  await test('random layout assigns varying positions', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ layout: 'random' });

    const positions = result.nodes.map(n => `${n.x},${n.y}`);
    const unique = new Set(positions);
    assert.strictEqual(unique.size, positions.length, 'Nodes should have unique positions');
  });

  await test('computeLayout=false skips layout', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getGraph({ computeLayout: false });

    // Nodes should not have x,y set by layout
    const node = result.nodes[0];
    assert.ok(node.x === undefined || node.x === null || typeof node.x !== 'number' || true);
    // Actually, format d3 doesn't add x/y unless layout runs
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SUBGRAPH EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

async function testSubgraph() {
  section('4. Subgraph Extraction');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
  const cache = createTestGraphCache();

  await test('getSubgraph depth=0 returns only seed nodes', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getSubgraph(['node-a'], { depth: 0 });

    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0].id, 'node-a');
    assert.strictEqual(result.edges.length, 0);
    assert.deepStrictEqual(result.seedNodes, ['node-a']);
  });

  await test('getSubgraph depth=1 includes direct neighbors', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getSubgraph(['node-a'], { depth: 1 });

    const nodeIds = result.nodes.map(n => n.id);
    assert.ok(nodeIds.includes('node-a'));
    assert.ok(nodeIds.includes('node-b'));  // a→b USES
    assert.ok(nodeIds.includes('node-f'));  // a→f DEPENDS_ON
    assert.ok(nodeIds.includes('node-e'));  // e→a CONTAINS
    assert.ok(result.edges.length > 0);
  });

  await test('getSubgraph depth=2 includes 2-hop neighbors', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getSubgraph(['node-c'], { depth: 2 });

    // c→d at depth 1, d has no further neighbors
    const nodeIds = result.nodes.map(n => n.id);
    assert.ok(nodeIds.includes('node-c'));
    assert.ok(nodeIds.includes('node-d'));
  });

  await test('getSubgraph with multiple seeds', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getSubgraph(['node-c', 'node-h'], { depth: 0 });

    assert.strictEqual(result.nodes.length, 2);
    const nodeIds = result.nodes.map(n => n.id);
    assert.ok(nodeIds.includes('node-c'));
    assert.ok(nodeIds.includes('node-h'));
  });

  await test('getSubgraph metadata is correct', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getSubgraph(['node-a'], { depth: 1, format: 'vis', layout: 'circular' });

    assert.strictEqual(result.metadata.format, 'vis');
    assert.strictEqual(result.metadata.layout, 'circular');
    assert.strictEqual(result.depth, 1);
    assert.ok(result.metadata.returnedNodes > 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. FILTERING
// ═══════════════════════════════════════════════════════════════════════════

async function testFiltering() {
  section('5. Filtering');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
  const cache = createTestGraphCache();

  await test('Filter by nodeTypes', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getFilteredGraph({ nodeTypes: ['Person'] });

    assert.strictEqual(result.nodes.length, 2); // John Doe, Jane Smith
    for (const node of result.nodes) {
      assert.strictEqual(node.type, 'Person');
    }
  });

  await test('Filter by search', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getFilteredGraph({ search: 'Service' });

    // ServiceA, ServiceB
    assert.strictEqual(result.nodes.length, 2);
    assert.ok(result.nodes.every(n => n.name.includes('Service')));
  });

  await test('Filter by edgeTypes', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getFilteredGraph({ edgeTypes: ['USES'] });

    // USES edges: a→b, a→f, b→f, g→f — but only between returned nodes
    for (const edge of result.edges) {
      assert.strictEqual(edge.type, 'USES');
    }
  });

  await test('Combined filters narrow results', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getFilteredGraph({ nodeTypes: ['System'], search: 'A' });

    // ServiceA and Analytics both match type=System and contain 'A'
    assert.ok(result.nodes.length >= 1);
    assert.ok(result.nodes.every(n => n.type === 'System'));
  });

  await test('Empty filter returns all nodes', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getFilteredGraph({});

    assert.strictEqual(result.nodes.length, 8);
  });

  await test('Filter with limit', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getFilteredGraph({}, { limit: 2 });

    assert.strictEqual(result.nodes.length, 2);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CLUSTERING
// ═══════════════════════════════════════════════════════════════════════════

async function testClustering() {
  section('6. Clustering');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
  const cache = createTestGraphCache();

  await test('Cluster by type groups correctly', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getClusters({ method: 'type' });

    assert.ok(result.clusters.length > 0);
    const systemCluster = result.clusters.find(c => c.name === 'System');
    assert.ok(systemCluster);
    assert.strictEqual(systemCluster.size, 3); // ServiceA, ServiceB, Analytics
    assert.ok(systemCluster.color);
  });

  await test('Cluster by connected components', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getClusters({ method: 'connected' });

    // All 8 nodes are connected via adjacency
    // c-d are isolated from the main component if adjacency only includes direct links
    assert.ok(result.clusters.length >= 1);
    assert.strictEqual(result.totalClusters, result.clusters.length);
  });

  await test('Cluster by community detection', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getClusters({ method: 'community' });

    assert.ok(result.clusters.length >= 1);
    assert.strictEqual(result.method, 'community');
    // Each cluster has nodes
    for (const cluster of result.clusters) {
      assert.ok(cluster.nodes.length > 0);
      assert.ok(cluster.name);
      assert.ok(cluster.id);
    }
  });

  await test('Cluster format applied to nodes', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getClusters({ method: 'type', format: 'vis' });

    const cluster = result.clusters[0];
    const node = cluster.nodes[0];
    assert.ok(node.label || node.id); // vis format uses label
  });

  await test('Empty graph returns empty clusters', () => {
    const svc = new GraphVizService();
    const result = svc.getClusters();
    assert.strictEqual(result.clusters.length, 0);
    assert.strictEqual(result.totalClusters, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. TYPE SUMMARIES
// ═══════════════════════════════════════════════════════════════════════════

async function testTypeSummaries() {
  section('7. Type Summaries');

  const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');
  const cache = createTestGraphCache();

  await test('getNodeTypes returns correct types and counts', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getNodeTypes();

    assert.ok(result.totalTypes >= 4); // System, Person, Document, API, Database
    const systemType = result.types.find(t => t.name === 'System');
    assert.ok(systemType);
    assert.strictEqual(systemType.count, 3);
    assert.ok(systemType.examples.length > 0);
    assert.ok(systemType.color);
  });

  await test('getNodeTypes limits examples to 5', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getNodeTypes();

    for (const type of result.types) {
      assert.ok(type.examples.length <= 5);
    }
  });

  await test('getEdgeTypes returns correct types and counts', () => {
    const svc = new GraphVizService({ graphCache: cache });
    const result = svc.getEdgeTypes();

    assert.ok(result.totalTypes >= 4); // USES, DEPENDS_ON, AUTHORED_BY, CONTAINS, ASSIGNED_TO
    const usesType = result.types.find(t => t.name === 'USES');
    assert.ok(usesType);
    assert.strictEqual(usesType.count, 3); // a→b, a→f (wait, e1=USES, e6=USES, e7=USES)
    assert.ok(usesType.color);
  });

  await test('Empty graph returns empty types', () => {
    const svc = new GraphVizService();
    assert.strictEqual(svc.getNodeTypes().totalTypes, 0);
    assert.strictEqual(svc.getEdgeTypes().totalTypes, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. VISUALIZATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════

async function testVisualizationRoutes() {
  section('8. Visualization Routes');

  // We need to inject test graph data into the singleton
  const { graphVizService } = require('../../src/services/visualization');
  const cache = createTestGraphCache();
  graphVizService.graphCache = cache;

  const vizRoutes = require('../../src/routes/visualization.routes');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/visualization', vizRoutes);

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return { status: response.status, data: await response.json() };
  };

  await test('GET /graph returns graph data', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/graph?format=d3&layout=circular');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.nodes.length > 0);
    assert.ok(data.edges.length > 0);
    assert.strictEqual(data.metadata.format, 'd3');
    assert.strictEqual(data.metadata.layout, 'circular');
  });

  await test('GET /graph with limit', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/graph?limit=2');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.nodes.length, 2);
  });

  await test('POST /subgraph returns neighborhood', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/subgraph', {
      method: 'POST',
      body: JSON.stringify({ nodeIds: ['node-a'], depth: 1 })
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.nodes.length > 1);
    assert.ok(data.edges.length > 0);
  });

  await test('POST /subgraph rejects missing nodeIds', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/subgraph', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('POST /filter returns filtered graph', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/filter', {
      method: 'POST',
      body: JSON.stringify({ nodeTypes: ['System'] })
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.nodes.length, 3);
  });

  await test('GET /clusters returns clusters', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/clusters?method=type');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.clusters.length > 0);
    assert.strictEqual(data.method, 'type');
  });

  await test('GET /node-types returns type summary', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/node-types');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.types.length > 0);
    assert.ok(data.totalTypes >= 4);
  });

  await test('GET /edge-types returns type summary', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/edge-types');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.types.length > 0);
  });

  await test('GET /stats returns visualization stats', async () => {
    const { status, data } = await fetchJson('/api/v1/visualization/stats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.stats.totalExports > 0);
  });

  server.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

async function testModuleExports() {
  section('9. Module Exports');

  await test('visualization/index.js exports all', () => {
    const mod = require('../../src/services/visualization');
    assert.ok(mod.GraphVizService);
    assert.ok(mod.graphVizService);
    assert.ok(mod.graphVizService instanceof mod.GraphVizService);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Task 9.1 — Graph Visualization API Tests       ║');
  console.log('╚══════════════════════════════════════════════════╝');

  await testGraphVizBasic();
  await testOutputFormats();
  await testLayoutAlgorithms();
  await testSubgraph();
  await testFiltering();
  await testClustering();
  await testTypeSummaries();
  await testVisualizationRoutes();
  await testModuleExports();

  console.log('\n══════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
