#!/usr/bin/env node
/**
 * Repair Cross-Domain Edges (no SQL Server needed)
 *
 * Strategy: Match behavioral graph procedure names against structural entity
 * table names using naming convention heuristics. Also scans nodesJson data.
 *
 * Usage: node scripts/repair-cross-domain.js [--verbose] [--dry-run]
 */
require('dotenv').config();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const dryRun = process.argv.includes('--dry-run');

  const memgraphService = require(path.join(__dirname, '..', 'src', 'services', 'memgraph.service'));
  await memgraphService.runQuery('RETURN 1 as t');
  console.log('[OK] Memgraph connected');
  if (dryRun) console.log('[MODE] Dry run — no changes will be made\n');

  // 1. Load all structural entities
  const structEntities = await memgraphService.runQuery(
    'MATCH (e:StructuralEntity) RETURN e.id as id, e.tableName as tableName, e.name as name, e.extractionSessionId as sid'
  );
  console.log(`[OK] ${structEntities.length} structural entities loaded`);

  // Build lookup: tableName → entityId (case-insensitive)
  const entityMap = new Map();
  const entityNames = [];
  for (const e of structEntities) {
    const name = e.tableName || e.name;
    if (name) {
      entityMap.set(name.toLowerCase(), e.id);
      entityNames.push(name);
    }
  }

  // 2. Load all behavioral graphs
  const graphs = await memgraphService.runQuery(
    "MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) RETURN g.id as id, g.procedureName as name, g.procedureSchema as schema, g.nodesJson as nodes, g.metadataJson as meta"
  );
  console.log(`[OK] ${graphs.length} behavioral graphs loaded\n`);

  let totalEdges = 0;
  let graphsProcessed = 0;

  for (const g of graphs) {
    const procName = g.name || '';
    const graphId = g.id;
    const matchedTables = new Set();

    // Strategy 1: Scan nodesJson for any data that references table names
    try {
      const nodesStr = g.nodes || '[]';
      const lowerNodes = nodesStr.toLowerCase();
      for (const tableName of entityNames) {
        if (lowerNodes.includes(tableName.toLowerCase())) {
          matchedTables.add(tableName);
        }
      }
    } catch (_) {}

    // Strategy 2: Match procedure name against table names
    // e.g. proc_GetOrganizationTree → OrganizationUnits, OrganizationHierarchyCache
    const procParts = procName.match(/^(?:proc_|sp_)?(?:Get|Create|Update|Delete|Set|Insert|Upsert)?(.+?)(?:ById|ByName|Stats|Tree|Children|Path|List|All|Count)?$/i);
    if (procParts) {
      const entityPart = procParts[1].toLowerCase();
      for (const tableName of entityNames) {
        const tLower = tableName.toLowerCase();
        // Check if the table name contains the entity part or vice versa
        if (tLower.includes(entityPart) || entityPart.includes(tLower.replace(/s$/, ''))) {
          matchedTables.add(tableName);
        }
        // Also check singular/plural variants
        if (entityPart.endsWith('s') && tLower.includes(entityPart.slice(0, -1))) {
          matchedTables.add(tableName);
        }
        if (tLower.endsWith('s') && entityPart.includes(tLower.slice(0, -1).toLowerCase())) {
          matchedTables.add(tableName);
        }
      }
    }

    // Strategy 3: For triggers, match the table name in the trigger name
    if (procName.startsWith('trg_')) {
      const trgParts = procName.match(/^trg_(.+?)_(?:After|Before|Instead)/i);
      if (trgParts) {
        const trgTable = trgParts[1].toLowerCase();
        for (const tableName of entityNames) {
          if (tableName.toLowerCase() === trgTable) {
            matchedTables.add(tableName);
          }
        }
      }
    }

    if (matchedTables.size === 0) {
      if (verbose) console.log(`  [SKIP] ${procName} — no table matches found`);
      continue;
    }

    graphsProcessed++;
    const tablesArr = [...matchedTables];
    console.log(`  ${procName} → [${tablesArr.join(', ')}]`);

    // Update metadata
    if (!dryRun) {
      let meta = {};
      try { meta = JSON.parse(g.meta || '{}'); } catch (_) {}
      meta.referencedTables = tablesArr;
      await memgraphService.runQuery(
        "MATCH (g:DomainGraph {id: $id}) SET g.metadataJson = $meta",
        { id: graphId, meta: JSON.stringify(meta) }
      );
    }

    // Create CROSS_DOMAIN edges
    for (const tableName of tablesArr) {
      const entityId = entityMap.get(tableName.toLowerCase());
      if (!entityId) continue;

      if (dryRun) {
        console.log(`    [DRY] Would create ${procName} -[OPERATES_ON]-> ${tableName}`);
        totalEdges++;
        continue;
      }

      const edgeId = uuidv4();
      try {
        // Check if edge already exists
        const existing = await memgraphService.runQuery(
          `MATCH (b:DomainGraph {id: $bid})-[e:CROSS_DOMAIN]->(s:StructuralEntity {id: $sid})
           RETURN e.id as id LIMIT 1`,
          { bid: graphId, sid: entityId }
        );
        if (existing.length > 0) {
          if (verbose) console.log(`    [EXISTS] ${procName} → ${tableName}`);
          continue;
        }

        await memgraphService.runQuery(
          `MATCH (b:DomainGraph {id: $behavioralId})
           MATCH (s:StructuralEntity {id: $structuralId})
           CREATE (b)-[:CROSS_DOMAIN {
             id: $edgeId,
             edgeType: 'OPERATES_ON',
             sourceDomain: 'BEHAVIORAL',
             targetDomain: 'STRUCTURAL',
             createdAt: $now
           }]->(s)`,
          {
            behavioralId: graphId,
            structuralId: entityId,
            edgeId,
            now: new Date().toISOString(),
          }
        );
        totalEdges++;
        if (verbose) console.log(`    [EDGE] → ${tableName}`);
      } catch (err) {
        console.warn(`    [ERR] ${tableName}: ${err.message}`);
      }
    }
  }

  // Verify
  const crossEdges = await memgraphService.runQuery(
    'MATCH ()-[e:CROSS_DOMAIN]->() RETURN e.edgeType as type, count(e) as c'
  );

  console.log('\n========================================');
  console.log('  REPAIR SUMMARY');
  console.log('========================================');
  console.log(`  Graphs processed:   ${graphsProcessed}/${graphs.length}`);
  console.log(`  Edges created:      ${totalEdges}`);
  console.log(`  Cross-domain edges in DB:`);
  if (crossEdges.length === 0) {
    console.log('    (none)');
  } else {
    for (const e of crossEdges) {
      console.log(`    ${e.type}: ${e.c}`);
    }
  }
  console.log('========================================\n');

  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
