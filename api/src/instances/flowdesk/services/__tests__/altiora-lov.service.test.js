'use strict';

/**
 * I-4b — LOV baking: resolve a materialized snapshot's `lov` descriptors into
 * concrete enum options via an injected FormLookup fetcher.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { bakeLov, toLovRequest, normalizeOptions } = require('../altiora-lov.service');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSnapshot = ajv.compile(require('../../contracts/schema-snapshot.schema.json'));

/** Minimal materialized snapshot with one LOV slot (as materializeSchema emits pre-bake). */
function snapshotWithLov(lov = { entityId: 'entity-dbo-lk_dutystations', displayFieldIds: ['fld-name'], valueFieldId: 'fld-name' }) {
  return {
    serviceId: 'EO-HR-PM-CMP',
    version: 1,
    phases: ['detail'],
    metadata: { title: 'Create or Maintain Position', approvalRequired: false, altioraOusId: 1 },
    slots: [
      { slotId: 'fundingType', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'XB', label: 'XB' }] },
      { slotId: 'dutyStation', type: 'string', required: true, phase: 'detail', lov, promptHint: 'Duty Station' },
    ],
  };
}

const NOW = '2026-07-16T00:00:00.000Z';

describe('toLovRequest', () => {
  test('maps the descriptor to a PascalCase FormLookupRequest', () => {
    const req = toLovRequest(
      { entityId: 'e1', displayFieldIds: ['d1', 'd2'], valueFieldId: 'v1', filters: [{ fieldId: 'f', operator: 'eq', value: 'x' }] },
      { maxResults: 50 },
    );
    expect(req).toEqual({
      EntityId: 'e1',
      DisplayFieldIds: ['d1', 'd2'],
      MaxResults: 50,
      ValueFieldId: 'v1',
      Filters: [{ FieldId: 'f', Operator: 'eq', Value: 'x' }],
    });
  });

  test('omits ValueFieldId/Filters when absent, applies default MaxResults', () => {
    const req = toLovRequest({ entityId: 'e1', displayFieldIds: ['d1'] });
    expect(req).toEqual({ EntityId: 'e1', DisplayFieldIds: ['d1'], MaxResults: 200 });
  });

  test('drops empty-valued filters', () => {
    const req = toLovRequest({ entityId: 'e', displayFieldIds: ['d'], filters: [{ fieldId: 'f', value: '' }] });
    expect(req.Filters).toBeUndefined();
  });
});

describe('normalizeOptions', () => {
  test('dedupes by value, trims, caps, and mirrors label→value', () => {
    const out = normalizeOptions(
      [{ label: 'New York', value: 'NY' }, { label: 'New York', value: 'NY' }, { label: 'Geneva' }, { value: '' }, null],
      10,
    );
    expect(out).toEqual([{ value: 'NY', label: 'New York' }, { value: 'Geneva', label: 'Geneva' }]);
  });

  test('respects the cap', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ value: `v${i}`, label: `L${i}` }));
    expect(normalizeOptions(many, 3)).toHaveLength(3);
  });

  test('non-array ⇒ []', () => {
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions(undefined)).toEqual([]);
  });
});

describe('bakeLov', () => {
  test('upgrades a LOV string slot to a baked enum, stamps lovBakedAt, leaves the descriptor', async () => {
    const snap = snapshotWithLov();
    const fetchLovValues = jest.fn().mockResolvedValue([{ label: 'New York', value: 'New York' }]);
    const { snapshot, report } = await bakeLov(snap, { fetchLovValues, now: () => NOW });

    const s = snapshot.slots.find((x) => x.slotId === 'dutyStation');
    expect(s.type).toBe('enum');
    expect(s.presentOptions).toEqual([{ value: 'New York', label: 'New York' }]);
    expect(s.lovBakedAt).toBe(NOW);
    expect(s.lov).toBeDefined(); // descriptor kept for TTL / ServiceFormChanged re-fetch
    expect(report).toMatchObject({ baked: 1, empty: 0, failed: 0 });
    // the fetcher was called with the mapped request
    expect(fetchLovValues).toHaveBeenCalledWith(expect.objectContaining({ EntityId: 'entity-dbo-lk_dutystations' }));
  });

  test('a baked snapshot validates against the SchemaSnapshot contract', async () => {
    const snap = snapshotWithLov();
    const { snapshot } = await bakeLov(snap, { fetchLovValues: async () => [{ label: 'New York', value: 'New York' }], now: () => NOW });
    const ok = validateSnapshot(snapshot);
    if (!ok) throw new Error(JSON.stringify(validateSnapshot.errors, null, 1));
    expect(ok).toBe(true);
  });

  test('empty dictionary ⇒ slot stays a valid free-text string, counted as empty', async () => {
    const snap = snapshotWithLov();
    const warnings = [];
    const { snapshot, report } = await bakeLov(snap, { fetchLovValues: async () => [], onWarn: (w) => warnings.push(w) });
    const s = snapshot.slots.find((x) => x.slotId === 'dutyStation');
    expect(s.type).toBe('string');
    expect(s.presentOptions).toBeUndefined();
    expect(s.lovBakedAt).toBeUndefined();
    expect(report).toMatchObject({ baked: 0, empty: 1, failed: 0 });
    expect(warnings[0]).toMatchObject({ event: 'lov_empty', slotId: 'dutyStation' });
    // still contract-valid — a LOV that can't bake never blocks the whole form
    expect(validateSnapshot(snapshot)).toBe(true);
  });

  test('fetch failure ⇒ slot stays free text, counted as failed, does not throw', async () => {
    const snap = snapshotWithLov();
    const warnings = [];
    const { snapshot, report } = await bakeLov(snap, {
      fetchLovValues: async () => { throw new Error('boom'); },
      onWarn: (w) => warnings.push(w),
    });
    const s = snapshot.slots.find((x) => x.slotId === 'dutyStation');
    expect(s.type).toBe('string');
    expect(report).toMatchObject({ baked: 0, empty: 0, failed: 1 });
    expect(warnings[0]).toMatchObject({ event: 'lov_fetch_failed', error: 'boom' });
    expect(validateSnapshot(snapshot)).toBe(true);
  });

  test('slots without a lov descriptor are untouched', async () => {
    const snap = snapshotWithLov();
    const fetchLovValues = jest.fn().mockResolvedValue([{ value: 'New York' }]);
    await bakeLov(snap, { fetchLovValues });
    const fundingType = snap.slots.find((x) => x.slotId === 'fundingType');
    expect(fundingType.presentOptions).toEqual([{ value: 'XB', label: 'XB' }]); // unchanged
    expect(fetchLovValues).toHaveBeenCalledTimes(1); // only the one LOV slot
  });

  test('honours the maxOptions cap', async () => {
    const snap = snapshotWithLov();
    const rows = Array.from({ length: 10 }, (_, i) => ({ value: `DS${i}`, label: `Station ${i}` }));
    const { snapshot } = await bakeLov(snap, { fetchLovValues: async () => rows, maxOptions: 4, now: () => NOW });
    const s = snapshot.slots.find((x) => x.slotId === 'dutyStation');
    expect(s.presentOptions).toHaveLength(4);
  });

  test('requires a fetcher', async () => {
    await expect(bakeLov(snapshotWithLov(), {})).rejects.toThrow(/fetchLovValues is required/);
  });
});
