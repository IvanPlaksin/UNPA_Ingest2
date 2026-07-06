'use strict';
/**
 * Migration: add status='COMMITTED', producedBy='TOOL', revisionNumber=1
 * to all InvestigationArtifact nodes that pre-date the PROPOSED/COMMITTED model.
 *
 * Run: node api/scripts/migrate-investigation-artifact-status.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  const mg = require('../src/services/memgraph.service');

  console.log('[Migration] Connecting to Memgraph...');

  // Count artifacts without status
  const countRows = await mg.runQuery(
    `MATCH (a:InvestigationArtifact) WHERE a.status IS NULL RETURN count(a) AS cnt`
  );
  const count = countRows[0]?.cnt;
  const n = typeof count === 'object' ? (count?.low ?? 0) : (count || 0);
  console.log(`[Migration] Found ${n} artifacts without status field`);

  if (n === 0) {
    console.log('[Migration] Nothing to migrate.');
    process.exit(0);
  }

  // Apply migration
  await mg.runQuery(
    `MATCH (a:InvestigationArtifact) WHERE a.status IS NULL
     SET a.status = 'COMMITTED',
         a.producedBy = 'TOOL',
         a.revisionNumber = 1`
  );

  // Verify
  const verifyRows = await mg.runQuery(
    `MATCH (a:InvestigationArtifact) WHERE a.status IS NULL RETURN count(a) AS cnt`
  );
  const remaining = verifyRows[0]?.cnt;
  const rem = typeof remaining === 'object' ? (remaining?.low ?? 0) : (remaining || 0);

  console.log(`[Migration] Done. Remaining without status: ${rem}`);
  console.log(`[Migration] Updated ${n - rem} artifacts → status='COMMITTED', producedBy='TOOL', revisionNumber=1`);

  process.exit(0);
}

main().catch(e => { console.error('[Migration] Failed:', e); process.exit(1); });
