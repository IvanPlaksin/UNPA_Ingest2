'use strict';

/**
 * IP-1c test — AltioraSchemaRegistry against a live Memgraph.
 *
 * Uses registry-owned serviceIds (IT-RG-*) and a distinct ousId range so it does
 * not collide with the golden fixtures.
 *
 * SAFETY (INCIDENT 2026-07-23): this suite runs against the SHARED live Memgraph.
 * `invalidateAll()` is a MASS delete of a namespace; calling it on the production
 * 'Altiora' tag once wiped ~76 real materialized schemas. So every store that this
 * test later mass-invalidates is tagged with an ISOLATED namespace (TEST_NS), and
 * `invalidateAll(TEST_NS)` can only ever reach this test's own rows — never real
 * schemas. The registry also hard-blocks `invalidateAll('Altiora')` under NODE_ENV=test.
 */

const {
  getSchema,
  storeSchema,
  checkFreshness,
  invalidate,
  invalidateAll,
  listCached,
  SchemaContractError,
  SchemaLintError,
  SchemaStoreError,
} = require('../altiora-schema-registry');
const { materializeSchema } = require('../altiora-schema-materializer');
const { purge } = require('../../schema-graph/seed-schema-graphs');
const { close } = require('../../schema-graph/driver');

jest.setTimeout(60000);

const OUS_A = 900010;
const OUS_B = 900011;
const SID_A = 'IT-RG-A';
const SID_B = 'IT-RG-B';
// Isolated tag for anything this test will later mass-invalidate — NEVER 'Altiora'.
const TEST_NS = 'AltioraTest';

/** A realistic snapshot straight from the canonical materializer (I-4a). */
function makeSnapshot(serviceId, ousId, { contentHash = 'hash-1', extraField = false } = {}) {
  const fields = [
    { id: 'os', label: 'OS', type: 'select', required: true, options: ['Windows', 'macOS'] },
  ];
  if (extraField) fields.push({ id: 'notes', label: 'Notes', type: 'textarea', required: false });
  const { snapshot } = materializeSchema({
    schemaJson: { fields }, serviceCode: serviceId, ousId, title: `Reg ${serviceId}`, approvalRequired: false, contentHash,
  });
  return snapshot;
}

afterAll(async () => {
  await purge(SID_A);
  await purge(SID_B);
  await close();
});

describe('IP-1c: store + retrieve', () => {
  test('a stored schema is retrieved deep-equal by ousId', async () => {
    const snap = makeSnapshot(SID_A, OUS_A);
    await storeSchema(OUS_A, snap);
    const got = await getSchema(OUS_A);
    expect(got).toEqual(snap);
  });

  test('getSchema for an uncached ousId is null', async () => {
    expect(await getSchema(900999)).toBeNull();
  });

  test('storeSchema replaces a prior version for the same ousId', async () => {
    await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A, { contentHash: 'v1' }));
    await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A, { contentHash: 'v2', extraField: true }));
    const got = await getSchema(OUS_A);
    expect(got.metadata.contentHash).toBe('v2');
    expect(got.slots.map((s) => s.slotId)).toEqual(['os', 'notes']);
  });
});

describe('IP-1c: the lint gate', () => {
  test('a snapshot failing the contract is rejected and not written', async () => {
    const bad = makeSnapshot(SID_B, OUS_B);
    bad.slots[0].type = 'not-a-type'; // breaks the enum in the contract
    await expect(storeSchema(OUS_B, bad)).rejects.toBeInstanceOf(SchemaContractError);
    expect(await getSchema(OUS_B)).toBeNull();
  });

  test('a snapshot failing lint is rejected and not written', async () => {
    const bad = makeSnapshot(SID_B, OUS_B);
    // A trefCondition referencing a later/unknown slot — R2/R0 territory.
    bad.slots[0].trefCondition = "slots.ghost == 'x'";
    await expect(storeSchema(OUS_B, bad)).rejects.toBeInstanceOf(SchemaLintError);
    expect(await getSchema(OUS_B)).toBeNull();
  });

  test('an ousId not matching the snapshot is rejected', async () => {
    const snap = makeSnapshot(SID_B, OUS_B);
    await expect(storeSchema(999, snap)).rejects.toBeInstanceOf(SchemaStoreError);
  });

  test('a non-positive ousId is rejected', async () => {
    const snap = makeSnapshot(SID_B, OUS_B);
    await expect(storeSchema(0, snap)).rejects.toThrow(/positive integer/);
    await expect(getSchema(-1)).rejects.toThrow(/positive integer/);
  });
});

