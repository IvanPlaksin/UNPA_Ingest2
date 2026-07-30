'use strict';

/**
 * Re-materialize every cached Altiora schema (namespace 'Altiora') so newly-carried
 * data — section grouping (sectionId) and the conditional "Other (please specify)"
 * links — is written into the schema graph, and re-index each into the schema
 * knowledge base.
 *
 * Mirrors the schema-orchestrator's materialize pipeline but SKIPS detect (the ousId
 * is already known from the registry): getSchema → materialize → bakeLov →
 * storeSchema → indexSchemaKnowledge. Idempotent; scoped to the 'Altiora' namespace.
 *
 * Usage:
 *   node scripts/rematerialize-altiora-schemas.js            # apply
 *   node scripts/rematerialize-altiora-schemas.js --dry-run  # report only
 *
 * @module scripts/rematerialize-altiora-schemas
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const registry = require('../src/instances/flowdesk/services/altiora-schema-registry');
const kb = require('../src/instances/flowdesk/services/schema-knowledge.service');
const { getAltioraSchemaClient } = require('../src/instances/flowdesk/services/altiora-schema-client');
const { materializeSchema } = require('../src/instances/flowdesk/services/altiora-schema-materializer');
const { bakeLov } = require('../src/instances/flowdesk/services/altiora-lov.service');
const { close } = require('../src/instances/flowdesk/schema-graph/driver');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const client = getAltioraSchemaClient();
  const cached = await registry.listCached(kb.NAMESPACE);
  console.log(`[rematerialize] ${cached.length} cached schema(s), mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  let done = 0; let sections = 0; let conditionals = 0; let failed = 0;
  for (const { ousId, serviceId } of cached) {
    try {
      const raw = await client.getSchema(ousId);
      if (!raw || !Array.isArray(raw.fields)) { console.warn(`  - skip ${serviceId} (ousId ${ousId}): no raw schema`); continue; }
      const version = await client.getSchemaVersion(ousId).catch(() => null);
      const prev = await registry.getSchema(ousId); // for title/approvalRequired
      const meta = (prev && prev.metadata) || {};

      const { snapshot, warnings } = materializeSchema({
        schemaJson: raw,
        serviceCode: serviceId,
        ousId,
        contentHash: version && version.contentHash,
        title: meta.title || serviceId,
        approvalRequired: !!meta.approvalRequired,
        version: (version && version.version) || meta.version || 1,
      });

      const secCount = new Set(snapshot.slots.filter((s) => s.section).map((s) => s.section)).size;
      const condCount = snapshot.slots.filter((s) => s.trefCondition || s.requiredWhen).length;
      sections += secCount; conditionals += condCount;

      if (DRY_RUN) {
        console.log(`  ~ ${serviceId} (ousId ${ousId}): ${snapshot.slots.length} slots, ${secCount} sections, ${condCount} conditional${warnings.length ? `, ${warnings.length} warn` : ''}`);
        done++;
        continue;
      }

      await bakeLov(snapshot, { fetchLovValues: (req) => client.getLovValues(req), onWarn: () => {} });
      await registry.storeSchema(ousId, snapshot);
      const stored = await registry.getSchema(ousId); // compiled (round-tripped) snapshot
      const idx = await kb.indexSchemaKnowledge(stored || snapshot);
      done++;
      console.log(`  + ${serviceId} (ousId ${ousId}): ${snapshot.slots.length} slots, ${secCount} sections, ${condCount} conditional → kb ${idx.kbId || '(skipped)'}`);
    } catch (err) {
      failed++;
      console.error(`  ! ${serviceId} (ousId ${ousId}): ${err.message}`);
    }
  }
  console.log(`[rematerialize] done=${done} failed=${failed} totalSections=${sections} totalConditionalSlots=${conditionals}`);
}

main()
  .catch((err) => { console.error('[rematerialize] fatal:', err); process.exitCode = 1; })
  .finally(async () => { await close(); });
