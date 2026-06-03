/**
 * Extraction Queue Service
 *
 * BullMQ queue for async extraction jobs.
 * Handles job creation, status tracking, cancellation, and progress events.
 *
 * @module services/workspace/extraction/extraction-queue
 */

'use strict';

const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const { EventEmitter } = require('events');

const LOG_PREFIX = '[ExtractionQueue]';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null
};

const QUEUE_NAME = 'workspace-extraction';

const DEFAULT_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 100 },
  removeOnFail: { age: 7 * 24 * 3600 }
};

const WORKER_CONCURRENCY = 2;

// Singleton state
let _connection = null;
let _queue = null;
let _worker = null;
let _queueEvents = null;
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100);

function getConnection() {
  if (!_connection) {
    _connection = new IORedis(REDIS_CONFIG);
  }
  return _connection;
}

// ═══════════════════════════════════════════════════════════════
// INIT / SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function initExtractionQueue() {
  if (_queue) return;

  const conn = getConnection();

  _queue = new Queue(QUEUE_NAME, {
    connection: conn.duplicate(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS
  });

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: conn.duplicate(),
    concurrency: WORKER_CONCURRENCY,
    limiter: { max: 5, duration: 60000 }
  });

  _queueEvents = new QueueEvents(QUEUE_NAME, { connection: conn.duplicate() });

  _worker.on('completed', (job, result) => {
    console.log(`${LOG_PREFIX} Job ${job.id} completed`);
    emitProgress(job.id, { phase: 'completed', progress: 100, result });
  });

  _worker.on('failed', (job, err) => {
    console.error(`${LOG_PREFIX} Job ${job?.id} failed: ${err.message}`);
    emitProgress(job?.id, { phase: 'failed', progress: 0, error: err.message });
  });

  _worker.on('progress', (job, progress) => {
    emitProgress(job.id, progress);
  });

  _worker.on('active', (job) => {
    console.log(`${LOG_PREFIX} Job ${job.id} started`);
    emitProgress(job.id, { phase: 'started', progress: 0 });
  });

  console.log(`${LOG_PREFIX} Initialized (concurrency=${WORKER_CONCURRENCY})`);
}

async function shutdownExtractionQueue() {
  if (_worker) { await _worker.close(); _worker = null; }
  if (_queueEvents) { await _queueEvents.close(); _queueEvents = null; }
  if (_queue) { await _queue.close(); _queue = null; }
  console.log(`${LOG_PREFIX} Shutdown`);
}

// ═══════════════════════════════════════════════════════════════
// JOB PROCESSING
// ═══════════════════════════════════════════════════════════════

async function processJob(job) {
  const { workspaceId, sourceId, options = {} } = job.data;
  console.log(`${LOG_PREFIX} Processing job ${job.id} (ws=${workspaceId}, src=${sourceId})`);

  const { runExtractionPipeline } = require('./extraction-pipeline');

  const onProgress = async (progress) => {
    try { await job.updateProgress(progress); } catch { /* ignore */ }
  };

  const result = await runExtractionPipeline(workspaceId, sourceId, {
    ...options,
    onProgress
  });

  if (!result.success) {
    throw new Error(result.error || 'Extraction failed');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

async function enqueueExtraction(workspaceId, sourceId, options = {}) {
  await initExtractionQueue();

  const { priority = 5, ...extractOptions } = options;
  const jobId = `extract-${workspaceId.slice(0, 8)}-${sourceId.slice(0, 8)}-${Date.now()}`;

  const job = await _queue.add('extract', {
    workspaceId,
    sourceId,
    options: extractOptions,
    enqueuedAt: new Date().toISOString()
  }, { priority, jobId });

  console.log(`${LOG_PREFIX} Enqueued job ${job.id}`);
  return { jobId: job.id, workspaceId, sourceId };
}

async function getJobStatus(jobId) {
  await initExtractionQueue();
  const job = await _queue.getJob(jobId);
  if (!job) return { jobId, status: 'not_found', exists: false };

  const state = await job.getState();
  return {
    jobId,
    status: state,
    exists: true,
    workspaceId: job.data.workspaceId,
    sourceId: job.data.sourceId,
    progress: job.progress || {},
    enqueuedAt: job.data.enqueuedAt,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    returnvalue: state === 'completed' ? job.returnvalue : undefined
  };
}

async function cancelJob(jobId) {
  await initExtractionQueue();
  const job = await _queue.getJob(jobId);
  if (!job) return { success: false, message: 'Job not found' };

  const state = await job.getState();
  if (state === 'completed' || state === 'failed') {
    return { success: false, message: `Cannot cancel ${state} job` };
  }

  if (state === 'active') {
    await job.moveToFailed(new Error('Cancelled by user'), 'cancelled');
  } else {
    await job.remove();
  }

  emitProgress(jobId, { phase: 'cancelled', progress: 0 });
  console.log(`${LOG_PREFIX} Cancelled job ${jobId}`);
  return { success: true, message: 'Job cancelled' };
}

async function getQueueStats() {
  await initExtractionQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    _queue.getWaitingCount(),
    _queue.getActiveCount(),
    _queue.getCompletedCount(),
    _queue.getFailedCount(),
    _queue.getDelayedCount()
  ]);
  return { waiting, active, completed, failed, delayed, total: waiting + active + delayed };
}

