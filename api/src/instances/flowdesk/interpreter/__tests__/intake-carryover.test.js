'use strict';

/**
 * Intake decomposition + carry-over (multi-data first message).
 *
 * A user often types the service request AND form data in one message. This
 * verifies:
 *  1. INTAKE_DECOMPOSE isolates the service-intent phrase, and the catalogue
 *     search runs against THAT (not the whole data-laden message).
 *  2. Values volunteered for a slot that is not tref-active yet (shippingAddress,
 *     gated on delivery == 'Ship to Home Address') are parked as carry-over and
 *     auto-applied once the slot becomes active — never re-asked.
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const FX = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', `schema-snapshot.${name}.json`), 'utf8'));
const SNAP = { 'IT-HW-LAPX': FX('laptop-altiora') };
const loadSnapshot = async (serviceId) => SNAP[serviceId] || null;

function extractFor(msg, schema) {
  const m = (msg || '').toLowerCase();
  const p = schema.properties || {};
  const out = {};
  if (p.os && /windows/.test(m)) out.os = 'Windows 11 Enterprise (LTSB)';
  if (p.storage && /512/.test(m)) out.storage = '512GB NVMe SSD (Standard)';
  if (p.gpu && /integrated/.test(m)) out.gpu = 'Integrated Internal Graphics';
  if (p.delivery && /ship|home/.test(m)) out.delivery = 'Ship to Home Address';
  // shippingAddress is only in the schema when extraction runs against the FULL
  // form (intake). "123 main st" must survive as carry-over until delivery opens it.
  if (p.shippingAddress && /123 main st/.test(m)) out.shippingAddress = '123 Main St';
  return out;
}

function makeEngine(onSearch) {
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
    structured: (prompt, schema) => {
      if (schema.properties?.route) return { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' };
      if (schema.properties?.serviceIntent) return { serviceIntent: 'laptop request', pairs: [{ name: 'shipping address', value: '123 Main St' }] };
      return extractFor((prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '', schema);
    },
    completion: () => 'What next?',
  });
  const resolveSearch = async (query) => {
    if (onSearch) onSearch(query);
    return [{ type: 'SERVICE', serviceId: 'IT-HW-LAPX', title: 'Laptop Request', schemaRef: { serviceId: 'IT-HW-LAPX', version: 1 }, score: 0.95, confidence: 'high' }];
  };
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot });
}

describe('intake decomposition + carry-over', () => {
  test('service search uses the isolated serviceIntent, not the whole message', async () => {
    let searchedWith = null;
    const engine = makeEngine((q) => { searchedWith = q; });
    await engine.runTurn({
      sessionId: 's1', lang: 'en',
      message: 'I need a laptop — ship to home address, shipping address: 123 Main St, Windows, 512 SSD, integrated gpu',
    });
    expect(searchedWith).toBe('laptop request'); // decomposed intent, not the data-laden text
  });

  test('a value for a not-yet-active conditional slot is carried over and auto-filled', async () => {
    const engine = makeEngine();
    const r = await engine.runTurn({
      sessionId: 's2', lang: 'en',
      message: 'I need a laptop — ship to home address, shipping address: 123 Main St, Windows, 512 SSD, integrated gpu',
    });
    // delivery was set from the message → shippingAddress became active and the
    // carried-over value filled it WITHOUT a question being asked for it.
    expect(r.draft.slots.delivery.value).toBe('Ship to Home Address');
    expect(r.draft.slots.shippingAddress.value).toBe('123 Main St');
    expect(r.draft.slots.shippingAddress.provenance).toBe('extracted');
    // never asked shippingAddress
    expect(r.askingSlot === 'shippingAddress').toBe(false);
  });

  test('carry-over does not fire when the gating value is absent (slot stays inactive)', async () => {
    const engine = makeEngine();
    const r = await engine.runTurn({
      sessionId: 's3', lang: 'en',
      // No delivery mention → shippingAddress never activates; value not invented.
      message: 'I need a laptop — Windows, 512 SSD, integrated gpu',
    });
    expect(r.draft.slots.delivery?.value).toBeFalsy();
    // shippingAddress stays unset (inactive), not fabricated
    expect(r.draft.slots.shippingAddress?.value == null).toBe(true);
  });
});

// ── reference-backed slots must not be filled with an unvalidated mention ─────
// A dictRef (cascade-dictionary) slot's value must come from the dictionary, not
// from free text the user typed. An extracted mention that does not resolve stays
// a hint; the slot is unfilled and asked. (Also covers unbaked LOV, same path.)
const DICT_SNAP = {
  serviceId: 'SVC-DICT', version: 1, phases: ['detail'],
  metadata: { title: 'Extension (dict)', approvalRequired: false },
  slots: [
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail' },
    { slotId: 'grade', type: 'string', required: true, phase: 'detail', dictRef: { filters: [{ slotId: 'indexNumber' }] } },
  ],
};

function makeDictEngine() {
  const loadDict = async (id) => (id === 'SVC-DICT' ? DICT_SNAP : null);
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    loadSnapshot: loadDict, graphWrite: async () => [],
    now: () => Date.parse('2026-07-14T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties?.route) return { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' };
      if (schema.properties?.serviceIntent) return { serviceIntent: 'extend appointment', pairs: [] };
      const m = (prompt.match(/User message:\n([\s\S]*?)\n\nExtract/) || [])[1] || '';
      const p = schema.properties || {};
      const out = {};
      if (p.indexNumber && /12345678/.test(m)) out.indexNumber = '12345678';
      if (p.grade && /p-4/i.test(m)) out.grade = 'P-4'; // dictRef slot — a free-text mention
      return out;
    },
    completion: () => 'What is the grade?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC-DICT', title: 'Extension (dict)', schemaRef: { serviceId: 'SVC-DICT', version: 1 }, score: 0.95, confidence: 'high' }];
  // Empty dictionary → the cascade cannot resolve → the slot must be asked, not filled.
  const fetchLovValues = async () => [];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot: loadDict, fetchLovValues });
}

describe('reference-backed slots reject unvalidated mentions', () => {
  test('a dictRef mention that does not resolve stays a hint; the slot is unfilled and asked', async () => {
    const engine = makeDictEngine();
    const r = await engine.runTurn({
      sessionId: 'd1', lang: 'en',
      message: 'Please extend the appointment, index number 12345678, grade P-4',
    });
    // plain slot filled from the message
    expect(r.draft.slots.indexNumber.value).toBe('12345678');
    // dictRef slot NOT filled with the free-text "P-4" — kept as a hint only, so it
    // will be resolved/asked (never silently accepted as an unvalidated value).
    expect(r.draft.slots.grade.value == null).toBe(true);
    expect(r.draft.slots.grade.hint).toBe('P-4');
    // the flow is still gathering (it did not complete with a bogus grade)
    expect(r.waiting).toBe(true);
    expect(r.isComplete).toBeFalsy();
  });
});
