/**
 * Export API Routes
 * Graph export in various formats (Cypher, GraphML, JSON-LD, GEXF, CSV, JSON)
 *
 * Endpoints:
 *   GET    /api/v1/export/formats            - Available formats
 *   POST   /api/v1/export/:format            - Export graph
 *   GET    /api/v1/export/:format/download   - Download export as file
 *   GET    /api/v1/export/stats              - Export statistics
 *
 * @module routes/export.routes
 */

const express = require('express');
const { graphExportService } = require('../services/visualization');

const router = express.Router();

router.get('/formats', (req, res) => {
  try {
    res.json({ success: true, formats: graphExportService.getAvailableFormats() });
  } catch (error) {
    console.error('[ExportRoute] Formats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    res.json({ success: true, stats: graphExportService.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:format', (req, res) => {
  try {
    const { format } = req.params;
    const { nodeTypes, edgeTypes, limit, baseUri } = req.body;

    const result = graphExportService.export(format, {
      nodeTypes, edgeTypes,
      limit: limit ? parseInt(limit) : undefined,
      baseUri
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error(`[ExportRoute] Export ${req.params.format} error:`, error.message);
    const status = error.message.startsWith('Unsupported') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

router.get('/:format/download', (req, res) => {
  try {
    const { format } = req.params;
    const options = {
      nodeTypes: req.query.nodeTypes ? req.query.nodeTypes.split(',') : undefined,
      edgeTypes: req.query.edgeTypes ? req.query.edgeTypes.split(',') : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      baseUri: req.query.baseUri
    };

    const result = graphExportService.export(format, options);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="nodes.csv"');
      return res.send(result.files.nodes.content);
    }

    const ext = graphExportService.getAvailableFormats()
      .find(f => f.name === format || f.name === format.toLowerCase())?.extension || `.${format}`;

    res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="graph${ext}"`);
    res.send(result.content);
  } catch (error) {
    console.error(`[ExportRoute] Download ${req.params.format} error:`, error.message);
    const status = error.message.startsWith('Unsupported') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
