'use strict';

/**
 * LLM pricing — canonical, stored per-model token prices for cost accounting.
 *
 * WHY: providers report cost inconsistently. The `claude-code` provider returns
 * `total_cost_usd` (cost, tokens:0); the `anthropic-api` provider returns token
 * usage but NO cost. Everywhere the FlowDesk Chat Admin displays "LLM cost"
 * (Overview KPI, LLM tab byModel/byDay, Sessions cost column, SessionDrawer
 * per-call, Tickets) it reads a stored `llmCostUsd` — which was 0 for every
 * anthropic-api turn, so the whole UI showed $0.0000. This module is the single
 * source of truth: given a model + token counts, compute the USD cost.
 *
 * Prices are USD per 1,000,000 tokens (Anthropic public pricing, 2026-07).
 * Override at runtime with FLOWDESK_LLM_PRICES_JSON (a JSON object keyed by the
 * same normalized model ids), e.g. to pin intro pricing or add a new model.
 *
 * @module services/ai/llm-pricing
 */

// USD per 1M tokens: { input, output }. Keys are normalized (lowercased, date
// and context-window suffixes stripped — see normalizeModel).
const PRICES_PER_MTOK = {
  // Opus tier
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
  'claude-opus-4-6': { input: 5.0, output: 25.0 },
  'claude-opus-4-5': { input: 5.0, output: 25.0 },
  'claude-opus-4-1': { input: 15.0, output: 75.0 },
  'claude-opus-4-0': { input: 15.0, output: 75.0 },
  // Sonnet tier
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-0': { input: 3.0, output: 15.0 },
  // Haiku tier (claude-haiku-4-5 is the active FlowDesk chat model)
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  // Fable / Mythos tier
  'claude-fable-5': { input: 10.0, output: 50.0 },
  'claude-mythos-5': { input: 10.0, output: 50.0 },
};

// Tier fallbacks by family keyword when an exact/prefixed key isn't found.
const TIER_FALLBACK = [
  { match: 'opus', price: { input: 5.0, output: 25.0 } },
  { match: 'sonnet', price: { input: 3.0, output: 15.0 } },
  { match: 'haiku', price: { input: 1.0, output: 5.0 } },
  { match: 'fable', price: { input: 10.0, output: 50.0 } },
  { match: 'mythos', price: { input: 10.0, output: 50.0 } },
];

// When only a combined token count is known (some providers don't split
// input/output), assume this share is output. Chat turns are input-heavy
// (system prompt + schema + history >> short replies), so ~25% output is a
// conservative middle estimate. Used only for the fallback path.
const DEFAULT_OUTPUT_SHARE = 0.25;

let _overrides = null;
function overrides() {
  if (_overrides !== null) return _overrides;
  _overrides = {};
  const raw = process.env.FLOWDESK_LLM_PRICES_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v.input === 'number' && typeof v.output === 'number') {
          _overrides[normalizeModel(k)] = { input: v.input, output: v.output };
        }
      }
    } catch { /* bad override JSON — ignore, use built-ins */ }
  }
  return _overrides;
}

/**
 * Normalize a model id to a pricing key: lowercase, drop a trailing dated
 * snapshot ("-20251001") and context-window markers ("[1m]", "-1m", "-fast").
 * @param {string} model
 * @returns {string}
 */
function normalizeModel(model) {
  if (!model) return '';
  let m = String(model).toLowerCase().trim();
  m = m.replace(/\[[^\]]*\]/g, '');           // strip "[1m]" etc.
  m = m.replace(/-\d{8}$/, '');                // strip "-20251001"
  m = m.replace(/-(fast|1m|latest)$/g, '');    // strip routing suffixes
  return m.trim();
}

/**
 * Resolve the per-1M price for a model. Exact key → prefix key → tier keyword.
 * @param {string} model
 * @returns {{input:number, output:number}|null}
 */
function priceFor(model) {
  const key = normalizeModel(model);
  if (!key) return null;
  const table = { ...PRICES_PER_MTOK, ...overrides() };
  if (table[key]) return table[key];
  // Prefix match: a known key that the (possibly longer) id starts with.
  const pref = Object.keys(table).find((k) => key.startsWith(k) || k.startsWith(key));
  if (pref) return table[pref];
  const tier = TIER_FALLBACK.find((t) => key.includes(t.match));
  return tier ? tier.price : null;
}

/**
 * Cost in USD for a call with known input/output token counts.
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number} USD (0 when the model is unknown)
 */
function costFor(model, inputTokens = 0, outputTokens = 0) {
  const p = priceFor(model);
  if (!p) return 0;
  return ((Number(inputTokens) || 0) * p.input + (Number(outputTokens) || 0) * p.output) / 1e6;
}

/**
 * Cost estimate when only the combined token count is known — splits by
 * DEFAULT_OUTPUT_SHARE. Use costFor() when input/output are separately known.
 * @param {string} model
 * @param {number} totalTokens
 * @returns {number} USD
 */
function costForCombined(model, totalTokens = 0) {
  const total = Number(totalTokens) || 0;
  if (!total) return 0;
  const out = Math.round(total * DEFAULT_OUTPUT_SHARE);
  return costFor(model, total - out, out);
}

module.exports = { costFor, costForCombined, priceFor, normalizeModel, PRICES_PER_MTOK, DEFAULT_OUTPUT_SHARE };
