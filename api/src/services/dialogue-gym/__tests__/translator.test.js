'use strict';

const { translateTurn, translateTurns } = require('../translator');

const fakeLlm = {
  structuredOutput: async (prompt) => ({
    data: { userRu: 'привет', agentRu: 'здравствуйте' },
    inputTokens: 10, outputTokens: 5, costUsd: 0.0001,
  }),
};

describe('Dialogue Gym — translator', () => {
  test('translateTurn returns Russian user + agent text', async () => {
    const r = await translateTurn({ userMessage: 'hi', agentResponse: 'hello' }, { llm: fakeLlm });
    expect(r.userMessageRu).toBe('привет');
    expect(r.agentResponseRu).toBe('здравствуйте');
    expect(r.tokens).toBe(15);
  });

  test('empty turn is a no-op (no LLM call)', async () => {
    let called = false;
    const llm = { structuredOutput: async () => { called = true; return { data: {} }; } };
    const r = await translateTurn({ userMessage: '', agentResponse: '' }, { llm });
    expect(called).toBe(false);
    expect(r.userMessageRu).toBe('');
  });

  test('translateTurns skips already-translated unless force', async () => {
    const turns = [
      { turnId: 't1', userMessage: 'hi', agentResponse: 'hello', userMessageRu: 'уже', agentResponseRu: 'есть' },
      { turnId: 't2', userMessage: 'bye', agentResponse: 'see ya' },
    ];
    const out = await translateTurns(turns, { llm: fakeLlm });
    expect(out[0].skipped).toBe(true);
    expect(out[0].userMessageRu).toBe('уже');
    expect(out[1].userMessageRu).toBe('привет'); // translated
  });

  test('force re-translates everything', async () => {
    const turns = [{ turnId: 't1', userMessage: 'hi', agentResponse: 'hello', userMessageRu: 'уже', agentResponseRu: 'есть' }];
    const out = await translateTurns(turns, { llm: fakeLlm, force: true });
    expect(out[0].skipped).toBeUndefined();
    expect(out[0].userMessageRu).toBe('привет');
  });
});
