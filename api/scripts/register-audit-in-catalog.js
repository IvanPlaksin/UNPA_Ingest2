/**
 * register-audit-in-catalog.js
 *
 * Reads the audit nodes/edges from Memgraph (namespace GXE)
 * and creates a CatalogEntry + GraphDefinition + GraphVersion
 * so they appear in the Graph Catalog UI.
 *
 * Usage: cd api && node scripts/register-audit-in-catalog.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const neo4j = require('../src/services/neo4j.service');

async function main() {
  const session = neo4j.getSession();

  try {
    // 1. Read all audit nodes from Memgraph
    console.log('[1/3] Reading audit nodes and edges from Memgraph...');
    const nodesRes = await session.run(
      'MATCH (n) WHERE n.namespace = "GXE" RETURN n, labels(n)[0] AS label'
    );
    const edgesRes = await session.run(
      'MATCH (a)-[r]->(b) WHERE a.namespace = "GXE" OR b.namespace = "GXE" RETURN a.id AS source, b.id AS target, type(r) AS relType'
    );

    // 2. Transform to ReactFlow-compatible format
    const nodes = nodesRes.records.map(rec => {
      const props = rec.get('n').properties;
      const label = rec.get('label');
      return {
        id: props.id,
        type: label.toLowerCase(),
        position: { x: 0, y: 0 },
        data: {
          label: props.name || props.id,
          type: label,
          ...props
        }
      };
    });

    const edges = edgesRes.records.map((rec, i) => ({
      id: 'e-' + i,
      source: rec.get('source'),
      target: rec.get('target'),
      label: rec.get('relType'),
      type: 'smoothstep'
    }));

    console.log(`  Found ${nodes.length} nodes, ${edges.length} edges`);

    // 3. Check if already registered
    const existing = await session.run(
      'MATCH (c:CatalogEntry {namespace: "GXE", name: "UNPA_Ingest 10-Phase Audit"}) RETURN c.entryId AS id'
    );
    if (existing.records.length > 0) {
      const existingId = existing.records[0].get('id');
      console.log(`  Already registered as CatalogEntry entryId=${existingId}, updating...`);

      // Update existing GraphDefinition
      await session.run(`
        MATCH (c:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)
        SET d.nodes = $nodes,
            d.edges = $edges,
            d.nodeCount = $nodeCount,
            d.edgeCount = $edgeCount,
            c.updatedAt = $now,
            c.description = $description
        RETURN c.entryId AS id
      `, {
        id: existingId,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        now: new Date().toISOString(),
        description: `${nodes.length} nodes, ${edges.length} edges: components, goals, gaps, debt, quick-wins from the 10-phase system audit`
      });

      console.log(`  Updated CatalogEntry entryId=${existingId}`);
      return;
    }

    // 4. Create new CatalogEntry + GraphDefinition + GraphVersion
    console.log('[2/3] Creating CatalogEntry in catalog...');
    const entryId = uuidv4();
    const graphId = uuidv4();
    const versionId = uuidv4();
    const now = new Date().toISOString();
    const nodesJson = JSON.stringify(nodes);
    const edgesJson = JSON.stringify(edges);
    const contentHash = crypto.createHash('sha256').update(JSON.stringify({
      nodes: nodes.map(n => ({ id: n.id, type: n.type })).sort((a, b) => a.id.localeCompare(b.id)),
      edges: edges.map(e => ({ source: e.source, target: e.target })).sort((a, b) => `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`))
    })).digest('hex');

    await session.run(`
      CREATE (c:CatalogEntry {
        entryId: $entryId,
        name: $name,
        namespace: $namespace,
        type: $type,
        description: $description,
        createdAt: $now,
        updatedAt: $now,
        createdBy: 'audit-script',
        tags: ['audit', 'meta', 'knowledge-graph', 'gxe'],
        isPublic: true,
        visibility: 'PUBLIC',
        currentVersion: 1,
        usageCount: 0,
        qualityScore: 1.0
      })
    `, {
      entryId,
      name: 'UNPA_Ingest 10-Phase Audit',
      namespace: 'GXE',
      type: 'business',
      description: `${nodes.length} nodes, ${edges.length} edges: components, goals, gaps, debt, quick-wins from the 10-phase system audit`,
      now,
    });

    await session.run(`
      CREATE (d:GraphDefinition {
        graphId: $graphId,
        nodes: $nodes,
        edges: $edges,
        requiredParams: '{}',
        nodeCount: $nodeCount,
        edgeCount: $edgeCount,
        contentHash: $contentHash,
        validatedAt: $now,
        wasAutoFixed: false
      })
    `, { graphId, nodes: nodesJson, edges: edgesJson, nodeCount: nodes.length, edgeCount: edges.length, contentHash, now });

    await session.run(`
      CREATE (v:GraphVersion {
        versionId: $versionId,
        versionNumber: 1,
        changelog: 'Initial audit registration',
        createdAt: $now,
        createdBy: 'audit-script',
        contentHash: $contentHash
      })
    `, { versionId, now, contentHash });

    await session.run(`
      MATCH (c:CatalogEntry {entryId: $entryId})
      MATCH (d:GraphDefinition {graphId: $graphId})
      MATCH (v:GraphVersion {versionId: $versionId})
      CREATE (c)-[:DEFINES]->(d)
      CREATE (d)-[:HAS_VERSION]->(v)
    `, { entryId, graphId, versionId });

    await session.run(`
      MATCH (root:CatalogRoot {id: 'catalog-root'})
      MATCH (c:CatalogEntry {entryId: $entryId})
      MERGE (root)-[:CONTAINS]->(c)
    `, { entryId });

    console.log(`  CatalogEntry created: entryId=${entryId}`);

    // 5. Verify
    console.log('\n[3/3] Verifying catalog entry...');
    const verify = await session.run(
      'MATCH (c:CatalogEntry {namespace: "GXE"}) RETURN c.entryId AS id, c.name AS name, c.type AS type'
    );
    for (const rec of verify.records) {
      console.log(`  [${rec.get('type')}] ${rec.get('name')} (${rec.get('id')})`);
    }

    console.log('\nDone! Refresh Graph Catalog in the UI.');
  } finally {
    await session.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
