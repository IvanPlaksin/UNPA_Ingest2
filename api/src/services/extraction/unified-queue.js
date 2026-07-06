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

const { Queue, Worker, QueueEvents, UnrecoverableError } = require('bullmq');
const IORedis = require('ioredis');
const { EventEmitter } = require('events');

const QUEUE_NAME = 'unified-extraction';
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);

// Desired concurrency — may be updated by setConcurrency() before initQueue() runs.
// Stored here so initQueue() picks up the right value whenever it's eventually called.
let _desiredConcurrency = WORKER_CONCURRENCY;

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
};

// Errors that should NOT be retried (permanent failures regardless of retry count)
function _isPaymentError(e) {
  const m = (e?.message || e?.failedReason || '').toLowerCase();
  return m.includes('credit balance is too low') ||
         m.includes('insufficient credits') ||
         m.includes('plans & billing') ||
         m.includes('payment required');
}

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

function _attachWorkerHandlers(w) {
  w.on('completed', (job, result) => {
    console.log(`[UnifiedQueue] Job ${job.id} completed`);
    emitProgress(job.id, { phase: 'completed', progress: 100, result });
  });
  w.on('failed', async (job, err) => {
    console.error(`[UnifiedQueue] Job ${job?.id} failed: ${err.message}`);
    emitProgress(job?.id, { phase: 'failed', progress: 0, error: err.message });

    const isFinal = err?.name === 'UnrecoverableError' || job.attemptsMade >= DEFAULT_JOB_OPTIONS.attempts;
    const affectsDoc = job?.data?.mode === 'DOCUMENT' || job?.data?.mode === 'METHODOLOGY';
    if (affectsDoc && job?.data?.sourceId && isFinal) {
      const sourceId = job.data.sourceId;
      const now = new Date().toISOString();
      try {
        const mg = require('../memgraph.service');
        await mg.runQuery(
          `MATCH (d:Document {id: '${sourceId}'})
           SET d.status = 'EXTRACTION_FAILED',
               d.extractionError = $err,
               d.aiExtractedAt = $now`,
          { err: err.message.slice(0, 500), now }
        );
        console.log(`[UnifiedQueue] Marked doc ${sourceId} as EXTRACTION_FAILED`);
      } catch (mgErr) {
        console.warn(`[UnifiedQueue] Could not mark doc ${sourceId} as failed: ${mgErr.message}`);
      }
    }
  });
  w.on('progress', (job, progress) => {
    emitProgress(job.id, progress);
  });
  w.on('active', (job) => {
    console.log(`[TEST-LOG][UnifiedQueue] Job ACTIVE: id=${job.id} mode=${job.data?.mode} source=${job.data?.sourceId}`);
    emitProgress(job.id, { phase: 'started', progress: 0 });
  });
}

