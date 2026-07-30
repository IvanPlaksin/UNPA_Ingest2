'use strict';

/**
 * P1-12 — cascade dictionary: resolver decision table + engine wiring.
 *
 * The point of the feature: stop asking a staff member for facts the HR dictionary
 * already holds (their own grade, duty station…) and instead resolve them from the one
 * key they do know, then confirm the whole set once.
 */

const { resolveCascadeSlot, resolveCascadeCluster, cascadeReady } = require('../cascade-resolver');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const DICT_REF = {
  entityId: 'intg:staff',
  displayFieldIds: ['intg:col-name'],
  filters: [{ fieldId: 'intg:col-index', operator: 'eq', slotId: 'indexNumber' }],
};
const SLOT = { slotId: 'staffMemberFullName', type: 'string', promptHint: 'Staff Member Full Name', dictRef: DICT_REF };
const draftWith = (slots) => ({ slots });

describe('P1-12: resolver decision table', () => {
  test('blocked while the key slot is empty', async () => {
    const r = await resolveCascadeSlot(SLOT, draftWith({}), { fetchLovValues: async () => [] });
    expect(r).toMatchObject({ status: 'blocked', missing: 'indexNumber' });
  });

  test('a single row resolves to an autofill candidate', async () => {
    const r = await resolveCascadeSlot(SLOT, draftWith({ indexNumber: { value: '12345' } }), {
      fetchLovValues: async () => [{ label: 'Ivanov Ivan', value: 'Ivanov Ivan' }],
    });
    expect(r).toMatchObject({ status: 'resolved', value: 'Ivanov Ivan', display: 'Ivanov Ivan' });
  });

  test('the key slot value is passed to the dictionary as the filter argument', async () => {
    let seen = null;
    await resolveCascadeSlot(SLOT, draftWith({ indexNumber: { value: '12345' } }), {
      fetchLovValues: async (req) => { seen = req; return [{ label: 'X', value: 'X' }]; },
    });
    expect(seen.EntityId).toBe('intg:staff');
    expect(seen.Filters).toEqual([{ FieldId: 'intg:col-index', Operator: 'eq', Value: '12345' }]);
  });

  test('several rows are ambiguous (the user must choose)', async () => {
    const r = await resolveCascadeSlot(SLOT, draftWith({ indexNumber: { value: '1' } }), {
      fetchLovValues: async () => [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }],
    });
    expect(r.status).toBe('ambiguous');
    expect(r.options).toHaveLength(2);
  });

  test('no row → empty (manual entry), a failing lookup → unavailable — never a guess', async () => {
    const empty = await resolveCascadeSlot(SLOT, draftWith({ indexNumber: { value: '1' } }), { fetchLovValues: async () => [] });
    expect(empty.status).toBe('empty');
    const down = await resolveCascadeSlot(SLOT, draftWith({ indexNumber: { value: '1' } }), {
      fetchLovValues: async () => { throw new Error('Altiora down'); },
    });
    expect(down.status).toBe('unavailable');
  });

  test('an object-valued key slot contributes its identifier, not its label', async () => {
    let seen = null;
    await resolveCascadeSlot(SLOT, draftWith({ indexNumber: { value: { code: 'GVA', name: 'Geneva' } } }), {
      fetchLovValues: async (req) => { seen = req; return [{ label: 'X', value: 'X' }]; },
    });
    expect(seen.Filters[0].Value).toBe('GVA');
  });

  test('cascadeReady mirrors the blocked/ready decision', () => {
    expect(cascadeReady(SLOT, draftWith({}))).toBe(false);
    expect(cascadeReady(SLOT, draftWith({ indexNumber: { value: '1' } }))).toBe(true);
  });

  test('the cluster skips slots already filled', async () => {
    const snapshot = { slots: [SLOT, { slotId: 'grade', type: 'string', dictRef: DICT_REF }] };
    const draft = draftWith({ indexNumber: { value: '1' }, grade: { value: 'P-3' } });
    const cluster = await resolveCascadeCluster(snapshot, draft, { fetchLovValues: async () => [{ label: 'Ivanov', value: 'Ivanov' }] });
    expect(cluster.map((c) => c.slot.slotId)).toEqual(['staffMemberFullName']);
  });
});

