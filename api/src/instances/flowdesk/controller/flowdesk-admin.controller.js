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
const getLlmCall = h((req) => svc.getLlmCall(req.query.key));

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

/**
 * HYB-FIX-003 — which interpreter is serving conversations, and PROOF of it.
 *
 * The mode alone would be a claim; the split is the evidence. A hybrid that reports
 * itself on while no turn is authored by a template means the router is handing
 * everything to the model, which looks identical to being switched off and cost
 * exactly as much for weeks before anyone noticed.
 */
const interpreterStatus = h(async (req) => {
  const chat = require('../interpreter/chat-v2.service');
  const { mode, source } = chat.interpreterMode();
  const hours = Number(req.query?.hours) || 24;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const num = (v) => (v && typeof v === 'object' && 'low' in v ? v.low : v);

  let template = 0;
  let model = 0;
  try {
    const { read } = require('../schema-graph/driver');
    const rows = await read(
      `MATCH (t:ChatTurn) WHERE t.ts >= $since AND t.turnAuthor IS NOT NULL
       RETURN t.turnAuthor AS author, count(t) AS n`,
      { since },
    );
    for (const r of rows) {
      const n = num(r.get('n'));
      if (r.get('author') === 'template') template = n; else if (r.get('author') === 'model') model = n;
    }
  } catch { /* telemetry unavailable — the mode is still worth reporting */ }

  const total = template + model;
  return {
    mode,
    source,
    windowHours: hours,
    turns: { total, template, model },
    templateShare: total ? Math.round((template / total) * 100) : null,
    // The one state that must be loud: claiming to be hybrid while behaving as agent.
    warning: mode === 'hybrid' && total > 0 && template === 0
      ? 'Hybrid is on, but no turn in this window was answered by the template. Every turn '
        + 'is costing a model call — the router is sending everything to the model.'
      : (mode === 'agent'
        ? 'Every turn calls the model, including form clicks a template answers without one.'
        : null),
  };
});
const promptDefaultGraph = h(() => pe().defaultGraph());
// HYB-011a: WHICH graph — 'agent' (EVOLUTIO:PROMPT, what the live chat compiles)
// or 'fsm' (CHAT_PROMPT, the state machine's). Read from the query for GETs and the
// body for POSTs; absent means 'fsm', which is what every caller meant before the
// parameter existed. See prompt-editor.service for why this had to become explicit.
const src = (req) => req.query?.source || req.body?.source || null;
const promptListGraphs = h((req) => pe().listGraphs(src(req)));
const promptGetGraph = h((req) => pe().getGraph(req.params.entryId, req.query.version, src(req)));
const promptSaveGraph = h((req) => pe().saveGraph({ ...req.body, createdBy: req.flowdeskUser?.email || 'admin' }));
// ПР-001/ПР-003 — WHICH graph is the system prompt. A GET that explains where the
// answer came from, because a selector that cannot say "the environment overrides you"
// would silently do nothing; and a POST that refuses a graph which cannot serve.
const fs = () => require('../services/flowdesk-settings.service');
const promptActiveEntry = h(() => fs().describeActivePromptEntry());
const promptSetActiveEntry = h((req) => fs().setActivePromptEntry(req.body?.entryId, {
  updatedBy: req.flowdeskUser?.email || 'admin',
}));
const promptMutateGraph = h((req) => pe().mutateGraph({ ...req.body, createdBy: req.flowdeskUser?.email || 'ai-assistant' }));
const promptGetVersions = h((req) => pe().getVersions(req.params.entryId, src(req)));
const promptPromoteVersion = h((req) => pe().promoteVersion(req.params.entryId, req.body?.version, src(req)));
// HYB-011c: the compile preview carries the one number that matters about a prompt
// — its length in tokens — and says whether that number is exact (the provider's own
// tokenizer) or estimated. The cache floor is a cliff, so a guess presented as a
// fact would get someone to trim a prompt to just under it.
const promptCompile = h(async (req) => {
  const compiled = pe().compile(req.body?.graph || req.body, {
    title: req.body?.title, source: src(req), language: req.body?.language, entryId: req.body?.entryId, version: req.body?.version,
  });
  const tokens = await require('../services/prompt-tokens.service').countPromptTokens(compiled && compiled.text);
  // EC-006: what the prompt is MADE of. The operator edits the graph, but what the
  // provider caches is graph + contract + padding — showing the graph's size against
  // the cache floor would light up red on a healthy prompt (measured: a 1,247-token
  // core under a 4,800 floor, with the padding closing the gap by design).
  let composition = null;
  if (src(req) === 'agent') {
    try {
      const layers = (compiled && compiled.manifest && compiled.manifest.layers) || {};
      composition = require('../agent-interpreter/agent-prompt.service').composition({
        graphText: layers.coreText ?? (compiled && compiled.text),
        conditionalText: layers.conditionalText || '',
      });
    } catch { /* the preview is still useful without the breakdown */ }
  }
  return { ...compiled, tokens, composition };
});
const promptValidate = h((req) => pe().validate(req.body?.graph || req.body, { source: src(req) }));
// EC-011 — the prompt in one or two of the nine reachable contexts, plus the per-rule
// table that says what differs between them.
const promptPreview = h((req) => pe().previewContexts(req.body?.graph || req.body, {
  contexts: req.body?.contexts, language: req.body?.language,
}));
const promptCoverage = h((req) => require('../../../services/evolutio/evolutio-prompt.coverage')
  .coverage(req.body?.graph || req.body, { catalogCategories: req.body?.catalogCategories }));
