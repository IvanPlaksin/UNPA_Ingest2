'use strict';
/**
 * KQS Routes — Knowledge Quality Score
 *
 * GET  /api/v1/kqs/node/:nodeId          — KQS for single node
 * GET  /api/v1/kqs/process/:processId    — KQS for process (with triangle context)
 * POST /api/v1/kqs/batch                 — KQS for multiple nodes
 * GET  /api/v1/kqs/rankings              — Top nodes by KQS
 * GET  /api/v1/kqs/low                   — Nodes below KQS threshold
 */

const express = require('express');
const router  = express.Router();
const { kqsService, KQS_WEIGHTS } = require('../services/knowledge/kqs.service');

// GET /api/v1/kqs/node/:nodeId
router.get('/node/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const persist = req.query.persist !== 'false';
    const result = await kqsService.calculateKQSById(nodeId, { persist });
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// GET /api/v1/kqs/process/:processId
router.get('/process/:processId', async (req, res) => {
  try {
    const { processId } = req.params;
    const entity = await kqsService._fetchNode(processId);
    const result = await kqsService.calculateKQS(entity, { processId });
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// POST /api/v1/kqs/batch
// Body: { nodeIds: string[], persist?: boolean }
router.post('/batch', async (req, res) => {
  try {
    const { nodeIds, persist = true } = req.body;
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      return res.status(400).json({ success: false, error: 'nodeIds must be a non-empty array' });
    }
    if (nodeIds.length > 100) {
      return res.status(400).json({ success: false, error: 'Maximum 100 nodes per batch' });
    }
    const results = await kqsService.calculateKQSBatch(nodeIds, { persist });
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/kqs/rankings?layer=L1&namespace=KM&minKQS=0.5&limit=20
router.get('/rankings', async (req, res) => {
  try {
    const { layer, namespace, minKQS, limit } = req.query;
    const results = await kqsService.getRankedNodes({
      layer:     layer     || null,
      namespace: namespace || null,
      minKQS:    minKQS ? parseFloat(minKQS) : 0,
      limit:     limit  ? parseInt(limit, 10) : 50
    });
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/kqs/low?threshold=0.3&layer=L3&namespace=KM&limit=20
router.get('/low', async (req, res) => {
  try {
    const { layer, namespace, threshold, limit } = req.query;
    const results = await kqsService.findLowKQSNodes({
      layer:     layer     || null,
      namespace: namespace || null,
      threshold: threshold ? parseFloat(threshold) : 0.3,
      limit:     limit     ? parseInt(limit, 10)   : 50
    });
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/kqs/weights — return formula weights (informational)
router.get('/weights', (_req, res) => {
  res.json({
    success: true,
    data: {
      formula: 'KQS = 0.35×NormativeWeight + 0.30×EmpiricalCertainty + 0.20×TemporalCurrency + 0.15×SourceAuthority',
      weights: KQS_WEIGHTS
    }
  });
});

module.exports = router;
