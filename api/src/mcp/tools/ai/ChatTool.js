const { BaseTool } = require('../primitives/BaseTool.js');
const { getInstance: getLLMProvider } = require('../../../services/llm/LLMProviderService');

class ChatTool extends BaseTool {
  getDefinition() {
    return {
      id: 'ai.chat',
      name: 'AI Chat',
      version: '1.0.0',
      level: 2,
      category: 'ai',
      description: 'Multi-turn conversation with LLM maintaining message history',
      inputSchema: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', description: 'User message' },
          history: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                content: { type: 'string' }
              }
            },
            description: 'Conversation history'
          },
          systemPrompt: { type: 'string', description: 'System prompt' },
          provider: {
            type: 'string',
            enum: ['openai', 'anthropic', 'ollama', 'mock'],
            default: 'mock'
          },
          model: { type: 'string' },
          maxTokens: { type: 'integer', default: 1000 },
          temperature: { type: 'number', default: 0.7 },
          sessionId: { type: 'string', description: 'Session ID for context persistence' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          response: { type: 'string' },
          history: { type: 'array' },
          usage: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      message,
      history = [],
      systemPrompt,
      provider = 'mock',
      model,
      maxTokens = 1000,
      temperature = 0.7,
      sessionId
    } = args;

    // Build messages array
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add history
    messages.push(...history);

    // Add new user message
    messages.push({ role: 'user', content: message });

    // Store in context if sessionId provided
    if (sessionId) {
      context.set(`chat.${sessionId}.history`, messages);
    }

    const aiConfig = server?.config?.ai || {};
    const actualProvider = aiConfig.provider || provider;

    try {
      let result;
      switch (actualProvider) {
        case 'openai':
          result = await this.chatOpenAI(messages, model || 'gpt-4o-mini', maxTokens, temperature, aiConfig);
          break;
        case 'anthropic':
          result = await this.chatAnthropic(messages, model || 'haiku', maxTokens, temperature);
          break;
        case 'ollama':
          result = await this.chatOllama(messages, model || 'llama3.2', maxTokens, temperature, aiConfig);
          break;
        case 'mock':
        default:
          result = this.mockChat(messages);
      }

      // Update history with assistant response
      const updatedHistory = [
        ...messages.filter(m => m.role !== 'system'),
        { role: 'assistant', content: result.response }
      ];

      if (sessionId) {
        context.set(`chat.${sessionId}.history`, updatedHistory);
      }

      return this.success({
        response: result.response,
        history: updatedHistory,
        usage: result.usage
      });
    } catch (error) {
      return this.error('CHAT_ERROR', error.message);
    }
  }

  mockChat(messages) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const turnCount = messages.filter(m => m.role === 'user').length;

    return {
      response: `[Mock Chat Response #${turnCount}] In response to: "${lastUserMessage?.content?.substring(0, 50)}..."`,
      usage: { promptTokens: 50, completionTokens: 30 }
    };
  }

  async chatOpenAI(messages, model, maxTokens, temperature, config) {
    const apiKey = config.openaiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');

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
        temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const data = await response.json();

    return {
      response: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens
      }
    };
  }

  async chatAnthropic(messages, model, maxTokens, temperature) {
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const data = await getLLMProvider().chat(chatMessages, {
      model,
      maxTokens,
      temperature,
      system: systemMessage?.content || undefined,
    });

    return {
      response: data.content?.[0]?.text || '',
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
      },
    };
  }

  async chatOllama(messages, model, maxTokens, temperature, config) {
    const baseUrl = config.ollamaUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
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
      response: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count
      }
    };
  }
}

module.exports = { ChatTool };
