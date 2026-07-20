'use strict';

/**
 * C4 test — interpreter graph + engine (e2e).
 *
 * Topology verification (C4.1) + five dialogue scenarios (C4.5) driven by a
 * scripted MockLLMProvider and an in-memory DraftSR service. State lives only in
 * the DraftSR; each turn is a full re-execution.
 */

const fs = require('fs');
const path = require('path');
const { verifyLinear, EDGES } = require('../interpreter-graph');
const { createEngine, activeRequiredSlots } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const FX = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', `schema-snapshot.${name}.json`), 'utf8'));
const SNAP = { 'IT-HW-LAP': FX('hardware'), 'SEC-ACC-BADGE': FX('badge'), 'FAC-WS-DESK': FX('workspace') };
const loadSnapshot = async (serviceId) => SNAP[serviceId] || null;

// ── scripted mock provider ──────────────────────────────────────────────────
function msgFromRouter(prompt) { return (prompt.match(/Message: "([^"]*)"/) || [])[1] || ''; }
function msgFromExtract(prompt) { return (prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || ''; }

function routeFor(prompt) {
  const m = msgFromRouter(prompt).toLowerCase();
  const hasDraft = /Has active draft: true/.test(prompt);
  const allFilled = /All required slots filled: true/.test(prompt);
  if (/weather|football|joke/.test(m)) return 'OUT_OF_SCOPE';
  if (/available|how do i|what can i/.test(m)) return 'INFO_QUESTION';
  if (allFilled && /^(yes|yep|confirm|submit|go ahead|ok)\b/.test(m)) return 'CONFIRM_YES';
  if (allFilled) return 'CONFIRM_EDIT';
  if (!hasDraft) return 'NEW_INTENT';
  return 'SLOT_FILL';
}

function extractFor(prompt, schema) {
  const m = msgFromExtract(prompt).toLowerCase();
  const props = schema.properties || {};
  const out = {};
  if (props.beneficiary && /\b(me|myself|self|for me)\b/.test(m)) out.beneficiary = 'myself'; // string hint → directory (self)
  if (props.location && /geneva|nairobi|new york/.test(m)) out.location = 'Geneva';
  if (props.facility && /geneva|hq|building|compound/.test(m)) out.facility = { name: 'HQ' };
  if (props.dutyStation && /geneva|nairobi/.test(m)) out.dutyStation = { name: 'Geneva' };
  if (props.assetType) { if (/engineering/.test(m)) out.assetType = 'laptop_engineering'; else if (/laptop|standard/.test(m)) out.assetType = 'laptop_standard'; }
  if (props.badgeType) { if (/temporary|visitor/.test(m)) out.badgeType = 'temporary'; else if (/permanent/.test(m)) out.badgeType = 'permanent'; else if (/contractor/.test(m)) out.badgeType = 'contractor'; }
  if (props.workspaceType) { if (/private/.test(m)) out.workspaceType = 'private_office'; else if (/dedicated/.test(m)) out.workspaceType = 'dedicated_desk'; else if (/shared|hot/.test(m)) out.workspaceType = 'shared_desk'; }
  if (props.justification && /because|need|onboard|hire|workload/.test(m)) out.justification = m;
  if (props.approverComment && /approv|budget|manager/.test(m)) out.approverComment = m;
  if (props.validUntil && /(until|december|\d{4}-\d{2}-\d{2})/.test(m)) out.validUntil = '2026-12-31';
  if (props.startDate && /(start|monday|\d{4}-\d{2}-\d{2})/.test(m)) out.startDate = '2026-08-01';
  return out;
}

function makeProvider() {
  return new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties && schema.properties.route ? { route: routeFor(prompt) } : extractFor(prompt, schema)),
    completion: (prompt) => (/Answer the user's question/.test(prompt) ? 'Here is what I found for you.' : 'Could you provide the next detail?'),
    embedding: () => [0, 0, 0],
  });
}

