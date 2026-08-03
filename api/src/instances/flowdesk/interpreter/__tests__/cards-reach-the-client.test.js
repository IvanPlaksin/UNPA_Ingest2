'use strict';

/**
 * REQ-005 — the rows survive the service layer.
 *
 * The tool built the cards, the store read `result.cards`, the component rendered
 * them, and every one of those was covered by a passing test. The chat still showed
 * nothing: `processMessage` copies the turn field by field, and no line named
 * `cards`. Between two tested ends, an untested seam.
 *
 * The failure had no symptom that pointed at it. The tool reported success; the
 * client had nothing to draw; and the model — told the rows would be rendered, then
 * seeing a turn where they were not — read them out in prose instead, which looked
 * like an answer. Session fdv2-3c8050bf.
 *
 * So the assertion here is deliberately at the OUTER boundary — the object handed to
 * the HTTP layer — rather than on any function that builds a part of it.
 *
 * This suite covers the LAST hop only, because it doubles the agent session. There
 * was a second copy of the same bug inside that double's real counterpart, which no
 * assertion here could have reached. The whole chain is covered next door, in
 * cards-reach-the-client.e2e.test.js.
 */

const CARDS = [
  { type: 'request', id: 'SR-1001', title: 'Education grant claim',
    fields: [{ label: 'Status', value: 'Open' }],
    revealIntent: { domain: 'requests', id: 'SR-1001' } },
];

const agentTurn = (extra = {}) => ({
  ok: true,
  ms: 10,
  turn: {
    response: 'Here is your last request.',
    controls: null,
    responseType: 'text',
    askingSlot: null,
    isComplete: false,
    agentMeta: { toolCalls: [{ name: 'list_requests', ok: true }], costUsd: 0, tokens: 0 },
    ...extra,
  },
});

describe('the rows a turn shows reach the client', () => {
  let chatV2;
  let sendTurn;

  beforeEach(() => {
    jest.resetModules();
    process.env.FLOWDESK_AGENT_INTERPRETER = '1';
    process.env.FLOWDESK_INTERPRETER = 'agent';

    jest.doMock('../../services/draft-sr.service', () => ({
      getDraftSRService: () => ({ get: async () => null, discard: async () => true }),
      createDraftSRService: () => ({ get: async () => null, discard: async () => true }),
    }));
    jest.doMock('../../agent-interpreter/agent-session.service', () => ({
      createAgentSession: () => ({ sendTurn: (...a) => sendTurn(...a) }),
    }));
    jest.doMock('../../services/chat-telemetry.service', () => ({
      withTurnCapture: async (fn) => ({ result: await fn(), capture: { spans: [] } }),
      recordTurn: () => {},
      wrapLLMProvider: (llm) => llm,
    }));

    chatV2 = require('../chat-v2.service');
  });

  afterEach(() => {
    delete process.env.FLOWDESK_AGENT_INTERPRETER;
    delete process.env.FLOWDESK_INTERPRETER;
  });

  test('cards the agent put on the turn are in the response', async () => {
    sendTurn = async () => agentTurn({ cards: CARDS });

    const res = await chatV2.processMessage('s-cards', 'u-1', 'show my last request', {}, null, 'en', null);

    expect(res.cards).toEqual(CARDS);
  });

  test('the intent that opens the row survives too — a card without it is inert', async () => {
    sendTurn = async () => agentTurn({ cards: CARDS });

    const res = await chatV2.processMessage('s-reveal', 'u-1', 'show my last request', {}, null, 'en', null);

    expect(res.cards[0].revealIntent).toEqual({ domain: 'requests', id: 'SR-1001' });
  });

  test('a turn with no rows carries no empty field for the client to render', async () => {
    // An empty array would draw an empty list container on an ordinary answer.
    sendTurn = async () => agentTurn({ cards: [] });

    const res = await chatV2.processMessage('s-empty', 'u-1', 'hello', {}, null, 'en', null);

    expect(res.cards).toBeUndefined();
  });

  test('an ordinary turn is unchanged', async () => {
    sendTurn = async () => agentTurn();

    const res = await chatV2.processMessage('s-plain', 'u-1', 'hello', {}, null, 'en', null);

    expect(res.cards).toBeUndefined();
    expect(res.response).toBe('Here is your last request.');
  });
});
