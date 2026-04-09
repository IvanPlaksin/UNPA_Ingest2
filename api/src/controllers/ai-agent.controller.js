/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI AGENT CONTROLLER
 * REST API controller for AI Graph Builder Agent
 *
 * Provides endpoints for:
 * - Session management (start, get state, end)
 * - Chat interaction (sync and streaming)
 * - Graph operations (import, export)
 * - Direct tool execution
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Lazy import to avoid circular dependencies
let agentModule = null;
let executorRegistry = null;

async function getAgent() {
  if (!agentModule) {
    const { getGraphBuilderAgent } = require('../services/ai/graph-builder-agent.service');

    // Initialize AOPEG and get executor registry (pluginRegistry)
    try {
      const aopegModule = require('../core/aopeg/index.js');
      if (!aopegModule.isAOPEGInitialized()) {
        await aopegModule.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
      }
      executorRegistry = aopegModule.pluginRegistry || null;
      if (executorRegistry) {
        console.log(`[AI-Agent] Executor registry loaded: ${executorRegistry.getAllExecutors().length} executors`);
      }
    } catch (e) {
      console.warn('[AI-Agent] Could not load executor registry:', e.message);
    }

    agentModule = getGraphBuilderAgent({ executorRegistry });
  }
  return agentModule;
}

// ────────────────────────────────────────────────────────────────────────────
// SESSION ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai-agent/sessions
 * Start a new agent session
 */
