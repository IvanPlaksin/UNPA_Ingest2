'use strict';

const express = require('express');
const router  = express.Router();
const { batchOrchestratorService } = require('../services/extraction/batch-orchestrator.service');

// POST /api/v1/extraction/batch — create a new batch
router.post('/', async (req, res) => {
  try {
    const { sourceId, query = '', filters = {}, options = {} } = req.body;
    if (!sourceId) return res.status(400).json({ error: 'sourceId required' });
    const batch = await batchOrchestratorService.createBatch(sourceId, query, filters, options);
    res.status(201).json({ success: true, data: batch });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/extraction/batch/:batchId/import — start import phase
router.post('/:batchId/import', async (req, res) => {
  try {
    const result = await batchOrchestratorService.startImport(req.params.batchId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/extraction/batch/:batchId/extract — start extraction phase
router.post('/:batchId/extract', async (req, res) => {
  try {
    const result = await batchOrchestratorService.startExtraction(req.params.batchId, req.body);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/extraction/batch/:batchId/run — full lifecycle (create+import+extract)
router.post('/:batchId/run', async (req, res) => {
  try {
    const batch = await batchOrchestratorService.getBatch(req.params.batchId);
    if (!batch) return res.status(404).json({ error: 'BatchJob not found' });
    await batchOrchestratorService.startImport(batch.id);
    const result = await batchOrchestratorService.startExtraction(batch.id, req.body);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/extraction/batch/:batchId/cancel
router.post('/:batchId/cancel', async (req, res) => {
  try {
    const result = await batchOrchestratorService.cancelBatch(req.params.batchId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/extraction/batch/:batchId/retry-failed
router.post('/:batchId/retry-failed', async (req, res) => {
  try {
    const result = await batchOrchestratorService.retryFailed(req.params.batchId);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/extraction/batch/:batchId — get batch details
router.get('/:batchId', async (req, res) => {
  try {
    const batch = await batchOrchestratorService.getBatch(req.params.batchId);
    if (!batch) return res.status(404).json({ error: 'BatchJob not found' });
    res.json({ success: true, data: batch });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/extraction/batch — list batches
router.get('/', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const batches = await batchOrchestratorService.listBatches({
      status: status || null,
      limit:  parseInt(limit) || 20,
    });
    res.json({ success: true, count: batches.length, data: batches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/extraction/batch/:batchId/progress — SSE real-time progress
router.get('/:batchId/progress', async (req, res) => {
  const { batchId } = req.params;

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  // Send current state immediately
  try {
    const progress = await batchOrchestratorService.getBatchProgress(batchId);
    if (progress) send('progress', progress);
    else send('error', { message: 'BatchJob not found' });
  } catch (e) {
    send('error', { message: e.message });
  }

  // Subscribe to Redis pub/sub for live events
  let subscriber = null;
  try {
    const IORedis = require('ioredis');
    subscriber = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
    });
    await subscriber.subscribe(`batch:events:${batchId}`);
    subscriber.on('message', (channel, msg) => {
      try {
        const data = JSON.parse(msg);
        send(data.type || 'event', data);
        if (data.type === 'completed' || data.type === 'cancelled') {
          cleanup();
          res.end();
        }
      } catch { /* ignore parse errors */ }
    });
  } catch (e) {
    send('error', { message: `SSE subscribe failed: ${e.message}` });
  }

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  function cleanup() {
    clearInterval(heartbeat);
    if (subscriber) subscriber.disconnect();
  }

  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;
