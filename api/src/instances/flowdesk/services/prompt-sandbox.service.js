'use strict';

/**
 * Prompt sandbox runner (ADMIN P6) — drives real chat turns against a CANDIDATE
 * system prompt with ZERO production side effects, so an operator (or the editor
 * AI) can test a prompt-graph before applying it.
 *
 * Isolation (lifted from the interpreter test harness makeEngine, e.g.
 * calm-acceptance.test.js): an in-memory Map draft store + a no-op graphWrite ⇒
 * nothing reaches Redis or Memgraph; submit() never POSTs a real Altiora ticket
 * (it needs FLOWDESK_SUBMIT_TARGET=altiora AND graphWrite, neither present here).
 * Telemetry is bypassed by calling createEngine().runTurn directly (NOT
 * chat-v2.service.processMessage). The candidate prompt is injected via the same
 * getSystemPrompt seam the live engine uses — so what the sandbox exercises is
 * exactly what production would run once applied.
 *
 * The LLM is the REAL provider by default (so the test reflects real behavior);
 * pass a MockLLMProvider via deps.llm for deterministic unit tests.
 *
 * @module instances/flowdesk/services/prompt-sandbox.service
 */

const { createEngine } = require('../interpreter/interpreter-engine');
const { createDraftSRService } = require('./draft-sr.service');
const { compilePromptGraph } = require('./prompt-graph-compiler');
const { validatePromptGraph } = require('./prompt-graph-validator');

// How the sandbox turns a serviceId into a SchemaSnapshot — MUST mirror the live
// chat (chat-v2.service) so the arena reflects real behaviour. 'altiora' →
// materialize on demand from the Altiora catalog (real service forms, e.g.
// EO-FIN-PAY-INQ); otherwise the seeded schema-graph compiler (golden fixtures /
// platform flows only). If the sandbox used `compile` unconditionally, any
// Altiora-only service would load NULL and the agent wrongly reports "intake form
// is not available yet."
function defaultLoadSnapshot() {
  return (process.env.FLOWDESK_SCHEMA_PROVIDER || 'graph') === 'altiora'
    ? require('../services/schema-orchestrator').createDefaultAltioraLoader().loadSnapshot
    : require('../schema-graph/schema-compiler').compile;
}

let _refCounter = 0;
function makeRef(_draft, prefix = 'SR') { _refCounter = (_refCounter + 1) % 1000; return `${prefix}-SANDBOX${Date.now()}${_refCounter}`; }

/** In-memory store adapter matching the draft service's {get,set} contract. */
function memStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); } };
}

/**
 * Build an INTERACTIVE sandbox session: the isolated engine + draft store + LLM
 * are constructed ONCE and returned behind a `sendTurn(message)` closure, so a
 * caller can drive turns one at a time while state (slots, DraftSR) persists
 * across them under a single sessionId — with the same zero-side-effect
 * isolation as runSandbox.
 *
 * This is the seam the Dialogue Gym ArenaRunner uses: a persona-LLM produces
 * each next user message from the agent's prior reply, so the message list is
 * NOT known up front. Re-calling runSandbox with a growing messages[] would
 * rebuild the engine and re-sample every earlier agent turn (LLM divergence +
 * O(n²) cost); a persistent session avoids both.
 *
 * runSandbox() is a thin scripted loop over this same session, so its external
 * behaviour is unchanged.
 *
 * @param {object} p                        {graph|systemPromptText, serviceId?, lang?, title?, userContext?}
 * @param {object} [deps]                   {llm, resolveSearch, loadSnapshot, directory}
 * @returns {{ sendTurn, sessionId, systemPromptText, ruleCount, validation, sideEffects }}
 */
