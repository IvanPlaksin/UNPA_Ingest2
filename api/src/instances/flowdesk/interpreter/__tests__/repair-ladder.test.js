'use strict';

/**
 * F10c tests — repair ladder + counters + full universal actions
 * (ADCC-085/086/096/097/098).
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const reducer = require('../../contracts/draft-sr.reducer');

// ── reducer unit: ladder + counters ─────────────────────────────────────────
describe('F10c: repair ladder + counters (reducer)', () => {
  const t = Date.parse('2026-07-15T00:00:00Z');
  test('ladderStepFor maps counts to rungs against thresholds', () => {
    expect(reducer.ladderStepFor(0, 0)).toBe(0); // TARGETED_REASK
    expect(reducer.ladderStepFor(1, 1)).toBe(1); // REFORMULATE
    expect(reducer.ladderStepFor(2, 2)).toBe(2); // PRESENT_OPTIONS
    expect(reducer.ladderStepFor(3, 3)).toBe(3); // OFFER_SKIP_OR_PARK
    expect(reducer.ladderStepFor(1, 5)).toBe(4); // HUMAN_HANDOFF (session wins)
  });
  test('recordRepair bumps per-slot + session and sets sequence.repairStep', () => {
    let d = reducer.syncTopSequence(reducer.createDraft({ sessionId: 's', serviceId: 'IT-HW-LAP', schemaVersion: 2, now: t }), 'assetType', t);
    const r1 = reducer.recordRepair(d, 'assetType', t);
    expect(r1.perSlot).toBe(1); expect(r1.session).toBe(1); expect(r1.ladder).toBe('REFORMULATE');
    expect(reducer.topSequence(r1.draft).repairStep).toBe(1);
    const r2 = reducer.recordRepair(r1.draft, 'assetType', t);
    expect(r2.perSlot).toBe(2); expect(r2.ladder).toBe('PRESENT_OPTIONS');
  });
  test('resetSlotRepair clears a slot counter but keeps session', () => {
    let d = reducer.createDraft({ sessionId: 's', serviceId: 'IT-HW-LAP', schemaVersion: 2, now: t });
    d = reducer.recordRepair(d, 'x', t).draft;
    d = reducer.resetSlotRepair(d, 'x', t);
    expect(d.repair.perSlot.x).toBeUndefined();
    expect(d.repair.session).toBe(1);
  });
  test('park sets status=parked, clears stack + pendingAction', () => {
    let d = reducer.setPendingAction(reducer.syncTopSequence(reducer.createDraft({ sessionId: 's', serviceId: 'IT-HW-LAP', schemaVersion: 2, now: t }), 'x', t), { type: 'confirm_cancel' }, t);
    d = reducer.park(d, t);
    expect(d.status).toBe('parked');
    expect(d.dialogueStack).toEqual([]);
    expect(d.pendingAction).toBeUndefined();
  });
});

// ── engine integration: single enum-slot service ────────────────────────────
const enumSnap = {
  serviceId: 'IT-XX-COL', version: 1, phases: ['detail'], metadata: { title: 'Colour' },
  slots: [{ slotId: 'color', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }],
};

function makeEnumEngine(extra = {}) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    loadSnapshot: async () => enumSnap, graphWrite: async () => [],
    now: () => Date.parse('2026-07-15T10:00:00Z'), makeRef: (_d, p = 'ESC') => `${p}-9`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' } : {}),
    completion: () => 'Which colour?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-XX-COL', title: 'Colour', schemaRef: { serviceId: 'IT-XX-COL', version: 1 }, score: 0.9, confidence: 'high' }];
  return { engine: createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async () => enumSnap, ...extra }), draftService };
}

async function openColour(engine, sid) {
  const r = await engine.runTurn({ sessionId: sid, message: 'I need a colour' });
  expect(r.askingSlot).toBe('color');
  return r;
}

describe('F10c: repair ladder over an enum slot', () => {
  test('3 failures → options are (re)shown, slot stays empty, no reroute', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 'l1';
    await openColour(engine, sid);
    let r;
    for (let i = 0; i < 3; i++) r = await engine.runTurn({ sessionId: sid, message: 'purple' });
    expect(r.askingSlot).toBe('color');
    expect(r.choices).toEqual(['Red', 'Blue']); // options shown
    expect(r.response).toMatch(/available options|didn't catch/i); // default lang 'en': optionsHint + didntCatch
    const draft = await draftService.get(sid);
    expect(draft.slots.color).toBeUndefined();
    expect(draft.repair.perSlot.color).toBe(3);
  });

  test('session threshold (5) → human handoff is offered, then escalates on yes', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 'l2';
    await openColour(engine, sid);
    let r;
    for (let i = 0; i < 5; i++) r = await engine.runTurn({ sessionId: sid, message: 'purple' });
    expect(r.responseType).toBe('offer_handoff');
    const mid = await draftService.get(sid);
    expect(mid.pendingAction.type).toBe('offer_handoff');
    // accept the handoff → escalation
    r = await engine.runTurn({ sessionId: sid, message: 'yes' });
    expect(r.route).toBe('HANDOFF');
    expect(r.isComplete).toBe(true);
    expect(r.escalationId).toBeTruthy();
  });
});

describe('F10c: universal actions', () => {
  test('skip on a required slot → explanation + park/cancel/provide offer', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 'u1';
    await openColour(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'skip' });
    expect(r.responseType).toBe('explain_then_offer');
    expect(r.choices).toEqual(['provide', 'park', 'cancel']);
    const draft = await draftService.get(sid);
    expect(draft.pendingAction.type).toBe('skip_offer');
  });

  test('skip offer → "park" parks the draft', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 'u1b';
    await openColour(engine, sid);
    await engine.runTurn({ sessionId: sid, message: 'skip' });
    const r = await engine.runTurn({ sessionId: sid, message: 'park' });
    expect(r.parked).toBe(true);
    expect((await draftService.get(sid)).status).toBe('parked');
  });

  test('capabilities lists the available services, then bridges back', async () => {
    const listServices = async () => [{ title: 'Laptop provisioning' }, { title: 'Access badge' }];
    const { engine } = makeEnumEngine({ listServices });
    const sid = 'u2';
    await openColour(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'what can you do?' });
    expect(r.response).toMatch(/Laptop provisioning/);
    expect(r.response).toMatch(/Access badge/);
    expect(r.askingSlot).toBe('color'); // bridged back to the pending question
  });

  test('repeat re-issues the last question verbatim', async () => {
    const { engine } = makeEnumEngine();
    const sid = 'u3';
    const first = await openColour(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'please repeat' });
    expect(r.universalAction).toBe('repeat');
    expect(r.response).toBe(first.response);
  });

  test('cancel → confirm → yes parks the draft (ADCC-098)', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 'u4';
    await openColour(engine, sid);
    let r = await engine.runTurn({ sessionId: sid, message: 'cancel' });
    expect(r.responseType).toBe('confirm_cancel');
    r = await engine.runTurn({ sessionId: sid, message: 'yes' });
    expect(r.parked).toBe(true);
    expect((await draftService.get(sid)).status).toBe('parked');
  });

  test('cancel → confirm → no resumes the flow', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 'u5';
    await openColour(engine, sid);
    await engine.runTurn({ sessionId: sid, message: 'cancel' });
    const r = await engine.runTurn({ sessionId: sid, message: 'no' });
    expect(r.askingSlot).toBe('color'); // back to the question
    expect((await draftService.get(sid)).status).toBe('draft');
  });
});
