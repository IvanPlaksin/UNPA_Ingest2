/**
 * Radix sync event contract.
 *
 * Events carry IDENTIFIERS, never the draft itself. The worker re-reads the
 * draft from the graph when it runs, so the index is written from the current
 * state rather than from whatever the state was when the event was queued. With
 * a payload snapshot, two edits in quick succession could be applied out of
 * order and leave the index holding the older one.
 *
 * @module services/radix/sync/sync-events
 */

'use strict';

const SYNC_EVENTS = Object.freeze({
  DRAFT_CREATED: 'draft.created',
  DRAFT_UPDATED: 'draft.updated',
  DRAFT_DELETED: 'draft.deleted'
});

const SYNC_EVENT_VALUES = Object.freeze(Object.values(SYNC_EVENTS));

/**
 * @typedef {Object} SyncEvent
 * @property {string} type - One of SYNC_EVENTS
 * @property {string} workspaceId
 * @property {string} draftId
 * @property {string} [timestamp] - ISO8601, stamped by the producer
 */

/**
 * @param {SyncEvent} event
 * @returns {string|null} error message, or null when valid
 */
function validateSyncEvent(event) {
  if (!event || typeof event !== 'object') return 'event must be an object';
  if (!SYNC_EVENT_VALUES.includes(event.type)) return `unknown event type: ${event.type}`;
  if (!event.workspaceId) return 'workspaceId is required';
  if (!event.draftId) return 'draftId is required';
  return null;
}

module.exports = {
  SYNC_EVENTS,
  SYNC_EVENT_VALUES,
  validateSyncEvent
};
