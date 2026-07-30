'use strict';

/**
 * FLOWDESK_FORM_FILL_GATE — who performs the FINAL fill of a service form, and in
 * particular who resolves AUTOFILL cascade fields:
 *   wizard (default) — Altiora's form does it; the chat neither asks nor prefills them.
 *   agent            — the chat resolves them itself (P1-12), falling back to a manual
 *                      question when the dictionary can't, and carries them into prefill.
 *
 * Also covers the universal Author (Requester) context slot: like the beneficiary it is a
 * user-directory entity common to EVERY Altiora service, but it is never asked — always
 * the current user, resolved silently.
 */

const { createEngine, effectiveSnapshot } = require('../interpreter-engine');
const { draftToInitialFormData } = require('../form-handoff');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const DICT_REF = {
  entityId: 'intg:staff',
  displayFieldIds: ['intg:col-name'],
  filters: [{ fieldId: 'intg:col-index', operator: 'eq', slotId: 'indexNumber' }],
};
const SNAPSHOT = {
  serviceId: 'SVC-CASCADE', version: 1, phases: ['detail'],
  metadata: { title: 'Extension', approvalRequired: false, fieldIdMapping: { indexNumber: 'field_idx', staffMemberFullName: 'field_name', grade: 'field_grade' } },
  slots: [
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', promptHint: 'Index Number' },
    { slotId: 'staffMemberFullName', type: 'string', required: true, phase: 'detail', promptHint: 'Staff Member Full Name', dictRef: DICT_REF, dependsOn: ['indexNumber'] },
    { slotId: 'grade', type: 'string', required: true, phase: 'detail', promptHint: 'Grade', dictRef: { ...DICT_REF, displayFieldIds: ['intg:col-grade'] }, dependsOn: ['indexNumber'] },
  ],
};

const dictOk = async (req) => (req.DisplayFieldIds[0] === 'intg:col-grade'
  ? [{ label: 'P-3', value: 'P-3' }]
  : [{ label: 'Ivanov Ivan', value: 'Ivanov Ivan' }]);

function makeEngine(fetchLovValues) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async () => SNAPSHOT, graphWrite: async () => [],
    now: () => Date.parse('2026-07-24T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' }
      : {}),
    completion: () => 'What is your index number?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC-CASCADE', title: 'Extension', schemaRef: { serviceId: 'SVC-CASCADE', version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot: async () => SNAPSHOT, injectContext: false, fetchLovValues });
}

describe('FLOWDESK_FORM_FILL_GATE', () => {
  const prev = process.env.FLOWDESK_FORM_FILL_GATE;
  afterEach(() => { if (prev === undefined) delete process.env.FLOWDESK_FORM_FILL_GATE; else process.env.FLOWDESK_FORM_FILL_GATE = prev; });

  describe("default (wizard): autofill cascade is the form's job", () => {
    beforeEach(() => { delete process.env.FLOWDESK_FORM_FILL_GATE; });

    test('the chat asks only the filter field, not the autofill dependants', async () => {
      const engine = makeEngine(dictOk);
      await engine.runTurn({ sessionId: 'w1', message: 'extend my appointment' });
      const r = await engine.runTurn({ sessionId: 'w1', message: '12345' });
      expect(r.responseType).not.toBe('cascade_confirm');
      expect(r.askingSlot).not.toBe('staffMemberFullName');
      expect(r.askingSlot).not.toBe('grade');
    });

    test('autofill slots are excluded from the form prefill', () => {
      const draft = { slots: { indexNumber: { value: '12345' }, staffMemberFullName: { value: 'stale' }, grade: { value: 'P-9' } } };
      expect(draftToInitialFormData(draft, SNAPSHOT).dynamicData).toEqual({ field_idx: '12345' });
    });
  });

  describe('agent: the chat resolves autofill cascade itself', () => {
    beforeEach(() => { process.env.FLOWDESK_FORM_FILL_GATE = 'agent'; });

    test('once the filter is filled, the cascade cluster is resolved and offered for review', async () => {
      const engine = makeEngine(dictOk);
      await engine.runTurn({ sessionId: 'a1', message: 'extend my appointment' });
      const r = await engine.runTurn({ sessionId: 'a1', message: '12345' });
      expect(r.responseType).toBe('cascade_confirm');
    });

    test('when the dictionary lookup is unavailable, the field is asked manually in chat', async () => {
      const engine = makeEngine(async () => { throw new Error('Altiora down'); });
      await engine.runTurn({ sessionId: 'a2', message: 'extend my appointment' });
      const r = await engine.runTurn({ sessionId: 'a2', message: '12345' });
      // No silent guess: it degrades to a plain question for the first autofill slot.
      expect(r.responseType).not.toBe('cascade_confirm');
      expect(r.askingSlot).toBe('staffMemberFullName');
    });

    test('chat-resolved autofill values ARE carried into the form prefill', () => {
      const draft = { slots: { indexNumber: { value: '12345' }, staffMemberFullName: { value: 'Ivanov Ivan' }, grade: { value: 'P-3' } } };
      expect(draftToInitialFormData(draft, SNAPSHOT).dynamicData).toEqual({ field_idx: '12345', field_name: 'Ivanov Ivan', field_grade: 'P-3' });
    });
  });
});

