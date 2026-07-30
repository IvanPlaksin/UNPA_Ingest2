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
  // LLM_PROVIDER (which drives a different subsystem). Default: anthropic-api +
  // Claude Haiku 4.5 (the ratified chat provider — fast, low cost). Override with
  // FLOWDESK_LLM_PROVIDER / FLOWDESK_LLM_MODEL.
  const model = process.env.FLOWDESK_LLM_MODEL || 'claude-haiku-4-5-20251001';
  const llm = getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || 'anthropic-api',
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
    // Per-slot knowledge base: resolve which slot an oblique free-text edit refers
    // to (vector slot_kb → graph SlotDef). Best-effort; empty when nothing indexed.
    resolveSlot: (serviceId, text) => require('../services/schema-knowledge.service').resolveSlotFromText(serviceId, text),
    // Phase 8: graph-driven anchor explain — resolve the KB curated on a UI
    // anchor's EXPLAINS edges (namespace PROJECT:ALTIORA). Empty → semantic fallback.
    // Phase 9 (Layer 4 audit): persist chat-initiated ACTs to the ChatActionLog.
    // Best-effort; a wrapper around the service's recordAction.
    logAction: (entry) => require('../services/chat-action-log.service').recordAction(entry),
    getAnchorKB: async (anchorId) => {
      try {
        const { read } = require('../schema-graph/driver');
        const records = await read(
          `MATCH (:UIAnchor {anchorId: $anchorId})-[:EXPLAINS]->(k:KBArticle)
           RETURN k.articleId AS articleId, k.title AS title, k.snippet AS snippet, k.collection AS collection`,
          { anchorId },
        );
        return records.map((r) => ({
          articleId: r.get('articleId'), title: r.get('title'),
          snippet: r.get('snippet'), collection: r.get('collection'),
        }));
      } catch { return []; }
    },
  });
  return _engine;
}

/**
 * Process one chat turn and shape it like the legacy /flowdesk/chat response.
 */
/**
 * EXP-002 — the agent interpreter, live.
 *
 * Enabled by FLOWDESK_AGENT_INTERPRETER=1. Off, this file behaves exactly as it
 * did: the flag is checked once, and the state-machine path below is untouched.
 *
 * Sessions are held in memory because the agent's conversation history lives in
 * the session object, unlike the state machine whose whole state is the Redis
 * draft. That makes this registry a real constraint, not a detail: history is
 * lost on restart (the draft survives), and the map is bounded so a long-running
 * process cannot grow without limit.
 */
const AGENT_SESSIONS = new Map();
const AGENT_SESSION_LIMIT = 500;
const agentEnabled = () => String(process.env.FLOWDESK_AGENT_INTERPRETER || '') === '1';

function getAgentSession(sessionId, userContext, lang) {
  let s = AGENT_SESSIONS.get(sessionId);
  if (!s) {
    if (AGENT_SESSIONS.size >= AGENT_SESSION_LIMIT) {
      // Oldest first — Map preserves insertion order.
      AGENT_SESSIONS.delete(AGENT_SESSIONS.keys().next().value);
    }
    const { createAgentSession } = require('../agent-interpreter/agent-session.service');
    s = createAgentSession(
      {
        sessionId, lang, userContext,
        promptEntryId: process.env.FLOWDESK_AGENT_PROMPT_ENTRY || undefined,
        model: process.env.FLOWDESK_AGENT_MODEL || undefined,
      },
      // The REAL draft service — the live chat must be able to file a request.
      // Passing it also opts out of the arena's sandbox ticket counter.
      // (Required here, not at module scope: getEngine keeps its own import and
      // this function runs whether or not the engine was ever built.)
      { draftService: require('../services/draft-sr.service').getDraftSRService() },
    );
    AGENT_SESSIONS.set(sessionId, s);
  }
  return s;
}

