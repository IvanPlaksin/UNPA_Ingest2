'use strict';

/**
 * Unified Extraction Queue
 *
 * Single BullMQ queue (`unified-extraction`) for both DOCUMENT and WORKSPACE modes.
 * Replaces the old `workspace-extraction` queue.
 *
 * Job data shape:
 *   { mode, sourceId, workspaceId?, adapterName, options, enqueuedAt }
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const { EventEmitter } = require('events');

const QUEUE_NAME = 'unified-extraction';
const WORKER_CONCURRENCY = 3;

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 100 },
  removeOnFail:     { age: 7 * 24 * 3600 },
};

let _connection  = null;
let _queue       = null;
let _worker      = null;
let _queueEvents = null;
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(200);

function getConnection() {
  if (!_connection) _connection = new IORedis(REDIS_CONFIG);
  return _connection;
}

// ═══════════════════════════════════════════════════════════
// INIT / SHUTDOWN
// ═══════════════════════════════════════════════════════════

async function initQueue() {
  if (_queue) return;
  const conn = getConnection();

  _queue = new Queue(QUEUE_NAME, {
    connection: conn.duplicate(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: conn.duplicate(),
    concurrency: WORKER_CONCURRENCY,
    limiter: { max: 5, duration: 60000 },
  });

  _queueEvents = new QueueEvents(QUEUE_NAME, { connection: conn.duplicate() });

  _worker.on('completed', (job, result) => {
    console.log(`[UnifiedQueue] Job ${job.id} completed`);
    emitProgress(job.id, { phase: 'completed', progress: 100, result });
  });
  _worker.on('failed', (job, err) => {
    console.error(`[UnifiedQueue] Job ${job?.id} failed: ${err.message}`);
    emitProgress(job?.id, { phase: 'failed', progress: 0, error: err.message });
  });
  _worker.on('progress', (job, progress) => {
    emitProgress(job.id, progress);
  });
  _worker.on('active', (job) => {
    emitProgress(job.id, { phase: 'started', progress: 0 });
  });

  console.log(`[UnifiedQueue] Initialized (concurrency=${WORKER_CONCURRENCY})`);
}

async function shutdownQueue() {
  if (_worker)      { await _worker.close();      _worker      = null; }
  if (_queueEvents) { await _queueEvents.close();  _queueEvents = null; }
  if (_queue)       { await _queue.close();        _queue       = null; }
  console.log('[UnifiedQueue] Shutdown');
}

// ═══════════════════════════════════════════════════════════
// JOB PROCESSING
// ═══════════════════════════════════════════════════════════

async function processJob(job) {
  const { mode, sourceId, workspaceId, adapterName, options = {} } = job.data;
  console.log(`[UnifiedQueue] Processing job ${job.id} mode=${mode} source=${sourceId}`);

  const { runPipeline } = require('./unified-pipeline');
  const adapter = adapterName === 'workspace'
    ? require('./adapters/workspace.adapter')
    : require('./adapters/document.adapter');

  const result = await runPipeline(mode, sourceId, adapter, {
    ...options,
    workspaceId,
    jobId: job.id,
    bullJob: job,
  });

  if (!result.success) throw new Error(result.error || 'Extraction failed');
  return result;
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

async function enqueueDocument(documentId, options = {}) {
  await initQueue();
  const jobId = `extract-doc-${documentId.slice(0, 8)}-${Date.now()}`;
  const job = await _queue.add('extract', {
    mode: 'DOCUMENT',
    sourceId: documentId,
    workspaceId: null,
    adapterName: 'document',
    options,
    enqueuedAt: new Date().toISOString(),
  }, { ...DEFAULT_JOB_OPTIONS, jobId, priority: options.priority || 5 });
  console.log(`[UnifiedQueue] Enqueued document job ${job.id}`);
  return { jobId: job.id, documentId };
}

async function enqueueWorkspaceSource(workspaceId, sourceId, options = {}) {
  await initQueue();
  const jobId = `extract-ws-${workspaceId.slice(0, 8)}-${sourceId.slice(0, 8)}-${Date.now()}`;
  const job = await _queue.add('extract', {
    mode: 'WORKSPACE',
    sourceId,
    workspaceId,
    adapterName: 'workspace',
    options,
    enqueuedAt: new Date().toISOString(),
  }, { ...DEFAULT_JOB_OPTIONS, jobId, priority: options.priority || 5 });
  console.log(`[UnifiedQueue] Enqueued workspace job ${job.id}`);
  return { jobId: job.id, workspaceId, sourceId };
}

async function getJobStatus(jobId) {
  await initQueue();
  const job = await _queue.getJob(jobId);
  if (!job) return { jobId, status: 'not_found', exists: false };

  const state = await job.getState();
  return {
    jobId,
    status: state,
    exists: true,
    mode: job.data.mode,
    sourceId: job.data.sourceId,
    workspaceId: job.data.workspaceId,
    progress: job.progress || {},
    enqueuedAt: job.data.enqueuedAt,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    returnvalue: state === 'completed' ? job.returnvalue : undefined,
  };
}

async function cancelJob(jobId) {
  await initQueue();
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
  return { success: true };
}

async function getQueueStats() {
  await initQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    _queue.getWaitingCount(),
    _queue.getActiveCount(),
    _queue.getCompletedCount(),
    _queue.getFailedCount(),
    _queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed, total: waiting + active + delayed };
}

// Get jobs for a specific workspace (for workspace job listing)
async function getWorkspaceJobs(workspaceId, options = {}) {
  await initQueue();
  const { limit = 20 } = options;
  const states = ['active', 'waiting', 'completed', 'failed'];
  const jobs = [];
  for (const state of states) {
    let stateJobs = [];
    try {
      switch (state) {
        case 'active':    stateJobs = await _queue.getActive(0, limit); break;
        case 'waiting':   stateJobs = await _queue.getWaiting(0, limit); break;
        case 'completed': stateJobs = await _queue.getCompleted(0, limit); break;
        case 'failed':    stateJobs = await _queue.getFailed(0, limit); break;
      }
    } catch { stateJobs = []; }
    const filtered = (stateJobs || []).filter(j => j.data?.workspaceId === workspaceId);
    jobs.push(...filtered.map(j => ({
      jobId: j.id, status: state, sourceId: j.data.sourceId,
      progress: j.progress, enqueuedAt: j.data.enqueuedAt,
      processedOn: j.processedOn, finishedOn: j.finishedOn,
    })));
  }
  return jobs.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════
// PROGRESS EVENTS (for SSE)
// ═══════════════════════════════════════════════════════════

function emitProgress(jobId, progress) {
  if (!jobId) return;
  progressEmitter.emit(`job:${jobId}`, { jobId, timestamp: new Date().toISOString(), ...progress });
}

function subscribeToProgress(jobId, callback) {
  const event = `job:${jobId}`;
  progressEmitter.on(event, callback);
  return () => progressEmitter.off(event, callback);
}

module.exports = {
  initQueue,
  shutdownQueue,
  enqueueDocument,
  enqueueWorkspaceSource,
  getJobStatus,
  cancelJob,
  getQueueStats,
  getWorkspaceJobs,
  subscribeToProgress,
  progressEmitter,
};
