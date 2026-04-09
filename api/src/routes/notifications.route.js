/**
 * Notification + Token Tracking Routes
 */

'use strict';

const express = require('express');
const router = express.Router();
const notificationService = require('../services/notifications/notification.service');
const tokenTracker = require('../services/backlog/token-tracker.service');
const complexityEstimator = require('../services/backlog/complexity-estimator');
const circuitBreaker = require('../services/backlog/circuit-breaker.service');

// ============================================================
// NOTIFICATIONS
// ============================================================

router.get('/notifications', (req, res) => {
  const { category, unreadOnly, limit } = req.query;
  const items = notificationService.list({ category, unreadOnly: unreadOnly === 'true', limit: parseInt(limit) || 50 });
  res.json({ success: true, data: items });
});

router.get('/notifications/metrics', (req, res) => {
  res.json({ success: true, data: notificationService.getMetrics() });
});

router.post('/notifications/:id/read', (req, res) => {
  const n = notificationService.markRead(req.params.id);
  res.json({ success: true, data: n });
});

router.post('/notifications/read-all', (req, res) => {
  notificationService.markAllRead(req.body?.category);
  res.json({ success: true });
});

// SSE stream for notifications
router.get('/notifications/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  notificationService.addSSEClient(res);
});

// ============================================================
// TOKEN TRACKING
// ============================================================

router.get('/tokens/cycle/:cycleId', async (req, res) => {
  try {
    const usage = await tokenTracker.getCycleUsage(req.params.cycleId);
    res.json({ success: true, data: usage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/tokens/task/:backlogId', async (req, res) => {
  try {
    const usage = await tokenTracker.getTaskUsage(req.params.backlogId);
    res.json({ success: true, data: usage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/tokens/stats', async (req, res) => {
  try {
    const stats = await tokenTracker.getHistoricalStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/tokens/record', async (req, res) => {
  try {
    const usage = await tokenTracker.recordUsage(req.body.cycleId, req.body);
    res.status(201).json({ success: true, data: usage });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// COMPLEXITY
// ============================================================

router.get('/complexity/:backlogId', async (req, res) => {
  try {
    let comp = await complexityEstimator.getComplexity(req.params.backlogId);
    if (!comp) comp = await complexityEstimator.estimateAndSave(req.params.backlogId);
    res.json({ success: true, data: comp });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/complexity/:backlogId/estimate', async (req, res) => {
  try {
    const comp = await complexityEstimator.estimateAndSave(req.params.backlogId);
    res.json({ success: true, data: comp });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// CIRCUIT BREAKER
// ============================================================

router.get('/circuit-breaker/:cycleId', async (req, res) => {
  try {
    const status = await circuitBreaker.check(req.params.cycleId);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/circuit-breaker/:cycleId/reset', (req, res) => {
  const result = circuitBreaker.reset(req.params.cycleId);
  res.json({ success: true, data: result });
});

router.get('/circuit-breaker/limits', (req, res) => {
  res.json({ success: true, data: circuitBreaker.getLimits() });
});

router.post('/circuit-breaker/limits', (req, res) => {
  const result = circuitBreaker.setLimits(req.body);
  res.json({ success: true, data: result });
});

// ============================================================
// SESSION MANAGER (Parallel Agent Control)
// ============================================================

const sessionManager = require('../services/agents/session-manager.service');

router.get('/sessions', (req, res) => {
  res.json({ success: true, data: sessionManager.listSessions(req.query) });
});

router.get('/sessions/status', (req, res) => {
  res.json({ success: true, data: sessionManager.getStatus() });
});

router.post('/sessions/max-parallel', (req, res) => {
  const max = sessionManager.setMaxParallel(req.body.max || 3);
  res.json({ success: true, data: { maxParallel: max } });
});

router.post('/sessions/enqueue', (req, res) => {
  try {
    const session = sessionManager.enqueue(req.body.backlogId, req.body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/sessions/:id/start', (req, res) => {
  try { res.json({ success: true, data: sessionManager.start(req.params.id) }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/sessions/:id/pause', (req, res) => {
  try { res.json({ success: true, data: sessionManager.pause(req.params.id) }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/sessions/:id/stop', (req, res) => {
  try { res.json({ success: true, data: sessionManager.stop(req.params.id) }); }
  catch (error) { res.status(400).json({ success: false, error: error.message }); }
});

router.post('/sessions/stop-all', (req, res) => {
  res.json({ success: true, data: sessionManager.stopAll() });
});

// ============================================================
// EFFICIENCY ANALYTICS
// ============================================================

const efficiencyAnalyzer = require('../services/analytics/efficiency-analyzer.service');

router.post('/efficiency/:backlogId/analyze', async (req, res) => {
  try {
    const analysis = await efficiencyAnalyzer.analyzeTask(req.params.backlogId);
    res.json({ success: true, data: analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/efficiency/:backlogId/create-optimization', async (req, res) => {
  try {
    const analysis = await efficiencyAnalyzer.analyzeTask(req.params.backlogId);
    const task = await efficiencyAnalyzer.createOptimizationTask(
      req.params.backlogId, analysis, req.body.scope || 'THIS_TASK'
    );
    res.json({ success: true, data: { analysis, optimizationTask: task } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
