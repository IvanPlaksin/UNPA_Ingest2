'use strict';

/**
 * REQ-005 — the rows survive every hop, with nothing stubbed in between.
 *
 * Its own file on purpose. `jest.doMock` outlives `jest.resetModules()`, so a second
 * describe in the sibling suite inherited that one's agent-session double — the very
 * layer that was dropping the field. The test failed against already-fixed code and
 * would have passed against broken code once the double was in place.
 *
 * Only the agent LOOP is replaced here, because it calls the model. Everything from
 * there to the wire is the code that runs live, so each named-field copy on the way
 * out is exercised rather than swapped for something that always agrees.
 */

const CARDS = [
  { type: 'request', id: 'SR-1001', title: 'Education grant claim',
    fields: [{ label: 'Status', value: 'Open' }],
    revealIntent: { domain: 'requests', id: 'SR-1001' } },
];

/**
 * The same journey with nothing stubbed between the loop and the wire.
 *
 * Only the agent LOOP is doubled — the layer that calls the model. Everything above
 * it is the code that runs live, so each named-field copy on the way out is exercised
 * rather than replaced. This is the version that fails when a hop forgets the field.
 */
describe('from the loop to the wire, through the real layers', () => {
  let chatV2;
  let loopResult;

  beforeEach(() => {
    jest.resetModules();
    process.env.FLOWDESK_AGENT_INTERPRETER = '1';
    process.env.FLOWDESK_INTERPRETER = 'agent';

    jest.doMock('../../services/draft-sr.service', () => ({
      getDraftSRService: () => ({ get: async () => null, discard: async () => true }),
      createDraftSRService: () => ({ get: async () => null, discard: async () => true }),
    }));
    jest.doMock('../../services/chat-telemetry.service', () => ({
      withTurnCapture: async (fn) => ({ result: await fn(), capture: { spans: [] } }),
      recordTurn: () => {},
      wrapLLMProvider: (llm) => llm,
    }));
    // The model is the only thing replaced.
    jest.doMock('../../agent-interpreter/agent-loop.service', () => ({
      createAgentLoop: () => ({ runTurn: async () => loopResult }),
    }));
    // Real agent-session, so its own turn assembly is under test — but not its
    // network dependencies.
    jest.doMock('../../services/resolve-search.service', () => ({ getResolveSearch: () => async () => [] }));
    jest.doMock('../../../../services/ai/llm-provider', () => ({ getLLMProvider: () => ({}) }));

    chatV2 = require('../chat-v2.service');
  });

  afterEach(() => {
    delete process.env.FLOWDESK_AGENT_INTERPRETER;
    delete process.env.FLOWDESK_INTERPRETER;
  });

  test('rows the loop produced are on the wire', async () => {
    loopResult = {
      response: 'Here is your last request.',
      controls: null,
      cards: CARDS,
      history: [],
      meta: { toolCalls: [{ name: 'list_requests', ok: true }], costUsd: 0, tokens: 0 },
    };

    const res = await chatV2.processMessage('s-e2e', 'u-1', 'show my last request', {}, null, 'en', null);

    expect(res.cards).toEqual(CARDS);
  });
});
