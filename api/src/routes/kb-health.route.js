'use strict';

/**
 * KB Health API Routes
 *
 * GET /api/v1/health/kb          — Full health metrics
 * GET /api/v1/health/kb/history  — Metrics history
 * GET /api/v1/health/kb/issues   — Detected issues
 * GET /api/v1/health/kb/metrics/:metric — Individual metric
 */

const express = require('express');
const router = express.Router();
const { getKBHealthService } = require('../services/kb-health/kb-health.service');

/**
 * GET /
 * Compute and return all 6 metrics + composite health score
 */
router.get('/', async (_req, res) => {
  try {
    const svc = getKBHealthService();
    const metrics = await svc.computeHealthMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /history
 * Return stored metrics snapshots
 */
router.get('/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const svc = getKBHealthService();
    const history = await svc.getMetricsHistory(hours);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /issues
 * Return list of detected KB issues sorted by severity
 */
router.get('/issues', async (_req, res) => {
  try {
    const svc = getKBHealthService();
    const issues = await svc.getIssues();
    res.json({ success: true, data: issues, count: issues.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /metrics/:metric
 * Return a single metric (coverage|consistency|freshness|connectivity|accuracy|usefulness)
 */
router.get('/metrics/:metric', async (req, res) => {
  try {
    const METHODS = {
      coverage:     'computeCoverage',
      consistency:  'computeConsistency',
      freshness:    'computeFreshness',
      connectivity: 'computeConnectivity',
      accuracy:     'computeAccuracy',
      usefulness:   'computeUsefulness'
    };

    const method = METHODS[req.params.metric];
    if (!method) {
      return res.status(400).json({
        success: false,
        error: `Unknown metric: ${req.params.metric}. Valid: ${Object.keys(METHODS).join(', ')}`
      });
    }

    const svc = getKBHealthService();
    const result = await svc[method]();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
