'use strict';

/**
 * Dictionary hydration shipped with the hand-off to Altiora's request form.
 *
 * The behaviour that matters is not "the payload is populated" but the two safety
 * properties it rests on: it is keyed so the CLIENT can tell whether an entry applies,
 * and every failure mode degrades to sending nothing (i.e. today's fetch-on-mount).
 */

const { buildFormHydration, isFlatLookup } = require('../form-hydration');

const FLAT_LOV = { entityId: 'entity-dbo-lk_dutystations', displayFieldIds: ['col-name'] };
const LINKED_LOV = { entityId: 'entity-dbo-lk_staff', displayFieldIds: ['col-name', 'col-grade'] };
const DICT_REF = {
  entityId: 'intg:staff',
  displayFieldIds: ['intg:col-name'],
  filters: [{ fieldId: 'intg:col-index', operator: 'eq', slotId: 'indexNumber' }],
};

const snapshotWith = (slots) => ({
  serviceId: 'EO-HR-SA-EXT',
  slots,
  metadata: {
    fieldIdMapping: {
      dutyStation: 'field_ds',
      staffName: 'field_staff',
      indexNumber: 'field_idx',
      localOnly: undefined,
    },
  },
});

describe('baked LOV options ride along for free', () => {
  test('a baked single-display LOV is sent, keyed by the ALTIORA field id', async () => {
    const snapshot = snapshotWith([{
      slotId: 'dutyStation', type: 'enum', lov: FLAT_LOV,
      presentOptions: [{ value: 'NY', label: 'New York' }, { value: 'GVA', label: 'Geneva' }],
    }]);

    const out = await buildFormHydration({ slots: {} }, snapshot, {});

    expect(out.values).toEqual({
      field_ds: [{ label: 'New York', value: 'NY' }, { label: 'Geneva', value: 'GVA' }],
    });
  });

  test('no lookup is issued for baked options', async () => {
    const fetchLovValues = jest.fn();
    const snapshot = snapshotWith([{
      slotId: 'dutyStation', type: 'enum', lov: FLAT_LOV,
      presentOptions: [{ value: 'NY', label: 'New York' }],
    }]);

    await buildFormHydration({ slots: {} }, snapshot, { fetchLovValues });

    expect(fetchLovValues).not.toHaveBeenCalled();
  });

  test('a MULTI-display dictionary is left alone — the client fetches those as structured rows', async () => {
    const snapshot = snapshotWith([{
      slotId: 'staffName', type: 'enum', lov: LINKED_LOV,
      presentOptions: [{ value: 'A', label: 'Ivanov / P3' }],
    }]);

    const out = await buildFormHydration({ slots: {} }, snapshot, {});

    expect(out).toBeNull();
  });

  test('options are capped so a large dictionary cannot bloat the hand-off', async () => {
    const presentOptions = Array.from({ length: 500 }, (_, i) => ({ value: `v${i}`, label: `L${i}` }));
    const snapshot = snapshotWith([{ slotId: 'dutyStation', type: 'enum', lov: FLAT_LOV, presentOptions }]);

    const out = await buildFormHydration({ slots: {} }, snapshot, { maxOptions: 10 });

    expect(out.values.field_ds).toHaveLength(10);
  });

  test('a slot with no Altiora counterpart is never invented into the payload', async () => {
    const snapshot = snapshotWith([{
      slotId: 'somethingLocal', type: 'enum', lov: FLAT_LOV, presentOptions: [{ value: 'x', label: 'X' }],
    }]);

    expect(await buildFormHydration({ slots: {} }, snapshot, {})).toBeNull();
  });
});

describe('cascade dictionaries are resolved against the draft', () => {
  const snapshot = snapshotWith([{ slotId: 'staffName', type: 'enum', dictRef: DICT_REF }]);

  test('the filter argument comes from the slot the cascade depends on', async () => {
    let seen = null;
    await buildFormHydration({ slots: { indexNumber: { value: '12345' } } }, snapshot, {
      fetchLovValues: async (req) => { seen = req; return [{ label: 'Ivanov', value: 'Ivanov' }]; },
    });

    expect(seen.Filters).toEqual([{ FieldId: 'intg:col-index', Operator: 'eq', Value: '12345' }]);
  });

  test('resolved rows are sent for the field', async () => {
    const out = await buildFormHydration({ slots: { indexNumber: { value: '12345' } } }, snapshot, {
      fetchLovValues: async () => [{ label: 'Ivanov', value: 'Ivanov' }],
    });

    expect(out.values.field_staff).toEqual([{ label: 'Ivanov', value: 'Ivanov' }]);
  });

  test('an unfilled dependency is skipped — the form blocks that field too', async () => {
    const fetchLovValues = jest.fn();

    const out = await buildFormHydration({ slots: {} }, snapshot, { fetchLovValues });

    expect(fetchLovValues).not.toHaveBeenCalled();
    expect(out).toBeNull();
  });

  test('lookups are capped per hand-off', async () => {
    const many = snapshotWith(
      Array.from({ length: 5 }, (_, i) => ({ slotId: `s${i}`, type: 'enum', dictRef: DICT_REF }))
    );
    many.metadata.fieldIdMapping = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`s${i}`, `f${i}`])
    );
    const fetchLovValues = jest.fn().mockResolvedValue([{ label: 'A', value: 'A' }]);

    await buildFormHydration({ slots: { indexNumber: { value: '1' } } }, many, { fetchLovValues, maxLookups: 2 });

    expect(fetchLovValues).toHaveBeenCalledTimes(2);
  });
});

