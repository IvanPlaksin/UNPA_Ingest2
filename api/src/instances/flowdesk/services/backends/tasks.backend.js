'use strict';

/**
 * Tasks backend (V3) — lists + details the CURRENT user's Altiora tasks for the
 * voice/chat "my tasks" intents. Mirrors ticket-list.backend: runs under the
 * acting-user bearer (Altiora auto-scopes `requestor/tasks` to the caller).
 *
 * Endpoints (see V0 recon): list `GET /api/Task/requestor/tasks/paged`
 * (search/status/category/service/priority/sort), detail `GET /api/Task/{id}`,
 * filter options `GET /api/Task/requestor/tasks/metadata`.
 *
 * @module instances/flowdesk/services/backends/tasks.backend
 */

// Spoken phrasing → the exact Altiora status token. 'active' expands server-side.
const STATUS_ALIASES = {
  active: 'Active', ongoing: 'Active', open: 'Active',
  pending: 'Pending', inprogress: 'InProgress', 'in progress': 'InProgress',
  pendingreview: 'PendingReview', 'pending review': 'PendingReview',
  suspended: 'Suspended', completed: 'Completed', done: 'Completed',
  rejected: 'Rejected', declined: 'Rejected',
  all: 'all', any: 'all',
};
const PRIORITY_ALIASES = { critical: 'Critical', high: 'High', medium: 'Medium', normal: 'Medium', low: 'Low' };

function normalize(map, v) {
  if (!v) return undefined;
  const key = String(v).trim().toLowerCase();
  return map[key] || v; // pass a concrete token through unchanged
}

function buildQuery(f = {}) {
  const q = new URLSearchParams();
  const status = normalize(STATUS_ALIASES, f.status);
  if (status && status !== 'all') q.set('status', status);
  const priority = normalize(PRIORITY_ALIASES, f.priority);
  if (priority) q.set('priority', priority);
  if (f.category) q.set('category', f.category);
  if (f.service) q.set('service', f.service);
  if (f.search) q.set('search', f.search);
  if (f.sortKey) q.set('sortKey', f.sortKey);
  if (f.sortDirection) q.set('sortDirection', f.sortDirection);
  q.set('page', String(f.page || 1));
  q.set('pageSize', String(f.pageSize || 10));
  return q.toString();
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };

/** Altiora UserTask → the compact shape the chat/voice renders. */
function mapTask(t) {
  return {
    id: pick(t, ['id', 'Id', 'taskId', 'TaskId']),
    title: pick(t, ['label', 'Label', 'title', 'Title']),
    status: pick(t, ['status', 'Status']),
    priority: pick(t, ['priority', 'Priority']),
    category: pick(t, ['category', 'Category']),
    service: pick(t, ['requestTitle', 'RequestTitle', 'serviceDisplayName', 'ServiceDisplayName']),
    assignedUnit: pick(t, ['assignedUnit', 'AssignedUnit']),
    dueDate: pick(t, ['dueDate', 'DueDate']),
    ref: pick(t, ['rfsNumber', 'RfsNumber']) || pick(t, ['ticketNumber', 'TicketNumber']),
  };
}

function makeTasksBackend(deps = {}) {
  const clientOf = () => deps.client || require('../altiora-client').getAltioraClient();

  /** @returns {Promise<{tasks:Array, totalCount:number, page:number, hasMore:boolean, filters:Object}>} */
  async function listTasks(filters = {}) {
    const pageSize = filters.pageSize || 10;
    const page = filters.page || 1;
    const res = await clientOf().get(`/api/Task/requestor/tasks/paged?${buildQuery({ ...filters, page, pageSize })}`);
    const items = pick(res, ['items', 'Items']) || (Array.isArray(res) ? res : []);
    const totalCount = pick(res, ['totalCount', 'TotalCount']) ?? items.length;
    const tasks = items.map(mapTask);
    return { tasks, totalCount, page, hasMore: page * pageSize < totalCount, filters };
  }

  /** Full detail for one task (subtasks/notes/attachments/description). */
  async function getTask(taskId) {
    const t = await clientOf().get(`/api/Task/${encodeURIComponent(taskId)}`);
    return {
      ...mapTask(t),
      description: pick(t, ['description', 'Description']),
      notes: pick(t, ['notes', 'Notes']) || [],
      subtasks: pick(t, ['childTasks', 'ChildTasks']) || [],
      attachments: pick(t, ['attachments', 'Attachments']) || [],
    };
  }

  async function metadata() {
    const res = await clientOf().get('/api/Task/requestor/tasks/metadata');
    return { categories: pick(res, ['categories', 'Categories']) || [], services: pick(res, ['services', 'Services']) || [] };
  }

  return { listTasks, getTask, metadata };
}

module.exports = { makeTasksBackend, buildQuery, mapTask, normalize, STATUS_ALIASES, PRIORITY_ALIASES };
