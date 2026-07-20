'use strict';

/**
 * FlowDesk Chat Admin controller (ADMIN P1–P4) — thin HTTP layer over
 * chat-admin.service and admin-telemetry.service. All routes are mounted at
 * /api/v1/flowdesk/admin behind flowdeskAdminMiddleware.
 *
 * @module instances/flowdesk/controller/flowdesk-admin.controller
 */

const svc = require('../services/chat-admin.service');
const adminTel = require('../services/admin-telemetry.service');

/** Uniform handler wrapper: JSON out, typed status from err.status, 500 default. */
const h = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (err) {
    const status = err.status || (err.name === 'AltioraNotFoundError' ? 404
      : err.name === 'AltioraAuthError' ? 502
      : err.name === 'AltioraUnavailableError' ? 503 : 500);
    if (status >= 500) console.error('[flowdesk-admin]', req.method, req.originalUrl, err.message);
    if (!res.headersSent) res.status(status).json({ error: err.message, code: err.name || undefined });
  }
};

// ── Sessions (P1) ─────────────────────────────────────────────────────────────
const listSessions = h((req) => svc.listSessions(req.query));
const sessionStats = h((req) => svc.sessionStats({ days: req.query.days }));
const getSession = h(async (req) => {
  const out = await svc.getSession(req.params.sessionId);
  if (!out) throw Object.assign(new Error('session not found'), { status: 404 });
  return out;
});
const getTurns = h((req) => svc.getTurns(req.params.sessionId));

// ── Quality (P2) ──────────────────────────────────────────────────────────────
const listNegative = h((req) => svc.listNegativeSessions(req.query));
const qualityMeta = h(() => ({ statuses: svc.QUALITY_STATUSES, rootCauses: svc.ROOT_CAUSES, badOutcomes: svc.BAD_OUTCOMES }));
const triageSession = h((req) => svc.triageSession(req.params.sessionId, {
  ...req.body,
  reviewedBy: req.body?.reviewedBy || req.flowdeskUser?.email || req.flowdeskUser?.userId || 'admin',
}));
const createBacklog = h((req) => svc.createBacklogFromSession(req.params.sessionId, {
  ...req.body,
  createdBy: req.flowdeskUser?.email || 'flowdesk-chat-admin',
}));

// ── Catalog (P3) ─────────────────────────────────────────────────────────────
const listCatalog = h(() => svc.listCatalog());
const catalogProviders = h((req) => svc.catalogProviders(req.params.code, { locationPath: req.query.locationPath }));
const runCatalogSync = h((req) => svc.runCatalogSync({ purgeStale: req.body?.purgeStale === true, trigger: 'admin' }));
const listCatalogSyncRuns = h((req) => adminTel.listCatalogSyncRuns({ limit: req.query.limit }));
const resolveIntent = h((req) => {
  const q = req.query.q;
  if (!q || String(q).trim().length < 2) throw Object.assign(new Error('q (>=2 chars) is required'), { status: 400 });
  return svc.resolveIntent(String(q));
});

// ── Schemas (P3) ─────────────────────────────────────────────────────────────
const listSchemas = h(() => svc.listSchemas());
const getSchemaDetail = h((req) => svc.getSchemaDetail(req.params.ousId, { includeSource: req.query.includeSource === 'true' }));
const invalidateSchema = h((req) => svc.invalidateSchema(req.params.ousId));
// P7 — schema-enrichment AI agent (Claude Haiku)
const se = () => require('../services/schema-enrichment.service');
const schemaEnrichGenerate = h((req) => se().generate(req.params.ousId));
const schemaEnrichApply = h((req) => se().apply(req.params.ousId, req.body || {}));
const schemaEnrich = h((req) => se().enrich(req.params.ousId));       // generate + apply
const schemaEnrichStored = h((req) => se().getStored(req.query.serviceId));
// P8 — export selected schemas as a ZIP (schemas.xlsx + schemas.json)
async function schemaExport(req, res) {
  try {
    const ousIds = (req.body && req.body.ousIds) || [];
    if (!Array.isArray(ousIds) || !ousIds.length) return res.status(400).json({ error: 'ousIds[] is required' });
    const { buffer, filename } = await require('../services/schema-export.service').buildExport(ousIds);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error('[flowdesk-admin] schemaExport', err.message);
    if (!res.headersSent) res.status(err.status || 500).json({ error: err.message });
  }
}
// Accepts :ousId (Schemas tab) or :code (Catalog tab first-time materialization).
const rematerializeSchema = h((req) => svc.rematerializeSchema(req.params.ousId ?? req.params.code));

