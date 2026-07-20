/**
 * I-4b — materialize a REAL Altiora service form into the Memgraph schema-graph.
 *
 * Closes the chain the earlier phases built:
 *   I-2 (Qdrant: code → catalog GUID) → I-3 (detect: GUID → OrganizationUnitServiceId)
 *   → getSchema (Altiora SchemaJson) → I-4a (materialize → SchemaSnapshot)
 *   → seedService (Memgraph) → the interpreter's schema-compiler serves it.
 *
 * This is what replaces `seed-schema-graphs.js` fixtures as the source of graphs:
 * after this runs, `loadSnapshot(serviceCode)` returns a form authored in Altiora,
 * not one we invented.
 *
 * Usage:
 *   node -r dotenv/config api/scripts/materialize-altiora-service.js EO-HR-SA-SS-ISP
 *   node -r dotenv/config api/scripts/materialize-altiora-service.js --all [--limit N]
 */

const { createAltioraClient, createServiceTokenProvider } = require('../src/instances/flowdesk/services/altiora-client');
const { createAltioraSchemaClient } = require('../src/instances/flowdesk/services/altiora-schema-client');
const { materializeSchema } = require('../src/instances/flowdesk/services/altiora-schema-materializer');
const { bakeLov } = require('../src/instances/flowdesk/services/altiora-lov.service');
const registry = require('../src/instances/flowdesk/services/altiora-schema-registry');
const { compile } = require('../src/instances/flowdesk/schema-graph/schema-compiler');
const { close } = require('../src/instances/flowdesk/schema-graph/driver');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';

/**
 * The synced catalog (I-2) is our code → GUID index; no extra Altiora call needed.
 * Excludes the I-2b utterance points (also source:'altiora'), which merely repeat a
 * service's code/guid — otherwise --all would re-materialize each service 6× and the
 * scroll limit would truncate coverage. One canonical (formal) point per service.
 */
async function catalogEntries(codes) {
  const filter = {
    must: [{ key: 'source', match: { value: 'altiora' } }],
    must_not: [{ key: 'type', match: { value: 'utterance' } }],
  };
  if (codes && codes.length === 1) filter.must.push({ key: 'service_code', match: { value: codes[0] } });
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 300, with_payload: true, filter }),
  }).then((r) => r.json());
  let pts = (res.result?.points || []).map((p) => p.payload);
  if (codes && codes.length > 1) pts = pts.filter((p) => codes.includes(p.service_code));
  return pts;
}

async function materializeOne(sc, entry) {
  const { service_code: code, service_guid: guid, service_name: name, approval_required, sla_hours } = entry;

  const providers = await sc.detectProviders(guid);
  if (!providers.length) return { code, skipped: 'no distribution (service not offered by any org unit)' };
  const ousId = providers[0].organizationUnitServiceId;

  const schema = await sc.getSchema(ousId);
  const schemaJson = schema && (schema.schemaJson || schema.SchemaJson || schema);
  if (!schemaJson || !(typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson).fields?.length) {
    return { code, ousId, skipped: 'no published form schema' };
  }

  let contentHash;
  try { contentHash = (await sc.getSchemaVersion(ousId))?.contentHash; } catch { /* probe is optional */ }

  const { snapshot, warnings } = materializeSchema({
    schemaJson, serviceCode: code, ousId, contentHash,
    title: name, approvalRequired: !!approval_required, slaHours: sla_hours ?? undefined,
  });

  // I-4b: resolve dictionary-backed LOV slots into concrete options before seeding,
  // so the baked EnumOptions persist in the schema-graph (hybrid model).
  const { report: lov } = await bakeLov(snapshot, { fetchLovValues: (req) => sc.getLovValues(req) });

  // Store via the registry (not a bare seedService) so it runs the contract+lint
  // gates AND tags the ServiceDef namespace='Altiora' — the tag the I-5 poll
  // fallback (listCached) scopes to. A script-seeded form must be as
  // registry-managed as an orchestrator-materialized one.
  await registry.storeSchema(ousId, snapshot);
  const compiled = await compile(code); // prove the graph round-trips back out
  return { code, ousId, slots: snapshot.slots.length, warnings, lov, compiled: !!compiled };
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : Infinity;
  const codes = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  if (!all && !codes.length) { console.error('give a serviceCode, or --all'); process.exit(2); }

  const client = createAltioraClient({ tokenProvider: createServiceTokenProvider() });
  const sc = createAltioraSchemaClient({ client });

  let entries = await catalogEntries(all ? null : codes);
  if (all) entries = entries.slice(0, limit);
  if (!entries.length) { console.error('no catalog entries — run sync-altiora-catalog.js first'); process.exit(1); }

  console.log(`Materializing ${entries.length} service(s) from Altiora → Memgraph\n`);
  const done = [], skipped = [];
  for (const e of entries) {
    try {
      const r = await materializeOne(sc, e);
      if (r.skipped) { skipped.push(r); console.log(`~ ${r.code.padEnd(22)} skipped: ${r.skipped}`); }
      else {
        done.push(r);
        const lovTag = r.lov && r.lov.baked ? `  lov=${r.lov.baked}✓${r.lov.empty || r.lov.failed ? `/${r.lov.empty + r.lov.failed}✗` : ''}` : '';
        console.log(`+ ${r.code.padEnd(22)} ous=${String(r.ousId).padEnd(4)} slots=${r.slots} compiled=${r.compiled}${lovTag}${r.warnings.length ? `  ⚠ ${r.warnings.length}` : ''}`);
        r.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
        (r.lov && r.lov.slots || []).filter((s) => s.status !== 'baked').forEach((s) => console.log(`    ⚠ LOV ${s.slotId}: ${s.status}${s.error ? ` (${s.error})` : ''}`));
      }
    } catch (err) {
      skipped.push({ code: e.service_code, skipped: err.message });
      console.log(`! ${e.service_code.padEnd(22)} ERROR: ${err.message.slice(0, 80)}`);
    }
  }
  console.log(`\nmaterialized ${done.length} · skipped ${skipped.length}`);
  await close();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(async (e) => { console.error('FAILED:', e.message); await close().catch(() => {}); process.exit(1); });
}

module.exports = { materializeOne, catalogEntries };
