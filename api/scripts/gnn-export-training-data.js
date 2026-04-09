#!/usr/bin/env node
/**
 * GNN Training Data Export — Phase C1.3
 *
 * Exports preprocessed graph data from Memgraph as JSON files
 * that the Python GNN service can load for training.
 *
 * Usage: node api/scripts/gnn-export-training-data.js
 * Output: gnn-service/data/exports/
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const neo4j = require('neo4j-driver');

// Config mirrors feature_config.py
const EDGE_EXCLUDE = new Set([
  'ACTIVE_CONFIG', 'CONNECTS_INTERNAL', 'PORT_OF', 'BRIDGES_TO',
]);

const CLASS_AGGREGATION = {
  CODE: ['Function', 'File', 'Class', 'Method', 'Module', 'MODULE', 'test', 'TEST'],
  COMPONENT: [
    'TechnicalComponent', 'CoreComponent', 'executor', 'tool', 'Executor',
    'plugin', 'PLUGIN', 'composite', 'COMPOSITE', 'transformer', 'TRANSFORMER',
  ],
  BUSINESS: [
    'business', 'BusinessRequirement', 'BusinessProcess',
    'organization', 'ORGANIZATION', 'office', 'OFFICE',
  ],
  SYSTEM: ['SYSTEM', 'SystemInterface', 'Integration', 'IT', 'database', 'DATABASE'],
  KNOWLEDGE: ['KnowledgeQuantum', 'Concept', 'Term', 'CONCEPT', 'note', 'NOTE'],
  DOCUMENT: ['Document', 'Documentation', 'WikiPage', 'DOCUMENT'],
  WORKFLOW: ['SubGraph', 'Pipeline', 'Process'],
  REFERENCE: [
    'reference', 'WORK_ITEM_REF', 'TECHNOLOGY', 'DataEntity', 'Schema', 'Table',
  ],
  FIX: ['bugfix', 'BUGFIX', 'solution', 'SOLUTION', 'decision', 'DECISION'],
};
const MIN_CLASS_SAMPLES = 10;

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v);
}

async function main() {
  const uri = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';
  const user = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
  const pass = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const session = driver.session();

  const outputDir = path.resolve(__dirname, '../../gnn-service/data/exports');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Exporting training data from Memgraph...');

  try {
    // --- 1. Export nodes ---
    const nodesResult = await session.run(`
      MATCH (n)
      RETURN
        id(n) AS internalId,
        n.id AS externalId,
        labels(n)[0] AS nodeType,
        n.title AS title,
        n.content AS content,
        n.name AS name,
        n.description AS description,
        n.type AS type,
        n.entityType AS entityType,
        n.category AS category,
        n.namespace AS namespace,
        n.status AS status,
        n.confidence AS confidence,
        n.importance AS importance,
        n.weight AS weight,
        n.qdrant_vector_id AS vectorId
    `);

    const nodes = nodesResult.records.map((r, idx) => ({
      idx,
      internalId: toNum(r.get('internalId')),
      externalId: r.get('externalId'),
      nodeType: r.get('nodeType'),
      title: r.get('title') || '',
      content: r.get('content') || '',
      name: r.get('name') || '',
      description: r.get('description') || '',
      type: r.get('type') || '',
      entityType: r.get('entityType') || '',
      category: r.get('category') || '',
      namespace: r.get('namespace') || '',
      status: r.get('status') || '',
      confidence: r.get('confidence'),
      importance: r.get('importance'),
      weight: r.get('weight'),
      vectorId: r.get('vectorId'),
    }));

    const idToIdx = {};
    for (const n of nodes) {
      idToIdx[n.internalId] = n.idx;
    }

    console.log(`  Exported ${nodes.length} nodes`);

    // --- 2. Export filtered edges ---
    const edgesResult = await session.run(`
      MATCH (a)-[r]->(b)
      WHERE NOT type(r) IN $excluded
      RETURN id(a) AS source, id(b) AS target, type(r) AS type
    `, { excluded: [...EDGE_EXCLUDE] });

    const edges = [];
    for (const r of edgesResult.records) {
      const src = toNum(r.get('source'));
      const tgt = toNum(r.get('target'));
      if (idToIdx[src] !== undefined && idToIdx[tgt] !== undefined) {
        edges.push({
          sourceIdx: idToIdx[src],
          targetIdx: idToIdx[tgt],
          type: r.get('type'),
        });
      }
    }

    console.log(`  Exported ${edges.length} filtered edges`);

    // --- 3. Class aggregation labels ---
    const reverseMap = {};
    for (const [aggClass, originals] of Object.entries(CLASS_AGGREGATION)) {
      for (const orig of originals) reverseMap[orig] = aggClass;
    }

    // Count raw label frequencies
    const labelCounts = {};
    for (const n of nodes) {
      const rawLabel = n.type || n.entityType || n.category;
      if (rawLabel) {
        labelCounts[rawLabel] = (labelCounts[rawLabel] || 0) + 1;
      }
    }

    // Assign aggregated classes
    for (const n of nodes) {
      const rawLabel = n.type || n.entityType || n.category;
      if (rawLabel) {
        let agg = reverseMap[rawLabel];
        if (!agg) {
          agg = (labelCounts[rawLabel] || 0) >= MIN_CLASS_SAMPLES
            ? rawLabel.toUpperCase()
            : 'OTHER';
        }
        n.aggregatedClass = agg;
      } else {
        n.aggregatedClass = null;
      }
    }

    // Stats
    const aggCounts = {};
    for (const n of nodes) {
      if (n.aggregatedClass) {
        aggCounts[n.aggregatedClass] = (aggCounts[n.aggregatedClass] || 0) + 1;
      }
    }
    console.log(`  Aggregated classes: ${JSON.stringify(aggCounts)}`);

    // --- 4. Save ---
    const nodesFile = path.join(outputDir, 'nodes.json');
    const edgesFile = path.join(outputDir, 'edges.json');
    const metaFile = path.join(outputDir, 'metadata.json');

    fs.writeFileSync(nodesFile, JSON.stringify(nodes, null, 2));
    fs.writeFileSync(edgesFile, JSON.stringify(edges, null, 2));
    fs.writeFileSync(metaFile, JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalNodes: nodes.length,
      totalEdges: edges.length,
      excludedEdgeTypes: [...EDGE_EXCLUDE],
      aggregatedClasses: aggCounts,
      classMapping: CLASS_AGGREGATION,
    }, null, 2));

    console.log(`\nFiles saved to ${outputDir}/`);
    console.log(`  nodes.json:    ${nodes.length} nodes`);
    console.log(`  edges.json:    ${edges.length} edges`);
    console.log(`  metadata.json: export metadata`);

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
