'use strict';

const express = require('express');
const router  = express.Router();
const agent   = require('../agents/es-ingestion.agent');

const ok  = (res, data)            => res.json({ success: true, data });
const err = (res, msg, code = 500) => res.status(code).json({ success: false, error: msg });

// POST /api/v1/es-ingestion-agent/start
router.post('/start', async (req, res) => {
  try {
    const { namespace = 'DEFAULT', batchSize = 5, methodology = 'M2' } = req.body || {};
    const result = await agent.start({ namespace, batchSize, methodology });
    ok(res, result);
  } catch (e) { err(res, e.message, 409); }
});

// POST /api/v1/es-ingestion-agent/stop
router.post('/stop', async (req, res) => {
  try { ok(res, await agent.stop()); }
  catch (e) { err(res, e.message); }
});

// POST /api/v1/es-ingestion-agent/pause
router.post('/pause', (req, res) => {
  try { ok(res, agent.pause()); }
  catch (e) { err(res, e.message); }
});

// POST /api/v1/es-ingestion-agent/resume
router.post('/resume', (req, res) => {
  try { ok(res, agent.resume()); }
  catch (e) { err(res, e.message); }
});

// GET /api/v1/es-ingestion-agent/status
router.get('/status', (req, res) => {
  try { ok(res, agent.getStatus()); }
  catch (e) { err(res, e.message); }
});

// GET /api/v1/es-ingestion-agent/logs?limit=100
router.get('/logs', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 300);
    ok(res, { entries: agent.getLogs(limit) });
  } catch (e) { err(res, e.message); }
});

// GET /api/v1/es-ingestion-agent/logs/stream  — SSE
router.get('/logs/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send buffered history so the client catches up immediately
  const history = agent.getLogs(200);
  if (history.length) {
    res.write(`event: history\ndata: ${JSON.stringify(history)}\n\n`);
  }

  const onEntry = entry => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };
  agent.logEmitter.on('entry', onEntry);

  // Heartbeat every 20s to keep the connection alive through proxies
  const hb = setInterval(() => res.write(': ping\n\n'), 20_000);

  req.on('close', () => {
    clearInterval(hb);
    agent.logEmitter.off('entry', onEntry);
  });
});

module.exports = router;