function createSandboxSession(p = {}, deps = {}) {
  // Resolve the candidate prompt.
  let compiled = null;
  let validation = null;
  let systemText = p.systemPromptText || null;
  let byNode = {};
  if (p.graph) {
    validation = validatePromptGraph(p.graph);
    compiled = compilePromptGraph(p.graph, { title: p.title });
    systemText = compiled.text;
    byNode = compiled.byNode;
  }
  const getSystemPrompt = async (node) => (byNode[node] || systemText || null);

  // Guarded sinks — count would-be side effects instead of performing them.
  const effects = { ticketsCreated: 0, memgraphWrites: 0 };
  const graphWrite = async () => { effects.memgraphWrites += 1; return []; };
  const ticketService = { createTicket: async () => { effects.ticketsCreated += 1; return { srNumber: makeRef(), ticketId: null, status: 'SANDBOX' }; } };

  // One loader, shared by the draft service and the engine so they materialize
  // identically (and the Altiora loader is built at most once per session).
  const loadSnapshot = deps.loadSnapshot || defaultLoadSnapshot();

  const draftService = createDraftSRService({
    store: memStore(),
    graphWrite,
    ticketService,
    loadSnapshot,
    makeRef,
  });

  // Real LLM by default (reflects production); overridable for deterministic tests.
  const llm = deps.llm || require('../../../services/ai/llm-provider').getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || 'anthropic-api',
    model: process.env.FLOWDESK_LLM_MODEL || 'claude-haiku-4-5-20251001',
  });
  const resolveSearch = deps.resolveSearch || require('./resolve-search.service').getResolveSearch();

  const engine = createEngine({
    llm,
    resolveSearch,
    draftService,
    loadSnapshot,
    directory: deps.directory, // undefined → engine lazy-loads mock/altiora; fine for sandbox
    getSystemPrompt,           // ← the candidate prompt under test
    // NO emitProgress, NO getPromptGuidance (overlays excluded so the test isolates the graph prompt)
  });

  const sessionId = `sandbox-${Date.now()}-${Math.floor(_refCounter)}`;
  const defaultLang = p.lang || 'en';

  // Act as a real Altiora user (dual-auth): when an acting user with a bearer
  // `token` is supplied, wrap the turn in the acting-user context so every
  // Altiora call (MY_REQUESTS mineOnly, LOV/FormLookup, location-scoped catalog,
  // ServiceDistribution/detect, schema materialization) runs as that user rather
  // than falling back to the service account. Without it, user-scoped reference
  // data and functions are wrong. `p.userContext` still carries the identity.
  const actingUser = deps.actingUser || p.actingUser
    || (p.userContext && p.userContext.token ? p.userContext : null);
  const { runWithActingUser } = require('./acting-user.context');

  /**
   * Drive one turn. Never throws — returns {ok:false,error} on engine failure so
   * the caller can decide how to terminate. A `controlAction` ({slotId,value}) or
   * `choice` may be passed to reply to the agent's controls[] (e.g. picking a
   * disambiguation option), exactly as the live UI would.
   * @returns {Promise<{ok:boolean, turn?:object, error?:string, ms:number}>}
   */
  async function sendTurn(message, { lang, controlAction, choice } = {}) {
    const t0 = Date.now();
    const doTurn = () => engine.runTurn({ sessionId, message, controlAction, choice, userContext: p.userContext, lang: lang || defaultLang });
    try {
      const turn = actingUser ? await runWithActingUser(actingUser, doTurn) : await doTurn();
      return { ok: true, turn, ms: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: err.message, ms: Date.now() - t0 };
    }
  }

  return {
    sendTurn,
    sessionId,
    systemPromptText: systemText,
    ruleCount: compiled ? compiled.ruleCount : undefined,
    validation,
    sideEffects: effects,
  };
}

/**
 * Run a scripted multi-turn scenario against a candidate prompt.
 * @param {object} p
 * @param {{nodes,edges}} [p.graph]        the candidate rules graph (compiled here), OR
 * @param {string} [p.systemPromptText]    a raw candidate prompt (skips compile)
 * @param {string[]} p.messages            user utterances, driven in order (max 12)
 * @param {string} [p.serviceId]           optional service to bias resolution
 * @param {string} [p.lang]                default 'en'
 * @param {object} [deps]                  {llm, resolveSearch, loadSnapshot, directory}
 * @returns {Promise<{compiled?, validation?, transcript:Array, sideEffects:{ticketsCreated:number, memgraphWrites:number}}>}
 */
async function runSandbox(p, deps = {}) {
  const messages = Array.isArray(p.messages) ? p.messages.slice(0, 12) : [];
  if (!messages.length) throw Object.assign(new Error('messages[] is required'), { status: 400 });

  const session = createSandboxSession(p, deps);
  const transcript = [];
  for (const message of messages) {
    const r = await session.sendTurn(message);
    if (!r.ok) {
      transcript.push({ user: message, error: r.error, ms: r.ms });
      continue;
    }
    const turn = r.turn;
    transcript.push({
      user: message,
      agent: turn.response,
      route: turn.route,
      askingSlot: turn.askingSlot || null,
      srNumber: turn.srNumber || null,
      isComplete: !!turn.isComplete,
      ms: r.ms,
    });
  }

  return {
    systemPromptText: session.systemPromptText,
    ruleCount: session.ruleCount,
    validation: session.validation,
    transcript,
    sideEffects: session.sideEffects, // ticketsCreated counts sandbox-stubbed submits; NO real Altiora ticket
    sessionId: session.sessionId,
  };
}

// defaultLoadSnapshot is exported so the agent interpreter (EXP-002) materialises
// forms through the SAME loader. If the two architectures saw different forms,
// the arena would be comparing schemas rather than dialogue.
module.exports = { runSandbox, createSandboxSession, memStore, defaultLoadSnapshot };
