'use strict';

/**
 * V3 section intents — QUERY_TASKS / QUERY_MAIL routing + handlers, MY_REQUESTS
 * detail-by-number, "the first one" prior-list references, voice `speech`, i18n.
 */

const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const snapshotFor = (serviceId) => ({
  serviceId, version: 1, phases: ['detail'],
  metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }],
});

function makeEngine({ tools, routeFor, structuredFor } = {}) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async (sid) => snapshotFor(sid), graphWrite: async () => [],
    now: () => Date.parse('2026-07-22T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => {
      const p = schema.properties || {};
      if (p.route) return { route: routeFor ? routeFor(prompt) : 'INFO_QUESTION' };
      if (structuredFor) { const r = structuredFor(prompt, schema); if (r) return r; }
      if (p.priority && p.dueBefore) return /high/i.test(prompt) ? { priority: 'high' } : {}; // task filter
      if (p.folder) return /sent/i.test(prompt) ? { folder: 'sent' } : {};                    // mail filter
      if (p.status && p.fromDate) return {};                                                   // request filter
      return {};
    },
    completion: () => 'ok',
  });
  return createEngine({ injectContext: false, llm, resolveSearch: async () => [], draftService, loadSnapshot: async (sid) => snapshotFor(sid), tools });
}

const routeBy = (map) => (prompt) => {
  const m = (prompt.match(/Message: "([^"]*)"/) || [])[1] || '';
  for (const [re, route] of map) if (re.test(m)) return route;
  return 'INFO_QUESTION';
};
const noMarkup = (s) => !/[*•_#]|\n/.test(String(s));

describe('QUERY_TASKS', () => {
  const tasks = [
    { id: 'T-1', title: 'Fix laptop', status: 'Open', priority: 'High' },
    { id: 'T-2', title: 'Renew badge', status: 'Open', priority: 'Low' },
  ];

  test('lists tasks with an extracted filter + voice speech (no markup)', async () => {
    const tools = { listMyTasks: jest.fn(async (f) => ({ tasks, totalCount: 2, filters: f })) };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_TASKS' });
    const r = await engine.runTurn({ sessionId: 'qt1', message: 'show my high priority tasks' , lang: 'en'});
    expect(r.route).toBe('QUERY_TASKS');
    expect(r.responseType).toBe('task_list');
    expect(r.tasks).toHaveLength(2);
    expect(tools.listMyTasks).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }));
    expect(r.speech).toMatch(/^You have two tasks/);
    expect(noMarkup(r.speech)).toBe(true);
  });

  test('"the first one" after a list resolves to a task detail', async () => {
    const tools = { listMyTasks: async () => ({ tasks, totalCount: 2 }), getMyTask: jest.fn(async (id) => ({ id, title: 'Fix laptop', status: 'Open', description: 'broken screen' })) };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_TASKS' });
    await engine.runTurn({ sessionId: 'qt2', message: 'my tasks' , lang: 'en'});
    const r = await engine.runTurn({ sessionId: 'qt2', message: 'tell me about the first one' , lang: 'en'});
    expect(tools.getMyTask).toHaveBeenCalledWith('T-1');
    expect(r.responseType).toBe('task_detail');
    expect(r.speech).toContain('Fix laptop');
  });

  test('empty list → friendly none', async () => {
    const tools = { listMyTasks: async () => ({ tasks: [], totalCount: 0 }) };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_TASKS' });
    const r = await engine.runTurn({ sessionId: 'qt3', message: 'my tasks' , lang: 'en'});
    expect(r.speech).toMatch(/no tasks/i);
  });
});

