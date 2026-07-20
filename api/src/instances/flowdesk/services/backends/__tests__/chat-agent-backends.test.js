'use strict';

/**
 * Chat-agent read backends: ticket-list (GET /api/tickets) + catalog-browse
 * (GET /servicecatalog/root|children), and their exposure through the tool adapter.
 */

const { makeTicketListBackend, buildQuery, normalizeStatus, mapTicket } = require('../ticket-list.backend');
const { makeCatalogBrowseBackend, mapNode } = require('../catalog-browse.backend');
const { createAltioraTools } = require('../../altiora-tools.adapter');

describe('ticket-list backend', () => {
  test('buildQuery: status alias + dates + paging; "all" drops the status filter', () => {
    expect(buildQuery({ status: 'ongoing', fromDate: '2026-06-01', page: 2, pageSize: 5 }))
      .toBe('status=ongoing&fromDate=2026-06-01&page=2&pageSize=5');
    expect(buildQuery({ status: 'all' })).toBe('page=1&pageSize=10');
    expect(buildQuery({ status: 'completed' })).toContain('status=Completed');
  });

  test('normalizeStatus maps aliases, passes concrete statuses through', () => {
    expect(normalizeStatus('done')).toBe('Completed');
    expect(normalizeStatus('open')).toBe('ongoing');
    expect(normalizeStatus('Auth Pending')).toBe('Auth Pending');
    expect(normalizeStatus(undefined)).toBeUndefined();
  });

  test('mapTicket prefers rfsNumber and normalizes casing', () => {
    expect(mapTicket({ RfsNumber: 'RFS-9', Title: 'T', Status: 'New', ServiceDisplayName: 'Sep', CreatedAt: 'x' }))
      .toMatchObject({ ticketNumber: 'RFS-9', title: 'T', status: 'New', service: 'Sep' });
  });

  test('listTickets calls the paged endpoint and shapes the result', async () => {
    const calls = [];
    const client = { get: async (p) => { calls.push(p); return { items: [{ ticketNumber: 'TKT-1', title: 'A', status: 'InProgress' }], totalCount: 3 }; } };
    const be = makeTicketListBackend({ client });
    const r = await be.listTickets({ status: 'ongoing', pageSize: 1 });
    expect(calls[0]).toBe('/api/tickets?status=ongoing&page=1&pageSize=1');
    expect(r.tickets).toHaveLength(1);
    expect(r).toMatchObject({ totalCount: 3, page: 1, hasMore: true });
  });

  test('metadata hits the mineOnly endpoint', async () => {
    const client = { get: async (p) => ({ categories: ['HR'], services: ['Sep'] }) };
    const r = await makeTicketListBackend({ client }).metadata();
    expect(r).toEqual({ categories: ['HR'], services: ['Sep'] });
  });
});

describe('catalog-browse backend', () => {
  test('mapNode normalizes and flags drill-down vs leaf', () => {
    expect(mapNode({ ServiceId: 'g1', DisplayName: 'HR', HasChildren: true, ChildCount: 5 }))
      .toMatchObject({ serviceId: 'g1', displayName: 'HR', hasChildren: true, childCount: 5, isRequestable: false });
  });

  test('browse(null) → root; browse(guid) → children', async () => {
    const calls = [];
    const client = { get: async (p) => { calls.push(p); return [{ serviceId: 'g1', displayName: 'HR', hasChildren: true, childCount: 2 }]; } };
    const be = makeCatalogBrowseBackend({ client });
    await be.browse(null);
    await be.browse('g1');
    expect(calls).toEqual(['/api/servicecatalog/root', '/api/servicecatalog/g1/children']);
  });
});

describe('tool adapter — new read tools', () => {
  test('sr.list / sr.metadata / catalog.browse are allowlisted and route to the backends', async () => {
    const ticketListBackend = { listTickets: async (f) => ({ tickets: [], totalCount: 0, filters: f }), metadata: async () => ({ categories: [], services: [] }) };
    const catalogBrowseBackend = { browse: async (id) => [{ serviceId: id || 'root' }] };
    const tools = createAltioraTools({ ticketListBackend, catalogBrowseBackend });
    expect(tools.isAllowed('sr.list')).toBe(true);
    expect(tools.isAllowed('catalog.browse')).toBe(true);
    expect(await tools.listMyTickets({ status: 'ongoing' })).toMatchObject({ filters: { status: 'ongoing' } });
    expect(await tools.browseCatalog('g1')).toEqual([{ serviceId: 'g1' }]);
    expect(await tools.ticketMetadata()).toEqual({ categories: [], services: [] });
  });

  test('a non-allowlisted tool is still denied', async () => {
    const tools = createAltioraTools({});
    await expect(tools.call('backlog.create', {})).rejects.toMatchObject({ code: 'TOOL_NOT_ALLOWED' });
  });
});
