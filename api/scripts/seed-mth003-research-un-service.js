'use strict';
/**
 * MTH-003: Seed the "Research UN Service" reference methodology.
 *
 * Creates:
 *   1. GXE graph in catalog (namespace META, graphKey MTH-RESEARCH-UN-SERVICE-V1)
 *      Nodes: workflow.start → investigation.locate → investigation.expand
 *             → investigation.profile → investigation.synthesize → workflow.end
 *   2. InvestigationMethodology record pointing to that graph
 *
 * Usage:
 *   node api/scripts/seed-mth003-research-un-service.js
 *   node api/scripts/seed-mth003-research-un-service.js --reset   (delete + recreate)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const GRAPH_KEY = 'MTH-RESEARCH-UN-SERVICE-V1';
const METHOD_NAME = 'Research UN Service';

// ── Graph definition ──────────────────────────────────────────────────────────
//
// Node parameter syntax follows AOPEG template resolution:
//   {{nodeId.output.field}}  — reference a previous node's output
//   $paramName               — input parameter from workflow.start
//
// Simplified linear DAG (no fan-out loop for CONNECT — that's for V2):
//
//   workflow.start
//     └─→ investigation.locate   (query = {{input.serviceName}})
//           └─→ investigation.expand   (entityId = {{locate.output.roots[0]}}, depth = {{input.maxDepth}})
//                 └─→ investigation.profile   (entityId = {{locate.output.roots[0]}})
//                       └─→ investigation.synthesize   (focus = {{input.serviceName}})
//                             └─→ workflow.end

const GRAPH_NODES = [
  {
    id: 'N01', type: 'workflow.start',
    name: 'Start: Research UN Service',
    parameters: {
      parameterSchema: {
        serviceName: { type: 'string', required: true, description: 'Name of the UN service to research (e.g. "iNeed")' },
        maxDepth:    { type: 'number', default: 3, description: 'Expansion depth for graph traversal' },
        sources:     { type: 'array', default: ['EntityStore'], description: 'Sources to search' },
      },
    },
  },
  {
    id: 'N02', type: 'investigation.locate',
    name: 'Locate: Find Service Entity',
    parameters: {
      query:  '{{input.serviceName}}',
      limit:  20,
    },
  },
  {
    id: 'N03', type: 'investigation.expand',
    name: 'Expand: Neighbourhood',
    parameters: {
      entityId: '{{N02.output.content.roots[0]}}',
      depth:    '{{input.maxDepth}}',
    },
  },
  {
    id: 'N04', type: 'investigation.profile',
    name: 'Profile: Primary Entity',
    parameters: {
      entityId: '{{N02.output.content.roots[0]}}',
    },
  },
  {
    id: 'N05', type: 'investigation.synthesize',
    name: 'Synthesize: Narrative',
    parameters: {
      focus:  '{{input.serviceName}}',
      format: 'report',
    },
  },
  {
    id: 'N06', type: 'workflow.end',
    name: 'End',
    parameters: {},
  },
];

const GRAPH_EDGES = [
  { source: 'N01', target: 'N02', sourceNodeId: 'N01', targetNodeId: 'N02' },
  { source: 'N02', target: 'N03', sourceNodeId: 'N02', targetNodeId: 'N03' },
  { source: 'N02', target: 'N04', sourceNodeId: 'N02', targetNodeId: 'N04' },
  { source: 'N03', target: 'N05', sourceNodeId: 'N03', targetNodeId: 'N05' },
  { source: 'N04', target: 'N05', sourceNodeId: 'N04', targetNodeId: 'N05' },
  { source: 'N05', target: 'N06', sourceNodeId: 'N05', targetNodeId: 'N06' },
];

// ── Methodology definition ────────────────────────────────────────────────────

const METHODOLOGY = {
  name:        METHOD_NAME,
  userCase:    'Build a comprehensive knowledge map of a UN service, including key entities, relationships, mandates, and provenance, producing a grounded analytical narrative.',
  description: 'Reference methodology for researching a UN service end-to-end. Locates the primary service entity, expands its neighbourhood, profiles it, and synthesises findings into a structured report.',
  parameterSchema: {
    serviceName: { type: 'string', required: true },
    maxDepth:    { type: 'number', default: 3 },
    sources:     { type: 'array', default: ['EntityStore'] },
  },
  qualityRubric: {
    minSourceCoverage:   0.7,
    minProvenanceRatio:  0.5,
    minEntityCount:      10,
  },
  version: '1.0.0',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function contentHash(nodes, edges) {
  return crypto.createHash('md5').update(JSON.stringify({ nodes, edges })).digest('hex');
}

function extractToolIds(nodes) {
  return [...new Set(nodes.map(n => n.type).filter(t => !['workflow.start', 'workflow.end'].includes(t)))];
}

async function run() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');

  console.log(`\n=== MTH-003: Research UN Service seed ===\n`);

  // ── Check / delete existing ─────────────────────────────────────────────────
  const existingGraph = await mg.runQuery(
    `MATCH (c:CatalogEntry {graphKey: $k}) RETURN c.entryId AS id`, { k: GRAPH_KEY }
  );
  const existingMethod = await mg.runQuery(
    `MATCH (m:InvestigationMethodology {name: $n}) RETURN m.id AS id`, { n: METHOD_NAME }
  );

  if ((existingGraph.length || existingMethod.length) && !reset) {
    console.log('Already seeded. Use --reset to delete and recreate.');
    if (existingGraph.length) console.log(`  Graph:       entryId=${existingGraph[0].id}`);
    if (existingMethod.length) console.log(`  Methodology: id=${existingMethod[0].id}`);
    process.exit(0);
  }

  if (reset) {
    console.log('[reset] Deleting existing records...');
    for (const r of existingGraph) {
      await mg.runQuery(`MATCH (c:CatalogEntry {entryId: $id}) DETACH DELETE c`, { id: r.id });
      console.log(`  Deleted graph ${r.id}`);
    }
    for (const r of existingMethod) {
      await mg.runQuery(`MATCH (m:InvestigationMethodology {id: $id}) DETACH DELETE m`, { id: r.id });
      console.log(`  Deleted methodology ${r.id}`);
    }
  }

  // ── 1. Create graph in catalog ───────────────────────────────────────────────
  console.log('\n[1/2] Creating GXE graph in catalog...');

  const entryId   = uuidv4();
  const graphId   = uuidv4();
  const versionId = uuidv4();
  const now       = new Date().toISOString();
  const hash      = contentHash(GRAPH_NODES, GRAPH_EDGES);
  const toolIds   = extractToolIds(GRAPH_NODES);

  await mg.runQuery(
    `CREATE (c:CatalogEntry {
       entryId: $entryId, name: $name, description: $description,
       type: 'business', namespace: 'META', graphKey: $graphKey,
       tags: ['methodology', 'investigation', 'un-service'],
       visibility: 'PUBLIC', isPublic: true,
       createdBy: 'seed', createdAt: $now, updatedAt: $now,
       currentVersion: 1, usageCount: 0, qualityScore: 1.0
     })`,
    { entryId, name: `[MTH] ${METHOD_NAME}`, description: METHODOLOGY.description, graphKey: GRAPH_KEY, now }
  );

  await mg.runQuery(
    `CREATE (g:GraphDefinition {
       graphId: $graphId, nodes: $nodes, edges: $edges,
       requiredParams: '{}', toolIds: $toolIds,
       nodeCount: $nodeCount, edgeCount: $edgeCount,
       topology: 'sequential', contentHash: $hash,
       validatedAt: $now, wasAutoFixed: false,
       graphType: 'EXECUTABLE', graphSubType: null, graphDimension: 'EXECUTION'
     })`,
    { graphId, nodes: JSON.stringify(GRAPH_NODES), edges: JSON.stringify(GRAPH_EDGES), toolIds, nodeCount: GRAPH_NODES.length, edgeCount: GRAPH_EDGES.length, hash, now }
  );

  await mg.runQuery(
    `CREATE (v:GraphVersion { versionId: $versionId, versionNumber: 1, changelog: 'Initial MTH-003 version', createdAt: $now, createdBy: 'seed', contentHash: $hash })`,
    { versionId, now, hash }
  );

  await mg.runQuery(
    `MATCH (c:CatalogEntry {entryId: $e}) MATCH (g:GraphDefinition {graphId: $g}) MATCH (v:GraphVersion {versionId: $v})
     CREATE (c)-[:DEFINES]->(g) CREATE (g)-[:HAS_VERSION]->(v)`,
    { e: entryId, g: graphId, v: versionId }
  );

  // Link to CatalogRoot (idempotent)
  await mg.runQuery(
    `MATCH (root:CatalogRoot {id: 'catalog-root'}) MATCH (c:CatalogEntry {entryId: $e}) MERGE (root)-[:CONTAINS]->(c)`,
    { e: entryId }
  ).catch(() => console.log('  (CatalogRoot not found — skipping CONTAINS link)'));

  console.log(`  Graph created: entryId=${entryId}, ${GRAPH_NODES.length} nodes, ${GRAPH_EDGES.length} edges`);
  console.log(`  Tool IDs: ${toolIds.join(', ')}`);

  // ── 2. Create methodology record ─────────────────────────────────────────────
  console.log('\n[2/2] Creating InvestigationMethodology record...');
  const methodId = uuidv4();

  await mg.runQuery(
    `CREATE (m:InvestigationMethodology {
       id: $id, name: $name, userCase: $userCase, description: $description,
       parameterSchema: $parameterSchema, qualityRubric: $qualityRubric,
       graphId: $graphId, version: $version,
       status: 'ACTIVE', createdAt: $ts, updatedAt: $ts
     })`,
    {
      id: methodId,
      name: METHODOLOGY.name,
      userCase: METHODOLOGY.userCase,
      description: METHODOLOGY.description,
      parameterSchema: JSON.stringify(METHODOLOGY.parameterSchema),
      qualityRubric:   JSON.stringify(METHODOLOGY.qualityRubric),
      graphId: entryId,
      version: METHODOLOGY.version,
      ts: now,
    }
  );

  await mg.runQuery(
    `MATCH (m:InvestigationMethodology {id: $mid}) MATCH (c:CatalogEntry {entryId: $gid}) MERGE (m)-[:EXECUTES_GRAPH]->(c)`,
    { mid: methodId, gid: entryId }
  );

  console.log(`  Methodology created: id=${methodId}`);
  console.log(`  Graph link: InvestigationMethodology-[:EXECUTES_GRAPH]->CatalogEntry(${entryId})`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n=== MTH-003 seeded successfully ===`);
  console.log(`  Methodology ID : ${methodId}`);
  console.log(`  Graph entryId  : ${entryId}`);
  console.log(`  Graph key      : ${GRAPH_KEY}`);
  console.log(`  Status         : ACTIVE`);
  console.log('\nVerify via:');
  console.log(`  GET http://localhost:3010/api/v1/methodology/investigation/${methodId}`);
}

run().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
