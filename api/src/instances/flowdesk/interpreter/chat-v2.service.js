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

// TURN-001 — the one list of fields a turn carries to the client. Required at the
// top, not lazily: it is a plain data contract with no dependencies of its own, and
// the point of it is that no layer can quietly go without it.
const { pickTurnPayload } = require('./turn-contract');

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

/**
 * HYB-1 — the hybrid interpreter, as a THIRD mode.
 *
 * `FLOWDESK_INTERPRETER=hybrid` (or FLOWDESK_HYBRID_INTERPRETER=1) answers a click
 * in the middle of a form from a template and hands every other turn to the agent.
 * Off, neither of the two existing paths changes by a line: the flag is read here
 * and nowhere else, and the hybrid session is only constructed when it is on.
 *
 * Modes are mutually exclusive and hybrid wins, because it CONTAINS the agent —
 * turning it on without turning the agent off is what an operator will do, and the
 * sensible reading of that is "hybrid".
 */
/**
 * HYB-FIX-001 — hybrid is the DEFAULT when the agent is on, not an opt-in.
 *
 * It was opt-in, and the opt-in was never taken. `FLOWDESK_INTERPRETER` existed in
 * exactly three places in the repository: this reader, the comment above it, and the
 * tests that set it themselves. Not in `.env`, not in the deployment. So the hybrid
 * ran in tests, in the arena, and in the hand-configured processes where it was
 * measured — and never once for a user. Every turn of every real conversation went
 * through the model, including the clicks that a template answers in 850 ms.
 *
 * A flag nobody sets is a feature nobody has. The measured path is now the default
 * and the expensive one requires saying so: FLOWDESK_INTERPRETER=agent.
 */
function interpreterMode() {
  const explicit = String(process.env.FLOWDESK_INTERPRETER || '').toLowerCase();
  if (explicit === 'agent') return { mode: 'agent', source: 'FLOWDESK_INTERPRETER=agent' };
  if (explicit === 'hybrid') return { mode: 'hybrid', source: 'FLOWDESK_INTERPRETER=hybrid' };
  if (String(process.env.FLOWDESK_HYBRID_INTERPRETER || '') === '1') {
    return { mode: 'hybrid', source: 'FLOWDESK_HYBRID_INTERPRETER=1' };
  }
  if (!agentEnabled()) return { mode: 'fsm', source: 'FLOWDESK_AGENT_INTERPRETER is not 1' };
  return { mode: 'hybrid', source: 'default (FLOWDESK_INTERPRETER not set)' };
}

const hybridEnabled = () => interpreterMode().mode === 'hybrid';

/**
 * HYB-FIX-002 — say which interpreter is in force, at startup, in the log.
 *
 * The reason this is here and not in a comment: for weeks the only way to find out
 * was to read three files and evaluate two expressions by hand, which is what it took
 * to discover that the answer had been "the expensive one" the whole time. A
 * configuration that decides what every conversation costs should not be something
 * anyone has to derive.
 */
let _announced = false;
function announceInterpreter(log = console.log) {
  if (_announced) return;
  _announced = true;
  const { mode, source } = interpreterMode();
  log(`[flowdesk] Interpreter mode: ${mode.toUpperCase()}`);
  log(`[flowdesk]   source: ${source}`);
  if (mode === 'agent') {
    log('[flowdesk]   WARNING: hybrid disabled — EVERY turn calls the model, including '
      + 'form clicks a template answers without one.');
  }
  if (mode === 'hybrid') {
    log('[flowdesk]   form clicks are answered by the template; the model keeps the boundaries.');
  }
}

