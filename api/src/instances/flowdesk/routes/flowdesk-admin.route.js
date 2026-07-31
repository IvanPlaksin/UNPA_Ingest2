'use strict';

/**
 * FlowDesk Chat Admin routes (ADMIN P1–P4) — mounted at /api/v1/flowdesk/admin
 * (BEFORE the generic /api/v1/flowdesk router in index.js, mirroring the
 * flowdesk-config mount pattern). Auth: flowdesk-user (proxy identity) +
 * flowdesk-admin (ratified env allowlist).
 */

const express = require('express');
const router = express.Router();
const c = require('../controller/flowdesk-admin.controller');
const { flowdeskUserMiddleware } = require('../../../middleware/flowdesk-user.middleware');
const { flowdeskAdminMiddleware } = require('../../../middleware/flowdesk-admin.middleware');

router.use(flowdeskUserMiddleware);
router.use(flowdeskAdminMiddleware);

// Sessions (P1)
router.get('/sessions', c.listSessions);
router.get('/sessions/stats', c.sessionStats);
router.get('/sessions/:sessionId', c.getSession);
router.get('/sessions/:sessionId/turns', c.getTurns);
// One model call, by the key its span carries. Query param, not a path segment:
// the key contains colons.
router.get('/llm-call', c.getLlmCall);

// Session-analysis AI agent + prompt overlays (P5)
router.post('/sessions/:sessionId/analyze', c.analyzeSession);
router.get('/prompt-overlays', c.listOverlays);
router.post('/prompt-overlays', c.applyOverlay);
router.patch('/prompt-overlays/:overlayId', c.setOverlayActive);

// Quality (P2)
router.get('/quality/meta', c.qualityMeta);
router.get('/quality/negative', c.listNegative);
router.patch('/quality/:sessionId', c.triageSession);
router.post('/quality/:sessionId/backlog', c.createBacklog);

// Catalog (P3)
router.get('/catalog', c.listCatalog);
router.get('/catalog/sync-runs', c.listCatalogSyncRuns);
router.post('/catalog/sync', c.runCatalogSync);
router.get('/catalog/:code/providers', c.catalogProviders);
router.post('/catalog/:code/materialize', c.rematerializeSchema); // first-time materialization by code
router.get('/intent/resolve', c.resolveIntent);

// Schemas (P3)
router.get('/schemas', c.listSchemas);
router.post('/schemas/export', c.schemaExport);                         // ZIP (xlsx + json) of selected ousIds (before :ousId)
router.get('/schemas/enrichment', c.schemaEnrichStored);                // stored by ?serviceId= (before :ousId)
router.get('/schemas/:ousId', c.getSchemaDetail);
router.post('/schemas/:ousId/invalidate', c.invalidateSchema);
router.post('/schemas/:ousId/rematerialize', c.rematerializeSchema);
// P7 — AI schema enrichment (service description + field meanings)
router.post('/schemas/:ousId/enrich/generate', c.schemaEnrichGenerate); // preview (no persist)
router.post('/schemas/:ousId/enrich/apply', c.schemaEnrichApply);       // persist a (edited) payload
router.post('/schemas/:ousId/enrich', c.schemaEnrich);                  // generate + apply in one

// Sync (P3)
router.get('/sync/status', c.syncStatus);
router.get('/sync/events', c.listSyncEvents);
router.post('/sync/poll', c.syncPollNow);

// Prompt-graph editor (P6): system-prompt-from-rules-graph
router.get('/prompt/meta', c.promptMeta);
// HYB-FIX-003 — the interpreter in force, with the template/model split as evidence.
router.get('/interpreter-status', c.interpreterStatus);
router.get('/prompt/default-graph', c.promptDefaultGraph);
router.get('/prompt/graphs', c.promptListGraphs);
// ПР-003 — the graph that IS the system prompt: read the choice, and make one.
router.get('/prompt/active-entry', c.promptActiveEntry);
router.post('/prompt/active-entry', c.promptSetActiveEntry);
router.get('/prompt/graphs/:entryId', c.promptGetGraph);
router.post('/prompt/graphs', c.promptSaveGraph);
router.post('/prompt/graphs/mutate', c.promptMutateGraph); // AI direct-edit: apply mutations (+ optional save version)
router.get('/prompt/graphs/:entryId/versions', c.promptGetVersions);
// For the AGENT graph this is what "make it live" means: it compiles whatever
// version is current, so there is nothing to materialise (see prompt-editor.service).
router.post('/prompt/graphs/:entryId/promote', c.promptPromoteVersion);
router.post('/prompt/compile', c.promptCompile);
router.post('/prompt/validate', c.promptValidate);
// EC-011/EC-013 — the prompt per context, and what a whole graph looks like across all nine.
router.post('/prompt/preview', c.promptPreview);
router.post('/prompt/coverage', c.promptCoverage);
// PE-006: a turn's recorded provenance → the rules that were in force on it.
// PE-007: a rule → how many recorded turns had it in force (never "affected").
router.post('/prompt/rules-for-turn', c.promptRulesForTurn);
router.get('/prompt/rules/:nodeId/turns', c.promptTurnsUnderRule);
// PE-004: measured share of turns the prompt governs + the template's fixed strings.
router.get('/prompt/authorship', c.promptAuthorship);
router.post('/prompt/sandbox', c.promptSandbox);
router.post('/prompt/apply', c.promptApply);
router.get('/prompt/active', c.promptActive);
router.get('/prompt/applied', c.promptApplied);
router.post('/prompt/clear', c.promptClear);
router.post('/prompt/assistant/chat', c.promptAssistantChat); // SSE (Claude Code + MCP)

// Tickets + LLM + composite health (P4)
router.get('/tickets', c.listTickets);
router.get('/tickets/:ticketId/live', c.getTicketLive);
router.get('/llm/stats', c.llmStats);
router.get('/health', c.adminHealth);

// ACT permissions (Phase 9 management) — who may invoke side-effecting chat
// actions (submit a real Altiora ticket). env allowlist ∪ managed grants.
router.get('/act-users', c.actUsersList);
router.get('/act-users/check', c.actUsersCheck); // before /:key
router.patch('/act-users/permissions/:permission', c.actPermSetDefault); // global default (enable-for-all)
router.post('/act-users', c.actUsersAdd);
router.patch('/act-users/:key', c.actUsersSetEnabled);
router.delete('/act-users/:key', c.actUsersRemove);

module.exports = router;
