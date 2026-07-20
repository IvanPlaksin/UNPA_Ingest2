'use strict';

/**
 * IP-1f — end-to-end verification against a LIVE Altiora + live Memgraph.
 *
 * Gated: runs only when FLOWDESK_E2E_ALTIORA=1 (and Altiora is reachable at
 * ALTIORA_API_BASE). Skipped in normal CI, because it depends on an external
 * service that is not always up. Reproduces the full IP-1 pipeline on a real
 * catalog service, so a regression in any layer surfaces against real data —
 * exactly what the synthetic tests cannot.
 *
 * Verified once manually against the dev instance: service EO-HR-SA-SS-ISP
 * ("Initiate Separation Process"), catalog GUID 01e3b997-8384-443f-b3f4-0b52afa3288c,
 * OrganizationUnitServiceId 59 — an 8-field opaque form (section + text/textarea/
 * date/options_group + 1 rule).
 *
 * Run: FLOWDESK_E2E_ALTIORA=1 npx jest altiora-e2e --runInBand
 */

const gate = process.env.FLOWDESK_E2E_ALTIORA === '1';
const describeLive = gate ? describe : describe.skip;

const { getAltioraSchemaClient } = require('../altiora-schema-client');
const { materializeSchema } = require('../altiora-schema-materializer');
const registry = require('../altiora-schema-registry');
const { injectContextSlots } = require('../schema-orchestrator');
const { createSchemaSyncService } = require('../altiora-schema-sync');
const { lintSnapshot } = require('../../schema-graph/schema-linter');
const { purge } = require('../../schema-graph/seed-schema-graphs');
const { close } = require('../../schema-graph/driver');

// A requestable service on the dev instance. Override via env for another target.
const GUID = process.env.FLOWDESK_E2E_GUID || '01e3b997-8384-443f-b3f4-0b52afa3288c';
const OUS = Number(process.env.FLOWDESK_E2E_OUS || 59);
const CODE = process.env.FLOWDESK_E2E_CODE || 'EO-HR-SA-SS-ISP';

describeLive('IP-1f: live Altiora e2e', () => {
  jest.setTimeout(60000);
  const sc = getAltioraSchemaClient();

  afterAll(async () => { await purge(CODE); await close(); });

  test('detect resolves the catalog GUID to a provider ousId', async () => {
    const providers = await sc.detectProviders(GUID, { locationPath: '/' });
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.map((p) => p.organizationUnitServiceId)).toContain(OUS);
  });

  test('the full pipeline materializes, stores, and round-trips a real form', async () => {
    const version = await sc.getSchemaVersion(OUS);
    const form = await sc.getSchema(OUS);
    expect(form && Array.isArray(form.fields)).toBe(true);

    const { snapshot, warnings } = materializeSchema({
      schemaJson: form, serviceCode: CODE, ousId: OUS,
      contentHash: version.contentHash, title: 'e2e', approvalRequired: false, version: version.version,
    });
    expect(warnings).toEqual([]);
    expect(lintSnapshot(snapshot).ok).toBe(true);
    // Opaque Altiora field ids are preserved for IP-3 submit.
    expect(Object.values(snapshot.metadata.fieldIdMapping).every((id) => typeof id === 'string')).toBe(true);

    await purge(CODE);
    const { replaced } = await registry.storeSchema(OUS, snapshot);
    expect(replaced).toBeNull();

    const back = await registry.getSchema(OUS);
    expect(back).toEqual(snapshot); // structural round-trip through live Memgraph

    const full = injectContextSlots(back, false);
    expect(full.slots.slice(0, 3).map((s) => s.slotId)).toEqual(['beneficiary', 'location', 'author']);
    expect(lintSnapshot(full).ok).toBe(true);
  });

  test('freshness tracks the live contentHash, and the poller invalidates on drift', async () => {
    const version = await sc.getSchemaVersion(OUS);
    const form = await sc.getSchema(OUS);
    const { snapshot } = materializeSchema({
      schemaJson: form, serviceCode: CODE, ousId: OUS,
      contentHash: 'STALE', title: 'e2e', approvalRequired: false, version: version.version,
    });
    await purge(CODE);
    await registry.storeSchema(OUS, snapshot); // stored deliberately stale

    expect(await registry.checkFreshness(OUS, 'STALE')).toBe('fresh');
    expect(await registry.checkFreshness(OUS, version.contentHash)).toBe('stale');

    const sync = createSchemaSyncService({
      registry: { listCached: registry.listCached, invalidate: registry.invalidate },
      schemaClient: sc,
      timers: { setInterval: () => 1, clearInterval: () => {} },
    });
    const res = await sync.pollOnce(); // live /schema/version hash != STALE → invalidate
    expect(res.errors).toBe(0);
    expect(res.invalidated).toBeGreaterThanOrEqual(1);
    expect(await registry.getSchema(OUS)).toBeNull();
  });
});
