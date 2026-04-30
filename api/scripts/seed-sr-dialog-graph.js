'use strict';
/**
 * Seed: SR Dialog graph → Memgraph Catalog
 *
 * Uses graphCatalogService.createGraph() — the authorised entry point
 * per CODEX GTS-001 (type validation) and GTS-002 (subType validation).
 *
 * CatalogEntry.type = 'composite'  — dialog orchestrator over executor chain
 * graphType         = 'EXECUTABLE' — directly runnable DAG
 * graphSubType      = 'dialog'     — checkpoint + re-execution pattern (GTS-002, GTS-008)
 * graphDimension    = 'EXECUTION'  — derived by GraphClassificationService
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const GRAPH = require(path.join(__dirname, '../../Artefacts/fd-portal/sr-dialog-graph.json'));

async function seed() {
  console.log('Seeding sr-dialog graph to Memgraph catalog...\n');

  const { graphCatalogService } = require('../src/services/graphCatalog.service');

  // Check if already exists
  const mg = require('../src/services/memgraph.service');
  const existing = await mg.runQuery(
    'MATCH (c:CatalogEntry {graphKey: $key, namespace: $ns}) RETURN c.entryId AS id',
    { key: 'sr-dialog', ns: 'FLOWDESK' }
  );
  if (existing.length > 0) {
    console.log('  SKIP — already exists (entryId:', existing[0].id, ')');
    console.log('  To re-seed: MATCH (c:CatalogEntry {graphKey:"sr-dialog"}) DETACH DELETE c');
    process.exit(0);
  }

  const result = await graphCatalogService.createGraph({
    name: 'Service Request Dialog',
    description: 'AI-assisted SR creation — multi-turn dialog with intent classification, beneficiary, location, confirm (SR-DIALOG-GRAPH-001)',
    // CatalogEntry.type — CODEX compliant: composite = orchestrator over executor chain
    type: 'composite',
    namespace: 'FLOWDESK',
    graphKey: 'sr-dialog',
    tags: ['flowdesk', 'dialog', 'service-request', 'camel', 'sr-dialog'],
    visibility: 'PUBLIC',
    isPublic: true,
    createdBy: 'seed',
    // GraphDefinition classification — CODEX GTS-001, GTS-002, GTS-008
    graphType: 'EXECUTABLE',
    graphSubType: 'dialog',
    nodes: GRAPH.nodes,
    edges: GRAPH.edges,
  });

  // Link to CatalogRoot if present
  await mg.runQuery(`
    MATCH (root:CatalogRoot {id: 'catalog-root'})
    MATCH (c:CatalogEntry {entryId: $eid})
    MERGE (root)-[:CONTAINS]->(c)
  `, { eid: result.entryId }).catch(() => {});

  console.log('  ✅ CatalogEntry     created:', result.entryId, '| type: composite');
  console.log('  ✅ GraphDefinition  created:', result.graphId, `(${GRAPH.nodes.length} nodes, ${GRAPH.edges.length} edges)`);
  console.log('  ✅ graphType:       EXECUTABLE / dialog');
  console.log('  ✅ topology:        ', result.topology);

  // Verify
  const check = await mg.runQuery(
    `MATCH (c:CatalogEntry {entryId: $eid})-[:DEFINES]->(g:GraphDefinition)
     RETURN c.name AS name, c.type AS type, c.graphKey AS graphKey,
            g.graphType AS graphType, g.graphSubType AS graphSubType,
            g.nodeCount AS nodes, g.edgeCount AS edges`,
    { eid: result.entryId }
  );
  console.log('\n  Verification:', JSON.stringify(check[0]));
}

seed().then(() => process.exit(0)).catch(e => { console.error('ERR:', e.message); process.exit(1); });
