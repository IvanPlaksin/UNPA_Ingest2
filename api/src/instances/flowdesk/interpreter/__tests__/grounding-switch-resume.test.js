'use strict';

/**
 * F10d tests — mandatory grounding (ADCC-089), explicit closure (ADCC-091),
 * confirm-switch on mid-flow new intent (ADCC-084), park/resume (ADCC-098).
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const reducer = require('../../contracts/draft-sr.reducer');
const { validateGrounding, buildPreamble, GroundingViolationError } = require('../templates/echo');

// ── unit: grounding + completeness ──────────────────────────────────────────
describe('F10d: mandatory grounding (ADCC-089)', () => {
  test('extracted slots + no preamble → GroundingViolationError', () => {
    expect(() => validateGrounding(['assetType'], null)).toThrow(GroundingViolationError);
    expect(() => validateGrounding(['assetType'], null)).toThrow(/silent interpretation/);
  });
  test('no extraction + no preamble is fine; any extraction yields a non-null echo', () => {
    expect(validateGrounding([], null)).toBe(true);
    expect(buildPreamble({ hasAny: true, other: [] }, 'en')).toBeTruthy(); // generic ack
    expect(buildPreamble({ assetType: 'monitor', other: [] }, 'en')).toMatch(/monitor/);
  });
});

describe('F10d: completeness (ADCC-084 threshold input)', () => {
  const snap = { serviceId: 'IT-XX-C', version: 1, phases: ['d'], metadata: {}, slots: [
    { slotId: 'a', type: 'text', required: true, phase: 'd' },
    { slotId: 'b', type: 'text', required: true, phase: 'd' },
  ] };
  test('0, half, full', () => {
    expect(reducer.completeness({ slots: {} }, snap)).toBe(0);
    expect(reducer.completeness({ slots: { a: { value: 'x' } } }, snap)).toBe(0.5);
    expect(reducer.completeness({ slots: { a: { value: 'x' }, b: { value: 'y' } } }, snap)).toBe(1);
  });
});

// ── two-service world: hardware (enum + typed date) + badge (single slot) ────
// The pending question at switch time is a TYPED slot (date) so the REPAIR_ROUTER
// falls through to the LLM router — where mid-flow new-intent is detected. (A
// freetext pending slot would accept the utterance as its answer, by design.)
const hardwareSnap = {
  serviceId: 'IT-HW-LAP', version: 2, phases: ['detail'], metadata: { title: 'Hardware Request' },
  slots: [
    { slotId: 'assetType', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'laptop_standard', label: 'Standard laptop' }, { value: 'monitor', label: 'Monitor' }] },
    { slotId: 'pickupDate', type: 'date', required: true, phase: 'detail', dependsOn: ['assetType'] },
  ],
};
const badgeSnap = {
  serviceId: 'HR-BADGE', version: 1, phases: ['detail'], metadata: { title: 'Access Badge' },
  slots: [{ slotId: 'badgeType', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'permanent', label: 'Permanent' }, { value: 'visitor', label: 'Visitor' }] }],
};
const SNAPS = { 'IT-HW-LAP': hardwareSnap, 'HR-BADGE': badgeSnap };

function makeEngine() {
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(v) : null; }, async set(k, v) { store.set(k, JSON.stringify(v)); return true; } },
    loadSnapshot: async (id) => SNAPS[id], graphWrite: async () => [],
    now: () => Date.parse('2026-07-15T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-77`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties?.route) {
        const msg = (prompt.match(/Message: "([^"]*)"/) || [])[1] || '';
        const allFilled = /All required slots filled: true/.test(prompt);
        if (/^(yes|да|oui)\b/i.test(msg.trim()) && allFilled) return { route: 'CONFIRM_YES' };
        return { route: 'NEW_INTENT' };
      }
      const m = (prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '';
      const out = {};
      if (/laptop|ноутбук/i.test(m)) out.assetType = 'laptop_standard';
      if (/week|date|tomorrow|202\d/i.test(m)) out.pickupDate = m;
      return out;
    },
    completion: () => 'When do you need it?',
  });
  // resolveSearch resolves by keyword so a badge message maps to HR-BADGE.
  const resolveSearch = async (message) => {
    if (/badge/i.test(message)) return [{ type: 'SERVICE', serviceId: 'HR-BADGE', title: 'Access Badge', schemaRef: { version: 1 }, score: 0.95, confidence: 'high' }];
    return [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Hardware Request', schemaRef: { version: 2 }, score: 0.9, confidence: 'high' }];
  };
  return { engine: createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async (id) => SNAPS[id] }), draftService };
}

describe('F10d: explicit closure on submit (ADCC-091)', () => {
  test('submit sets a verbatim closer = SR number', async () => {
    const { engine } = makeEngine();
    const sid = 'c1';
    let r = await engine.runTurn({ sessionId: sid, message: 'I need a laptop', lang: 'en' }); // assetType auto-filled → asks pickupDate
    expect(r.askingSlot).toBe('pickupDate');
    r = await engine.runTurn({ sessionId: sid, message: 'deliver on 2026-07-20', lang: 'en' }); // fills date → review
    // Confirming now hands the collected values to Altiora's form instead of
    // submitting here, so there is no SR number to close the conversation with yet.
    r = await engine.runTurn({ sessionId: sid, message: 'yes', lang: 'en' });
    expect(r.route).toBe('confirm_form');
    expect(r.openForm.prefill.dynamicData).toBeDefined();
    expect(r.srNumber).toBeUndefined();
  });
});

describe('F10d: confirm-switch on mid-flow new intent (ADCC-084)', () => {
  test('badge request during a partly-filled hardware draft → confirm_switch', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 's1';
    await engine.runTurn({ sessionId: sid, message: 'I need a laptop', lang: 'en' }); // assetType filled, asks pickupDate (typed)
    const r = await engine.runTurn({ sessionId: sid, message: 'I need an access badge', lang: 'en' });
    expect(r.responseType).toBe('confirm_switch');
    expect(r.response).toMatch(/Hardware Request/);
    expect(r.response).toMatch(/Access Badge/);
    expect((await draftService.get(sid)).pendingAction.type).toBe('confirm_switch');
  });

  test('switch → yes parks hardware and starts the badge request', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 's2';
    await engine.runTurn({ sessionId: sid, message: 'I need a laptop', lang: 'en' });
    await engine.runTurn({ sessionId: sid, message: 'I need an access badge', lang: 'en' }); // → confirm_switch
    const r = await engine.runTurn({ sessionId: sid, message: 'switch', lang: 'en' });
    expect(r.switched).toBe(true);
    const live = await draftService.get(sid);
    expect(live.serviceId).toBe('HR-BADGE'); // new draft is the badge request
    expect(live.status).toBe('draft');
  });

  test('switch → continue keeps the hardware request', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 's3';
    await engine.runTurn({ sessionId: sid, message: 'I need a laptop', lang: 'en' });
    await engine.runTurn({ sessionId: sid, message: 'I need an access badge', lang: 'en' });
    const r = await engine.runTurn({ sessionId: sid, message: 'continue', lang: 'en' });
    const live = await draftService.get(sid);
    expect(live.serviceId).toBe('IT-HW-LAP');
    expect(live.pendingAction).toBeUndefined();
    expect(r.askingSlot).toBe('pickupDate'); // resumes the current flow
  });
});

describe('F10d: park / resume re-entry (ADCC-098)', () => {
  test('getParkedByUser + resumeDraft (service level)', async () => {
    const { draftService } = makeEngine();
    await draftService.create('p1', 'IT-HW-LAP', 2, undefined, 'U001');
    await draftService.park('p1');
    const parked = await draftService.getParkedByUser('U001');
    expect(parked).toHaveLength(1);
    expect(parked[0].sessionId).toBe('p1');
    const resumed = await draftService.unpark('p1');
    expect(resumed.status).toBe('draft');
    expect(await draftService.getParkedByUser('U001')).toHaveLength(0); // index self-heals
  });

  test('re-entry with a parked draft → offer_resume; accept → status draft', async () => {
    const { engine, draftService } = makeEngine();
    const sid = 'r1';
    // build a parked draft in place: start + park via cancel
    await engine.runTurn({ sessionId: sid, message: 'I need a laptop', lang: 'en' });
    await engine.runTurn({ sessionId: sid, message: 'cancel', lang: 'en' });
    await engine.runTurn({ sessionId: sid, message: 'yes', lang: 'en' }); // parked
    expect((await draftService.get(sid)).status).toBe('parked');
    // re-enter → offer_resume
    let r = await engine.runTurn({ sessionId: sid, message: 'hello again', lang: 'en' });
    expect(r.responseType).toBe('offer_resume');
    // accept
    r = await engine.runTurn({ sessionId: sid, message: 'resume', lang: 'en' });
    expect(r.resumed).toBe(true);
    expect((await draftService.get(sid)).status).toBe('draft');
  });
});
