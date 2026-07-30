'use strict';

/**
 * Two reported defects in the assistant's turn text:
 *
 *  1. Every question appeared TWICE — once as the message and again as the control's
 *     caption, because the emission passed the same string as both `response` and the
 *     control `label`, and the client renders both.
 *  2. Mid-form, the assistant greeted and re-introduced itself before a question
 *     ("Здравствуйте! Я Altiora…"), because the persona guidance is appended to the
 *     QUESTION_PLANNER prompt and nothing constrained the output shape.
 */

const { runQuestionPlanner } = require('../../contracts/llm-provider.stub');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createEngine } = require('../interpreter-engine');
const { createDraftSRService } = require('../../services/draft-sr.service');

// ── 1. no duplicated caption ────────────────────────────────────────────────
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
    completion: () => 'Which duty station are you at?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC', title: 'SVC', schemaRef: { serviceId: 'SVC', version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false });
}

describe('the question is not repeated as a control caption', () => {
  test.each([
    ['string', 'text'],
    ['text', 'textarea'],
    ['number', 'number'],
    ['boolean', 'toggle'],
    ['date', 'date'],
  ])('%s slot: the %s control carries no label', async (slotType, controlType) => {
    const r = await makeEngine({ slotId: 'field', type: slotType, promptHint: 'Field' })
      .runTurn({ sessionId: `q-${slotType}`, message: 'start' });
    expect(r.controls[0].type).toBe(controlType);
    expect(r.response).toBe('Which duty station are you at?');
    expect(r.controls[0].label).toBeUndefined();
  });

  test('enum slot: the choice control carries no label either', async () => {
    const r = await makeEngine({
      slotId: 'field', type: 'enum', promptHint: 'Field',
      presentOptions: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    }).runTurn({ sessionId: 'q-enum', message: 'start' });
    expect(r.controls[0].type).toBe('choice');
    expect(r.controls[0].label).toBeUndefined();
    expect(r.controls[0].options).toHaveLength(2);
  });
});

// ── 2. no greeting / self-introduction mid-form ─────────────────────────────
describe('QUESTION_PLANNER emits the question only', () => {
  const snapshot = {
    slots: [{ slotId: 'dutyStation', type: 'string', promptHint: 'Duty Station' }],
  };
  const promptOf = async (guidance) => {
    const llm = new MockLLMProvider({ completion: () => 'q' });
    await runQuestionPlanner(llm, { snapshot, unfilledSlotIds: ['dutyStation'], lang: 'ru', guidance });
    return llm.calls.find((c) => c.method === 'completion').prompt;
  };

  test('the output constraint forbids greeting and self-introduction', async () => {
    const p = await promptOf(undefined);
    expect(p).toMatch(/Output ONLY the question itself/);
    expect(p).toMatch(/no greeting/i);
    expect(p).toMatch(/no introducing yourself/i);
  });

  test('the constraint comes AFTER the persona guidance, so it has the last word', async () => {
    const persona = 'You are Altiora, the UN service-centre intake assistant. Greet the user warmly.';
    const p = await promptOf(persona);
    expect(p).toContain(persona);
    expect(p.indexOf('Output ONLY the question itself')).toBeGreaterThan(p.indexOf(persona));
  });
});
