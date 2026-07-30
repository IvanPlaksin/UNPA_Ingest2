'use strict';

/**
 * Agent session (EXP-002) — the arena-facing adapter.
 *
 * arena-runner drives whatever `sandboxFactory` returns, and says so in its own
 * header: "the sandbox is the single injectable target agent adapter seam;
 * swapping the default retargets the arena at any other agent." This module is
 * that swap. It implements the same shape prompt-sandbox.createSandboxSession
 * returns, so run A (state machine) and run B (agent) differ in one argument and
 * nothing else — no branch inside the arena, no mode flag threaded through the
 * engine, nothing that could quietly treat the two runs differently.
 *
 * Side effects are contained the same way the sandbox contains them: an
 * in-memory draft store and a ticket service that counts instead of creating.
 * An experiment must not raise real tickets.
 *
 * @module instances/flowdesk/agent-interpreter/agent-session.service
 */

const { createAgentLoop } = require('./agent-loop.service');
const { createAgentTools, createToolSession } = require('./agent-tools');
const { createDraftSRService } = require('../services/draft-sr.service');
const { memStore } = require('../services/prompt-sandbox.service');

let _seq = 0;
const makeRef = (_d, prefix = 'SR') => `${prefix}-AGENT${Date.now()}${(_seq = (_seq + 1) % 1000)}`;

/**
 * @param {{lang?, userContext?, actingUser?, promptEntryId?, promptVersion?, promptGraph?, model?}} p
 * @param {object} [deps] {llm, resolveSearch, loadSnapshot, tools, promptService}
 */
function createAgentSession(p = {}, deps = {}) {
  const effects = { ticketsCreated: 0, memgraphWrites: 0 };
  const graphWrite = async () => { effects.memgraphWrites += 1; return []; };
  const ticketService = {
    createTicket: async () => { effects.ticketsCreated += 1; return { srNumber: makeRef(), ticketId: null, status: 'SANDBOX' }; },
  };

  // The SAME loader the sandbox gives the state machine — otherwise the runs
  // would differ in the forms they see, not in how they hold a conversation.
  const loadSnapshot = deps.loadSnapshot
    || require('../services/prompt-sandbox.service').defaultLoadSnapshot();

  // Two callers, two levels of consequence. The ARENA gets the sandbox store
  // above: an experiment must never raise a real ticket. The LIVE CHAT passes
  // its own draftService and gets exactly the persistence and side effects the
  // state machine has — otherwise "switching the chat to the agent" would
  // silently switch it to a chat that cannot actually file anything.
  const draftService = deps.draftService || createDraftSRService({
    store: memStore(), graphWrite, ticketService, loadSnapshot, makeRef,
  });
  const sandboxed = !deps.draftService;

  // Same provider and model family the state machine uses unless overridden —
  // run B is meant to isolate the ARCHITECTURE, so the model is held constant.
  const llm = deps.llm || require('../../../services/ai/llm-provider').getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || 'anthropic-api',
    model: p.model || process.env.FLOWDESK_LLM_MODEL || 'claude-haiku-4-5-20251001',
  });

  const resolveSearch = deps.resolveSearch || require('../services/resolve-search.service').getResolveSearch();
  const tools = deps.tools || createAgentTools({ resolveSearch, draftService, loadSnapshot, tools: deps.altioraTools });

  const loop = createAgentLoop({
    llm, tools,
    promptService: deps.promptService,
    model: p.model,
    promptEntryId: p.promptEntryId, promptVersion: p.promptVersion, promptGraph: p.promptGraph,
    maxToolIterations: p.maxToolIterations,
  });

  // The live chat MUST pass its own sessionId: the draft, the telemetry and the
  // Redis key all hang off it, and a generated one would orphan the draft on
  // every HTTP request. The arena has no such constraint and gets a fresh id.
  const sessionId = p.sessionId || `agent-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const defaultLang = p.lang || 'en';
  const toolSession = createToolSession();
  let history = [];

  const actingUser = deps.actingUser || p.actingUser
    || (p.userContext && p.userContext.token ? p.userContext : null);
  const { runWithActingUser } = require('../services/acting-user.context');

  /**
   * Same signature and same guarantees as the sandbox's sendTurn: never throws,
   * returns {ok:false, error} instead, so the arena can terminate a run cleanly.
   */
  async function sendTurn(message, { lang, controlAction, choice } = {}) {
    const t0 = Date.now();
    const doTurn = () => loop.runTurn({
      sessionId, history, userMessage: message, lang: lang || defaultLang,
      userContext: p.userContext, controlAction: controlAction || choice || null,
      session: toolSession,
    });
    try {
      const out = actingUser ? await runWithActingUser(actingUser, doTurn) : await doTurn();
      history = out.history;
      // The arena reads which service was resolved from `turn.draft.serviceId`
      // (extractAgentInternals). Without exposing the draft, every agent run
      // would score "no service identified" no matter what the agent actually
      // did — an instrumentation gap that reads exactly like a behavioural
      // finding, which is the worst kind.
      const draft = await draftService.get(sessionId);
      // Shaped like the state machine's turn so the arena reads both the same way.
      const turn = {
        response: out.response,
        controls: out.controls,
        responseType: out.openForm ? 'open_form' : (out.controls ? 'agent_with_controls' : 'text'),
        // The host opens Altiora's own form from this; dropping it here would
        // leave the agent promising a hand-off the client never receives.
        ...(out.openForm ? { openForm: out.openForm } : {}),
        route: 'AGENT',
        askingSlot: null,
        waiting: true,
        isComplete: !!(draft && draft.status === 'submitted'),
        ...(draft ? { draft } : {}),
        srNumber: (draft && draft.srNumber) || undefined,
        trace: out.meta.toolCalls.map((c) => c.name),
        agentMeta: out.meta,
      };
      return { ok: true, turn, ms: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: err.message, ms: Date.now() - t0 };
    }
  }

  return {
    sendTurn,
    sessionId,
    systemPromptText: null, // built per turn; the hash travels on agentMeta
    sideEffects: effects,
    sandboxed,
    interpreterMode: 'agent',
  };
}

module.exports = { createAgentSession };
