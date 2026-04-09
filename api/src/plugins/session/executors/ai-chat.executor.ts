/**
 * AI Chat Executor
 * Sends a prompt to the LLM service and returns the response.
 * Uses the same LLMService interface as the AI plugin.
 */

import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../core/aopeg/plugins/plugin-base';

export interface LLMService {
  generate(options: {
    model: string;
    systemPrompt?: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
  }): Promise<{ content: string; tokensUsed: number }>;
}

// Default placeholder
let llmService: LLMService = {
  async generate(options) {
    console.warn('[Session Plugin] LLM service not configured, returning placeholder');
    return {
      content: `[Placeholder response for: ${options.userPrompt.slice(0, 100)}...]`,
      tokensUsed: 0,
    };
  },
};

export function setSessionLLMService(service: LLMService): void {
  llmService = service;
}

class AIChatExecutor extends BaseExecutor {
  readonly type = 'session.ai_chat';
  readonly displayName = 'AI Chat';
  readonly description = 'Send a prompt to an LLM and return the response';
  readonly domain = 'session';
  readonly parameterSchema = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'User prompt with {{input}} placeholder' },
      systemPrompt: { type: 'string', description: 'Optional system prompt' },
      model: { type: 'string', default: 'gemini-flash' },
      temperature: { type: 'number', default: 0.7 },
      maxTokens: { type: 'number', default: 1000 },
      responseFormat: { type: 'string', enum: ['text', 'json'], default: 'text' },
    },
    required: ['prompt'],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    // Validate upstream input before sending to LLM
    const inputError = this.validateAIInput(context);
    if (inputError) return inputError;

    const promptTemplate = this.getRequiredParam<string>(parameters, 'prompt');
    const systemPrompt = parameters.systemPrompt as string | undefined;
    const model = this.getParam(parameters, 'model', 'gemini-flash');
    const temperature = this.getParam(parameters, 'temperature', 0.7);
    const maxTokens = this.getParam(parameters, 'maxTokens', 1000);
    const responseFormat = this.getParam(parameters, 'responseFormat', 'text') as 'text' | 'json';

    // Replace {{input}} placeholder with upstream data
    const input = typeof context.input === 'string'
      ? context.input
      : JSON.stringify(context.input);
    const userPrompt = promptTemplate.replace(/\{\{input\}\}/g, input);

    try {
      const response = await llmService.generate({
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        responseFormat,
      });

      let output: unknown = response.content;
      if (responseFormat === 'json') {
        try {
          output = JSON.parse(response.content);
        } catch {
          // Keep as string if JSON parse fails
        }
      }

      return this.success(output, {
        model,
        tokensUsed: response.tokensUsed,
        promptLength: userPrompt.length,
      });
    } catch (error) {
      return this.error(
        'AI_CHAT_ERROR',
        `AI chat failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }
}

export { AIChatExecutor };