async function getWorkspaceJobs(workspaceId, options = {}) {
  await initExtractionQueue();
  const { status: statuses = ['active', 'waiting', 'completed', 'failed'], limit = 20 } = options;

  const jobs = [];
  for (const state of statuses) {
    let stateJobs;
    try {
      switch (state) {
        case 'active':    stateJobs = await _queue.getActive(0, limit); break;
        case 'waiting':   stateJobs = await _queue.getWaiting(0, limit); break;
        case 'completed': stateJobs = await _queue.getCompleted(0, limit); break;
        case 'failed':    stateJobs = await _queue.getFailed(0, limit); break;
        case 'delayed':   stateJobs = await _queue.getDelayed(0, limit); break;
        default: stateJobs = [];
      }
    } catch { stateJobs = []; }

    const filtered = (stateJobs || []).filter(j => j.data?.workspaceId === workspaceId);
    jobs.push(...filtered.map(j => ({
      jobId: j.id,
      status: state,
      sourceId: j.data.sourceId,
      progress: j.progress,
      enqueuedAt: j.data.enqueuedAt,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn
    })));
  }

  return jobs.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════
// PROGRESS EVENTS (for SSE)
// ═══════════════════════════════════════════════════════════════

function emitProgress(jobId, progress) {
  if (!jobId) return;
  progressEmitter.emit(`job:${jobId}`, {
    jobId,
    timestamp: new Date().toISOString(),
    ...progress
  });
}

function subscribeToProgress(jobId, callback) {
  const event = `job:${jobId}`;
  progressEmitter.on(event, callback);
  return () => progressEmitter.off(event, callback);
}

// ── Delegate enqueueExtraction to unified queue ────────────
// The original processJob + worker are kept as dead code during the
// transition period. New jobs go through unified-queue.js.

async function _enqueueViaUnified(workspaceId, sourceId, options = {}) {
  const { enqueueWorkspaceSource } = require('../../extraction/unified-queue');
  return enqueueWorkspaceSource(workspaceId, sourceId, options);
}

async function _subscribeViaUnified(jobId, callback) {
  const unifiedQ = require('../../extraction/unified-queue');
  return unifiedQ.subscribeToProgress(jobId, callback);
}

module.exports = {
  initExtractionQueue,
  shutdownExtractionQueue,
  // Delegates to unified queue
  enqueueExtraction: (workspaceId, sourceId, options) => _enqueueViaUnified(workspaceId, sourceId, options),
  getJobStatus: async (jobId) => {
    const { getJobStatus: unified } = require('../../extraction/unified-queue');
    return unified(jobId);
  },
  cancelJob: async (jobId) => {
    const { cancelJob: unified } = require('../../extraction/unified-queue');
    return unified(jobId);
  },
  getQueueStats: async () => {
    const { getQueueStats: unified } = require('../../extraction/unified-queue');
    return unified();
  },
  getWorkspaceJobs: async (workspaceId, options) => {
    const { getWorkspaceJobs: unified } = require('../../extraction/unified-queue');
    return unified(workspaceId, options);
  },
  subscribeToProgress: (jobId, callback) => _subscribeViaUnified(jobId, callback),
  progressEmitter,
};
