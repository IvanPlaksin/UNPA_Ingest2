'use strict';
/**
 * Document Index Routes  /api/v1/document-index
 *
 * Local, cross-source document search over the harvested SourceDocument index.
 * NEVER calls an external source — all results come from the local index.
 *
 *   GET  /search              — keyword/facet (and optional semantic) search
 *   GET  /facets              — facet values + counts for the filter UI
 *   GET  /stats               — index size + per-source coverage
 *   GET  /:id/document        — one indexed document by id
 *   GET  /status              — indexer worker status (+ error summary)
 *   GET  /errors              — recent processing errors/warnings + rollup
 *   GET  /throughput          — per-minute processed/new/error series
 *   POST /control             — { action: start|pause|resume|stop }
 *   POST /sources/:id/reindex — reset a source's cursor to re-harvest it
 *   GET  /progress            — SSE stream of indexing progress
 */

const express = require('express');
const router  = express.Router();

const search = require('../services/indexing/document-index.search');
const sync   = require('../services/indexing/document-index.sync');
const telemetry = require('../services/indexing/document-index.telemetry');
const errorPolicy = require('../services/indexing/document-index.error-policy');
const incidents   = require('../services/indexing/document-index.incidents');
const criticality = require('../services/indexing/document-index.criticality');
const aiResponder = require('../services/indexing/document-index.ai-responder');
const { getDocumentIndexService } = require('../services/indexing/document-index.service');

function parseSearchOpts(q) {
  return {
    q:            q.q || q.query || '',
    sourceId:     q.sourceId || null,
    fileType:     q.fileType || null,
    language:     q.language || null,
    enrichStatus: q.enrichStatus || null,
    dateFrom:     q.dateFrom || null,
    dateTo:       q.dateTo || null,
    hasPdf:       q.hasPdf === 'true' || q.hasPdf === '1',
    semantic:     q.semantic === 'true' || q.semantic === '1',
    page:         q.page,
    limit:        q.limit,
  };
}

// ── Search ──────────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const result = await search.search(parseSearchOpts(req.query));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Facets ──────────────────────────────────────────────────────

