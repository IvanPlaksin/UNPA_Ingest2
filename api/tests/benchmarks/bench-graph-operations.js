/**
 * Graph Operations Benchmarks
 *
 * Measures performance of:
 *   - Node/edge insertion at various scales
 *   - Node lookup by ID
 *   - BFS traversal (subgraph extraction)
 *   - Connected components
 *   - Filtering and search
 */

const { BenchmarkRunner, generateGraph } = require('./benchmark-runner');
const { GraphVizService } = require('../../src/services/visualization/graph-viz.service');

async function run() {
  const runner = new BenchmarkRunner({ iterations: 50, warmup: 5 });

  // ── Node/Edge insertion ──────────────────────────────────────────────────
  runner.category('Graph: Node/Edge Insertion');

  await runner.benchmark('Insert 100 nodes + 200 edges', () => {
    const g = { nodes: new Map(), edges: new Map(), adjacency: new Map() };
    const types = ['System', 'Organization', 'Document'];
    for (let i = 0; i < 100; i++) {
      g.nodes.set(`n${i}`, { name: `Node${i}`, type: types[i % 3], attributes: {} });
    }
    for (let i = 0; i < 200; i++) {
      g.edges.set(`e${i}`, { source: `n${i % 100}`, target: `n${(i * 3 + 7) % 100}`, type: 'USES' });
    }
  });

  await runner.benchmark('Insert 1000 nodes + 2000 edges', () => {
    const g = { nodes: new Map(), edges: new Map(), adjacency: new Map() };
    const types = ['System', 'Organization', 'Document', 'Person', 'API'];
    for (let i = 0; i < 1000; i++) {
      g.nodes.set(`n${i}`, { name: `Node${i}`, type: types[i % 5], attributes: {} });
    }
    for (let i = 0; i < 2000; i++) {
      g.edges.set(`e${i}`, { source: `n${i % 1000}`, target: `n${(i * 7 + 3) % 1000}`, type: 'USES' });
    }
  });

  await runner.benchmark('Insert 10000 nodes + 20000 edges', () => {
    const g = { nodes: new Map(), edges: new Map(), adjacency: new Map() };
    const types = ['System', 'Organization', 'Document', 'Person', 'API', 'Database'];
    for (let i = 0; i < 10000; i++) {
      g.nodes.set(`n${i}`, { name: `Node${i}`, type: types[i % 6], attributes: {} });
    }
    for (let i = 0; i < 20000; i++) {
      g.edges.set(`e${i}`, { source: `n${i % 10000}`, target: `n${(i * 7 + 3) % 10000}`, type: 'USES' });
    }
  }, { iterations: 10 });

  // ── Node lookup ──────────────────────────────────────────────────────────
  runner.category('Graph: Node Lookup');

  const graph1K = generateGraph(1000);

  await runner.benchmark('Lookup by ID (1K graph)', () => {
    for (let i = 0; i < 100; i++) {
      graph1K.nodes.get(`n${i}`);
    }
  });

  const graph10K = generateGraph(10000);

  await runner.benchmark('Lookup by ID (10K graph)', () => {
    for (let i = 0; i < 100; i++) {
      graph10K.nodes.get(`n${i * 100}`);
    }
  });

  // ── GraphVizService operations ───────────────────────────────────────────
  runner.category('GraphViz: Full Graph Retrieval');

  const viz100 = new GraphVizService({ graphCache: generateGraph(100) });
  const viz1K = new GraphVizService({ graphCache: generateGraph(1000) });
  const viz10K = new GraphVizService({ graphCache: generateGraph(10000), maxNodes: 10000, maxEdges: 20000 });

  await runner.benchmark('getGraph d3 (100 nodes)', () => {
    viz100.getGraph({ format: 'd3' });
  });

  await runner.benchmark('getGraph d3 (1K nodes)', () => {
    viz1K.getGraph({ format: 'd3', computeLayout: false });
  });

  await runner.benchmark('getGraph d3 (10K nodes, no layout)', () => {
    viz10K.getGraph({ format: 'd3', computeLayout: false });
  }, { iterations: 10 });

  // ── Subgraph / BFS ───────────────────────────────────────────────────────
  runner.category('GraphViz: Subgraph BFS');

  await runner.benchmark('Subgraph depth=1 from 1K graph', () => {
    viz1K.getSubgraph(['n0'], { depth: 1, computeLayout: false });
  });

  await runner.benchmark('Subgraph depth=2 from 1K graph', () => {
    viz1K.getSubgraph(['n0'], { depth: 2, computeLayout: false });
  });

  await runner.benchmark('Subgraph depth=3 from 1K graph', () => {
    viz1K.getSubgraph(['n0'], { depth: 3, computeLayout: false });
  }, { iterations: 20 });

  // ── Filtering & Search ───────────────────────────────────────────────────
  runner.category('GraphViz: Filtering & Search');

  await runner.benchmark('Filter by nodeType (1K graph)', () => {
    viz1K.getFilteredGraph({ nodeTypes: ['System'] });
  });

  await runner.benchmark('Search by name (1K graph)', () => {
    viz1K.getFilteredGraph({ search: 'Node_500' });
  });

  await runner.benchmark('Filter by nodeType (10K graph)', () => {
    viz10K.getFilteredGraph({ nodeTypes: ['System'] }, { computeLayout: false });
  }, { iterations: 10 });

  // ── Clustering ───────────────────────────────────────────────────────────
  runner.category('GraphViz: Clustering');

  await runner.benchmark('Cluster by type (100 nodes)', () => {
    viz100.getClusters({ method: 'type' });
  });

  await runner.benchmark('Cluster by type (1K nodes)', () => {
    viz1K.getClusters({ method: 'type' });
  });

  await runner.benchmark('Connected components (100 nodes)', () => {
    viz100.getClusters({ method: 'component' });
  });

  await runner.benchmark('Connected components (1K nodes)', () => {
    viz1K.getClusters({ method: 'component' });
  }, { iterations: 20 });

  // ── Layout computation ───────────────────────────────────────────────────
  runner.category('GraphViz: Layout');

  await runner.benchmark('Force layout (100 nodes)', () => {
    viz100.getGraph({ layout: 'force', format: 'd3' });
  });

  await runner.benchmark('Hierarchical layout (100 nodes)', () => {
    viz100.getGraph({ layout: 'hierarchical', format: 'd3' });
  });

  await runner.benchmark('Circular layout (100 nodes)', () => {
    viz100.getGraph({ layout: 'circular', format: 'd3' });
  });

  await runner.benchmark('Grid layout (100 nodes)', () => {
    viz100.getGraph({ layout: 'grid', format: 'd3' });
  });

  // ── Type summaries ───────────────────────────────────────────────────────
  runner.category('GraphViz: Type Summaries');

  await runner.benchmark('getNodeTypes (1K graph)', () => {
    viz1K.getNodeTypes();
  });

  await runner.benchmark('getEdgeTypes (1K graph)', () => {
    viz1K.getEdgeTypes();
  });

  await runner.benchmark('getNodeTypes (10K graph)', () => {
    viz10K.getNodeTypes();
  }, { iterations: 20 });

  // ── Output ───────────────────────────────────────────────────────────────
  runner.printSummary();
  return runner;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
