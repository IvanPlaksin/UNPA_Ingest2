/**
 * Anomaly Tasks Routes
 *
 * Create iNeed tasks from SQL extraction anomalies.
 */

const express = require('express');
const router = express.Router();
const { anomalyTaskMapper } = require('../services/ingestion/anomaly-task-mapper.service');

/**
 * GET /api/v1/anomaly-tasks/preview/:sessionId
 * Preview tasks that would be created from anomalies.
 */
router.get('/preview/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { filter } = req.query;

  try {
    const { IngestionGraphService } = require('../services/ingestion/ingestion-graph.service');
    const memgraphService = require('../services/memgraph.service');
    const ingestionGraph = new IngestionGraphService(memgraphService);

    const session = await ingestionGraph.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let anomalies = session.anomalies || [];
    if (filter === 'actionable') anomalies = anomalyTaskMapper.filterActionable(anomalies);
    if (filter === 'critical') anomalies = anomalies.filter(a => a.severity === 'high');

    const previews = anomalies.map(a => {
      const task = anomalyTaskMapper.mapToTask(a, { sessionId, sourceDatabase: session.sourceDatabase, sourceServer: session.sourceServer });
      return {
        anomalyId: a.id,
        anomalyType: a.type,
        severity: a.severity,
        hasExistingTask: a.hasTask || false,
        taskPreview: { title: task.title, category: task.category, priority: task.priority, suggestedActions: task.suggestedActions },
      };
    });

    res.json({ sessionId, database: session.sourceDatabase, totalAnomalies: (session.anomalies || []).length, actionableCount: previews.length, previews });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/anomaly-tasks/create
 * Create single iNeed task from anomaly.
 * Body: { sessionId, anomaly }
 */
router.post('/create', async (req, res) => {
  const { sessionId, anomaly } = req.body;

  if (!sessionId || !anomaly) {
    return res.status(400).json({ error: 'sessionId and anomaly are required' });
  }

  try {
    const { IngestionGraphService } = require('../services/ingestion/ingestion-graph.service');
    const memgraphService = require('../services/memgraph.service');
    const ingestionGraph = new IngestionGraphService(memgraphService);

    const session = await ingestionGraph.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const task = anomalyTaskMapper.mapToTask(anomaly, { sessionId, sourceDatabase: session.sourceDatabase, sourceServer: session.sourceServer });
    const rawText = anomalyTaskMapper.generateIneedText(task);

    // Try to submit to iNeed (may not be available)
    let executionId = null;
    try {
      const axios = require('axios');
      const ineedUrl = process.env.INEED_SERVICE_URL || `http://localhost:${process.env.PORT || 3010}/api/v1/ineed`;
      const resp = await axios.post(`${ineedUrl}/submit`, { user_id: 'system', raw_text: rawText, metadata: task.metadata }, { timeout: 5000 });
      executionId = resp.data?.execution_id;
    } catch (e) {
      console.warn('[AnomalyTasks] iNeed submit failed (service may not be running):', e.message);
    }

    res.json({ success: true, taskId: executionId, task: { title: task.title, category: task.category, priority: task.priority }, rawText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/anomaly-tasks/create-batch
 * Create tasks from multiple anomalies.
 * Body: { sessionId, anomalies, filter? }
 */
router.post('/create-batch', async (req, res) => {
  const { sessionId, anomalies: inputAnomalies, filter } = req.body;

  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  try {
    const { IngestionGraphService } = require('../services/ingestion/ingestion-graph.service');
    const memgraphService = require('../services/memgraph.service');
    const ingestionGraph = new IngestionGraphService(memgraphService);

    const session = await ingestionGraph.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let anomalies = inputAnomalies || session.anomalies || [];
    if (filter === 'actionable') anomalies = anomalyTaskMapper.filterActionable(anomalies);
    if (filter === 'critical') anomalies = anomalies.filter(a => a.severity === 'high');

    const results = { created: [], failed: [], skipped: [] };

    for (const anomaly of anomalies) {
      if (anomaly.hasTask) { results.skipped.push({ anomalyId: anomaly.id, reason: 'already has task' }); continue; }

      try {
        const task = anomalyTaskMapper.mapToTask(anomaly, { sessionId, sourceDatabase: session.sourceDatabase, sourceServer: session.sourceServer });
        results.created.push({ anomalyId: anomaly.id, title: task.title, category: task.category, priority: task.priority });
      } catch (e) {
        results.failed.push({ anomalyId: anomaly.id, error: e.message });
      }
    }

    res.json({ success: true, summary: { total: anomalies.length, created: results.created.length, failed: results.failed.length, skipped: results.skipped.length }, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