router.get('/facets', async (req, res) => {
  try {
    const result = await search.facets(parseSearchOpts(req.query));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Stats ───────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const [idx, vec] = await Promise.all([search.stats(), sync.stats().catch(() => ({ exists: false }))]);
    res.json({ success: true, data: { ...idx, semantic: vec } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Single document ─────────────────────────────────────────────

router.get('/:id/document', async (req, res) => {
  try {
    const doc = await search.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Indexer status / control ────────────────────────────────────

router.get('/status', (req, res) => {
  try {
    const status = getDocumentIndexService().getStatus();
    res.json({ success: true, data: { ...status, errorSummary: telemetry.errorSummary() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Processing errors / warnings log (for analysis) ─────────────

router.get('/errors', (req, res) => {
  try {
    const { level, sourceId, limit } = req.query;
    res.json({
      success: true,
      data: {
        summary: telemetry.errorSummary(),
        categories: telemetry.categories(),
        items: telemetry.listErrors({ level, sourceId, limit }),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Error categories + response methodologies ───────────────────

router.get('/categories', (req, res) => {
  try {
    res.json({ success: true, data: { categories: telemetry.categories(), catalog: errorPolicy.CATEGORIES } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Throughput time-series (documents processed per minute) ─────

router.get('/throughput', (req, res) => {
  try {
    res.json({ success: true, data: telemetry.throughputSeries(req.query.minutes) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/control', (req, res) => {
  try {
    const { action } = req.body || {};
    const svc = getDocumentIndexService();
    let result;
    switch (action) {
      case 'start':  result = svc.state === 'IDLE' && !svc._handle ? svc.schedule() && svc.getStatus() : svc.start(); break;
      case 'pause':  result = svc.pause(); break;
      case 'resume': result = svc.resume(); break;
      case 'stop':   result = svc.stop(); break;
      default: return res.status(400).json({ success: false, error: 'action must be start|pause|resume|stop' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sources/:id/reindex', async (req, res) => {
  try {
    const purge = req.body?.purgeVectors === true;
    const result = await getDocumentIndexService().reindexSource(req.params.id, { purgeVectors: purge });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Recount ALL sources accurately + reset finished ones to re-harvest ──

router.post('/recount-all', (req, res) => {
  try {
    const resetStatuses = Array.isArray(req.body?.resetStatuses) ? req.body.resetStatuses : ['complete', 'partial'];
    res.json({ success: true, data: getDocumentIndexService().recountAndResetAll({ resetStatuses }) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Count probe (sequential paging → total; re-indexes if grown) ────

router.post('/sources/:id/probe-count', async (req, res) => {
  try {
    const result = await getDocumentIndexService().probeSource(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Source not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Enable / disable a source for indexing (instant, safe) ──────

router.post('/sources/:id/enabled', async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);
    res.json({ success: true, data: await getDocumentIndexService().setSourceEnabled(req.params.id, enabled) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Source efficiency ratings + pool quotas ─────────────────────

router.get('/ratings', (req, res) => {
  try { res.json({ success: true, data: getDocumentIndexService().getRatings() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Pool-share quota allocation (real-time shares per active source + mode).
const quota = require('../services/indexing/document-index.quota');

router.get('/quota', (req, res) => {
  try { res.json({ success: true, data: getDocumentIndexService().getQuotaSnapshot() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Switch auto/manual mode (+ optional guaranteed-floor fraction for auto).
router.post('/quota/mode', (req, res) => {
  try {
    const mode = quota.setMode(req.body?.mode);
    if (req.body?.guaranteedFraction != null) quota.setGuaranteedFraction(req.body.guaranteedFraction);
    res.json({ success: true, data: getDocumentIndexService().getQuotaSnapshot() });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// Set manual shares { shares: { sourceId: fraction, ... } } → switches to manual,
// takes effect on the next dispatch cycle (immediate).
router.post('/quota/shares', (req, res) => {
  try {
    quota.setManualShares(req.body?.shares || {});
    res.json({ success: true, data: getDocumentIndexService().getQuotaSnapshot() });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Quarantine (durable) — sources & documents parked out of the pool ───

const durableState = require('../services/indexing/document-index.state');

// List quarantined sources: `needsIntervention` = non-transient (manual fix
// required); `all` = every currently-parked source (auto/needs_fix/manual).
router.get('/quarantine', (req, res) => {
  try {
    res.json({ success: true, data: {
      needsIntervention: durableState.listQuarantined('needs_fix'),
      all: durableState.listQuarantined(),
    } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Manually quarantine a source (default 30 days — until fixed).
router.post('/sources/:id/quarantine', (req, res) => {
  try {
    const ms = parseInt(req.body?.ms, 10) || (30 * 24 * 60 * 60 * 1000);
    const reason = req.body?.reason || 'manual';
    res.json({ success: true, data: getDocumentIndexService().pauseSource(req.params.id, ms, reason) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Lift a source quarantine/backoff (retry it).
router.post('/sources/:id/unquarantine', (req, res) => {
  try { res.json({ success: true, data: getDocumentIndexService().resumeSource(req.params.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Clear a source's per-document quarantine (retry all parked documents).
router.post('/sources/:id/clear-doc-quarantine', (req, res) => {
  try { res.json({ success: true, data: getDocumentIndexService().clearDocQuarantine(req.params.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Indexer config (worker count etc.) ──────────────────────────

router.post('/config', (req, res) => {
  try {
    const svc = getDocumentIndexService();
    const out = {};
    if (req.body?.concurrency != null) out.concurrency = svc.setConcurrency(req.body.concurrency);
    res.json({ success: true, data: { ...out, status: svc.getStatus() } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Incidents (problems + AI response + admin decisions) ────────

router.get('/incidents', (req, res) => {
  try {
    res.json({ success: true, data: { summary: incidents.summary(), items: incidents.list({ status: req.query.status, limit: req.query.limit }) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/incidents/:id', (req, res) => {
  try {
    const inc = incidents.get(req.params.id);
    if (!inc) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: inc });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Approve / reject one escalated action.
router.post('/incidents/:id/actions/:actionId/decision', async (req, res) => {
  try {
    const inc = await incidents.decide(req.params.id, req.params.actionId, req.body?.decision, req.body?.by || 'admin');
    res.json({ success: true, data: inc });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/incidents/:id/resolve', (req, res) => {
  try { res.json({ success: true, data: incidents.resolve(req.params.id, req.body?.by || 'admin') }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// Chat with the AI responder about an incident.
router.post('/incidents/:id/chat', async (req, res) => {
  try {
    const msg = await aiResponder.chat(req.params.id, req.body?.text || '');
    res.json({ success: true, data: { message: msg, incident: incidents.get(req.params.id) } });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── Criticality policy (configurable + AI-extendable) ───────────

router.get('/criticality', (req, res) => {
  try { res.json({ success: true, data: criticality.getPolicy() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.patch('/criticality', (req, res) => {
  try { res.json({ success: true, data: criticality.updatePolicy(req.body || {}, req.body?.by || 'admin') }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ── AI responder ────────────────────────────────────────────────

router.get('/ai/state', (req, res) => {
  try { res.json({ success: true, data: aiResponder.getState() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/ai/run', async (req, res) => {
  try { res.json({ success: true, data: await aiResponder.run({ trigger: 'manual' }) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Progress (SSE) ──────────────────────────────────────────────

router.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const svc = getDocumentIndexService();
  res.write(`event: status\ndata: ${JSON.stringify(svc.getStatus())}\n\n`);

  const onEvent = (payload) => {
    try { res.write(`event: progress\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };
  const unsubscribe = svc.subscribe(onEvent);

  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); } }, 20000);

  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

module.exports = router;
