/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GENERATE RESPONSE EXECUTOR
 * Generates LLM response using assembled context
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface GenerateResponseParameters {
  query?: string;
  context?: string;
  systemPrompt?: string;
  provider?: 'ollama' | 'gemini' | 'anthropic';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json' | 'markdown';
  includeSourceCitations?: boolean;
  streamResponse?: boolean;
}

interface GenerateResponseResult {
  response: string;
  provider: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  citations?: string[];
  metadata: {
    temperature: number;
    generationTime: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class GenerateResponseExecutor extends BaseExecutor {
  readonly type = 'rag.generate_response';
  readonly displayName = 'Generate Response';
  readonly description = 'Generate LLM response using RAG context';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'User query to answer',
      },
      context: {
        type: 'string',
        description: 'Retrieved context (can use context.variables.context)',
      },
      systemPrompt: {
        type: 'string',
        description: 'System prompt for the LLM',
      },
      provider: {
        type: 'string',
        enum: ['ollama', 'gemini', 'anthropic'],
        default: 'ollama',
        description: 'LLM provider to use',
      },
      model: {
        type: 'string',
        description: 'Model name (provider-specific)',
      },
      temperature: {
        type: 'number',
        default: 0.7,
        description: 'Generation temperature',
      },
      maxTokens: {
        type: 'number',
        default: 2048,
        description: 'Maximum tokens to generate',
      },
      responseFormat: {
        type: 'string',
        enum: ['text', 'json', 'markdown'],
        default: 'markdown',
        description: 'Desired response format',
      },
      includeSourceCitations: {
        type: 'boolean',
        default: true,
        description: 'Include source citations in response',
      },
      streamResponse: {
        type: 'boolean',
        default: false,
        description: 'Stream the response (returns generator)',
      },
    },
    required: [],
  };

  private llmModule: typeof import('../../../../../services/llm.service') | null = null;

  private async getLLM() {
    if (!this.llmModule) {
      this.llmModule = await import('../../../../../services/llm.service');
    }
    return this.llmModule.default || this.llmModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as GenerateResponseParameters;

      // Get query from parameters or context
      const query = params.query || (context.variables.query as string);

      if (!query) {
        return this.error('INVALID_INPUT', 'No query provided', true);
      }

      // Get context from parameters or context variables
      let ragContext = params.context ||
        (context.variables.context as string) ||
        (context.variables.assembledContext as string);

      // Handle nested output structure
      if (!ragContext && context.variables.output) {
        const output = context.variables.output as { context?: string };
        ragContext = output.context;
      }

      const llm = await this.getLLM();

      // Build prompt
      const systemPrompt = params.systemPrompt || this.getDefaultSystemPrompt(params.responseFormat);
      const userPrompt = this.buildUserPrompt(query, ragContext, params.includeSourceCitations ?? true);

      const temperature = params.temperature ?? 0.7;
      const maxTokens = params.maxTokens ?? 2048;

      // Generate response
      const generationStart = Date.now();

      let response: string;
      let provider = params.provider || 'ollama';
      let model = params.model || 'llama3';

      try {
        // Try to use the LLM service
        const llmResponse = await llm.chat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          {
            temperature,
            maxTokens,
            model: params.model,
            provider: params.provider,
          }
        );

        response = typeof llmResponse === 'string'
          ? llmResponse
          : llmResponse.content || llmResponse.text || String(llmResponse);

        // Get actual provider/model from response if available
        if (typeof llmResponse === 'object') {
          provider = llmResponse.provider || provider;
          model = llmResponse.model || model;
        }
      } catch (llmError) {
        // Fallback: return a structured "no LLM available" response
        response = this.generateFallbackResponse(query, ragContext);
        provider = 'fallback';
        model = 'none';
      }

      const generationTime = Date.now() - generationStart;

      // Extract citations if present
      const citations = params.includeSourceCitations
        ? this.extractCitations(response)
        : undefined;

      // Estimate token usage
      const promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const completionTokens = Math.ceil(response.length / 4);

      const output: GenerateResponseResult = {
        response,
        provider,
        model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        citations,
        metadata: {
          temperature,
          generationTime,
        },
      };

      // Quality score based on response length and coherence
      const hasSubstantiveResponse = response.length > 50;
      const hasProperFormat = params.responseFormat === 'markdown'
        ? response.includes('#') || response.includes('*') || response.includes('-')
        : true;
      const qualityScore = (hasSubstantiveResponse ? 0.5 : 0.2) + (hasProperFormat ? 0.3 : 0.1) + 0.1;

      return this.success(
        output,
        {
          responseLength: response.length,
          provider,
          model,
          generationTime,
          citationCount: citations?.length || 0,
          duration: Date.now() - startTime,
        },
        Math.min(qualityScore, 0.95)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('GENERATE_ERROR', `Response generation failed: ${message}`, true);
    }
  }

  /**
   * Get default system prompt based on format
   */
  private getDefaultSystemPrompt(format?: string): string {
    const basePrompt = `You are a helpful AI assistant with access to a knowledge base.
Answer questions based on the provided context. If the context doesn't contain
relevant information, say so clearly. Always cite your sources when possible.`;

    switch (format) {
      case 'json':
        return basePrompt + '\n\nRespond in valid JSON format with "answer" and "sources" fields.';
      case 'markdown':
        return basePrompt + '\n\nFormat your response using Markdown for clarity.';
      default:
        return basePrompt;
    }
  }

  /**
   * Build user prompt with query and context
   */
  private buildUserPrompt(
    query: string,
    ragContext: string | undefined,
    includeCitations: boolean
  ): string {
    let prompt = '';

    if (ragContext) {
      prompt += '## Retrieved Context\n\n';
      prompt += ragContext;
      prompt += '\n\n---\n\n';
    }

    prompt += '## Question\n\n';
    prompt += query;

    if (includeCitations) {
      prompt += '\n\nPlease cite sources using [Source N] notation when referencing the retrieved context.';
    }

    return prompt;
  }

  /**
   * Generate fallback response when LLM is unavailable
   */
  private generateFallbackResponse(query: string, ragContext: string | undefined): string {
    if (!ragContext) {
      return `I apologize, but I'm unable to generate a response at this time. The language model is currently unavailable.

**Your question:** ${query}

Please try again later or check the system configuration.`;
    }

    return `Based on the retrieved information, here is what I found relevant to your question:

**Your question:** ${query}

**Relevant context:**
${ragContext.substring(0, 1000)}${ragContext.length > 1000 ? '...' : ''}

*Note: Full AI-powered response generation is currently unavailable. The above is a direct excerpt from the knowledge base.*`;
  }

  /**
   * Extract source citations from response
   */
  private extractCitations(response: string): string[] {
    const citations: string[] = [];

    // Match [Source N] patterns
    const sourcePattern = /\[Source\s+(\d+)\]/gi;
    let match;

    while ((match = sourcePattern.exec(response)) !== null) {
      const sourceNum = `Source ${match[1]}`;
      if (!citations.includes(sourceNum)) {
        citations.push(sourceNum);
      }
    }

    // Match [N] patterns
    const bracketPattern = /\[(\d+)\]/g;
    while ((match = bracketPattern.exec(response)) !== null) {
      const sourceNum = `[${match[1]}]`;
      if (!citations.includes(sourceNum)) {
        citations.push(sourceNum);
      }
    }

    return citations;
  }
}

export default GenerateResponseExecutor;
