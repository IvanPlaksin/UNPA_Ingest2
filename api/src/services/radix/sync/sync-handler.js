/**
 * Applies one sync event to the vector index.
 *
 * Shared by the queue worker and by the producer's inline fallback, so the index
 * is written the same way whichever path runs.
 *
 * The handler always re-reads the draft from the graph. That is what makes it
 * safe to replay, to run out of order, and to run twice: the outcome depends on
 * the draft's CURRENT state, not on when the event was queued.
 *
 * @module services/radix/sync/sync-handler
 */

'use strict';

const { SYNC_EVENTS, validateSyncEvent } = require('./sync-events');
const { buildContent, draftTypeFromLabels } = require('../strategies/shared/draft-hydration');
const logger = require('../../../utils/logger');

/** Marks a point as a draft, distinguishing it from a source_chunk. */
const DRAFT_KIND = 'draft';

/**
 * Reads a draft's current state from the graph.
 *
 * Scoped through the workspace edge so a draft id from another workspace cannot
 * be indexed into this one.
 *
 * @param {Object} memgraph
 * @param {string} workspaceId
 * @param {string} draftId
 * @returns {Promise<{props: Object, labels: string[]}|null>}
 */
async function readDraft(memgraph, workspaceId, draftId) {
  const rows = await memgraph.runQuery(
    `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d {id: $draftId})
     RETURN properties(d) AS props, labels(d) AS labels`,
    { wsId: workspaceId, draftId }
  );

  const row = (rows || [])[0];
  if (!row || !row.props) return null;
  return { props: row.props, labels: row.labels || [] };
}

/**
 * Applies a sync event.
 *
 * @param {import('./sync-events').SyncEvent} event
 * @param {Object} deps
 * @param {Object} deps.memgraphService
 * @param {Object} deps.qdrantService
 * @param {Object} deps.teiService
 * @returns {Promise<{action: string, draftId: string}>}
 */
async function handleSyncEvent(event, deps) {
  const error = validateSyncEvent(event);
  if (error) throw new Error(`Invalid sync event: ${error}`);

  const { memgraphService, qdrantService, teiService } = deps;
  if (!memgraphService || !qdrantService || !teiService) {
    throw new Error('handleSyncEvent requires memgraphService, qdrantService and teiService');
  }

  const { workspaceId, draftId, type } = event;
  const log = logger.child('Radix');

  if (type === SYNC_EVENTS.DRAFT_DELETED) {
    await qdrantService.workspaceDeletePoints(workspaceId, [draftId]);
    log.debug('[Radix:sync] deleted point', { draftId });
    return { action: 'deleted', draftId };
  }

  const draft = await readDraft(memgraphService, workspaceId, draftId);

  // The draft is gone from the graph — whatever the event said, the correct end
  // state is "not in the index". This is what makes a stale or replayed event
  // harmless rather than resurrecting deleted knowledge.
  if (!draft) {
    await qdrantService.workspaceDeletePoints(workspaceId, [draftId]);
    log.debug('[Radix:sync] draft absent from graph, point removed', { draftId });
    return { action: 'deleted-missing', draftId };
  }

  const { props, labels } = draft;
  const name = props.name || draftId;
  const text = buildContent(props, name);
  const vector = await teiService.getEmbedding(text);

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`Embedding failed for draft ${draftId}`);
  }

  await qdrantService.workspaceUpsert(workspaceId, [{
    id: draftId,
    vector,
    payload: {
      kind: DRAFT_KIND,
      draftNodeId: draftId,
      type: props.type || draftTypeFromLabels(labels),
      knowledgeFamily: props.knowledgeFamily || null,
      name,
      // Status lives in the payload so retrieval can filter on it. A REJECTED
      // draft keeps its point rather than being deleted: `excludeDraftStatuses`
      // is configurable, and deleting would make that setting a lie for any
      // caller who wants to see what was rejected and why.
      status: props.status || null,
      sourceId: ''
    }
  }]);

  log.debug('[Radix:sync] indexed draft', { draftId, status: props.status });
  return { action: 'indexed', draftId };
}

module.exports = {
  handleSyncEvent,
  readDraft,
  DRAFT_KIND
};
