'use strict';

/**
 * Graph-Transfer API Routes  (base: /api/v1/graph-transfer)
 *
 * Selective export of Memgraph(+Qdrant) data as a UGP package for transfer to
 * another instance. Distinct from /api/v1/export (visualization format export).
 *
 *   POST /preview            - counts + validation (no file)
 *   POST /jobs               - enqueue an export job → { jobId }
 *   GET  /jobs               - list recent jobs
 *   GET  /jobs/:id           - job detail
 *   GET  /jobs/:id/events    - SSE progress stream
 *   GET  /jobs/:id/download  - download completed .ugp.tar.gz
 *   GET  /history            - past ExportRecords (bonus)
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const {
    getExportService,
    enqueueExport,
    getJob,
    listJobs,
    getRawJob,
    subscribeToProgress,
} = require('../services/graph-transfer');

const router = express.Router();

// POST /preview
router.post('/preview', async (req, res) => {
    try {
        const result = await getExportService().preview(req.body || {});
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('[GraphTransfer] preview error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /jobs
router.post('/jobs', async (req, res) => {
    try {
        const request = req.body || {};
        const { errors } = getExportService().validateRequest(request);
        if (errors.length) return res.status(400).json({ success: false, errors });
        const { jobId } = await enqueueExport(request);
        res.status(201).json({ success: true, jobId });
    } catch (e) {
        console.error('[GraphTransfer] enqueue error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Domain map (map-first UI, GT-UI-001) ────────────────────────────────────
const { getDomainService } = require('../services/graph-transfer/domain.service');

// GET /domains — the data-domain map with live node counts
router.get('/domains', async (req, res) => {
    try {
        res.json({ success: true, ...(await getDomainService().getDomains()) });
    } catch (e) {
        console.error('[GraphTransfer] domains error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /domains/:id — drill-down for one domain
router.get('/domains/:id', async (req, res) => {
    try {
        res.json({ success: true, ...(await getDomainService().getDomainDetails(req.params.id)) });
    } catch (e) {
        if (e.message === 'DOMAIN_NOT_FOUND') return res.status(404).json({ success: false, error: 'Domain not found' });
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /domains/build-request — assemble an ExportRequest from selected domains
router.post('/domains/build-request', async (req, res) => {
    try {
        const { domainIds, options } = req.body || {};
        res.json({ success: true, request: getDomainService().buildExportRequest(domainIds || [], options || {}) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /catalog-tree — paginated GXE catalog tree (entries → definitions → versions)
const { getCatalogTreeService } = require('../services/graph-transfer/catalog-tree.service');
router.get('/catalog-tree', async (req, res) => {
    try {
        const result = await getCatalogTreeService().getTreeLevel({
            parentId: req.query.parentId || null,
            parentType: req.query.parentType || 'root',
            page: req.query.page,
            pageSize: req.query.pageSize,
            search: req.query.search || null,
            includeVectorInfo: req.query.includeVectorInfo !== 'false',
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('[GraphTransfer] catalog-tree error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /meta/collections — Qdrant collections + graph-linkage info (for filter UI)
router.get('/meta/collections', async (req, res) => {
    try {
        res.json({ success: true, ...(await getExportService().listCollectionsMeta()) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /meta/collections/:collection/payload-schema — distinct payload values (sampled)
router.get('/meta/collections/:collection/payload-schema', async (req, res) => {
    try {
        const schema = await getExportService().getCollectionPayloadSchema(req.params.collection);
        res.json({ success: true, ...schema });
    } catch (e) {
        if (e.message === 'COLLECTION_NOT_FOUND') return res.status(404).json({ success: false, error: `Collection not found: ${req.params.collection}` });
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /jobs/rerun/:exportId — re-run (clone) a saved export, with optional overrides
router.post('/jobs/rerun/:exportId', async (req, res) => {
    try {
        const merged = await getExportService().buildRerunRequest(req.params.exportId, req.body || {});
        const { jobId } = await enqueueExport(merged);
        res.status(201).json({ success: true, jobId, rerunFromExportId: req.params.exportId, exportRequest: merged });
    } catch (e) {
        if (e.message === 'EXPORT_NOT_FOUND') return res.status(404).json({ success: false, error: 'Export not found' });
        if (e.message === 'CANNOT_RERUN') return res.status(400).json({ success: false, error: 'Export cannot be re-run (missing/incomplete exportRequest)' });
        console.error('[GraphTransfer] rerun error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /jobs
router.get('/jobs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        res.json({ success: true, jobs: await listJobs(limit) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /history  (declared before /jobs/:id is not needed — distinct path)
router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        res.json({ success: true, records: await getExportService().getExportHistory(limit) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// PUT /history/:exportId — update name/notes
router.put('/history/:exportId', async (req, res) => {
    try {
        const { name, notes } = req.body || {};
        if (name === undefined && notes === undefined) {
            return res.status(400).json({ success: false, error: 'No updates provided (name or notes required)' });
        }
        const rec = await getExportService().updateExportRecord(req.params.exportId, { name, notes });
        res.json({ success: true, exportId: rec.exportId, name: rec.name, notes: rec.notes });
    } catch (e) {
        if (e.message === 'EXPORT_NOT_FOUND') return res.status(404).json({ success: false, error: 'Export not found' });
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /history/:exportId — delete record (optionally the file)
router.delete('/history/:exportId', async (req, res) => {
    try {
        const deleteFile = req.query.deleteFile === 'true';
        const result = await getExportService().deleteExportRecord(req.params.exportId, deleteFile);
        res.json({ success: true, exportId: result.exportId, fileDeleted: result.fileDeleted });
    } catch (e) {
        if (e.message === 'EXPORT_NOT_FOUND') return res.status(404).json({ success: false, error: 'Export not found' });
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /history/:exportId/download — re-download a past export's package by exportId
router.get('/history/:exportId/download', async (req, res) => {
    try {
        const rec = await getExportService().getExportRecord(req.params.exportId);
        if (!rec) return res.status(404).json({ success: false, error: 'Export not found' });
        if (!rec.filePath || !fs.existsSync(rec.filePath)) {
            return res.status(404).json({ success: false, error: 'Package file no longer on disk' });
        }
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(rec.filePath)}"`);
        fs.createReadStream(rec.filePath).pipe(res);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /jobs/:id/events — SSE
router.get('/jobs/:id/events', async (req, res) => {
    const { id } = req.params;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

    // Current state first
    let finished = false;
    try {
        const job = await getJob(id);
        if (!job) { send('error', { message: 'Job not found' }); return res.end(); }
        send('state', job);
        if (job.status === 'completed' || job.status === 'failed') finished = true;
    } catch (e) {
        send('error', { message: e.message });
    }

    const unsubscribe = subscribeToProgress(id, (evt) => {
        send(evt.phase || 'progress', evt);
        if (evt.phase === 'completed' || evt.phase === 'failed') {
            cleanup();
            res.end();
        }
    });

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    function cleanup() {
        clearInterval(heartbeat);
        unsubscribe();
    }
    req.on('close', cleanup);
    req.on('error', cleanup);

    if (finished) { cleanup(); res.end(); }
});

// GET /jobs/:id/download
router.get('/jobs/:id/download', async (req, res) => {
    try {
        const job = await getRawJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        const state = await job.getState();
        if (state !== 'completed') {
            return res.status(409).json({ success: false, error: `Export not ready (state: ${state})` });
        }
        const filePath = job.returnvalue?.filePath;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Export file not found on disk' });
        }
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /jobs/:id — detail (declared last so it doesn't shadow /jobs/:id/events|download)
router.get('/jobs/:id', async (req, res) => {
    try {
        const job = await getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        res.json({ success: true, job });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
