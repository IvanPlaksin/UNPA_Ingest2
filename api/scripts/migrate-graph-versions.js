#!/usr/bin/env node
/**
 * migrate-graph-versions.js
 *
 * Migration script: Unify GraphContainer → CatalogEntry + GraphVersion
 *
 * Steps:
 *   1. Find legacy GraphContainer nodes (no catalogEntryId) → create CatalogEntry + GraphVersion v1
 *   2. Find redundant GraphContainer nodes (have catalogEntryId) → delete them
 *   3. Migrate CHILD_OF and DECOMPOSES relationships to CatalogEntry nodes
 *   4. Remove all remaining GraphContainer nodes + orphaned GraphDefinitions
 *   5. Drop GraphContainer indexes
 *
 * Usage:
 *   node api/scripts/migrate-graph-versions.js [--dry-run]
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Parse args
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Connect to Memgraph via shared service
  const memgraphService = require('../src/services/memgraph.service');

  // Wait for connection
  let retries = 5;
  while (!memgraphService.driver && retries-- > 0) {
    console.log('[migrate] Waiting for Memgraph connection...');
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!memgraphService.driver) {
    console.error('[migrate] Memgraph driver not available. Ensure Memgraph is running.');
    process.exit(1);
  }

  const driver = memgraphService.driver;
  const stats = { migrated: 0, redundantDeleted: 0, relsMigrated: 0, orphansDeleted: 0, errors: [] };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Graph Versioning Migration${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── STEP 1: Count current state ──
  {
    const session = driver.session();
    try {
      const r1 = await session.run('MATCH (g:GraphContainer) RETURN count(g) as cnt');
      const r2 = await session.run('MATCH (c:CatalogEntry) RETURN count(c) as cnt');
      const r3 = await session.run('MATCH (g:GraphContainer) WHERE g.catalogEntryId IS NOT NULL RETURN count(g) as cnt');
      const r4 = await session.run('MATCH (g:GraphContainer) WHERE g.catalogEntryId IS NULL RETURN count(g) as cnt');

      console.log('[step 0] Current state:');
      console.log(`  GraphContainer total:       ${toNum(r1.records[0].get('cnt'))}`);
      console.log(`  CatalogEntry total:         ${toNum(r2.records[0].get('cnt'))}`);
      console.log(`  GraphContainer WITH entry:  ${toNum(r3.records[0].get('cnt'))} (redundant, will delete)`);
      console.log(`  GraphContainer WITHOUT entry:${toNum(r4.records[0].get('cnt'))} (legacy, will migrate)`);
      console.log();
    } finally {
      await session.close();
    }
  }

  // ── STEP 2: Migrate legacy GraphContainers (no catalogEntryId) ──
  console.log('[step 1] Migrating legacy GraphContainer nodes → CatalogEntry + GraphVersion...');
  {
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (g:GraphContainer)
        WHERE g.catalogEntryId IS NULL
        OPTIONAL MATCH (g)-[:CONTAINS]->(d:GraphDefinition)
        RETURN g, d
        ORDER BY g.name
      `);

      for (const record of result.records) {
        const g = record.get('g').properties;
        const d = record.get('d')?.properties;

        const entryId = uuidv4();
        const graphId = uuidv4();
        const versionId = uuidv4();
        const now = new Date().toISOString();

        const nodesJson = d?.nodes || '[]';
        const edgesJson = d?.edges || '[]';
        const reqParamsJson = d?.requiredParams || '{}';

        // Compute content hash
        let contentHash = '';
        try {
          const nodes = JSON.parse(nodesJson);
          const edges = JSON.parse(edgesJson);
          const canonical = {
            nodes: (nodes || []).map(n => ({ id: n.id, type: n.type, data: n.data })).sort((a, b) => (a.id || '').localeCompare(b.id || '')),
            edges: (edges || []).map(e => ({ source: e.source || e.sourceNodeId, target: e.target || e.targetNodeId })).sort((a, b) => `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`))
          };
          contentHash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
        } catch { contentHash = ''; }

        const nodeCount = (() => { try { return JSON.parse(nodesJson).length; } catch { return 0; } })();
        const edgeCount = (() => { try { return JSON.parse(edgesJson).length; } catch { return 0; } })();

        console.log(`  → ${g.name} (${g.id}) → CatalogEntry ${entryId}`);

        if (!DRY_RUN) {
          try {
            // Create CatalogEntry
            await session.run(`
              CREATE (c:CatalogEntry {
                entryId: $entryId,
                name: $name,
                description: $description,
                type: $type,
                namespace: $namespace,
                tags: $tags,
                visibility: 'PUBLIC',
                createdBy: $createdBy,
                createdAt: $createdAt,
                updatedAt: $updatedAt,
                currentVersion: 1,
                usageCount: 0,
                qualityScore: 1.0,
                legacyGraphContainerId: $legacyId
              })
            `, {
              entryId,
              name: g.name || 'Unnamed',
              description: g.description || '',
              type: g.type || 'business',
              namespace: g.namespace || 'default',
              tags: g.tags || [],
              createdBy: g.createdBy || 'migration',
              createdAt: formatDt(g.createdAt) || now,
              updatedAt: formatDt(g.updatedAt) || now,
              legacyId: g.id,
            });

            // Create GraphDefinition
            await session.run(`
              CREATE (gd:GraphDefinition {
                graphId: $graphId,
                nodes: $nodes,
                edges: $edges,
                requiredParams: $requiredParams,
                nodeCount: $nodeCount,
                edgeCount: $edgeCount,
                contentHash: $contentHash,
                validatedAt: $now,
                wasAutoFixed: false
              })
            `, { graphId, nodes: nodesJson, edges: edgesJson, requiredParams: reqParamsJson, nodeCount, edgeCount, contentHash, now });

            // Create GraphVersion
            await session.run(`
              CREATE (v:GraphVersion {
                versionId: $versionId,
                versionNumber: 1,
                changelog: 'Migrated from legacy GraphContainer',
                createdAt: $now,
                createdBy: 'migration',
                contentHash: $contentHash
              })
            `, { versionId, now, contentHash });

            // Create relationships
            await session.run(`
              MATCH (c:CatalogEntry {entryId: $entryId})
              MATCH (gd:GraphDefinition {graphId: $graphId})
              MATCH (v:GraphVersion {versionId: $versionId})
              CREATE (c)-[:DEFINES]->(gd)
              CREATE (gd)-[:HAS_VERSION]->(v)
            `, { entryId, graphId, versionId });

            // Link to CatalogRoot
            await session.run(`
              MATCH (root:CatalogRoot {id: 'catalog-root'})
              MATCH (c:CatalogEntry {entryId: $entryId})
              MERGE (root)-[:CONTAINS]->(c)
            `, { entryId });

            // Mark old GraphContainer with the new entryId (for relationship migration)
            await session.run(`
              MATCH (g:GraphContainer {id: $id})
              SET g.catalogEntryId = $entryId
            `, { id: g.id, entryId });

            stats.migrated++;
          } catch (err) {
            console.error(`    ERROR: ${err.message}`);
            stats.errors.push({ id: g.id, name: g.name, error: err.message });
          }
        } else {
          stats.migrated++;
        }
      }
    } finally {
      await session.close();
    }
  }

  console.log(`\n[step 1] Migrated: ${stats.migrated}\n`);

  // ── STEP 3: Migrate CHILD_OF relationships ──
  console.log('[step 2] Migrating CHILD_OF relationships to CatalogEntry...');
  {
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (child:GraphContainer)-[r:CHILD_OF]->(parent:GraphContainer)
        WHERE child.catalogEntryId IS NOT NULL AND parent.catalogEntryId IS NOT NULL
        RETURN child.catalogEntryId AS childEntryId, parent.catalogEntryId AS parentEntryId
      `);

      for (const record of result.records) {
        const childEntryId = record.get('childEntryId');
        const parentEntryId = record.get('parentEntryId');

        console.log(`  → CHILD_OF: ${childEntryId} → ${parentEntryId}`);

        if (!DRY_RUN) {
          try {
            await session.run(`
              MATCH (child:CatalogEntry {entryId: $childEntryId})
              MATCH (parent:CatalogEntry {entryId: $parentEntryId})
              MERGE (child)-[:CHILD_OF]->(parent)
            `, { childEntryId, parentEntryId });
            stats.relsMigrated++;
          } catch (err) {
            console.error(`    ERROR: ${err.message}`);
            stats.errors.push({ type: 'CHILD_OF', childEntryId, parentEntryId, error: err.message });
          }
        } else {
          stats.relsMigrated++;
        }
      }
    } finally {
      await session.close();
    }
  }

  // ── STEP 4: Migrate DECOMPOSES relationships ──
  console.log('[step 3] Migrating DECOMPOSES relationships to CatalogEntry...');
  {
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (child:GraphContainer)-[r:DECOMPOSES]->(parent:GraphContainer)
        WHERE child.catalogEntryId IS NOT NULL AND parent.catalogEntryId IS NOT NULL
        RETURN child.catalogEntryId AS childEntryId, parent.catalogEntryId AS parentEntryId, r.nodeId AS nodeId
      `);

      for (const record of result.records) {
        const childEntryId = record.get('childEntryId');
        const parentEntryId = record.get('parentEntryId');
        const nodeId = record.get('nodeId');

        console.log(`  → DECOMPOSES: ${childEntryId} -[nodeId:${nodeId}]→ ${parentEntryId}`);

        if (!DRY_RUN) {
          try {
            await session.run(`
              MATCH (child:CatalogEntry {entryId: $childEntryId})
              MATCH (parent:CatalogEntry {entryId: $parentEntryId})
              MERGE (child)-[:DECOMPOSES {nodeId: $nodeId, createdAt: datetime()}]->(parent)
            `, { childEntryId, parentEntryId, nodeId: nodeId || '' });
            stats.relsMigrated++;
          } catch (err) {
            console.error(`    ERROR: ${err.message}`);
            stats.errors.push({ type: 'DECOMPOSES', childEntryId, parentEntryId, error: err.message });
          }
        } else {
          stats.relsMigrated++;
        }
      }
    } finally {
      await session.close();
    }
  }

  console.log(`\n[step 2-3] Relationships migrated: ${stats.relsMigrated}\n`);

  // ── STEP 5: Delete all GraphContainer nodes and their CONTAINS GraphDefinitions ──
  console.log('[step 4] Deleting all GraphContainer nodes + their [:CONTAINS] GraphDefinitions...');
  {
    const session = driver.session();
    try {
      if (!DRY_RUN) {
        // Delete GraphContainers and their directly linked GraphDefinitions
        const result = await session.run(`
          MATCH (g:GraphContainer)
          OPTIONAL MATCH (g)-[:CONTAINS]->(d:GraphDefinition)
          DETACH DELETE g, d
          RETURN count(g) as deleted
        `);
        stats.redundantDeleted = toNum(result.records[0].get('deleted'));
      } else {
        const result = await session.run('MATCH (g:GraphContainer) RETURN count(g) as cnt');
        stats.redundantDeleted = toNum(result.records[0].get('cnt'));
      }
      console.log(`  Deleted: ${stats.redundantDeleted} GraphContainer nodes`);
    } finally {
      await session.close();
    }
  }

  // ── STEP 6: Clean up orphaned GraphDefinitions not linked to any CatalogEntry ──
  console.log('\n[step 5] Cleaning orphaned GraphDefinitions...');
  {
    const session = driver.session();
    try {
      if (!DRY_RUN) {
        const result = await session.run(`
          MATCH (d:GraphDefinition)
          WHERE NOT (d)<-[:DEFINES]-(:CatalogEntry)
            AND NOT (d)<-[:CONTAINS]-()
          DETACH DELETE d
          RETURN count(d) as deleted
        `);
        stats.orphansDeleted = toNum(result.records[0].get('deleted'));
      } else {
        const result = await session.run(`
          MATCH (d:GraphDefinition)
          WHERE NOT (d)<-[:DEFINES]-(:CatalogEntry) AND NOT (d)<-[:CONTAINS]-()
          RETURN count(d) as cnt
        `);
        stats.orphansDeleted = toNum(result.records[0].get('cnt'));
      }
      console.log(`  Orphaned GraphDefinitions removed: ${stats.orphansDeleted}`);
    } finally {
      await session.close();
    }
  }

  // ── STEP 7: Drop GraphContainer indexes ──
  console.log('\n[step 6] Dropping GraphContainer indexes...');
  {
    const session = driver.session();
    try {
      const indexesToDrop = [
        'DROP INDEX ON :GraphContainer(id)',
        'DROP INDEX ON :GraphContainer(namespace)',
        'DROP INDEX ON :GraphContainer(type)',
        'DROP INDEX ON :GraphContainer(name)',
      ];
      for (const q of indexesToDrop) {
        if (!DRY_RUN) {
          try {
            await session.run(q);
            console.log(`  ${q} — OK`);
          } catch (e) {
            console.log(`  ${q} — skipped (${e.message})`);
          }
        } else {
          console.log(`  [dry-run] ${q}`);
        }
      }
    } finally {
      await session.close();
    }
  }

  // ── STEP 8: Verify final state ──
  console.log('\n[step 7] Verifying final state...');
  {
    const session = driver.session();
    try {
      const r1 = await session.run('MATCH (g:GraphContainer) RETURN count(g) as cnt');
      const r2 = await session.run('MATCH (c:CatalogEntry) RETURN count(c) as cnt');
      const r3 = await session.run('MATCH (v:GraphVersion) RETURN count(v) as cnt');
      const r4 = await session.run('MATCH (d:GraphDefinition) RETURN count(d) as cnt');

      console.log(`  GraphContainer remaining: ${toNum(r1.records[0].get('cnt'))} (should be 0)`);
      console.log(`  CatalogEntry total:       ${toNum(r2.records[0].get('cnt'))}`);
      console.log(`  GraphVersion total:        ${toNum(r3.records[0].get('cnt'))}`);
      console.log(`  GraphDefinition total:     ${toNum(r4.records[0].get('cnt'))}`);
    } finally {
      await session.close();
    }
  }

  // ── Summary ──
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  MIGRATION SUMMARY${DRY_RUN ? ' (DRY RUN — no changes made)' : ''}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Legacy graphs migrated:    ${stats.migrated}`);
  console.log(`  Relationships migrated:    ${stats.relsMigrated}`);
  console.log(`  GraphContainers deleted:   ${stats.redundantDeleted}`);
  console.log(`  Orphaned defs cleaned:     ${stats.orphansDeleted}`);
  console.log(`  Errors:                    ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log('\n  Error details:');
    stats.errors.forEach(e => console.log(`    - ${JSON.stringify(e)}`));
  }
  console.log();

  process.exit(stats.errors.length > 0 ? 1 : 0);
}

// ── Helpers ──

function toNum(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
}

function formatDt(dt) {
  if (!dt) return null;
  if (typeof dt === 'string') return dt;
  if (dt.toStandardDate) return dt.toStandardDate().toISOString();
  return dt.toString();
}

main().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
