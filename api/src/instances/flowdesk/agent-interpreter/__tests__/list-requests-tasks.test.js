'use strict';

/**
 * REQ-001/002 — the user's own requests and tasks, on the interpreter that is
 * actually running.
 *
 * `MY_REQUESTS` and `QUERY_TASKS` have been routes in `interpreter-engine` for
 * months. That is the state machine, and it is not the live path: the agent's whole
 * tool inventory was eight entries, none of which could answer "show me my last
 * request". The third instance of the same loss — the hybrid and the cascade resolver
 * were the first two.
 *
 * Nothing here re-implements the data access. The backends existed all along; these
 * tools make them reachable.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');

const ctx = () => ({ sessionId: 's1', session: createToolSession(), lang: 'en' });

const TICKET = {
  rfsNumber: 'SR-1001', Title: 'Education grant claim', Status: 'Open',
  ServiceDisplayName: 'Education Grant', Priority: 'Normal',
  Beneficiary: { name: 'Ivan Plaksin' }, Tasks: [1, 2], SharedWith: [{ name: 'Maria Silva' }],
};

const mk = (over = {}) => createAgentTools({
  draftService: { get: async () => null, create: async () => null, patch: async () => null, discard: async () => true },
  loadSnapshot: async () => null,
  resolveSearch: async () => [],
  ticketList: { listTickets: async () => ({ tickets: [], totalCount: 0, hasMore: false }) },
  tasksBackend: { listTasks: async () => ({ tasks: [], totalCount: 0 }) },
  ...over,
});

describe('listing the requests a person raised', () => {
  test('asks the backend only for THEIR requests', async () => {
    // "my requests" is the only question this tool answers; without mineOnly it would
    // return the whole organisation's.
    let seen = null;
    const tools = mk({ ticketList: { listTickets: async (f) => { seen = f; return { tickets: [], totalCount: 0 }; } } });
    await tools.TOOLS.list_requests({}, ctx());
    expect(seen.mineOnly).toBe(true);
  });

  test('passes the wording through as PARAMETERS, and does not filter afterwards', async () => {
    // A model handed fifty requests that picks the relevant ones is inventing an
    // answer out of real data, and the reader cannot tell which happened.
    let seen = null;
    const tools = mk({ ticketList: { listTickets: async (f) => { seen = f; return { tickets: [], totalCount: 0 }; } } });
    await tools.TOOLS.list_requests({ status: 'open', fromDate: '2026-06-01', service: 'Education', limit: 1 }, ctx());
    expect(seen).toMatchObject({ status: 'open', fromDate: '2026-06-01', service: 'Education', pageSize: 1 });
  });

  test('"my last request" is a limit, not a judgement', async () => {
    let seen = null;
    const tools = mk({ ticketList: { listTickets: async (f) => { seen = f; return { tickets: [TICKET], totalCount: 9 }; } } });
    const out = await tools.TOOLS.list_requests({ limit: 1 }, ctx());
    expect(seen.pageSize).toBe(1);
    expect(out.total).toBe(9);
  });

  test('a wild limit is clamped rather than sent on', async () => {
    let seen = null;
    const tools = mk({ ticketList: { listTickets: async (f) => { seen = f; return { tickets: [], totalCount: 0 }; } } });
    await tools.TOOLS.list_requests({ limit: 5000 }, ctx());
    expect(seen.pageSize).toBe(25);
  });

  test('the model is told the rows are RENDERED, so it does not recite them', async () => {
    // Otherwise everything is said twice — and read aloud as a table in voice.
    const tools = mk({ ticketList: { listTickets: async () => ({ tickets: [TICKET], totalCount: 1 }) } });
    const out = await tools.TOOLS.list_requests({}, ctx());
    expect(out.tellUser).toMatch(/do not repeat the rows/);
  });

  test('nothing found is a plain answer with an offer, not an empty list', async () => {
    const out = await mk().TOOLS.list_requests({}, ctx());
    expect(out.items).toEqual([]);
    expect(out.tellUser).toMatch(/widen/);
  });

  test('a backend that is down does not take the turn down with it', async () => {
    const tools = mk({ ticketList: { listTickets: async () => { throw new Error('Altiora unreachable'); } } });
    const out = await tools.TOOLS.list_requests({}, ctx());
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/could not be loaded/);
  });
});

describe('listing the tasks waiting on a person', () => {
  test('passes the filters it was given', async () => {
    let seen = null;
    const tools = mk({ tasksBackend: { listTasks: async (f) => { seen = f; return { tasks: [] }; } } });
    await tools.TOOLS.list_tasks({ ticketNumber: 'SR-1001', priority: 'high' }, ctx());
    expect(seen).toMatchObject({ ticketNumber: 'SR-1001', priority: 'high' });
  });

  test('an empty list says nothing is waiting, rather than saying nothing', async () => {
    const out = await mk().TOOLS.list_tasks({}, ctx());
    expect(out.tellUser).toMatch(/Nothing is waiting/);
  });

  test('a backend failure is reported, not swallowed', async () => {
    const tools = mk({ tasksBackend: { listTasks: async () => { throw new Error('down'); } } });
    expect((await tools.TOOLS.list_tasks({}, ctx())).ok).toBe(false);
  });
});

describe('what the rows carry', () => {
  const { mapTicket } = require('../../services/backends/ticket-list.backend');

  test('the columns Altiora’s own list shows, so both read the same', () => {
    // Its table is accent, id, service, onBehalf, urgency, submitted, status, tasks,
    // completed, shared, rating, actions — `accent` is a colour bar and `actions` are
    // the buttons Ivan asked to leave out.
    const row = mapTicket(TICKET);
    expect(row).toMatchObject({
      ticketNumber: 'SR-1001', title: 'Education grant claim', status: 'Open',
      service: 'Education Grant', priority: 'Normal',
      onBehalf: 'Ivan Plaksin', taskCount: 2, sharedWith: ['Maria Silva'],
    });
  });

  test('each row says how the HOST should open it — the chat does not know how', () => {
    expect(mapTicket(TICKET).revealIntent).toEqual({ domain: 'requests', id: 'SR-1001' });
  });

  test('a ticket missing the optional columns still maps', () => {
    const row = mapTicket({ TicketNumber: 'SR-2', Title: 'X' });
    expect(row.ticketNumber).toBe('SR-2');
    expect(row.sharedWith).toEqual([]);
  });
});

/**
 * REQ-005 — the rows a turn SHOWS.
 *
 * Their own field, not a `controls` entry of type "list". A control has a slotId and
 * fills it; a list of requests has neither and fills nothing, and calling it a control
 * would mean explaining ever after why this one has no slot.
 */
