/**
 * Report API Routes
 * Knowledge graph report generation
 *
 * Endpoints:
 *   GET    /api/v1/reports/summary            - Overall graph summary
 *   GET    /api/v1/reports/entity/:id         - Entity detail report
 *   GET    /api/v1/reports/type/:type         - Type analysis report
 *   GET    /api/v1/reports/relationships      - Relationship report
 *   POST   /api/v1/reports/comparison         - Compare entities
 *   GET    /api/v1/reports/timeline           - Activity timeline
 *   GET    /api/v1/reports/formats            - Available formats
 *   GET    /api/v1/reports/stats              - Generation stats
 *
 * @module routes/report.routes
 */

const express = require('express');
const { reportService } = require('../services/visualization');

const router = express.Router();

router.get('/formats', (req, res) => {
  try {
    res.json({
      success: true,
      formats: reportService.getAvailableFormats(),
      reportTypes: reportService.getAvailableReportTypes()
    });
  } catch (error) {
    console.error('[ReportRoute] Formats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    res.json({ success: true, stats: reportService.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/summary', (req, res) => {
  try {
    const { format, topN } = req.query;
    const report = reportService.generateSummaryReport({
      format,
      topN: topN ? parseInt(topN) : undefined
    });
    if (report.formatted && report.contentType) {
      res.setHeader('Content-Type', report.contentType);
      return res.send(report.formatted);
    }
    res.json({ success: true, ...report });
  } catch (error) {
    console.error('[ReportRoute] Summary error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/entity/:id', (req, res) => {
  try {
    const { format } = req.query;
    const report = reportService.generateEntityReport(req.params.id, { format });
    if (report.formatted && report.contentType) {
      res.setHeader('Content-Type', report.contentType);
      return res.send(report.formatted);
    }
    res.json({ success: true, ...report });
  } catch (error) {
    console.error('[ReportRoute] Entity error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/type/:type', (req, res) => {
  try {
    const { format } = req.query;
    const report = reportService.generateTypeReport(req.params.type, { format });
    if (report.formatted && report.contentType) {
      res.setHeader('Content-Type', report.contentType);
      return res.send(report.formatted);
    }
    res.json({ success: true, ...report });
  } catch (error) {
    console.error('[ReportRoute] Type error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/relationships', (req, res) => {
  try {
    const { format } = req.query;
    const report = reportService.generateRelationshipReport({ format });
    if (report.formatted && report.contentType) {
      res.setHeader('Content-Type', report.contentType);
      return res.send(report.formatted);
    }
    res.json({ success: true, ...report });
  } catch (error) {
    console.error('[ReportRoute] Relationships error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/comparison', (req, res) => {
  try {
    const { entityIds, format } = req.body;
    if (!Array.isArray(entityIds) || entityIds.length < 2) {
      return res.status(400).json({ success: false, error: 'entityIds array with at least 2 IDs required' });
    }
    const report = reportService.generateComparisonReport(entityIds, { format });
    if (report.formatted && report.contentType) {
      res.setHeader('Content-Type', report.contentType);
      return res.send(report.formatted);
    }
    res.json({ success: true, ...report });
  } catch (error) {
    console.error('[ReportRoute] Comparison error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/timeline', (req, res) => {
  try {
    const { format, limit } = req.query;
    const report = reportService.generateTimelineReport({
      format,
      limit: limit ? parseInt(limit) : undefined
    });
    if (report.formatted && report.contentType) {
      res.setHeader('Content-Type', report.contentType);
      return res.send(report.formatted);
    }
    res.json({ success: true, ...report });
  } catch (error) {
    console.error('[ReportRoute] Timeline error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
