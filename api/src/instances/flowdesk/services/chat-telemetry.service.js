'use strict';

/**
 * Chat telemetry (ADMIN P0) — the persistence layer the FlowDesk Chat Admin
 * section reads. Until now the raw conversation was never stored anywhere:
 * DraftSR carries only slot state (Redis, 24h TTL) and the only durable records
 * were the terminal (:ServiceRequest)/(:Escalation) nodes. This module records
 * every turn durably so sessions can be listed, replayed and analyzed.
 *
 * Storage (mirrors the platform's dual precedent):
 *   - Memgraph:  (:ChatSession {sessionId})-[:HAS_TURN]->(:ChatTurn) — queryable
 *   - JSONL:     logs/chat/chat-turns-{date}.jsonl — firehose backup
 *                (same pattern as ai-usage-monitor's logs/ai/*.jsonl)
 *
 * Capture points (wired in chat-v2.service, engine untouched except ticketId):
 *   - withTurnCapture(fn)   — AsyncLocalStorage scope for one turn
 *   - wrapLLMProvider(llm)  — measures latency/cost of every LLM call in-scope
 *   - captureProgress(ev)   — copies progress-bus node events into the scope
 *   - recordTurn(...)       — fire-and-forget persistence after the turn
 *   - stampOutcome(...)     — terminal outcome (also used by REST submit/escalate)
 *
 * Every ChatTurn also carries the provenance of what shaped it: the prompt-graph
 * version (promptGraphEntryId / promptGraphVersion / promptTextHash,
 * SUADA-PREREQ-001) and the operator overlays layered on top (overlayHash /
 * overlayIds, SUADA-PREREQ-001.1). Both levers move behavior independently, so
 * attribution needs both — without them a turn cannot be tied to what caused it
 * once either changes.
 *
 * Every write here is BEST-EFFORT: a telemetry failure must never break a turn
 * (console.warn and move on). Ratified decisions (2026-07-16): retention 90d
 * (FLOWDESK_CHAT_LOG_RETENTION_DAYS), prompt/response bodies NOT stored unless
 * FLOWDESK_CHAT_LOG_PROMPTS=true, never log the user bearer token.
 *
 * @module instances/flowdesk/services/chat-telemetry.service
 */

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const TEXT_CAP = 4000;          // per-field char cap in stored turns
const PROMPT_CAP = 8000;        // per-field cap when prompt logging is enabled

const enabled = () => String(process.env.FLOWDESK_CHAT_TELEMETRY || 'true') !== 'false';
const logPrompts = () => String(process.env.FLOWDESK_CHAT_LOG_PROMPTS || 'false') === 'true';

const turnStore = new AsyncLocalStorage();

// ── deps (injectable for tests) ───────────────────────────────────────────────

let _write = null;
function graphWrite(cypher, params) {
  if (!_write) _write = require('../schema-graph/driver').write;
  return _write(cypher, params);
}

/**
 * SUADA-PREREQ-001 — which prompt governed this turn. Resolved here rather than
 * threaded from the caller so EVERY write path (text chat, voice, any future
 * caller of recordTurn) carries provenance without plumbing. The source is the
 * same 30s-cached read the engine already performs per turn, so this costs no
 * extra query. Best-effort like everything else in this module.
 */
let _getPromptProvenance = null;
async function promptProvenance() {
  try {
    const fn = _getPromptProvenance
      || require('./system-prompt.service').getProvenance;
    const p = await fn();
    return {
      promptGraphEntryId: (p && p.promptGraphEntryId) || null,
      promptGraphVersion: (p && p.promptGraphVersion != null) ? Number(p.promptGraphVersion) : null,
      promptTextHash: (p && p.promptTextHash) || null,
    };
  } catch {
    return { promptGraphEntryId: null, promptGraphVersion: null, promptTextHash: null };
  }
}

/**
 * SUADA-PREREQ-001.1 — the P5 overlays in force for this turn. A second,
 * independent lever on behavior: an operator can change the chat by applying an
 * overlay without touching the prompt-graph, so promptTextHash alone would
 * attribute two different behaviors to one prompt. Same 30s cache as the engine.
 */
let _getOverlayProvenance = null;
async function overlayProvenance(serviceId) {
  try {
    const fn = _getOverlayProvenance
      || require('./prompt-overlay.service').getProvenance;
    const p = await fn(serviceId);
    return {
      overlayHash: (p && p.overlayHash) || null,
      overlayIds: (p && Array.isArray(p.overlayIds)) ? p.overlayIds : [],
    };
  } catch {
    return { overlayHash: null, overlayIds: [] };
  }
}

