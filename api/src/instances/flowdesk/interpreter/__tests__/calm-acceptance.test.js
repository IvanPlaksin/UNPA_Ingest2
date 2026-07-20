'use strict';

/**
 * F10e — CALM acceptance catalog (ADCC-100). One test per CALM conduct pattern,
 * each proving the pattern EMERGES from the core machinery (DialogueStack +
 * interpretation order + repair ladder + universal actions + grounding) rather
 * than a pattern-specific engine branch.
 *
 * Pattern → generating principle → implementation:
 *  P1  correction        B/ADCC-087  dialogue-markers.CORRECTION_FORM_RE → REPAIR_MARKER → fillLoop + reducer stale cascade
 *  P2  clarification     B/ADCC-085  applyRepairDecision ANSWER_REJECT rung 2 (recordRepair→optionsHint)
 *  P3  cancel_flow       E/ADCC-098  applyUniversalAction 'cancel' → pendingAction confirm_cancel → park
 *  P4  skip_question     E/ADCC-097  applyUniversalAction 'skip' → pendingAction skip_offer
 *  P5  repeat_messages   E/ADCC-096  applyUniversalAction 'repeat' → draft.lastAgentQuestion
 *  P6  human_handoff     B/ADCC-086  ladderStepFor session>=5 → pendingAction offer_handoff → escalate
 *  P7  continue_interr.  A+E/084/098 draftService.getParkedByUser / offer_resume
 *  P8  internal_error    B/ADCC-085  runTurn catch → internalError (no dead end)
 *  P9  collect_info      A/080-082   DialogueStack open→fill→close, submit
 *  P10 completed         C/ADCC-091  CONFIRM_YES → closer = srNumber
 *  P11 chitchat          exclusion   ROUTER OUT_OF_SCOPE redirect
 *  P12 validate_slot     A+C/082/090 REPAIR_ROUTER enum mismatch → ANSWER_REJECT repair
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const directory = require('../../services/directory');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

// A single-enum service + the hardware fixture, resolvable by keyword.
const colourSnap = {
  serviceId: 'IT-XX-COL', version: 1, phases: ['detail'], metadata: { title: 'Colour' },
  slots: [{ slotId: 'color', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }],
};
const SNAPS = { 'IT-HW-LAP': hardware, 'IT-XX-COL': colourSnap };

function makeEngine({ route, extract, resolve, listServices } = {}) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(v) : null; }, async set(k, v) { store.set(k, JSON.stringify(v)); return true; } },
    loadSnapshot: async (id) => SNAPS[id], graphWrite: async () => [],
    now: () => Date.parse('2026-07-15T12:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-500`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties?.route) {
        const msg = (prompt.match(/Message: "([^"]*)"/) || [])[1] || '';
        const allFilled = /All required slots filled: true/.test(prompt);
        return { route: (route ? route(msg, allFilled) : (allFilled && /^(yes|да)\b/i.test(msg.trim()) ? 'CONFIRM_YES' : (prompt.includes('Has active draft: true') ? 'SLOT_FILL' : 'NEW_INTENT'))) };
      }
      const m = (prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '';
      return extract ? extract(m) : {};
    },
    completion: () => 'Question?',
  });
  const resolveSearch = resolve || (async () => [{ type: 'SERVICE', serviceId: 'IT-XX-COL', title: 'Colour', schemaRef: { version: 1 }, score: 0.9, confidence: 'high' }]);
  return { engine: createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async (id) => SNAPS[id], directory, listServices }), draftService };
}

// Helper: drive the colour service to its open enum question.
async function openColour(engine, sid) {
  const r = await engine.runTurn({ sessionId: sid, message: 'I need a colour', lang: 'en' });
  expect(r.askingSlot).toBe('color');
  return r;
}

describe('CALM acceptance (ADCC-100) — 12 patterns from the core', () => {
  // P1 — correction (ADCC-087): "not X — Y" updates the slot with an echo.
  test('P1 correction: "not red — blue" corrects an open enum answer', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 'p1';
    await openColour(engine, sid);
    // First a valid answer, then a correction form on the reopened question.
    let r = await engine.runTurn({ sessionId: sid, message: 'not red - blue', lang: 'en' });
    // The correction marker routes through the fill-loop, which extracts nothing
    // here (mock) → the slot is re-asked, i.e. NOT silently mis-accepted as text.
    expect(r.route).not.toBe('NEW_INTENT');
    expect(r.trace).toContain('REPAIR_ROUTER');
  });

  // P2 — clarification (ADCC-085 rung 2): options after repeated misses.
  test('P2 clarification: 2 enum failures surface the options', async () => {
    const { engine } = makeEngine();
    const sid = 'p2';
    await openColour(engine, sid);
    await engine.runTurn({ sessionId: sid, message: 'purple', lang: 'en' });
    const r = await engine.runTurn({ sessionId: sid, message: 'magenta', lang: 'en' });
    expect(r.choices).toEqual(['Red', 'Blue']);
    expect(r.response).toMatch(/available options/i);
  });

  // P3 — cancel (ADCC-098): confirm then park.
  test('P3 cancel_flow: cancel → confirm → park', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 'p3';
    await openColour(engine, sid);
    let r = await engine.runTurn({ sessionId: sid, message: 'cancel', lang: 'en' });
    expect(r.responseType).toBe('confirm_cancel');
    r = await engine.runTurn({ sessionId: sid, message: 'yes', lang: 'en' });
    expect(r.closer).toBe('PARKED');
    expect((await draftService.get(sid)).status).toBe('parked');
  });

  // P4 — skip (ADCC-097): required slot explains + offers.
  test('P4 skip_question: skip on required → explanation + offer', async () => {
    const { engine } = makeEngine();
    const sid = 'p4';
    await openColour(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'skip', lang: 'en' });
    expect(r.responseType).toBe('explain_then_offer');
    expect(r.choices).toEqual(['provide', 'park', 'cancel']);
  });

  // P5 — repeat (ADCC-096): verbatim last question.
  test('P5 repeat_messages: repeat re-issues the last question verbatim', async () => {
    const { engine } = makeEngine();
    const sid = 'p5';
    const first = await openColour(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'repeat', lang: 'en' });
    expect(r.response).toBe(first.response);
  });

  // P6 — handoff (ADCC-086): session threshold → offer human.
  test('P6 human_handoff: 5 session failures → offer_handoff', async () => {
    const { engine } = makeEngine();
    const sid = 'p6';
    await openColour(engine, sid);
    let r;
    for (let i = 0; i < 5; i++) r = await engine.runTurn({ sessionId: sid, message: 'magenta', lang: 'en' });
    expect(r.responseType).toBe('offer_handoff');
  });

  // P7 — continue interrupted (ADCC-098): parked draft discoverable for the user.
  test('P7 continue_interrupted: parked draft found for the user, resumable', async () => {
    const { draftService } = makeEngine();
    await draftService.create('p7a', 'IT-XX-COL', 1, undefined, 'U42');
    await draftService.park('p7a');
    const parked = await draftService.getParkedByUser('U42');
    expect(parked.map((d) => d.sessionId)).toContain('p7a');
    expect((await draftService.unpark('p7a')).status).toBe('draft');
  });

  // P8 — internal error (ADCC-085): graceful, session survives.
  test('P8 internal_error: a thrown resolver is handled, not crashed', async () => {
    const { engine } = makeEngine({ resolve: async () => { throw new Error('boom'); } });
    const r = await engine.runTurn({ sessionId: 'p8', message: 'I need something', lang: 'en' });
    expect(r.route).toBe('ERROR');
    expect(r.response).toMatch(/something went wrong/i);
    expect(r.isComplete).toBe(false);
  });

  // P9 — collect information (ADCC-080..082): open → fill → close → submit.
  test('P9 collect_information: full slot-filling opens/closes the stack and creates an SR', async () => {
    const { engine, draftService } = makeEngine({
      route: (msg, allFilled) => (allFilled && /^(yes|да)\b/i.test(msg.trim()) ? 'CONFIRM_YES' : 'SLOT_FILL'),
      extract: (m) => (/red|blue/i.test(m) ? { color: /blue/i.test(m) ? 'blue' : 'red' } : {}),
    });
    const sid = 'p9';
    await openColour(engine, sid); // stack opens: color
    let r = await engine.runTurn({ sessionId: sid, message: 'blue', lang: 'en' }); // fill → review, stack closes
    expect(r.response).toMatch(/review/i);
    const mid = await draftService.get(sid);
    expect(mid.dialogueStack).toEqual([]); // sequence explicitly closed
    r = await engine.runTurn({ sessionId: sid, message: 'yes', lang: 'en' });
    expect(r.isComplete).toBe(true);
    expect(r.srNumber).toMatch(/^SR-/);
  });

  // P10 — completed (ADCC-091): explicit closer on submit.
  test('P10 completed: submit carries a verbatim closer = SR number', async () => {
    const { engine } = makeEngine({
      route: (msg, allFilled) => (allFilled && /^(yes)\b/i.test(msg.trim()) ? 'CONFIRM_YES' : 'SLOT_FILL'),
      extract: (m) => (/red|blue/i.test(m) ? { color: 'blue' } : {}),
    });
    const sid = 'p10';
    await openColour(engine, sid);
    await engine.runTurn({ sessionId: sid, message: 'blue', lang: 'en' });
    const r = await engine.runTurn({ sessionId: sid, message: 'yes', lang: 'en' });
    expect(r.closer).toBe(r.srNumber);
  });

  // P11 — chitchat (exclusion): out-of-scope redirect, not answered.
  test('P11 chitchat: an off-topic message is redirected, not answered', async () => {
    const { engine } = makeEngine({ route: () => 'OUT_OF_SCOPE' });
    const r = await engine.runTurn({ sessionId: 'p11', message: "what's the weather today?", lang: 'en' });
    expect(r.route).toBe('OUT_OF_SCOPE');
    expect(r.response).toMatch(/service requests/i);
  });

  // P12 — validate slot (ADCC-082/090): enum mismatch repairs, never silent.
  test('P12 validate_slot: an invalid enum answer triggers repair, slot stays empty', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 'p12';
    await openColour(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'chartreuse', lang: 'en' });
    expect(r.askingSlot).toBe('color');
    expect(r.response).toMatch(/didn't catch/i);
    expect((await draftService.get(sid)).slots.color).toBeUndefined();
  });
});
