import { LLMProvider, LLMCapabilities } from './llm-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('llama-provider');

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

interface OllamaEmbedResponse {
  embedding: number[];
}

export class LlamaProvider implements LLMProvider {
  name = 'llama';
  private baseUrl: string;
  private model: string;
  private available: boolean = false;

  constructor(baseUrl?: string, model: string = 'llama3.2:3b') {
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = model;

    // Check availability on initialization
    this.checkAvailability();

    logger.info({ baseUrl: this.baseUrl, model: this.model }, 'LlamaProvider initialized');
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string }> };
        this.available = data.models?.some((m) => m.name === this.model) || false;

        if (!this.available) {
          logger.warn({ model: this.model, availableModels: data.models?.map((m) => m.name) },
            'Specified model not found in Ollama');
        }
      }
    } catch (error) {
      logger.warn({ error, baseUrl: this.baseUrl }, 'Ollama not available');
      this.available = false;
    }
  }

  async generate(prompt: string, options?: any): Promise<string> {
    if (!this.available) {
      logger.warn('Ollama not available, returning mock response');
      return `[MOCK] Llama response for: ${prompt.substring(0, 50)}...`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: options?.temperature || 0.7,
            num_predict: options?.maxTokens || 2048,
            top_p: options?.topP,
            stop: options?.stop
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OllamaGenerateResponse;
      return data.response;
    } catch (error) {
      logger.error({ error }, 'Failed to generate with Ollama');
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.available) {
      logger.warn('Ollama not available, returning mock embedding');
      return Array(1024).fill(0).map(() => Math.random() * 2 - 1);
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: text
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as OllamaEmbedResponse;
      return data.embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to generate embedding with Ollama');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });

      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string }> };
        const modelAvailable = data.models?.some((m) => m.name === this.model) || false;
        this.available = modelAvailable;
        return modelAvailable;
      }

      return false;
    } catch (error) {
      logger.debug({ error }, 'Ollama health check failed');
      this.available = false;
      return false;
    }
  }

  async getCapabilities(): Promise<LLMCapabilities> {
    return {
      maxInputLength: 8192, // Llama 3.2 supports 8k context
      supportsEmbedding: true,
      supportsGeneration: true,
      costPerToken: 0 // Free when running locally
    };
  }
}
