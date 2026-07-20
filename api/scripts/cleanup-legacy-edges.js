'use strict';
/**
 * CGE-006 — Cleanup script: remove legacy ES_RELATED_TO edges after typed-edge migration.
 *
 * THIS IS A POINT-OF-NO-RETURN OPERATION. Run --dry-run first, then confirm with Ivan.
 *
 * Usage:
 *   node api/scripts/cleanup-legacy-edges.js --dry-run          # show count only
 *   node api/scripts/cleanup-legacy-edges.js                    # delete all ES_RELATED_TO
 *   node api/scripts/cleanup-legacy-edges.js --batch-size=500   # custom batch
 *
 * Pre-flight: verifies typed edge count == 12037 before deleting anything.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mg = require('../src/services/memgraph.service');

const args   = process.argv.slice(2);
const DRY    = args.includes('--dry-run');
const BATCH  = parseInt((args.find(a => a.startsWith('--batch-size=')) || '').replace('--batch-size=', '') || '500', 10);

const EXPECTED_TYPED = 12037;

async function countEdges(label) {
  const rows = await mg.runQuery(`MATCH ()-[r:${label}]->() RETURN count(r) AS cnt`, {});
  const v = rows[0]?.cnt;
  return typeof v === 'object' ? (v?.low ?? 0) : (v ?? 0);
}

async function main() {
  console.log('=== CGE-006: ES_RELATED_TO Cleanup ===\n');

  // ── Pre-flight checks ────────────────────────────────────────────────────────
  const legacyCount = await countEdges('ES_RELATED_TO');
  console.log(`Legacy ES_RELATED_TO edges: ${legacyCount}`);

  if (legacyCount === 0) {
    console.log('No ES_RELATED_TO edges found — already clean. Exiting.');
    process.exit(0);
  }

  // Validate typed edge count to make sure migration was complete
  const { ALL_EDGE_TYPES } = require('../src/constants/canonical-graph.constants');
  let typedTotal = 0;
  for (const et of ALL_EDGE_TYPES) {
    const cnt = await countEdges(et);
    if (cnt > 0) process.stdout.write(`  :${et} = ${cnt}\n`);
    typedTotal += cnt;
  }
  console.log(`\nTyped edge total: ${typedTotal} (expected ≥ ${EXPECTED_TYPED})`);

  if (typedTotal < EXPECTED_TYPED) {
    console.error(`\nABORTED: Typed edge count ${typedTotal} < expected ${EXPECTED_TYPED}.`);
    console.error('Migration may be incomplete. Do not proceed with cleanup.');
    process.exit(1);
  }
  console.log('Pre-flight check passed.\n');

  if (DRY) {
    console.log(`DRY RUN: Would delete ${legacyCount} ES_RELATED_TO edges.`);
    console.log('Run without --dry-run to execute cleanup.');
    process.exit(0);
  }

  // ── Batch deletion ────────────────────────────────────────────────────────────
  console.log(`Starting deletion in batches of ${BATCH}...`);
  const start = Date.now();
  let totalDeleted = 0;
  let iteration = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    iteration++;
    const rows = await mg.runQuery(
      `MATCH ()-[r:ES_RELATED_TO]->()
       WITH r LIMIT ${BATCH}
       DELETE r
       RETURN count(*) AS deleted`,
      {}
    );
    const deleted = (() => { const v = rows[0]?.deleted; return typeof v === 'object' ? (v?.low ?? 0) : (v ?? 0); })();
    totalDeleted += deleted;
    process.stdout.write(`  Batch ${iteration}: deleted ${deleted} (total ${totalDeleted})\n`);
    if (deleted === 0) break;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ── Post-deletion verification ────────────────────────────────────────────────
  const remaining = await countEdges('ES_RELATED_TO');
  console.log(`\n=== Results ===`);
  console.log(`Deleted:   ${totalDeleted} ES_RELATED_TO edges`);
  console.log(`Remaining: ${remaining}`);
  console.log(`Elapsed:   ${elapsed}s`);

  if (remaining === 0) {
    console.log('\nCGE-006 COMPLETE — ES_RELATED_TO fully removed from graph.');
    console.log('The typed edge model (CGE) is now the sole edge vocabulary.');
  } else {
    console.warn(`\nWARNING: ${remaining} ES_RELATED_TO edges remain after cleanup.`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
