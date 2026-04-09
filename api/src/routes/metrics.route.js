/**
 * Metrics Routes — Observability API for Codex, Agents, and BackLog.
 * Base path: /api/v1/metrics
 */

const express = require('express');
const router = express.Router();
const metrics = require('../services/observability/metrics.service');

/** GET /api/v1/metrics/codex — Codex usage stats */
router.get('/codex', (_req, res) => {
  res.json({ success: true, data: metrics.getCodexMetrics() });
});

/** GET /api/v1/metrics/agents — Agent tool calls & sessions */
router.get('/agents', (_req, res) => {
  res.json({ success: true, data: metrics.getAgentMetrics() });
});

/** GET /api/v1/metrics/backlog — BackLog stats (delegates to backlog service) */
router.get('/backlog', async (_req, res) => {
  try {
    const backlogService = require('../services/backlog/backlog.service');
    const stats = await backlogService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/v1/metrics/summary — Aggregated dashboard */
router.get('/summary', (_req, res) => {
  res.json({ success: true, data: metrics.getSummary() });
});

/** POST /api/v1/metrics/reset — Clear all metrics (admin) */
router.post('/reset', (_req, res) => {
  metrics.reset();
  res.json({ success: true, message: 'Metrics reset' });
});

module.exports = router;