describe('IP-1c: multi-provider replace (V2 semantics)', () => {
  test('a second provider under the same serviceId replaces the first and reports it', async () => {
    const first = await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A, { contentHash: 'prov-a' }));
    expect(first.replaced).toBeNull();

    // A different provider (ousId) whose form normalizes to the SAME serviceId.
    const second = await storeSchema(OUS_B, makeSnapshot(SID_A, OUS_B, { contentHash: 'prov-b', extraField: true }));
    expect(second.replaced).toEqual({ oldOusId: OUS_A });

    // Last writer owns: the new provider's form is cached, the old one is gone.
    expect(await getSchema(OUS_B)).not.toBeNull();
    expect((await getSchema(OUS_B)).metadata.contentHash).toBe('prov-b');
    expect(await getSchema(OUS_A)).toBeNull();
    await purge(SID_A);
  });
});

describe('IP-1c: freshness', () => {
  test('fresh / stale / missing', async () => {
    await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A, { contentHash: 'h-abc' }));
    expect(await checkFreshness(OUS_A, 'h-abc')).toBe('fresh');
    expect(await checkFreshness(OUS_A, 'h-xyz')).toBe('stale');
    expect(await checkFreshness(900998, 'anything')).toBe('missing');
  });
});

describe('IP-1e: listCached (poll enumeration)', () => {
  test('returns ousId + contentHash for each registry-managed schema', async () => {
    await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A, { contentHash: 'h-A' }), { namespace: TEST_NS });
    await storeSchema(OUS_B, makeSnapshot(SID_B, OUS_B, { contentHash: 'h-B' }), { namespace: TEST_NS });
    const rows = await listCached(TEST_NS);
    const mine = rows.filter((r) => r.ousId === OUS_A || r.ousId === OUS_B);
    expect(mine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ousId: OUS_A, serviceId: SID_A, contentHash: 'h-A' }),
        expect.objectContaining({ ousId: OUS_B, serviceId: SID_B, contentHash: 'h-B' }),
      ]),
    );
    await purge(SID_A);
    await purge(SID_B);
  });
});

describe('IP-1c: invalidation', () => {
  test('invalidate removes one cached schema', async () => {
    await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A));
    expect(await invalidate(OUS_A)).toBe(true);
    expect(await getSchema(OUS_A)).toBeNull();
    expect(await invalidate(OUS_A)).toBe(false); // already gone
  });

  test('invalidateAll removes registry schemas (isolated test namespace)', async () => {
    await storeSchema(OUS_A, makeSnapshot(SID_A, OUS_A), { namespace: TEST_NS });
    await storeSchema(OUS_B, makeSnapshot(SID_B, OUS_B), { namespace: TEST_NS });
    // Scoped to TEST_NS: cannot reach real 'Altiora' schemas on the shared Memgraph.
    const removed = await invalidateAll(TEST_NS);
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await getSchema(OUS_A)).toBeNull();
    expect(await getSchema(OUS_B)).toBeNull();
  });

  test("invalidateAll('Altiora') is blocked under NODE_ENV=test", async () => {
    // The production-namespace mass wipe must be refused in tests (incident guard).
    await expect(invalidateAll()).rejects.toThrow(/blocked under NODE_ENV=test/);
  });
});
