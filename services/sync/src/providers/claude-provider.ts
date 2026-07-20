import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMCapabilities } from './llm-provider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('claude-provider');

export class ClaudeProvider implements LLMProvider {
  name: string;
  private client: Anthropic | null;
  private model: string;
  private variant: 'haiku' | 'sonnet' | 'opus';

  constructor(apiKey?: string, variant: 'haiku' | 'sonnet' | 'opus' = 'sonnet') {
    this.variant = variant;
    this.name = `claude-${variant}`;

    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      logger.warn('ANTHROPIC_API_KEY not set, using mock mode');
      this.client = null;
      this.model = '';
      return;
    }

    this.client = new Anthropic({ apiKey: key });

    // Map variants to actual model names
    const modelMap = {
      'haiku': 'claude-3-5-haiku-20241022',
      'sonnet': 'claude-3-5-sonnet-20241022',
      'opus': 'claude-opus-4-5-20251101'
    };
    this.model = modelMap[variant];

    logger.info({ model: this.model }, 'ClaudeProvider initialized');
  }

  async generate(prompt: string, options?: any): Promise<string> {
    if (!this.client) {
      logger.warn('Claude client not initialized, returning mock response');
      return `[MOCK] Claude ${this.variant} response for: ${prompt.substring(0, 50)}...`;
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const textContent = response.content.find(block => block.type === 'text');
      const text = textContent && textContent.type === 'text' ? textContent.text : '';

      logger.debug({
        promptLength: prompt.length,
        responseLength: text.length,
        usage: response.usage
      }, 'Generated response');

      return text;
    } catch (error) {
      logger.error({ error, model: this.model }, 'Failed to generate');
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    // Claude doesn't provide embeddings API yet
    // Fall back to mock or consider using Voyage AI embeddings
    logger.warn('Claude embeddings not available, returning mock embedding');
    return Array(1024).fill(0).map(() => Math.random() * 2 - 1);
  }

  async *generateStream(prompt: string, options?: any): AsyncGenerator<string> {
    if (!this.client) {
      yield `[MOCK] Streaming response from Claude ${this.variant}`;
      return;
    }

    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature || 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: true
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
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
    // Cost per million tokens (input) for each variant
    const costMap = {
      'haiku': 1.00,    // $1.00/MTok input, $5.00/MTok output
      'sonnet': 3.00,   // $3.00/MTok input, $15.00/MTok output
      'opus': 15.00     // $15.00/MTok input, $75.00/MTok output
    };

    return {
      maxInputLength: 200_000, // Claude 3.5 has 200k context
      supportsEmbedding: false, // Claude doesn't provide embeddings
      supportsGeneration: true,
      costPerToken: costMap[this.variant] / 1_000_000
    };
  }
}
