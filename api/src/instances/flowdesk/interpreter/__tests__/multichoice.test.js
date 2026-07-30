'use strict';

/**
 * P1-13 — multi-select enum slots (Altiora checklist).
 *
 * Two layers: the pure builder, and the engine wiring behind the
 * FLOWDESK_MULTICHOICE_ENABLED rollout gate. The gate exists because Altiora's wire
 * format for a checklist is not confirmed yet — with it OFF the slot must behave
 * exactly as it does today (single `choice`), so production cannot regress.
 */

const Ajv = require('ajv');
const { buildMultichoiceControl } = require('../controls');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const ajv = new Ajv({ allErrors: true, strict: false });
const controlsSchema = require('../../contracts/controls.schema.json');
const validate = ajv.compile({ type: 'array', items: { $ref: '#/definitions/control' }, definitions: controlsSchema.definitions });

const OPTIONS = [{ value: 'tor', label: 'TOR provided' }, { value: 'doa', label: 'DOA approval' }, { value: 'budget', label: 'Budget approval' }];

describe('P1-13: multichoice builder', () => {
  test('builds a contract-valid multichoice control over presentOptions', () => {
    const controls = buildMultichoiceControl({ slotId: 'docs', type: 'enum', multi: true }, OPTIONS, { label: 'Which documents?' });
    expect(controls[0]).toMatchObject({ id: 'ctrl-docs', type: 'multichoice', slotId: 'docs', label: 'Which documents?' });
    expect(controls[0].options).toHaveLength(3);
    expect(controls[0].selected).toBeUndefined();
    expect(validate(controls)).toBe(true);
  });

  test('carries pre-selected values', () => {
    const controls = buildMultichoiceControl({ slotId: 'docs' }, OPTIONS, { selected: ['tor', 'doa'] });
    expect(controls[0].selected).toEqual(['tor', 'doa']);
    expect(validate(controls)).toBe(true);
  });
});

// ── engine wiring ────────────────────────────────────────────────────────────
const SNAPSHOT = {
  serviceId: 'SVC-MULTI', version: 1, phases: ['detail'],
  metadata: { title: 'Multi Test', approvalRequired: false },
  slots: [{ slotId: 'docs', type: 'enum', multi: true, required: true, phase: 'detail', promptHint: 'Supporting documents', presentOptions: OPTIONS }],
};

function makeEngine() {
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
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' }
      : {}),
    completion: () => 'Which supporting documents are attached?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC-MULTI', title: 'Multi Test', schemaRef: { serviceId: 'SVC-MULTI', version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false });
}

describe('P1-13: rollout gate (FLOWDESK_MULTICHOICE_ENABLED)', () => {
  const prev = process.env.FLOWDESK_MULTICHOICE_ENABLED;
  afterEach(() => { if (prev === undefined) delete process.env.FLOWDESK_MULTICHOICE_ENABLED; else process.env.FLOWDESK_MULTICHOICE_ENABLED = prev; });

  test('flag OFF → falls back to single `choice` (today’s behaviour, no regression)', async () => {
    delete process.env.FLOWDESK_MULTICHOICE_ENABLED;
    const r = await makeEngine().runTurn({ sessionId: 'mc-off', message: 'I need to attach documents' });
    expect(r.askingSlot).toBe('docs');
    expect(r.controls[0].type).toBe('choice');
    expect(validate(r.controls)).toBe(true);
  });

  test('flag ON → emits a `multichoice` control', async () => {
    process.env.FLOWDESK_MULTICHOICE_ENABLED = 'true';
    const r = await makeEngine().runTurn({ sessionId: 'mc-on', message: 'I need to attach documents' });
    expect(r.askingSlot).toBe('docs');
    expect(r.controls[0]).toMatchObject({ type: 'multichoice', slotId: 'docs' });
    expect(validate(r.controls)).toBe(true);
  });
});

describe('P1-13: multichoice_select commits an array', () => {
  const prev = process.env.FLOWDESK_MULTICHOICE_ENABLED;
  beforeEach(() => { process.env.FLOWDESK_MULTICHOICE_ENABLED = 'true'; });
  afterEach(() => { if (prev === undefined) delete process.env.FLOWDESK_MULTICHOICE_ENABLED; else process.env.FLOWDESK_MULTICHOICE_ENABLED = prev; });

  test('valid values → the slot holds every picked option', async () => {
    const engine = makeEngine();
    await engine.runTurn({ sessionId: 'mc1', message: 'attach documents' });
    const r = await engine.runTurn({ sessionId: 'mc1', controlAction: { controlId: 'ctrl-docs', slotId: 'docs', action: 'multichoice_select', values: ['tor', 'budget'] } });
    expect(r.draft.slots.docs.value).toEqual(['tor', 'budget']);
    expect(r.draft.slots.docs.provenance).toBe('user_edited');
  });

  test('a value outside the option domain is rejected — nothing is persisted', async () => {
    const engine = makeEngine();
    await engine.runTurn({ sessionId: 'mc2', message: 'attach documents' });
    const r = await engine.runTurn({ sessionId: 'mc2', controlAction: { slotId: 'docs', action: 'multichoice_select', values: ['tor', 'not-an-option'] } });
    expect(r.askingSlot).toBe('docs');
    expect(r.draft.slots.docs && r.draft.slots.docs.value).toBeFalsy();
  });

  test('an empty selection is rejected', async () => {
    const engine = makeEngine();
    await engine.runTurn({ sessionId: 'mc3', message: 'attach documents' });
    const r = await engine.runTurn({ sessionId: 'mc3', controlAction: { slotId: 'docs', action: 'multichoice_select', values: [] } });
    expect(r.draft.slots.docs && r.draft.slots.docs.value).toBeFalsy();
  });
});

// A typed answer must still work: with the gate OFF a multi slot is asked as a single
// `choice`, and SLOT_EXTRACT yields a scalar. Normalizing (rather than rejecting) keeps
// the stored value an array without losing the user's answer.
describe('P1-13: typed answers to a multi slot are normalized, not rejected', () => {
  const { validatePatches } = require('../interpreter-engine');
  const snap = SNAPSHOT;

  test('a single typed option → stored as a one-element array', () => {
    const { good, rejected } = validatePatches([{ slotId: 'docs', value: 'tor' }], snap);
    expect(rejected).toHaveLength(0);
    expect(good[0].value).toEqual(['tor']);
  });

  test('a comma list of real options → split into an array', () => {
    const { good } = validatePatches([{ slotId: 'docs', value: 'tor, budget' }], snap);
    expect(good[0].value).toEqual(['tor', 'budget']);
  });

  test('an array still validates and is preserved', () => {
    const { good } = validatePatches([{ slotId: 'docs', value: ['doa'] }], snap);
    expect(good[0].value).toEqual(['doa']);
  });

  test('an unknown value is still rejected', () => {
    const { good, rejected } = validatePatches([{ slotId: 'docs', value: 'nope' }], snap);
    expect(good).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/not in enum/);
  });

  test('single-valued enums are unaffected (scalar in, scalar out)', () => {
    const single = { ...SNAPSHOT, slots: [{ ...SNAPSHOT.slots[0], multi: false }] };
    const { good } = validatePatches([{ slotId: 'docs', value: 'tor' }], single);
    expect(good[0].value).toBe('tor');
  });
});
