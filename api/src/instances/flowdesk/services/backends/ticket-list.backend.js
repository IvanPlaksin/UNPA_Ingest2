'use strict';

/**
 * Ticket-list backend — lists the CURRENT user's Altiora service requests
 * (`GET /api/tickets`) for the chat agent's "show my requests" intent.
 *
 * Identity / scoping: the Altiora endpoint auto-scopes to the AUTHENTICATED user
 * (there is no requesterId param) — a non-agent caller sees only their own tickets.
 * So this MUST run under the acting-user bearer (the proxy-forwarded end-user
 * token) to return the right person's tickets. In the standalone dev UI there is no
 * forwarded bearer, so the client falls back to the service account and the list is
 * the service account's — a known dev-only limitation; production (proxy) is correct.
 *
 * @module instances/flowdesk/services/backends/ticket-list.backend
 */

const STATUS_ALIASES = {
  ongoing: 'ongoing', open: 'ongoing', active: 'ongoing', pending: 'Pending',
  completed: 'Completed', done: 'Completed', closed: 'Completed',
  rejected: 'Rejected', declined: 'Rejected',
  inprogress: 'InProgress', 'in progress': 'InProgress',
  all: 'all', any: 'all',
};

function normalizeStatus(status) {
  if (!status) return undefined;
  const key = String(status).trim().toLowerCase();
  return STATUS_ALIASES[key] || status; // pass a concrete Altiora status through unchanged
}

function buildQuery(f = {}) {
  const q = new URLSearchParams();
  const status = normalizeStatus(f.status);
  if (status && status !== 'all') q.set('status', status);
  if (f.fromDate) q.set('fromDate', f.fromDate);
  if (f.toDate) q.set('toDate', f.toDate);
  if (f.service) q.set('service', f.service);
  if (f.search) q.set('search', f.search);
  if (f.mineOnly) q.set('mineOnly', 'true');
  q.set('page', String(f.page || 1));
  q.set('pageSize', String(f.pageSize || 10));
  return q.toString();
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };

/** Altiora Ticket → the compact shape the chat renders. rfsNumber is the preferred ref. */
function mapTicket(t) {
  return {
    ticketNumber: pick(t, ['rfsNumber', 'RfsNumber']) || pick(t, ['ticketNumber', 'TicketNumber']),
    title: pick(t, ['title', 'Title']),
    status: pick(t, ['status', 'Status']),
    service: pick(t, ['serviceDisplayName', 'ServiceDisplayName']) || pick(t, ['categoryName', 'CategoryName']),
    priority: pick(t, ['priority', 'Priority']),
    createdAt: pick(t, ['createdAt', 'CreatedAt']),
    dueDate: pick(t, ['dueDate', 'DueDate']),
    slaStatus: pick(t, ['slaStatus', 'SlaStatus']),
  };
}

function makeTicketListBackend(deps = {}) {
  const clientOf = () => deps.client || require('../altiora-client').getAltioraClient();

  /**
   * @param {Object} filters  {status, fromDate, toDate, service, search, page, pageSize, mineOnly}
   * @returns {Promise<{tickets:Array, totalCount:number, page:number, hasMore:boolean, filters:Object}>}
   */
  async function listTickets(filters = {}) {
    const pageSize = filters.pageSize || 10;
    const page = filters.page || 1;
    const res = await clientOf().get(`/api/tickets?${buildQuery({ ...filters, page, pageSize })}`);
    const items = pick(res, ['items', 'Items']) || (Array.isArray(res) ? res : []);
    const totalCount = pick(res, ['totalCount', 'TotalCount']) ?? items.length;
    const tickets = items.map(mapTicket);
    return { tickets, totalCount, page, hasMore: page * pageSize < totalCount, filters };
  }

  /** Filter-option metadata (categories/services) for the current user's tickets. */
  async function metadata() {
    const res = await clientOf().get('/api/tickets/metadata?mineOnly=true');
    return {
      categories: pick(res, ['categories', 'Categories']) || [],
      services: pick(res, ['services', 'Services']) || [],
    };
  }

  /**
   * Full detail for one request by its human number (V3). Accepts "SR-12345",
   * "12345", "UN…" etc. — the .NET `GET /api/tickets/number/{n}` resolves it and
   * returns a TicketDetailsDto (status, approver, assignee, comments, history).
   */
  async function getTicketByNumber(ticketNumber) {
    const n = String(ticketNumber || '').trim();
    const res = await clientOf().get(`/api/tickets/number/${encodeURIComponent(n)}`);
    const t = pick(res, ['ticket', 'Ticket']) || res;
    const named = (o) => pick(o || {}, ['name', 'Name', 'displayName', 'DisplayName', 'fullName', 'FullName']);
    return {
      ...mapTicket(t),
      description: pick(t, ['description', 'Description']),
      requester: named(pick(res, ['requester', 'Requester'])) || pick(t, ['requesterName', 'RequesterName']),
      assignedTo: named(pick(res, ['assignedTo', 'AssignedTo'])) || pick(t, ['assignedToName', 'AssignedToName']),
      approver: named(pick(res, ['approver', 'Approver'])) || pick(t, ['approverName', 'ApproverName']),
      tasksCount: (pick(res, ['tasks', 'Tasks']) || []).length,
    };
  }

  return { listTickets, metadata, getTicketByNumber };
}

module.exports = { makeTicketListBackend, buildQuery, mapTicket, normalizeStatus };