// ── in-memory DraftSR service ───────────────────────────────────────────────
function makeStore() {
  const map = new Map();
  return {
    async get(k) { const v = map.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async set(k, v) { map.set(k, JSON.parse(JSON.stringify(v))); return true; },
  };
}
let _n = 700000;
function makeEngine(resolveSearch) {
  const draftService = createDraftSRService({
    store: makeStore(),
    loadSnapshot,
    graphWrite: async () => [],           // no Memgraph in e2e
    now: () => Date.parse('2026-07-14T10:00:00Z'),
    makeRef: (_d, p = 'SR') => `${p}-${++_n}`,
  });
  return createEngine({ llm: makeProvider(), resolveSearch, draftService, loadSnapshot });
}

const SERVICE_HIT = (serviceId, title) => ({ type: 'SERVICE', serviceId, title, schemaRef: { serviceId, version: 1 }, score: 0.9, confidence: 'high' });
const resolveHardware = async (q) => (/laptop|hardware|device/i.test(q) ? [SERVICE_HIT('IT-HW-LAP', 'Laptop')] : /available|monitor/i.test(q) ? [{ type: 'ARTICLE', articleId: 'KB-1', title: 'Available devices', answerSnippet: 'Standard and engineering laptops.', score: 0.8, confidence: 'medium' }] : []);
const resolveBadge = async (q) => (/badge|access/i.test(q) ? [SERVICE_HIT('SEC-ACC-BADGE', 'Access Badge')] : []);

describe('C4.1: interpreter graph topology', () => {
  test('verifyLinear passes (merge-free acyclic DAG)', () => {
    const r = verifyLinear();
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });
  test('edges reference known nodes and TERM_CHECK/ROUTER branch to endpoints', () => {
    expect(EDGES.some((e) => e.from === 'ROUTER' && e.to === 'RESOLVE')).toBe(true);
    expect(EDGES.some((e) => e.from === 'TERM_CHECK' && e.to === 'CONFIRM')).toBe(true);
  });
});

describe('C4.5: Hardware happy path', () => {
  test('multi-turn fill → confirm → submit → SR', async () => {
    const engine = makeEngine(resolveHardware);
    const sid = 'e2e-hw';

    const confirm = (r) => engine.runTurn({ sessionId: sid, choice: { slotId: r.askingSlot, action: 'confirm', value: r.resolveChoices.default } });

    // Turn 1: laptop for myself → AUTHOR confirm-or-choose (default: current user)
    let r = await engine.runTurn({ sessionId: sid, message: 'I want a laptop for myself' });
    expect(r.route).toBe('NEW_INTENT');
    expect(r.askingSlot).toBe('author');
    expect(r.responseType).toBe('confirm_or_choose');

    // author → beneficiary → location (directory confirm-or-choose, in order)
    r = await confirm(r); expect(r.askingSlot).toBe('beneficiary');
    r = await confirm(r); expect(r.askingSlot).toBe('location');
    r = await confirm(r); expect(r.askingSlot).toBe('justification'); // assetType filled turn 1

    r = await engine.runTurn({ sessionId: sid, message: 'onboarding a new hire' });
    expect(r.askingSlot).toBe('approver'); // resolver:approver = manager of beneficiary

    r = await confirm(r); expect(r.askingSlot).toBe('approverComment');

    r = await engine.runTurn({ sessionId: sid, message: 'budget approved by manager' });
    expect(r.response).toMatch(/Проверьте заявку/i); // all filled → CONFIRM
    expect(r.trace).toContain('CONFIRM');

    r = await engine.runTurn({ sessionId: sid, message: 'yes' });
    expect(r.route).toBe('CONFIRM_YES');
    expect(r.isComplete).toBe(true);
    expect(r.srNumber).toMatch(/^SR-\d+$/);
    expect(r.trace).toContain('SUBMIT');
  });
});

describe('C4.5: Badge conditional (tref activates validUntil)', () => {
  test('temporary badge → validUntil becomes required', async () => {
    const engine = makeEngine(resolveBadge);
    const sid = 'e2e-badge';
    let r = await engine.runTurn({ sessionId: sid, message: 'I need a temporary badge for myself for the HQ building' });
    // after filling beneficiary/facility/badgeType, validUntil should be the remaining required (tref: badgeType != permanent)
    const draftService = null; // read via engine draft
    const badge = SNAP['SEC-ACC-BADGE'];
    const remaining = activeRequiredSlots(r.draft, badge).map((s) => s.slotId);
    expect(remaining).toContain('validUntil');
    expect(r.waiting).toBe(true);
  });

  test('permanent badge → validUntil NOT required', async () => {
    const engine = makeEngine(resolveBadge);
    const sid = 'e2e-badge2';
    const r = await engine.runTurn({ sessionId: sid, message: 'I need a permanent badge for myself for the HQ building' });
    const badge = SNAP['SEC-ACC-BADGE'];
    const remaining = activeRequiredSlots(r.draft, badge).map((s) => s.slotId);
    expect(remaining).not.toContain('validUntil');
  });
});

describe('C4.5: info question mid-flow', () => {
  test('INFO_ANSWER answers and keeps the draft', async () => {
    const engine = makeEngine(resolveHardware);
    const sid = 'e2e-info';
    await engine.runTurn({ sessionId: sid, message: 'I need a laptop' });
    const r = await engine.runTurn({ sessionId: sid, message: 'what laptops are available?' });
    expect(r.route).toBe('INFO_QUESTION');
    expect(r.trace).toContain('INFO_ANSWER');
    expect(r.response).toMatch(/found/i);
    // draft still exists with the earlier assetType
    const after = await engine.runTurn({ sessionId: sid, message: 'for myself in Geneva' });
    expect(after.route).toBe('SLOT_FILL');
  });
});

describe('C4.5: out of scope', () => {
  test('unrelated message → redirect', async () => {
    const engine = makeEngine(resolveHardware);
    const r = await engine.runTurn({ sessionId: 'e2e-oos', message: "what's the weather today?", lang: 'en' });
    expect(r.route).toBe('OUT_OF_SCOPE');
    expect(r.response).toMatch(/service requests/i);
  });
});

describe('C4.5: correction at confirm re-validates', () => {
  test('editing assetType stales dependents and re-asks', async () => {
    const engine = makeEngine(resolveHardware);
    const sid = 'e2e-edit';
    const confirm = (r) => engine.runTurn({ sessionId: sid, choice: { slotId: r.askingSlot, action: 'confirm', value: r.resolveChoices.default } });
    let r = await engine.runTurn({ sessionId: sid, message: 'I want a laptop for myself' });
    r = await confirm(r); // author → beneficiary
    r = await confirm(r); // beneficiary → location
    r = await confirm(r); // location → justification
    await engine.runTurn({ sessionId: sid, message: 'onboarding a new hire' });
    // now at approver — confirm it, then approverComment
    r = await engine.runTurn({ sessionId: sid, choice: { slotId: 'approver', action: 'confirm', value: null } });
    r = await engine.runTurn({ sessionId: sid, message: 'budget approved by manager' });
    expect(r.response).toMatch(/Проверьте заявку/i); // at CONFIRM

    // correction
    r = await engine.runTurn({ sessionId: sid, message: 'actually make it engineering' });
    expect(r.route).toBe('CONFIRM_EDIT');
    // justification depends on assetType → stale → back to a question, not submit
    expect(r.isComplete).not.toBe(true);
    const hw = SNAP['IT-HW-LAP'];
    const remaining = activeRequiredSlots(r.draft, hw).map((s) => s.slotId);
    expect(remaining).toContain('justification');
  });
});
