'use strict';

/**
 * Graph-Transfer Export Queue
 *
 * Single BullMQ queue (`graph-transfer-export`) that runs UGP export jobs. The
 * worker lives in-process, so progress is published via an in-process
 * EventEmitter (subscribeToProgress) rather than Redis pub/sub — the SSE route
 * subscribes to it directly. Mirrors the conventions of
 * src/services/extraction/unified-queue.js.
 *
 * Job data shape: { request: ExportRequest, enqueuedAt }
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');
const { EventEmitter } = require('events');

const QUEUE_NAME = 'graph-transfer-export';

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null, // required by BullMQ
};

const DEFAULT_JOB_OPTIONS = {
    attempts: 1, // exports are heavy + write files; don't blind-retry
    removeOnComplete: { age: 24 * 3600, count: 50 },
    removeOnFail: { age: 7 * 24 * 3600 },
};

let _connection = null;
let _queue = null;
let _worker = null;
let _queueEvents = null;

const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(200);

function getConnection() {
    if (!_connection) _connection = new IORedis(REDIS_CONFIG);
    return _connection;
}

function emitProgress(jobId, payload) {
    if (!jobId) return;
    const evt = { jobId, timestamp: new Date().toISOString(), ...payload };
    progressEmitter.emit(`job:${jobId}`, evt);
}

/**
 * Subscribe to a job's progress events. Returns an unsubscribe function.
 * @param {string} jobId
 * @param {(evt: object) => void} callback
 * @returns {() => void}
 */
function subscribeToProgress(jobId, callback) {
    const event = `job:${jobId}`;
    progressEmitter.on(event, callback);
    return () => progressEmitter.off(event, callback);
}

async function processJob(job) {
    // Lazy-require the service to avoid a require cycle at module load.
    const { getExportService } = require('./export.service');
    const service = getExportService();

    const onProgress = (percent, phase, message) => {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        job.updateProgress(p).catch(() => {});
        emitProgress(job.id, { phase, progress: p, message });
    };

    emitProgress(job.id, { phase: 'started', progress: 0 });
    const result = await service.executeExport(job.data.request, onProgress);
    emitProgress(job.id, { phase: 'completed', progress: 100, result });
    return result;
}

function _attachWorkerHandlers(w) {
    w.on('failed', (job, err) => {
        console.error(`[GraphTransferQueue] Job ${job?.id} failed: ${err.message}`);
        emitProgress(job?.id, { phase: 'failed', progress: 0, error: err.message });
    });
    w.on('error', (err) => {
        console.error(`[GraphTransferQueue] Worker error: ${err.message}`);
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
        concurrency: 1, // exports are IO/CPU heavy; serialize them
    });
    _attachWorkerHandlers(_worker);

    console.log('[GraphTransferQueue] Initialized');
}

async function shutdownQueue() {
    if (_worker) { await _worker.close(); _worker = null; }
    if (_queueEvents) { await _queueEvents.close(); _queueEvents = null; }
    if (_queue) { await _queue.close(); _queue = null; }
    if (_connection) { _connection.disconnect(); _connection = null; }
    console.log('[GraphTransferQueue] Shutdown');
}

// ── Public API ───────────────────────────────────────────────────────────────

async function enqueueExport(request) {
    await initQueue();
    const jobId = `gt-export-${Date.now()}`;
    const job = await _queue.add(
        'export',
        { request, enqueuedAt: new Date().toISOString() },
        { ...DEFAULT_JOB_OPTIONS, jobId }
    );
    console.log(`[GraphTransferQueue] Enqueued export job ${job.id}`);
    return { jobId: job.id };
}

function _selectionSummary(data) {
    const req = data?.request || {};
    switch (req.selectionMode) {
        case 'NAMESPACE': return `NAMESPACE: ${(req.namespacePrefixes || []).join(', ')}`;
        case 'LABELS': return `LABELS: ${(req.labels || []).join(', ')}`;
        case 'CYPHER': return `CYPHER: ${String(req.cypher || '').slice(0, 60)}`;
        case 'CATALOG_GRAPHS': return `CATALOG_GRAPHS: ${(req.graphIds || []).join(', ')}`;
        default: return req.selectionMode || 'unknown';
    }
}

function _toSummary(job, state) {
    return {
        jobId: job.id,
        status: state,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        createdAt: job.data?.enqueuedAt,
        selectionSummary: _selectionSummary(job.data),
    };
}

async function getJob(jobId) {
    await initQueue();
    const job = await _queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
        ..._toSummary(job, state),
        filePath: job.returnvalue?.filePath,
        fileSize: job.returnvalue?.fileSize,
        exportRecordId: job.returnvalue?.exportRecordId,
        counts: job.returnvalue?.counts,
        error: job.failedReason,
    };
}

async function listJobs(limit = 50) {
    await initQueue();
    const states = ['active', 'waiting', 'completed', 'failed'];
    const out = [];
    for (const state of states) {
        let jobs = [];
        try {
            switch (state) {
                case 'active': jobs = await _queue.getActive(0, limit); break;
                case 'waiting': jobs = await _queue.getWaiting(0, limit); break;
                case 'completed': jobs = await _queue.getCompleted(0, limit); break;
                case 'failed': jobs = await _queue.getFailed(0, limit); break;
            }
        } catch { jobs = []; }
        for (const j of jobs || []) out.push(_toSummary(j, state));
    }
    // newest first
    out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return out.slice(0, limit);
}

async function getRawJob(jobId) {
    await initQueue();
    return _queue.getJob(jobId);
}

module.exports = {
    QUEUE_NAME,
    initQueue,
    shutdownQueue,
    enqueueExport,
    getJob,
    listJobs,
    getRawJob,
    subscribeToProgress,
    progressEmitter,
};
