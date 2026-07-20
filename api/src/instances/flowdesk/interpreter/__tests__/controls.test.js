'use strict';

/**
 * I-3 — controls[] turn-contract. Two layers:
 *   1. the pure builder (structure + contract validation),
 *   2. the engine wiring (dual-emit with resolveChoices/choices, controlAction
 *      handled like a legacy choice) — reusing the F9.1d confirm-or-choose harness.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { buildConfirmControl, buildChoiceControl, directoryOf, toOption } = require('../controls');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const directory = require('../../services/directory');

const ajv = new Ajv({ allErrors: true, strict: false });
const controlsSchema = require('../../contracts/controls.schema.json');
// Validate a controls[] array against the contract's `control` definition.
const validate = ajv.compile({ type: 'array', items: { $ref: '#/definitions/control' }, definitions: controlsSchema.definitions });

describe('I-3: controls builder', () => {
  test('directoryOf maps user/location slots (by id or type)', () => {
    expect(directoryOf({ slotId: 'beneficiary' })).toBe('user');
    expect(directoryOf({ slotId: 'x', type: 'user' })).toBe('user');
    expect(directoryOf({ slotId: 'location' })).toBe('location');
    expect(directoryOf({ slotId: 'x', type: 'location' })).toBe('location');
    expect(directoryOf({ slotId: 'subject', type: 'string' })).toBeNull();
  });

  test('toOption maps a user object to value=userId + email description', () => {
    expect(toOption({ userId: 'U002', name: 'Ivanova', email: 'iv@un.org' }, 'user'))
      .toEqual({ value: 'U002', label: 'Ivanova', description: 'iv@un.org' });
  });

  test('toOption maps a location object to value=code + city description', () => {
    expect(toOption({ code: 'GVA', name: 'Geneva', city: 'Geneva' }, 'location'))
      .toEqual({ value: 'GVA', label: 'Geneva', description: 'Geneva' });
  });

  test('buildConfirmControl (user slot, allowSearch) → confirm + autocomplete child on _search', () => {
    const controls = buildConfirmControl(
      { slotId: 'beneficiary', type: 'user' },
      { userId: 'U001', name: 'Me' },
      [{ userId: 'U002', name: 'Ivanova', email: 'iv@un.org' }],
      { label: 'For you?', allowSearch: true },
    );
    expect(controls).toHaveLength(1);
    const c = controls[0];
    expect(c).toMatchObject({ id: 'ctrl-beneficiary', type: 'confirm', slotId: 'beneficiary', label: 'For you?' });
    expect(c.defaultValue).toEqual({ userId: 'U001', name: 'Me' });
    expect(c.options).toEqual([{ value: 'U002', label: 'Ivanova', description: 'iv@un.org' }]);
    expect(c.showChildrenOn).toBe('_search');
    expect(c.children[0]).toMatchObject({
      type: 'autocomplete', slotId: 'beneficiary',
      source: { directory: 'user', endpoint: '/api/v1/flowdesk/directory/user', minChars: 2 },
    });
    expect(validate(controls)).toBe(true);
  });

  test('buildConfirmControl (non-directory slot) → no search child', () => {
    const controls = buildConfirmControl({ slotId: 'foo', type: 'string' }, 'bar', [], { allowSearch: true });
    expect(controls[0].children).toBeUndefined();
    expect(controls[0].showChildrenOn).toBeUndefined();
    expect(validate(controls)).toBe(true);
  });

  test('buildChoiceControl → choice control over presentOptions, contract-valid', () => {
    const controls = buildChoiceControl(
      { slotId: 'urgency', type: 'enum' },
      [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }],
      { label: 'How urgent?' },
    );
    expect(controls[0]).toMatchObject({ id: 'ctrl-urgency', type: 'choice', slotId: 'urgency', label: 'How urgent?' });
    expect(controls[0].options).toEqual([{ value: 'high', label: 'High' }, { value: 'low', label: 'Low' }]);
    expect(validate(controls)).toBe(true);
  });
});

// ── engine wiring (reuses the F9.1d harness) ──────────────────────────────────
function extractFor(m) {
  const out = {};
  const s = m.toLowerCase();
  if (/ноутбук|laptop/.test(s)) out.assetType = 'laptop_standard';
  if (/иванов/.test(s)) out.beneficiary = 'Иванова';
  if (/петров/.test(s)) out.beneficiary = 'Петров';
  return out;
}
function makeEngine() {
  const hardware = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));
  const loadSnapshot = async () => hardware;
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot, graphWrite: async () => [],
    now: () => Date.parse('2026-07-14T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' }
      : extractFor((prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '')),
    completion: () => 'Вопрос?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { serviceId: 'IT-HW-LAP', version: 1 }, score: 0.9, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, directory });
}

describe('I-3: engine dual-emit + controlAction', () => {
  test('confirm-or-choose emits controls[] ALONGSIDE resolveChoices (same slot)', async () => {
    const engine = makeEngine();
    const r = await engine.runTurn({ sessionId: 'c1', message: 'нужен ноутбук для Иванова' });
    expect(r.askingSlot).toBe('beneficiary');
    // legacy contract still present
    expect(r.resolveChoices.slotId).toBe('beneficiary');
    // new contract, consistent with it
    expect(Array.isArray(r.controls)).toBe(true);
    expect(r.controls[0]).toMatchObject({ type: 'confirm', slotId: 'beneficiary', showChildrenOn: '_search' });
    expect(r.controls[0].children[0].source.directory).toBe('user');
    expect(validate(r.controls)).toBe(true);
  });

  test('controlAction {confirm} fills the slot like a legacy choice', async () => {
    const engine = makeEngine();
    await engine.runTurn({ sessionId: 'c2', message: 'нужен ноутбук для Иванова' });
    const r = await engine.runTurn({ sessionId: 'c2', controlAction: { controlId: 'ctrl-beneficiary', slotId: 'beneficiary', action: 'confirm' } });
    // beneficiary now resolved (not pending) → flow advanced past it
    expect(r.draft.slots.beneficiary.value.userId).toBe('U002');
    expect(r.draft.slots.beneficiary.pending).toBeFalsy();
  });

  test('controlAction {submit} is treated as select (autocomplete pick)', async () => {
    const engine = makeEngine();
    await engine.runTurn({ sessionId: 'c3', message: 'нужен ноутбук для Иванова' });
    const picked = { userId: 'U005', name: 'Sidorov', email: 's@un.org' };
    const r = await engine.runTurn({ sessionId: 'c3', controlAction: { slotId: 'beneficiary', action: 'submit', value: picked } });
    expect(r.draft.slots.beneficiary.value.userId).toBe('U005');
    expect(r.draft.slots.beneficiary.provenance).toBe('user_edited');
  });

  test('legacy choice {confirm} still works (backward compat)', async () => {
    const engine = makeEngine();
    await engine.runTurn({ sessionId: 'c4', message: 'нужен ноутбук для Иванова' });
    const r = await engine.runTurn({ sessionId: 'c4', choice: { slotId: 'beneficiary', action: 'confirm' } });
    expect(r.draft.slots.beneficiary.value.userId).toBe('U002');
  });
});
