/**
 * AI Generate Executor — sends prompts to an LLM and returns the response
 */

const { BaseExecutor } = require('../../plugin-base');

class AiGenerateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'ai.generate';
    this.displayName = 'AI Generate';
    this.description = 'Sends system/user prompts to an LLM and returns the generated response';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        system_prompt: { type: 'string', description: 'System prompt for the LLM' },
        user_prompt: { type: 'string', description: 'User prompt for the LLM' },
        model: { type: 'string', description: 'Optional model override' },
        response_format: {
          type: 'string',
          enum: ['json', 'text'],
          default: 'text',
          description: 'Expected response format',
        },
        mock_response: { type: 'any', description: 'If provided, return this instead of calling the LLM' },
      },
      required: ['system_prompt', 'user_prompt'],
    };
  }

  async execute(parameters, context) {
    const systemPrompt = this.getRequiredParam(parameters, 'system_prompt');
    const userPrompt = this.getRequiredParam(parameters, 'user_prompt');
    const model = this.getParam(parameters, 'model', null);
    const responseFormat = this.getParam(parameters, 'response_format', 'text');
    const mockResponse = this.getParam(parameters, 'mock_response', undefined);

    // Return mock if mock_response provided or MOCK_LLM env is set
    if (mockResponse !== undefined || process.env.MOCK_LLM === '1') {
      const mock = mockResponse !== undefined ? mockResponse : { mock: true, text: 'Mock LLM response' };
      return this.success(
        { response: mock, model_used: 'mock', mock: true },
        { mock: true },
        1.0,
      );
    }

    try {
      const { getInstance: getLLMProvider } = require('../../../../../services/llm/LLMProviderService');
      const llmProvider = getLLMProvider();

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const opts = { caller: 'aopeg_executors' };
      if (model) opts.model = model;

      const result = await llmProvider.chat(messages, opts);

      // Normalize response: extract text from content blocks
      const rawContent = result?.content;
      let response = Array.isArray(rawContent)
        ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
        : (rawContent || result?.choices?.[0]?.message?.content || '');

      // Parse JSON if requested
      if (responseFormat === 'json' && typeof response === 'string') {
        try {
          response = JSON.parse(response);
        } catch {
          // Keep as string if JSON parsing fails
        }
      }

      return this.success(
        { response, model_used: result?.model || model || 'unknown', provider: llmProvider.type, mock: false },
        { tokens: result?.usage || null },
        1.0,
      );
    } catch (error) {
      return this.error('AI_GENERATE_ERROR', `LLM call failed: ${error.message}`, true);
    }
  }
}

module.exports = { AiGenerateExecutor };
