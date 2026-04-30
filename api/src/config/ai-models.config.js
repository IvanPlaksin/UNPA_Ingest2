/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MODELS CONFIGURATION
 * Configuration for AI providers: Google Gemini, Anthropic Claude, Meta Llama
 * Updated: January 2026 - Production paid versions
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// PROVIDER CONFIGURATIONS
// ────────────────────────────────────────────────────────────────────────────

const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnv: 'GEMINI_API_KEY',
    supportsTools: true,
    supportsStreaming: true,
  },
  anthropic: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    supportsTools: true,
    supportsStreaming: true,
  },
  ollama: {
    name: 'Meta Llama (Local)',
    baseUrl: process.env.OLLAMA_API_BASE || 'http://localhost:11434/v1',
    apiKeyEnv: null, // No API key needed for local
    supportsTools: true,
    supportsStreaming: true,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// MODEL DEFINITIONS
// ────────────────────────────────────────────────────────────────────────────

const AI_MODELS = {
  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE GEMINI MODELS
  // ═══════════════════════════════════════════════════════════════════════════

  'gemini-pro-latest': {
    id: 'gemini-pro-latest',
    provider: 'gemini',
    displayName: 'Gemini Pro (Latest)',
    description: 'Latest Gemini Pro - always up to date',
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    isDefault: true,
    tier: 'recommended',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTHROPIC CLAUDE MODELS (4.6 Series)
  // ═══════════════════════════════════════════════════════════════════════════

  'claude-opus-4-6': {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6',
    description: 'Latest and most capable Claude model — agentic coding, 200K context (1M beta)',
    maxTokens: 128000,
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'premium',
  },
  'claude-opus-4-6-fast': {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6 Fast',
    description: 'Same Opus 4.6 intelligence with 2.5x faster output (research preview)',
    maxTokens: 128000,
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'premium',
    fast: true, // Enables speed: "fast" + beta header
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTHROPIC CLAUDE MODELS (4.5 Series)
  // ═══════════════════════════════════════════════════════════════════════════

  'claude-opus-4-5-20251101': {
    id: 'claude-opus-4-5-20251101',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    description: 'Most capable Claude 4.5 model for complex tasks',
    maxTokens: 16384,
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'premium',
  },
  'claude-sonnet-4-20250514': {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    description: 'Best balance of intelligence and speed',
    maxTokens: 16384,
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'recommended',
  },
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    description: 'Fastest Claude model for quick tasks',
    maxTokens: 8192,
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'standard',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // META LLAMA MODELS (via Ollama - Local)
  // ═══════════════════════════════════════════════════════════════════════════

  'llama3.3:70b': {
    id: 'llama3.3:70b',
    provider: 'ollama',
    displayName: 'Llama 3.3 70B (Local)',
    description: 'Meta Llama 3.3 with strong function calling',
    maxTokens: 4096,
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'local',
  },
  'llama3.2:latest': {
    id: 'llama3.2:latest',
    provider: 'ollama',
    displayName: 'Llama 3.2 (Local)',
    description: 'Efficient Llama with vision support',
    maxTokens: 4096,
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'local',
  },
  'llama3.1:8b': {
    id: 'llama3.1:8b',
    provider: 'ollama',
    displayName: 'Llama 3.1 8B (Local)',
    description: 'Lightweight Llama for fast local inference',
    maxTokens: 4096,
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    tier: 'local',
  },
};

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get default model ID
 */
function getDefaultModelId() {
  const defaultModel = Object.values(AI_MODELS).find(m => m.isDefault);
  return defaultModel?.id || 'gemini-pro-latest';
}

/**
 * Get model by ID
 */
function getModel(modelId) {
  return AI_MODELS[modelId] || null;
}

/**
 * Get provider for a model
 */
function getProviderForModel(modelId) {
  const model = getModel(modelId);
  if (!model) return null;
  return AI_PROVIDERS[model.provider] || null;
}

/**
 * Get all available models grouped by provider
 */
function getAvailableModels() {
  const grouped = {};

  for (const [id, model] of Object.entries(AI_MODELS)) {
    const provider = model.provider;
    if (!grouped[provider]) {
      grouped[provider] = {
        ...AI_PROVIDERS[provider],
        models: [],
      };
    }
    grouped[provider].models.push({
      id,
      ...model,
    });
  }

  return grouped;
}

/**
 * Get flat list of all models
 */
function getAllModels() {
  return Object.entries(AI_MODELS).map(([id, model]) => ({
    id,
    ...model,
    providerInfo: AI_PROVIDERS[model.provider],
  }));
}

/**
 * Check if provider has valid API key
 */
function hasValidApiKey(providerId) {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) return false;
  if (!provider.apiKeyEnv) return true; // No key needed (e.g., Ollama)
  return !!process.env[provider.apiKeyEnv];
}

/**
 * Get API key for provider
 */
function getApiKey(providerId) {
  const provider = AI_PROVIDERS[providerId];
  if (!provider || !provider.apiKeyEnv) return null;
  return process.env[provider.apiKeyEnv];
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  AI_PROVIDERS,
  AI_MODELS,
  getDefaultModelId,
  getModel,
  getProviderForModel,
  getAvailableModels,
  getAllModels,
  hasValidApiKey,
  getApiKey,
};
