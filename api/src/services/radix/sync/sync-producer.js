/**
 * Emits Radix sync events.
 *
 * Enqueues to BullMQ so indexing never sits in a user request's critical path.
 *
 * When the queue is unavailable the event is applied INLINE instead of being
 * dropped. That trade is deliberate: a dropped event leaves the index silently
 * disagreeing with the graph, and nothing surfaces the divergence — retrieval
 * just quietly returns stale names and deleted drafts. Paying a few hundred
 * milliseconds on a write is the cheaper failure.
 *
 * @module services/radix/sync/sync-producer
 */

'use strict';

const { validateSyncEvent } = require('./sync-events');
const { handleSyncEvent } = require('./sync-handler');
const logger = require('../../../utils/logger');

const QUEUE_NAME = 'radix-sync';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 3600, count: 100 },
  // Failed jobs are kept: a divergence between graph and index needs to be
  // inspectable, not silently swept away.
  removeOnFail: { age: 7 * 24 * 3600 }
};

let _queue = null;
let _queueUnavailable = false;

/**
 * Lazily builds the queue. Returns null when Redis/BullMQ cannot be reached, so
 * callers fall back to inline handling.
 *
 * @returns {Object|null}
 */
function getQueue() {
  if (_queue) return _queue;
  if (_queueUnavailable) return null;

  try {
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');

    const connection = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null
    });

    _queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    return _queue;
  } catch (error) {
    _queueUnavailable = true;
    logger.child('Radix').warn('[Radix:sync] queue unavailable, falling back to inline', {
      message: error.message
    });
    return null;
  }
}

/**
 * Emits a sync event.
 *
 * Never throws — a failure to keep the index current must not fail the graph
 * write that triggered it. The graph is the source of truth; the index is a
 * derived view, and a stale view is recoverable by re-running sync.
 *
 * @param {import('./sync-events').SyncEvent} event
 * @param {Object} [deps] - Services for the inline fallback path
 * @returns {Promise<{queued: boolean, inline: boolean, error?: string}>}
 */
async function emitSyncEvent(event, deps = {}) {
  const log = logger.child('Radix');

  const invalid = validateSyncEvent(event);
  if (invalid) {
    log.warn('[Radix:sync] rejected invalid event', { invalid });
    return { queued: false, inline: false, error: invalid };
  }

  const payload = { ...event, timestamp: new Date().toISOString() };

  const queue = getQueue();
  if (queue) {
    try {
      await queue.add(payload.type, payload);
      return { queued: true, inline: false };
    } catch (error) {
      log.warn('[Radix:sync] enqueue failed, handling inline', { message: error.message });
    }
  }

  try {
    await handleSyncEvent(payload, {
      memgraphService: deps.memgraphService || require('../../memgraph.service'),
      qdrantService: deps.qdrantService || require('../../qdrant.service'),
      teiService: deps.teiService || require('../../tei.service')
    });
    return { queued: false, inline: true };
  } catch (error) {
    log.error('[Radix:sync] inline handling failed — index may be stale', {
      draftId: event.draftId,
      message: error.message
    });
    return { queued: false, inline: false, error: error.message };
  }
}

/** Closes the queue connection. */
async function closeSyncProducer() {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  _queueUnavailable = false;
}

module.exports = {
  emitSyncEvent,
  closeSyncProducer,
  getQueue,
  QUEUE_NAME,
  DEFAULT_JOB_OPTIONS
};
