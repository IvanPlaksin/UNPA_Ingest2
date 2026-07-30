'use strict';

/**
 * Addition 1 — action-intent clarification (fill vs. learn) when the user only
 * named a service; Addition 2 — the large-form pre-check (> 14 fields) offering
 * the wizard, the assistant, or a field reference.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const SMALL = {
  serviceId: 'SVC-SMALL', version: 1, phases: ['detail'],
  metadata: { title: 'Home Leave Query' },
  slots: [
    { slotId: 'subject', type: 'string', required: true, phase: 'detail', section: 'general', promptHint: 'Subject' },
    { slotId: 'notes', type: 'text', required: false, phase: 'detail', section: 'general', promptHint: 'Notes' },
  ],
};
// 15 own fields → exceeds the 14 threshold.
const LARGE = {
  serviceId: 'SVC-LARGE', version: 1, phases: ['detail'],
  metadata: { title: 'Extension of Appointment' },
  slots: Array.from({ length: 15 }, (_, i) => ({ slotId: `f${i}`, type: 'string', required: i < 2, phase: 'detail', section: 'main', promptHint: `Field ${i}` })),
};
const SNAPS = { 'SVC-SMALL': SMALL, 'SVC-LARGE': LARGE };

function makeEngine(serviceId, intent) {
  const loadSnapshot = async (id) => SNAPS[id] || null;
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    loadSnapshot, graphWrite: async () => [], now: () => Date.parse('2026-07-14T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties?.route) return { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' };
      if (schema.properties?.serviceIntent) return { serviceIntent: 'a service', pairs: [], intent };
      return {};
    },
    completion: () => 'Question?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId, title: SNAPS[serviceId].metadata.title, schemaRef: { serviceId, version: 1 }, score: 0.95, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot });
}

describe('Addition 1 — action-intent clarification', () => {
  test('unclear intent → the assistant asks fill vs. show-the-form (2 controls)', async () => {
    const r = await makeEngine('SVC-SMALL', 'unclear').runTurn({ sessionId: 'a1', lang: 'en', message: 'home leave' });
    expect(r.responseType).toBe('intent_choice');
    const opts = r.controls[0].options.map((o) => o.value);
    expect(opts).toEqual(['fill:SVC-SMALL', 'info:SVC-SMALL']);
  });

  test('choosing "info" shows the service-help card', async () => {
    const engine = makeEngine('SVC-SMALL', 'unclear');
    await engine.runTurn({ sessionId: 'a2', lang: 'en', message: 'home leave' });
    const r = await engine.runTurn({ sessionId: 'a2', lang: 'en', controlAction: { slotId: '__intent_choice__', value: 'info:SVC-SMALL' } });
    expect(r.responseType).toBe('service_help');
  });

  test('choosing "fill" starts the intake (small form → no gate)', async () => {
    const engine = makeEngine('SVC-SMALL', 'unclear');
    await engine.runTurn({ sessionId: 'a3', lang: 'en', message: 'home leave' });
    const r = await engine.runTurn({ sessionId: 'a3', lang: 'en', controlAction: { slotId: '__intent_choice__', value: 'fill:SVC-SMALL' } });
    expect(r.responseType).not.toBe('intent_choice');
    expect(r.responseType).not.toBe('large_form_choice');
    expect(r.draft).toBeTruthy();
  });

  test('a clear "fill" intent on a small form proceeds straight to intake', async () => {
    const r = await makeEngine('SVC-SMALL', 'fill').runTurn({ sessionId: 'a4', lang: 'en', message: 'raise a home leave query' });
    expect(r.responseType).not.toBe('intent_choice');
    expect(r.draft).toBeTruthy();
  });
});

describe('Addition 2 — large-form pre-check (>14 fields)', () => {
  test('fill intent on a >14-field form offers wizard / assistant / info (3 controls)', async () => {
    const r = await makeEngine('SVC-LARGE', 'fill').runTurn({ sessionId: 'b1', lang: 'en', message: 'raise an extension of appointment' });
    expect(r.responseType).toBe('large_form_choice');
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['wizard:SVC-LARGE', 'assistant:SVC-LARGE', 'info:SVC-LARGE']);
  });

  test('choosing the wizard hands off to the form (open_form + prefill payload)', async () => {
    const engine = makeEngine('SVC-LARGE', 'fill');
    await engine.runTurn({ sessionId: 'b2', lang: 'en', message: 'extension of appointment' });
    const r = await engine.runTurn({ sessionId: 'b2', lang: 'en', controlAction: { slotId: '__large_form__', value: 'wizard:SVC-LARGE' } });
    expect(r.responseType).toBe('open_form');
    expect(r.openForm).toMatchObject({ serviceId: 'SVC-LARGE' });
  });

  test('choosing the assistant continues in chat (no gate loop)', async () => {
    const engine = makeEngine('SVC-LARGE', 'fill');
    await engine.runTurn({ sessionId: 'b3', lang: 'en', message: 'extension of appointment' });
    const r = await engine.runTurn({ sessionId: 'b3', lang: 'en', controlAction: { slotId: '__large_form__', value: 'assistant:SVC-LARGE' } });
    expect(r.responseType).not.toBe('large_form_choice');
    expect(r.draft).toBeTruthy();
  });

  test('choosing info shows the field reference', async () => {
    const engine = makeEngine('SVC-LARGE', 'fill');
    await engine.runTurn({ sessionId: 'b4', lang: 'en', message: 'extension of appointment' });
    const r = await engine.runTurn({ sessionId: 'b4', lang: 'en', controlAction: { slotId: '__large_form__', value: 'info:SVC-LARGE' } });
    expect(r.responseType).toBe('service_help');
  });

  test('volunteered field data skips the gate (user committed to chat)', async () => {
    // decompose returns pairs → hasPairs → gate bypassed even though form is large
    const loadSnapshot = async (id) => SNAPS[id] || null;
    const store = new Map();
    const draftService = createDraftSRService({
      store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
      loadSnapshot, graphWrite: async () => [], now: () => Date.now(), makeRef: (_d, p = 'SR') => `${p}-1`,
    });
    const llm = new MockLLMProvider({
      structured: (prompt, schema) => {
        if (schema.properties?.route) return { route: 'NEW_INTENT' };
        if (schema.properties?.serviceIntent) return { serviceIntent: 'extension', pairs: [{ name: 'Field 0', value: 'X' }], intent: 'fill' };
        return {};
      },
      completion: () => 'Q?',
    });
    const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'SVC-LARGE', title: 'Extension of Appointment', schemaRef: { serviceId: 'SVC-LARGE', version: 1 }, score: 0.95, confidence: 'high' }];
    const engine = createEngine({ llm, resolveSearch, draftService, loadSnapshot });
    const r = await engine.runTurn({ sessionId: 'b5', lang: 'en', message: 'extension of appointment, Field 0: X' });
    expect(r.responseType).not.toBe('large_form_choice');
  });
});
