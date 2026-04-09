/**
 * LLM Provider Manager
 * Manages multi-provider LLM access with automatic fallback
 *
 * @module services/extraction/llm-provider
 */

'use strict';

const { getProviders, getProvider } = require('./providers');

// Lazy load tensor service
let _tensorService = null;
function getTensorServiceLazy() {
    if (!_tensorService) {
        try {
            const { getTensorService } = require('../tensor.service');
            _tensorService = getTensorService();
        } catch (e) { /* tensor service not available */ }
    }
    return _tensorService;
}

// State
let activeProvider = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

/**
 * Select best available provider
 * @param {boolean} forceCheck - Force health check
 * @returns {Promise<{name: string, provider: Object}|null>}
 */
async function selectProvider(forceCheck = false) {
  const now = Date.now();

  // Return cached if valid
  if (!forceCheck && activeProvider && (now - lastHealthCheck) < HEALTH_CHECK_INTERVAL) {
    return activeProvider;
  }

  const providers = getProviders();

  for (const { name, provider } of providers) {
    try {
      const available = await provider.isAvailable();
      if (available) {
        console.log(`[LLM Provider] Selected: ${name}`);
        activeProvider = { name, provider };
        lastHealthCheck = now;
        return activeProvider;
      }
    } catch (err) {
      console.warn(`[LLM Provider] ${name} check failed:`, err.message);
    }
  }

  console.warn('[LLM Provider] No LLM available, using regex-only mode');
  activeProvider = null;
  return null;
}

/**
 * Extract entities using best available LLM
 * @param {string} text - Text to analyze
 * @param {Object} options - Extraction options
 * @param {string} [options.provider] - Preferred provider (ollama, gemini, anthropic)
 * @param {string} [options.model] - Specific model to use
 * @param {string} [options.parentTensorId] - Parent tensor for causal chain
 * @returns {Promise<{entities: Array, relationships: Array, provider: string}>}
 */
async function extractEntitiesWithLLM(text, options = {}) {
  const tensorService = getTensorServiceLazy();
  const tensor = tensorService?.start('ai.extraction.llm', {
    textLength: text?.length || 0,
    requestedProvider: options.provider || 'auto',
    requestedModel: options.model || 'default'
  }, options.parentTensorId);

  // Skip LLM for very short text
  if (!text || text.length < 50) {
    tensorService?.complete(tensor?.id, { skipped: true, reason: 'text_too_short' });
    return { entities: [], relationships: [], provider: 'none' };
  }

  let selected;

  // If specific provider requested, try to use it
  if (options.provider) {
    const requestedProvider = getProvider(options.provider);
    if (requestedProvider) {
      try {
        const available = await requestedProvider.isAvailable();
        if (available) {
          selected = { name: options.provider, provider: requestedProvider };
          console.log(`[LLM Provider] Using requested provider: ${options.provider}`);
        }
      } catch (err) {
        console.warn(`[LLM Provider] Requested provider ${options.provider} not available:`, err.message);
      }
    }
  }

  // Fallback to auto-select if requested not available
  if (!selected) {
    selected = await selectProvider();
  }

  if (!selected) {
    tensorService?.complete(tensor?.id, { skipped: true, reason: 'no_provider' });
    return { entities: [], relationships: [], provider: 'none' };
  }

  try {
    // Pass model option to provider
    const providerOptions = { ...options };
    if (options.model) {
      providerOptions.model = options.model;
    }

    const result = await selected.provider.extractEntities(text, providerOptions);

    tensorService?.complete(tensor?.id, {
      provider: selected.name,
      entityCount: result.entities?.length || 0,
      relationshipCount: result.relationships?.length || 0
    });

    return {
      entities: result.entities || [],
      relationships: result.relationships || [],
      provider: selected.name,
      model: options.model || 'default'
    };
  } catch (err) {
    console.error(`[LLM Provider] ${selected.name} extraction failed:`, err.message);

    // Invalidate current provider and try next
    activeProvider = null;

    // Try to find another provider
    const fallback = await selectProvider(true);
    if (fallback && fallback.name !== selected.name) {
      console.log(`[LLM Provider] Falling back to ${fallback.name}`);
      try {
        // Don't pass the original model to fallback provider - use its default model
        const fallbackOptions = { ...options };
        delete fallbackOptions.model; // Remove model to use fallback provider's default

        const result = await fallback.provider.extractEntities(text, fallbackOptions);

        tensorService?.complete(tensor?.id, {
          provider: fallback.name,
          fallbackUsed: true,
          originalProvider: selected.name,
          entityCount: result.entities?.length || 0
        });

        return {
          entities: result.entities || [],
          relationships: result.relationships || [],
          provider: fallback.name
        };
      } catch (fallbackErr) {
        console.error(`[LLM Provider] Fallback ${fallback.name} also failed:`, fallbackErr.message);
      }
    }

    tensorService?.fail(tensor?.id, err);
    return { entities: [], relationships: [], provider: 'none' };
  }
}

/**
 * Check if any LLM is available
 * @returns {Promise<boolean>}
 */
async function isLLMAvailable() {
  const selected = await selectProvider();
  return selected !== null;
}

/**
 * Get current active provider name
 * @returns {string}
 */
function getActiveProviderName() {
  return activeProvider?.name || 'none';
}

/**
 * Force select specific provider
 * @param {string} name - Provider name
 * @returns {Promise<boolean>} Success
 */
async function forceProvider(name) {
  const provider = getProvider(name);
  if (!provider) {
    console.warn(`[LLM Provider] Unknown provider: ${name}`);
    return false;
  }

  const available = await provider.isAvailable();
  if (!available) {
    console.warn(`[LLM Provider] ${name} not available`);
    return false;
  }

  activeProvider = { name, provider };
  lastHealthCheck = Date.now();
  console.log(`[LLM Provider] Forced: ${name}`);
  return true;
}

/**
 * Reset provider state (for testing)
 */
function reset() {
  activeProvider = null;
  lastHealthCheck = 0;
}

/**
 * Get provider status
 * @returns {Promise<Object>}
 */
async function getStatus() {
  const providers = getProviders();
  const status = {
    active: activeProvider?.name || 'none',
    lastCheck: lastHealthCheck ? new Date(lastHealthCheck).toISOString() : null,
    providers: {}
  };

  for (const { name, provider } of providers) {
    try {
      status.providers[name] = await provider.isAvailable();
    } catch {
      status.providers[name] = false;
    }
  }

  return status;
}

module.exports = {
  selectProvider,
  extractEntitiesWithLLM,
  isLLMAvailable,
  getActiveProviderName,
  forceProvider,
  reset,
  getStatus
};
