'use strict';

/**
 * Chat-agent read intents (MY_REQUESTS / CATALOG_BROWSE / FIELD_HELP) — routing,
 * handlers, and the catalog controlAction drill-down / service-start.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const snapshotFor = (serviceId) => ({
  serviceId, version: 1, phases: ['detail'],
  metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject / Title' }],
});

function makeEngine({ tools, routeFor } = {}) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async (sid) => snapshotFor(sid), graphWrite: async () => [],
    now: () => Date.parse('2026-07-17T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      if (schema.properties && schema.properties.route) return { route: routeFor ? routeFor(prompt) : 'INFO_QUESTION' };
      // FILTER_SCHEMA extraction
      if (schema.properties && schema.properties.status && schema.properties.fromDate) {
        return /completed/i.test(prompt) ? { status: 'completed' } : { status: null };
      }
      return {};
    },
    completion: () => 'This field is a short summary of your request.',
  });
  return createEngine({ injectContext: false, llm, resolveSearch: async () => [], draftService, loadSnapshot: async (sid) => snapshotFor(sid), tools });
}

const routeBy = (map) => (prompt) => {
  const m = (prompt.match(/Message: "([^"]*)"/) || [])[1] || '';
  for (const [re, route] of map) if (re.test(m)) return route;
  return 'INFO_QUESTION';
};

describe('MY_REQUESTS', () => {
  test('lists the user tickets with an extracted filter', async () => {
    const tools = { listMyTickets: jest.fn(async (f) => ({ tickets: [{ ticketNumber: 'TKT-1', title: 'Separation', status: 'InProgress' }], totalCount: 2, filters: f })) };
    const engine = makeEngine({ tools, routeFor: routeBy([[/my requests|completed/i, 'MY_REQUESTS']]) });
    const r = await engine.runTurn({ sessionId: 'm1', message: 'show my completed requests' });
    expect(r.route).toBe('MY_REQUESTS');
    expect(r.responseType).toBe('ticket_list');
    expect(r.tickets).toHaveLength(1);
    expect(r.response).toContain('TKT-1');
    expect(tools.listMyTickets).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  test('empty result is handled gracefully', async () => {
    const tools = { listMyTickets: async () => ({ tickets: [], totalCount: 0 }) };
    const engine = makeEngine({ tools, routeFor: () => 'MY_REQUESTS' });
    const r = await engine.runTurn({ sessionId: 'm2', message: 'my requests', lang: 'en' });
    expect(r.responseType).toBe('ticket_list');
    expect(r.response).toMatch(/no requests/i);
  });
});

describe('CATALOG_BROWSE', () => {
  const nodes = [
    { serviceId: 'g-hr', displayName: 'Human Resources', hasChildren: true, childCount: 40, isRequestable: false },
    { serviceId: 'g-fin', displayName: 'Finance', hasChildren: true, childCount: 4, isRequestable: false },
  ];

  test('text intent → root categories as a choice control', async () => {
    const tools = { browseCatalog: jest.fn(async (id) => (id ? [] : nodes)) };
    const engine = makeEngine({ tools, routeFor: () => 'CATALOG_BROWSE' });
    const r = await engine.runTurn({ sessionId: 'c1', message: 'what services do you offer' });
    expect(r.route).toBe('CATALOG_BROWSE');
    expect(r.controls[0]).toMatchObject({ type: 'choice', slotId: '__catalog_browse__' });
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['g-hr', 'g-fin']);
    expect(tools.browseCatalog).toHaveBeenCalledWith(null);
  });

  test('drill-down controlAction browses children + adds a Back option', async () => {
    const child = [{ serviceId: 'g-sep', displayName: 'Separation', hasChildren: false, isRequestable: true, serviceCode: 'EO-HR-SA-SS-ISP' }];
    const tools = { browseCatalog: jest.fn(async (id) => (id === 'g-hr' ? child : nodes)) };
    const engine = makeEngine({ tools });
    const r = await engine.runTurn({ sessionId: 'c2', controlAction: { slotId: '__catalog_browse__', action: 'select', value: 'g-hr' } });
    expect(tools.browseCatalog).toHaveBeenCalledWith('g-hr');
    const opts = r.controls[0].options;
    expect(opts.find((o) => o.value === 'svc:EO-HR-SA-SS-ISP')).toBeTruthy(); // requestable leaf → svc:CODE
    expect(opts.find((o) => o.value === '__root__')).toBeTruthy(); // back
  });

  test('picking a requestable leaf (svc:CODE) starts that service', async () => {
    const tools = { browseCatalog: async () => [] };
    const engine = makeEngine({ tools });
    const r = await engine.runTurn({ sessionId: 'c3', controlAction: { slotId: '__catalog_browse__', action: 'select', value: 'svc:EO-HR-SA-SS-ISP' } });
    expect(r.draft.serviceId).toBe('EO-HR-SA-SS-ISP');
    expect(r.askingSlot).toBe('subject');
  });
});

describe('responds in the selected language (Req B)', () => {
  test('MY_REQUESTS empty result is localized (ru)', async () => {
    const tools = { listMyTickets: async () => ({ tickets: [], totalCount: 0 }) };
    const engine = makeEngine({ tools, routeFor: () => 'MY_REQUESTS' });
    const r = await engine.runTurn({ sessionId: 'lg1', message: 'мои заявки', lang: 'ru' });
    expect(r.response).toContain('нет заявок');
  });

  test('CATALOG_BROWSE header is localized (ru)', async () => {
    const tools = { browseCatalog: async () => [{ serviceId: 'g1', displayName: 'HR', hasChildren: true, childCount: 3 }] };
    const engine = makeEngine({ tools, routeFor: () => 'CATALOG_BROWSE' });
    const r = await engine.runTurn({ sessionId: 'lg2', message: 'какие услуги', lang: 'ru' });
    expect(r.response).toContain('категории');
  });

  test('OUT_OF_SCOPE deflection is localized (fr)', async () => {
    const engine = makeEngine({ tools: {}, routeFor: () => 'OUT_OF_SCOPE' });
    const r = await engine.runTurn({ sessionId: 'lg3', message: 'quelle heure est-il', lang: 'fr' });
    expect(r.response).toMatch(/RH et Finances/);
  });
});

describe('FIELD_HELP', () => {
  test('explains a field using its definition (with an active draft)', async () => {
    const tools = { searchArticles: async () => [{ title: 'Subject guidance', answerSnippet: 'Keep it short.' }] };
    const engine = makeEngine({ tools, routeFor: routeBy([[/mean|field/i, 'FIELD_HELP'], [/subject/i, 'NEW_INTENT']]) });
    // start a draft first
    await engine.runTurn({ sessionId: 'f1', message: 'subject' });
    const r = await engine.runTurn({ sessionId: 'f1', message: 'what does the subject field mean?' });
    expect(r.route).toBe('FIELD_HELP');
    expect(r.responseType).toBe('field_help');
    expect(r.response).toContain('short summary');
  });
});
