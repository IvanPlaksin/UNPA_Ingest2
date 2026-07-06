/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH BUILDER AGENT SERVICE
 * AI Agent for building AOPEG graphs through natural language conversation
 *
 * Phase 8 - AI Graph Builder Agent
 *
 * Features:
 * - Multi-turn conversation with tool calling
 * - Session-based graph state management
 * - Automatic tool execution loop
 * - Streaming response support
 * - Integration with executor registry
 * ═══════════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { EventEmitter } = require('events');
const { getScopedProvider } = require('../llm-access-control.service');
const llmProvider = getScopedProvider('graph_builder');
const { v4: uuidv4 } = require('uuid');

const { GraphState, ToolExecutor } = require('./tool-executor');
const { getToolDefinitions } = require('./graph-builder-tools');
const { buildSystemPrompt, buildContinuationPrompt, buildErrorRecoveryPrompt } = require('./prompts/graph-builder-system.prompt');
const { getGraphTypeService } = require('../graph/GraphTypeService');
const {
  AI_MODELS,
  AI_PROVIDERS,
  getDefaultModelId,
  getModel,
  getProviderForModel,
  getAllModels,
  getApiKey,
} = require('../../config/ai-models.config');
const { getAIUsageMonitor } = require('./ai-usage-monitor.service');

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  defaultModelId: getDefaultModelId(),  // Default: gemini-2.0-flash
  maxToolIterations: 10,         // Max tool calls per turn
  temperature: 0.1,              // Low for deterministic tool calling
  maxTokens: 4096,
  timeout: 60000,                // 60 second timeout per LLM call
};

// Models that support native function calling in Ollama
const OLLAMA_FUNCTION_CALLING_MODELS = [
  'llama3.1', 'llama3.2', 'llama3.3',
  'llama4', 'llama4-scout', 'llama4-maverick',
  'mistral', 'mixtral',
  'command-r', 'command-r-plus',
  'qwen2.5', 'qwen2.5-coder',
  'granite3.1-dense',
  'athene-v2',
  'nemotron-mini',
];

// ────────────────────────────────────────────────────────────────────────────
// SESSION MANAGER
// ────────────────────────────────────────────────────────────────────────────

// Session management configuration
const SESSION_CONFIG = {
  maxSessions: 500,           // Maximum concurrent sessions
  maxAgeMs: 3600000,          // 1 hour session TTL
  cleanupIntervalMs: 300000,  // 5 minutes cleanup interval
};

