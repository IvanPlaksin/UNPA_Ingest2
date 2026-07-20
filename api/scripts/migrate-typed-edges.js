#!/usr/bin/env node
/**
 * CGE-003 — Migrate ES_RELATED_TO {relType} to typed edge labels.
 *
 * For each [:ES_RELATED_TO {relType}] edge between ESEntity nodes:
 *   - Creates a corresponding typed edge (:GOVERNS, :MANDATES, etc.)
 *   - Copies all properties (documentId, extractedAt, context, confidence)
 *   - Adds migration provenance (migratedAt, migratedFrom='ES_RELATED_TO')
 *   - null relType → :RELATED_TO (policy from canonical-graph.constants.js)
 *   - Does NOT delete ES_RELATED_TO edges (rollback safety)
 *
 * Idempotent — skips pairs that already have the typed edge.
 *
 * Usage:
 *   node api/scripts/migrate-typed-edges.js --dry-run
 *   node api/scripts/migrate-typed-edges.js --dry-run --limit=500
 *   node api/scripts/migrate-typed-edges.js --batch-size=200 --limit=1000
 *   node api/scripts/migrate-typed-edges.js --batch-size=200
 *
 * After migration verified (CGE-005 passes), delete legacy edges via CGE-006.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const neo4j    = require('neo4j-driver');
const memgraph = require('../src/services/memgraph.service');
const { ALL_EDGE_TYPES, DEFAULT_EDGE_TYPE } = require('../src/constants/canonical-graph.constants');

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const BATCH     = Number((args.find(a => a.startsWith('--batch-size=')) || '').split('=')[1] || 200);
const LIMIT_ARG = Number((args.find(a => a.startsWith('--limit='))      || '').split('=')[1] || 0);

const MIGRATED_AT   = new Date().toISOString();
const MIGRATED_FROM = 'ES_RELATED_TO';

function log(...a) { console.log('[typed-edge-migrate]', ...a); }

// ── Count ─────────────────────────────────────────────────────────────────────

async function countByRelType() {
  const rows = await memgraph.runQuery(
    `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
     RETURN coalesce(r.relType, '__NULL__') AS relType, count(r) AS cnt
     ORDER BY cnt DESC`,
    {}
  );
  return rows.map(r => ({
    relType: r.relType === '__NULL__' ? null : r.relType,
    count:   typeof r.cnt === 'object' ? (r.cnt?.low ?? r.cnt) : r.cnt,
  }));
}

async function countPending(relType) {
  const rt = relType || DEFAULT_EDGE_TYPE;
  // Edges that don't yet have a corresponding typed edge
  const rows = await memgraph.runQuery(
    `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
     WHERE coalesce(r.relType, $nullFallback) = $rt
       AND NOT (a)-[:${rt}]->(b)
     RETURN count(r) AS cnt`,
    { rt, nullFallback: DEFAULT_EDGE_TYPE }
  );
  const cnt = rows[0]?.cnt;
  return typeof cnt === 'object' ? (cnt?.low ?? cnt) : (cnt ?? 0);
}

// ── Migrate one relType in batches ────────────────────────────────────────────

async function migrateRelType(relType, globalLimit) {
  const label = relType || DEFAULT_EDGE_TYPE;

  const stats = { label, created: 0, skipped: 0, errors: 0 };

  let totalProcessed = 0;

  while (true) {
    // Limit total work across all batches for this relType
    const remaining = globalLimit > 0 ? globalLimit - totalProcessed : BATCH;
    const batchLimit = Math.min(BATCH, remaining > 0 ? remaining : BATCH);

    let rows;
    try {
      rows = await memgraph.runQuery(
        `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
         WHERE coalesce(r.relType, $nullFallback) = $rt
           AND NOT (a)-[:${label}]->(b)
         WITH a, b, r
         LIMIT $lim
         RETURN id(a) AS aInternalId, a.id AS aId,
                id(b) AS bInternalId, b.id AS bId,
                properties(r) AS props`,
        {
          rt:          label,
          nullFallback: DEFAULT_EDGE_TYPE,
          lim:         neo4j.int(batchLimit),
        }
      );
    } catch (err) {
      log(`  ERROR fetching batch for ${label}: ${err.message}`);
      stats.errors += batchLimit;
      break;
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      try {
        if (!DRY_RUN) {
          // Copy all properties from ES_RELATED_TO except relType
          const props = { ...(row.props || {}) };
          delete props.relType;
          props.migratedAt   = MIGRATED_AT;
          props.migratedFrom = MIGRATED_FROM;

          // Build SET clause dynamically
          const setEntries = Object.entries(props);
          const setClause = setEntries
            .map(([k], i) => `new.\`${k}\` = $p${i}`)
            .join(', ');
          const setParams = { aId: row.aId, bId: row.bId };
          setEntries.forEach(([, v], i) => { setParams[`p${i}`] = v; });

          await memgraph.runQuery(
            `MATCH (a:ESEntity {id: $aId}), (b:ESEntity {id: $bId})
             CREATE (a)-[new:${label}]->(b)
             ${setClause ? `SET ${setClause}` : ''}
             RETURN 1`,
            setParams
          );
        }
        stats.created++;
      } catch (err) {
        log(`  ERROR creating :${label} for ${row.aId}→${row.bId}: ${err.message}`);
        stats.errors++;
      }
    }

    totalProcessed += rows.length;
    log(`  :${label} — batch done (created=${stats.created}, errors=${stats.errors}, total_processed=${totalProcessed})`);

    if (rows.length < batchLimit) break;

    // Honour global limit
    if (globalLimit > 0 && totalProcessed >= globalLimit) {
      log(`  :${label} — limit reached (${globalLimit}), stopping`);
      break;
    }
  }

  return stats;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== CGE-003 typed-edge migration ===`);
  log(`  dry-run:    ${DRY_RUN}`);
  log(`  batch-size: ${BATCH}`);
  log(`  limit:      ${LIMIT_ARG || 'unlimited'}`);
  log('');

  // Step 0: Distribution snapshot
  log('Fetching current ES_RELATED_TO distribution…');
  const distribution = await countByRelType();
  const totalEdges = distribution.reduce((s, r) => s + r.count, 0);
  log(`Total ES_RELATED_TO edges: ${totalEdges}`);
  for (const { relType, count } of distribution) {
    const label = relType || `(null → ${DEFAULT_EDGE_TYPE})`;
    log(`  ${label.padEnd(20)} ${count}`);
  }
  log('');

  // Step 1: Determine which relTypes to migrate.
  // null relType → DEFAULT_EDGE_TYPE (coalesce in queries handles both at once).
  const relTypesToProcess = [...new Set(
    distribution.map(r => r.relType || DEFAULT_EDGE_TYPE)
  )];

  // Filter to only canonical types + null
  const canonical = new Set(ALL_EDGE_TYPES);
  const nonCanonical = relTypesToProcess.filter(rt => rt !== null && !canonical.has(rt));
  if (nonCanonical.length > 0) {
    log(`WARNING: Non-canonical relTypes found in data (will map to ${DEFAULT_EDGE_TYPE}): ${nonCanonical.join(', ')}`);
  }

  // Step 2: Count pending for each
  log('Counting pending (not yet migrated) edges per type…');
  const pendingCounts = {};
  let totalPending = 0;
  for (const rt of relTypesToProcess) {
    const label = rt || DEFAULT_EDGE_TYPE;
    const pending = await countPending(rt);
    pendingCounts[label] = pending;
    totalPending += pending;
    if (pending > 0) log(`  :${label.padEnd(20)} ${pending} pending`);
  }
  log(`Total pending: ${totalPending}`);
  log('');

  if (totalPending === 0) {
    log('Nothing to migrate — all typed edges already exist. Done.');
    process.exit(0);
  }

  if (DRY_RUN) {
    log('DRY-RUN mode — no writes will be performed.');
    log('Run without --dry-run to apply migration.');
    log('');
  }

  // Step 3: Migrate
  const allStats = [];
  let globalRemaining = LIMIT_ARG || Infinity;

  for (const rt of relTypesToProcess) {
    const label = rt || DEFAULT_EDGE_TYPE;
    const pending = pendingCounts[label];
    if (pending === 0) continue;

    const perTypeLimit = LIMIT_ARG > 0
      ? Math.min(pending, globalRemaining)
      : 0;  // 0 = unlimited

    log(`Migrating :${label} (${pending} pending)…`);
    const stats = await migrateRelType(rt, perTypeLimit);
    allStats.push(stats);

    if (LIMIT_ARG > 0) {
      globalRemaining -= stats.created + stats.errors;
      if (globalRemaining <= 0) {
        log('Global limit reached — stopping.');
        break;
      }
    }
  }

  // Step 4: Summary
  log('');
  log('=== Migration Summary ===');
  let grandCreated = 0, grandErrors = 0;
  for (const s of allStats) {
    log(`  :${s.label.padEnd(20)} created=${s.created} errors=${s.errors}`);
    grandCreated += s.created;
    grandErrors  += s.errors;
  }
  log('');
  log(`  Grand total created: ${grandCreated}`);
  log(`  Grand total errors:  ${grandErrors}`);

  if (DRY_RUN) {
    log('  (dry-run — no writes performed)');
    log('  To apply: re-run without --dry-run');
  } else {
    log('');
    log('  ES_RELATED_TO edges preserved for rollback.');
    log('  Run CGE-005 tests, then CGE-006 cleanup to remove legacy edges.');
  }

  process.exit(grandErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[typed-edge-migrate] Fatal:', err.message, err.stack);
  process.exit(1);
});
