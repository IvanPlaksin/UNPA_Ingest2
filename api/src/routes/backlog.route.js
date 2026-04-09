/**
 * BackLog API Routes — Task management for code modifications
 */

const express = require('express');
const router = express.Router();
const backlogService = require('../services/backlog/backlog.service');

// ============================================================
// SSE — Real-time updates
// ============================================================

const sseClients = new Set();

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

// Notify all SSE clients on backlog changes
backlogService.on('change', ({ event, data }) => {
  broadcastSSE(event, data);
});

router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ============================================================
// CRUD
// ============================================================

router.post('/items', async (req, res) => {
  try {
    const item = await backlogService.create(req.body, {
      createdBy: req.body.createdBy || req.headers['x-agent-id'] || 'anonymous'
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    const items = await backlogService.list(req.query);
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ranked tasks — MUST be before /:backlogId to avoid param capture
router.get('/items/ranked', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const ranked = await rankingService.getRankedTasks({
      includeCompleted: req.query.includeCompleted === 'true',
      limit: parseInt(req.query.limit) || 50,
    });
    res.json({ success: true, data: ranked, count: ranked.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/items/:backlogId', async (req, res) => {
  try {
    const item = await backlogService.getById(req.params.backlogId);
    if (!item) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// STATE TRANSITIONS
// ============================================================

router.post('/items/:backlogId/approve', async (req, res) => {
  try {
    const item = await backlogService.approve(req.params.backlogId, req.body.approvedBy || 'admin');
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/reject', async (req, res) => {
  try {
    const item = await backlogService.reject(req.params.backlogId, req.body.rejectedBy || 'admin', req.body.reason);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/start', async (req, res) => {
  try {
    const item = await backlogService.start(req.params.backlogId, req.body.assignedTo);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/block', async (req, res) => {
  try {
    const item = await backlogService.block(req.params.backlogId, req.body.blockedBy, req.body.reason);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/unblock', async (req, res) => {
  try {
    const item = await backlogService.unblock(req.params.backlogId);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/review', async (req, res) => {
  try {
    const item = await backlogService.submitForReview(req.params.backlogId, req.body.implementationNotes, req.body.implementedFiles);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/complete', async (req, res) => {
  try {
    const item = await backlogService.complete(req.params.backlogId, req.body.verifiedBy || 'admin');
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/items/:backlogId/cancel', async (req, res) => {
  try {
    const item = await backlogService.cancel(req.params.backlogId, req.body.cancelledBy, req.body.reason);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// DEPENDENCIES
// ============================================================

router.post('/items/:backlogId/dependencies', async (req, res) => {
  try {
    await backlogService.addDependency(req.params.backlogId, req.body.dependsOn);
    res.json({ success: true, message: 'Dependency added' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// STATISTICS
// ============================================================

router.get('/stats', async (req, res) => {
  try {
    const stats = await backlogService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// RANKING & AI ANALYSIS
// ============================================================

// Ranked by namespace (grouped view)
router.get('/ranked-by-namespace', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const grouped = await rankingService.getRankedByNamespace({
      includeCompleted: req.query.includeCompleted === 'true',
    });
    res.json({ success: true, data: grouped });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Available namespaces
router.get('/namespaces', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const ns = await rankingService.getNamespaces();
    res.json({ success: true, data: ns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save rankings to KB
router.post('/rank/save', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const ranked = await rankingService.getRankedTasks({ limit: 100 });
    const result = await rankingService.saveRankings(ranked);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dependency-graph', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const graph = await rankingService.getDependencyGraph();
    res.json({ success: true, data: graph });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/execution-plan', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const plan = await rankingService.getExecutionPlan();
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const rankingService = require('../services/backlog/ranking.service');
    const { buildRankingAnalysisPrompt } = require('../prompts/ranking-agent.prompt');
    const llmService = require('../services/llm.service');

    // Gather all data
    const [ranked, plan, stats, depGraph] = await Promise.all([
      rankingService.getRankedTasks({ limit: 30 }),
      rankingService.getExecutionPlan(),
      backlogService.getStats(),
      rankingService.getDependencyGraph(),
    ]);

    // Build specialized prompt
    const prompt = buildRankingAnalysisPrompt(ranked, plan, stats, depGraph);

    // Call LLM via chat interface
    const messages = [{ role: 'user', content: prompt }];
    const analysis = await llmService.chat(messages, [], null, { maxTokens: 4096 });

    res.json({
      success: true,
      data: {
        analysis: analysis.text || analysis.content || (typeof analysis === 'string' ? analysis : JSON.stringify(analysis)),
        rankedCount: ranked.length,
        executionPlan: plan,
        stats,
      },
    });
  } catch (error) {
    console.error('[BackLog] Analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mount extended routes (TM1)
const extendedRoutes = require('./backlog-extended.route');
router.use('/', extendedRoutes);

module.exports = router;
