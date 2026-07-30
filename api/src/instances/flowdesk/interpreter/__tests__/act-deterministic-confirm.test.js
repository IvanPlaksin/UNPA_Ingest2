'use strict';

/**
 * P9-002 — the submit gate is resolved DETERMINISTICALLY (affirm/negate matchers),
 * NOT by the LLM router. Governance actions must never depend on LLM classification.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const snapshotFor = (serviceId) => ({
  serviceId, version: 1, phases: ['detail'],
  metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }],
});

function makeHarness() {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async (sid) => snapshotFor(sid), graphWrite: async () => [],
    now: () => Date.parse('2026-07-21T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const seen = { routerCalled: false };
  const llm = new MockLLMProvider({
    structured: (_p, schema) => { if (schema.properties && schema.properties.route) { seen.routerCalled = true; return { route: 'CONFIRM_YES' }; } return {}; },
    completion: () => 'ok',
  });
  const engine = createEngine({ injectContext: false, llm, resolveSearch: async () => [], draftService, loadSnapshot: async (sid) => snapshotFor(sid) });
  return { engine, draftService, seen };
}

/** Drive a fresh draft to the submit gate (arms pendingAction:'confirm_submit'). */
async function armGate(h, sessionId) {
  await h.draftService.create(sessionId, 'SVC', 1, { mode: 'self', userId: 'u1' });
  await h.draftService.patch(sessionId, [{ op: 'set', slotId: 'subject', value: 'New laptop', provenance: 'user_edited' }]);
  // reach advance() → submit gate via a SLOT_FILL-less turn is complex; set the gate directly.
  await h.draftService.setPendingAction(sessionId, { type: 'confirm_submit' });
}

describe('P9-002 deterministic submit gate', () => {
  test('"yes" submits WITHOUT consulting the LLM router', async () => {
    const h = makeHarness();
    await armGate(h, 'g1');
    const r = await h.engine.runTurn({ sessionId: 'g1', message: 'yes' });
    expect(r.route).toBe('CONFIRM_YES');
    expect(r.srNumber).toBe('SR-1');
    expect(r.isComplete).toBe(true);
    expect(h.seen.routerCalled).toBe(false); // deterministic, no LLM
  });

  test('"no" cancels the submission (kept as draft), router not consulted', async () => {
    const h = makeHarness();
    await armGate(h, 'g2');
    const r = await h.engine.runTurn({ sessionId: 'g2', message: 'no' });
    expect(r.route).toBe('confirm_submit');
    expect(r.isComplete).toBe(false);
    expect(r.srNumber).toBeUndefined();
    expect(h.seen.routerCalled).toBe(false);
    const draft = await h.draftService.get('g2');
    expect(draft.status).toBe('draft');       // not submitted
    expect(draft.pendingAction).toBeFalsy();   // gate cleared
  });

  test('an unclear reply clears the gate and falls through to the router', async () => {
    const h = makeHarness();
    await armGate(h, 'g3');
    await h.engine.runTurn({ sessionId: 'g3', message: 'what do you mean?' });
    expect(h.seen.routerCalled).toBe(true);    // gate cleared → normal routing
    const draft = await h.draftService.get('g3');
    expect(draft.pendingAction).toBeFalsy();
  });
});
