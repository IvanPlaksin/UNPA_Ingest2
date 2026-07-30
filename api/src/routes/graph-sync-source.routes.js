'use strict';

/**
 * Graph-Sync SOURCE routes  (base: /api/v1/graph-transfer/push)
 *
 * The initiating side of API-API sync: manage peer instances and run push jobs
 * (export → transmit → plan/apply on the peer). Called by our own operator/UI,
 * so it uses the normal app auth — NOT the peer sync key (that guards the
 * receiver). The shared sync key is resolved server-side from env at push time.
 *
 *   GET    /peers            - list registered peers
 *   POST   /peers            - add/update a peer { name, baseUrl, keyEnv? }
 *   DELETE /peers/:id         - remove a peer
 *   POST   /peers/:id/test    - probe the peer receiver (connectivity + auth)
 *   POST   /jobs              - start a sync job { peerId, request, mode, conflict, ... }
 *   GET    /jobs              - list recent sync jobs
 *   GET    /jobs/:id          - job detail (incl. result)
 *   GET    /jobs/:id/events   - SSE progress stream
 */

const express = require('express');
const peers = require('../services/graph-transfer/sync/peers.service');
const syncJobs = require('../services/graph-transfer/sync/sync.jobs');
const { peerRecords, peerHealth, peerSnapshot } = require('../services/graph-transfer/sync/sync.service');
const { snapshot: localSnapshot } = require('../services/graph-transfer/sync/snapshot.service');
const { DOMAINS, buildRequestFromDomains, compareByDomain } = require('../services/graph-transfer/sync/domains');
const { KEY_HEADER, SRC_HEADER } = require('../middleware/graph-sync-auth.middleware');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

// ── Domains + Compare ───────────────────────────────────────────────────────
// GET /domains — the sync domain preset catalog (human-meaningful groupings)
router.get('/domains', (req, res) => res.json({ domains: DOMAINS }));

// GET /peers/:id/compare — diff THIS instance vs the peer, grouped by domain
router.get('/peers/:id/compare', async (req, res) => {
    try {
        const conn = require('../services/graph-transfer/sync/peers.service').resolveConnection(req.params.id);
        const [source, target] = await Promise.all([localSnapshot(), peerSnapshot(conn)]);
        const { domains, significantDrift } = compareByDomain(source, target);
        res.json({ domains, significantDrift, source: { takenAt: source.takenAt }, target: { takenAt: target.takenAt } });
    } catch (e) {
        res.status(e.code === 'ENOKEY' ? 412 : (e.code === 'ENOPEER' ? 404 : 502)).json({ error: e.message, code: e.code });
    }
});

// ── Peers ─────────────────────────────────────────────────────────────────
router.get('/peers', (req, res) => res.json({ peers: peers.list() }));

router.post('/peers', (req, res) => {
    try { res.json({ peer: peers.upsert(req.body || {}) }); }
    catch (e) { res.status(e.code === 'EVALIDATION' ? 400 : 500).json({ error: e.message, code: e.code }); }
});

router.delete('/peers/:id', (req, res) => res.json({ removed: peers.remove(req.params.id) }));

router.post('/peers/:id/test', async (req, res) => {
    try {
        const conn = peers.resolveConnection(req.params.id);
        const health = await peerHealth(conn);
        res.status(health.ok ? 200 : 502).json({ ok: health.ok, status: health.status, receiver: health });
    } catch (e) {
        res.status(e.code === 'ENOKEY' ? 412 : (e.code === 'ENOPEER' ? 404 : 502)).json({ ok: false, error: e.message, code: e.code });
    }
});

// GET /peers/:id/health — proxy the peer receiver health (server-side key)
router.get('/peers/:id/health', async (req, res) => {
    try { res.json(await peerHealth(peers.resolveConnection(req.params.id))); }
    catch (e) { res.status(e.code === 'ENOKEY' ? 412 : (e.code === 'ENOPEER' ? 404 : 502)).json({ ok: false, error: e.message, code: e.code }); }
});

// GET /peers/:id/records — proxy the peer's ImportRecords (server-side key)
router.get('/peers/:id/records', async (req, res) => {
    try {
        const records = await peerRecords(peers.resolveConnection(req.params.id), Math.min(parseInt(req.query.limit || '50', 10), 500));
        res.json({ records });
    } catch (e) {
        res.status(e.code === 'ENOKEY' ? 412 : (e.code === 'ENOPEER' ? 404 : 502)).json({ error: e.message, code: e.code });
    }
});

// ── Sync jobs ───────────────────────────────────────────────────────────────
router.post('/jobs', (req, res) => {
    const { peerId, request, domains, stagingId, mode, conflict, catalogChannel, skipVectors, force, boundaryPolicy, vectorPolicy } = req.body || {};
    if (!peerId) return res.status(400).json({ error: 'peerId is required' });
    // A job can be driven by domain presets, a raw selection request, or a reviewed stagingId.
    const effRequest = request || (Array.isArray(domains) && domains.length ? buildRequestFromDomains(domains, { boundaryPolicy, vectorPolicy }) : null);
    if (!stagingId && !(effRequest && effRequest.selectionMode)) return res.status(400).json({ error: 'domains[], request.selectionMode, or a stagingId is required' });
    try {
        const { jobId } = syncJobs.enqueueSync({ peerId, request: effRequest, stagingId, mode, conflict, catalogChannel, skipVectors, force });
        res.status(202).json({ jobId });
    } catch (e) {
        const code = e.code === 'ENOPEER' ? 404 : (e.code === 'ENOKEY' ? 412 : 400);
        res.status(code).json({ error: e.message, code: e.code });
    }
});

router.get('/jobs', (req, res) => res.json({ jobs: syncJobs.listJobs(Math.min(parseInt(req.query.limit || '50', 10), 200)) }));

router.get('/jobs/:id/events', (req, res) => {
    const job = syncJobs.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
    send({ jobId: job.id, phase: job.phase, progress: job.progress, status: job.status }); // current state
    if (job.status === 'completed' || job.status === 'failed') { send({ jobId: job.id, phase: job.status, progress: job.progress, result: job.result, error: job.error }); return res.end(); }
    const unsub = syncJobs.subscribe(req.params.id, (evt) => { send(evt); if (evt.phase === 'completed' || evt.phase === 'failed') { cleanup(); res.end(); } });
    const ka = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    function cleanup() { clearInterval(ka); unsub(); }
    req.on('close', cleanup);
});

router.get('/jobs/:id', (req, res) => {
    const job = syncJobs.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job });
});

module.exports = router;
