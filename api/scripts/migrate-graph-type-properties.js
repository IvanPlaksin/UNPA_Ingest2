#!/usr/bin/env node
/**
 * Migration: Add graphType/graphSubType/graphDimension to GraphDefinition nodes.
 *
 * Phase 1: Sets default EXECUTABLE for all existing graphs.
 * Phase 2: Classifies based on linked CatalogEntry.type (legacy mapping).
 *
 * Usage:
 *   node api/scripts/migrate-graph-type-properties.js [--dry-run]
 */

const memgraphService = require('../src/services/memgraph.service');
const { graphClassificationService, GraphType } = require('../src/services/graph-classification.service');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`\n=== Graph Type Migration ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // ── Phase 1: Set defaults ──────────────────────────────────────────────
  const untyped = await memgraphService.runQuery(`
    MATCH (g:GraphDefinition)
    WHERE g.graphType IS NULL
    RETURN g.graphId as graphId
  `);
  const untypedCount = untyped.length;
  console.log(`Found ${untypedCount} GraphDefinition nodes without graphType.`);

  if (untypedCount > 0 && !dryRun) {
    await memgraphService.runQuery(`
      MATCH (g:GraphDefinition)
      WHERE g.graphType IS NULL
      SET g.graphType = 'EXECUTABLE',
          g.graphDimension = 'EXECUTION',
          g.graphSubType = null
      RETURN count(g) as migrated
    `);
    console.log(`  → Set ${untypedCount} nodes to EXECUTABLE (default).`);
  }

  // ── Phase 2: Classify based on CatalogEntry.type ───────────────────────
  const linked = await memgraphService.runQuery(`
    MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)
    WHERE c.type IS NOT NULL
    RETURN g.graphId as graphId, c.name as name, c.type as legacyType, c.namespace as namespace
  `);

  console.log(`\nFound ${linked.length} graphs linked to CatalogEntry with type:`);

  const stats = { updated: 0, skipped: 0 };

  for (const row of linked) {
    const graphId = row.graphId;
    const name = row.name || '(unnamed)';
    const legacyType = row.legacyType;
    const namespace = row.namespace || 'default';

    const { graphType, subType } = graphClassificationService.mapLegacyType(legacyType);
    const dimension = graphClassificationService.getDimension(graphType);

    console.log(`  ${name} [${namespace}]: ${legacyType} → ${graphType}${subType ? '/' + subType : ''} (${dimension})`);

    if (!dryRun) {
      await memgraphService.runQuery(`
        MATCH (g:GraphDefinition {graphId: $graphId})
        SET g.graphType = $graphType,
            g.graphDimension = $dimension,
            g.graphSubType = $subType
        RETURN g.graphId
      `, { graphId, graphType, dimension, subType });
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }

  // ── Phase 3: Verify ────────────────────────────────────────────────────
  if (!dryRun) {
    const remaining = await memgraphService.runQuery(`
      MATCH (g:GraphDefinition)
      WHERE g.graphType IS NULL
      RETURN count(g) as count
    `);
    const remainingCount = remaining[0]?.count || 0;

    const typeCounts = await memgraphService.runQuery(`
      MATCH (g:GraphDefinition)
      RETURN g.graphType as graphType, g.graphSubType as subType, count(g) as cnt
      ORDER BY cnt DESC
    `);

    console.log(`\n=== Migration Results ===`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Remaining without graphType: ${remainingCount}`);
    console.log(`\nType distribution:`);
    for (const row of typeCounts) {
      console.log(`  ${row.graphType}${row.subType ? '/' + row.subType : ''}: ${row.cnt}`);
    }
  } else {
    console.log(`\n=== DRY RUN: ${stats.skipped} graphs would be classified ===`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
