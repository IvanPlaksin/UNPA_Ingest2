import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider, LLMCapabilities } from './llm-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('gemini-provider');

export class GeminiProvider implements LLMProvider {
  name: string;
  private client: GoogleGenerativeAI;
  private model: string;
  private variant: 'flash' | 'pro';

  constructor(apiKey?: string, variant: 'flash' | 'pro' = 'flash') {
    this.variant = variant;
    this.name = `gemini-${variant}`;

    const key = apiKey || process.env.GOOGLE_AI_API_KEY;
    if (!key) {
      logger.warn('GOOGLE_AI_API_KEY not set, using mock mode');
      this.client = null as any;
      this.model = '';
      return;
    }

    this.client = new GoogleGenerativeAI(key);
    this.model = variant === 'flash'
      ? 'gemini-2.5-flash'
      : 'gemini-2.5-pro';

    logger.info({ model: this.model }, 'GeminiProvider initialized');
  }

  async generate(prompt: string, options?: any): Promise<string> {
    if (!this.client) {
      logger.warn('Gemini client not initialized, returning mock response');
      return `[MOCK] Gemini ${this.variant} response for: ${prompt.substring(0, 50)}...`;
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
        generationConfig: {
          temperature: options?.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || 8192,
          topP: options?.topP,
          stopSequences: options?.stop
        }
      });

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      logger.debug({ promptLength: prompt.length, responseLength: text.length }, 'Generated response');

      return text;
    } catch (error) {
      logger.error({ error, model: this.model }, 'Failed to generate');
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.client) {
      logger.warn('Gemini client not initialized, returning mock embedding');
      // Return mock embedding of size 768 (standard for text-embedding-004)
      return Array(768).fill(0).map(() => Math.random() * 2 - 1);
    }

    try {
      const model = this.client.getGenerativeModel({
        model: 'text-embedding-004'
      });

      const result = await model.embedContent(text);
      const embedding = result.embedding.values;

      logger.debug({ textLength: text.length, embeddingSize: embedding.length }, 'Generated embedding');

      return embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to generate embedding');
      throw error;
    }
  }

  async *generateStream(prompt: string, options?: any): AsyncGenerator<string> {
    if (!this.client) {
      yield `[MOCK] Streaming response from Gemini ${this.variant}`;
      return;
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
        generationConfig: {
          temperature: options?.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || 8192
        }
      });

      const result = await model.generateContentStream(prompt);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        yield text;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to stream');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Quick test with minimal tokens
      await this.generate('test', { maxTokens: 10 });
      return true;
    } catch (error) {
      logger.error({ error }, 'Health check failed');
      return false;
    }
  }

  async getCapabilities(): Promise<LLMCapabilities> {
    const isFlash = this.variant === 'flash';
    return {
      maxInputLength: 1_000_000,
      supportsEmbedding: true,
      supportsGeneration: true,
      costPerToken: isFlash ? 0.000075 : 0.00125
    };
  }
}
