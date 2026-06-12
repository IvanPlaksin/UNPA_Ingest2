'use strict';
/**
 * Source Catalog Routes  /api/v1/source-catalog
 *
 *   GET    /                    — list catalog entries (filter: namespace, type)
 *   POST   /                    — create entry
 *   GET    /:id                 — get entry
 *   PUT    /:id                 — update entry
 *   DELETE /:id                 — delete entry
 *   POST   /:id/browse          — search documents from external source
 *   POST   /:id/import          — download + import a found document into /documents
 */

const express = require('express');
const router  = express.Router();
const { sourceCatalogService }           = require('../services/knowledge/source-catalog.service');
const { sourceCatalogEnrichmentService } = require('../services/knowledge/source-catalog-enrichment.service');

// ── List ────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { namespace, type } = req.query;
    const results = await sourceCatalogService.list({ namespace: namespace || null, type: type || null });
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Create ──────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const result = await sourceCatalogService.create(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('required') ? 400 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ── Get ─────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const result = await sourceCatalogService.get(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Update ──────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const result = await sourceCatalogService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Delete ──────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await sourceCatalogService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Browse ──────────────────────────────────────────────────────

router.post('/:id/browse', async (req, res) => {
  try {
    const { query = '', page = 1, limit = 30 } = req.body;
    const result = await sourceCatalogService.browse(req.params.id, {
      query,
      page:  Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, parseInt(limit, 10) || 30),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ── Import ──────────────────────────────────────────────────────

router.post('/:id/import', async (req, res) => {
  try {
    const { url, title, namespace, meta, pdfUrl } = req.body;
    if (!url && !pdfUrl) return res.status(400).json({ success: false, error: 'url is required' });
    const result = await sourceCatalogService.importDocument(req.params.id, { url, title, namespace, meta, pdfUrl });
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ── Source Documents (cached browse results) ───────────────────

router.get('/:id/documents', async (req, res) => {
  try {
    const { page = 1, limit = 20, importedOnly } = req.query;
    const result = await sourceCatalogService.getSourceDocuments(req.params.id, {
      page:  Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, parseInt(limit, 10) || 20),
      importedOnly: importedOnly === 'true',
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Enrich (batch metadata fetch) ──────────────────────────────

router.post('/:id/enrich', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ success: false, error: 'items[] required' });

    const jobId = sourceCatalogEnrichmentService.startEnrichBatch(req.params.id, items);
    res.json({ success: true, jobId, count: items.length });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ── Enrich progress (SSE) ───────────────────────────────────────

router.get('/:id/enrich/:jobId/progress', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const job = sourceCatalogEnrichmentService.getJob(jobId);
  if (!job) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
    return res.end();
  }

  // Send current job state immediately
  res.write(`event: status\ndata: ${JSON.stringify({ ...job, type: 'status' })}\n\n`);

  const send = (payload) => {
    try {
      res.write(`event: progress\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  };

  const unsubscribe = sourceCatalogEnrichmentService.subscribeToProgress(jobId, (payload) => {
    send(payload);
    if (payload.type === 'complete' || payload.type === 'error') {
      res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
      unsubscribe();
      res.end();
    }
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
