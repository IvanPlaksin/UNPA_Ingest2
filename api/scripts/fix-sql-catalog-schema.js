#!/usr/bin/env node
/**
 * Fix SQL extraction CatalogEntry schema to include GraphDefinition + GraphVersion.
 * The seed script created bare CatalogEntry nodes with nodesJson/edgesJson but
 * the catalog API expects the proper schema: CatalogEntry → DEFINES → GraphDefinition → HAS_VERSION → GraphVersion.
 */
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

async function main() {
  const memgraph = require(path.join(__dirname, '..', 'src', 'services', 'memgraph.service'));
  await memgraph.runQuery('RETURN 1 as t');
  console.log('[OK] Memgraph connected');

  const { allGraphs } = require(
    path.join(__dirname, '..', 'src', 'services', 'graph-definitions', 'sql-extraction-pipeline')
  );

  const now = new Date().toISOString();

  for (const graph of allGraphs) {
    const graphId = graph.graph_id;

    // Check if GraphDefinition already exists
    const existing = await memgraph.runQuery(
      'MATCH (c:CatalogEntry {graphId: $graphId})-[:DEFINES]->(d:GraphDefinition) RETURN d.graphId as gid',
      { graphId }
    );

    if (existing.length > 0) {
      console.log(`[SKIP] ${graphId} already has GraphDefinition`);
      continue;
    }

    // Update CatalogEntry to have entryId field (used by catalog service)
    await memgraph.runQuery(
      `MATCH (c:CatalogEntry {graphId: $graphId})
       SET c.entryId = $graphId,
           c.type = $type,
           c.currentVersion = 1,
           c.createdBy = 'seed-script',
           c.isPublic = true,
           c.tags = $tags`,
      {
        graphId,
        type: graph.category === 'META' ? 'composite' : 'business',
        tags: [graph.category, graph.namespace].filter(Boolean),
      }
    );

    const nodesJson = JSON.stringify(graph.nodes);
    const edgesJson = JSON.stringify(graph.edges);
    const reqInputs = graph.nodes.find(n => n.type === 'start')?.data?.config?.inputs || [];
    const reqParamsJson = JSON.stringify(reqInputs);
    const contentHash = crypto.createHash('sha256').update(nodesJson + edgesJson).digest('hex');
    const graphDefId = uuidv4();
    const versionId = uuidv4();

    // Create GraphDefinition
    await memgraph.runQuery(
      `CREATE (d:GraphDefinition {
        graphId: $graphDefId,
        nodes: $nodes,
        edges: $edges,
        requiredParams: $requiredParams,
        nodeCount: $nodeCount,
        edgeCount: $edgeCount,
        contentHash: $contentHash,
        validatedAt: $now,
        wasAutoFixed: false
      })`,
      { graphDefId, nodes: nodesJson, edges: edgesJson, requiredParams: reqParamsJson, nodeCount: graph.nodes.length, edgeCount: graph.edges.length, contentHash, now }
    );

    // Create GraphVersion
    await memgraph.runQuery(
      `CREATE (v:GraphVersion {
        versionId: $versionId,
        versionNumber: 1,
        changelog: 'Seeded from sql-extraction-pipeline.js',
        createdAt: $now,
        createdBy: 'seed-script',
        contentHash: $contentHash
      })`,
      { versionId, now, contentHash }
    );

    // Link: CatalogEntry → DEFINES → GraphDefinition → HAS_VERSION → GraphVersion
    await memgraph.runQuery(
      `MATCH (c:CatalogEntry {graphId: $graphId})
       MATCH (d:GraphDefinition {graphId: $graphDefId})
       MATCH (v:GraphVersion {versionId: $versionId})
       CREATE (c)-[:DEFINES]->(d)
       CREATE (d)-[:HAS_VERSION]->(v)`,
      { graphId, graphDefId, versionId }
    );

    // Link to CatalogRoot
    await memgraph.runQuery(
      `MATCH (root:CatalogRoot {id: 'catalog-root'})
       MATCH (c:CatalogEntry {graphId: $graphId})
       MERGE (root)-[:CONTAINS]->(c)`,
      { graphId }
    );

    console.log(`[OK] ${graphId}: GraphDefinition + GraphVersion created (${graph.nodes.length}N/${graph.edges.length}E)`);
  }

  // Verify
  console.log('\n=== VERIFICATION ===');
  for (const graph of allGraphs) {
    const r = await memgraph.runQuery(
      `MATCH (c:CatalogEntry {graphId: $graphId})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
       RETURN c.name as name, d.nodeCount as nodes, d.edgeCount as edges, v.versionNumber as ver`,
      { graphId: graph.graph_id }
    );
    if (r.length > 0) {
      console.log(`  [OK] ${graph.graph_id}: ${r[0].name} (${r[0].nodes}N/${r[0].edges}E, v${r[0].ver})`);
    } else {
      console.log(`  [FAIL] ${graph.graph_id}: no GraphDefinition found`);
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