function getAgentSession(sessionId, userContext, lang) {
  let s = AGENT_SESSIONS.get(sessionId);
  if (!s) {
    if (AGENT_SESSIONS.size >= AGENT_SESSION_LIMIT) {
      // Oldest first — Map preserves insertion order.
      AGENT_SESSIONS.delete(AGENT_SESSIONS.keys().next().value);
    }
    // Whichever mode is on. Both factories take the same arguments and return the
    // same session shape, so nothing downstream in this file knows the difference.
    const create = hybridEnabled()
      ? require('../hybrid-interpreter/hybrid-session.service').createHybridSession
      : require('../agent-interpreter/agent-session.service').createAgentSession;
    s = create(
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
  // Announced on the first turn rather than on a timer at import. A process that
  // never serves a conversation has nothing to announce, and a timer fired after a
  // test suite finished is noise in someone else's output.
  announceInterpreter();
  if (agentEnabled() || hybridEnabled()) {
    return processMessageWithAgent(sessionId, userId, message, userContext, choice, lang, controlAction);
  }
  const engine = getEngine();
  const telemetry = require('../services/chat-telemetry.service');
  const t0 = Date.now();
  // ADMIN P0: run the turn inside a capture scope so the wrapped LLM provider and
  // the progress bus land their measurements on this turn's record.
  // The same per-turn "where is this request for" scope the agent path opens: the
  // provider — and so the form — is chosen by the beneficiary's duty station, and
  // the engine loads the form in a dozen branches (schema-context).
  const { runWithSchemaContext, schemaContextFrom } = require('../services/schema-context');
  const draft0 = await require('../services/draft-sr.service').getDraftSRService().get(sessionId).catch(() => null);
  const { result: r, capture } = await telemetry.withTurnCapture(() =>
    runWithSchemaContext(schemaContextFrom(draft0, null), () =>
      engine.runTurn({ sessionId, userId, message, userContext, choice, controlAction, anchor, formEvent, lang: lang || 'en' })));

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
  // A TEMPLATE turn has no agentMeta, because it never called a model — and that is
  // the point of it. Reading the meta unconditionally is what broke the first live
  // hybrid turn that a template actually answered ("Cannot read properties of
  // undefined (reading 'costUsd')"): the reply was built correctly and then lost in
  // the telemetry that describes it. So the record is shaped from what the turn
  // really did: no model call to price, one deterministic node.
  const meta = turn.agentMeta || null;
  telemetry.recordTurn({
    sessionId, userId, userContext, message: userText,
    result: turn, durationMs: Date.now() - t0,
    capture: {
      llmCalls: meta
        ? [{ method: 'agentLoop', model: null, latencyMs: r.ms, costUsd: meta.costUsd, tokens: meta.tokens, error: null }]
        : [],
      nodeEvents: meta
        // P-4: the failure text rides through to the turn record. Without it a replay
        // says "draft_create: error" and the operator has nowhere else to look.
        ? meta.toolCalls.map((c) => ({
          node: c.name, status: c.ok ? 'success' : 'error', durationMs: c.ms, ts: Date.now(),
          ...(c.error ? { error: c.error } : {}),
        }))
        : [{ node: 'TEMPLATE_FILL', status: 'success', durationMs: r.ms || 0, ts: Date.now() }],
      // Whatever the layers recorded for themselves during the turn.
      spans: scoped.spans,
    },
    channel: 'text', lang: lang || 'en',
  });

  // As on the state-machine path: the hand-off ends this session.
  if (turn.openForm) await endSessionAfterHandoff(sessionId);

  return {
    // TURN-001 — response, controls, cards, openForm, carried by the contract
    // (interpreter/turn-contract) instead of by a hand-written list. The list this
    // replaces had no line for `cards`, and a field missing from it is dropped in
    // silence: the tool reports success, the client has nothing to draw, and the
    // model describes in prose what it was told is already on screen.
    ...pickTurnPayload(turn),
    preamble: null,
    choices: null,
    responseType: turn.responseType,
    resolveChoices: null,
    // The hand-off also ENDS the session — that part is this layer's own, not the
    // turn's, so it stays here beside the contract rather than inside it.
    ...(turn.openForm ? { sessionEnded: 'form_handoff' } : {}),
    askingSlot: turn.askingSlot,
    state: {
      serviceId: (turn.draft && turn.draft.serviceId) || null,
      status: (turn.draft && turn.draft.status) || null,
      route: 'AGENT',
      srNumber: turn.srNumber || null,
    },
    currentNode: 'AGENT',
    // The tool calls ARE the honest trace of what the agent did this turn.
    executionLog: meta
      ? meta.toolCalls.map((c) => ({ node: c.name, status: c.ok ? 'success' : 'error' }))
      : (turn.executionLog || [{ node: 'TEMPLATE_FILL', status: 'COMPLETED' }]),
    spawnResult: turn.srNumber ? { requestId: turn.srNumber } : null,
    isComplete: !!turn.isComplete,
    engineStatus: turn.isComplete ? 'COMPLETED' : 'WAITING_FOR_INPUT',
    version: 'v2',
    ...(turn.turnAuthor ? { turnAuthor: turn.turnAuthor, routerReason: turn.routerReason || null } : {}),
  };
}

/** Test seam. */
function _reset() { _engine = null; AGENT_SESSIONS.clear(); }

module.exports = {
  processMessage, processMessageWithAgent, getEngine, _reset,
  agentEnabled, hybridEnabled, interpreterMode, announceInterpreter,
  // Test seam: the announcement is once-per-process by design.
  _resetAnnounce: () => { _announced = false; },
};
