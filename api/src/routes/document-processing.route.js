'use strict';
/**
 * Document Processing Routes — UN Document Lifecycle
 *
 *   POST  /api/v1/documents/upload               — upload file, auto-classify
 *   POST  /api/v1/documents/:id/classify         — re-trigger classification
 *   POST  /api/v1/documents/:id/classify/override — manual override
 *   POST  /api/v1/documents/:id/extract          — trigger extraction pipeline
 *   GET   /api/v1/documents/:id/status           — get document status
 *   GET   /api/v1/documents                      — list documents (with filters)
 *   GET   /api/v1/documents/stats                — aggregate stats
 *   GET   /api/v1/documents/types                — list available UN document types
 */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const { documentProcessingService }   = require('../services/knowledge/document-processing.service');
const { documentExtractionService }   = require('../services/knowledge/document-extraction.service');
const { documentAIExtractionService } = require('../services/knowledge/document-ai-extraction.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// ─── Upload ───────────────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'file is required (field name: file)' });
    const { namespace, sourceUrl, sourceRepository, unSymbol, documentTitle, publishedDate } = req.body;
    const provenance = { sourceUrl, sourceRepository, unSymbol, documentTitle, publishedDate };
    const result = await documentProcessingService.uploadDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      namespace || 'DEFAULT',
      provenance
    );
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Classification ───────────────────────────────────────────────────────────

router.post('/:id/classify', async (req, res) => {
  try {
    const result = await documentProcessingService.classifyDocument(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

router.post('/:id/classify/override', async (req, res) => {
  try {
    const { typeCode, reason } = req.body;
    if (!typeCode) return res.status(400).json({ success: false, error: 'typeCode is required' });
    const result = await documentProcessingService.overrideClassification(req.params.id, typeCode, reason);
    res.json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ─── Extraction ───────────────────────────────────────────────────────────────

router.post('/:id/extract', async (req, res) => {
  try {
    const result = await documentProcessingService.extractDocument(req.params.id, req.body || {});
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('not found') ? 404
               : err.message.includes('must be') ? 400 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ─── Status & List ─────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const stats = await documentProcessingService.getStats(req.query.namespace || null);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/types', async (req, res) => {
  try {
    const classifier = require('../services/knowledge/document-classifier');
    const types = await classifier.listDocumentTypes();
    res.json({ success: true, data: types });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/documents/models — list available extraction models
router.get('/models', (req, res) => {
  res.json({ success: true, data: documentAIExtractionService.getAvailableModels() });
});

router.get('/:id/status', async (req, res) => {
  try {
    const doc = await documentProcessingService.getDocumentStatus(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Extraction progress & results ────────────────────────────────────────────

// GET /api/v1/documents/:id/extraction/progress
router.get('/:id/extraction/progress', async (req, res) => {
  try {
    const progress = await documentExtractionService.getProgress(req.params.id);
    if (progress) return res.json({ success: true, data: progress });

    // No Redis key yet — return queued state if document is in a transient status
    const doc = await documentProcessingService.getDocumentStatus(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    if (['EXTRACTING', 'UPLOADED', 'CLASSIFYING'].includes(doc.status)) {
      return res.json({ success: true, data: {
        documentId: req.params.id,
        status: 'queued',
        overallProgress: 0,
        currentStep: null,
        steps: []
      }});
    }
    res.status(404).json({ success: false, error: 'No extraction progress found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/documents/:id/extraction/entities
router.get('/:id/extraction/entities', async (req, res) => {
  try {
    const entities = await documentExtractionService.getEntities(req.params.id);
    res.json({ success: true, count: entities.length, data: entities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/documents/:id/extraction/result
router.get('/:id/extraction/result', async (req, res) => {
  try {
    const result = await documentExtractionService.getExtractionResult(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'No extraction result found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/documents?namespace=KM&status=CLASSIFIED&layer=L1&since=2026-01-01&limit=50&offset=0
router.get('/', async (req, res) => {
  try {
    const { namespace, status, layer, since, limit, offset } = req.query;
    const docs = await documentProcessingService.listDocuments({
      namespace: namespace || null,
      status:    status    || null,
      layer:     layer     || null,
      since:     since     || null,
      limit:     limit  ? parseInt(limit, 10)  : 50,
      offset:    offset ? parseInt(offset, 10) : 0
    });
    res.json({ success: true, count: docs.length, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
