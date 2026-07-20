'use strict';

/**
 * F9.1d test — confirm-or-choose for directory-backed slots (beneficiary/location).
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');
const directory = require('../../services/directory');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));
const loadSnapshot = async () => hardware;

// Extraction returns STRING hints for resolver slots.
function extractFor(m) {
  const out = {};
  const s = m.toLowerCase();
  if (/ноутбук|laptop/.test(s)) out.assetType = 'laptop_standard';
  if (/иванов/.test(s)) out.beneficiary = 'Иванова';
  if (/петров/.test(s)) out.beneficiary = 'Петров';
  if (/онбординг|обоснован/.test(s)) out.justification = m;
  if (/бюджет|одобр/.test(s)) out.approverComment = m;
  return out;
}

function makeEngine() {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot, graphWrite: async () => [],
    now: () => Date.parse('2026-07-14T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route
      ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' }
      : extractFor((prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '')),
    completion: () => 'Вопрос?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { serviceId: 'IT-HW-LAP', version: 1 }, score: 0.9, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot, directory });
}

// F9.3a: when the user names another beneficiary, the author is set silently to
// the current user, so turn 1 goes STRAIGHT to the beneficiary confirm (no author
// question).
async function toBeneficiary(engine, sid, msg) {
  return engine.runTurn({ sessionId: sid, message: msg });
}

describe('F9.3a: author auto-confirm when beneficiary named', () => {
  test('"для Иванова" → does NOT ask author, goes straight to beneficiary', async () => {
    const engine = makeEngine();
    const r = await engine.runTurn({ sessionId: 'a1', message: 'нужен ноутбук для Иванова' });
    expect(r.askingSlot).toBe('beneficiary'); // NOT author
    expect(r.resolveChoices.default.userId).toBe('U002');
    // author was silently set to the current user (context provenance)
    expect(r.draft.slots.author.value.userId).toBe('U001');
    expect(r.draft.slots.author.provenance).toBe('context');
  });
});

describe('F9.3b: echo preamble', () => {
  test('acknowledges extracted item + beneficiary (ru default)', async () => {
    const engine = makeEngine();
    const r = await engine.runTurn({ sessionId: 'e1', message: 'нужен ноутбук для Иванова' });
    expect(r.preamble).toBeTruthy();
    expect(r.preamble).toMatch(/ноутбук/);
    expect(r.preamble).toMatch(/Иванова/);
  });

  test('English preamble when lang=en', async () => {
    const engine = makeEngine();
    const r = await engine.runTurn({ sessionId: 'e2', message: 'нужен ноутбук для Иванова', lang: 'en' });
    expect(r.preamble).toMatch(/Got it/);
    expect(r.preamble).toMatch(/laptop/);
  });

  test('no extraction → no preamble', async () => {
    const engine = makeEngine();
    // a bare confirm turn extracts nothing
    await engine.runTurn({ sessionId: 'e3', message: 'нужен ноутбук для Иванова' });
    const r = await engine.runTurn({ sessionId: 'e3', choice: { slotId: 'beneficiary', action: 'confirm', value: { userId: 'U002', name: 'Maria Ivanova', location: { code: 'GVA', name: 'Geneva' } } } });
    expect(r.preamble == null).toBe(true);
  });
});

describe('F9.1d+F9.2: beneficiary confirm-or-choose (author asked first)', () => {
  test('name mention → beneficiary resolves to directory default', async () => {
    const engine = makeEngine();
    const r = await toBeneficiary(engine, 'd1', 'нужен ноутбук для Иванова');
    expect(r.responseType).toBe('confirm_or_choose');
    expect(r.askingSlot).toBe('beneficiary');
    expect(r.resolveChoices.default.userId).toBe('U002');
    expect(r.resolveChoices.allowSearch).toBe(true);
    expect(r.response).toMatch(/Ivanova/i);
  });

  test('choice confirm → beneficiary set, advances to location confirm', async () => {
    const engine = makeEngine();
    let r = await toBeneficiary(engine, 'd2', 'ноутбук для Иванова');
    r = await engine.runTurn({ sessionId: 'd2', choice: { slotId: 'beneficiary', action: 'confirm', value: r.resolveChoices.default } });
    expect(r.responseType).toBe('confirm_or_choose');
    expect(r.askingSlot).toBe('location');
    expect(r.resolveChoices.default.code).toBe('GVA');
    expect(r.resolveChoices.alternatives).toHaveLength(10);
  });

  test('choice select → picks an alternative user', async () => {
    const engine = makeEngine();
    await toBeneficiary(engine, 'd3', 'ноутбук для Иванова');
    const picked = { userId: 'U003', name: 'Ahmed Hassan', location: { code: 'NBO', name: 'Nairobi' } };
    const r = await engine.runTurn({ sessionId: 'd3', choice: { slotId: 'beneficiary', action: 'select', value: picked } });
    expect(r.askingSlot).toBe('location');
    expect(r.resolveChoices.default.code).toBe('NBO');
  });

  test('choice search → re-resolves with a new query', async () => {
    const engine = makeEngine();
    await toBeneficiary(engine, 'd4', 'ноутбук для Иванова');
    const r = await engine.runTurn({ sessionId: 'd4', choice: { slotId: 'beneficiary', action: 'search', value: 'Петров' } });
    expect(r.responseType).toBe('confirm_or_choose');
    expect(r.askingSlot).toBe('beneficiary');
    expect(r.resolveChoices.default.userId).toBe('U001'); // Petrov
  });

  test('text fallback: "да" confirms the pending beneficiary', async () => {
    const engine = makeEngine();
    await toBeneficiary(engine, 'd5', 'ноутбук для Иванова');
    const r = await engine.runTurn({ sessionId: 'd5', message: 'да' });
    expect(r.askingSlot).toBe('location');
    expect(r.resolveChoices.default.code).toBe('GVA');
  });
});
