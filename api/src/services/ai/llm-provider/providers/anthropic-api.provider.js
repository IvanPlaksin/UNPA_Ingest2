'use strict';

/**
 * AnthropicAPIProvider — LLMProvider over the Anthropic Messages API
 * (`@anthropic-ai/sdk`). Fallback / batch backend. Requires ANTHROPIC_API_KEY.
 *
 * structuredOutput → tool_use; completion → messages.create text; embedding → TEI.
 * The SDK client is lazily created so the module loads without the dependency;
 * a clear error surfaces only when a method is called without a client.
 *
 * @module services/ai/llm-provider/providers/anthropic-api.provider
 */

const { embedViaTei } = require('../embedding');
const { validateSchema } = require('../structured-json');
const { costFor } = require('../../llm-pricing');

/**
 * Build the { tokens, inputTokens, outputTokens, cost } usage fields from an
 * Anthropic Messages API response. The Messages API returns split token counts
 * but no cost, so we price them ourselves (see services/ai/llm-pricing).
 */
function usageFields(model, resp) {
  const inputTokens = resp?.usage?.input_tokens || 0;
  const outputTokens = resp?.usage?.output_tokens || 0;
  return {
    tokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    cost: costFor(model, inputTokens, outputTokens),
  };
}

const DEFAULT_MODEL = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-5-20250929';
const STRUCT_TOOL = 'structured_output';

function defaultClient() {
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); }
  catch { throw new Error('[anthropic-api] @anthropic-ai/sdk is not installed. Set LLM_PROVIDER=claude-code or install the SDK.'); }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('[anthropic-api] ANTHROPIC_API_KEY not configured.');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 3 });
}

class AnthropicAPIProvider {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.model]
   * @param {Object} [opts.client] - test seam: { messages: { create(params) } }
   */
  constructor(opts = {}) {
    this.id = 'anthropic-api';
    this._model = opts.model || DEFAULT_MODEL;
    this._client = opts.client || null;
  }

  _c() { return this._client || (this._client = defaultClient()); }

  async structuredOutput(prompt, schema, opts = {}) {
    const tool = { name: STRUCT_TOOL, description: schema.description || 'Return structured output per the schema', input_schema: schema };
    const model = opts.model || this._model;
    const resp = await this._c().messages.create({
      model,
      max_tokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.1,
      tools: [tool],
      tool_choice: { type: 'tool', name: STRUCT_TOOL },
      messages: [{ role: 'user', content: prompt }],
    });
    const block = (resp.content || []).find((b) => b.type === 'tool_use' && b.name === STRUCT_TOOL);
    if (!block) throw new Error('[anthropic-api] structuredOutput: no tool_use in response');
    const { valid, errors } = validateSchema(block.input, schema);
    if (!valid) throw new Error(`[anthropic-api] structuredOutput schema invalid: ${errors.join('; ')}`);
    return {
      data: block.input, raw: JSON.stringify(block.input), provider: this.id, model,
      ...usageFields(model, resp),
    };
  }

  async completion(prompt, opts = {}) {
    const model = opts.model || this._model;
    const resp = await this._c().messages.create({
      model,
      max_tokens: opts.maxTokens || 4096,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.stop ? { stop_sequences: opts.stop } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, provider: this.id, model, ...usageFields(model, resp) };
  }

  embedding(text) { return embedViaTei(text); }
}

module.exports = { AnthropicAPIProvider, DEFAULT_MODEL };
