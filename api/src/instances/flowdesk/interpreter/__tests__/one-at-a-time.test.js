'use strict';

/**
 * F9.1a test — QUESTION_PLANNER asks ONE slot per turn, in ratified order
 * (context → detail; deps respected): beneficiary → location → justification →
 * approverComment-last. Fixes Ivan's "all questions at once" remark.
 */

const fs = require('fs');
const path = require('path');
const { createEngine, chooseNextSlot } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));
const loadSnapshot = async () => hardware;

// Extraction that fills ONLY the slot(s) explicitly present in the message, so
// we can drive the sequence deterministically.
function extractFor(message) {
  const m = message.toLowerCase();
  const out = {};
  if (/ноутбук|laptop/.test(m)) out.assetType = 'laptop_standard';
  if (/иванов/.test(m)) out.beneficiary = 'Иванова'; // string hint for the directory
  if (/онбординг|обоснован|justif/.test(m)) out.justification = message;
  if (/бюджет|одобр|approv/.test(m)) out.approverComment = message;
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
    completion: () => 'Один вопрос?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { serviceId: 'IT-HW-LAP', version: 1 }, score: 0.9, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot });
}

describe('F9.1a: chooseNextSlot ordering', () => {
  test('picks context before detail, respecting deps (author first)', () => {
    const draft = { slots: { assetType: { value: 'laptop_standard' } } }; // detail slot pre-filled
    const remaining = require('../interpreter-engine').activeRequiredSlots(draft, hardware);
    const next = chooseNextSlot(remaining, draft, hardware);
    expect(next.slotId).toBe('author'); // context first, even though a detail slot is filled
  });

  test('author is chosen before its dependents', () => {
    const draft = { slots: {} };
    const remaining = require('../interpreter-engine').activeRequiredSlots(draft, hardware);
    expect(chooseNextSlot(remaining, draft, hardware).slotId).toBe('author');
  });
});

describe('F9.1a+d+F9.2: engine asks one slot per turn in ratified order', () => {
  test('author → beneficiary → location → justification → approver → approverComment → CONFIRM', async () => {
    const engine = makeEngine();
    const sid = 'f91a';
    const confirm = (r) => engine.runTurn({ sessionId: sid, choice: { slotId: r.askingSlot, action: 'confirm', value: r.resolveChoices.default } });

    // Turn 1: → AUTHOR first (default self)
    let r = await engine.runTurn({ sessionId: sid, message: 'Мне нужен ноутбук' });
    expect(r.askingSlot).toBe('author');
    expect(r.responseType).toBe('confirm_or_choose');

    // confirm author → beneficiary (plain, no hint yet)
    r = await confirm(r);
    expect(r.askingSlot).toBe('beneficiary');

    // provide name → beneficiary confirm-or-choose
    r = await engine.runTurn({ sessionId: sid, message: 'для сотрудника Иванова' });
    expect(r.askingSlot).toBe('beneficiary');
    expect(r.responseType).toBe('confirm_or_choose');

    // confirm beneficiary → location
    r = await confirm(r);
    expect(r.askingSlot).toBe('location');

    // confirm location → justification (detail), NOT approver yet
    r = await confirm(r);
    expect(r.askingSlot).toBe('justification');

    // justification → approver (person, before approverComment)
    r = await engine.runTurn({ sessionId: sid, message: 'обоснование: онбординг' });
    expect(r.askingSlot).toBe('approver');
    expect(r.responseType).toBe('confirm_or_choose');

    // confirm approver → approverComment (LAST)
    r = await confirm(r);
    expect(r.askingSlot).toBe('approverComment');

    // approverComment → CONFIRM
    r = await engine.runTurn({ sessionId: sid, message: 'бюджет одобрен' });
    expect(r.askingSlot).toBeUndefined();
    expect(r.response).toMatch(/Проверьте заявку/i);
  });
});
