'use strict';

/**
 * Unified LLMProvider factory (FlowDesk Chat V2 — Contract 4A, CODEX-RULE-073).
 *
 * The single entry point through which chat/interpreter code obtains an LLM
 * backend. Backend + model are switchable by config or env:
 *   LLM_PROVIDER = claude-code (default/dev) | claude-sdk (prod) | anthropic-api
 *   LLM_MODEL    = <model id/alias>
 *
 * Every provider honours the same interface: structuredOutput / completion /
 * embedding (embedding via shared TEI).
 *
 * @module services/ai/llm-provider
 */

const { ClaudeCodeProvider } = require('./providers/claude-code.provider');
const { ClaudeSDKProvider } = require('./providers/claude-sdk.provider');
const { AnthropicAPIProvider } = require('./providers/anthropic-api.provider');

const DEFAULT_PROVIDER = process.env.LLM_PROVIDER || 'claude-code';

const REGISTRY = {
  'claude-code': ClaudeCodeProvider,
  'claude-sdk': ClaudeSDKProvider,
  'anthropic-api': AnthropicAPIProvider,
};

/**
 * @param {Object} [config]
 * @param {'claude-code'|'claude-sdk'|'anthropic-api'} [config.provider]
 * @param {string} [config.model]
 * @param {Object} [config.opts] - provider-specific opts / test seams
 * @returns {{id, structuredOutput, completion, embedding}}
 */
function getLLMProvider(config = {}) {
  const providerId = config.provider || DEFAULT_PROVIDER;
  const Provider = REGISTRY[providerId];
  if (!Provider) {
    throw new Error(`[getLLMProvider] unknown provider '${providerId}'. Valid: ${Object.keys(REGISTRY).join(', ')}`);
  }
  return new Provider({ model: config.model, ...(config.opts || {}) });
}

/** List available provider ids. */
function listProviders() { return Object.keys(REGISTRY); }

module.exports = {
  getLLMProvider,
  listProviders,
  DEFAULT_PROVIDER,
  ClaudeCodeProvider,
  ClaudeSDKProvider,
  AnthropicAPIProvider,
};
