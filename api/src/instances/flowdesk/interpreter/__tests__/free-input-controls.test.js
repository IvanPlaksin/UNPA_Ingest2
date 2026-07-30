'use strict';

/**
 * TASK-003/004 — free-input controls (text / textarea / number / toggle).
 *
 * These carry no validation by design: the TASK-PROMPT-002 audit established Altiora
 * authors no min/max/length/regex. What they buy is the right widget per slot type and
 * a value that never has to be parsed out of prose. The composer stays enabled, so a
 * control is an additional affordance, not a gate.
 */

const Ajv = require('ajv');
const {
  buildTextControl, buildTextareaControl, buildNumberControl, buildToggleControl,
} = require('../controls');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const ajv = new Ajv({ allErrors: true, strict: false });
const controlsSchema = require('../../contracts/controls.schema.json');
const validate = ajv.compile({ type: 'array', items: { $ref: '#/definitions/control' }, definitions: controlsSchema.definitions });

describe('TASK-003/004: builders', () => {
  test('text control', () => {
    const c = buildTextControl({ slotId: 'subject' }, { label: 'Subject?', placeholder: 'Keep it short' });
    expect(c[0]).toMatchObject({ id: 'ctrl-subject', type: 'text', slotId: 'subject', label: 'Subject?', placeholder: 'Keep it short' });
    expect(validate(c)).toBe(true);
  });

  test('textarea control defaults to a multi-line height', () => {
    const c = buildTextareaControl({ slotId: 'notes' }, { label: 'Notes?' });
    expect(c[0]).toMatchObject({ type: 'textarea', rows: 4 });
    expect(validate(c)).toBe(true);
  });

  test('number control', () => {
    const c = buildNumberControl({ slotId: 'months' }, { label: 'How many months?' });
    expect(c[0].type).toBe('number');
    expect(validate(c)).toBe(true);
  });

  test('toggle control accepts a boolean prefill', () => {
    const c = buildToggleControl({ slotId: 'confirmed' }, { label: 'Confirm?', prefill: true });
    expect(c[0]).toMatchObject({ type: 'toggle', prefill: true });
    expect(validate(c)).toBe(true);
  });

  test('a non-boolean prefill on a toggle is rejected by the contract', () => {
    expect(validate(buildToggleControl({ slotId: 'x' }, { prefill: 'yes' }))).toBe(false);
  });

  test('a non-ISO prefill is still rejected on a date control (regression guard)', () => {
    const { buildDateControl } = require('../controls');
    expect(validate(buildDateControl({ slotId: 'd' }, { prefill: '15/08/2026' }))).toBe(false);
    expect(validate(buildDateControl({ slotId: 'd' }, { prefill: '2026-08-15' }))).toBe(true);
  });
});

// ── engine wiring ────────────────────────────────────────────────────────────
const snapshotWith = (slot) => ({
  serviceId: 'SVC', version: 1, phases: ['detail'],
  metadata: { title: 'SVC', approvalRequired: false },
  slots: [{ required: true, phase: 'detail', ...slot }],
});

function makeEngine(slot) {
  const loadSnapshot = async () => snapshotWith(slot);
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
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' } : {}),
    completion: () => 'What is it?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC', title: 'SVC', schemaRef: { serviceId: 'SVC', version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false });
}

describe('TASK-003/004: slot type → control', () => {
  test.each([
    ['string', 'text'],
    ['text', 'textarea'],
    ['number', 'number'],
    ['boolean', 'toggle'],
  ])('a %s slot emits a %s control', async (slotType, controlType) => {
    const r = await makeEngine({ slotId: 'field', type: slotType, promptHint: 'Field' }).runTurn({ sessionId: `t-${slotType}`, message: 'start' });
    expect(r.askingSlot).toBe('field');
    expect(r.controls[0].type).toBe(controlType);
    expect(validate(r.controls)).toBe(true);
  });

  test('helpText seeds the placeholder', async () => {
    const r = await makeEngine({ slotId: 'field', type: 'string', promptHint: 'Field', helpText: 'Use the WBSE code' })
      .runTurn({ sessionId: 'ph', message: 'start' });
    expect(r.controls[0].placeholder).toBe('Use the WBSE code');
  });
});

describe('TASK-003/004: committing a value', () => {
  test('text_input trims and stores the string', async () => {
    const engine = makeEngine({ slotId: 'field', type: 'string', promptHint: 'Field' });
    await engine.runTurn({ sessionId: 'c1', message: 'start' });
    const r = await engine.runTurn({ sessionId: 'c1', controlAction: { slotId: 'field', action: 'text_input', value: '  Hello  ' } });
    expect(r.draft.slots.field.value).toBe('Hello');
  });

  test('an empty text_input is rejected', async () => {
    const engine = makeEngine({ slotId: 'field', type: 'string', promptHint: 'Field' });
    await engine.runTurn({ sessionId: 'c2', message: 'start' });
    const r = await engine.runTurn({ sessionId: 'c2', controlAction: { slotId: 'field', action: 'text_input', value: '   ' } });
    expect(r.draft.slots.field && r.draft.slots.field.value).toBeFalsy();
  });

  test('number_input coerces a numeric string to a number', async () => {
    const engine = makeEngine({ slotId: 'field', type: 'number', promptHint: 'Field' });
    await engine.runTurn({ sessionId: 'c3', message: 'start' });
    const r = await engine.runTurn({ sessionId: 'c3', controlAction: { slotId: 'field', action: 'number_input', value: '12' } });
    expect(r.draft.slots.field.value).toBe(12);
  });

  test('a non-numeric number_input is rejected', async () => {
    const engine = makeEngine({ slotId: 'field', type: 'number', promptHint: 'Field' });
    await engine.runTurn({ sessionId: 'c4', message: 'start' });
    const r = await engine.runTurn({ sessionId: 'c4', controlAction: { slotId: 'field', action: 'number_input', value: 'twelve' } });
    expect(r.draft.slots.field && r.draft.slots.field.value).toBeFalsy();
  });

  test('toggle_input stores a native boolean (the format Altiora writes)', async () => {
    const engine = makeEngine({ slotId: 'field', type: 'boolean', promptHint: 'Field' });
    await engine.runTurn({ sessionId: 'c5', message: 'start' });
    const on = await engine.runTurn({ sessionId: 'c5', controlAction: { slotId: 'field', action: 'toggle_input', value: true } });
    expect(on.draft.slots.field.value).toBe(true);
  });

  test('toggle_input coerces the stringy forms Altiora accepts', async () => {
    const engine = makeEngine({ slotId: 'field', type: 'boolean', promptHint: 'Field' });
    await engine.runTurn({ sessionId: 'c6', message: 'start' });
    const r = await engine.runTurn({ sessionId: 'c6', controlAction: { slotId: 'field', action: 'toggle_input', value: 'true' } });
    expect(r.draft.slots.field.value).toBe(true);
  });
});
