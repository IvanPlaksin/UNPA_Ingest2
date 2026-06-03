'use strict';
/**
 * Knowledge Triangle + Gap Detection Routes
 *
 * Triangle completeness:
 *   GET  /api/v1/triangle/process/:processId/completeness   — detailed completeness
 *   GET  /api/v1/triangle/incomplete                        — processes with incomplete triangle
 *
 * Gap management:
 *   GET  /api/v1/triangle/gaps                              — query gaps
 *   GET  /api/v1/triangle/gaps/statistics                  — gap aggregate stats
 *   GET  /api/v1/triangle/gaps/stale                       — unaddressed gaps
 *   POST /api/v1/triangle/gaps/detect                      — run full detection
 *   PATCH /api/v1/triangle/gaps/:gapId/status              — update gap lifecycle
 *
 * Namespace:
 *   GET  /api/v1/triangle/namespace/completeness           — avg completeness for namespace
 */

const express = require('express');
const router  = express.Router();

const { knowledgeTriangleService } = require('../services/knowledge/knowledge-triangle.service');
const { gapDetectionService }      = require('../services/knowledge/gap-detection.service');

// ─── Triangle completeness ────────────────────────────────────────────────────

router.get('/process/:processId/completeness', async (req, res) => {
  try {
    const result = await knowledgeTriangleService.getTriangleCompleteness(req.params.processId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/incomplete', async (req, res) => {
  try {
    const result = await knowledgeTriangleService.findIncompleteTriangles();
    res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Gap queries ──────────────────────────────────────────────────────────────

// GET /api/v1/triangle/gaps?status=OPEN&severity=HIGH&processId=...
router.get('/gaps', async (req, res) => {
  try {
    const { status, severity, processId } = req.query;
    let gaps;
    if (status === 'OPEN' || !status) {
      gaps = await knowledgeTriangleService.getOpenGaps(processId || null);
    } else {
      // Fetch all gaps by status from Memgraph
      const mg = require('../services/memgraph.service');
      let cypher = `MATCH (gap:Gap) WHERE gap.status = $status`;
      if (severity) cypher += ` AND gap.severity = $severity`;
      if (processId) cypher += ` AND gap.affectedProcess = $procId`;
      cypher += ` RETURN gap.id as id, gap.gapType as gapType, gap.severity as severity,
                         gap.status as status, gap.title as title,
                         gap.identifiedAt as identifiedAt, gap.affectedProcess as affectedProcess
                  LIMIT 100`;
      gaps = await mg.runQuery(cypher, { status, severity: severity || null, procId: processId || null });
    }
    res.json({ success: true, count: gaps.length, data: gaps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/gaps/statistics', async (req, res) => {
  try {
    const { namespace } = req.query;
    const stats = await gapDetectionService.getGapStatistics({ namespace });
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/triangle/gaps/stale?days=90&severity=HIGH
router.get('/gaps/stale', async (req, res) => {
  try {
    const { days, severity, limit } = req.query;
    const result = await gapDetectionService.findStaleGaps({
      daysOld:  days     ? parseInt(days, 10) : undefined,
      severity: severity || null,
      limit:    limit    ? parseInt(limit, 10) : 50
    });
    res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/triangle/gaps/detect — run full gap detection
router.post('/gaps/detect', async (req, res) => {
  try {
    const { namespace, staleThresholdDays, reviewThresholdDays, persist } = req.body || {};
    const result = await gapDetectionService.runGapDetection({
      namespace, staleThresholdDays, reviewThresholdDays, persist: persist === true
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/triangle/gaps/:gapId/status
router.patch('/gaps/:gapId/status', async (req, res) => {
  try {
    const { gapId } = req.params;
    const { status, resolution } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status required' });
    const result = await knowledgeTriangleService.updateGapStatus(gapId, status, resolution);
    res.json({ success: true, data: result });
  } catch (err) {
    const code = err.message.includes('Invalid') ? 400
               : err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, error: err.message });
  }
});

// ─── Namespace-level completeness ─────────────────────────────────────────────

// GET /api/v1/triangle/namespace/completeness?namespace=KM&sampleLimit=100
router.get('/namespace/completeness', async (req, res) => {
  try {
    const { namespace, sampleLimit } = req.query;
    const result = await gapDetectionService.getNamespaceCompleteness({
      namespace:   namespace   || null,
      sampleLimit: sampleLimit ? parseInt(sampleLimit, 10) : 100
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/triangle/gaps/review — gaps needing management review
router.get('/gaps/review', async (req, res) => {
  try {
    const { days, limit } = req.query;
    const result = await gapDetectionService.findGapsRequiringReview({
      daysOld: days  ? parseInt(days, 10)  : undefined,
      limit:   limit ? parseInt(limit, 10) : 50
    });
    res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