// ── engine wiring ────────────────────────────────────────────────────────────
const SNAPSHOT = {
  serviceId: 'SVC-CASCADE', version: 1, phases: ['detail'],
  metadata: { title: 'Extension', approvalRequired: false, fieldIdMapping: { indexNumber: 'field_idx', staffMemberFullName: 'field_name', grade: 'field_grade' } },
  slots: [
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', promptHint: 'Index Number' },
    { slotId: 'staffMemberFullName', type: 'string', required: true, phase: 'detail', promptHint: 'Staff Member Full Name', dictRef: DICT_REF, dependsOn: ['indexNumber'] },
    { slotId: 'grade', type: 'string', required: true, phase: 'detail', promptHint: 'Grade', dictRef: { ...DICT_REF, displayFieldIds: ['intg:col-grade'] }, dependsOn: ['indexNumber'] },
  ],
};

function makeEngine(fetchLovValues) {
  const loadSnapshot = async () => SNAPSHOT;
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot, graphWrite: async () => [],
    now: () => Date.parse('2026-07-23T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  // Extraction stays empty on purpose: the index number arrives as the ANSWER to the
  // question the engine asks, which is the real path a cascade is triggered from.
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' }
      : {}),
    completion: () => 'What is your index number?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC-CASCADE', title: 'Extension', schemaRef: { serviceId: 'SVC-CASCADE', version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false, fetchLovValues });
}

// One dictionary row per requested column, so the cluster resolves to two fields.
const dictOk = async (req) => (req.DisplayFieldIds[0] === 'intg:col-grade'
  ? [{ label: 'P-3', value: 'P-3' }]
  : [{ label: 'Ivanov Ivan', value: 'Ivanov Ivan' }]);

// Since the hand-off to Altiora's form always follows, autofill cascade slots are the
// FORM's job: it resolves them from its own dictionary lookup with the user's token and
// overwrites anything the chat sends. So the chat neither asks for them nor prefills
// them — it only gathers their filter field (the index number).
const { draftToInitialFormData } = require('../form-handoff');

describe('P1-12: autofill cascade slots are left to the form', () => {
  test('the chat asks for the filter field, not the autofill dependants', async () => {
    const engine = makeEngine(dictOk);
    await engine.runTurn({ sessionId: 'x1', message: 'extend my appointment' });
    const r = await engine.runTurn({ sessionId: 'x1', message: '12345' });
    // indexNumber is now filled; staffMemberFullName/grade are autofill → never asked,
    // so the turn moves on to the hand-off gate rather than a cascade review.
    expect(r.responseType).not.toBe('cascade_confirm');
    expect(r.askingSlot).not.toBe('staffMemberFullName');
    expect(r.askingSlot).not.toBe('grade');
  });

  test('the index number itself IS asked (it is a plain filter field)', async () => {
    const engine = makeEngine(dictOk);
    const r = await engine.runTurn({ sessionId: 'x2', message: 'extend my appointment' });
    expect(r.askingSlot).toBe('indexNumber');
  });

  test('autofill slots are excluded from the form prefill', () => {
    const draft = { slots: {
      indexNumber: { value: '12345' },
      staffMemberFullName: { value: 'stale chat value' },
      grade: { value: 'P-9' },
    } };
    const out = draftToInitialFormData(draft, SNAPSHOT);
    // Only the filter field crosses; the form re-derives the rest from it.
    expect(out.dynamicData).toEqual({ field_idx: '12345' });
    expect(out.dynamicData.field_name).toBeUndefined();
    expect(out.dynamicData.field_grade).toBeUndefined();
  });
});