// ── Sync (P3) ─────────────────────────────────────────────────────────────────
const syncStatus = h(() => svc.syncStatus());
const listSyncEvents = h((req) => adminTel.listSyncEvents(req.query));
const syncPollNow = h(() => svc.syncPollNow());

// ── Session-analysis agent + prompt overlays (P5) ─────────────────────────────
const analyzeSession = h((req) => require('../services/session-analysis.service')
  .getSessionAnalysis().analyzeSession(req.params.sessionId, { force: req.body?.force === true }));
const listOverlays = h((req) => require('../services/prompt-overlay.service').listOverlays(req.query));
const applyOverlay = h((req) => require('../services/prompt-overlay.service').applyOverlay({
  ...req.body,
  updatedBy: req.flowdeskUser?.email || req.flowdeskUser?.userId || 'admin',
}));
const setOverlayActive = h((req) => require('../services/prompt-overlay.service')
  .setOverlayActive(req.params.overlayId, req.body?.active !== false));

// ── Prompt-graph editor (P6) ──────────────────────────────────────────────────
const pe = () => require('../services/prompt-editor.service');
const promptMeta = h(() => pe().meta());
const promptDefaultGraph = h(() => pe().defaultGraph());
const promptListGraphs = h(() => pe().listGraphs());
const promptGetGraph = h((req) => pe().getGraph(req.params.entryId, req.query.version));
const promptSaveGraph = h((req) => pe().saveGraph({ ...req.body, createdBy: req.flowdeskUser?.email || 'admin' }));
const promptMutateGraph = h((req) => pe().mutateGraph({ ...req.body, createdBy: req.flowdeskUser?.email || 'ai-assistant' }));
const promptGetVersions = h((req) => pe().getVersions(req.params.entryId));
const promptCompile = h((req) => pe().compile(req.body?.graph || req.body, { title: req.body?.title }));
const promptValidate = h((req) => pe().validate(req.body?.graph || req.body));
const promptSandbox = h((req) => pe().sandbox(req.body));
const promptApply = h((req) => pe().apply({ ...req.body, updatedBy: req.flowdeskUser?.email || 'admin' }));
const promptActive = h(() => pe().getActive());
const promptApplied = h((req) => pe().listApplied({ limit: req.query.limit }));
const promptClear = h(() => pe().clearActive());

// ── Prompt-editor AI assistant (P6) — SSE streaming ───────────────────────────
async function promptAssistantChat(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const emit = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* client gone */ } };
  const ac = new AbortController();
  // Abort ONLY on a real client disconnect (response socket closes before we
  // finished). NOTE: req.on('close') fires early — after body-parser consumes the
  // request stream — so it would kill the child mid-stream; use res.on('close').
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  try {
    const { message, history, graph, model } = req.body || {};
    if (!message || !String(message).trim()) { emit({ type: 'error', message: 'message is required' }); return res.end(); }
    const { streamAssistantTurn } = require('../services/prompt-editor-assistant.service');
    await streamAssistantTurn({ message, history, graph, model, signal: ac.signal }, emit);
  } catch (err) {
    emit({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
}

// ── Tickets + LLM + health (P4) ───────────────────────────────────────────────
const listTickets = h((req) => svc.listTickets(req.query));
const getTicketLive = h((req) => svc.getTicketLive(req.params.ticketId));
const llmStats = h((req) => svc.llmStats({ days: req.query.days }));
const adminHealth = h(() => svc.adminHealth());

module.exports = {
  listSessions, sessionStats, getSession, getTurns,
  listNegative, qualityMeta, triageSession, createBacklog,
  listCatalog, catalogProviders, runCatalogSync, listCatalogSyncRuns, resolveIntent,
  listSchemas, getSchemaDetail, invalidateSchema, rematerializeSchema,
  schemaEnrichGenerate, schemaEnrichApply, schemaEnrich, schemaEnrichStored, schemaExport,
  syncStatus, listSyncEvents, syncPollNow,
  analyzeSession, listOverlays, applyOverlay, setOverlayActive,
  promptMeta, promptDefaultGraph, promptListGraphs, promptGetGraph, promptSaveGraph, promptMutateGraph,
  promptGetVersions, promptCompile, promptValidate, promptSandbox, promptApply,
  promptActive, promptApplied, promptClear, promptAssistantChat,
  listTickets, getTicketLive, llmStats, adminHealth,
};
