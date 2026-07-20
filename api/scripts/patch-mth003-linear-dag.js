'use strict';
/**
 * Patch MTH-003 graph:
 * 1. Linear DAG (no merge nodes): N01→N02→N03→N04→N05→N06
 * 2. Fix templates: use {{N02.output.content.nodes[0].id}} (not roots[0] — LOCATE.roots is empty)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const memgraphService = require('../src/services/memgraph.service');

const ENTRY_ID = '0f1255bc-ca7e-4148-bd49-5dd40941de2e';

const LINEAR_EDGES = [
  { source: 'N01', target: 'N02', sourceNodeId: 'N01', targetNodeId: 'N02' },
  { source: 'N02', target: 'N03', sourceNodeId: 'N02', targetNodeId: 'N03' },
  { source: 'N03', target: 'N04', sourceNodeId: 'N03', targetNodeId: 'N04' },
  { source: 'N04', target: 'N05', sourceNodeId: 'N04', targetNodeId: 'N05' },
  { source: 'N05', target: 'N06', sourceNodeId: 'N05', targetNodeId: 'N06' },
];

// Fixed nodes: correct template paths + use top-level executorType for clarity
const FIXED_NODES = [
  {
    id: 'N01', type: 'workflow.start',
    name: 'Start: Research UN Service',
    parameters: {
      parameterSchema: {
        serviceName: { type: 'string', required: true, description: 'Name of the UN service to research (e.g. "iNeed")' },
        maxDepth: { type: 'number', default: 3, description: 'Expansion depth for graph traversal' },
        sources: { type: 'array', default: ['EntityStore'], description: 'Sources to search' },
      },
    },
  },
  {
    id: 'N02', type: 'investigation.locate',
    name: 'Locate: Find Service Entity',
    parameters: { query: '{{input.serviceName}}', limit: 20 },
  },
  {
    id: 'N03', type: 'investigation.expand',
    name: 'Expand: Neighbourhood',
    // N02 output = { content: CGE_envelope, evidencedBy: [...] }
    // CGE envelope nodes[0].id = first matched entity's ID
    parameters: { entityId: '{{N02.content.nodes[0].id}}', depth: '{{input.maxDepth}}' },
  },
  {
    id: 'N04', type: 'investigation.profile',
    name: 'Profile: Primary Entity',
    parameters: { entityId: '{{N02.content.nodes[0].id}}' },
  },
  {
    id: 'N05', type: 'investigation.synthesize',
    name: 'Synthesize: Narrative',
    parameters: { focus: '{{input.serviceName}}', format: 'report' },
  },
  {
    id: 'N06', type: 'workflow.end',
    name: 'End',
    parameters: {},
  },
];

async function patch() {
  console.log('=== Patch MTH-003: linear DAG + fixed templates ===\n');

  const rows = await memgraphService.runQuery(
    `MATCH (e:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)
     RETURN d`,
    { id: ENTRY_ID }
  );

  if (!rows.length) {
    console.error('ERR: CatalogEntry not found or has no GraphDefinition');
    process.exit(1);
  }

  const newNodes = JSON.stringify(FIXED_NODES);
  const newEdges = JSON.stringify(LINEAR_EDGES);

  await memgraphService.runQuery(
    `MATCH (e:CatalogEntry {entryId: $entryId})-[:DEFINES]->(d:GraphDefinition)
     SET d.nodes = $nodes, d.edges = $edges`,
    { entryId: ENTRY_ID, nodes: newNodes, edges: newEdges }
  );
  console.log('Updated GraphDefinition.nodes + edges');

  // Verify
  const verify = await memgraphService.runQuery(
    `MATCH (e:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)
     RETURN d.edges AS edges, d.nodes AS nodes`,
    { id: ENTRY_ID }
  );
  const edges = JSON.parse(verify[0].edges);
  console.log('Edges:', edges.map(e => `${e.source}→${e.target}`).join(', '));
  const nodes = JSON.parse(verify[0].nodes);
  console.log('Node params check:');
  nodes.forEach(n => console.log(`  ${n.id} (${n.type}): entityId = ${n.parameters?.entityId || '—'}`));
  console.log('\n=== Patch complete ===');
}

patch().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