describe('Author (Requester) — universal Altiora context slot', () => {
  test('effectiveSnapshot overlays author (+ description) onto an Altiora snapshot', () => {
    const eff = effectiveSnapshot({ serviceId: 'S', phases: ['detail'], metadata: { altioraOusId: 59 }, slots: [{ slotId: 'indexNumber', type: 'string' }] });
    const ids = eff.slots.map((s) => s.slotId);
    expect(ids).toContain('author');
    expect(ids).toContain('beneficiary');
    expect(ids).toContain('description');
    const author = eff.slots.find((s) => s.slotId === 'author');
    expect(author).toMatchObject({ type: 'user', required: false });
  });

  test('a non-Altiora snapshot gets the platform context slots but NOT the author/description overlay', () => {
    const eff = effectiveSnapshot({ serviceId: 'S', phases: ['detail'], metadata: {}, slots: [{ slotId: 'x', type: 'string' }] });
    const ids = eff.slots.map((s) => s.slotId);
    expect(ids).toContain('beneficiary'); // universal platform slots still overlaid
    expect(ids).not.toContain('author');
    expect(ids).not.toContain('description');
  });

  test('a schema that already declares author is left untouched (idempotent overlay)', () => {
    const own = { slotId: 'author', type: 'user', required: true, custom: true };
    const eff = effectiveSnapshot({ serviceId: 'S', phases: ['detail'], metadata: { altioraOusId: 1 }, slots: [own, { slotId: 'x', type: 'string' }] });
    expect(eff.slots.filter((s) => s.slotId === 'author')).toHaveLength(1);
    expect(eff.slots.find((s) => s.slotId === 'author')).toMatchObject({ custom: true });
  });
});

describe('Universal sharedWith + manualApprover context slots', () => {
  test('sharedWith is overlaid on every Altiora snapshot; manualApprover only when approval is needed', () => {
    const noApproval = effectiveSnapshot({ serviceId: 'S', phases: ['detail'], metadata: { altioraOusId: 59, approvalRequired: false }, slots: [{ slotId: 'x', type: 'string' }] });
    const ids1 = noApproval.slots.map((s) => s.slotId);
    expect(ids1).toContain('sharedWith');
    expect(ids1).not.toContain('manualApprover');

    const withApproval = effectiveSnapshot({ serviceId: 'S', phases: ['detail'], metadata: { altioraOusId: 59, approvalRequired: true }, slots: [{ slotId: 'x', type: 'string' }] });
    const ids2 = withApproval.slots.map((s) => s.slotId);
    expect(ids2).toContain('sharedWith');
    expect(ids2).toContain('manualApprover');
    expect(withApproval.slots.find((s) => s.slotId === 'sharedWith')).toMatchObject({ type: 'userlist', required: false });
  });

  test('a non-Altiora snapshot gets neither', () => {
    const eff = effectiveSnapshot({ serviceId: 'S', phases: ['detail'], metadata: { approvalRequired: true }, slots: [{ slotId: 'x', type: 'string' }] });
    const ids = eff.slots.map((s) => s.slotId);
    expect(ids).not.toContain('sharedWith');
    expect(ids).not.toContain('manualApprover');
  });

  test('form-handoff maps manualApprover to the wizard fields (object + id)', () => {
    const appr = { userId: 'M1', name: 'Manager One' };
    const out = draftToInitialFormData({ slots: { manualApprover: { value: appr } } }, { metadata: {} });
    expect(out.manualApprover).toMatchObject({ userId: 'M1', id: 'M1' });
    expect(out.manualApproverUserId).toBe('M1');
  });

  test('form-handoff maps sharedWith to an array of users keyed by id', () => {
    const shared = [{ userId: 'U2', name: 'Maria' }, { userId: 'U3', name: 'Ivan' }];
    const out = draftToInitialFormData({ slots: { sharedWith: { value: shared } } }, { metadata: {} });
    expect(out.sharedWith).toEqual([{ userId: 'U2', id: 'U2', name: 'Maria' }, { userId: 'U3', id: 'U3', name: 'Ivan' }]);
  });

  test('an empty sharedWith is omitted, not sent as a blank array', () => {
    const out = draftToInitialFormData({ slots: { sharedWith: { value: [] } } }, { metadata: {} });
    expect(out.sharedWith).toBeUndefined();
  });
});

