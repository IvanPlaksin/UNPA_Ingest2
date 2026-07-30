'use strict';

/**
 * CATALOG_SEARCH branch — "find <topic> services": LLM extracts the service meaning
 * (INTAKE_DECOMPOSE), hybrid vector/graph search (resolveSearch) yields candidates,
 * then 0 → catalog fallback, 1 → action choice, N → pick-a-result. Picking a result
 * reuses the SERVICE_HELP action step (fill vs info).
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const SNAPS = {
  'EO-HR-AP-AP-RI': { serviceId: 'EO-HR-AP-AP-RI', version: 1, phases: ['detail'], metadata: { title: 'Appointment — Reappointment' }, slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }] },
  'EO-HR-AP-AP-EIC': { serviceId: 'EO-HR-AP-AP-EIC', version: 1, phases: ['detail'], metadata: { title: 'Appointment — Extension' }, slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }] },
};

/** @param results array of SERVICE hits resolveSearch should return */
function makeEngine(results, { browseNodes = [] } = {}) {
  const loadSnapshot = async (id) => SNAPS[id] || null;
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    loadSnapshot, graphWrite: async () => [], now: () => Date.parse('2026-07-24T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties && schema.properties.route) return { route: 'CATALOG_SEARCH' };
      if (schema.properties && schema.properties.serviceIntent !== undefined) return { serviceIntent: 'appointment', pairs: [] };
      return {};
    },
    completion: () => 'x',
  });
  const resolveSearch = async () => results;
  // Altiora tools stub for the catalog-browse fallback path (deps.tools is the object).
  return { engine: createEngine({ llm, resolveSearch, draftService, loadSnapshot, injectContext: false, tools: { browseCatalog: async () => browseNodes } }), draftService };
}

const HIT = (serviceId, title, score) => ({ type: 'SERVICE', serviceId, title, domain: 'EO-HR', schemaRef: { version: 1 }, score, confidence: 'high' });

describe('CATALOG_SEARCH: multiple results → pick', () => {
  it('offers the matching services as a choice bound to the SERVICE_HELP action step', async () => {
    const { engine } = makeEngine([HIT('EO-HR-AP-AP-RI', 'Appointment — Reappointment', 0.82), HIT('EO-HR-AP-AP-EIC', 'Appointment — Extension', 0.80)]);
    const r = await engine.runTurn({ sessionId: 'c1', message: 'I want to find appointment services.', lang: 'en' });
    expect(r.responseType).toBe('catalog_search');
    expect(r.controls[0].slotId).toBe('__service_help__'); // pick → action choice
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['EO-HR-AP-AP-RI', 'EO-HR-AP-AP-EIC']);
  });

  it('picking a result leads to the action choice (create vs reference)', async () => {
    const { engine } = makeEngine([HIT('EO-HR-AP-AP-RI', 'Appointment — Reappointment', 0.82), HIT('EO-HR-AP-AP-EIC', 'Appointment — Extension', 0.80)]);
    await engine.runTurn({ sessionId: 'c2', message: 'find appointment services', lang: 'en' });
    const r = await engine.runTurn({ sessionId: 'c2', controlAction: { slotId: '__service_help__', value: 'EO-HR-AP-AP-RI' }, lang: 'en' });
    expect(r.responseType).toBe('intent_choice');
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['fill:EO-HR-AP-AP-RI', 'info:EO-HR-AP-AP-RI']);
  });
});

describe('CATALOG_SEARCH: single result → action choice directly', () => {
  it('a single match skips the pick and asks fill vs info', async () => {
    const { engine } = makeEngine([HIT('EO-HR-AP-AP-RI', 'Appointment — Reappointment', 0.9)]);
    const r = await engine.runTurn({ sessionId: 'c3', message: 'find the reappointment service', lang: 'en' });
    expect(r.responseType).toBe('intent_choice');
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['fill:EO-HR-AP-AP-RI', 'info:EO-HR-AP-AP-RI']);
  });
});

describe('CATALOG_SEARCH: no result → catalog fallback', () => {
  it('falls back to browsing the catalog root when nothing matches', async () => {
    const { engine } = makeEngine([], { browseNodes: [{ serviceId: 'CAT-1', displayName: 'HR', hasChildren: true, childCount: 5 }] });
    const r = await engine.runTurn({ sessionId: 'c4', message: 'find unicorn services', lang: 'en' });
    expect(r.responseType).toBe('catalog_browse');
  });
});