async function initQueue() {
  if (_queue) return;
  const conn = getConnection();

  _queue = new Queue(QUEUE_NAME, {
    connection: conn.duplicate(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  _queueEvents = new QueueEvents(QUEUE_NAME, { connection: conn.duplicate() });

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection: conn.duplicate(),
    concurrency: _desiredConcurrency,
  });
  _attachWorkerHandlers(_worker);

  console.log(`[UnifiedQueue] Initialized (concurrency=${_desiredConcurrency})`);
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
  try {
    return await _processJobInner(job);
  } catch (e) {
    // Convert permanent billing/payment errors to UnrecoverableError so BullMQ
    // does not waste retry attempts (the error will persist until credits are added)
    if (_isPaymentError(e)) {
      console.error(`[UnifiedQueue] Payment error on job ${job.id} — marking unrecoverable: ${e.message.slice(0, 120)}`);
      throw new UnrecoverableError(e.message);
    }
    throw e;
  }
}

async function _processJobInner(job) {
  const { mode, sourceId, workspaceId, adapterName, options = {} } = job.data;
  console.log(`[UnifiedQueue] Processing job ${job.id} mode=${mode} source=${sourceId}`);

  // ── METHODOLOGY mode ────────────────────────────────────────────────────────
  if (mode === 'METHODOLOGY') {
    return _processMethodologyJob(job);
  }

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

  // Auto-sync to Entity Store after successful extraction (non-fatal)
  if (mode === 'DOCUMENT') {
    try {
      const { syncDocument } = require('./es-sync.worker');
      const namespace = options.esNamespace || 'DEFAULT';
      const syncResult = await syncDocument(sourceId, { namespace });
      result.esSync = syncResult;
    } catch (syncErr) {
      console.warn(`[UnifiedQueue] ES sync post-extraction error (doc=${sourceId}): ${syncErr.message}`);
      result.esSyncError = syncErr.message;
    }
  }

  return result;
}

/**
 * METHODOLOGY mode processor.
 *
 * Job data shape:
 *   { mode:'METHODOLOGY', sourceId:docId, methodology:'M1'|['M1','M2'],
 *     options:{}, enqueuedAt }
 *
 * Runs the requested methodology (or methodologies) from the registry and
 * stores each result in Redis under extraction:run:{runId}.
 * Returns { success, docId, runs:[{methodology,runId,status,...}] }.
 */
async function _processMethodologyJob(job) {
  const { sourceId, methodology, options = {} } = job.data;
  const methodologies = Array.isArray(methodology) ? methodology : [methodology || 'M1'];

  // Single methodology → full pipeline so entities persist to Memgraph + Qdrant
  if (methodologies.length === 1) {
    const { runPipeline } = require('./unified-pipeline');
    const adapter = require('./adapters/document.adapter');
    const result = await runPipeline('DOCUMENT', sourceId, adapter, {
      ...options,
      registryMethodology: methodologies[0],
      jobId: job.id,
      bullJob: job,
    });
    if (!result.success) throw new Error(result.error || 'Extraction pipeline failed');
    // Auto-sync to Entity Store (same as DOCUMENT mode handler) — capture result for returnvalue
    try {
      const { syncDocument } = require('./es-sync.worker');
      const syncResult = await syncDocument(sourceId, { namespace: options.esNamespace || 'DEFAULT' });
      result.esSync = syncResult;
    } catch (syncErr) {
      console.warn(`[UnifiedQueue] ES sync error (doc=${sourceId}): ${syncErr.message}`);
      result.esSyncError = syncErr.message;
    }
    return {
      success: true,
      docId: sourceId,
      methodology: methodologies,
      // Expose full pipeline data so JobDetailDrawer can render stats/steps/esSync
      // (same fields the DOCUMENT mode returnvalue provides)
      stats:              result.stats,
      steps:              result.steps,
      esSync:             result.esSync,
      postProcessResults: result.postProcessResults,
      log:                result.log,
      extractionJobId:    result.extractionJobId,
      methodologyId:      result.methodologyId,
      resultId:           result.resultId,
      runs: [{
        methodology:  methodologies[0],
        runId:        result.extractionJobId,
        status:       'completed',
        timeMs:       result.stats?.durationMs || 0,
        entities:     result.stats?.entitiesExtracted || 0,
        relations:    result.stats?.relationsFound || 0,
        vectorsIndexed: result.stats?.vectorsIndexed || 0,
      }],
    };
  }

  // Multi-methodology → lightweight comparison runner (results in Redis only, for evaluation)
  const { registry } = require('./methodology-registry');
  const { documentExtractionService: docSvc } =
    require('../knowledge/document-extraction.service');

  // Load document
  const doc = await docSvc._loadDoc(sourceId);
  if (!doc) throw new Error(`METHODOLOGY: document not found: ${sourceId}`);

  let text = '';
  if (doc.storagePath) {
    try { text = await docSvc._readText(doc.storagePath, doc.originalname); }
    catch (e) { console.warn(`[UnifiedQueue] METHODOLOGY: _readText error: ${e.message}`); }
  }
  if (!text || text.length < 10) throw new Error('METHODOLOGY: document has no extractable text');

  // Load pre-marked entities
  let existing = [];
  try {
    const mg = require('../memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (d:Document {id: $id})-[:MENTIONS]->(em:EntityMention)
       RETURN em.id AS id, em.name AS name, em.type AS type LIMIT 200`,
      { id: sourceId }
    );
    existing = rows.map(r => ({ id: r.id, name: r.name, type: r.type }));
  } catch { /* non-fatal */ }

  await job.updateProgress({ phase: 'extracting', progress: 10 });

  const runs = [];
  const progressStep = Math.floor(80 / methodologies.length);

  for (let i = 0; i < methodologies.length; i++) {
    const mId = methodologies[i];
    const t0 = Date.now();
    try {
      const extractor = registry.getExtractor(mId, options[mId] || {});
      const result = await extractor.extract(sourceId, text, existing);

      // Store in Redis (comparison runs — 24h TTL)
      const _redisService = require('../redis.service');
      const runKey = `extraction:run:${result.runId}`;
      await _redisService.set(runKey, {
        ...result,
        docName: doc.originalname || doc.documentTitle,
        docType: doc.documentType,
        queueJobId: job.id,
      }, 86400);

      const docRunsKey = `extraction:docruns:${sourceId}`;
      const existingRunIds = (await _redisService.get(docRunsKey)) || [];
      existingRunIds.unshift(result.runId);
      await _redisService.set(docRunsKey, existingRunIds.slice(0, 50), 86400);

      runs.push({
        methodology:   mId,
        runId:         result.runId,
        status:        'completed',
        timeMs:        Date.now() - t0,
        entities:      result.entities.length,
        relations:     result.relations.length,
        cost:          result.metrics.cost,
        inputTokens:   result.metrics.inputTokens,
        outputTokens:  result.metrics.outputTokens,
      });
    } catch (e) {
      runs.push({ methodology: mId, status: 'failed', error: e.message, timeMs: Date.now() - t0 });
    }

    await job.updateProgress({ phase: 'extracting', progress: 10 + progressStep * (i + 1) });
  }

  await job.updateProgress({ phase: 'completed', progress: 100 });
  return { success: true, docId: sourceId, methodology: methodologies, runs };
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

/**
 * Enqueue a methodology-based extraction job (Variant C).
 *
 * @param {string}          documentId   - Document UUID
 * @param {string|string[]} methodology  - 'M1' or ['M1','M2'] for comparison
 * @param {object}          options      - Per-methodology option overrides
 */
async function enqueueMethodology(documentId, methodology = 'M1', options = {}) {
  await initQueue();
  const mList  = Array.isArray(methodology) ? methodology.join('-') : methodology;
  const jobId  = `extract-meth-${mList}-${documentId.slice(0, 8)}-${Date.now()}`;
  const job    = await _queue.add('extract', {
    mode: 'METHODOLOGY',
    sourceId: documentId,
    methodology,
    adapterName: 'document',
    options,
    enqueuedAt: new Date().toISOString(),
  }, { ...DEFAULT_JOB_OPTIONS, jobId, priority: options.priority || 5 });
  console.log(`[UnifiedQueue] Enqueued methodology job ${job.id} (${mList})`);
  return { jobId: job.id, documentId, methodology };
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
  // BullMQ v5: priority jobs live in a separate "prioritized" sorted set.
  // getWaitingCount() only counts the plain wait list; getPrioritized counts must be added.
  const counts = await _queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'prioritized');
  const waiting = (counts.waiting || 0) + (counts.prioritized || 0);
  const active    = counts.active    || 0;
  const completed = counts.completed || 0;
  const failed    = counts.failed    || 0;
  const delayed   = counts.delayed   || 0;
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
  const payload = { jobId, timestamp: new Date().toISOString(), ...progress };
  progressEmitter.emit(`job:${jobId}`, payload);
  progressEmitter.emit('global', payload); // for global pipeline manager stream
}

function subscribeToProgress(jobId, callback) {
  const event = `job:${jobId}`;
  progressEmitter.on(event, callback);
  return () => progressEmitter.off(event, callback);
}

async function getJobList({ statuses = ['active', 'waiting', 'completed', 'failed'], limit = 30 } = {}) {
  await initQueue();
  const result = {};
  for (const status of statuses) {
    try {
      let jobs = [];
      switch (status) {
        case 'active':    jobs = await _queue.getActive(0, limit); break;
        case 'waiting': {
          // BullMQ v5: prioritized jobs are in a separate sorted set, not the wait list.
          // Merge both so the UI sees all pending jobs.
          const [plain, prio] = await Promise.all([
            _queue.getWaiting(0, limit - 1),
            _queue.getJobs(['prioritized'], 0, limit - 1, true).catch(() => []),
          ]);
          jobs = [...plain, ...prio].slice(0, limit);
          break;
        }
        case 'completed': jobs = await _queue.getCompleted(0, limit - 1, true); break;
        case 'failed':    jobs = await _queue.getFailed(0, limit - 1, true); break;
      }
      result[status] = (jobs || []).map(j => ({
        jobId: j.id,
        status,
        mode: j.data?.mode,
        sourceId: j.data?.sourceId,
        workspaceId: j.data?.workspaceId,
        adapterName: j.data?.adapterName,
        enqueuedAt: j.data?.enqueuedAt,
        progress: typeof j.progress === 'object' ? j.progress : {},
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
        returnvalue: j.returnvalue || undefined,
      }));
    } catch { result[status] = []; }
  }
  return result;
}

function getConcurrency() {
  return _desiredConcurrency;
}

async function setConcurrency(n) {
  const value = Math.max(1, Math.min(Math.floor(n), 50));
  _desiredConcurrency = value;

  if (!_worker) {
    // Worker not yet created — _desiredConcurrency will be picked up by initQueue()
    return value;
  }

  if (_worker.opts?.concurrency === value) {
    return value; // already correct
  }

  // BullMQ v5 dynamic concurrency setter only updates opts but does NOT spawn
  // additional processing loops for increased concurrency. Recreate the worker
  // to guarantee the new concurrency takes effect.
  const conn = getConnection();
  const newWorker = new Worker(QUEUE_NAME, processJob, {
    connection: conn.duplicate(),
    concurrency: value,
  });
  _attachWorkerHandlers(newWorker);

  const oldWorker = _worker;
  _worker = newWorker;

  // Close old worker non-blocking — it finishes its active jobs naturally
  oldWorker.close().catch(e =>
    console.warn(`[UnifiedQueue] Old worker close error: ${e.message}`)
  );

  console.log(`[UnifiedQueue] Worker recreated with concurrency=${value}`);
  return value;
}

async function getJobFull(jobId) {
  await initQueue();
  const job = await _queue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    jobId,
    status:       state,
    mode:         job.data?.mode,
    sourceId:     job.data?.sourceId,
    workspaceId:  job.data?.workspaceId,
    attemptsMade: job.attemptsMade,
    processedOn:  job.processedOn,
    finishedOn:   job.finishedOn,
    failedReason: job.failedReason,
    returnvalue:  job.returnvalue || undefined,
    progress:     job.progress || {},
  };
}

async function retryJob(jobId) {
  await initQueue();
  const job = await _queue.getJob(jobId);
  if (!job) return { success: false, message: 'Job not found' };
  try {
    await job.retry();
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function retryAllFailed() {
  await initQueue();
  const failed = await _queue.getFailed(0, 9999);
  if (failed.length === 0) return { success: true, retried: 0 };
  let retried = 0;
  let errors = 0;
  for (const job of failed) {
    try { await job.retry(); retried++; }
    catch { errors++; }
  }
  console.log(`[UnifiedQueue] retryAllFailed: ${retried} retried, ${errors} errors`);
  return { success: true, retried, errors };
}

module.exports = {
  initQueue,
  shutdownQueue,
  enqueueDocument,
  enqueueWorkspaceSource,
  enqueueMethodology,
  getJobStatus,
  getJobFull,
  cancelJob,
  getQueueStats,
  getWorkspaceJobs,
  getJobList,
  retryJob,
  retryAllFailed,
  getConcurrency,
  setConcurrency,
  subscribeToProgress,
  progressEmitter,
};