let _logDirReady = false;
function jsonlAppend(record) {
  try {
    const dir = path.join(process.cwd(), 'logs', 'chat');
    if (!_logDirReady) { fs.mkdirSync(dir, { recursive: true }); _logDirReady = true; }
    const day = new Date().toISOString().slice(0, 10);
    fs.appendFile(path.join(dir, `chat-turns-${day}.jsonl`), `${JSON.stringify(record)}\n`, () => {});
  } catch { /* firehose is best-effort */ }
}

const cap = (s, n = TEXT_CAP) => (s == null ? null : String(s).slice(0, n));

// ── turn capture scope ────────────────────────────────────────────────────────

/**
 * Run one turn inside a capture scope. Everything the wrapped LLM provider and
 * captureProgress record lands on the returned `capture` object.
 * @returns {Promise<{result:any, capture:{llmCalls:Array, nodeEvents:Array}}>}
 */
async function withTurnCapture(fn) {
  const capture = { llmCalls: [], nodeEvents: [], spans: [], depth: 0 };
  const result = await turnStore.run(capture, fn);
  return { result, capture };
}

/**
 * Record one timed operation against the turn in flight.
 *
 * `nodeEvents` only ever saw what the interpreter itself announced, and
 * `llmCalls` only the model. Everything in between — the HTTP round trip to
 * Altiora, the vector search, the work the code does outside the tool loop — was
 * invisible, so a slow turn could only be attributed to "the turn". A span is the
 * unit that makes the answer possible: what layer, what operation, how long.
 *
 * Cheap and silent: outside a turn there is no store and nothing is recorded.
 *
 * @param {{kind:string, name:string, durationMs:number, status?:string, detail?:string}} span
 */
function recordSpan(span) {
  const c = turnStore.getStore();
  if (!c || !span || !span.name) return;
  c.spans.push({
    kind: span.kind || 'other',
    name: cap(span.name, 120),
    durationMs: Number(span.durationMs) || 0,
    status: span.status || 'success',
    // Timed INSIDE another timed operation — the vector search inside the
    // catalogue call, say. Kept, because knowing which part of a slow call was
    // slow is the point, but flagged: adding it to the total would count the same
    // milliseconds twice.
    ...(span.nested ? { nested: true } : {}),
    // Cache accounting travels as numbers, not prose: the panel adds them up.
    ...(span.callKey ? { callKey: String(span.callKey) } : {}),
    ...(span.cacheReadTokens ? { cacheReadTokens: Number(span.cacheReadTokens) } : {}),
    ...(span.cacheCreationTokens ? { cacheCreationTokens: Number(span.cacheCreationTokens) } : {}),
    ...(span.detail ? { detail: cap(span.detail, 200) } : {}),
    ts: Date.now(),
  });
}

/**
 * Time an async operation into the current turn. Never changes what the operation
 * returns or throws — a measurement that alters the thing it measures is worse
 * than no measurement.
 */
async function timed(kind, name, fn) {
  const c = turnStore.getStore();
  const nested = !!(c && c.depth > 0);
  if (c) c.depth += 1;
  const t0 = Date.now();
  try {
    const out = await fn();
    recordSpan({ kind, name, durationMs: Date.now() - t0, status: 'success', nested });
    return out;
  } catch (err) {
    recordSpan({ kind, name, durationMs: Date.now() - t0, status: 'error', detail: err && err.message, nested });
    throw err;
  } finally {
    if (c) c.depth -= 1;
  }
}

/** Progress-bus events (node:start/done with durations) → current capture scope. */
function captureProgress(ev) {
  const c = turnStore.getStore();
  if (c && ev && ev.type === 'node:done') {
    c.nodeEvents.push({ node: ev.node, status: ev.status, durationMs: ev.duration ?? null, ts: ev.ts });
  }
}

/**
 * Wrap the C0 LLMProvider so every structuredOutput/completion call in a turn
 * is measured (latency, cost, tokens) and — best-effort — reported to the
 * platform AIUsageMonitor under subsystem 'flowdesk-chat'. The provider's
 * behavior is unchanged; failures are re-thrown untouched.
 */
