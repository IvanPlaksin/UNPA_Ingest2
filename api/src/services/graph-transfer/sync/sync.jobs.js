'use strict';

/**
 * In-process sync-job runner + progress bus (source side). Sync is operator-
 * triggered and network-bound, so a lightweight in-memory tracker (id + status +
 * SSE) is used instead of a second BullMQ queue. Jobs are not durable across a
 * restart by design — a failed/interrupted job is simply re-triggered, and the
 * peer's apply is idempotent, so no inconsistent state results.
 */

const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const peers = require('./peers.service');
const { runSync } = require('./sync.service');

const bus = new EventEmitter();
bus.setMaxListeners(0);
const _jobs = new Map(); // id -> job
const MAX_KEEP = 100;

function _emit(id, evt) {
    const job = _jobs.get(id);
    if (job) { Object.assign(job, { phase: evt.phase, progress: evt.progress ?? job.progress, message: evt.message, updatedAt: new Date().toISOString() }); }
    bus.emit(`sync:${id}`, { jobId: id, timestamp: new Date().toISOString(), ...evt });
}

function _prune() {
    if (_jobs.size <= MAX_KEEP) return;
    const done = [..._jobs.values()].filter((j) => j.status === 'completed' || j.status === 'failed').sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    while (_jobs.size > MAX_KEEP && done.length) _jobs.delete(done.shift().id);
}

/** Start a sync job. @returns {{jobId}} */
function enqueueSync(spec) {
    const { peerId, request, stagingId, mode = 'plan-apply', conflict = 'skip', catalogChannel = 'refuse', skipVectors = false, force = false } = spec || {};
    const peerConn = peers.resolveConnection(peerId); // throws ENOPEER/ENOKEY early
    const id = randomUUID();
    const job = {
        id, status: 'running', phase: 'queued', progress: 0,
        peerId, peer: peers.get(peerId)?.name || peerId,
        selectionMode: request?.selectionMode, mode, conflict, reusedStaging: !!stagingId,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        result: null, error: null,
    };
    _jobs.set(id, job); _prune();

    // fire-and-forget; progress via the bus
    (async () => {
        try {
            const result = await runSync({ request, stagingId, peerConn, mode, conflict, catalogChannel, skipVectors, force }, (evt) => _emit(id, evt));
            job.status = 'completed'; job.result = result; job.progress = 100; job.updatedAt = new Date().toISOString();
            bus.emit(`sync:${id}`, { jobId: id, phase: 'completed', progress: 100, result, timestamp: new Date().toISOString() });
        } catch (err) {
            job.status = 'failed'; job.error = err.message; job.errorBody = err.body || null; job.updatedAt = new Date().toISOString();
            bus.emit(`sync:${id}`, { jobId: id, phase: 'failed', error: err.message, body: err.body || null, timestamp: new Date().toISOString() });
        }
    })();

    return { jobId: id };
}

function getJob(id) { return _jobs.get(id) || null; }
function listJobs(limit = 50) {
    return [..._jobs.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
        .map((j) => ({ id: j.id, status: j.status, phase: j.phase, progress: j.progress, peer: j.peer, mode: j.mode, selectionMode: j.selectionMode, createdAt: j.createdAt, updatedAt: j.updatedAt, error: j.error }));
}
function subscribe(id, cb) { const ev = `sync:${id}`; bus.on(ev, cb); return () => bus.off(ev, cb); }

module.exports = { enqueueSync, getJob, listJobs, subscribe };