// ── engine integration: the sharedWith collection turn ────────────────────────
const ALT_SNAP = {
  serviceId: 'ALT-1', version: 1, phases: ['detail'],
  metadata: { title: 'Test Service', altioraOusId: 59, approvalRequired: false, fieldIdMapping: { note: 'field_note' } },
  slots: [{ slotId: 'note', type: 'string', required: true, phase: 'detail', promptHint: 'Note' }],
};

function mkDirectory() {
  const db = { maria: { userId: 'U2', id: 'U2', name: 'Maria Ivanova' }, 'ivan petrov': { userId: 'U3', id: 'U3', name: 'Ivan Petrov' } };
  return {
    getCurrentUser: async () => ({ userId: 'U1', id: 'U1', name: 'Me', mode: 'self', location: { code: 'GVA', name: 'Geneva' } }),
    resolveUser: async (q) => { const h = db[String(q).toLowerCase().trim()]; return h ? [h] : []; },
    resolveApprover: async () => ({ userId: 'M1', id: 'M1', name: 'Manager One' }),
    listManagers: async () => [{ userId: 'M1', id: 'M1', name: 'Manager One' }],
    listLocations: async () => [{ code: 'GVA', name: 'Geneva' }],
    resolveLocation: async (code) => ({ code, name: 'Geneva' }),
  };
}

function mkAltEngine() {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async () => ALT_SNAP, graphWrite: async () => [],
    now: () => Date.parse('2026-07-24T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' }
      : {}),
    completion: () => 'A question?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'ALT-1', title: 'Test Service', schemaRef: { serviceId: 'ALT-1', version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot: async () => ALT_SNAP, directory: mkDirectory() });
}

// Walk context confirms (beneficiary → location) and the optional description skip until
// the sharedWith share_collect gate is reached.
async function reachShareGate(engine, sid) {
  let r = await engine.runTurn({ sessionId: sid, message: 'raise the test service' });
  const confirm = (rr) => engine.runTurn({ sessionId: sid, choice: { slotId: rr.askingSlot, action: 'confirm', value: rr.resolveChoices.default } });
  // beneficiary (self) → location → the service's own slots → sharedWith LAST.
  // CODE-007 moved sharedWith to the 'closing' phase, so the walk now passes the
  // detail slots before reaching the gate; the guard has to allow for them.
  let guard = 0;
  while (r.askingSlot && r.askingSlot !== 'sharedWith' && r.responseType !== 'share_collect' && guard++ < 24) {
    if (r.responseType === 'share_collect') break;
    if (r.askingSlot === 'description') { r = await engine.runTurn({ sessionId: sid, controlAction: { slotId: '__skip__', value: 'description' } }); continue; }
    if (r.resolveChoices && r.resolveChoices.default !== undefined) { r = await confirm(r); continue; }
    // The service's own REQUIRED slot cannot be skipped — answer it. Before
    // CODE-007 the share gate sat in the opening phase and the walk never got
    // this far; now the form is completed first, which is the point of the fix.
    if (r.askingSlot === 'note') { r = await engine.runTurn({ sessionId: sid, message: 'a note' }); continue; }
    // optional plain slot with a skip control → skip it
    r = await engine.runTurn({ sessionId: sid, controlAction: { slotId: '__skip__', value: r.askingSlot } });
  }
  return r;
}

describe('engine: sharedWith share_collect turn', () => {
  test('asks once, then resolves the named colleagues into an array', async () => {
    const engine = mkAltEngine();
    const gate = await reachShareGate(engine, 's-share-1');
    expect(gate.responseType).toBe('share_collect');
    const after = await engine.runTurn({ sessionId: 's-share-1', message: 'Maria' });
    // sharedWith resolved and stored; the flow has moved on past the gate.
    expect(after.responseType).not.toBe('share_collect');
    expect(after.draft.slots.sharedWith.value).toEqual([{ userId: 'U2', id: 'U2', name: 'Maria Ivanova' }]);
  });

  test('a Skip click leaves sharedWith empty and moves on, clearing the pending gate', async () => {
    const engine = mkAltEngine();
    const gate = await reachShareGate(engine, 's-share-2');
    expect(gate.responseType).toBe('share_collect');
    const after = await engine.runTurn({ sessionId: 's-share-2', controlAction: { slotId: '__skip__', value: 'sharedWith' } });
    expect(after.responseType).not.toBe('share_collect');
    expect(after.draft.slots.sharedWith).toBeUndefined();
    // A subsequent message must NOT be swallowed by a lingering share_collect gate.
    expect(after.draft.pendingAction).toBeFalsy();
  });

  test('an unrecognised name re-asks rather than storing a wrong user', async () => {
    const engine = mkAltEngine();
    await reachShareGate(engine, 's-share-3');
    const after = await engine.runTurn({ sessionId: 's-share-3', message: 'Xavier Stranger' });
    expect(after.responseType).toBe('share_collect');
    expect(after.draft.slots.sharedWith).toBeUndefined();
  });
});
