'use strict';

/**
 * ClaudeSDKProvider — LLMProvider over the Claude Agent SDK
 * (`@anthropic-ai/claude-agent-sdk` query()). Production target for the chat.
 *
 * structuredOutput → forced tool_use; completion → query() text; embedding → TEI.
 * The SDK is lazily required so environments without it still load this module;
 * a clear error is thrown only when a method is actually called without a client.
 *
 * @module services/ai/llm-provider/providers/claude-sdk.provider
 */

const { embedViaTei } = require('../embedding');
const { validateSchema } = require('../structured-json');

const DEFAULT_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-5';
const STRUCT_TOOL = 'structured_output';

function defaultRunner() {
  let query;
  try { ({ query } = require('@anthropic-ai/claude-agent-sdk')); }
  catch { throw new Error('[claude-sdk] @anthropic-ai/claude-agent-sdk is not installed. Set LLM_PROVIDER=claude-code or install the SDK.'); }
  return query;
}

class ClaudeSDKProvider {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.model]
   * @param {Function} [opts.runner] - test seam: async (prompt, {system, tools, model}) => {text, toolInput?}
   */
  constructor(opts = {}) {
    this.id = 'claude-sdk';
    this._model = opts.model || DEFAULT_MODEL;
    this._runner = opts.runner || null;
  }

  async _run(prompt, cfg) {
    if (this._runner) return this._runner(prompt, cfg);
    const query = defaultRunner();
    // Collect the final text from the Agent SDK stream.
    let text = '';
    let toolInput;
    for await (const msg of query({ prompt, options: { model: cfg.model, maxTurns: 1, systemPrompt: cfg.system, allowedTools: cfg.tools ? [STRUCT_TOOL] : [] } })) {
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') text += block.text;
          if (block.type === 'tool_use' && block.name === STRUCT_TOOL) toolInput = block.input;
        }
      }
      if (msg.type === 'result' && typeof msg.result === 'string' && !text) text = msg.result;
    }
    return { text, toolInput };
  }

  async structuredOutput(prompt, schema, opts = {}) {
    const tool = { name: STRUCT_TOOL, description: schema.description || 'Return structured output per the schema', input_schema: schema };
    const { text, toolInput } = await this._run(prompt, { model: opts.model || this._model, tools: [tool], system: opts.system });
    const data = toolInput;
    if (!data) throw new Error('[claude-sdk] structuredOutput: no tool_use in response');
    const { valid, errors } = validateSchema(data, schema);
    if (!valid) throw new Error(`[claude-sdk] structuredOutput schema invalid: ${errors.join('; ')}`);
    return { data, raw: text || JSON.stringify(data), provider: this.id, tokens: 0 };
  }

  async completion(prompt, opts = {}) {
    const { text } = await this._run(prompt, { model: opts.model || this._model, system: opts.system });
    return { text, provider: this.id, tokens: 0 };
  }

  embedding(text) { return embedViaTei(text); }
}

module.exports = { ClaudeSDKProvider, DEFAULT_MODEL };