describe('every failure degrades to sending nothing', () => {
  const snapshot = snapshotWith([{ slotId: 'staffName', type: 'enum', dictRef: DICT_REF }]);
  const draft = { slots: { indexNumber: { value: '12345' } } };

  test('a failing dictionary does not fail the hand-off', async () => {
    const out = await buildFormHydration(draft, snapshot, {
      fetchLovValues: async () => { throw new Error('Altiora down'); },
    });

    expect(out).toBeNull();
  });

  test('an empty dictionary sends nothing rather than an empty option list', async () => {
    const out = await buildFormHydration(draft, snapshot, { fetchLovValues: async () => [] });

    expect(out).toBeNull();
  });

  test('a lookup that outruns the budget is dropped, not awaited', async () => {
    const out = await buildFormHydration(draft, snapshot, {
      budgetMs: 5,
      fetchLovValues: () => new Promise(resolve => setTimeout(() => resolve([{ label: 'A', value: 'A' }]), 200)),
    });

    expect(out).toBeNull();
  });

  test('without a lookup channel only the baked options are sent', async () => {
    const mixed = snapshotWith([
      { slotId: 'dutyStation', type: 'enum', lov: FLAT_LOV, presentOptions: [{ value: 'NY', label: 'New York' }] },
      { slotId: 'staffName', type: 'enum', dictRef: DICT_REF },
    ]);

    const out = await buildFormHydration(draft, mixed, {});

    expect(Object.keys(out.values)).toEqual(['field_ds']);
  });

  test('a snapshot with no slots yields nothing', async () => {
    expect(await buildFormHydration({ slots: {} }, { slots: [], metadata: {} }, {})).toBeNull();
  });
});

/**
 * SCH-002 changed what decides this.
 *
 * It used to follow the form-fill GATE: under the default 'wizard' the chat was
 * assumed never to resolve a cascade field, so nothing was sent and the form
 * resolved everything itself. That assumption held exactly as long as it was true.
 * Now the agent path resolves these fields (agent-tools `resolveCascades`), and a
 * value held back is a value the form re-derives independently of ours — two
 * answers to one question, with no way to notice they differ.
 *
 * So the test is now "is there a value", not "whose job was it". The gate still
 * decides who ASKS; `autofill` only reports what is already in the draft.
 */
describe('a resolved cascade value is carried to the form', () => {
  const snapshot = snapshotWith([{ slotId: 'staffName', type: 'string', dictRef: DICT_REF }]);
  const draft = { slots: { indexNumber: { value: '1' }, staffName: { value: 'Ivanov' } } };
  const gate = process.env.FLOWDESK_FORM_FILL_GATE;
  afterEach(() => { process.env.FLOWDESK_FORM_FILL_GATE = gate; });

  test("under the default 'wizard' gate a value the chat resolved is STILL carried", async () => {
    // The change SCH-002 made. Before it, this returned nothing and the form
    // re-resolved `staffName` from the index number on its own.
    process.env.FLOWDESK_FORM_FILL_GATE = 'wizard';

    const out = await buildFormHydration(draft, snapshot, {});

    expect(out.autofill).toEqual({ field_staff: 'Ivanov' });
  });

  test('an empty draft still carries no autofill — there is nothing to carry', async () => {
    process.env.FLOWDESK_FORM_FILL_GATE = 'wizard';
    const empty = { slots: { indexNumber: { value: '1' } } };

    const out = await buildFormHydration(empty, snapshot, {});

    expect(out === null || out.autofill === undefined || Object.keys(out.autofill).length === 0).toBe(true);
  });

  test("under the 'agent' gate the value the chat resolved is carried", async () => {
    process.env.FLOWDESK_FORM_FILL_GATE = 'agent';

    const out = await buildFormHydration(draft, snapshot, {});

    expect(out.autofill).toEqual({ field_staff: 'Ivanov' });
  });

  test('a pending (unconfirmed) value is not treated as resolved', async () => {
    process.env.FLOWDESK_FORM_FILL_GATE = 'agent';
    const pending = { slots: { indexNumber: { value: '1' }, staffName: { value: 'Ivanov', pending: true } } };

    const out = await buildFormHydration(pending, snapshot, {});

    expect(out === null || out.autofill === undefined).toBe(true);
  });
});

describe('isFlatLookup', () => {
  test('one display column is what the client fetches as a flat value list', () => {
    expect(isFlatLookup(FLAT_LOV)).toBe(true);
    expect(isFlatLookup(LINKED_LOV)).toBe(false);
    expect(isFlatLookup(undefined)).toBe(false);
  });
});
