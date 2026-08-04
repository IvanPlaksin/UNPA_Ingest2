'use strict';

/**
 * C0 test — unified LLMProvider.
 *
 * Each provider implements structuredOutput + completion + embedding via
 * injected transports (no live infra). Factory switching + error paths covered.
 */

const { getLLMProvider, listProviders } = require('..');
const { ClaudeCodeProvider } = require('../providers/claude-code.provider');
const { ClaudeSDKProvider } = require('../providers/claude-sdk.provider');
const { AnthropicAPIProvider } = require('../providers/anthropic-api.provider');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'confidence'],
  properties: {
    intent: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

describe('C0: factory + switching', () => {
  test('lists three providers', () => {
    expect(listProviders().sort()).toEqual(['anthropic-api', 'claude-code', 'claude-sdk']);
  });

  test('returns provider by id', () => {
    expect(getLLMProvider({ provider: 'claude-code' }).id).toBe('claude-code');
    expect(getLLMProvider({ provider: 'claude-sdk' }).id).toBe('claude-sdk');
    expect(getLLMProvider({ provider: 'anthropic-api' }).id).toBe('anthropic-api');
  });

  test('unknown provider throws', () => {
    expect(() => getLLMProvider({ provider: 'gpt' })).toThrow(/unknown provider/);
  });

  test('passes opts (test seams) through to the provider', async () => {
    const p = getLLMProvider({
      provider: 'claude-code',
      opts: { invokeImpl: async () => ({ text: 'hi', cost: 0 }) },
    });
    expect((await p.completion('x')).text).toBe('hi');
  });
});

describe('C0: ClaudeCodeProvider (injected CLI invoker)', () => {
  const embedImpl = async () => [0.1, 0.2, 0.3];

  test('completion returns text + provider tag', async () => {
    const p = new ClaudeCodeProvider({ invokeImpl: async ({ prompt }) => ({ text: `echo:${prompt}`, cost: 0.01 }), embedImpl });
    const r = await p.completion('ping');
    expect(r).toMatchObject({ text: 'echo:ping', provider: 'claude-code', cost: 0.01 });
  });

  test('structuredOutput validates JSON against schema', async () => {
    const p = new ClaudeCodeProvider({
      invokeImpl: async () => ({ text: '```json\n{"intent":"laptop","confidence":0.9}\n```', cost: 0 }),
      embedImpl,
    });
    const r = await p.structuredOutput('I need a laptop', SCHEMA);
    expect(r.data).toEqual({ intent: 'laptop', confidence: 0.9 });
    expect(r.provider).toBe('claude-code');
  });

  test('structuredOutput retries then fails on unparseable/invalid output', async () => {
    let calls = 0;
    const p = new ClaudeCodeProvider({
      maxRetries: 1,
      invokeImpl: async () => { calls++; return { text: 'not json at all', cost: 0 }; },
      embedImpl,
    });
    await expect(p.structuredOutput('x', SCHEMA)).rejects.toThrow(/structuredOutput failed/);
    expect(calls).toBe(2); // maxRetries(1) + 1
  });

  test('structuredOutput rejects schema-invalid JSON', async () => {
    const p = new ClaudeCodeProvider({
      maxRetries: 0,
      invokeImpl: async () => ({ text: '{"intent":"x","confidence":5}', cost: 0 }), // confidence > 1
      embedImpl,
    });
    await expect(p.structuredOutput('x', SCHEMA)).rejects.toThrow(/schema validation failed/);
  });

  test('embedding delegates to injected impl', async () => {
    const p = new ClaudeCodeProvider({ invokeImpl: async () => ({ text: '', cost: 0 }), embedImpl });
    expect(await p.embedding('hello')).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('C0: ClaudeSDKProvider (injected runner)', () => {
  test('structuredOutput extracts tool_use input', async () => {
    const p = new ClaudeSDKProvider({
      runner: async (_prompt, cfg) => {
        expect(cfg.tools).toBeTruthy();
        return { text: '', toolInput: { intent: 'badge', confidence: 0.8 } };
      },
    });
    const r = await p.structuredOutput('access badge', SCHEMA);
    expect(r.data).toEqual({ intent: 'badge', confidence: 0.8 });
    expect(r.provider).toBe('claude-sdk');
  });

  test('completion returns text', async () => {
    const p = new ClaudeSDKProvider({ runner: async () => ({ text: 'a question?' }) });
    expect((await p.completion('plan')).text).toBe('a question?');
  });

  test('structuredOutput throws when no tool_use returned', async () => {
    const p = new ClaudeSDKProvider({ runner: async () => ({ text: 'chatty', toolInput: undefined }) });
    await expect(p.structuredOutput('x', SCHEMA)).rejects.toThrow(/no tool_use/);
  });

  test('default runner errors clearly when SDK absent', async () => {
    const p = new ClaudeSDKProvider();
    await expect(p.completion('x')).rejects.toThrow(/@anthropic-ai\/claude-agent-sdk is not installed/);
  });
});

describe('C0: AnthropicAPIProvider (injected client)', () => {
  const mkClient = (content, usage = { input_tokens: 3, output_tokens: 4 }) => ({
    messages: { create: async () => ({ content, usage }) },
  });

  test('structuredOutput extracts tool_use input', async () => {
    const client = mkClient([{ type: 'tool_use', name: 'structured_output', input: { intent: 'workspace', confidence: 0.7 } }]);
    const p = new AnthropicAPIProvider({ client });
    const r = await p.structuredOutput('desk', SCHEMA);
    expect(r.data).toEqual({ intent: 'workspace', confidence: 0.7 });
    expect(r.tokens).toBe(7);
  });

  test('completion joins text blocks', async () => {
    const client = mkClient([{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }]);
    const p = new AnthropicAPIProvider({ client });
    expect((await p.completion('x')).text).toBe('hello world');
  });

  test('prices usage: returns cost + split tokens (Haiku 4.5 rates)', async () => {
    // 1M input @ $1/M + 1M output @ $5/M = $6.00
    const client = mkClient([{ type: 'text', text: 'ok' }], { input_tokens: 1e6, output_tokens: 1e6 });
    const p = new AnthropicAPIProvider({ client, model: 'claude-haiku-4-5-20251001' });
    const r = await p.completion('x');
    expect(r.model).toBe('claude-haiku-4-5-20251001');
    expect(r.inputTokens).toBe(1e6);
    expect(r.outputTokens).toBe(1e6);
    expect(r.tokens).toBe(2e6);
    expect(r.cost).toBeCloseTo(6.0, 6);
  });

  test('default client errors clearly when SDK/key absent', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const p = new AnthropicAPIProvider();
    await expect(p.completion('x')).rejects.toThrow(/not installed|not configured/);
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });
});

/**
 * DOC-0-001 — the turn that can carry a file.
 *
 * The assertions worth having are about the REQUEST, not the reply: a document
 * that arrives after the question, or as a `system` block, still returns text,
 * so a test that only checks the answer passes while extraction quietly gets
 * worse. Each case below captures what was sent and asserts on that.
 */
describe('DOC-0-001: AnthropicAPIProvider.completionWithContent', () => {
  /** Captures the request so the test can assert on what the API was asked. */
  const mkSpy = (content = [{ type: 'text', text: 'ok' }], usage = { input_tokens: 5, output_tokens: 2 }) => {
    const sent = [];
    return {
      sent,
      client: { messages: { create: async (params) => { sent.push(params); return { content, usage }; } } },
    };
  };

  const PDF_BLOCK = {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' },
  };
  const ASK = { type: 'text', text: 'Extract the beneficiary.' };

  test('sends the blocks verbatim as ONE user turn', async () => {
    const { sent, client } = mkSpy();
    const p = new AnthropicAPIProvider({ client });
    await p.completionWithContent([PDF_BLOCK, ASK]);

    expect(sent).toHaveLength(1);
    expect(sent[0].messages).toEqual([{ role: 'user', content: [PDF_BLOCK, ASK] }]);
  });

  test('preserves block order — the document reaches the model before the question', async () => {
    const { sent, client } = mkSpy();
    const p = new AnthropicAPIProvider({ client });
    await p.completionWithContent([PDF_BLOCK, ASK]);

    const types = sent[0].messages[0].content.map((b) => b.type);
    expect(types).toEqual(['document', 'text']);
  });

  test('system rides as its own parameter, never as a content block', async () => {
    const { sent, client } = mkSpy();
    const p = new AnthropicAPIProvider({ client });
    await p.completionWithContent([PDF_BLOCK, ASK], { system: 'You extract form fields.' });

    expect(sent[0].system).toBe('You extract form fields.');
    expect(sent[0].messages[0].content).not.toContainEqual(
      expect.objectContaining({ text: 'You extract form fields.' }),
    );
  });

  test('joins text blocks of the reply and prices the turn (Haiku 4.5 rates)', async () => {
    // 1M input @ $1/M + 1M output @ $5/M = $6.00
    const { client } = mkSpy(
      [{ type: 'text', text: '{"beneficiary":' }, { type: 'text', text: '"I. Plaksin"}' }],
      { input_tokens: 1e6, output_tokens: 1e6 },
    );
    const p = new AnthropicAPIProvider({ client, model: 'claude-haiku-4-5-20251001' });
    const r = await p.completionWithContent([PDF_BLOCK, ASK]);

    expect(r.text).toBe('{"beneficiary":"I. Plaksin"}');
    expect(r.provider).toBe('anthropic-api');
    expect(r.model).toBe('claude-haiku-4-5-20251001');
    expect(r.cost).toBeCloseTo(6.0, 6);
  });

  test('opts override model and max_tokens; extraction is not stuck on the chat model', async () => {
    const { sent, client } = mkSpy();
    const p = new AnthropicAPIProvider({ client, model: 'claude-haiku-4-5-20251001' });
    await p.completionWithContent([PDF_BLOCK, ASK], { model: 'claude-sonnet-5', maxTokens: 2048 });

    expect(sent[0].model).toBe('claude-sonnet-5');
    expect(sent[0].max_tokens).toBe(2048);
  });

  test('temperature is omitted unless asked for', async () => {
    const { sent, client } = mkSpy();
    const p = new AnthropicAPIProvider({ client });
    await p.completionWithContent([PDF_BLOCK, ASK]);
    expect(sent[0]).not.toHaveProperty('temperature');

    await p.completionWithContent([PDF_BLOCK, ASK], { temperature: 0 });
    expect(sent[1].temperature).toBe(0);
  });

  test('rejects a missing or empty block list rather than sending an empty turn', async () => {
    const { sent, client } = mkSpy();
    const p = new AnthropicAPIProvider({ client });

    await expect(p.completionWithContent([])).rejects.toThrow(/non-empty array of blocks/);
    await expect(p.completionWithContent()).rejects.toThrow(/non-empty array of blocks/);
    await expect(p.completionWithContent('a prompt')).rejects.toThrow(/non-empty array of blocks/);
    expect(sent).toHaveLength(0);
  });

  test('completion(string) still works — the existing path is untouched', async () => {
    const { sent, client } = mkSpy([{ type: 'text', text: 'plain' }]);
    const p = new AnthropicAPIProvider({ client });

    expect((await p.completion('x')).text).toBe('plain');
    expect(sent[0].messages).toEqual([{ role: 'user', content: 'x' }]);
  });
});