describe('QUERY_MAIL', () => {
  const messages = [
    { id: 'M-1', from: 'Alice', subject: 'Welcome', read: false },
    { id: 'M-2', from: 'Bob', subject: 'Payroll', read: true },
  ];

  test('"how many unread" → counts summary (not a listing)', async () => {
    const tools = { mailCounts: jest.fn(async () => ({ inboxUnread: 3 })), listMyMail: jest.fn() };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_MAIL' });
    const r = await engine.runTurn({ sessionId: 'qm1', message: 'how many unread messages do I have' , lang: 'en'});
    expect(tools.mailCounts).toHaveBeenCalled();
    expect(tools.listMyMail).not.toHaveBeenCalled();
    expect(r.responseType).toBe('mail_counts');
    expect(r.speech).toBe('You have three unread messages in your inbox.');
  });

  test('lists a folder + remembers it, then "read the second" opens detail', async () => {
    const tools = {
      listMyMail: jest.fn(async () => ({ messages, folder: 'sent' })),
      getMyMail: jest.fn(async (id) => ({ id, from: 'Bob', subject: 'Payroll', body: 'see attached' })),
    };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_MAIL' });
    const r1 = await engine.runTurn({ sessionId: 'qm2', message: 'show my sent folder' , lang: 'en'});
    expect(tools.listMyMail).toHaveBeenCalledWith(expect.objectContaining({ folder: 'sent' }));
    expect(r1.responseType).toBe('mail_list');
    const r2 = await engine.runTurn({ sessionId: 'qm2', message: 'read the second one' , lang: 'en'});
    expect(tools.getMyMail).toHaveBeenCalledWith('M-2');
    expect(r2.responseType).toBe('mail_detail');
    expect(r2.speech).toContain('Payroll');
  });
});

describe('MY_REQUESTS detail', () => {
  test('an explicit request number → detail by number with voice speech', async () => {
    const tools = {
      listMyTickets: jest.fn(),
      getMyRequest: jest.fn(async (n) => ({ ticketNumber: n, title: 'VPN access', status: 'Pending', assignedTo: 'Carol' })),
    };
    const engine = makeEngine({ tools, routeFor: () => 'MY_REQUESTS' });
    const r = await engine.runTurn({ sessionId: 'mr1', message: "what's the status of SR-45678" , lang: 'en'});
    expect(tools.getMyRequest).toHaveBeenCalledWith('SR-45678');
    expect(tools.listMyTickets).not.toHaveBeenCalled();
    expect(r.responseType).toBe('ticket_detail');
    expect(r.speech).toContain('Request SR-45678: VPN access.');
    expect(r.speech).toContain('Assigned to Carol.');
  });

  test('list then "the first one" → detail on the first ticket number', async () => {
    const tickets = [{ ticketNumber: 'SR-1', title: 'Laptop', status: 'Open' }, { ticketNumber: 'SR-2', title: 'Badge', status: 'Open' }];
    const tools = {
      listMyTickets: async () => ({ tickets, totalCount: 2 }),
      getMyRequest: jest.fn(async (n) => ({ ticketNumber: n, title: 'Laptop', status: 'Open' })),
    };
    const engine = makeEngine({ tools, routeFor: () => 'MY_REQUESTS' });
    await engine.runTurn({ sessionId: 'mr2', message: 'my requests' , lang: 'en'});
    const r = await engine.runTurn({ sessionId: 'mr2', message: 'tell me about the first one' , lang: 'en'});
    expect(tools.getMyRequest).toHaveBeenCalledWith('SR-1');
    expect(r.responseType).toBe('ticket_detail');
  });

  test('a bare year is NOT treated as a request number', async () => {
    const tools = { listMyTickets: jest.fn(async () => ({ tickets: [], totalCount: 0 })), getMyRequest: jest.fn() };
    const engine = makeEngine({ tools, routeFor: () => 'MY_REQUESTS' });
    await engine.runTurn({ sessionId: 'mr3', message: 'my requests from 2024' , lang: 'en'});
    expect(tools.getMyRequest).not.toHaveBeenCalled();
    expect(tools.listMyTickets).toHaveBeenCalled();
  });
});

describe('i18n (voice speech)', () => {
  test('QUERY_TASKS speech is localized (ru)', async () => {
    const tools = { listMyTasks: async () => ({ tasks: [{ id: 'T-1', title: 'Задача', status: 'Открыта' }], totalCount: 1 }) };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_TASKS' });
    const r = await engine.runTurn({ sessionId: 'i1', message: 'мои задачи', lang: 'ru' });
    expect(r.speech).toMatch(/задач/);
  });

  test('QUERY_MAIL counts is localized (fr)', async () => {
    const tools = { mailCounts: async () => ({ inboxUnread: 2 }) };
    const engine = makeEngine({ tools, routeFor: () => 'QUERY_MAIL' });
    const r = await engine.runTurn({ sessionId: 'i2', message: 'combien de messages non lus', lang: 'fr' });
    expect(r.speech).toMatch(/deux messages non lus/);
  });
});
