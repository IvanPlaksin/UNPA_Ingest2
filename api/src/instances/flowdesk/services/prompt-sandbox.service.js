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

let _refCounter = 0;
function makeRef(_draft, prefix = 'SR') { _refCounter = (_refCounter + 1) % 1000; return `${prefix}-SANDBOX${Date.now()}${_refCounter}`; }

/** In-memory store adapter matching the draft service's {get,set} contract. */
function memStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), set: async (k, v) => { m.set(k, v); } };
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

  const draftService = createDraftSRService({
    store: memStore(),
    graphWrite,
    ticketService,
    loadSnapshot: deps.loadSnapshot || require('../schema-graph/schema-compiler').compile,
    makeRef,
  });

  // Real LLM by default (reflects production); overridable for deterministic tests.
  const llm = deps.llm || require('../../../services/ai/llm-provider').getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || 'claude-code',
    model: process.env.FLOWDESK_LLM_MODEL || 'claude-sonnet-4-6',
  });
  const resolveSearch = deps.resolveSearch || require('./resolve-search.service').getResolveSearch();

  const engine = createEngine({
    llm,
    resolveSearch,
    draftService,
    loadSnapshot: deps.loadSnapshot || require('../schema-graph/schema-compiler').compile,
    directory: deps.directory, // undefined → engine lazy-loads mock/altiora; fine for sandbox
    getSystemPrompt,           // ← the candidate prompt under test
    // NO emitProgress, NO getPromptGuidance (overlays excluded so the test isolates the graph prompt)
  });

  const sessionId = `sandbox-${Date.now()}-${Math.floor(_refCounter)}`;
  const lang = p.lang || 'en';
  const transcript = [];
  for (const message of messages) {
    const t0 = Date.now();
    let turn;
    try {
      turn = await engine.runTurn({ sessionId, message, userContext: p.userContext, lang });
    } catch (err) {
      transcript.push({ user: message, error: err.message, ms: Date.now() - t0 });
      continue;
    }
    transcript.push({
      user: message,
      agent: turn.response,
      route: turn.route,
      askingSlot: turn.askingSlot || null,
      srNumber: turn.srNumber || null,
      isComplete: !!turn.isComplete,
      ms: Date.now() - t0,
    });
  }

  return {
    systemPromptText: systemText,
    ruleCount: compiled ? compiled.ruleCount : undefined,
    validation,
    transcript,
    sideEffects: effects, // ticketsCreated counts sandbox-stubbed submits; NO real Altiora ticket
    sessionId,
  };
}

module.exports = { runSandbox, memStore };