/**
 * Manages agent sessions with conversation history and graph state
 */
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this._cleanupInterval = null;
    this._startAutoCleanup();
  }

  /**
   * Start automatic session cleanup
   * @private
   */
  _startAutoCleanup() {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => {
      this.cleanupOldSessions(SESSION_CONFIG.maxAgeMs);
    }, SESSION_CONFIG.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup (call on shutdown)
   */
  stopAutoCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * Evict oldest sessions if limit exceeded
   * @private
   */
  _evictIfNeeded() {
    if (this.sessions.size < SESSION_CONFIG.maxSessions) return;

    const sessions = Array.from(this.sessions.entries())
      .sort((a, b) => new Date(a[1].lastActiveAt) - new Date(b[1].lastActiveAt));

    const toRemove = Math.ceil(sessions.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.sessions.delete(sessions[i][0]);
    }
    console.log(`[SessionManager] Evicted ${toRemove} oldest sessions`);
  }

  createSession(userId = 'anonymous', initialGraph = null, modelId = null) {
    // Evict oldest sessions if limit exceeded
    this._evictIfNeeded();

    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId,
      graphState: new GraphState(initialGraph),
      messages: [],
      modelId: modelId || getDefaultModelId(),  // Model per session
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      metadata: {},
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.lastActiveAt = new Date().toISOString();
    }
    return session;
  }

  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  getAllSessions(userId = null) {
    const sessions = Array.from(this.sessions.values());
    if (userId) {
      return sessions.filter(s => s.userId === userId);
    }
    return sessions;
  }

  cleanupOldSessions(maxAgeMs = 3600000) {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      const age = now - new Date(session.lastActiveAt).getTime();
      if (age > maxAgeMs) {
        this.sessions.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[SessionManager] Cleaned up ${removed} expired sessions`);
    }
  }

  /**
   * Destroy session manager and cleanup resources
   */
  destroy() {
    this.stopAutoCleanup();
    this.sessions.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH BUILDER AGENT
// ────────────────────────────────────────────────────────────────────────────

class GraphBuilderAgent extends EventEmitter {
  /**
   * @param {Object} options - Agent options
   * @param {Object} options.executorRegistry - AOPEG executor registry
   * @param {Object} options.config - Configuration overrides
   */
  constructor(options = {}) {
    super();

    this.executorRegistry = options.executorRegistry || null;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.sessionManager = new SessionManager();
    this.tools = getToolDefinitions();

    // Initialize usage monitor
    this.monitor = getAIUsageMonitor();

    // Store handler reference for cleanup
    this._alertHandler = async (alert) => {
      console.warn(`[AI ALERT] ${alert.level.toUpperCase()}: ${alert.message}`);
      this.emit('usageAlert', alert);

      // Record alert to AINFRA (async, don't block)
      try {
        const { getAINFRAService } = require('./ainfra.service');
        const ainfra = getAINFRAService();
        await ainfra.recordAlert(alert);
      } catch (err) {
        console.error('[GraphBuilderAgent] Failed to record alert to AINFRA:', err.message);
      }
    };

    this.monitor.on('alert', this._alertHandler);
  }

  /**
   * Destroy agent and cleanup all resources
   * Call this when shutting down to prevent memory leaks
   */
  destroy() {
    // Remove event listener
    if (this._alertHandler) {
      this.monitor.off('alert', this._alertHandler);
      this._alertHandler = null;
    }

    // Cleanup session manager
    this.sessionManager.destroy();

    // Remove all listeners from this EventEmitter
    this.removeAllListeners();

    console.log('[GraphBuilderAgent] Agent destroyed and resources cleaned up');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new agent session
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Session info
   */
  async startSession(options = {}) {
    const modelId = options.modelId || this.config.defaultModelId;
    const modelInfo = getModel(modelId);

    const session = this.sessionManager.createSession(
      options.userId,
      options.initialGraph,
      modelId
    );

    // Load type catalog from Core KB
    const typeCatalog = await this._getTypeCatalog();

    // Load Codex governance rules for GXE agent
    let codexRules = '';
    try {
      const codexLoader = require('../codex/codex-loader.service');
      const codexResult = await codexLoader.loadForGxeAssistant();
      if (codexResult && codexResult.prompt) {
        codexRules = codexResult.prompt;
      }
    } catch (e) {
      // Codex not available — continue without
    }

    // Add system message
    const systemPrompt = buildSystemPrompt({
      executorCatalog: this._getExecutorCatalog(),
      currentGraph: session.graphState.getGraph(),
      typeCatalog,
      userName: options.userName || 'User',
      codexRules,
    });

    session.messages.push({
      role: 'system',
      content: systemPrompt,
    });

    this.emit('sessionStarted', { sessionId: session.id, modelId });

    return {
      sessionId: session.id,
      graphId: session.graphState.getGraph().id,
      modelId: session.modelId,
      modelInfo: modelInfo ? {
        id: modelInfo.id,
        displayName: modelInfo.displayName,
        provider: modelInfo.provider,
      } : null,
    };
  }

  /**
   * Change the AI model for a session
   * @param {string} sessionId - Session ID
   * @param {string} modelId - New model ID
   * @returns {Object} Updated session info
   */
  setSessionModel(sessionId, modelId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const modelInfo = getModel(modelId);
    if (!modelInfo) {
      return { error: `Unknown model: ${modelId}` };
    }

    session.modelId = modelId;
    session.lastActiveAt = new Date().toISOString();

    this.emit('modelChanged', { sessionId, modelId });

    return {
      success: true,
      modelId,
      modelInfo: {
        id: modelInfo.id,
        displayName: modelInfo.displayName,
        provider: modelInfo.provider,
      },
    };
  }

  /**
   * Get available AI models
   * @returns {Array} List of available models
   */
  getAvailableModels() {
    return getAllModels();
  }

  /**
   * Get API usage statistics
   * @returns {Object} Usage stats by provider
   */
  getUsageStats() {
    return this.monitor.getUsageStats();
  }

  /**
   * Get usage summary string
   * @returns {string} Formatted usage summary
   */
  getUsageSummary() {
    return this.monitor.getUsageSummary();
  }

  /**
   * Get session state
   * @param {string} sessionId - Session ID
   * @returns {Object} Session state
   */
  getSessionState(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const modelInfo = getModel(session.modelId);

    return {
      sessionId: session.id,
      graph: session.graphState.getGraph(),
      messageCount: session.messages.length,
      modelId: session.modelId,
      modelInfo: modelInfo ? {
        id: modelInfo.id,
        displayName: modelInfo.displayName,
        provider: modelInfo.provider,
      } : null,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
    };
  }

  /**
   * End a session
   * @param {string} sessionId - Session ID
   * @returns {Object} Final graph state
   */
  endSession(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const finalGraph = session.graphState.getGraph();
    this.sessionManager.deleteSession(sessionId);

    this.emit('sessionEnded', { sessionId, graph: finalGraph });

    return { graph: finalGraph };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT INTERFACE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Process a user message (non-streaming)
   * @param {string} sessionId - Session ID
   * @param {string} message - User message
   * @returns {Promise<Object>} Agent response
   */
  async chat(sessionId, message) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: message,
    });

    try {
      // Run agent loop
      const response = await this._agentLoop(session);

      // Add assistant response
      session.messages.push({
        role: 'assistant',
        content: response.content,
      });

      this.emit('messageProcessed', {
        sessionId,
        userMessage: message,
        response: response.content,
        toolCalls: response.toolCalls,
      });

      return {
        content: response.content,
        toolCalls: response.toolCalls,
        graph: session.graphState.getGraph(),
      };

    } catch (error) {
      console.error('[GraphBuilderAgent] Chat error:', error);

      // Add error recovery attempt
      const errorResponse = buildErrorRecoveryPrompt(error.message, 'chat');
      session.messages.push({
        role: 'system',
        content: errorResponse,
      });

      return {
        error: error.message,
        graph: session.graphState.getGraph(),
      };
    }
  }

  /**
   * Process a user message with streaming
   * @param {string} sessionId - Session ID
   * @param {string} message - User message
   * @param {Function} onChunk - Callback for each text chunk
   * @returns {Promise<Object>} Final response
   */
  async chatStream(sessionId, message, onChunk) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: message,
    });

    try {
      // Run agent loop with streaming
      const response = await this._agentLoopStream(session, onChunk);

      // Add assistant response
      session.messages.push({
        role: 'assistant',
        content: response.content,
      });

      return {
        content: response.content,
        toolCalls: response.toolCalls,
        graph: session.graphState.getGraph(),
      };

    } catch (error) {
      console.error('[GraphBuilderAgent] Stream error:', error);
      onChunk(`\n\n[Error: ${error.message}]`);

      return {
        error: error.message,
        graph: session.graphState.getGraph(),
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT LOOP
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Main agent loop - handles tool calling iterations
   * @private
   */
  async _agentLoop(session) {
    const toolExecutor = new ToolExecutor(session.graphState, this.executorRegistry);
    const allToolCalls = [];
    let iteration = 0;

    while (iteration < this.config.maxToolIterations) {
      iteration++;

      // Call LLM with current messages
      const llmResponse = await this._callLLM(session.messages, this.tools, session);

      // Check if we have tool calls
      if (!llmResponse.tool_calls || llmResponse.tool_calls.length === 0) {
        // No more tool calls - return final response
        return {
          content: llmResponse.content || '',
          toolCalls: allToolCalls,
        };
      }

      // Process tool calls
      for (const toolCall of llmResponse.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;

        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          toolArgs = {};
        }

        this.emit('toolCall', { sessionId: session.id, tool: toolName, args: toolArgs });

        // Execute tool with logging
        const toolStartTime = Date.now();
        const result = await toolExecutor.execute(toolName, toolArgs);
        const toolDuration = Date.now() - toolStartTime;

        // Log tool execution
        this.monitor.logToolExecution({
          provider: session.modelId ? getModel(session.modelId)?.provider : 'unknown',
          sessionId: session.id,
          toolName,
          args: toolArgs,
          success: result.success !== false,
          resultSummary: result.success !== false
            ? (result.message || 'OK').substring(0, 100)
            : (result.error || 'Failed').substring(0, 100),
          durationMs: toolDuration,
        });

        allToolCalls.push({
          tool: toolName,
          args: toolArgs,
          result,
        });

        // Add tool result to messages (preserve thought_signature for Gemini 2.0+)
        const toolCallMsg = {
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolName,
            arguments: toolCall.function.arguments,
          },
        };
        // Preserve thought_signature if present
        if (toolCall.thought_signature) {
          toolCallMsg.thought_signature = toolCall.thought_signature;
        }

        session.messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [toolCallMsg],
        });

        session.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          tool_name: toolName,  // Store tool name for Gemini API
          content: JSON.stringify(result),
        });

        this.emit('toolResult', { sessionId: session.id, tool: toolName, result });
      }

      // Update system message with current graph state
      this._updateGraphContext(session);
    }

    // Max iterations reached
    return {
      content: 'I\'ve reached the maximum number of operations. Here\'s the current state of your graph.',
      toolCalls: allToolCalls,
    };
  }

  /**
   * Streaming agent loop
   * @private
   */
  async _agentLoopStream(session, onChunk) {
    const toolExecutor = new ToolExecutor(session.graphState, this.executorRegistry);
    const allToolCalls = [];
    let iteration = 0;
    let finalContent = '';

    while (iteration < this.config.maxToolIterations) {
      iteration++;

      // Call LLM with current messages
      const llmResponse = await this._callLLM(session.messages, this.tools, session);

      // Check if we have tool calls
      if (!llmResponse.tool_calls || llmResponse.tool_calls.length === 0) {
        // Stream the final response
        if (llmResponse.content) {
          await this._streamResponse(session.messages, onChunk);
          finalContent = llmResponse.content;
        }

        return {
          content: finalContent || llmResponse.content || '',
          toolCalls: allToolCalls,
        };
      }

      // Notify about tool execution
      onChunk('\n[Executing tools...]\n');

      // Process tool calls
      for (const toolCall of llmResponse.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;

        try {
          toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          toolArgs = {};
        }

        onChunk(`• ${toolName}\n`);

        // Execute tool with logging
        const toolStartTime = Date.now();
        const result = await toolExecutor.execute(toolName, toolArgs);
        const toolDuration = Date.now() - toolStartTime;

        // Log tool execution
        this.monitor.logToolExecution({
          provider: session.modelId ? getModel(session.modelId)?.provider : 'unknown',
          sessionId: session.id,
          toolName,
          args: toolArgs,
          success: result.success !== false,
          resultSummary: result.success !== false
            ? (result.message || 'OK').substring(0, 100)
            : (result.error || 'Failed').substring(0, 100),
          durationMs: toolDuration,
        });

        allToolCalls.push({
          tool: toolName,
          args: toolArgs,
          result,
        });

        // Add to messages (preserve thought_signature for Gemini 2.0+)
        const toolCallMsg = {
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolName,
            arguments: toolCall.function.arguments,
          },
        };
        if (toolCall.thought_signature) {
          toolCallMsg.thought_signature = toolCall.thought_signature;
        }

        session.messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [toolCallMsg],
        });

        session.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          tool_name: toolName,
          content: JSON.stringify(result),
        });
      }

      // Update graph context
      this._updateGraphContext(session);
    }

    return {
      content: finalContent,
      toolCalls: allToolCalls,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LLM COMMUNICATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check if the model supports native function calling
   * @private
   */
  _supportsNativeFunctionCalling(modelId) {
    const modelInfo = getModel(modelId);
    if (!modelInfo) return false;

    // Gemini, Anthropic models support function calling
    if (['gemini', 'anthropic'].includes(modelInfo.provider)) {
      return modelInfo.supportsTools !== false;
    }

    // For Ollama, check against known list
    if (modelInfo.provider === 'ollama') {
      return OLLAMA_FUNCTION_CALLING_MODELS.some(m =>
        modelId.toLowerCase().includes(m.toLowerCase())
      );
    }

    return false;
  }

  /**
   * Parse tool calls from text response when model doesn't support native function calling
   * @private
   */
  _parseToolCallsFromText(text) {
    const toolCalls = [];

    // Pattern 1: JSON code blocks with tool_call marker
    const toolCallPattern = /```(?:tool_call|json)?\s*\n?\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?\}\s*```/gi;
    let match;

    while ((match = toolCallPattern.exec(text)) !== null) {
      try {
        const jsonMatch = match[0].match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.name) {
            toolCalls.push({
              id: `call_${Date.now()}_${toolCalls.length}`,
              type: 'function',
              function: {
                name: parsed.name,
                arguments: JSON.stringify(parsed.arguments || parsed.params || {}),
              },
            });
          }
        }
      } catch (e) {
        console.warn('[GraphBuilderAgent] Failed to parse tool call from text:', e.message);
      }
    }

    // Pattern 2: Inline function calls
    const inlinePattern = /(add_node|add_edge|remove_node|remove_edge|update_node|update_edge|validate_graph|auto_layout|set_entry_exit|get_graph_state|clear_graph)\s*\(\s*(\{[\s\S]*?\})\s*\)/gi;

    while ((match = inlinePattern.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: 'function',
          function: {
            name: match[1],
            arguments: JSON.stringify(args),
          },
        });
      } catch (e) {
        console.warn('[GraphBuilderAgent] Failed to parse inline tool call:', e.message);
      }
    }

    return toolCalls;
  }

  /**
   * Clean JSON Schema for Gemini API (remove unsupported fields)
   * @private
   */
  _cleanSchemaForGemini(schema) {
    if (!schema || typeof schema !== 'object') return schema;

    // Fields not supported by Gemini API
    const unsupportedFields = [
      'additionalProperties',
      '$schema',
      '$id',
      '$ref',
      'default',
      'examples',
      'const',
      'contentMediaType',
      'contentEncoding',
    ];

    const cleaned = {};

    for (const [key, value] of Object.entries(schema)) {
      // Skip unsupported fields
      if (unsupportedFields.includes(key)) continue;

      // Recursively clean nested objects
      if (key === 'properties' && typeof value === 'object') {
        cleaned[key] = {};
        for (const [propKey, propValue] of Object.entries(value)) {
          cleaned[key][propKey] = this._cleanSchemaForGemini(propValue);
        }
      } else if (key === 'items' && typeof value === 'object') {
        cleaned[key] = this._cleanSchemaForGemini(value);
      } else if (Array.isArray(value)) {
        cleaned[key] = value.map(item =>
          typeof item === 'object' ? this._cleanSchemaForGemini(item) : item
        );
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  /**
   * Convert tools to Gemini format
   * @private
   */
  _convertToolsToGeminiFormat(tools) {
    return [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: this._cleanSchemaForGemini(t.function.parameters),
      })),
    }];
  }

  /**
   * Convert messages to Gemini format
   * @private
   */
  _convertMessagesToGeminiFormat(messages) {
    const contents = [];
    let systemInstruction = null;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Build parts with function calls and thought signatures
          const parts = msg.tool_calls.map(tc => {
            const part = {
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments || '{}'),
              },
            };
            // Include thought_signature if present (required for Gemini 2.0+)
            if (tc.thought_signature) {
              part.functionCall.thought_signature = tc.thought_signature;
            }
            return part;
          });
          contents.push({ role: 'model', parts });
        } else if (msg.content) {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }],
          });
        }
      } else if (msg.role === 'tool') {
        // Parse the tool name from metadata or use a placeholder
        const toolName = msg.tool_name || msg.tool_call_id?.split('_')[0] || 'function';
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: toolName,
              response: JSON.parse(msg.content || '{}'),
            },
          }],
        });
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Call Gemini API
   * @private
   */
  async _callGemini(modelId, messages, tools) {
    const apiKey = getApiKey('gemini');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const modelInfo = getModel(modelId);
    const { contents, systemInstruction } = this._convertMessagesToGeminiFormat(messages);

    const payload = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
      },
    };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    if (tools && tools.length > 0 && modelInfo?.supportsTools) {
      payload.tools = this._convertToolsToGeminiFormat(tools);
      payload.toolConfig = {
        functionCallingConfig: { mode: 'AUTO' },
      };
    }

    console.log('[GraphBuilderAgent] Calling Gemini:', {
      model: modelId,
      contentCount: contents.length,
      hasTools: !!payload.tools,
    });

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      payload,
      { timeout: this.config.timeout }
    );

    const candidate = response.data.candidates?.[0];
    if (!candidate) {
      throw new Error('No response from Gemini');
    }

    // Convert Gemini response to OpenAI format
    const parts = candidate.content?.parts || [];
    let content = '';
    const toolCalls = [];

    for (const part of parts) {
      if (part.text) {
        content += part.text;
      }
      if (part.functionCall) {
        const toolCall = {
          id: `call_${Date.now()}_${toolCalls.length}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        };
        // Preserve thought_signature for Gemini 2.0+ (required for tool responses)
        if (part.functionCall.thought_signature) {
          toolCall.thought_signature = part.functionCall.thought_signature;
        }
        toolCalls.push(toolCall);
      }
    }

    console.log('[GraphBuilderAgent] Gemini response:', {
      hasContent: !!content,
      toolCallsCount: toolCalls.length,
      toolNames: toolCalls.map(tc => tc.function.name),
    });

    return {
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Call Ollama/OpenAI compatible API
   * @private
   */
  async _callOpenAICompatible(modelId, messages, tools, baseUrl) {
    const modelInfo = getModel(modelId);
    const supportsNativeTools = this._supportsNativeFunctionCalling(modelId);

    const payload = {
      model: modelId,
      messages: messages,
      stream: false,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    if (tools && tools.length > 0 && supportsNativeTools) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const headers = { 'Content-Type': 'application/json' };

    // Add API key for OpenAI
    if (modelInfo?.provider === 'openai') {
      const apiKey = getApiKey('openai');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log('[GraphBuilderAgent] Calling OpenAI-compatible API:', {
      model: modelId,
      baseUrl,
      messageCount: messages.length,
      supportsNativeTools,
    });

    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      payload,
      { headers, timeout: this.config.timeout }
    );

    const message = response.data.choices[0].message;

    console.log('[GraphBuilderAgent] API response:', {
      hasContent: !!message.content,
      hasToolCalls: !!message.tool_calls,
      toolCallsCount: message.tool_calls?.length || 0,
    });

    // Try to parse tool calls from text if needed
    if (tools?.length > 0 && !message.tool_calls && message.content && !supportsNativeTools) {
      const parsedToolCalls = this._parseToolCallsFromText(message.content);
      if (parsedToolCalls.length > 0) {
        message.tool_calls = parsedToolCalls;
      }
    }

    return message;
  }

  /**
   * Convert messages to Anthropic Claude format
   * @private
   */
  _convertMessagesToAnthropicFormat(messages) {
    const result = { system: '', messages: [] };

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.system += (result.system ? '\n\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        result.messages.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Tool use message
          result.messages.push({
            role: 'assistant',
            content: msg.tool_calls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}'),
            })),
          });
        } else if (msg.content) {
          result.messages.push({
            role: 'assistant',
            content: msg.content,
          });
        }
      } else if (msg.role === 'tool') {
        // Tool result
        result.messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          }],
        });
      }
    }

    return result;
  }

  /**
   * Convert tools to Anthropic format
   * @private
   */
  _convertToolsToAnthropicFormat(tools) {
    return tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  /**
   * Call Anthropic Claude API
   * @private
   */
  async _callAnthropic(modelId, messages, tools) {
    const modelInfo = getModel(modelId);
    const { system, messages: convertedMessages } = this._convertMessagesToAnthropicFormat(messages);

    const resolvedTools = (tools && tools.length > 0 && modelInfo?.supportsTools)
      ? this._convertToolsToAnthropicFormat(tools)
      : undefined;

    console.log('[GraphBuilderAgent] Calling LLM:', {
      model: modelId,
      messageCount: convertedMessages.length,
      hasTools: !!resolvedTools,
    });

    const llmResp = await llmProvider.chat(convertedMessages, {
      model: modelId,
      maxTokens: modelInfo?.maxTokens || this.config.maxTokens,
      system: system || undefined,
      tools: resolvedTools,
    });

    const data = { content: llmResp.content, stop_reason: llmResp.stop_reason || llmResp.stopReason };

    // Convert Anthropic response to OpenAI format
    let content = '';
    const toolCalls = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        });
      }
    }

    console.log('[GraphBuilderAgent] Anthropic response:', {
      hasContent: !!content,
      toolCallsCount: toolCalls.length,
      toolNames: toolCalls.map(tc => tc.function.name),
      stopReason: data.stop_reason,
    });

    return {
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Call LLM with messages and tools (multi-provider)
   * @private
   */
  async _callLLM(messages, tools, session) {
    const modelId = session?.modelId || this.config.defaultModelId;
    const modelInfo = getModel(modelId);
    const provider = modelInfo?.provider || 'ollama';
    const startTime = Date.now();

    // Check rate limits and quotas before making request
    const canRequest = this.monitor.canMakeRequest(provider);
    if (!canRequest.allowed) {
      this.monitor.logRateLimitHit({
        provider,
        currentRPM: this.monitor.tracker.getRequestsPerMinute(provider),
        limit: this.monitor.config.rateLimits[provider],
        waitMs: canRequest.waitMs,
      });

      // Wait if rate limited
      if (canRequest.waitMs && canRequest.waitMs < 5000) {
        await new Promise(resolve => setTimeout(resolve, canRequest.waitMs));
      } else {
        throw new Error(`API limit reached: ${canRequest.reason}`);
      }
    }

    // Estimate input tokens
    const inputText = messages.map(m => m.content || '').join(' ');
    const estimatedInputTokens = this.monitor.estimateTokens(inputText);

    // Log request start
    this.monitor.logRequestStart({
      provider,
      modelId,
      sessionId: session?.id,
      messageCount: messages.length,
      hasTools: !!tools && tools.length > 0,
      toolCount: tools?.length || 0,
      estimatedInputTokens,
    });

    try {
      console.log('[GraphBuilderAgent] Routing to provider:', {
        modelId,
        provider,
        displayName: modelInfo?.displayName,
      });

      let result;
      switch (provider) {
        case 'gemini':
          result = await this._callGemini(modelId, messages, tools);
          break;

        case 'anthropic':
          result = await this._callAnthropic(modelId, messages, tools);
          break;

        case 'ollama':
        default:
          result = await this._callOpenAICompatible(
            modelId,
            messages,
            tools,
            AI_PROVIDERS.ollama.baseUrl
          );
      }

      // Log successful request
      const durationMs = Date.now() - startTime;
      const outputTokens = this.monitor.estimateTokens(result.content || '');

      this.monitor.logRequestComplete({
        provider,
        modelId,
        sessionId: session?.id,
        durationMs,
        inputTokens: estimatedInputTokens,
        outputTokens,
        toolCalls: result.tool_calls,
        content: result.content,
      });

      return result;

    } catch (error) {
      // Log error
      this.monitor.logRequestError({
        provider,
        modelId,
        sessionId: session?.id,
        error,
        durationMs: Date.now() - startTime,
      });

      console.error('[GraphBuilderAgent] LLM call error:', error.message);
      if (error.response) {
        console.error('[GraphBuilderAgent] Response status:', error.response.status);
        console.error('[GraphBuilderAgent] Response data:', JSON.stringify(error.response.data).substring(0, 500));
      }
      throw new Error(`LLM call failed (${provider}/${modelId}): ${error.message}`);
    }
  }

  /**
   * Stream response from LLM
   * @private
   */
  async _streamResponse(messages, onChunk) {
    try {
      const response = await axios.post(
        `${this.config.llmBaseUrl}/chat/completions`,
        {
          model: this.config.llmModel,
          messages: messages,
          stream: true,
          temperature: this.config.temperature,
        },
        {
          responseType: 'stream',
          timeout: this.config.timeout,
        }
      );

      return new Promise((resolve, reject) => {
        let fullContent = '';

        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.includes('[DONE]')) {
              return;
            }

            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.replace('data: ', '');
                const json = JSON.parse(jsonStr);
                const content = json.choices?.[0]?.delta?.content;

                if (content) {
                  fullContent += content;
                  onChunk(content);
                }
              } catch (e) {
                // Skip parsing errors for partial chunks
              }
            }
          }
        });

        response.data.on('end', () => resolve(fullContent));
        response.data.on('error', reject);
      });

    } catch (error) {
      console.error('[GraphBuilderAgent] Stream error:', error.message);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get executor catalog for prompt
   * @private
   */
  _getExecutorCatalog() {
    if (!this.executorRegistry) {
      return [];
    }

    try {
      return this.executorRegistry.getAllExecutors().map(exec => ({
        type: exec.type,
        displayName: exec.displayName,
        description: exec.description,
        domain: exec.domain,
      }));
    } catch (e) {
      console.warn('[GraphBuilderAgent] Could not get executor catalog:', e.message);
      return [];
    }
  }

  /**
   * Get type catalog from Core KB
   * @private
   */
  async _getTypeCatalog() {
    try {
      const typeService = getGraphTypeService();
      await typeService.initialize();
      const types = await typeService.listNodeTypes();
      return types.map(t => ({
        fullName: t.fullName,
        domain: t.domain,
        name: t.name,
        displayName: t.displayName,
        description: t.description,
        category: t.category,
        icon: t.icon,
        color: t.color,
      }));
    } catch (e) {
      console.warn('[GraphBuilderAgent] Could not get type catalog:', e.message);
      return [];
    }
  }

  /**
   * Update graph context in conversation
   * @private
   */
  _updateGraphContext(session) {
    const graph = session.graphState.getGraph();
    const contextPrompt = buildContinuationPrompt({ currentGraph: graph });

    // Replace or add context message
    const contextIndex = session.messages.findIndex(
      m => m.role === 'system' && m.content?.includes('CURRENT GRAPH STATE')
    );

    if (contextIndex >= 0) {
      session.messages[contextIndex].content = contextPrompt;
    }
  }

  /**
   * Import an existing graph into a session
   * @param {string} sessionId - Session ID
   * @param {Object} graph - Graph to import
   */
  importGraph(sessionId, graph) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    session.graphState = new GraphState(graph);
    this._updateGraphContext(session);

    return { success: true, graph: session.graphState.getGraph() };
  }

  /**
   * Export the current graph from a session
   * @param {string} sessionId - Session ID
   */
  exportGraph(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    return { graph: session.graphState.getGraph() };
  }

  /**
   * Execute a single tool directly (for testing)
   * @param {string} sessionId - Session ID
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   */
  async executeTool(sessionId, toolName, args) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const toolExecutor = new ToolExecutor(session.graphState, this.executorRegistry);
    return await toolExecutor.execute(toolName, args);
  }

  /**
   * Get conversation history
   * @param {string} sessionId - Session ID
   */
  getHistory(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    // Filter out system messages and tool responses
    return session.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || null,
      }));
  }

  /**
   * Clear conversation history but keep graph
   * @param {string} sessionId - Session ID
   */
  clearHistory(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    // Keep only system message
    const systemMsg = session.messages.find(m => m.role === 'system');
    session.messages = systemMsg ? [systemMsg] : [];

    return { success: true };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a Graph Builder Agent instance
 * @param {Object} options - Agent options
 * @returns {GraphBuilderAgent} Agent instance
 */
function createGraphBuilderAgent(options = {}) {
  return new GraphBuilderAgent(options);
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ────────────────────────────────────────────────────────────────────────────

let _instance = null;

/**
 * Get or create singleton instance
 * @param {Object} options - Agent options (only used on first call)
 * @returns {GraphBuilderAgent} Agent instance
 */
function getGraphBuilderAgent(options = {}) {
  if (!_instance) {
    _instance = createGraphBuilderAgent(options);
  }
  return _instance;
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  GraphBuilderAgent,
  SessionManager,
  createGraphBuilderAgent,
  getGraphBuilderAgent,
};
