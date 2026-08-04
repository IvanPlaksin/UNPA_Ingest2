/**
 * BullMQ worker for Radix sync events.
 *
 * @module services/radix/sync/sync-worker
 */

'use strict';

const { handleSyncEvent } = require('./sync-handler');
const { QUEUE_NAME } = require('./sync-producer');
const logger = require('../../../utils/logger');

const WORKER_CONCURRENCY = parseInt(process.env.RADIX_SYNC_CONCURRENCY || '4', 10);

let _worker = null;
let _connection = null;

/**
 * Starts the worker. Idempotent.
 *
 * @param {Object} [deps] - Service overrides, for tests
 * @returns {Object|null} the worker, or null when BullMQ is unavailable
 */
function startSyncWorker(deps = {}) {
  if (_worker) return _worker;

  const log = logger.child('Radix');

  try {
    const { Worker } = require('bullmq');
    const IORedis = require('ioredis');

    _connection = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null
    });

    const services = {
      memgraphService: deps.memgraphService || require('../../memgraph.service'),
      qdrantService: deps.qdrantService || require('../../qdrant.service'),
      teiService: deps.teiService || require('../../tei.service')
    };

    _worker = new Worker(
      QUEUE_NAME,
      async (job) => handleSyncEvent(job.data, services),
      { connection: _connection, concurrency: WORKER_CONCURRENCY }
    );

    _worker.on('failed', (job, err) => {
      // Logged loudly: a failed sync job means the index disagrees with the
      // graph, and nothing else in the system will notice.
      log.error('[Radix:sync] job failed', {
        jobId: job && job.id,
        draftId: job && job.data && job.data.draftId,
        attempts: job && job.attemptsMade,
        message: err.message
      });
    });

    log.info('[Radix:sync] worker started', { queue: QUEUE_NAME, concurrency: WORKER_CONCURRENCY });
    return _worker;
  } catch (error) {
    log.warn('[Radix:sync] worker not started', { message: error.message });
    return null;
  }
}

/**
 * Stops the worker, letting the job in flight finish so a half-applied sync is
 * not left behind.
 *
 * @returns {Promise<void>}
 */
async function stopSyncWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}

module.exports = {
  startSyncWorker,
  stopSyncWorker,
  WORKER_CONCURRENCY
};