exports.startSession = async (req, res) => {
  try {
    const { userId, userName, initialGraph, modelId } = req.body;

    const agent = await getAgent();
    const session = await agent.startSession({
      userId: userId || 'anonymous',
      userName: userName || 'User',
      initialGraph: initialGraph || null,
      modelId: modelId || null,  // Use default if not specified
    });

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error('[AI-Agent] Error starting session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ai-agent/sessions/:sessionId
 * Get session state
 */
exports.getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const agent = await getAgent();
    const state = agent.getSessionState(sessionId);

    if (state.error) {
      return res.status(404).json({
        success: false,
        error: state.error,
      });
    }

    res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    console.error('[AI-Agent] Error getting session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/ai-agent/sessions/:sessionId
 * End a session and get final graph
 */
exports.endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const agent = await getAgent();
    const result = agent.endSession(sessionId);

    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[AI-Agent] Error ending session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// CHAT ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai-agent/sessions/:sessionId/chat
 * Send a message and get a response (non-streaming)
 */
exports.chat = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    const agent = await getAgent();
    const response = await agent.chat(sessionId, message);

    if (response.error === 'Session not found') {
      return res.status(404).json({
        success: false,
        error: response.error,
      });
    }

    res.json({
      success: true,
      data: {
        content: response.content,
        toolCalls: response.toolCalls,
        graph: response.graph,
      },
    });
  } catch (error) {
    console.error('[AI-Agent] Error in chat:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/ai-agent/sessions/:sessionId/chat/stream
 * Send a message and stream the response via SSE
 */
exports.chatStream = async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Message is required',
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial event
  res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

  try {
    const agent = await getAgent();

    const response = await agent.chatStream(sessionId, message, (chunk) => {
      // Send text chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    });

    console.log('[AI-Agent] chatStream response:', {
      hasContent: !!response.content,
      toolCallsCount: response.toolCalls?.length || 0,
      hasGraph: !!response.graph,
      graphNodes: response.graph?.nodes?.length || 0,
      graphEdges: response.graph?.edges?.length || 0,
    });

    if (response.error === 'Session not found') {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Session not found' })}\n\n`);
      res.end();
      return;
    }

    // Send final response with graph
    const completePayload = {
      type: 'complete',
      content: response.content,
      toolCalls: response.toolCalls,
      graph: response.graph,
    };
    console.log('[AI-Agent] Sending complete event with graph nodes:', response.graph?.nodes?.length || 0);
    res.write(`data: ${JSON.stringify(completePayload)}\n\n`);

    res.end();

  } catch (error) {
    console.error('[AI-Agent] Error in stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
};

// ────────────────────────────────────────────────────────────────────────────
// GRAPH ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai-agent/sessions/:sessionId/graph/import
 * Import an existing graph into the session
 */
exports.importGraph = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { graph } = req.body;

    if (!graph) {
      return res.status(400).json({
        success: false,
        error: 'Graph is required',
      });
    }

    const agent = await getAgent();
    const result = agent.importGraph(sessionId, graph);

    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[AI-Agent] Error importing graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ai-agent/sessions/:sessionId/graph
 * Export the current graph from the session
 */
exports.exportGraph = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const agent = await getAgent();
    const result = agent.exportGraph(sessionId);

    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: result.graph,
    });
  } catch (error) {
    console.error('[AI-Agent] Error exporting graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// TOOL ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai-agent/sessions/:sessionId/tools/:toolName
 * Execute a tool directly (for testing/debugging)
 */
exports.executeTool = async (req, res) => {
  try {
    const { sessionId, toolName } = req.params;
    const args = req.body;

    const agent = await getAgent();
    const result = await agent.executeTool(sessionId, toolName, args);

    if (result.error === 'Session not found') {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: result.success,
      data: result.data,
      error: result.error,
    });
  } catch (error) {
    console.error('[AI-Agent] Error executing tool:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ai-agent/tools
 * List available tools
 */
exports.listTools = async (req, res) => {
  try {
    const { getToolDefinitions } = require('../services/ai/graph-builder-tools');
    const tools = getToolDefinitions();

    res.json({
      success: true,
      data: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    });
  } catch (error) {
    console.error('[AI-Agent] Error listing tools:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// HISTORY ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ai-agent/sessions/:sessionId/history
 * Get conversation history
 */
exports.getHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const agent = await getAgent();
    const history = agent.getHistory(sessionId);

    if (history.error) {
      return res.status(404).json({
        success: false,
        error: history.error,
      });
    }

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('[AI-Agent] Error getting history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/ai-agent/sessions/:sessionId/history
 * Clear conversation history but keep graph
 */
exports.clearHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const agent = await getAgent();
    const result = agent.clearHistory(sessionId);

    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: { message: 'History cleared' },
    });
  } catch (error) {
    console.error('[AI-Agent] Error clearing history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// MODEL ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ai-agent/models
 * List available AI models
 */
exports.listModels = async (req, res) => {
  try {
    const agent = await getAgent();
    const models = agent.getAvailableModels();

    // Check API key availability for each provider
    const { hasValidApiKey } = require('../config/ai-models.config');

    const modelsWithAvailability = models.map(model => ({
      ...model,
      available: hasValidApiKey(model.provider),
    }));

    res.json({
      success: true,
      data: modelsWithAvailability,
    });
  } catch (error) {
    console.error('[AI-Agent] Error listing models:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * PUT /api/v1/ai-agent/sessions/:sessionId/model
 * Change the AI model for a session
 */
exports.setSessionModel = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { modelId } = req.body;

    if (!modelId) {
      return res.status(400).json({
        success: false,
        error: 'modelId is required',
      });
    }

    const agent = await getAgent();
    const result = agent.setSessionModel(sessionId, modelId);

    if (result.error) {
      const status = result.error === 'Session not found' ? 404 : 400;
      return res.status(status).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[AI-Agent] Error setting model:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ────────────────────────────────────────────────────────────────────────────

const { getCachedHealthCheck } = require('../services/redis.service');

/**
 * Compute health status for AI Agent
 * @returns {Promise<Object>} Health status
 */
async function computeAIAgentHealth() {
  const agent = await getAgent();
  const { getDefaultModelId } = require('../config/ai-models.config');

  return {
    status: 'healthy',
    hasExecutorRegistry: !!executorRegistry,
    defaultModel: getDefaultModelId(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * GET /api/v1/ai-agent/health
 * Health check for the AI agent (cached for 1 minute)
 */
exports.healthCheck = async (req, res) => {
  try {
    const { data, cached } = await getCachedHealthCheck('ai-agent', computeAIAgentHealth);

    res.json({
      success: true,
      data: {
        ...data,
        cached,
        cacheInfo: cached ? 'Result from Redis cache (TTL: 60s)' : 'Fresh result',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message,
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        cached: false,
      },
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// USAGE MONITORING
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ai-agent/usage
 * Get API usage statistics
 */
exports.getUsageStats = async (req, res) => {
  try {
    const agent = await getAgent();
    const stats = agent.getUsageStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[AI-Agent] Error getting usage stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ai-agent/usage/summary
 * Get formatted usage summary
 */
exports.getUsageSummary = async (req, res) => {
  try {
    const agent = await getAgent();
    const summary = agent.getUsageSummary();

    res.type('text/plain').send(summary);
  } catch (error) {
    console.error('[AI-Agent] Error getting usage summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
