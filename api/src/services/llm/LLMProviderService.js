'use strict';

/**
 * LLM Provider Abstraction Layer
 *
 * Supports: Anthropic (direct API), Azure AI Foundry
 * Select via LLM_PROVIDER env var: 'anthropic' | 'azure'
 *
 * Unified interface:
 *   chat(messages, options)   → { content, model, usage }
 *   stream(messages, options) → AsyncIterable<event>
 */

const ANTHROPIC_MODELS = {
  sonnet: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-20250514',
  opus:   process.env.ANTHROPIC_MODEL_OPUS   || 'claude-opus-4-5',
  haiku:  process.env.ANTHROPIC_MODEL_HAIKU  || 'claude-haiku-4-5-20251001',
};

const AZURE_MODELS = {
  sonnet: process.env.AZURE_MODEL_SONNET || 'claude-sonnet-4-20250514',
  opus:   process.env.AZURE_MODEL_OPUS   || 'claude-opus-4-5',
  haiku:  process.env.AZURE_MODEL_HAIKU  || 'claude-haiku-4-5',
};

// ─── Anthropic Provider ────────────────────────────────────────────────────

class AnthropicProvider {
  constructor() {
    const Anthropic = require('@anthropic-ai/sdk');
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 3,
    });
    this.models = ANTHROPIC_MODELS;
    this.type = 'anthropic';
  }

  resolveModel(modelAlias) {
    return this.models[modelAlias] || modelAlias || this.models.sonnet;
  }

  /**
   * Non-streaming chat completion.
   * @param {Array} messages - [{ role, content }]
   * @param {Object} options - { model, maxTokens, system, tools, temperature }
   * @returns {Promise<{ content, model, usage, stopReason }>}
   */
  async chat(messages, options = {}) {
    const { model, maxTokens = 4096, system, tools, temperature, betaHeader, speed } = options;
    const params = {
      model: this.resolveModel(model),
      max_tokens: maxTokens,
      messages,
    };
    if (system) params.system = system;
    if (tools?.length) params.tools = tools;
    if (temperature !== undefined) params.temperature = temperature;
    if (speed) params.speed = speed;

    const requestOptions = {};
    if (betaHeader) requestOptions.headers = { 'anthropic-beta': betaHeader };

    const response = await this.client.messages.create(params, requestOptions);
    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
      stopReason: response.stop_reason,
      stop_reason: response.stop_reason,
    };
  }

  /**
   * Streaming chat. Returns Anthropic stream object (AsyncIterable).
   * @param {Array} messages
   * @param {Object} options
   * @returns {Stream}
   */
  stream(messages, options = {}) {
    const { model, maxTokens = 4096, system, tools, temperature } = options;
    const params = {
      model: this.resolveModel(model),
      max_tokens: maxTokens,
      messages,
      stream: true,
    };
    if (system) params.system = system;
    if (tools?.length) params.tools = tools;
    if (temperature !== undefined) params.temperature = temperature;

    return this.client.messages.stream(params);
  }
}

// ─── Azure AI Foundry Provider ─────────────────────────────────────────────

class AzureAIFoundryProvider {
  constructor() {
    this.endpoint = process.env.AZURE_AI_ENDPOINT;
    this.apiKey = process.env.AZURE_AI_KEY;
    this.models = AZURE_MODELS;
    this.type = 'azure';

    if (!this.endpoint || !this.apiKey) {
      throw new Error('AzureAIFoundryProvider requires AZURE_AI_ENDPOINT and AZURE_AI_KEY');
    }
  }

  resolveModel(modelAlias) {
    return this.models[modelAlias] || modelAlias || this.models.sonnet;
  }

  _buildUrl(model) {
    // Azure AI Foundry endpoint format:
    // https://<resource>.services.ai.azure.com/models/<model>/chat/completions
    const baseUrl = this.endpoint.replace(/\/$/, '');
    return `${baseUrl}/models/${model}/chat/completions?api-version=2024-12-01-preview`;
  }

  _buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  /**
   * Non-streaming chat completion via Azure AI Foundry.
   */
  async chat(messages, options = {}) {
    const { model, maxTokens = 4096, system, tools, temperature } = options;
    const resolvedModel = this.resolveModel(model);

    const body = {
      model: resolvedModel,
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;
    if (tools?.length) body.tools = tools;
    if (temperature !== undefined) body.temperature = temperature;

    const resp = await fetch(this._buildUrl(resolvedModel), {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Azure AI Foundry error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return {
      content: data.content,
      model: data.model,
      usage: data.usage,
      stopReason: data.stop_reason,
      stop_reason: data.stop_reason,
    };
  }

  /**
   * Streaming via Azure AI Foundry — returns AsyncIterable of SSE events.
   * TODO: Verify Azure streaming format matches Anthropic SDK stream format.
   */
  async *stream(messages, options = {}) {
    const { model, maxTokens = 4096, system, tools, temperature } = options;
    const resolvedModel = this.resolveModel(model);

    const body = {
      model: resolvedModel,
      max_tokens: maxTokens,
      messages,
      stream: true,
    };
    if (system) body.system = system;
    if (tools?.length) body.tools = tools;
    if (temperature !== undefined) body.temperature = temperature;

    const resp = await fetch(this._buildUrl(resolvedModel), {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Azure AI Foundry stream error ${resp.status}: ${err}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data);
          } catch {}
        }
      }
    }
  }
}

// ─── Factory & Singleton ───────────────────────────────────────────────────

class LLMProviderService {
  constructor() {
    this.provider = this._createProvider();
  }

  _createProvider() {
    const providerType = process.env.LLM_PROVIDER || 'anthropic';
    switch (providerType) {
      case 'azure':
        return new AzureAIFoundryProvider();
      case 'anthropic':
      default:
        return new AnthropicProvider();
    }
  }

  get type() { return this.provider.type; }
  get models() { return this.provider.models; }

  chat(messages, options = {}) { return this.provider.chat(messages, options); }
  stream(messages, options = {}) { return this.provider.stream(messages, options); }
  resolveModel(alias) { return this.provider.resolveModel(alias); }
}

let _instance = null;

function getInstance() {
  if (!_instance) _instance = new LLMProviderService();
  return _instance;
}

module.exports = { LLMProviderService, AnthropicProvider, AzureAIFoundryProvider, getInstance };