function wrapLLMProvider(llm, { model } = {}) {
  if (!llm || llm.__telemetryWrapped) return llm;

  function report(method, t0, out, err) {
    // Prefer the model the provider actually used; fall back to wrapper/env.
    const callModel = (out && out.model) || model || process.env.FLOWDESK_LLM_MODEL || null;
    // Cost: the claude-code provider returns `cost` (tokens:0); the anthropic-api
    // provider now returns a priced `cost` too. If a provider still reports tokens
    // without a cost, price them here so nothing is silently $0.00 (see
    // services/ai/llm-pricing).
    let costUsd = (out && typeof out.cost === 'number') ? out.cost : 0;
    const tokens = (out && out.tokens) || 0;
    if (!costUsd && tokens) {
      try {
        const pricing = require('../../../services/ai/llm-pricing');
        costUsd = (out && typeof out.inputTokens === 'number' && typeof out.outputTokens === 'number')
          ? pricing.costFor(callModel, out.inputTokens, out.outputTokens)
          : pricing.costForCombined(callModel, tokens);
      } catch { /* pricing optional — leave 0 */ }
    }
    const call = {
      method,
      model: callModel,
      latencyMs: Date.now() - t0,
      costUsd,
      tokens,
      error: err ? (err.code || err.name || 'ERROR') : null,
    };
    const c = turnStore.getStore();
    if (c) c.llmCalls.push(call);
    // Platform-wide AI usage telemetry (JSONL + stats) — best-effort.
    try {
      const { getAIUsageMonitor } = require('../../../services/ai/ai-usage-monitor.service');
      const mon = getAIUsageMonitor();
      if (err) {
        mon.logRequestError?.({ service: 'flowdesk-chat', model: call.model, error: String(err.message || err) });
      } else {
        mon.logRequestComplete?.({
          service: 'flowdesk-chat', model: call.model, method,
          durationMs: call.latencyMs, cost: call.costUsd, tokens: call.tokens,
        });
      }
    } catch { /* monitor is optional */ }
    return call;
  }

  const wrapped = Object.create(llm);
  for (const method of ['structuredOutput', 'completion']) {
    if (typeof llm[method] !== 'function') continue;
    wrapped[method] = async (...args) => {
      const t0 = Date.now();
      try {
        const out = await llm[method](...args);
        const call = report(method, t0, out, null);
        if (logPrompts()) {
          call.prompt = cap(typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]), PROMPT_CAP);
          call.response = cap(out && (out.text || (out.data && JSON.stringify(out.data))), PROMPT_CAP);
        }
        return out;
      } catch (err) {
        report(method, t0, null, err);
        throw err;
      }
    };
  }
  Object.defineProperty(wrapped, '__telemetryWrapped', { value: true });
  return wrapped;
}

// ── persistence ───────────────────────────────────────────────────────────────

/** Derive the terminal outcome (if any) this turn produced. */
function outcomeOf(result) {
  if (!result) return null;
  if (result.srNumber) return 'completed';
  if (result.escalationId) return 'escalated';
  if (result.parked) return 'parked';
  // A failed SUBMIT surfaces as an error turn whose trace reached SUBMIT.
  if (result.error && Array.isArray(result.trace) && result.trace.includes('SUBMIT')) return 'submit_failed';
  return null;
}

let _seq = 0;
const makeTurnId = (sessionId) => `${sessionId}:${Date.now()}:${(_seq = (_seq + 1) % 1000)}`;

/**
 * Persist one completed turn (fire-and-forget — call without await).
 * @param {object} p
 * @param {string} p.sessionId
 * @param {string} [p.userId]
 * @param {object} [p.userContext]  proxy-injected identity (displayName/org)
 * @param {string} [p.message]      the user's utterance (or a choice/control descriptor)
 * @param {object} p.result         engine runTurn result
 * @param {number} [p.durationMs]   whole-turn wall clock
 * @param {object} [p.capture]      {llmCalls, nodeEvents} from withTurnCapture
 * @param {string} [p.channel]      'text' | 'voice'
 * @param {string} [p.lang]
 */