describe('the rows a turn shows', () => {
  const { toCard } = require('../../interpreter/cards');

  const ROW = {
    ticketNumber: 'SR-1001', title: 'Education grant claim', status: 'Open',
    service: 'Education Grant', priority: 'Normal', onBehalf: 'Ivan Plaksin',
    taskCount: 2, sharedWith: ['Maria Silva'], createdAt: '2026-07-01',
    revealIntent: { domain: 'requests', id: 'SR-1001' },
  };

  test('says what Altiora’s own list says', () => {
    const labels = toCard('request', ROW).fields.map((f) => f.label);
    expect(labels).toEqual(['Service', 'For', 'Priority', 'Submitted', 'Status', 'Tasks', 'Shared with']);
  });

  test('a field the ticket does not have is left out, not shown empty', () => {
    // An empty row in a conversation reads as something that failed to load.
    const labels = toCard('request', { ticketNumber: 'SR-2', title: 'X', status: 'Open' })
      .fields.map((f) => f.label);
    expect(labels).toEqual(['Status']);
  });

  test('carries the host intent and no action of its own', () => {
    const card = toCard('request', ROW);
    expect(card.revealIntent).toEqual({ domain: 'requests', id: 'SR-1001' });
    expect(card.actions).toBeUndefined();
  });

  test('the accent is a MEANING, never a colour — the palette is the host’s', () => {
    expect(toCard('request', { ...ROW, slaStatus: 'breached' }).accent).toBe('breached');
  });

  test('a task points at the request it belongs to, so the click still opens something', () => {
    const card = toCard('task', { id: 't1', title: 'Approve', ticketNumber: 'SR-1001', priority: 'high' });
    expect(card.revealIntent).toEqual({ domain: 'requests', id: 'SR-1001' });
  });

  test('a row with nothing on it still says so rather than rendering an empty box', () => {
    expect(toCard('request', {}).fields.length).toBeGreaterThan(0);
  });

  test('dates and people are marked for the client to format, not formatted here', () => {
    // The chat does not own the host's date format or its status palette.
    const byLabel = Object.fromEntries(toCard('request', ROW).fields.map((f) => [f.label, f.format]));
    expect(byLabel.Submitted).toBe('date');
    expect(byLabel.For).toBe('user');
    expect(byLabel.Status).toBe('status');
  });
});
