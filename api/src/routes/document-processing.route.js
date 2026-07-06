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

// ─── Structure Analysis ───────────────────────────────────────────────────────

// POST /api/v1/documents/:id/analyze-structure
// Heuristically analyse document logical structure (sections, preamble, operative, etc.)
// and save the result to the Document node as documentStructure JSON.
router.post('/:id/analyze-structure', async (req, res) => {
  try {
    const structure = await documentProcessingService.analyzeDocumentStructure(req.params.id);
    res.json({ success: true, data: structure });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// GET /api/v1/documents/:id/structure
// Return the stored documentStructure (from last analyze-structure run).
router.get('/:id/structure', async (req, res) => {
  try {
    const doc = await documentProcessingService.getDocumentStatus(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (!doc.documentStructure) return res.status(404).json({ success: false, error: 'Structure not yet analysed. POST /analyze-structure first.' });
    res.json({ success: true, data: doc.documentStructure });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Reprocess Failed ─────────────────────────────────────────────────────────

// POST /api/v1/documents/reprocess-failed
// Re-queues every document in FAILED or EXTRACTION_FAILED status for extraction.
// Optional body: { namespace, model }
router.post('/reprocess-failed', async (req, res) => {
  try {
    const result = await documentProcessingService.reprocessFailedDocuments(req.body || {});
    res.status(202).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// ─── Metadata Refetch (MARCXML) ───────────────────────────────────────────────

// POST /api/v1/documents/:id/refetch-metadata
// Fetches fresh MARC21 XML from the document's sourceUrl (UNDL only) and
// updates unSymbol, documentTitle, publishedDate and marcData on the Document node.
router.post('/:id/refetch-metadata', async (req, res) => {
  try {
    const doc = await documentProcessingService.getDocumentStatus(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    if (!doc.sourceUrl) return res.status(400).json({ success: false, error: 'Document has no sourceUrl' });

    const recidMatch = doc.sourceUrl.match(/digitallibrary\.un\.org\/record\/(\d+)/);
    if (!recidMatch) {
      return res.status(400).json({
        success: false,
        error: 'Only UN Digital Library sources are supported for metadata refetch'
      });
    }

    const { sourceCatalogEnrichmentService } = require('../services/knowledge/source-catalog-enrichment.service');
    const enriched = await sourceCatalogEnrichmentService.fetchMarcRecord(recidMatch[1]);
    if (!enriched) {
      return res.status(502).json({ success: false, error: 'Failed to fetch MARCXML from source' });
    }

    const marc   = enriched.marcData;
    const mgSvc  = require('../services/memgraph.service');
    const now    = new Date().toISOString();
    const sets   = ['d.marcData = $marcData', 'd.metaRefreshedAt = $now', 'd.updatedAt = $now'];
    const params = { id: req.params.id, marcData: JSON.stringify(marc), now };

    if (marc.symbol)    { sets.push('d.unSymbol = $sym');        params.sym   = marc.symbol; }
    if (marc.fullTitle) { sets.push('d.documentTitle = $title'); params.title = marc.fullTitle; }
    if (marc.dateIssued){ sets.push('d.publishedDate = $pub');   params.pub   = marc.dateIssued; }

    await mgSvc.runQuery(`MATCH (d:Document {id: $id}) SET ${sets.join(', ')}`, params);

    const updated = await documentProcessingService.getDocumentStatus(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// GET /api/v1/documents/:id/extraction/progress  (HTTP polling)
router.get('/:id/extraction/progress', async (req, res) => {
  try {
    // Try unified progress bridge first (new path)
    const { getProgress } = require('../services/extraction/progress-bridge');
    const progress = await getProgress(req.params.id);
    if (progress) return res.json({ success: true, data: progress });

    // Fallback: legacy Redis key via old service
    const legacyProgress = await documentExtractionService.getProgress(req.params.id);
    if (legacyProgress) return res.json({ success: true, data: legacyProgress });

    // No Redis key yet — return queued state if document is in a transient status
    const doc = await documentProcessingService.getDocumentStatus(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    if (['EXTRACTING', 'UPLOADED', 'CLASSIFYING'].includes(doc.status)) {
      return res.json({ success: true, data: {
        documentId: req.params.id, status: 'queued',
        overallProgress: 0, currentStep: null, steps: []
      }});
    }
    res.status(404).json({ success: false, error: 'No extraction progress found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/documents/:id/extract/:jobId/progress  (SSE stream — same as workspace)
router.get('/:id/extract/:jobId/progress', (req, res) => {
  const { subscribeToProgress } = require('../services/extraction/unified-queue');
  const jobId = req.params.jobId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30000);

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = subscribeToProgress(jobId, (progress) => {
    if (progress.phase === 'completed' || progress.phase === 'failed' || progress.phase === 'cancelled') {
      send('done', progress);
      cleanup();
    } else {
      send('progress', progress);
    }
  });

  send('status', { jobId, connected: true });

  function cleanup() {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  }

  req.on('close', cleanup);
});

// GET /api/v1/documents/:id/graph — entity graph (nodes + entity-entity relationships)
router.get('/:id/graph', async (req, res) => {
  try {
    const graph = await documentExtractionService.getDocumentGraph(req.params.id);
    res.json({ success: true, data: graph });
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

// GET /api/v1/documents/:id/extraction/relations
// Returns RELATED_TO edges between EntityMention nodes extracted from this document.
router.get('/:id/extraction/relations', async (req, res) => {
  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (a:EntityMention {documentId: $docId})-[r:RELATED_TO]->(b:EntityMention {documentId: $docId})
       RETURN a.id AS sourceId, a.name AS sourceName, a.type AS sourceType,
              b.id AS targetId, b.name AS targetName, b.type AS targetType,
              r.type AS relType, r.context AS context,
              r.confidence AS confidence, r.extractedAt AS extractedAt
       ORDER BY r.confidence DESC
       LIMIT 100`,
      { docId: req.params.id }
    );
    const relations = rows.map(r => ({
      sourceId:   r.sourceId,
      sourceName: r.sourceName,
      sourceType: r.sourceType,
      targetId:   r.targetId,
      targetName: r.targetName,
      targetType: r.targetType,
      relType:    r.relType    || 'RELATED_TO',
      context:    r.context    || null,
      confidence: typeof r.confidence === 'number' ? r.confidence : (r.confidence?.low ?? null),
      extractedAt: r.extractedAt || null,
    }));
    res.json({ success: true, count: relations.length, data: relations });
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
    const bySt = docs.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {});
    console.log(`[TEST-LOG][GET /documents] Returned ${docs.length} docs — ${JSON.stringify(bySt)}`);
    res.json({ success: true, count: docs.length, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