/**
 * The hand-off is the END of the conversation, not a pause in it.
 *
 * Once the form is open the wizard owns the request: the chat cannot change a
 * value, cannot submit it, and must not offer to resume it later. Leaving the
 * session alive left a finished thread that still held the draft, the history and
 * the tool state — so the next thing the user said was answered as if the request
 * were still being filled here.
 *
 * So the session is closed on the way out and the client is told to open a new
 * one (`sessionEnded`). The DRAFT is discarded with it, deliberately: it has been
 * copied into the form, and a draft left behind is a request the resume offer
 * would put back in front of the user after they had already filed it.
 *
 * Best-effort, always. A hand-off that happened must be reported to the user even
 * if the tidying up fails.
 */
async function endSessionAfterHandoff(sessionId) {
  AGENT_SESSIONS.delete(sessionId);
  try {
    await require('../services/draft-sr.service').getDraftSRService().discard(sessionId);
  } catch { /* the hand-off already happened; the draft is no longer the record */ }
}

async function processMessage(sessionId, userId, message, userContext, choice, lang, controlAction, anchor, formEvent) {
  if (agentEnabled()) {
    return processMessageWithAgent(sessionId, userId, message, userContext, choice, lang, controlAction);
  }
  const engine = getEngine();
  const telemetry = require('../services/chat-telemetry.service');
  const t0 = Date.now();
  // ADMIN P0: run the turn inside a capture scope so the wrapped LLM provider and
  // the progress bus land their measurements on this turn's record.
  const { result: r, capture } = await telemetry.withTurnCapture(() =>
    engine.runTurn({ sessionId, userId, message, userContext, choice, controlAction, anchor, formEvent, lang: lang || 'en' }));

  // Fire-and-forget persistence — a telemetry failure never delays the reply.
  telemetry.recordTurn({
    sessionId, userId, userContext,
    message: message || (anchor ? `[anchor:${anchor.id}]` : choice ? `[choice:${choice.action}:${choice.slotId}]` : controlAction ? `[control:${controlAction.action}:${controlAction.slotId}]` : null),
    result: r, durationMs: Date.now() - t0, capture, channel: 'text', lang: lang || 'en',
  });

  // The reply is already composed above; closing the session cannot change it.
  if (r.openForm) await endSessionAfterHandoff(sessionId);

  return {
    response: r.response,
    preamble: r.preamble || null,
    choices: Array.isArray(r.choices) ? r.choices : null,
    responseType: r.responseType || 'text',
    resolveChoices: r.resolveChoices || null,
    // controls[] (I-3) — the typed turn-contract, dual-emitted with resolveChoices/choices.
    controls: Array.isArray(r.controls) ? r.controls : null,
    // review (confirm-form) — structured, grouped summary of the collected values
    // {title, groups:[{section,label,rows:[{slotId,label,display,value,editable}]}]}.
    // The client renders it as a grouped table with a per-editable-row ✎ button.
    ...(r.review ? { review: r.review } : {}),
    // sources[] (Phase 1 "Show sources") — KB origins of the answer. Present for
    // KB-derived routes (INFO_QUESTION today); omitted otherwise so unrelated
    // turns stay unchanged. The FE renders a bottom-right icon + modal from this.
    ...(Array.isArray(r.sources) ? { sources: r.sources } : {}),
    // navigate (Phase 5 SITE_NAVIGATE) — {path, highlight?} destination for the
    // host router. Present only when the chat resolved a whitelisted target.
    ...(r.navigate ? { navigate: r.navigate } : {}),
    // Hand-off to Altiora's request form: the host opens the wizard with this
    // prefill — and that ends this session (see endSessionAfterHandoff).
    ...(r.openForm ? { openForm: r.openForm, sessionEnded: 'form_handoff' } : {}),
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

/**
 * EXP-002 agent path. Returns the SAME response shape the state machine returns,
 * so the frontend contract is unchanged — the client cannot tell which
 * interpreter answered except by reading the text.
 */
async function processMessageWithAgent(sessionId, userId, message, userContext, choice, lang, controlAction) {
  const telemetry = require('../services/chat-telemetry.service');
  const t0 = Date.now();
  const session = getAgentSession(sessionId, userContext, lang || 'en');

  const userText = message
    || (choice ? `[choice:${choice.action}:${choice.slotId}]` : null)
    || (controlAction ? `[control:${controlAction.action || 'set'}:${controlAction.slotId}]` : null);

  // Run the turn inside the capture scope so every layer that times itself —
  // the Altiora round trips, the catalogue searches, each model call — lands on
  // this turn. Without the scope those measurements are silently discarded, which
  // is why the Timeline panel could only ever show tool calls.
  const { result: r, capture: scoped } = await telemetry.withTurnCapture(
    () => session.sendTurn(message, { lang: lang || 'en', controlAction, choice }),
  );

  if (!r.ok) {
    // Never leave the caller without a turn — same contract as the engine path.
    const S = require('./templates/ui-strings').ui(lang || 'en');
    return {
      response: S.internalError, preamble: null, choices: null, responseType: 'text',
      resolveChoices: null, controls: null, askingSlot: null,
      state: { serviceId: null, status: null, route: 'AGENT', srNumber: null },
      currentNode: 'AGENT', executionLog: [{ node: 'AGENT', status: 'error' }],
      spawnResult: null, isComplete: false, engineStatus: 'WAITING_FOR_INPUT', version: 'v2',
      error: r.error,
    };
  }

  const turn = r.turn;
  // Same telemetry as the state-machine path, so provenance (PREREQ-001) and the
  // Phase 6 metrics cover agent turns too. Fire-and-forget, as there.
  telemetry.recordTurn({
    sessionId, userId, userContext, message: userText,
    result: turn, durationMs: Date.now() - t0,
    capture: {
      llmCalls: [{
        method: 'agentLoop', model: null,
        latencyMs: r.ms, costUsd: turn.agentMeta.costUsd, tokens: turn.agentMeta.tokens, error: null,
      }],
      nodeEvents: turn.agentMeta.toolCalls.map((c) => ({ node: c.name, status: c.ok ? 'success' : 'error', durationMs: c.ms, ts: Date.now() })),
      // Whatever the layers recorded for themselves during the turn.
      spans: scoped.spans,
    },
    channel: 'text', lang: lang || 'en',
  });

  // As on the state-machine path: the hand-off ends this session.
  if (turn.openForm) await endSessionAfterHandoff(sessionId);

  return {
    response: turn.response,
    preamble: null,
    choices: null,
    responseType: turn.responseType,
    resolveChoices: null,
    controls: turn.controls,
    // The form hand-off rides the turn here exactly as it does on the state
    // machine's path, so the client opens the same pre-filled Altiora form — and
    // ends this session with it.
    ...(turn.openForm ? { openForm: turn.openForm, sessionEnded: 'form_handoff' } : {}),
    askingSlot: turn.askingSlot,
    state: {
      serviceId: (turn.draft && turn.draft.serviceId) || null,
      status: (turn.draft && turn.draft.status) || null,
      route: 'AGENT',
      srNumber: turn.srNumber || null,
    },
    currentNode: 'AGENT',
    // The tool calls ARE the honest trace of what the agent did this turn.
    executionLog: turn.agentMeta.toolCalls.map((c) => ({ node: c.name, status: c.ok ? 'success' : 'error' })),
    spawnResult: turn.srNumber ? { requestId: turn.srNumber } : null,
    isComplete: !!turn.isComplete,
    engineStatus: turn.isComplete ? 'COMPLETED' : 'WAITING_FOR_INPUT',
    version: 'v2',
  };
}

/** Test seam. */
function _reset() { _engine = null; AGENT_SESSIONS.clear(); }

module.exports = { processMessage, processMessageWithAgent, getEngine, _reset, agentEnabled };
