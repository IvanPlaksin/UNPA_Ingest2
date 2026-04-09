#!/usr/bin/env node
/**
 * GNN Data Audit — Phase C1.1 (Node.js version)
 *
 * Checks if the Memgraph knowledge graph has sufficient data for GNN training.
 * Uses the existing Memgraph driver from the project.
 *
 * Usage: node api/scripts/gnn-data-audit.js
 */

const path = require('path');

// Load env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// --- Minimum requirements ---
const MINIMUM = {
  totalNodes: 500,
  totalEdges: 1000,
  labeledNodes: 200,
  minClassSamples: 20,
  edgeTypes: 3,
  largestComponentRatio: 0.7,
};

// --- Memgraph connection ---
let driver;
async function getDriver() {
  if (driver) return driver;
  const neo4j = require('neo4j-driver');
  const uri = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
  const pass = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';
  driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  console.log(`Connecting to Memgraph: ${uri}`);
  return driver;
}

// --- Queries ---

async function getNodeStats(session) {
  const result = await session.run(`
    MATCH (n)
    WITH labels(n) AS lbls, count(*) AS cnt
    UNWIND lbls AS label
    RETURN label, sum(cnt) AS count
    ORDER BY count DESC
  `);
  return result.records.map(r => ({
    label: r.get('label'),
    count: toNumber(r.get('count')),
  }));
}

async function getEdgeStats(session) {
  const result = await session.run(`
    MATCH ()-[r]->()
    RETURN type(r) AS type, count(*) AS count
    ORDER BY count DESC
  `);
  return result.records.map(r => ({
    type: r.get('type'),
    count: toNumber(r.get('count')),
  }));
}

async function getLabeledNodes(session) {
  const result = await session.run(`
    MATCH (n)
    WHERE n.type IS NOT NULL OR n.entityType IS NOT NULL OR n.category IS NOT NULL
    WITH coalesce(n.type, n.entityType, n.category) AS label, count(*) AS count
    RETURN label, count
    ORDER BY count DESC
  `);
  return result.records.map(r => ({
    label: String(r.get('label')),
    count: toNumber(r.get('count')),
  }));
}

async function getNodesWithEmbeddings(session) {
  const result = await session.run(`
    MATCH (n)
    WHERE n.qdrant_vector_id IS NOT NULL
    RETURN count(n) AS count
  `);
  return toNumber(result.records[0].get('count'));
}

async function countConnectedComponents(session) {
  // Get all node internal IDs
  const nodesResult = await session.run('MATCH (n) RETURN id(n) AS nid');
  const allNodes = new Set(nodesResult.records.map(r => toNumber(r.get('nid'))));

  if (allNodes.size === 0) {
    return { numComponents: 0, largest: 0, largestRatio: 0, sizes: [], orphans: 0 };
  }

  // Get all edges (undirected)
  const edgesResult = await session.run(`
    MATCH (a)-[r]-(b)
    RETURN DISTINCT id(a) AS source, id(b) AS target
  `);

  const adj = new Map();
  for (const nid of allNodes) {
    adj.set(nid, new Set());
  }
  for (const r of edgesResult.records) {
    const s = toNumber(r.get('source'));
    const t = toNumber(r.get('target'));
    if (adj.has(s)) adj.get(s).add(t);
    if (adj.has(t)) adj.get(t).add(s);
  }

  // BFS
  const visited = new Set();
  const components = [];

  for (const startNode of allNodes) {
    if (visited.has(startNode)) continue;
    let size = 0;
    const queue = [startNode];
    while (queue.length > 0) {
      const node = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      size++;
      for (const neighbor of (adj.get(node) || [])) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(size);
  }

  components.sort((a, b) => b - a);
  const total = components.reduce((s, c) => s + c, 0);

  return {
    numComponents: components.length,
    largest: components[0] || 0,
    largestRatio: total > 0 ? components[0] / total : 0,
    avgSize: total / components.length,
    top10: components.slice(0, 10),
    orphans: components.filter(c => c === 1).length,
  };
}

// --- Helpers ---

function toNumber(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val.toNumber === 'function') return val.toNumber();
  if (typeof val.toInt === 'function') return val.toInt();
  return Number(val);
}

function pad(str, len) {
  return String(str).padEnd(len);
}

function rpad(str, len) {
  return String(str).padStart(len);
}

function pct(ratio) {
  return `${(ratio * 100).toFixed(1)}%`;
}

// --- Main ---

