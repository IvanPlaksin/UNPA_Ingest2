'use strict';

/**
 * TASK-PROMPT-005 — `helpText` (Altiora's field description + example) reaches the
 * two places that phrase/ground field-level language: QUESTION_PLANNER (how the ask
 * is worded) and FIELD_HELP (what "what is this field?" is answered from).
 *
 * Per the TASK-PROMPT-002 audit these are the ONLY constraint-like attributes the
 * source form authors, so losing them lost real rules (e.g. "above 364 days needs a
 * written justification").
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider, runQuestionPlanner } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const HELP = 'A detailed written justification is mandatory above 364 days.';

// ── QUESTION_PLANNER ─────────────────────────────────────────────────────────
describe('TASK-PROMPT-005: QUESTION_PLANNER grounds the ask in helpText', () => {
  const snapshot = (slot) => ({
    serviceId: 'SVC', version: 1, phases: ['detail'],
    metadata: { title: 'SVC', approvalRequired: false },
    slots: [{ slotId: 'justification', type: 'text', required: true, phase: 'detail', promptHint: 'Justification', ...slot }],
  });

  test('a slot with helpText contributes a Guidance line to the prompt', async () => {
    const llm = new MockLLMProvider({ completion: () => 'Why is the extension needed?' });
    await runQuestionPlanner(llm, { snapshot: snapshot({ helpText: HELP }), unfilledSlotIds: ['justification'], lang: 'en' });
    const prompt = llm.calls.find((c) => c.method === 'completion').prompt;
    expect(prompt).toContain('- justification: Justification');
    expect(prompt).toContain(`Guidance: ${HELP}`);
  });

  test('multi-line helpText is flattened onto the single guidance line', async () => {
    const llm = new MockLLMProvider({ completion: () => 'q' });
    await runQuestionPlanner(llm, { snapshot: snapshot({ helpText: 'Explain why.\n\nExample: project X continues' }), unfilledSlotIds: ['justification'], lang: 'en' });
    const prompt = llm.calls.find((c) => c.method === 'completion').prompt;
    expect(prompt).toContain('Guidance: Explain why. Example: project X continues');
  });

  test('a slot without helpText adds no Guidance line (unchanged behaviour)', async () => {
    const llm = new MockLLMProvider({ completion: () => 'q' });
    await runQuestionPlanner(llm, { snapshot: snapshot({}), unfilledSlotIds: ['justification'], lang: 'en' });
    expect(llm.calls.find((c) => c.method === 'completion').prompt).not.toContain('Guidance:');
  });
});

// ── FIELD_HELP ───────────────────────────────────────────────────────────────
// The slot is optional so the draft opens with NO pending slot question — otherwise
// the answer-first REPAIR_ROUTER (ADCC-081) claims the utterance as a slot answer
// before it can ever reach FIELD_HELP.
const snapshotFor = (serviceId, slotExtra = {}) => ({
  serviceId, version: 1, phases: ['detail'],
  metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: false, phase: 'detail', promptHint: 'Subject / Title', ...slotExtra }],
});

function makeEngine(slotExtra) {
  const store = new Map();
  const load = async (sid) => snapshotFor(sid, slotExtra);
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: load, graphWrite: async () => [],
    now: () => Date.parse('2026-07-17T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const routeFor = (prompt) => {
    const m = (prompt.match(/Message: "([^"]*)"/) || [])[1] || '';
    return /mean|field/i.test(m) ? 'FIELD_HELP' : 'NEW_INTENT';
  };
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties && schema.properties.route ? { route: routeFor(prompt) } : {}),
    completion: () => 'This field is a short summary of your request.',
  });
  // A SERVICE hit so the first turn actually opens a draft — FIELD_HELP only resolves
  // a slot when there is an active snapshot to resolve it against.
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC', title: 'SVC', schemaRef: { serviceId: 'SVC', version: 1 }, score: 0.9, confidence: 'high' }];
  const engine = createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: load, tools: { searchArticles: async () => [] } });
  return { engine, llm };
}
const fieldHelpPrompt = (llm) => llm.calls.filter((c) => c.method === 'completion').slice(-1)[0].prompt;

describe('TASK-PROMPT-005: FIELD_HELP answers from helpText', () => {
  test('helpText is injected as authoritative field guidance', async () => {
    const { engine, llm } = makeEngine({ helpText: HELP });
    await engine.runTurn({ sessionId: 'h1', message: 'subject' });
    // Answer the open question first: with every field now offered, an unanswered slot
    // would let the answer-first repair router claim the field-help question.
    await engine.runTurn({ sessionId: 'h1', message: 'A short subject' });
    const r = await engine.runTurn({ sessionId: 'h1', message: 'what does the subject / title field mean?' });
    expect(r.route).toBe('FIELD_HELP');
    expect(fieldHelpPrompt(llm)).toContain(`Field guidance (authoritative): ${HELP}`);
  });

  test('without helpText the prompt carries no guidance line (unchanged behaviour)', async () => {
    const { engine, llm } = makeEngine({});
    await engine.runTurn({ sessionId: 'h2', message: 'subject' });
    await engine.runTurn({ sessionId: 'h2', message: 'A short subject' });
    const r = await engine.runTurn({ sessionId: 'h2', message: 'what does the subject / title field mean?' });
    expect(r.route).toBe('FIELD_HELP');
    expect(fieldHelpPrompt(llm)).not.toContain('Field guidance (authoritative)');
  });
});
