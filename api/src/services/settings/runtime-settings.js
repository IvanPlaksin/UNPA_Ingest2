'use strict';

/**
 * Runtime settings — small in-memory store for operator-tunable values that the UI
 * can read/write at runtime (survives within a process; env provides the default).
 *
 * Currently: the LLM provider used for structured generation (SDA / StructuredOutputService).
 *
 * @module services/settings/runtime-settings
 */

const LLM_PROVIDER_OPTIONS = ['claude-code', 'gemini', 'anthropic', 'ollama'];

let _llmProvider = process.env.STRUCTURED_OUTPUT_PROVIDER || 'claude-code';

module.exports = {
  LLM_PROVIDER_OPTIONS,

  /** @returns {string} current structured-output LLM provider */
  getLlmProvider() {
    return _llmProvider;
  },

  /**
   * @param {string} provider - one of LLM_PROVIDER_OPTIONS
   * @returns {string} the applied provider
   * @throws {Error} on invalid provider
   */
  setLlmProvider(provider) {
    if (!LLM_PROVIDER_OPTIONS.includes(provider)) {
      throw new Error(`Invalid provider '${provider}'. Allowed: ${LLM_PROVIDER_OPTIONS.join(', ')}`);
    }
    _llmProvider = provider;
    // Keep env in sync so newly-constructed services pick it up too.
    process.env.STRUCTURED_OUTPUT_PROVIDER = provider;
    return _llmProvider;
  },
};