async function main() {
  const SEP = '='.repeat(65);
  const LINE = '-'.repeat(40);

  console.log(SEP);
  console.log('                    GNN DATA AUDIT REPORT');
  console.log(SEP);

  const d = await getDriver();
  const session = d.session();

  try {
    // Node stats
    const nodeStats = await getNodeStats(session);
    const totalNodes = nodeStats.reduce((s, n) => s + n.count, 0);

    // Edge stats
    const edgeStats = await getEdgeStats(session);
    const totalEdges = edgeStats.reduce((s, e) => s + e.count, 0);

    // Labeled nodes
    const labeled = await getLabeledNodes(session);
    const totalLabeled = labeled.reduce((s, l) => s + l.count, 0);

    // Embeddings
    const nodesWithVectors = await getNodesWithEmbeddings(session);

    // Connectivity
    console.log('\nComputing connected components (BFS)...');
    const comp = await countConnectedComponents(session);

    // --- Print report ---

    console.log(`\nGRAPH STATISTICS`);
    console.log(LINE);
    console.log(`  Total Nodes:           ${totalNodes.toLocaleString()}`);
    console.log(`  Total Edges:           ${totalEdges.toLocaleString()}`);
    console.log(`  Node Types:            ${nodeStats.length}`);
    console.log(`  Edge Types:            ${edgeStats.length}`);
    console.log(`  Nodes with Vectors:    ${nodesWithVectors.toLocaleString()}`);

    console.log(`\nNODE TYPE DISTRIBUTION`);
    console.log(LINE);
    for (const { label, count } of nodeStats.slice(0, 15)) {
      console.log(`  ${pad(label, 25)} ${rpad(count.toLocaleString(), 8)}`);
    }
    if (nodeStats.length > 15) {
      console.log(`  ... and ${nodeStats.length - 15} more types`);
    }

    console.log(`\nEDGE TYPE DISTRIBUTION`);
    console.log(LINE);
    for (const { type, count } of edgeStats.slice(0, 15)) {
      console.log(`  ${pad(type, 25)} ${rpad(count.toLocaleString(), 8)}`);
    }
    if (edgeStats.length > 15) {
      console.log(`  ... and ${edgeStats.length - 15} more types`);
    }

    console.log(`\nLABELED NODES (for classification)`);
    console.log(LINE);
    if (labeled.length > 0) {
      for (const { label, count } of labeled.slice(0, 15)) {
        console.log(`  ${pad(label, 25)} ${rpad(count.toLocaleString(), 8)}`);
      }
      if (labeled.length > 15) {
        console.log(`  ... and ${labeled.length - 15} more classes`);
      }
    } else {
      console.log('  No labeled nodes found');
    }

    console.log(`\nCONNECTIVITY`);
    console.log(LINE);
    console.log(`  Connected Components:  ${comp.numComponents.toLocaleString()}`);
    console.log(`  Largest Component:     ${comp.largest.toLocaleString()} nodes (${pct(comp.largestRatio)})`);
    console.log(`  Orphan Nodes:          ${comp.orphans.toLocaleString()}`);
    console.log(`  Top Component Sizes:   [${comp.top10.join(', ')}]`);

    // --- Readiness ---

    const issues = [];
    const warnings = [];

    if (totalNodes < MINIMUM.totalNodes)
      issues.push(`Insufficient nodes: ${totalNodes} < ${MINIMUM.totalNodes} required`);
    if (totalEdges < MINIMUM.totalEdges)
      issues.push(`Insufficient edges: ${totalEdges} < ${MINIMUM.totalEdges} required`);
    if (totalLabeled < MINIMUM.labeledNodes)
      warnings.push(`Low labeled nodes: ${totalLabeled} < ${MINIMUM.labeledNodes} recommended`);
    if (edgeStats.length < MINIMUM.edgeTypes)
      warnings.push(`Low edge type diversity: ${edgeStats.length} < ${MINIMUM.edgeTypes} recommended`);

    if (labeled.length > 0) {
      const minClass = Math.min(...labeled.map(l => l.count));
      if (minClass < MINIMUM.minClassSamples)
        warnings.push(`Class imbalance: smallest class has ${minClass} samples (need ${MINIMUM.minClassSamples})`);
    }

    if (comp.largestRatio < MINIMUM.largestComponentRatio)
      warnings.push(`Fragmented graph: largest component is ${pct(comp.largestRatio)} (need ${pct(MINIMUM.largestComponentRatio)})`);

    console.log(`\nTRAINING READINESS`);
    console.log(LINE);

    const checks = [
      [totalNodes >= MINIMUM.totalNodes, `Sufficient nodes (${totalNodes.toLocaleString()} >= ${MINIMUM.totalNodes})`],
      [totalEdges >= MINIMUM.totalEdges, `Sufficient edges (${totalEdges.toLocaleString()} >= ${MINIMUM.totalEdges})`],
      [totalLabeled >= MINIMUM.labeledNodes, `Sufficient labeled nodes (${totalLabeled.toLocaleString()} >= ${MINIMUM.labeledNodes})`],
      [comp.largestRatio >= MINIMUM.largestComponentRatio, `Graph connected (${pct(comp.largestRatio)} in main component)`],
    ];

    for (const [ok, msg] of checks) {
      console.log(`  ${ok ? '[OK]' : '[!!]'} ${msg}`);
    }

    if (warnings.length > 0) {
      console.log(`\n  Warnings:`);
      for (const w of warnings) {
        console.log(`    [!] ${w}`);
      }
    }

    const ready = issues.length === 0;
    const suffix = warnings.length > 0 && ready ? ' (with warnings)' : '';
    console.log(`\n${SEP}`);
    console.log(`  VERDICT: ${ready ? 'READY FOR TRAINING' : 'NOT READY'}${suffix}`);
    console.log(SEP);

    // Return structured result for programmatic use
    return {
      totalNodes,
      totalEdges,
      totalLabeled,
      nodesWithVectors,
      nodeTypes: nodeStats.length,
      edgeTypes: edgeStats.length,
      components: comp,
      ready,
      issues,
      warnings,
    };

  } finally {
    await session.close();
    await d.close();
  }
}

main()
  .then(result => {
    process.exit(result.ready ? 0 : 1);
  })
  .catch(err => {
    console.error('\nERROR:', err.message);
    process.exit(2);
  });
