'use strict';
require('dotenv').config();
const mg = require('../src/services/memgraph.service');

const ENTRY_ID = '0f1255bc-ca7e-4148-bd49-5dd40941de2e';

mg.runQuery(
  'MATCH (e:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition) RETURN d.nodes AS nodes, d.edges AS edges',
  { id: ENTRY_ID }
).then(r => {
  if (!r.length) { console.log('NOT FOUND'); process.exit(1); }
  const nodes = JSON.parse(r[0].nodes);
  nodes.forEach(n => console.log(n.id, `[${n.type}]`, JSON.stringify(n.parameters)));
  console.log('edges:', JSON.parse(r[0].edges).map(e => e.source+'->'+e.target).join(', '));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
