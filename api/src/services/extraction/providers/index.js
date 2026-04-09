/**
 * LLM Provider Registry
 * @module services/extraction/providers
 */

'use strict';

const ollamaProvider = require('./ollama.provider');
const geminiProvider = require('./gemini.provider');
const claudeProvider = require('./claude.provider');

/**
 * Registered providers with priority
 * Lower priority = higher preference
 * Default order: Ollama (local) -> Claude -> Gemini
 */
const PROVIDERS = [
  { name: 'ollama', provider: ollamaProvider, priority: 1, description: 'Local Ollama (llama3)', type: 'local', aliases: ['local'] },
  { name: 'claude', provider: claudeProvider, priority: 2, description: 'Claude Sonnet 4', type: 'cloud', aliases: ['anthropic'] },
  { name: 'gemini', provider: geminiProvider, priority: 3, description: 'Gemini 2.0 Flash', type: 'cloud', aliases: ['google'] },
];

/**
 * Provider name aliases (for compatibility with different naming conventions)
 * Maps alternative names to canonical provider names
 */
const PROVIDER_ALIASES = {
  'anthropic': 'claude',
  'google': 'gemini',
  'local': 'ollama'
};

/**
 * Get all registered providers sorted by priority
 * @returns {Array} Sorted providers
 */
function getProviders() {
  return [...PROVIDERS].sort((a, b) => a.priority - b.priority);
}

/**
 * Get provider by name (supports aliases like 'anthropic' -> 'claude')
 * @param {string} name - Provider name or alias
 * @returns {Object|null} Provider or null
 */
function getProvider(name) {
  if (!name) return null;

  // Normalize name to lowercase
  const normalizedName = name.toLowerCase();

  // Check if it's an alias and resolve to canonical name
  const canonicalName = PROVIDER_ALIASES[normalizedName] || normalizedName;

  const entry = PROVIDERS.find(p => p.name === canonicalName);
  return entry?.provider || null;
}

/**
 * Get available provider names
 * @returns {Array<string>} Provider names
 */
function getProviderNames() {
  return PROVIDERS.map(p => p.name);
}

/**
 * Get provider metadata (for UI)
 * @returns {Array} Provider metadata without implementations
 */
function getProviderMeta() {
  return PROVIDERS.map(p => ({
    name: p.name,
    description: p.description,
    type: p.type,
    priority: p.priority
  }));
}

/**
 * Check all providers availability
 * @returns {Promise<Object>} Status of each provider
 */
async function checkAllProviders() {
  const results = {};
  for (const { name, provider } of PROVIDERS) {
    try {
      results[name] = await provider.isAvailable();
    } catch (err) {
      results[name] = false;
    }
  }
  return results;
}

module.exports = {
  PROVIDERS,
  getProviders,
  getProvider,
  getProviderNames,
  getProviderMeta,
  checkAllProviders,
  ollamaProvider,
  geminiProvider,
  claudeProvider
};
