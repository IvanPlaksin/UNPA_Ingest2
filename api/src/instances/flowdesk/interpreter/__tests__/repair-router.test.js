'use strict';

/**
 * F10b tests — DialogueStack + REPAIR_ROUTER (ADCC-080/081/082/096).
 *
 * Core acceptance (Ivan's bug): with the approverComment question open,
 * "I need a big screen" is accepted as the answer to that freetext slot and is
 * NOT re-routed to a new intent — even when the LLM router would misclassify it.
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../interpreter-engine');
const { interpret, tryAcceptAsAnswer, fuzzyMatchOption } = require('../repair-router');
const { detectUniversalAction, detectRepairMarker, isMetaMarker } = require('../templates/dialogue-markers');
const reducer = require('../../contracts/draft-sr.reducer');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const directory = require('../../services/directory');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

// ── unit: meta-marker dictionary (6 languages, deterministic) ────────────────
describe('F10b: universal-action + repair-marker detection', () => {
  test('cancel detected across languages', () => {
    for (const m of ['cancel', 'отмена', 'annuler', 'cancelar', 'إلغاء', '取消']) {
      expect(detectUniversalAction(m)).toBe('cancel');
    }
  });
  test('the six actions map to their ids', () => {
    expect(detectUniversalAction('please repeat that')).toBe('repeat');
    expect(detectUniversalAction("I don't understand")).toBe('rephrase');
    expect(detectUniversalAction('skip this')).toBe('skip');
    expect(detectUniversalAction('what can you do?')).toBe('capabilities');
    expect(detectUniversalAction('start over')).toBe('restart');
  });
  test('a plain answer is not a meta-marker', () => {
    expect(detectUniversalAction('I need a big screen')).toBeNull();
    expect(detectRepairMarker('I need a big screen')).toBe(false);
    expect(isMetaMarker('I need a big screen')).toBe(false);
  });
  test('correction markers are detected', () => {
    expect(detectRepairMarker('actually, make it two')).toBe(true);
    expect(detectRepairMarker('на самом деле нет')).toBe(true);
  });
  test('Cyrillic "да" is not swallowed as a universal action', () => {
    expect(detectUniversalAction('да')).toBeNull();
  });
});

// ── unit: answer-first acceptance by slot type (ADCC-082) ────────────────────
describe('F10b: tryAcceptAsAnswer by slot type', () => {
  const textSlot = { slotId: 'approverComment', type: 'text' };
  const enumSlot = hardware.slots.find((s) => s.slotId === 'assetType');
  const userSlot = { slotId: 'beneficiary', type: 'user' };

  test('freetext accepts any non-meta utterance verbatim', () => {
    expect(tryAcceptAsAnswer('I need a big screen', textSlot)).toEqual({ accepted: true, value: 'I need a big screen' });
  });
  test('freetext rejects a meta-marker (so cancel is not stored as text)', () => {
    expect(tryAcceptAsAnswer('cancel', textSlot).accepted).toBe(false);
  });
  test('enum fuzzy-matches an option, rejects a miss', () => {
    expect(tryAcceptAsAnswer('monitor', enumSlot)).toEqual({ accepted: true, value: 'monitor' });
    expect(tryAcceptAsAnswer('a flying car', enumSlot)).toMatchObject({ accepted: false, reason: 'no_match' });
  });
  test('typed slot defers to the extraction fill-loop (never re-routes)', () => {
    expect(tryAcceptAsAnswer('Maria Ivanova', userSlot)).toMatchObject({ accepted: false, defer: true });
  });
  test('fuzzyMatchOption matches value tokens and labels', () => {
    expect(fuzzyMatchOption('standard laptop', enumSlot.presentOptions).value).toBe('laptop_standard');
    expect(fuzzyMatchOption('Desktop workstation', enumSlot.presentOptions).value).toBe('desktop');
  });
});

// ── unit: interpret() priority order over an open sequence (ADCC-081) ─────────
describe('F10b: interpret() priority order', () => {
  const openOn = (slotId, slots = {}) => ({ dialogueStack: [{ sequenceId: `seq-${slotId}`, type: 'slot_question', slotId, openedAt: 't', insertionDepth: 0, repairCount: 0 }], slots });

  test('no open sequence → FALLTHROUGH', () => {
    expect(interpret({ message: 'hi', draft: { dialogueStack: [], slots: {} }, snapshot: hardware }).kind).toBe('FALLTHROUGH');
  });
  test('universal action outranks answer acceptance on a freetext slot', () => {
    const d = interpret({ message: 'cancel', draft: openOn('approverComment'), snapshot: hardware });
    expect(d).toMatchObject({ kind: 'UNIVERSAL_ACTION', action: 'cancel', slotId: 'approverComment' });
  });
  test('freetext answer accepted (the "big screen" case)', () => {
    const d = interpret({ message: 'I need a big screen', draft: openOn('approverComment'), snapshot: hardware });
    expect(d).toMatchObject({ kind: 'ANSWER', slotId: 'approverComment', value: 'I need a big screen' });
  });
  test('enum miss → ANSWER_REJECT (repair, not reroute)', () => {
    const d = interpret({ message: 'a flying car', draft: openOn('assetType'), snapshot: hardware });
    expect(d).toMatchObject({ kind: 'ANSWER_REJECT', slotId: 'assetType' });
  });
  test('pending/typed directory slot falls through to the LLM router', () => {
    // A typed slot keeps the router's ANSWER-vs-INSERTION distinction (ADCC-083).
    const d = interpret({ message: 'yes', draft: openOn('beneficiary', { beneficiary: { value: { userId: 'U002' }, pending: true } }), snapshot: hardware });
    expect(d.kind).toBe('FALLTHROUGH');
  });
  test('typed slot answer also falls through (fill-loop extracts, no reroute risk deterministically)', () => {
    const d = interpret({ message: 'Maria Ivanova', draft: openOn('beneficiary'), snapshot: hardware });
    expect(d.kind).toBe('FALLTHROUGH');
  });
});

// ── unit: reducer DialogueStack ops ──────────────────────────────────────────
describe('F10b: reducer stack ops', () => {
  const t = Date.parse('2026-07-15T00:00:00Z');
  test('createDraft starts with an empty stack', () => {
    const d = reducer.createDraft({ sessionId: 's', serviceId: 'IT-HW-LAP', schemaVersion: 2, now: t });
    expect(d.dialogueStack).toEqual([]);
  });
  test('syncTopSequence pushes, is idempotent, and replaces on a new slot', () => {
    let d = reducer.createDraft({ sessionId: 's', serviceId: 'IT-HW-LAP', schemaVersion: 2, now: t });
    d = reducer.syncTopSequence(d, 'author', t);
    expect(reducer.topSequence(d).slotId).toBe('author');
    const same = reducer.syncTopSequence(d, 'author', t);
    expect(same).toBe(d); // idempotent no-op
    d = reducer.syncTopSequence(d, 'beneficiary', t);
    expect(d.dialogueStack).toHaveLength(1);
    expect(reducer.topSequence(d).slotId).toBe('beneficiary');
  });
  test('bumpRepair increments the top counter; closeSequence pops', () => {
    let d = reducer.syncTopSequence(reducer.createDraft({ sessionId: 's', serviceId: 'IT-HW-LAP', schemaVersion: 2, now: t }), 'assetType', t);
    const r = reducer.bumpRepair(d, t);
    expect(r.count).toBe(1);
    d = reducer.closeSequence(r.draft, t);
    expect(d.dialogueStack).toEqual([]);
  });
});

// ── integration: full engine (real DraftSR service + directory) ──────────────
function extractFor(message) {
  const m = message.toLowerCase();
  const out = {};
  if (/ноутбук|laptop/.test(m)) out.assetType = 'laptop_standard';
  if (/иванов/.test(m)) out.beneficiary = 'Иванова';
  if (/онбординг|обоснован|justif/.test(m)) out.justification = message;
  return out;
}

function makeEngine({ routerRoute } = {}) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async () => hardware, graphWrite: async () => [],
    now: () => Date.parse('2026-07-15T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      // routerRoute lets a test FORCE a misclassification to prove REPAIR_ROUTER
      // intercepts before the router is consulted.
      ? { route: routerRoute || (/Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT') }
      : extractFor((prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '')),
    completion: () => 'Один вопрос?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { serviceId: 'IT-HW-LAP', version: 2 }, score: 0.9, confidence: 'high' }];
  return { engine: createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async () => hardware, directory }), draftService };
}

// Drive the ratified flow to the open approverComment question.
async function driveToApproverComment(engine, sid) {
  const confirm = (r) => engine.runTurn({ sessionId: sid, choice: { slotId: r.askingSlot, action: 'confirm', value: r.resolveChoices.default } });
  let r = await engine.runTurn({ sessionId: sid, message: 'нужен ноутбук для Иванова', lang: 'en' }); // → beneficiary
  r = await confirm(r); // → location
  r = await confirm(r); // → justification
  r = await engine.runTurn({ sessionId: sid, message: 'justification: onboarding', lang: 'en' }); // → approver
  r = await confirm(r); // → approverComment
  return r;
}

describe('F10b Test #1: answer-first on the open freetext question', () => {
  test('"I need a big screen" fills approverComment and does NOT re-route', async () => {
    // Force the router to ALWAYS say NEW_INTENT — the exact misclassification
    // that caused the original bug. REPAIR_ROUTER must intercept it.
    const { engine, draftService } = makeEngine({ routerRoute: 'NEW_INTENT' });
    const sid = 't1';
    let r = await driveToApproverComment(engine, sid);
    expect(r.askingSlot).toBe('approverComment');

    r = await engine.runTurn({ sessionId: sid, message: 'I need a big screen', lang: 'en' });
    const draft = await draftService.get(sid);
    expect(draft.slots.approverComment.value).toBe('I need a big screen');
    expect(r.route).not.toBe('NEW_INTENT');
    expect(r.response).toMatch(/review/i); // reached the submit-confirm, not a new intent
  });
});

describe('F10b Test #3: cancel over an open question', () => {
  test('"cancel" → confirm-exit (draft kept), not a re-route', async () => {
    const { engine, draftService } = makeEngine({ routerRoute: 'NEW_INTENT' });
    const sid = 't3';
    await driveToApproverComment(engine, sid);
    const r = await engine.runTurn({ sessionId: sid, message: 'cancel', lang: 'en' });
    expect(r.responseType).toBe('confirm_cancel');
    expect(r.universalAction).toBe('cancel');
    const draft = await draftService.get(sid);
    expect(draft.status).toBe('draft'); // draft preserved
    expect(draft.slots.approverComment).toBeUndefined(); // not overwritten by "cancel"
  });
});

describe('F10b Test #2: enum repair (reformulate, never reroute)', () => {
  const enumSnap = {
    serviceId: 'IT-XX-COL', version: 1, phases: ['detail'], metadata: { title: 'Colour' },
    slots: [{ slotId: 'color', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }],
  };
  function makeEnumEngine() {
    const store = new Map();
    const draftService = createDraftSRService({
      store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
      loadSnapshot: async () => enumSnap, graphWrite: async () => [],
      now: () => Date.parse('2026-07-15T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
    });
    const llm = new MockLLMProvider({
      structured: (prompt, schema) => (schema.properties?.route ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' } : {}),
      completion: () => 'Which colour?',
    });
    const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-XX-COL', title: 'Colour', schemaRef: { serviceId: 'IT-XX-COL', version: 1 }, score: 0.9, confidence: 'high' }];
    return { engine: createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async () => enumSnap }), draftService };
  }

  test('invalid enum answer → repair (re-ask), slot stays empty, no reroute', async () => {
    const { engine, draftService } = makeEnumEngine();
    const sid = 't2';
    let r = await engine.runTurn({ sessionId: sid, message: 'I need a colour' });
    expect(r.askingSlot).toBe('color');
    r = await engine.runTurn({ sessionId: sid, message: 'purple' });
    expect(r.askingSlot).toBe('color'); // re-asked, not rerouted
    expect(r.choices).toEqual(['Red', 'Blue']);
    const draft = await draftService.get(sid);
    expect(draft.slots.color).toBeUndefined();
  });
});
