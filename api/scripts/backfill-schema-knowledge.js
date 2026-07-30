'use strict';

/**
 * Backfill schema knowledge (IP-KB) — index every already-materialized Altiora
 * schema into the schema knowledge base (vector + graph linkage), so existing
 * services become findable by the hybrid intent resolver without waiting for a
 * re-materialization.
 *
 * For each registry-cached schema (namespace 'Altiora'):
 *   registry.getSchema(ousId) → schema-knowledge.indexSchemaKnowledge(snapshot)
 *
 * Idempotent: indexSchemaKnowledge upserts by a deterministic kbId, so re-running
 * overwrites in place. Scoped to the 'Altiora' namespace only — never touches
 * golden fixtures or other schemas.
 *
 * Usage:
 *   node scripts/backfill-schema-knowledge.js            # apply
 *   node scripts/backfill-schema-knowledge.js --dry-run  # report only, no writes
 *
 * @module scripts/backfill-schema-knowledge
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const registry = require('../src/instances/flowdesk/services/altiora-schema-registry');
const kb = require('../src/instances/flowdesk/services/schema-knowledge.service');
const { close } = require('../src/instances/flowdesk/schema-graph/driver');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`[backfill-schema-knowledge] namespace='${kb.NAMESPACE}' mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  const cached = await registry.listCached(kb.NAMESPACE);
  console.log(`[backfill-schema-knowledge] ${cached.length} cached schema(s) to process`);

  let indexed = 0; let skipped = 0; let failed = 0;
  for (const { ousId, serviceId } of cached) {
    try {
      const snapshot = await registry.getSchema(ousId);
      if (!snapshot) { skipped++; console.warn(`  - skip ${serviceId} (ousId ${ousId}): no snapshot`); continue; }
      if (DRY_RUN) {
        const text = kb.buildSchemaDescription(snapshot);
        console.log(`  ~ ${serviceId} (ousId ${ousId}): would index ${text.length} chars → kbId ${kb.kbPointId(serviceId)}`);
        indexed++;
        continue;
      }
      const res = await kb.indexSchemaKnowledge(snapshot);
      if (res && res.skipped) { skipped++; console.warn(`  - skip ${serviceId}: empty description`); }
      else { indexed++; console.log(`  + ${serviceId} (ousId ${ousId}): ${res.chars} chars → kbId ${res.kbId}`); }
    } catch (err) {
      failed++;
      console.error(`  ! ${serviceId} (ousId ${ousId}): ${err.message}`);
    }
  }

  console.log(`[backfill-schema-knowledge] done — indexed=${indexed} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((err) => { console.error('[backfill-schema-knowledge] fatal:', err); process.exitCode = 1; })
  .finally(async () => { await close(); });
