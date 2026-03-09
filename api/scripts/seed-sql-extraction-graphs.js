#!/usr/bin/env node
/**
 * Seed SQL Extraction Pipeline graphs into Memgraph catalog.
 *
 * Usage: node scripts/seed-sql-extraction-graphs.js [--verify]
 */
require('dotenv').config();
const path = require('path');

async function main() {
  const verify = process.argv.includes('--verify');

  const memgraph = require(path.join(__dirname, '..', 'src', 'services', 'memgraph.service'));
  await memgraph.runQuery('RETURN 1 as t');
  console.log('[OK] Memgraph connected');

  const { SQL_EXTRACTION_META, SQL_PROCEDURE_ANALYSIS, allGraphs } = require(
    path.join(__dirname, '..', 'src', 'services', 'graph-definitions', 'sql-extraction-pipeline')
  );

  console.log(`\nRegistering ${allGraphs.length} SQL extraction graphs...\n`);

  for (const graph of allGraphs) {
    const { v4: uuidv4 } = require('uuid');
    const entryId = uuidv4();
    const now = new Date().toISOString();

    // Check if already exists
    const existing = await memgraph.runQuery(
      "MATCH (e:CatalogEntry {graphId: $graphId}) RETURN e.id as id",
      { graphId: graph.graph_id }
    );

    if (existing.length > 0) {
      console.log(`  [SKIP] ${graph.graph_id} — already in catalog (${existing[0].id})`);
      continue;
    }

    // Create CatalogEntry
    await memgraph.runQuery(
      `CREATE (e:CatalogEntry {
        id: $entryId,
        entryId: $entryId,
        graphId: $graphId,
        name: $name,
        description: $description,
        category: $category,
        namespace: $namespace,
        version: $version,
        nodeCount: $nodeCount,
        edgeCount: $edgeCount,
        nodesJson: $nodesJson,
        edgesJson: $edgesJson,
        isExecutable: true,
        status: 'active',
        createdAt: $now,
        updatedAt: $now
      })`,
      {
        entryId,
        graphId: graph.graph_id,
        name: graph.name,
        description: graph.description,
        category: graph.category,
        namespace: graph.namespace || 'Core',
        version: graph.version,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        nodesJson: JSON.stringify(graph.nodes),
        edgesJson: JSON.stringify(graph.edges),
        now,
      }
    );

    console.log(`  [OK] ${graph.graph_id} → ${graph.name} (${graph.nodes.length} nodes, ${graph.edges.length} edges)`);
  }

  if (verify) {
    console.log('\n=== VERIFICATION ===');
    const entries = await memgraph.runQuery(
      "MATCH (e:CatalogEntry) WHERE e.namespace = 'Core' RETURN e.graphId as id, e.name as name, e.nodeCount as nodes, e.edgeCount as edges"
    );
    for (const e of entries) {
      console.log(`  ${e.id}: ${e.name} (${e.nodes}N/${e.edges}E)`);
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
