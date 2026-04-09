#!/usr/bin/env node
/**
 * Sync iNeed graphs to GraphCatalog (creates CatalogEntry + GraphDefinition + GraphVersion nodes)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

(async () => {
  const memgraph = require('../src/services/memgraph.service');
  const { GraphLoaderService } = require('../src/services/graph-definitions/graph-loader.service');

  const loader = new GraphLoaderService(null, memgraph);
  const results = await loader.loadAll();

  for (const r of results) {
    const status = r.success ? 'OK' : `FAIL ${r.error}`;
    console.log(`  ${r.graphId}: ${status} (${r.nodes} nodes, ${r.edges} edges)`);
  }

  // Verify CatalogEntry nodes
  const res = await memgraph.executeQuery(
    "MATCH (c:CatalogEntry) WHERE c.namespace = 'iNeed' RETURN c.entryId, c.name, c.type ORDER BY c.entryId"
  );
  console.log('\nCatalogEntry entries (iNeed namespace):');
  for (const r of res.records) {
    console.log(`  ${r._fields.join(' | ')}`);
  }

  // Verify DEFINES relationship
  const pairs = await memgraph.executeQuery(
    "MATCH (c:CatalogEntry)-[:DEFINES]->(d:GraphDefinition) WHERE c.namespace = 'iNeed' RETURN c.entryId, c.name, c.type"
  );
  console.log('\nCatalogEntry + GraphDefinition pairs:');
  for (const r of pairs.records) {
    console.log(`  ${r._fields.join(' | ')}`);
  }

  // Total entries
  const total = await memgraph.executeQuery('MATCH (c:CatalogEntry) RETURN count(c) as cnt');
  console.log(`\nTotal CatalogEntry nodes: ${total.records[0]._fields[0]}`);

  process.exit(0);
})();
