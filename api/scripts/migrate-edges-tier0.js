#!/usr/bin/env node
/**
 * Migrate existing Memgraph edges to Tier 0 schema.
 *
 * Adds missing Tier 0 properties with safe defaults so all existing
 * knowledge edges become compliant without breaking anything.
 *
 * Usage:
 *   node api/scripts/migrate-edges-tier0.js [--dry-run] [--namespace=X] [--batch-size=100]
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const neo4j    = require('neo4j-driver');
const memgraph = require('../src/services/memgraph.service');
const { buildDefaults } = require('../src/services/knowledge/tier0/schemas/edge-schema');

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const nsArg     = (args.find(a => a.startsWith('--namespace=')) || '').split('=')[1] || null;
const batchSize = Number((args.find(a => a.startsWith('--batch-size=')) || '').split('=')[1] || 100);

function log(...a) { console.log('[tier0-migrate]', ...a); }

// Semantic relationship types we care about — skip infrastructure edges
const SEMANTIC_REL_TYPES = [
  'RELATES_TO', 'MENTIONS', 'SUPPORTS', 'CONTRADICTS', 'DEPENDS_ON',
  'PART_OF', 'INSTANCE_OF', 'REPORTS_TO', 'PROVIDES', 'REQUIRES',
  'IMPLEMENTS', 'SUPERSEDES', 'DERIVED_FROM', 'LINKED_TO',
];

async function countEdgesNeedingMigration(relType, namespace) {
  let cypher = `MATCH ()-[r:${relType}]->() WHERE r.polarity IS NULL`;
  if (namespace) cypher += ` AND r.namespace = $ns`;
  cypher += ` RETURN count(r) AS cnt`;
  const rows = await memgraph.runQuery(cypher, { ns: namespace || null });
  return rows[0]?.cnt || 0;
}

async function migrateRelType(relType, namespace) {
  let offset = 0;
  let migrated = 0;
  let alreadyCompliant = 0;
  let errors = 0;

  const defaults = buildDefaults();
  const now = new Date().toISOString();

  while (true) {
    let cypher = `MATCH ()-[r:${relType}]->() WHERE r.polarity IS NULL`;
    if (namespace) cypher += ` AND r.namespace = $ns`;
    cypher += ` RETURN id(r) AS edgeId, properties(r) AS props
                SKIP $skip LIMIT $limit`;

    const rows = await memgraph.runQuery(cypher, {
      ns:    namespace || null,
      skip:  neo4j.int(offset),
      limit: neo4j.int(batchSize),
    });

    if (!rows.length) break;

    for (const row of rows) {
      try {
        const current  = row.props || {};
        const patch    = {};

        for (const [key, val] of Object.entries(defaults)) {
          if (current[key] === undefined || current[key] === null) {
            // Use actual recorded_at as migration time if available
            patch[key] = key === 'recorded_at' && current.created_at
              ? current.created_at
              : val;
          }
        }

        if (Object.keys(patch).length === 0) {
          alreadyCompliant++;
          continue;
        }

        if (!DRY_RUN) {
          const setClause = Object.keys(patch)
            .map(k => `r.\`${k}\` = $p_${k}`)
            .join(', ');
          const params = { edgeId: neo4j.int(row.edgeId) };
          for (const [k, v] of Object.entries(patch)) params[`p_${k}`] = v;

          await memgraph.runQuery(
            `MATCH ()-[r]->() WHERE id(r) = $edgeId SET ${setClause}`,
            params
          );
        }
        migrated++;
      } catch (err) {
        log(`  ERROR on edge ${row.edgeId}: ${err.message}`);
        errors++;
      }
    }

    log(`  ${relType}: processed ${offset + rows.length} (migrated=${migrated}, compliant=${alreadyCompliant}, errors=${errors})`);
    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  return { relType, migrated, alreadyCompliant, errors };
}

async function main() {
  log(`Starting Tier 0 edge migration (dry-run=${DRY_RUN}, namespace=${nsArg || 'all'}, batch=${batchSize})`);

  let totalMigrated = 0;
  let totalCompliant = 0;
  let totalErrors = 0;

  for (const relType of SEMANTIC_REL_TYPES) {
    const cnt = await countEdgesNeedingMigration(relType, nsArg);
    if (cnt === 0) {
      log(`${relType}: skipped (0 edges needing migration)`);
      continue;
    }
    log(`${relType}: ${cnt} edges need migration...`);
    const result = await migrateRelType(relType, nsArg);
    totalMigrated  += result.migrated;
    totalCompliant += result.alreadyCompliant;
    totalErrors    += result.errors;
  }

  log(`=== Done ===`);
  log(`  Migrated:         ${totalMigrated}`);
  log(`  Already compliant:${totalCompliant}`);
  log(`  Errors:           ${totalErrors}`);
  if (DRY_RUN) log('  (dry-run — no writes performed)');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[tier0-migrate] Fatal:', err.message);
  process.exit(1);
});
