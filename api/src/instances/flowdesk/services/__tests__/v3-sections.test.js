'use strict';

/** V3 — section backends (tasks/requests/mail) + adapter routing + voice formatters. */

const { makeTasksBackend } = require('../backends/tasks.backend');
const { makeMailBackend } = require('../backends/mail.backend');
const { makeTicketListBackend } = require('../backends/ticket-list.backend');
const { createAltioraTools, ToolNotAllowedError } = require('../altiora-tools.adapter');
const fmt = require('../../interpreter/voice-formatters');

// A fake Altiora client that records the path and returns a canned body.
function fakeClient(bodyFor) {
  const calls = [];
  return {
    calls,
    get: async (path) => { calls.push(path); return typeof bodyFor === 'function' ? bodyFor(path) : bodyFor; },
  };
}

describe('tasks backend', () => {
  test('listTasks maps status/priority aliases into the query + compact shape', async () => {
    const client = fakeClient({ items: [{ Id: 't1', Label: 'Fix laptop', Status: 'InProgress', Priority: 'High', RequestTitle: 'Hardware' }], totalCount: 1 });
    const be = makeTasksBackend({ client });
    const r = await be.listTasks({ status: 'in progress', priority: 'high', search: 'laptop' });
    const q = client.calls[0];
    expect(q).toContain('/api/Task/requestor/tasks/paged?');
    expect(q).toContain('status=InProgress');
    expect(q).toContain('priority=High');
    expect(q).toContain('search=laptop');
    expect(r.tasks).toEqual([{ id: 't1', title: 'Fix laptop', status: 'InProgress', priority: 'High', category: undefined, service: 'Hardware', assignedUnit: undefined, dueDate: undefined, ref: undefined }]);
    expect(r.totalCount).toBe(1);
  });

  test('getTask hits /api/Task/{id} and includes detail fields', async () => {
    const client = fakeClient({ Id: 't1', Label: 'Fix', Description: 'details', Notes: [{}], ChildTasks: [] });
    const be = makeTasksBackend({ client });
    const t = await be.getTask('t1');
    expect(client.calls[0]).toBe('/api/Task/t1');
    expect(t).toMatchObject({ id: 't1', title: 'Fix', description: 'details' });
    expect(t.notes).toHaveLength(1);
  });
});

describe('mail backend', () => {
  test('listMail normalizes folder aliases + maps rows', async () => {
    const client = fakeClient([{ Id: 'm1', FromName: 'Alice', Subject: 'Hi', Read: false }]);
    const be = makeMailBackend({ client });
    const r = await be.listMail({ folder: 'deleted', search: 'hi' });
    expect(client.calls[0]).toContain('folder=trash');
    expect(client.calls[0]).toContain('search=hi');
    expect(r.messages[0]).toMatchObject({ id: 'm1', from: 'Alice', subject: 'Hi', read: false });
  });

  test('counts combines unread-counts + stats', async () => {
    const client = fakeClient((p) => (p.includes('unread-counts') ? { inbox: 3 } : [{ Folder: 'inbox', Total: 10, Unread: 3 }]));
    const be = makeMailBackend({ client });
    const c = await be.counts();
    expect(c.inboxUnread).toBe(3);
    expect(c.folders.inbox).toEqual({ total: 10, unread: 3 });
  });

  test('getMail strips HTML from the body', async () => {
    const client = fakeClient({ Id: 'm1', FromName: 'Bob', Subject: 'S', Body: '<p>Hello <b>world</b></p>' });
    const m = await makeMailBackend({ client }).getMail('m1');
    expect(m.body).toBe('Hello world');
  });
});

describe('requests detail-by-number', () => {
  test('getTicketByNumber hits /number/{n} and flattens the detail dto', async () => {
    const client = fakeClient({ ticket: { RfsNumber: 'SR-9', Title: 'VPN', Status: 'Pending' }, assignedTo: { name: 'Carol' } });
    const r = await makeTicketListBackend({ client }).getTicketByNumber('SR-9');
    expect(client.calls[0]).toBe('/api/tickets/number/SR-9');
    expect(r).toMatchObject({ ticketNumber: 'SR-9', title: 'VPN', status: 'Pending', assignedTo: 'Carol' });
  });
});

describe('adapter routing + allowlist', () => {
  const tools = createAltioraTools({
    tasksBackend: { listTasks: async (f) => ({ tasks: [], filters: f }), getTask: async (id) => ({ id }), metadata: async () => ({}) },
    mailBackend: { listMail: async () => ({ messages: [] }), getMail: async (id) => ({ id }), counts: async () => ({ inboxUnread: 0 }) },
    ticketListBackend: { getTicketByNumber: async (n) => ({ ticketNumber: n }), listTickets: async () => ({}), metadata: async () => ({}) },
  });

  test('new V3 tools are allowlisted and route to their backends', async () => {
    expect(tools.isAllowed('tasks.list')).toBe(true);
    expect(tools.isAllowed('mail.counts')).toBe(true);
    expect(tools.isAllowed('requests.get')).toBe(true);
    expect(await tools.call('tasks.get', { taskId: 'x' })).toEqual({ id: 'x' });
    expect(await tools.call('requests.get', { requestNumber: 'SR-1' })).toEqual({ ticketNumber: 'SR-1' });
    expect(await tools.call('mail.get', { messageId: 'm' })).toEqual({ id: 'm' });
  });

  test('an off-list tool is still denied', async () => {
    await expect(tools.call('tasks.delete', {})).rejects.toBeInstanceOf(ToolNotAllowedError);
  });
});

describe('voice formatters', () => {
  test('task list: brief, spoken count, capped at 5 with "more"', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ title: `T${i}`, status: 'Open', priority: 'High' }));
    const out = fmt.formatTaskList({ tasks: many, totalCount: 7 });
    expect(out).toMatch(/^You have five tasks/);
    expect(out).toContain('7 in total');
  });
  test('empty list → friendly none', () => {
    expect(fmt.formatTaskList({ tasks: [] })).toMatch(/no tasks/i);
    expect(fmt.formatMailList({ messages: [], folder: 'inbox' })).toMatch(/no messages in inbox/i);
  });
  test('mail counts speaks the unread number', () => {
    expect(fmt.formatMailCounts({ inboxUnread: 2 })).toBe('You have two unread messages in your inbox.');
  });
  test('request detail states status + assignee', () => {
    const out = fmt.formatRequestDetail({ ticketNumber: 'SR-9', title: 'VPN', status: 'Pending', assignedTo: 'Carol' });
    expect(out).toContain('Request SR-9: VPN.');
    expect(out).toContain('Status: Pending.');
    expect(out).toContain('Assigned to Carol.');
  });
});
