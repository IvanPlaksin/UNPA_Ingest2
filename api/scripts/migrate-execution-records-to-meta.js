#!/usr/bin/env node
'use strict';

/**
 * CC-015: Migrate ExecutionRecord nodes from PROJECT to META namespace.
 * CODEX-NS §4.5: ExecutionRecords are system telemetry, not project data.
 *
 * Usage:
 *   node api/scripts/migrate-execution-records-to-meta.js [--dry-run]
 */

const memgraphService = require('../src/services/memgraph.service');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[CC-015] ExecutionRecord → META namespace migration${DRY_RUN ? ' (DRY RUN)' : ''}`);

  await memgraphService.verifyConnectivity();

  // 1. Count affected records
  const countResult = await memgraphService.runQuery(`
    MATCH (e:ExecutionRecord)
    WHERE e.namespace = 'PROJECT' OR e.namespace IS NULL
    RETURN count(e) as total
  `);
  const total = countResult[0]?.total ?? 0;
  console.log(`Found ${total} ExecutionRecord(s) to migrate`);

  if (total === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] Would migrate', total, 'records. Exiting.');
    return;
  }

  // 2. Execute migration
  const migrateResult = await memgraphService.runQuery(`
    MATCH (e:ExecutionRecord)
    WHERE e.namespace = 'PROJECT' OR e.namespace IS NULL
    SET e.namespace = 'META',
        e.fullNamespace = 'META',
        e.migratedAt = $now
    RETURN count(e) as migrated
  `, { now: new Date().toISOString() });
  const migrated = migrateResult[0]?.migrated ?? 0;
  console.log(`Migrated ${migrated} ExecutionRecord(s) to META namespace`);

  // 3. Also migrate ExecutionPattern nodes
  const patternResult = await memgraphService.runQuery(`
    MATCH (p:ExecutionPattern)
    WHERE p.namespace = 'PROJECT' OR p.namespace IS NULL
    SET p.namespace = 'META',
        p.fullNamespace = 'META',
        p.migratedAt = $now
    RETURN count(p) as migrated
  `, { now: new Date().toISOString() });
  const patternsMigrated = patternResult[0]?.migrated ?? 0;
  console.log(`Migrated ${patternsMigrated} ExecutionPattern(s) to META namespace`);

  // 4. Verification
  const verifyResult = await memgraphService.runQuery(`
    MATCH (e)
    WHERE (e:ExecutionRecord OR e:ExecutionPattern)
      AND (e.namespace = 'PROJECT' OR e.namespace IS NULL)
    RETURN count(e) as remaining
  `);
  const remaining = verifyResult[0]?.remaining ?? 0;

  if (remaining === 0) {
    console.log('Verification PASSED: 0 records remaining in PROJECT namespace');
  } else {
    console.error(`Verification FAILED: ${remaining} records still in PROJECT namespace`);
    process.exit(1);
  }

  await memgraphService.close();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
