'use strict';

/**
 * REQ-005 — the rows a turn SHOWS, as distinct from the controls that COLLECT.
 *
 * A control has a `slotId` and fills it. A list of the user's requests has neither
 * and fills nothing, so making it a control would mean explaining ever afterwards why
 * this one has no slot. Ratified as its own field: we spend enough of this project
 * undoing things used for what they were not.
 *
 * WHAT A ROW SAYS is taken from Altiora's own /requests table, read from its source
 * rather than chosen here — `accent, id, service, onBehalf, urgency, submitted,
 * status, tasks, completed, shared, rating, actions`. `accent` is a colour bar and
 * `actions` are the buttons Ivan asked to leave out; everything between them is a
 * field below. A request read in chat and the same request read on /requests should
 * not disagree about anything, including what is worth showing.
 *
 * A card carries NO action of its own. Clicking one asks the HOST to open its own
 * detail dialog through `revealIntent` — the chat does not know how that dialog
 * works and must not learn.
 *
 * @module instances/flowdesk/interpreter/cards
 */

const has = (v) => v !== undefined && v !== null && v !== '';
const field = (label, value, format) => (has(value)
  ? { label, value: String(value), ...(format ? { format } : {}) }
  : null);

/** A ticket row → the card the chat renders. */
function requestCard(r) {
  const fields = [
    field('Service', r.service),
    field('For', r.onBehalf, 'user'),
    field('Priority', r.priority),
    field('Submitted', r.createdAt, 'date'),
    field('Status', r.status, 'status'),
    field('Tasks', r.taskCount),
    field('Completed', r.completedAt, 'date'),
    field('Shared with', (r.sharedWith || []).join(', '), 'user'),
    field('Rating', r.rating),
  ].filter(Boolean);

  return {
    type: 'request',
    id: String(r.ticketNumber || ''),
    title: r.title || r.ticketNumber || 'Request',
    subtitle: r.ticketNumber || undefined,
    fields,
    // The colour bar Altiora leads each row with. Carried as a MEANING, not a colour:
    // the palette belongs to whoever is rendering, and a hex code here would be one
    // this chat is not entitled to choose.
    accent: r.slaStatus || r.status || undefined,
    ...(r.revealIntent ? { revealIntent: r.revealIntent } : {}),
  };
}

/** A task row → its card. */
function taskCard(r) {
  const fields = [
    field('Request', r.ticketNumber || r.requestTitle),
    field('Service', r.service),
    field('Assigned to', r.assignee, 'user'),
    field('Priority', r.priority),
    field('Due', r.dueDate, 'date'),
    field('Status', r.status, 'status'),
  ].filter(Boolean);

  return {
    type: 'task',
    id: String(r.id || r.taskId || ''),
    title: r.title || r.label || 'Task',
    subtitle: r.ticketNumber || undefined,
    fields,
    accent: r.priority || r.status || undefined,
    revealIntent: r.revealIntent
      || (r.ticketNumber ? { domain: 'requests', id: String(r.ticketNumber) } : undefined),
  };
}

/**
 * @param {'request'|'task'} kind
 * @param {object} row
 */
function toCard(kind, row) {
  const card = kind === 'task' ? taskCard(row || {}) : requestCard(row || {});
  // Never emit a card with nothing on it: an empty box in a conversation reads as
  // something that failed to load.
  return card.fields.length ? card : { ...card, fields: [field('Status', 'no details available')].filter(Boolean) };
}

module.exports = { toCard, requestCard, taskCard };
