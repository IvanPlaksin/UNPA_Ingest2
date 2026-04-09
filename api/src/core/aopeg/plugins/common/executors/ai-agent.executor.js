/**
 * AI Agent Executor — advanced AI model interaction with tool use detection,
 * multi-turn conversation, and MCP integration.
 */

const { BaseExecutor } = require('../../plugin-base');

class AiAgentExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'ai.agent';
    this.displayName = 'AI Agent';
    this.description = 'Advanced AI model interaction with tool use detection, conversation context, and MCP integration';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['system', 'user', 'assistant'] },
              content: { type: 'string' },
            },
          },
          description: 'Conversation messages array',
        },
        context: { type: 'object', description: 'Additional context for the AI', default: {} },
        tools: {
          type: 'array',
          items: { type: 'object' },
          description: 'Tool definitions for tool use',
          default: [],
        },
        model: { type: 'string', description: 'Model override', default: '' },
        max_tokens: { type: 'number', description: 'Maximum response tokens', default: 4096 },
        temperature: { type: 'number', description: 'Temperature (0.0-1.0)', default: 0.7 },
        systemPrompt: { type: 'string', description: 'System prompt override' },
        toolSources: {
          type: 'array',
          items: { type: 'string', enum: ['MCP', 'native', 'custom'] },
          description: 'Tool discovery sources',
          default: ['native'],
        },
        mock_response: { type: 'any', description: 'If provided, return this instead of calling the LLM' },
      },
      required: ['messages'],
    };
  }

  async execute(parameters, context) {
    const messages = this.getRequiredParam(parameters, 'messages');
    const aiContext = this.getParam(parameters, 'context', {});
    const customTools = this.getParam(parameters, 'tools', []);
    const model = this.getParam(parameters, 'model', '');
    const maxTokens = this.getParam(parameters, 'max_tokens', 4096);
    const temperature = this.getParam(parameters, 'temperature', 0.7);
    const systemPrompt = this.getParam(parameters, 'systemPrompt', null);
    const toolSources = this.getParam(parameters, 'toolSources', ['native']);
    const mockResponse = this.getParam(parameters, 'mock_response', undefined);

    // Mock mode
    if (mockResponse !== undefined || process.env.MOCK_LLM === '1') {
      const mock = mockResponse !== undefined ? mockResponse : {
        response: 'Mock AI Agent response',
        tool_calls: [],
        hasToolUse: false,
      };
      return this.success(
        {
          response: mock.response || JSON.stringify(mock),
          tool_calls: mock.tool_calls || [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          hasToolUse: mock.hasToolUse || false,
          model_used: 'mock',
          mock: true,
        },
        { mock: true },
        1.0,
      );
    }

    try {
      const llmService = require('../../../../../services/llm.service');

      // Build messages with optional system prompt override
      const finalMessages = this._buildMessages(messages, systemPrompt, aiContext);

      // Discover tools from configured sources
      const tools = await this._discoverTools(toolSources, customTools, context);

      // Call LLM
      const opts = {};
      if (model) opts.model = model;
      if (maxTokens) opts.maxTokens = maxTokens;
      if (temperature !== undefined) opts.temperature = temperature;

      const result = await llmService.chat(finalMessages, tools, null, opts);

      // Extract response content
      const response = this._extractResponse(result);

      // Detect tool use
      const toolCalls = this._extractToolCalls(result);
      const hasToolUse = toolCalls.length > 0;

      // Build usage metrics
      const usage = {
        prompt_tokens: result?.usage?.input_tokens || result?.usage?.prompt_tokens || 0,
        completion_tokens: result?.usage?.output_tokens || result?.usage?.completion_tokens || 0,
        total_tokens: result?.usage?.total_tokens ||
          (result?.usage?.input_tokens || 0) + (result?.usage?.output_tokens || 0),
      };

      return this.success(
        {
          response,
          tool_calls: toolCalls,
          usage,
          hasToolUse,
          model_used: result?.model || model || 'unknown',
          provider: llmService.provider,
          mock: false,
        },
        {
          tokens: usage,
          toolCount: toolCalls.length,
          messageCount: finalMessages.length,
        },
        1.0,
      );
    } catch (error) {
      return this.error('AI_AGENT_ERROR', `AI Agent call failed: ${error.message}`, true);
    }
  }

  /**
   * Build final messages array with system prompt and context injection.
   */
  _buildMessages(messages, systemPrompt, aiContext) {
    const finalMessages = [...messages];

    // Inject system prompt at the beginning if provided
    if (systemPrompt) {
      const existingSystem = finalMessages.findIndex(m => m.role === 'system');
      if (existingSystem >= 0) {
        finalMessages[existingSystem] = { role: 'system', content: systemPrompt };
      } else {
        finalMessages.unshift({ role: 'system', content: systemPrompt });
      }
    }

    // Inject context into system message if provided
    if (aiContext && Object.keys(aiContext).length > 0) {
      const systemIdx = finalMessages.findIndex(m => m.role === 'system');
      if (systemIdx >= 0) {
        finalMessages[systemIdx] = {
          ...finalMessages[systemIdx],
          content: finalMessages[systemIdx].content +
            `\n\n<context>\n${JSON.stringify(aiContext, null, 2)}\n</context>`,
        };
      }
    }

    return finalMessages;
  }

  /**
   * Discover tools from configured sources.
   */
  async _discoverTools(toolSources, customTools, context) {
    const tools = [...customTools];

    for (const source of toolSources) {
      switch (source) {
        case 'MCP':
          // Discover tools from MCP registry if available
          if (context?.mcpRegistry) {
            try {
              const mcpTools = context.mcpRegistry.listTools?.() || [];
              for (const tool of mcpTools) {
                tools.push({
                  name: tool.id || tool.name,
                  description: tool.description || '',
                  input_schema: tool.inputSchema || tool.parameterSchema || {},
                });
              }
            } catch (err) {
              console.warn('[AiAgentExecutor] MCP tool discovery failed:', err.message);
            }
          }
          break;

        case 'native':
          // Native tools are passed directly via customTools
          break;

        case 'custom':
          // Custom tools already included via customTools parameter
          break;
      }
    }

    return tools.length > 0 ? tools : [];
  }

  /**
   * Extract text response from LLM result (handles different providers).
   */
  _extractResponse(result) {
    if (!result) return '';

    // Anthropic format: result.content is an array of blocks
    if (Array.isArray(result.content)) {
      const textBlocks = result.content
        .filter(block => block.type === 'text')
        .map(block => block.text);
      return textBlocks.join('\n');
    }

    // Normalized format from llmService
    if (typeof result.content === 'string') return result.content;

    // OpenAI format
    if (result.choices?.[0]?.message?.content) return result.choices[0].message.content;

    return '';
  }

  /**
   * Extract tool use calls from LLM result.
   */
  _extractToolCalls(result) {
    if (!result) return [];

    const toolCalls = [];

    // Anthropic format: content blocks with type=tool_use
    if (Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input || {},
          });
        }
      }
    }

    // OpenAI format
    if (result.choices?.[0]?.message?.tool_calls) {
      for (const tc of result.choices[0].message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function?.name,
          input: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
        });
      }
    }

    return toolCalls;
  }
}

module.exports = { AiAgentExecutor };
