const { BaseTool } = require('../primitives/BaseTool.js');
const { getScopedProvider } = require('../../../services/llm-access-control.service');
const llmProvider = getScopedProvider('mcp_tools');

class CompleteTool extends BaseTool {
  getDefinition() {
    return {
      id: 'ai.complete',
      name: 'AI Text Completion',
      version: '1.0.0',
      level: 2,
      category: 'ai',
      description: 'Generate text completion using LLM (OpenAI, Anthropic, Ollama)',
      inputSchema: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', description: 'Text prompt for completion' },
          systemPrompt: { type: 'string', description: 'System prompt for context' },
          provider: {
            type: 'string',
            enum: ['openai', 'anthropic', 'ollama', 'service', 'mock'],
            default: 'mock',
            description: 'LLM provider (service uses ServiceConnector)'
          },
          model: { type: 'string', description: 'Model name' },
          maxTokens: { type: 'integer', default: 1000, description: 'Maximum tokens to generate' },
          temperature: { type: 'number', default: 0.7, description: 'Sampling temperature (0-2)' },
          stopSequences: { type: 'array', items: { type: 'string' }, description: 'Stop sequences' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          usage: { type: 'object' },
          model: { type: 'string' },
          finishReason: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      prompt,
      systemPrompt,
      provider = 'mock',
      model,
      maxTokens = 1000,
      temperature = 0.7,
      stopSequences
    } = args;

    const aiConfig = server?.config?.ai || {};
    const actualProvider = aiConfig.provider || provider;

    try {
      switch (actualProvider) {
        case 'openai':
          return this.success(await this.completeOpenAI(prompt, systemPrompt, model || 'gpt-4o-mini', maxTokens, temperature, stopSequences, aiConfig));
        case 'anthropic':
          return this.success(await this.completeAnthropic(prompt, systemPrompt, model || 'haiku', maxTokens, temperature, stopSequences));
        case 'ollama':
          return this.success(await this.completeOllama(prompt, systemPrompt, model || 'llama3.2', maxTokens, temperature, aiConfig));
        case 'service':
          return this.success(await this.completeService(prompt, systemPrompt, server));
        case 'mock':
        default:
          return this.success(this.mockComplete(prompt, maxTokens));
      }
    } catch (error) {
      return this.error('AI_ERROR', error.message);
    }
  }

  mockComplete(prompt, maxTokens) {
    // Generate a mock response based on prompt
    const words = prompt.split(/\s+/).slice(0, 10);
    const mockResponse = `[Mock AI Response] Based on your input about "${words.join(' ')}...", here is a generated response. This is placeholder text for testing purposes.`;

    return {
      text: mockResponse.substring(0, maxTokens * 4), // Rough char estimate
      usage: { promptTokens: Math.ceil(prompt.length / 4), completionTokens: Math.ceil(mockResponse.length / 4) },
      model: 'mock',
      finishReason: 'stop'
    };
  }

  async completeOpenAI(prompt, systemPrompt, model, maxTokens, temperature, stopSequences, config) {
    const apiKey = config.openaiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(stopSequences && { stop: stopSequences })
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      text: choice.message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens
      },
      model,
      finishReason: choice.finish_reason
    };
  }

  async completeAnthropic(prompt, systemPrompt, model, maxTokens, temperature, stopSequences) {
    const data = await llmProvider.chat(
      [{ role: 'user', content: prompt }],
      {
        model,
        maxTokens,
        temperature,
        system: systemPrompt || undefined,
        ...(stopSequences && { stop_sequences: stopSequences }),
      }
    );

    return {
      text: data.content?.[0]?.text || '',
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
      },
      model,
      finishReason: data.stop_reason,
    };
  }

  async completeOllama(prompt, systemPrompt, model, maxTokens, temperature, config) {
    const baseUrl = config.ollamaUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        options: {
          num_predict: maxTokens,
          temperature
        },
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${await response.text()}`);
    }

    const data = await response.json();

    return {
      text: data.response,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count
      },
      model,
      finishReason: data.done ? 'stop' : 'length'
    };
  }

  async completeService(prompt, systemPrompt, server) {
    const connector = server?.serviceConnector;
    if (!connector || !connector.hasProvider('llm')) {
      throw new Error('ServiceConnector LLM provider not available');
    }

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const response = await connector.chat(messages);

    return {
      text: response.content || response.message?.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens
      },
      model: 'service',
      finishReason: response.finish_reason || 'stop'
    };
  }
}

module.exports = { CompleteTool };
