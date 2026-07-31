'use strict';

/**
 * The hand-off ends the chat session.
 *
 * Once the form is open the wizard owns the request: the chat cannot change a
 * value in it, cannot submit it, and must not offer to resume it later. The
 * session used to survive the hand-off, which left the next thing the user said
 * being answered against a request that had already left the building — and left
 * the draft in Redis for the resume offer to put back in front of them.
 *
 * Asserted at the seam the client actually sees: the response says the session
 * ended, the draft is gone, and the in-memory agent session is dropped.
 */

const OPEN_FORM = { serviceId: 'EO-HR-SA-EXT', ousId: 3, prefill: { dynamicData: { f1: 'x' } } };

/** A turn result shaped like the agent path's, with or without a hand-off. */
const agentTurn = (openForm) => ({
  ok: true,
  ms: 10,
  turn: {
    response: 'Opening the form now.',
    controls: null,
    responseType: openForm ? 'open_form' : 'text',
    ...(openForm ? { openForm } : {}),
    askingSlot: null,
    isComplete: false,
    agentMeta: { toolCalls: [], costUsd: 0, tokens: 0 },
  },
});

describe('a turn that opens the form closes the session', () => {
  let chatV2;
  let discarded;
  let sendTurn;

  beforeEach(() => {
    jest.resetModules();
    process.env.FLOWDESK_AGENT_INTERPRETER = '1';
    // This suite is about the AGENT path's hand-off, and it mocks the agent's
    // dependencies only. Since HYB-FIX-001 the default is the hybrid, which wraps the
    // agent and needs its own — so the path under test is named rather than inherited.
    // The hybrid's own propagation of the hand-off is covered in the hybrid suite.
    process.env.FLOWDESK_INTERPRETER = 'agent';
    discarded = [];

    jest.doMock('../../services/draft-sr.service', () => ({
      getDraftSRService: () => ({
        get: async () => null,
        discard: async (sessionId) => { discarded.push(sessionId); return true; },
      }),
      createDraftSRService: () => ({ get: async () => null, discard: async () => true }),
    }));

    // The agent session is a test double: this is about what the SERVICE does
    // around the turn, not about what the agent decides inside it.
    jest.doMock('../../agent-interpreter/agent-session.service', () => ({
      createAgentSession: () => ({ sendTurn: (...a) => sendTurn(...a) }),
    }));

    // Telemetry must never be the reason a turn behaves differently.
    jest.doMock('../../services/chat-telemetry.service', () => ({
      withTurnCapture: async (fn) => ({ result: await fn(), capture: { spans: [] } }),
      recordTurn: () => {},
      wrapLLMProvider: (llm) => llm,
    }));

    chatV2 = require('../chat-v2.service');
  });

  afterEach(() => { delete process.env.FLOWDESK_AGENT_INTERPRETER; });

  test('the client is told the session ended, and the draft goes with it', async () => {
    sendTurn = async () => agentTurn(OPEN_FORM);

    const res = await chatV2.processMessage('s-handoff', 'u-1', 'open the form', {}, null, 'en', null);

    expect(res.openForm).toEqual(OPEN_FORM);
    expect(res.sessionEnded).toBe('form_handoff');
    expect(discarded).toEqual(['s-handoff']);
  });

  test('an ordinary turn ends nothing', async () => {
    sendTurn = async () => agentTurn(null);

    const res = await chatV2.processMessage('s-plain', 'u-1', 'hello', {}, null, 'en', null);

    expect(res.sessionEnded).toBeUndefined();
    expect(discarded).toEqual([]);
  });

  test('the next turn on that id starts a NEW agent session, not the finished one', async () => {
    const seen = [];
    sendTurn = async (message) => { seen.push(message); return agentTurn(seen.length === 1 ? OPEN_FORM : null); };

    await chatV2.processMessage('s-reuse', 'u-1', 'open the form', {}, null, 'en', null);
    await chatV2.processMessage('s-reuse', 'u-1', 'and one more thing', {}, null, 'en', null);

    // Both turns ran, and the second one could only have run on a session built
    // after the first was dropped — the registry no longer holds the old one.
    expect(seen).toEqual(['open the form', 'and one more thing']);
    expect(discarded).toEqual(['s-reuse']);
  });
});