async function recordTurn(p) {
  if (!enabled()) return;
  const { sessionId, userId, userContext, message, result = {}, durationMs, capture, channel = 'text', lang } = p;
  if (!sessionId) return;

  const ts = new Date().toISOString();
  const llmCalls = (capture && capture.llmCalls) || [];
  const nodeEvents = (capture && capture.nodeEvents) || [];
  const spans = (capture && capture.spans) || [];
  const costUsd = llmCalls.reduce((a, c) => a + (c.costUsd || 0), 0);
  const llmLatencyMs = llmCalls.reduce((a, c) => a + (c.latencyMs || 0), 0);
  // Tokens: the anthropic-api provider reports usage tokens but no cost; the
  // claude-code provider reports cost but tokens:0. Store both.
  const llmTokens = llmCalls.reduce((a, c) => a + (c.tokens || 0), 0);
  const outcome = outcomeOf(result);
  const draft = result.draft || {};
  const route = result.route || null;
  // The service in play decides which service-scoped overlays applied, so it is
  // resolved before provenance rather than inline in the record below.
  const serviceId = draft.serviceId || (result.state && result.state.serviceId) || null;
  const [prov, overlay] = await Promise.all([promptProvenance(), overlayProvenance(serviceId)]);

  const record = {
    ts, sessionId, seq: null, channel, lang: lang || null,
    ...prov, ...overlay,
    userId: userId || (userContext && (userContext.userId || userContext.id)) || null,
    userDisplayName: (userContext && userContext.displayName) || null,
    orgCode: (userContext && userContext.orgUnit && userContext.orgUnit.code) || null,
    userText: cap(message),
    agentText: cap(result.response),
    route, askingSlot: result.askingSlot || null,
    error: result.error || null,
    durationMs: durationMs ?? null,
    llmCostUsd: costUsd, llmLatencyMs, llmCalls, nodeEvents, spans,
    serviceId,
    draftStatus: draft.status || null,
    repairSession: (draft.repair && draft.repair.session) || 0,
    outcome, srNumber: result.srNumber || null, ticketId: result.ticketId || null,
    escalationId: result.escalationId || null,
  };
  jsonlAppend(record);

  try {
    await graphWrite(
      `MERGE (s:ChatSession {sessionId:$sessionId})
       ON CREATE SET s.startedAt=$ts, s.channel=$channel, s.namespace='FlowDesk',
                     s.qualityStatus='new'
       SET s.lastActivityAt=$ts,
           s.lang=coalesce($lang, s.lang),
           s.userId=coalesce($userId, s.userId),
           s.userDisplayName=coalesce($userDisplayName, s.userDisplayName),
           s.orgCode=coalesce($orgCode, s.orgCode),
           s.serviceId=coalesce($serviceId, s.serviceId),
           s.draftStatus=coalesce($draftStatus, s.draftStatus),
           s.repairSession=CASE WHEN $repairSession > coalesce(s.repairSession,0) THEN $repairSession ELSE coalesce(s.repairSession,0) END,
           s.turns=coalesce(s.turns,0)+1,
           s.errorTurns=coalesce(s.errorTurns,0)+$errInc,
           s.outOfScopeTurns=coalesce(s.outOfScopeTurns,0)+$oosInc,
           s.llmCostUsd=coalesce(s.llmCostUsd,0)+$costUsd,
           s.llmTokens=coalesce(s.llmTokens,0)+$llmTokens,
           s.llmCalls=coalesce(s.llmCalls,0)+$llmCallCount,
           s.outcome=coalesce($outcome, s.outcome),
           s.endedAt=CASE WHEN $outcome IS NULL THEN s.endedAt ELSE $ts END,
           s.srNumber=coalesce($srNumber, s.srNumber),
           s.ticketId=coalesce($ticketId, s.ticketId),
           s.escalationId=coalesce($escalationId, s.escalationId)
       WITH s
       CREATE (t:ChatTurn {turnId:$turnId, seq:s.turns, sessionId:$sessionId, ts:$ts,
         channel:$channel, userText:$userText, agentText:$agentText, route:$route,
         askingSlot:$askingSlot, error:$error, durationMs:$durationMs,
         llmCostUsd:$costUsd, llmTokens:$llmTokens, llmLatencyMs:$llmLatencyMs,
         nodeTraceJson:$nodeTraceJson, llmCallsJson:$llmCallsJson, spansJson:$spansJson,
         promptGraphEntryId:$promptGraphEntryId, promptGraphVersion:$promptGraphVersion,
         promptTextHash:$promptTextHash,
         overlayHash:$overlayHash, overlayIds:$overlayIds})
       MERGE (s)-[:HAS_TURN]->(t)`,
      {
        sessionId, ts, channel, lang: record.lang,
        userId: record.userId, userDisplayName: record.userDisplayName, orgCode: record.orgCode,
        serviceId: record.serviceId, draftStatus: record.draftStatus, repairSession: record.repairSession,
        errInc: route === 'ERROR' || result.error ? 1 : 0,
        oosInc: route === 'OUT_OF_SCOPE' ? 1 : 0,
        costUsd, llmTokens, llmCallCount: llmCalls.length,
        outcome, srNumber: record.srNumber, ticketId: record.ticketId, escalationId: record.escalationId,
        turnId: makeTurnId(sessionId),
        userText: record.userText, agentText: record.agentText, route,
        askingSlot: record.askingSlot, error: record.error, durationMs: record.durationMs,
        llmLatencyMs,
        nodeTraceJson: JSON.stringify(nodeEvents),
        llmCallsJson: JSON.stringify(llmCalls),
        spansJson: JSON.stringify(spans),
        // SUADA-PREREQ-001: the prompt-graph version this turn ran under.
        promptGraphEntryId: prov.promptGraphEntryId,
        promptGraphVersion: prov.promptGraphVersion,
        promptTextHash: prov.promptTextHash,
        // SUADA-PREREQ-001.1: the operator overlays layered on top of it.
        overlayHash: overlay.overlayHash,
        overlayIds: overlay.overlayIds,
      }
    );
    // Link session → terminal record for graph navigation.
    if (record.srNumber) {
      await graphWrite(
        `MATCH (s:ChatSession {sessionId:$sessionId})
         OPTIONAL MATCH (sr:ServiceRequest {srNumber:$srNumber})
         FOREACH (_ IN CASE WHEN sr IS NULL THEN [] ELSE [1] END | MERGE (s)-[:RESULTED_IN]->(sr))`,
        { sessionId, srNumber: record.srNumber }
      );
    }
  } catch (err) {
    console.warn('[chat-telemetry] recordTurn failed:', err.message);
  }
}

