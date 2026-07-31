'use strict';

/**
 * P9-007 — governed approve/reject: ACT gate, target resolution (by number / queue),
 * deterministic confirm (draft-less), reject-reason collection, execution + audit,
 * error mapping, i18n.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const snapshotFor = (serviceId) => ({
  serviceId, version: 1, phases: ['detail'],
  metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }],
});

function approvalFake({ pending = [], onDecision } = {}) {
  return {
    getPendingAuthorizations: jest.fn(async () => pending),
    findByTicket: jest.fn(async (n) => pending.find((p) => String(p.ticketNumber).toUpperCase() === String(n).toUpperCase()) || null),
    submitDecision: jest.fn(async (id, decision, justification) => {
      if (onDecision) return onDecision(id, decision, justification);
      return { ok: true, authorizationId: id, decision: decision === 'reject' ? 'Denied' : 'Approved' };
    }),
  };
}

function makeEngine({ routeFor, approvalService, actOk = true, logAction } = {}) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async (sid) => snapshotFor(sid), graphWrite: async () => [],
    now: () => Date.parse('2026-07-22T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties && schema.properties.route ? { route: routeFor ? routeFor(prompt) : 'INFO_QUESTION' } : {}),
    completion: () => 'ok',
  });
  return createEngine({
    // The Altiora tools adapter, faked. Un-injected it defaults to the REAL one, and
    // the "unrelated control click" test below clicks __catalog_browse__ — which then
    // makes a live catalogue call from a suite that has faked everything else. Alone
    // that cost 375ms against 1-3ms for every other test here; in a parallel run it
    // blew the 5s timeout and read like an ACT-gate regression. Same defect class as
    // the arena runner's promptLoader.
    tools: {
      browseCatalog: async () => [],
      searchArticles: async () => [],
      searchCatalog: async () => [],
    },
    injectContext: false, llm, resolveSearch: async () => [], draftService,
    loadSnapshot: async (sid) => snapshotFor(sid),
    approvalService,
    checkAct: () => (actOk ? { ok: true } : { ok: false, code: 'NOT_ENABLED' }),
    actingContext: { getActingUser: () => ({ userId: 'u1' }), getActingToken: () => 'tok' },
    logAction: logAction || (async () => {}),
  });
}
const routeConst = (r) => () => r;

describe('approve', () => {
  test('approve by number → confirm armed, then "yes" executes + audits EXECUTED', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450', title: 'VPN' }] });
    const logAction = jest.fn(async () => {});
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc, logAction });
    const r1 = await engine.runTurn({ sessionId: 'a1', message: 'approve SR-450', lang: 'en' });
    expect(svc.findByTicket).toHaveBeenCalledWith('SR-450');
    expect(r1.responseType).toBe('confirm_act');
    expect(r1.response).toContain('Approve request SR-450');
    expect(svc.submitDecision).not.toHaveBeenCalled(); // not yet — awaiting confirm
    const r2 = await engine.runTurn({ sessionId: 'a1', message: 'yes', lang: 'en' });
    expect(svc.submitDecision).toHaveBeenCalledWith(7, 'approve', null);
    expect(r2.isComplete).toBe(true);
    expect(r2.response).toContain('approved SR-450');
    const statuses = logAction.mock.calls.map((c) => c[0].status);
    expect(statuses).toContain('EXECUTED');
    expect(logAction.mock.calls.some((c) => c[0].actionType === 'APPROVE_ITEM')).toBe(true);
  });

  test('"no" at the confirm cancels — no decision posted', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450', title: 'VPN' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    await engine.runTurn({ sessionId: 'a2', message: 'approve SR-450', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'a2', message: 'no', lang: 'en' });
    expect(svc.submitDecision).not.toHaveBeenCalled();
    expect(r.response).toMatch(/haven.t recorded/i);
  });
});

describe('reject', () => {
  test('reject without a reason → prompt, then reason → confirm → execute Denied', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 9, ticketNumber: 'SR-770', title: 'Laptop' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_REJECT'), approvalService: svc });
    const r1 = await engine.runTurn({ sessionId: 'r1', message: 'reject SR-770', lang: 'en' });
    expect(r1.response).toMatch(/why are you rejecting/i);
    expect(svc.submitDecision).not.toHaveBeenCalled();
    const r2 = await engine.runTurn({ sessionId: 'r1', message: 'duplicate request', lang: 'en' });
    expect(r2.responseType).toBe('confirm_act');
    expect(r2.response).toContain('duplicate request');
    const r3 = await engine.runTurn({ sessionId: 'r1', message: 'yes', lang: 'en' });
    expect(svc.submitDecision).toHaveBeenCalledWith(9, 'reject', 'duplicate request');
    expect(r3.isComplete).toBe(true);
  });

  test('reject with an inline reason → straight to confirm', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 9, ticketNumber: 'SR-770', title: 'Laptop' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_REJECT'), approvalService: svc });
    const r = await engine.runTurn({ sessionId: 'r2', message: 'reject SR-770 because no budget', lang: 'en' });
    expect(r.responseType).toBe('confirm_act');
    expect(r.response).toContain('no budget');
    await engine.runTurn({ sessionId: 'r2', message: 'yes', lang: 'en' });
    expect(svc.submitDecision).toHaveBeenCalledWith(9, 'reject', 'no budget');
  });

  test('"cancel" while collecting the reason aborts', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 9, ticketNumber: 'SR-770' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_REJECT'), approvalService: svc });
    await engine.runTurn({ sessionId: 'r3', message: 'reject SR-770', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'r3', message: 'cancel', lang: 'en' });
    expect(svc.submitDecision).not.toHaveBeenCalled();
    expect(r.response).toMatch(/haven.t recorded/i);
  });
});

describe('gate + queue + errors', () => {
  test('ACT not enabled → not-authorized message + DENIED audit, no queue hit', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450' }] });
    const logAction = jest.fn(async () => {});
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc, actOk: false, logAction });
    const r = await engine.runTurn({ sessionId: 'g1', message: 'approve SR-450', lang: 'en' });
    expect(svc.findByTicket).not.toHaveBeenCalled();
    expect(r.response).toMatch(/can.t submit that on your behalf|not enabled/i);
    expect(logAction.mock.calls.some((c) => c[0].status === 'DENIED')).toBe(true);
  });

  test('no target + queue present → list, then "approve the first" resolves it', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 3, ticketNumber: 'SR-111', title: 'A' }, { authorizationId: 4, ticketNumber: 'SR-222', title: 'B' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    const r1 = await engine.runTurn({ sessionId: 'q1', message: 'approve my pending items', lang: 'en' });
    expect(r1.responseType).toBe('approval_queue');
    expect(r1.authorizations).toHaveLength(2);
    const r2 = await engine.runTurn({ sessionId: 'q1', message: 'approve the first one', lang: 'en' });
    expect(r2.responseType).toBe('confirm_act');
    await engine.runTurn({ sessionId: 'q1', message: 'yes', lang: 'en' });
    expect(svc.submitDecision).toHaveBeenCalledWith(3, 'approve', null);
  });

  test('empty queue → friendly none', async () => {
    const svc = approvalFake({ pending: [] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    const r = await engine.runTurn({ sessionId: 'q2', message: 'approve my pending items', lang: 'en' });
    expect(r.response).toMatch(/no items waiting/i);
  });

  test('NOT_APPROVER at execution → friendly message + DENIED audit', async () => {
    const svc = approvalFake({
      pending: [{ authorizationId: 7, ticketNumber: 'SR-450', title: 'VPN' }],
      onDecision: () => { const e = new Error('nope'); e.code = 'NOT_APPROVER'; throw e; },
    });
    const logAction = jest.fn(async () => {});
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc, logAction });
    await engine.runTurn({ sessionId: 'e1', message: 'approve SR-450', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'e1', message: 'yes', lang: 'en' });
    expect(r.response).toMatch(/not listed as the approver/i);
    expect(logAction.mock.calls.some((c) => c[0].status === 'DENIED')).toBe(true);
  });
});

describe('P9-010 confirm CONTROL click (text UI parity)', () => {
  test('clicking the confirm control executes the approval', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450', title: 'VPN' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    await engine.runTurn({ sessionId: 'c1', message: 'approve SR-450', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'c1', controlAction: { slotId: '__act_confirm__', action: 'confirm' }, lang: 'en' });
    expect(svc.submitDecision).toHaveBeenCalledWith(7, 'approve', null);
    expect(r.isComplete).toBe(true);
  });

  test('clicking cancel on the control aborts', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    await engine.runTurn({ sessionId: 'c2', message: 'approve SR-450', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'c2', controlAction: { slotId: '__act_confirm__', action: 'cancel' }, lang: 'en' });
    expect(svc.submitDecision).not.toHaveBeenCalled();
    expect(r.response).toMatch(/haven.t recorded/i);
  });

  test('a NON-act controlAction does not touch the ACT gate', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    await engine.runTurn({ sessionId: 'c3', message: 'approve SR-450', lang: 'en' });
    // an unrelated control click (no draft) should NOT resolve/clear the ACT gate
    await engine.runTurn({ sessionId: 'c3', controlAction: { slotId: '__catalog_browse__', value: 'x' }, lang: 'en' }).catch(() => {});
    // the gate survives → a subsequent "yes" still executes
    await engine.runTurn({ sessionId: 'c3', message: 'yes', lang: 'en' });
    expect(svc.submitDecision).toHaveBeenCalledWith(7, 'approve', null);
  });
});

describe('i18n', () => {
  test('approve confirm is localized (ru)', async () => {
    const svc = approvalFake({ pending: [{ authorizationId: 7, ticketNumber: 'SR-450', title: 'VPN' }] });
    const engine = makeEngine({ routeFor: routeConst('ACT_APPROVE'), approvalService: svc });
    const r = await engine.runTurn({ sessionId: 'i1', message: 'approve SR-450', lang: 'ru' });
    expect(r.response).toMatch(/Одобрить заявку SR-450/);
  });
});