// PE-006/007 — the two directions between a recorded turn and the rules that were in
// force on it. The provenance travels on the turn itself, so the caller passes what it
// already has rather than the service re-reading the turn.
const pa = () => require('../services/prompt-attribution.service');
const promptRulesForTurn = h((req) => pa().rulesInForce({ ...req.body, ...req.query }));
const promptTurnsUnderRule = h((req) => pa().turnsUnderRule(req.params.nodeId, { entryId: req.query.entryId }));
// PE-004: how much of the dialogue the prompt governs, measured — plus the fixed
// strings the template speaks with, which no rule controls.
const promptAuthorship = h(async (req) => ({
  ...(await pa().dialogueAuthorship({ days: req.query.days })),
  controlAcks: pa().controlAcks(),
}));
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

// ── ACT permissions (Phase 9 management) ──────────────────────────────────────
const actPerm = require('../services/act-permissions.service');
const actUsersList = h(() => actPerm.effective());
const actUsersAdd = h((req) => actPerm.add({
  key: req.body?.key, label: req.body?.label,
  addedBy: req.flowdeskUser?.email || req.flowdeskUser?.userId || 'admin',
}));
const actUsersSetEnabled = h((req) => actPerm.setEnabled(req.params.key, req.body?.enabled));
const actUsersRemove = h((req) => actPerm.remove(req.params.key));
const actUsersCheck = h((req) => ({
  authorized: require('../services/act-authorization').isActAuthorized({ userId: req.query.userId, email: req.query.email }),
}));
const actPermSetDefault = h((req) => actPerm.setDefault(
  req.params.permission, req.body?.enabledForAll,
  req.flowdeskUser?.email || req.flowdeskUser?.userId || 'admin',
));

module.exports = {
  listSessions, sessionStats, getSession, getTurns, getLlmCall,
  listNegative, qualityMeta, triageSession, createBacklog,
  listCatalog, catalogProviders, runCatalogSync, listCatalogSyncRuns, resolveIntent,
  listSchemas, getSchemaDetail, invalidateSchema, rematerializeSchema,
  schemaEnrichGenerate, schemaEnrichApply, schemaEnrich, schemaEnrichStored, schemaExport,
  syncStatus, listSyncEvents, syncPollNow,
  analyzeSession, listOverlays, applyOverlay, setOverlayActive,
  promptMeta, promptDefaultGraph, promptListGraphs, promptGetGraph, promptSaveGraph, promptMutateGraph, promptPromoteVersion,
  promptGetVersions, promptCompile, promptValidate, promptPreview, promptCoverage, promptSandbox, promptApply,
  promptActiveEntry, promptSetActiveEntry, interpreterStatus,
  promptRulesForTurn, promptTurnsUnderRule, promptAuthorship,
  promptActive, promptApplied, promptClear, promptAssistantChat,
  listTickets, getTicketLive, llmStats, adminHealth,
  actUsersList, actUsersAdd, actUsersSetEnabled, actUsersRemove, actUsersCheck, actPermSetDefault,
};
