'use strict';

/**
 * What the persona simulator tolerates, and what it must not.
 *
 * Two multi-run arena batches each lost a whole dialogue to
 * "structuredOutput schema invalid: / must have required property 'signal'". The
 * simulator's own code already defaults a missing signal to `continue`; the schema
 * declared it required, so the provider threw before that branch could run — the
 * tolerance was written and then made unreachable.
 *
 * These tests pin both halves of the position: a missing field is recoverable, and
 * an empty answer is not.
 */

const { SIMULATOR_SCHEMA, generateNextMessage } = require('../persona-simulator');

const PERSONA = { personaId: 'p1', name: 'Tester', language: 'en', patience: 5, knowledgeLevel: 'symptom_only', cooperativeness: 'cooperative' };
const SCENARIO = { scenarioId: 's1', name: 'Extend a contract', userGoal: 'Extend my appointment' };
const HISTORY = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'how can I help?' }];

/** An LLM that answers with exactly the object given. */
const llmReturning = (data) => ({ structuredOutput: async () => ({ data, tokens: { input: 1, output: 1 } }) });

describe('the schema does not demand what the code can live without', () => {
  test('nothing is required — every field the model omits has a defined fallback', () => {
    expect(SIMULATOR_SCHEMA.required).toEqual([]);
  });

  test('a reply with no signal is read as `continue`, not thrown away', async () => {
    const out = await generateNextMessage(PERSONA, SCENARIO, HISTORY, { llm: llmReturning({ userMessage: 'I still need help' }) });

    expect(out.signal).toBe('continue');
    expect(out.userMessage).toBe('I still need help');
  });

  test('a choice with no message is a valid turn — the arena uses the option label', async () => {
    const out = await generateNextMessage(PERSONA, SCENARIO, HISTORY, {
      llm: llmReturning({ choiceIndex: 1 }),
      choices: [{ slotId: '__service__', value: 'X', label: 'Extension of Appointment' }],
    });

    expect(out.choiceIndex).toBe(1);
    expect(out.signal).toBe('continue');
  });

  test('a signal outside the enum falls back rather than propagating', async () => {
    const out = await generateNextMessage(PERSONA, SCENARIO, HISTORY, { llm: llmReturning({ userMessage: 'ok', signal: 'exploded' }) });
    expect(out.signal).toBe('continue');
  });

  test('a choice index nobody offered is not honoured', async () => {
    const out = await generateNextMessage(PERSONA, SCENARIO, HISTORY, { llm: llmReturning({ userMessage: 'ok', choiceIndex: 7 }), choices: [] });
    expect(out.choiceIndex).toBe(0);
  });
});

describe('…but silence is still a failure', () => {
  test('neither a message nor a choice fails loudly — a user who did nothing is not a turn', async () => {
    await expect(generateNextMessage(PERSONA, SCENARIO, HISTORY, { llm: llmReturning({ signal: 'continue' }) }))
      .rejects.toThrow(/neither a message nor a choice/);
  });

  test('a whitespace-only message counts as silence', async () => {
    await expect(generateNextMessage(PERSONA, SCENARIO, HISTORY, { llm: llmReturning({ userMessage: '   ' }) }))
      .rejects.toThrow(/neither a message nor a choice/);
  });
});
