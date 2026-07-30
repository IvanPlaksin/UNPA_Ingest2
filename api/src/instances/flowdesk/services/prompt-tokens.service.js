'use strict';

/**
 * How many tokens the prompt an operator is editing will actually cost.
 *
 * The editor shows a compiled prompt; the number that matters about it is its
 * length in TOKENS, because that is what every turn pays and what decides whether
 * the cacheable prefix clears the provider's floor (measured at ~4.5k on
 * claude-haiku-4-5 — under it, caching silently does nothing).
 *
 * EXACT WHEN IT CAN BE, ESTIMATED WHEN IT CANNOT, AND ALWAYS SAYS WHICH. The exact
 * count comes from the provider's own tokenizer (`messages.countTokens`), which
 * needs a key and a round trip. Without one — offline, no key, provider down — the
 * count falls back to the chars-per-token ratio measured on this very prompt (4.3),
 * and the caller is told it is an estimate. A number presented as exact when it is
 * a guess is worse than a labelled guess: the cache floor is a cliff, and someone
 * will trim a prompt to just above it.
 *
 * @module instances/flowdesk/services/prompt-tokens.service
 */

/** Measured against the real tokenizer on this prompt family. */
const CHARS_PER_TOKEN = 4.3;

const CACHE_MS = 60 * 1000;
const cache = new Map(); // text hash -> {at, value}

const hash = (s) => require('crypto').createHash('sha1').update(String(s)).digest('hex');

const estimate = (text) => ({
  tokens: Math.round(String(text || '').length / CHARS_PER_TOKEN),
  exact: false,
  note: 'estimated at 4.3 characters per token — no provider tokenizer available',
});

/**
 * @param {string} text  the compiled prompt
 * @param {{model?: string, timeoutMs?: number}} [opts]
 * @returns {Promise<{tokens:number, exact:boolean, note?:string}>}
 */
async function countPromptTokens(text, opts = {}) {
  const body = String(text || '');
  if (!body) return { tokens: 0, exact: true };

  const key = hash(body);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  if (!process.env.ANTHROPIC_API_KEY) return estimate(body);

  let value;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const model = opts.model || process.env.FLOWDESK_LLM_MODEL || 'claude-haiku-4-5-20251001';
    const res = await Promise.race([
      client.messages.countTokens({ model, system: [{ type: 'text', text: body }], messages: [{ role: 'user', content: 'x' }] }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), opts.timeoutMs || 4000)),
    ]);
    // The single-character user turn and the request envelope are counted too; they
    // are a handful of tokens and subtracting a guess would make the number less
    // honest, not more. Reported as the prompt's cost in a real request.
    value = { tokens: res.input_tokens, exact: true, model };
  } catch {
    value = estimate(body);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

module.exports = { countPromptTokens, CHARS_PER_TOKEN };
