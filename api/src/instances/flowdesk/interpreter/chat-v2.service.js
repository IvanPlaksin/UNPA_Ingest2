'use strict';

/**
 * FlowDesk Chat V2 wiring (step 13) — connects the interpreter engine to the
 * real C0–C3 services and maps a turn to the existing /flowdesk/chat response
 * shape (backward-compatible with the UI contract).
 *
 * Activated by the FLOWDESK_CHAT_V2 feature flag in the chat controller; when
 * off, the legacy runtime-chat path is used (instant rollback, zero deploy).
 *
 * @module instances/flowdesk/interpreter/chat-v2.service
 */

let _engine = null;

function getEngine() {
  if (_engine) return _engine;
  const { getLLMProvider } = require('../../../services/ai/llm-provider');
  const { getResolveSearch } = require('../services/resolve-search.service');
  const { getDraftSRService } = require('../services/draft-sr.service');
  const { compile } = require('../schema-graph/schema-compiler');
  const { createEngine } = require('./interpreter-engine');
  const progressBus = require('./progress-bus');
  const telemetry = require('../services/chat-telemetry.service');

  // How the engine turns a serviceId into a SchemaSnapshot (IP-1d). Default 'graph'
  // = compile the seeded schema-graph (golden fixtures, platform flows) — the
  // pre-IP-1d behaviour, unchanged. 'altiora' = materialize on demand from the
  // Altiora catalog (detect → getSchema → materialize → cache), falling back to
  // the graph loader for any service without a catalog GUID. Opt-in, mirroring
  // FLOWDESK_DIRECTORY_PROVIDER, so turning it on cannot break existing flows.
  const schemaProvider = process.env.FLOWDESK_SCHEMA_PROVIDER || 'graph';
  const loadSnapshot = schemaProvider === 'altiora'
    ? require('../services/schema-orchestrator').createDefaultAltioraLoader().loadSnapshot
    : compile;

  // FlowDesk picks its LLM backend independently of the platform-wide
  // LLM_PROVIDER (which drives a different subsystem). Default: claude-code
  // (local CLI, no API key). Override with FLOWDESK_LLM_PROVIDER / FLOWDESK_LLM_MODEL.
  const model = process.env.FLOWDESK_LLM_MODEL || 'claude-sonnet-4-6';
  const llm = getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || 'claude-code',
    // Explicit default so the platform-wide LLM_MODEL (used by another subsystem,
    // e.g. an Ollama model) never leaks into the Claude Code CLI invocation.
    model,
  });

  _engine = createEngine({
    // C0 (FLOWDESK_LLM_PROVIDER / _MODEL), telemetry-wrapped: every LLM call's
    // latency/cost is captured for the admin section (ADMIN P0). Transparent —
    // the wrapper delegates and re-throws untouched.
    llm: telemetry.wrapLLMProvider(llm, { model }),
    resolveSearch: getResolveSearch(),     // C3 (SERVICE/ARTICLE/SR_STATUS)
    draftService: getDraftSRService(),     // C2 (Redis + Memgraph)
    loadSnapshot,                          // C1: graph (compile) or Altiora orchestrator (IP-1d)
    emitProgress: (sessionId, ev) => {
      progressBus.emit(sessionId, ev);     // F3 SSE bus
      telemetry.captureProgress(ev);       // ADMIN P0: node trace w/ durations
    },
    // ADMIN P5: operator prompt overlays (global + per-service), applied from the
    // Chat Admin session-analysis agent. Cached 30s inside the service; failures
    // degrade to no guidance.
    getPromptGuidance: (serviceId) => require('../services/prompt-overlay.service').getGuidance(serviceId),
    // ADMIN P6: the graph-generated system prompt (active version), scoped per
    // chat LLM node. Cached 30s; failures degrade to base prompts.
    getSystemPrompt: (node) => require('../services/system-prompt.service').guidanceForNode(node),
  });
  return _engine;
}

/**
 * Process one chat turn and shape it like the legacy /flowdesk/chat response.
 */
async function processMessage(sessionId, userId, message, userContext, choice, lang, controlAction) {
  const engine = getEngine();
  const telemetry = require('../services/chat-telemetry.service');
  const t0 = Date.now();
  // ADMIN P0: run the turn inside a capture scope so the wrapped LLM provider and
  // the progress bus land their measurements on this turn's record.
  const { result: r, capture } = await telemetry.withTurnCapture(() =>
    engine.runTurn({ sessionId, userId, message, userContext, choice, controlAction, lang: lang || 'en' }));

  // Fire-and-forget persistence — a telemetry failure never delays the reply.
  telemetry.recordTurn({
    sessionId, userId, userContext,
    message: message || (choice ? `[choice:${choice.action}:${choice.slotId}]` : controlAction ? `[control:${controlAction.action}:${controlAction.slotId}]` : null),
    result: r, durationMs: Date.now() - t0, capture, channel: 'text', lang: lang || 'en',
  });

  return {
    response: r.response,
    preamble: r.preamble || null,
    choices: Array.isArray(r.choices) ? r.choices : null,
    responseType: r.responseType || 'text',
    resolveChoices: r.resolveChoices || null,
    // controls[] (I-3) — the typed turn-contract, dual-emitted with resolveChoices/choices.
    controls: Array.isArray(r.controls) ? r.controls : null,
    // Chat-agent read intents: structured payloads for rich FE rendering (optional).
    ...(Array.isArray(r.tickets) ? { tickets: r.tickets, totalCount: r.totalCount ?? r.tickets.length } : {}),
    ...(r.filters ? { filters: r.filters } : {}),
    ...(Array.isArray(r.breadcrumb) ? { breadcrumb: r.breadcrumb } : {}),
    askingSlot: r.askingSlot || null,
    state: {
      serviceId: r.draft?.serviceId || null,
      status: r.draft?.status || null,
      route: r.route,
      srNumber: r.srNumber || null,
    },
    currentNode: r.route,
    executionLog: (r.trace || []).map((node) => ({ node, status: 'success' })),
    spawnResult: r.srNumber ? { requestId: r.srNumber } : null,
    isComplete: !!r.isComplete,
    engineStatus: r.waiting ? 'WAITING_FOR_INPUT' : (r.isComplete ? 'COMPLETED' : 'RUNNING'),
    version: 'v2',
  };
}

/** Test seam. */
function _reset() { _engine = null; }

module.exports = { processMessage, getEngine, _reset };