/**
 * Stamp a terminal outcome outside the chat loop (REST submit/escalate, sweeper).
 * extra: {srNumber, ticketId, escalationId, error, draftJson}
 */
async function stampOutcome(sessionId, outcome, extra = {}) {
  if (!enabled() || !sessionId || !outcome) return;
  const ts = new Date().toISOString();
  try {
    await graphWrite(
      `MERGE (s:ChatSession {sessionId:$sessionId})
       ON CREATE SET s.startedAt=$ts, s.namespace='FlowDesk', s.channel='text',
                     s.turns=0, s.qualityStatus='new'
       SET s.outcome=$outcome, s.endedAt=coalesce(s.endedAt,$ts), s.lastActivityAt=$ts,
           s.srNumber=coalesce($srNumber, s.srNumber),
           s.ticketId=coalesce($ticketId, s.ticketId),
           s.escalationId=coalesce($escalationId, s.escalationId),
           s.lastError=coalesce($error, s.lastError),
           s.finalDraftJson=coalesce($draftJson, s.finalDraftJson)`,
      {
        sessionId, outcome, ts,
        srNumber: extra.srNumber || null, ticketId: extra.ticketId || null,
        escalationId: extra.escalationId || null, error: extra.error || null,
        draftJson: extra.draftJson || null,
      }
    );
  } catch (err) {
    console.warn('[chat-telemetry] stampOutcome failed:', err.message);
  }
}

/** Memgraph indexes for the admin queries (idempotent; call once at startup). */
async function ensureIndexes() {
  const { runAutocommit } = require('../schema-graph/driver');
  for (const stmt of [
    'CREATE INDEX ON :ChatSession(sessionId)',
    'CREATE INDEX ON :ChatSession(outcome)',
    'CREATE INDEX ON :ChatTurn(sessionId)',
    // SUADA-PREREQ-001: attribution queries group turns by the prompt that ran them.
    'CREATE INDEX ON :ChatTurn(promptTextHash)',
  ]) {
    try { await runAutocommit(stmt); } catch { /* exists / racing — fine */ }
  }
}

/** Test seam. */
function _setDeps({ write, getPromptProvenance, getOverlayProvenance } = {}) {
  _write = write || null;
  _getPromptProvenance = getPromptProvenance || null;
  _getOverlayProvenance = getOverlayProvenance || null;
}

module.exports = {
  withTurnCapture, captureProgress, wrapLLMProvider,
  recordTurn, stampOutcome, ensureIndexes, outcomeOf,
  enabled, _setDeps, TEXT_CAP,
  recordSpan, timed,
};
