#!/usr/bin/env node
/**
 * Seed SR_HardwareRequest STRUCTURAL + CONSTRAINT into Memgraph.
 *
 * Usage:
 *   node api/scripts/seed-sr-hardware-request.js           # Execute seed
 *   node api/scripts/seed-sr-hardware-request.js --dry-run  # Preview
 *   node api/scripts/seed-sr-hardware-request.js --verify   # Check existing
 */

const memgraph = require('../src/services/memgraph.service');
const { GRAPH_IDS, createStructuralGraph, createConstraintGraph, seed } = require('../src/db/seeds/flowdesk-sr-hardware-request.seed');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');

  console.log('\n=== SR_HardwareRequest Seed ===\n');

  if (verify) {
    const rows = await memgraph.runQuery(
      'MATCH (g:GraphDefinition) WHERE g.graphId IN $ids RETURN g.graphId as graphId, g.graphType as graphType, g.name as name, g.nodeCount as nodeCount',
      { ids: Object.values(GRAPH_IDS) }
    );
    console.log('Existing graphs:');
    if (rows.length === 0) console.log('  (none found)');
    rows.forEach(r => console.log(`  ${r.name} [${r.graphType}] nodes=${r.nodeCount} id=${r.graphId}`));

    const rel = await memgraph.runQuery(
      'MATCH (c:GraphDefinition {graphId: $cid})-[:CONSTRAINS]->(s:GraphDefinition) RETURN c.graphId as constraint, s.graphId as structural',
      { cid: GRAPH_IDS.CONSTRAINT }
    );
    if (rel.length > 0) {
      console.log(`\nCONSTRAINS: ${rel[0].constraint} → ${rel[0].structural}`);
    } else {
      console.log('\nNo CONSTRAINS relationship found.');
    }
    process.exit(0);
  }

  if (dryRun) {
    const structural = createStructuralGraph();
    const constraint = createConstraintGraph(structural.graphId);
    const fields = structural.nodes.filter(n => n.nodeType !== 'ROOT').map(n => n.name);
    const ruleTypes = [...new Set(constraint.nodes.map(n => n.ruleType))];

    console.log('[DRY RUN]');
    console.log(`\nSTRUCTURAL: ${structural.graphId}`);
    console.log(`  Nodes: ${structural.nodes.length}, Edges: ${structural.edges.length}`);
    console.log(`  Fields: ${fields.join(', ')}`);
    console.log(`\nCONSTRAINT: ${constraint.graphId}`);
    console.log(`  Rules: ${constraint.nodes.length}`);
    console.log(`  Types: ${ruleTypes.join(', ')}`);
    process.exit(0);
  }

  const result = await seed(memgraph);
  console.log(`\n✓ STRUCTURAL: ${result.structural.graphId} (${result.structural.nodes.length} nodes)`);
  console.log(`✓ CONSTRAINT: ${result.constraint.graphId} (${result.constraint.nodes.length} rules)`);
  process.exit(0);
}

main().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
