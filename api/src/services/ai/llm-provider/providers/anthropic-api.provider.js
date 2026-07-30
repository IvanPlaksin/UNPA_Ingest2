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
  // Cache accounting. `creation` is what it cost to write the prefix, `read` is
  // what was served from it — the two together are how a cache is judged, and
  // neither is visible in `input_tokens` (a cache read is billed separately and
  // does NOT appear there).
  const cacheCreationTokens = resp?.usage?.cache_creation_input_tokens || 0;
  const cacheReadTokens = resp?.usage?.cache_read_input_tokens || 0;
  return {
    tokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    ...(cacheCreationTokens || cacheReadTokens ? { cacheCreationTokens, cacheReadTokens } : {}),
    cost: costFor(model, inputTokens, outputTokens),
  };
}

/**
 * Mark the cacheable prefix of a request.
 *
 * Anthropic caches a PREFIX, in the order tools → system → messages, up to and
 * including the block carrying `cache_control`. So the marker has to go on the
 * last tool AND on the stable part of the system prompt: a marker on system
 * alone leaves the tools — 1,370 tokens of unchanging schema — outside it.
 *
 * The system prompt arrives split: everything stable first, then whatever varies.
 * For this chat the tail is the language instruction, 19 tokens against a 3,898
 * token prefix — cached together it would fragment one entry into six, one per
 * language, for nothing.
 */
function withCacheMarkers({ system, tools, messages }) {
  const mark = { type: 'ephemeral' };
  const blocks = Array.isArray(system)
    ? system.filter((b) => b && b.text)
    : (system ? [{ type: 'text', text: system }] : []);

  // THE CONVERSATION IS NOT MARKED, DELIBERATELY.
  //
  // An earlier version put a third marker on the last message, on the reasoning
  // that the cached prefix should grow with the turn. Measured over a 27-turn
  // live session it did the opposite: 146,126 tokens WRITTEN against 9,023 read.
  // Caching a prefix costs 1.25× to write, so that is worse than not caching at
  // all, and the reason is structural — this chat's history is not append-only.
  // The per-turn brief rides with the user's message and is then dropped, and
  // tool traffic never enters history at all, so the message list of turn N is
  // not a prefix of turn N+1: nothing after the first divergence can be read.
  //
  // What IS append-only and identical for every user, language and session is
  // the preamble, and since it is now padded past the 4,096-token floor
  // (agent-prompt.service) it caches on its own. One write, then a read at 10%
  // on every call after it.
  const msgs = messages;

  return {
    system: blocks.length
      ? blocks.map((b, i) => (i === 0 ? { type: 'text', text: b.text, cache_control: mark } : { type: 'text', text: b.text }))
      : undefined,
    tools: Array.isArray(tools) && tools.length
      ? tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: mark } : t))
      : undefined,
    messages: msgs,
  };
}

/**
 * Why a debug hook, for something that either works or does not.
 *
 * Because it does neither, visibly. A prefix below the provider's minimum is not
 * refused — the request succeeds, the markers are accepted, and the response
 * simply reports cache_creation 0. That is indistinguishable from a bug in the
 * marker placement, and it cost a full round of wrong diagnosis: the markers were
 * correct all along and the prefix was 200 tokens short. FLOWDESK_CACHE_DEBUG=1
 * prints what was marked and what the provider did with it, side by side.
 */
const traceCache = (what, value) => {
  if (process.env.FLOWDESK_CACHE_DEBUG === '1') {
    console.warn('[cache-debug] %s=%s', what, JSON.stringify(value || {}));
  }
};

/** An error that means the account/model/SDK will not take cache_control. */
const isCacheRejection = (err) => {
  const m = String((err && err.message) || '');
  return /cache_control|cache control|beta|unsupported|invalid_request/i.test(m);
};

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

  /**
   * Multi-turn tool use (EXP-002 agent interpreter).
   *
   * `structuredOutput` forces exactly one tool and returns its input; an agent
   * needs the opposite — many tools, the model choosing, and the conversation
   * carried across rounds. This is a thin passthrough to the Messages API that
   * keeps the provider seam intact, so the agent loop stays injectable and
   * testable with a fake rather than reaching for the SDK behind the abstraction.
   *
   * Returns the raw response (content blocks, stop_reason) plus priced usage.
   *
   * @param {{system?:string, messages:Array, tools?:Array, maxTokens?:number, temperature?:number, model?:string}} p
   */
  /**
   * @param {object} p
   * @param {string|Array<{text:string}>} [p.system] a string, or blocks ordered
   *   stable-first — only the first is cached when `cache` is on.
   * @param {boolean} [p.cache] opt in to prompt caching for this call.
   */
  async messages(p = {}) {
    const model = p.model || this._model;
    const base = {
      model,
      max_tokens: p.maxTokens || 4096,
      ...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
      messages: p.messages || [],
    };
    const plain = {
      ...base,
      ...(p.system ? { system: Array.isArray(p.system) ? p.system.map((b) => b.text).join('\n') : p.system } : {}),
      ...(Array.isArray(p.tools) && p.tools.length ? { tools: p.tools } : {}),
    };

    let resp;
    if (p.cache) {
      const marked = withCacheMarkers({ system: p.system, tools: p.tools, messages: base.messages });
      try {
        traceCache('markers', {
          systemBlocks: (marked.system || []).length,
          markedSystem: (marked.system || []).filter((b) => b.cache_control).length,
          tools: (marked.tools || []).length,
          markedTools: (marked.tools || []).filter((t) => t.cache_control).length,
        });
        resp = await this._c().messages.create({
          ...base,
          ...(marked.messages ? { messages: marked.messages } : {}),
          ...(marked.system ? { system: marked.system } : {}),
          ...(marked.tools ? { tools: marked.tools } : {}),
        });
      } catch (err) {
        // Caching is an optimisation, never a dependency: an account or model
        // that will not take the marker still gets its answer.
        if (!isCacheRejection(err)) throw err;
        console.warn('[anthropic-api] prompt caching rejected, retrying without:', err.message);
        resp = await this._c().messages.create(plain);
      }
    } else {
      resp = await this._c().messages.create(plain);
    }
    traceCache('usage', resp.usage);
    return {
      content: resp.content || [],
      stopReason: resp.stop_reason || null,
      provider: this.id,
      model,
      ...usageFields(model, resp),
    };
  }

  embedding(text) { return embedViaTei(text); }
}

module.exports = { AnthropicAPIProvider, DEFAULT_MODEL };
