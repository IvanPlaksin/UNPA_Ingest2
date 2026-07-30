'use strict';

/**
 * SERVICE_HELP branch — catalog reference for a service: question → resolve → confirm
 * /choose (existing disambiguation control) → formatted help card (description + field
 * list) → "raise this request" button that starts intake in chat.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const SNAP_AHL = {
  serviceId: 'EO-HR-SP-NPR-AHL', version: 1, phases: ['detail'],
  metadata: { title: 'Request Advance of Home Leave', approvalRequired: false },
  slots: [
    { slotId: 'dutyStation', type: 'string', required: true, phase: 'detail', promptHint: 'Duty station', helpText: 'Your current duty station', section: 'travel', sectionLabel: 'Travel details' },
    { slotId: 'reason', type: 'text', required: false, phase: 'detail', promptHint: 'Reason', section: 'travel', sectionLabel: 'Travel details' },
    { slotId: 'country', type: 'enum', required: true, phase: 'detail', promptHint: 'Country', presentOptions: [{ value: 'FR', label: 'France' }, { value: 'US', label: 'United States' }] },
  ],
};

function makeEngine(route) {
  const loadSnapshot = async (sid) => (sid === 'EO-HR-SP-NPR-AHL' ? SNAP_AHL : null);
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
      if (schema.properties && schema.properties.route) return { route };
      if (schema.properties && schema.properties.serviceIntent !== undefined) return { serviceIntent: 'advance home leave' };
      return {};
    },
    completion: () => 'kb answer',
  });
  const resolveSearch = async () => [
    { type: 'SERVICE', serviceId: 'EO-HR-SP-NPR-AHL', title: 'Request Advance of Home Leave', domain: 'EO-HR', schemaRef: { version: 1 }, score: 0.9, confidence: 'high' },
  ];
  return { engine: createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false }), draftService };
}

describe('SERVICE_HELP: resolve → confirm', () => {
  it('a "what is X service" question resolves and offers a confirm/choose control', async () => {
    const { engine } = makeEngine('SERVICE_HELP');
    const r = await engine.runTurn({ sessionId: 'h1', message: 'what is the advance home leave request?', lang: 'en' });
    expect(r.responseType).toBe('service_help_pick');
    expect(r.controls[0].slotId).toBe('__service_help__');
    expect(r.controls[0].options[0].value).toBe('EO-HR-SP-NPR-AHL');
    expect(r.response).toContain('Request Advance of Home Leave'); // single-match confirm
  });
});

describe('SERVICE_HELP: pick → action choice (create vs reference)', () => {
  it('after picking a service, asks what to do next with fill/info buttons', async () => {
    const { engine } = makeEngine('SERVICE_HELP');
    const r = await engine.runTurn({ sessionId: 'h2', controlAction: { slotId: '__service_help__', action: 'select', value: 'EO-HR-SP-NPR-AHL' }, lang: 'en' });
    expect(r.responseType).toBe('intent_choice');
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['fill:EO-HR-SP-NPR-AHL', 'info:EO-HR-SP-NPR-AHL']);
  });
});

describe('SERVICE_HELP: action "info" → help card', () => {
  it('choosing reference renders the formatted card + a raise-request button', async () => {
    const { engine } = makeEngine('SERVICE_HELP');
    await engine.runTurn({ sessionId: 'h3', controlAction: { slotId: '__service_help__', action: 'select', value: 'EO-HR-SP-NPR-AHL' }, lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'h3', controlAction: { slotId: '__intent_choice__', value: 'info:EO-HR-SP-NPR-AHL' }, lang: 'en' });
    expect(r.responseType).toBe('service_help');
    expect(r.response).toContain('Request Advance of Home Leave');
    expect(r.response).toContain('Travel details');
    expect(r.response).toContain('Duty station');
    expect(r.response).toContain('Your current duty station');
    expect(r.response).toContain('France');
    expect(r.response).toContain('(optional)'); // reason is not required
    const startCtrl = r.controls.find((c) => c.slotId === '__service_help_start__');
    expect(startCtrl).toBeTruthy();
    expect(startCtrl.options[0].value).toBe('EO-HR-SP-NPR-AHL');
  });
});

describe('SERVICE_HELP: action "fill" → intake', () => {
  it('choosing create-request starts intake (small form → straight to fill loop)', async () => {
    const { engine, draftService } = makeEngine('SERVICE_HELP');
    await engine.runTurn({ sessionId: 'h4', controlAction: { slotId: '__service_help__', action: 'select', value: 'EO-HR-SP-NPR-AHL' }, lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'h4', controlAction: { slotId: '__intent_choice__', value: 'fill:EO-HR-SP-NPR-AHL' }, lang: 'en' });
    expect(r.responseType).not.toBe('intent_choice');
    const d = await draftService.get('h4');
    expect(d).toBeTruthy();
    expect(d.serviceId).toBe('EO-HR-SP-NPR-AHL');
  });
});

describe('SERVICE_HELP: help-card start button → intake', () => {
  it('clicking "raise this request" on the card creates a draft', async () => {
    const { engine, draftService } = makeEngine('SERVICE_HELP');
    const r = await engine.runTurn({ sessionId: 'h5', controlAction: { slotId: '__service_help_start__', action: 'select', value: 'EO-HR-SP-NPR-AHL' }, lang: 'en' });
    expect(r.route).toBe('NEW_INTENT');
    const d = await draftService.get('h5');
    expect(d).toBeTruthy();
    expect(d.serviceId).toBe('EO-HR-SP-NPR-AHL');
  });
});
