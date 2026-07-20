'use strict';
/**
 * Patch MTH-003 "Research UN Service" graph:
 * Insert a SEARCH node (N07) between PROFILE (N04) and SYNTHESIZE (N05).
 *
 * Before: N01 → N02 → N03 → N04 → N05 → N06
 * After:  N01 → N02 → N03 → N04 → N07 → N05 → N06
 *
 * N07 searches indexed docs + external source APIs for the same query,
 * using {{input.sources}} (catalog source UUIDs from the SourceSelector).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const ENTRY_ID = '0f1255bc-ca7e-4148-bd49-5dd40941de2e';

async function run() {
  const rows = await mg.runQuery(
    `MATCH (e:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)
     RETURN d.nodes AS nodes, d.edges AS edges, id(d) AS nodeDbId`,
    { id: ENTRY_ID }
  );

  if (!rows.length) { console.error('Graph not found'); process.exit(1); }

  const nodes = JSON.parse(rows[0].nodes);
  const edges  = JSON.parse(rows[0].edges);

  console.log('Current nodes:', nodes.map(n => `${n.id}[${n.type}]`).join(', '));
  console.log('Current edges:', edges.map(e => `${e.source}->${e.target}`).join(', '));

  // Check N07 doesn't already exist
  if (nodes.find(n => n.id === 'N07')) {
    console.log('N07 already exists — skipping');
    process.exit(0);
  }

  // New SEARCH node
  const searchNode = {
    id:   'N07',
    type: 'investigation.search',
    name: 'Search Document Sources',
    parameters: {
      query:          '{{input.serviceName}}',
      sources:        '{{input.sources}}',
      limit:          10,
      searchIndexed:  true,
      searchExternal: true,
    },
    position: { x: 900, y: 0 },
  };

  // Remove edge N04 → N05, add N04 → N07 and N07 → N05
  const newEdges = edges
    .filter(e => !(e.source === 'N04' && e.target === 'N05'))
    .concat([
      { id: 'E04-07', source: 'N04', target: 'N07', sourceNodeId: 'N04', targetNodeId: 'N07' },
      { id: 'E07-05', source: 'N07', target: 'N05', sourceNodeId: 'N07', targetNodeId: 'N05' },
    ]);

  const newNodes = [...nodes, searchNode];

  console.log('\nPatched nodes:', newNodes.map(n => `${n.id}[${n.type}]`).join(', '));
  console.log('Patched edges:', newEdges.map(e => `${e.source}->${e.target}`).join(', '));

  await mg.runQuery(
    `MATCH (e:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)
     SET d.nodes = $nodes, d.edges = $edges, d.updatedAt = $ts`,
    {
      id:    ENTRY_ID,
      nodes: JSON.stringify(newNodes),
      edges: JSON.stringify(newEdges),
      ts:    new Date().toISOString(),
    }
  );

  console.log('\n✓ MTH-003 graph patched — SEARCH node N07 inserted between N04 and N05');
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
