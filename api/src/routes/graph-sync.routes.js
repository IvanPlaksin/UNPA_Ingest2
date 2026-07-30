'use strict';

/**
 * Graph-Sync RECEIVER routes  (base: /api/v1/graph-transfer/sync)
 *
 * The target side of API-API selective sync. A peer streams a UGP package here;
 * it is staged to disk, integrity-verified, then planned (dry-run) and/or applied
 * with full failure-consistency (see import.service). Gated by graph-sync-auth.
 *
 *   POST /ingest            - upload a package → stage + verify → { stagingId, contentHash, manifest }
 *   POST /plan              - { stagingId, conflict?, catalogChannel? } → diff summary (no write)
 *   POST /apply             - { stagingId, conflict?, catalogChannel?, skipVectors?, force? } → import result
 *   GET  /records           - recent ImportRecords (observability)
 *   GET  /health            - receiver capability + config
 */

const express = require('express');
const multer = require('multer');

const { graphSyncAuthMiddleware } = require('../middleware/graph-sync-auth.middleware');
const staging = require('../services/graph-transfer/sync/staging.service');
const importSvc = require('../services/graph-transfer/sync/import.service');
const { snapshot } = require('../services/graph-transfer/sync/snapshot.service');

const router = express.Router();
const jsonBody = express.json({ limit: '1mb' });

const MAX_BYTES = parseInt(process.env.GRAPH_SYNC_MAX_BYTES || String(1024 * 1024 * 1024), 10); // 1 GB
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => { try { cb(null, staging.ensureDir()); } catch (e) { cb(e); } },
        filename: (req, file, cb) => { const { stagingId } = staging.allocate(); req._stagingId = stagingId; cb(null, `${stagingId}.ugp.tar.gz`); },
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
});

router.use(graphSyncAuthMiddleware);

// GET /health — always allowed by the auth gate
router.get('/health', (req, res) => {
    res.json({
        ok: true,
        role: 'receiver',
        enabled: process.env.GRAPH_SYNC_ALLOW_INSECURE === 'true' || !!process.env.GRAPH_SYNC_KEY,
        peerAllowlist: (process.env.GRAPH_SYNC_PEERS || '').split(',').map((s) => s.trim()).filter(Boolean),
        maxBytes: MAX_BYTES,
        stagingTtlMs: staging.TTL_MS,
    });
});

// GET /snapshot — per-label + per-collection counts (for the Compare view)
router.get('/snapshot', async (req, res) => {
    try { res.json(await snapshot()); }
    catch (e) { res.status(500).json({ error: 'snapshot failed', detail: e.message }); }
});

// POST /ingest — receive + stage + verify integrity (NO db write)
router.post('/ingest', upload.single('package'), async (req, res) => {
    const stagingId = req._stagingId;
    if (!req.file || !stagingId) return res.status(400).json({ error: 'No package uploaded (multipart field "package")' });
    const filePath = staging.getPath(stagingId);
    try {
        const { manifest, contentHash } = await importSvc.openVerified(filePath);
        staging.setMeta(stagingId, { contentHash, manifest, size: req.file.size });
        res.json({
            stagingId, contentHash, size: req.file.size,
            manifest: {
                sourceInstanceId: manifest.sourceInstanceId,
                createdAt: manifest.createdAt,
                counts: manifest.counts,
                vectorPolicy: manifest.vectorPolicy,
                containsExecutableGraphs: !!manifest.containsExecutableGraphs,
            },
        });
    } catch (err) {
        staging.remove(stagingId); // reject corrupt/truncated transfer, leave no trace
        const code = err.code === 'EINTEGRITY' ? 422 : 400;
        res.status(code).json({ error: 'Package rejected', code: err.code || 'EBADPKG', detail: err.message });
    }
});

// POST /plan — dry-run diff
router.post('/plan', jsonBody, async (req, res) => {
    const { stagingId, conflict, catalogChannel } = req.body || {};
    const filePath = staging.getPath(stagingId);
    if (!filePath) return res.status(404).json({ error: 'Unknown or expired stagingId' });
    try {
        const out = await importSvc.planPackage(filePath, { conflict, catalogChannel });
        res.json(out);
    } catch (err) {
        res.status(err.code === 'EINTEGRITY' ? 422 : 500).json({ error: 'Plan failed', code: err.code, detail: err.message });
    }
});

// POST /apply — idempotent, failure-consistent import
router.post('/apply', jsonBody, async (req, res) => {
    const { stagingId, conflict, catalogChannel, skipVectors, force } = req.body || {};
    const filePath = staging.getPath(stagingId);
    if (!filePath) return res.status(404).json({ error: 'Unknown or expired stagingId' });
    try {
        const result = await importSvc.applyPackage(filePath, {
            conflict, catalogChannel, skipVectors: !!skipVectors, force: !!force,
            sourceInstanceId: req.syncSourceInstance || undefined, transport: 'api',
        });
        if (result.status === 'completed') staging.remove(stagingId); // success → free disk; failure → keep for retry
        res.json(result);
    } catch (err) {
        const code = err.code === 'ECONFLICT' ? 409 : (err.code === 'EINTEGRITY' ? 422 : 500);
        res.status(code).json({ error: 'Apply failed', code: err.code, detail: err.message, summary: err.summary });
    }
});

// GET /records — provenance / observability
router.get('/records', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
        const records = await importSvc.listRecords(limit);
        res.json({ records });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list import records', detail: err.message });
    }
});

staging.startSweeper(); // periodic TTL cleanup of abandoned staged packages

module.exports = router;
