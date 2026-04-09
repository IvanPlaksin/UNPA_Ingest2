/**
 * Ingestion API Routes
 * Document upload, parsing, and extraction pipeline
 *
 * Endpoints:
 *   POST   /api/v1/ingestion/text     - Ingest text content
 *   POST   /api/v1/ingestion/file     - Upload and ingest file
 *   POST   /api/v1/ingestion/batch    - Ingest multiple documents
 *   POST   /api/v1/ingestion/queue    - Queue for background processing
 *   GET    /api/v1/ingestion/formats  - Supported formats
 *   GET    /api/v1/ingestion/stats    - Ingestion statistics
 *
 * @module routes/ingestion.routes
 */

const express = require('express');
const multer = require('multer');
const { ingestionPipeline, documentParser } = require('../services/ingestion');

const router = express.Router();

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  storage: multer.memoryStorage()
});

/**
 * POST /text
 * Ingest text content
 * Body: { content: string, format?: string, domain?: string, metadata?: object }
 */
router.post('/text', async (req, res) => {
  try {
    const { content, format, domain, metadata, clientId } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'content is required and must be a string' });
    }

    const result = await ingestionPipeline.ingest(content, {
      format: format || '.txt',
      domain,
      metadata,
      clientId
    });

    res.json(result);
  } catch (error) {
    console.error('[IngestionRoute] Text ingestion error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /file
 * Upload and ingest a file
 * Multipart form: file + optional domain, clientId
 */
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file is required' });
    }

    const { domain, clientId } = req.body;

    const parsed = await documentParser.parseBuffer(req.file.buffer, req.file.originalname);

    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const result = await ingestionPipeline.ingest(parsed.text, {
      format: parsed.format,
      domain,
      metadata: {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      },
      clientId
    });

    res.json(result);
  } catch (error) {
    console.error('[IngestionRoute] File ingestion error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /batch
 * Ingest multiple documents
 * Body: { documents: [{ content, format?, domain?, metadata? }], domain? }
 */
router.post('/batch', async (req, res) => {
  try {
    const { documents, domain, clientId } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ success: false, error: 'documents array is required and must not be empty' });
    }

    if (documents.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 documents per batch' });
    }

    const result = await ingestionPipeline.ingestBatch(documents, { domain, clientId });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[IngestionRoute] Batch ingestion error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /queue
 * Queue document for background processing
 * Body: { content: string, format?, domain?, options? }
 */
router.post('/queue', async (req, res) => {
  try {
    const { content, format, domain, options } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'content is required and must be a string' });
    }

    const result = await ingestionPipeline.queueIngestion(content, {
      format,
      domain,
      ...options
    });

    res.status(202).json(result);
  } catch (error) {
    console.error('[IngestionRoute] Queue ingestion error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /formats
 * Get supported document formats
 */
router.get('/formats', (req, res) => {
  res.json({
    success: true,
    formats: documentParser.getSupportedFormats()
  });
});

/**
 * GET /stats
 * Get ingestion pipeline statistics
 */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    stats: ingestionPipeline.getStats()
  });
});

module.exports = router;
