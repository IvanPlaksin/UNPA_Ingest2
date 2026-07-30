'use strict';

/**
 * Cascade-edit: changing an already-filled slot that has FILLED dependents warns the
 * user and, on confirm, resets those dependents (dictRef autofills re-resolve). Covers
 * the pure detection helpers and the end-to-end engine gate.
 */

const { allDependentsOf, filledDependentsOf } = require('../cascade-resolver');
const { detectCascadeEdit, createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

// category → subCategory → detail, a two-hop cascade chain.
const SNAPSHOT = {
  serviceId: 'SVC-EDIT', version: 1, phases: ['detail'],
  metadata: { title: 'Edit test', approvalRequired: false, fieldIdMapping: { category: 'f_cat', subCategory: 'f_sub', detail: 'f_det' } },
  slots: [
    { slotId: 'category', type: 'string', required: true, phase: 'detail', promptHint: 'Category' },
    { slotId: 'subCategory', type: 'string', required: true, phase: 'detail', promptHint: 'Sub-category', dependsOn: ['category'] },
    { slotId: 'detail', type: 'string', required: true, phase: 'detail', promptHint: 'Detail', dependsOn: ['subCategory'] },
  ],
};

describe('dependency helpers', () => {
  it('allDependentsOf follows the chain transitively', () => {
    expect(allDependentsOf(SNAPSHOT, 'category').sort()).toEqual(['detail', 'subCategory']);
    expect(allDependentsOf(SNAPSHOT, 'subCategory')).toEqual(['detail']);
    expect(allDependentsOf(SNAPSHOT, 'detail')).toEqual([]);
  });

  it('filledDependentsOf returns only filled dependents', () => {
    const draft = { slots: { category: { value: 'A' }, subCategory: { value: 'B' } } }; // detail empty
    const deps = filledDependentsOf(SNAPSHOT, draft, 'category').map((s) => s.slotId);
    expect(deps).toEqual(['subCategory']);
  });
});

describe('detectCascadeEdit', () => {
  const draft = { slots: { category: { value: 'A' }, subCategory: { value: 'B' } } };

  it('flags a real overwrite of a filled slot with filled dependents', () => {
    const ce = detectCascadeEdit([{ op: 'set', slotId: 'category', value: 'Z' }], draft, SNAPSHOT);
    expect(ce).toMatchObject({ slotId: 'category', value: 'Z' });
    expect(ce.dependents.map((d) => d.slotId)).toEqual(['subCategory']);
  });

  it('ignores no-op re-sets, hints, and edits with no filled dependents', () => {
    expect(detectCascadeEdit([{ op: 'set', slotId: 'category', value: 'A' }], draft, SNAPSHOT)).toBeNull(); // unchanged
    expect(detectCascadeEdit([{ op: 'set', slotId: 'category', value: null, hint: 'x' }], draft, SNAPSHOT)).toBeNull(); // hint
    expect(detectCascadeEdit([{ op: 'set', slotId: 'subCategory', value: 'Q' }], draft, SNAPSHOT)).toBeNull(); // detail empty → no filled dependent
  });
});

// ── end-to-end engine gate ────────────────────────────────────────────────────
// The SLOT_EXTRACT schema is keyed by slotId (one property per active slot); the mock
// returns the extracted {slotId: value} object the real runSlotExtract expects.
function makeEngine() {
  const loadSnapshot = async () => SNAPSHOT;
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot, graphWrite: async () => [],
    now: () => Date.parse('2026-07-24T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties && schema.properties.route) {
        return { route: /Has active draft: true/.test(prompt) ? 'CONFIRM_EDIT' : 'NEW_INTENT' };
      }
      if (/CHANGE_CAT/.test(prompt)) return { category: 'Z' }; // extraction overwrites category
      return {};
    },
    completion: () => 'ok',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC-EDIT', title: 'Edit test', schemaRef: { serviceId: 'SVC-EDIT', version: 1 }, score: 0.95, confidence: 'high' }];
  return { engine: createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false }), draftService };
}

describe('engine: cascade-edit warn → confirm → reset', () => {
  async function seeded() {
    const { engine, draftService } = makeEngine();
    await draftService.create('s1', 'SVC-EDIT', 1, null, null);
    await draftService.patch('s1', [
      { op: 'set', slotId: 'category', value: 'A', provenance: 'user_edited', pending: false },
      { op: 'set', slotId: 'subCategory', value: 'B', provenance: 'user_edited', pending: false },
    ]);
    return { engine, draftService };
  }

  it('warns before overwriting category (subCategory would reset)', async () => {
    const { engine } = await seeded();
    const r = await engine.runTurn({ sessionId: 's1', message: 'CHANGE_CAT to Z', lang: 'en' });
    expect(r.responseType).toBe('confirm_cascade_edit');
    expect(r.response).toMatch(/reset/i);
    expect(r.response).toContain('Sub-category');
  });

  it('on "yes" sets the new value and clears the dependent', async () => {
    const { engine, draftService } = await seeded();
    await engine.runTurn({ sessionId: 's1', message: 'CHANGE_CAT to Z', lang: 'en' });
    await engine.runTurn({ sessionId: 's1', message: 'yes', lang: 'en' });
    const d = await draftService.get('s1');
    expect(d.slots.category.value).toBe('Z');
    expect(d.slots.subCategory).toBeUndefined(); // reset
  });

  it('on "no" leaves category unchanged', async () => {
    const { engine, draftService } = await seeded();
    await engine.runTurn({ sessionId: 's1', message: 'CHANGE_CAT to Z', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 's1', message: 'no', lang: 'en' });
    expect(r.responseType).toBe('confirm_cascade_edit');
    const d = await draftService.get('s1');
    expect(d.slots.category.value).toBe('A'); // untouched
    expect(d.slots.subCategory.value).toBe('B');
  });
});
