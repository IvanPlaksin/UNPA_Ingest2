'use strict';

/**
 * TURN-001 — the guard.
 *
 * Every field the agent loop puts on a turn has to arrive at the client. Three
 * layers copy the turn on the way out, and for most of this project each kept its
 * own hand-written list of field names. A name missing from one of them produced no
 * error and no empty space — just an answer that read as if it had worked. It cost
 * REQ-005 two shipped-broken rounds and it was the fourteenth instance of that class.
 *
 * This test is written against the CONTRACT rather than against any one field, so it
 * covers whatever is added to it next. `cards` is not special here; it is simply the
 * field that was lost when the list was written by hand.
 *
 * Only the model is doubled. Everything from the loop to the returned response is the
 * code that runs live — a double in between is exactly what let the last bug hide.
 */

const { TURN_PAYLOAD, TURN_PAYLOAD_FIELDS, pickTurnPayload } = require('../turn-contract');

/** A representative non-empty value per field, so the guard needs no per-field edit. */
const SAMPLE = {
  response: 'Here is your last request.',
  controls: [{ type: 'choice', slotId: 'x', options: [] }],
  cards: [{ type: 'request', id: 'SR-1001', title: 'Education grant claim',
    revealIntent: { domain: 'requests', id: 'SR-1001' } }],
  openForm: { serviceId: 'EO-HR-SA-EXT', ousId: 3, prefill: { dynamicData: {} } },
};

describe('the contract itself', () => {
  test('every field has a sample, so the guard below covers all of them', () => {
    // Without this, adding a field to the contract and forgetting the sample would
    // leave it untested while the suite stayed green — the same silence again.
    expect(Object.keys(SAMPLE).sort()).toEqual([...TURN_PAYLOAD_FIELDS].sort());
  });

  test('a field with nothing in it is omitted unless it is always present', () => {
    const picked = pickTurnPayload({ response: 'hi', controls: null, cards: [], openForm: null });

    expect(picked.response).toBe('hi');
    expect(picked.controls).toBeNull();      // always present, null when there are none
    expect('cards' in picked).toBe(false);   // an empty list would draw an empty box
    expect('openForm' in picked).toBe(false);
  });

  test('what is not in the contract does not travel', () => {
    // The tool session and the model's cost accounting come out of the loop beside
    // the payload and stop at the layer that needs them.
    const picked = pickTurnPayload({ response: 'hi', session: { secrets: 1 }, meta: { costUsd: 0.02 } });

    expect(picked.session).toBeUndefined();
    expect(picked.meta).toBeUndefined();
  });
});

describe('every contract field survives the whole way out', () => {
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
    jest.doMock('../../agent-interpreter/agent-loop.service', () => ({
      createAgentLoop: () => ({ runTurn: async () => loopResult }),
    }));
    jest.doMock('../../services/resolve-search.service', () => ({ getResolveSearch: () => async () => [] }));
    jest.doMock('../../../../services/ai/llm-provider', () => ({ getLLMProvider: () => ({}) }));

    chatV2 = require('../chat-v2.service');
  });

  afterEach(() => {
    delete process.env.FLOWDESK_AGENT_INTERPRETER;
    delete process.env.FLOWDESK_INTERPRETER;
  });

  // One case per field: set it on the loop's result, and require it at the far end.
  for (const name of TURN_PAYLOAD_FIELDS) {
    test(`\`${name}\` reaches the response`, async () => {
      loopResult = {
        response: 'something was said',
        controls: null,
        history: [],
        meta: { toolCalls: [], costUsd: 0, tokens: 0 },
        [name]: SAMPLE[name],
      };

      const res = await chatV2.processMessage(`s-${name}`, 'u-1', 'go', {}, null, 'en', null);

      expect(res[name]).toEqual(SAMPLE[name]);
    });
  }

  test('all of them together, as a real turn carries them', async () => {
    loopResult = { ...SAMPLE, history: [], meta: { toolCalls: [], costUsd: 0, tokens: 0 } };

    const res = await chatV2.processMessage('s-all', 'u-1', 'go', {}, null, 'en', null);

    for (const name of TURN_PAYLOAD_FIELDS) expect(res[name]).toEqual(SAMPLE[name]);
  });

  test('the hand-off still ends the session — that part is the service’s, not the turn’s', async () => {
    loopResult = {
      response: 'Opening the form.', controls: null, openForm: SAMPLE.openForm,
      history: [], meta: { toolCalls: [], costUsd: 0, tokens: 0 },
    };

    const res = await chatV2.processMessage('s-handoff', 'u-1', 'open it', {}, null, 'en', null);

    expect(res.openForm).toEqual(SAMPLE.openForm);
    expect(res.sessionEnded).toBe('form_handoff');
  });

  test('an ordinary turn carries none of the optional fields', async () => {
    loopResult = { response: 'hello', controls: null, history: [], meta: { toolCalls: [], costUsd: 0, tokens: 0 } };

    const res = await chatV2.processMessage('s-plain', 'u-1', 'hi', {}, null, 'en', null);

    for (const [name, rule] of Object.entries(TURN_PAYLOAD)) {
      if (!rule.always) expect(res[name]).toBeUndefined();
    }
    expect(res.response).toBe('hello');
  });
});
