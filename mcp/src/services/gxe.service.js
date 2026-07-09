/**
 * GXE Service
 * Frontend API service for GXE (Graph Execution Engine) operations
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/gxe`,
  headers: { 'Content-Type': 'application/json' }
});

/**
 * Get all available GXE tools
 * @returns {Promise<Object>} Tool hierarchy
 */
export const getTools = async () => {
  try {
    const response = await api.get('/tools');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch GXE tools:', error);
    throw error;
  }
};

/**
 * Get GXE system capabilities
 * @returns {Promise<Object>} Capabilities data
 */
export const getCapabilities = async () => {
  try {
    const response = await api.get('/capabilities');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch GXE capabilities:', error);
    throw error;
  }
};

/**
 * Run the full ExecutableGraphVerifier stack (L1-L3) on a graph.
 * @param {{nodes: Array, edges: Array, processIR?: Object}} graph
 * @returns {Promise<{success, pass, grade, score, scores, levels, issues, suggestions}>}
 */
export const verifyGraph = async (graph) => {
  const response = await api.post('/verify-graph', graph);
  return response.data;
};

/**
 * Get available scenario templates
 * @returns {Promise<Array>} List of scenarios
 */
export const getScenarios = async () => {
  try {
    const response = await api.get('/scenarios');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch GXE scenarios:', error);
    throw error;
  }
};

/**
 * Execute a scenario
 * @param {string} scenarioId - Scenario ID
 * @param {Object} input - Input data
 * @returns {Promise<Object>} Session info
 */
export const executeScenario = async (scenarioId, input = {}) => {
  try {
    const response = await api.post('/execute', { scenarioId, input });
    return response.data;
  } catch (error) {
    console.error('Failed to execute GXE scenario:', error);
    throw error;
  }
};

/**
 * Create a custom scenario
 * @param {Object} scenario - Scenario definition
 * @returns {Promise<Object>} Created scenario
 */
export const createScenario = async (scenario) => {
  try {
    const response = await api.post('/scenarios', scenario);
    return response.data;
  } catch (error) {
    console.error('Failed to create GXE scenario:', error);
    throw error;
  }
};

/**
 * Get execution history
 * @returns {Promise<Array>} History list
 */
export const getHistory = async () => {
  try {
    const response = await api.get('/history');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch GXE history:', error);
    throw error;
  }
};

/**
 * Stream execution updates via SSE
 * @param {string} sessionId - Session ID
 * @param {Function} onEvent - Event callback
 * @param {Function} onComplete - Completion callback
 * @param {Function} onError - Error callback
 * @returns {EventSource} SSE connection
 */
export const streamExecution = (sessionId, onEvent, onComplete, onError) => {
  const url = `${API_BASE_URL}/gxe/stream/${sessionId}`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'complete') {
        onComplete?.(data);
        eventSource.close();
      } else {
        onEvent?.(data);
      }
    } catch (error) {
      console.error('Error parsing SSE data:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    onError?.(error);
    eventSource.close();
  };

  return eventSource;
};

/**
 * GXE health check
 * @returns {Promise<Object>} Health status
 */
export const getHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('GXE health check failed:', error);
    return { status: 'error', error: error.message };
  }
};

/**
 * Get available AI models
 * @returns {Promise<Array>} List of available models
 */
export const getModels = async () => {
  try {
    const response = await api.get('/models');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch GXE models:', error);
    throw error;
  }
};

/**
 * Generate execution graph from task description
 * Uses AI (Claude) to analyze the task and build an executable graph
 * @param {string} task - Task description in natural language
 * @param {Object} options - Generation options
 * @param {string} options.model - Model ID (claude-sonnet, claude-haiku, claude-opus)
 * @param {Object} options.parentContext - Parent graph context for sub-graphs
 * @param {boolean} options.useTools - Enable agentic mode with MCP tools
 * @param {string[]} options.enabledTools - Array of enabled tool IDs for filtering
 * @param {boolean} options.useSDA - Use full SDA pipeline with TaskPlanner (default: false)
 * @returns {Promise<Object>} Generated graph { nodes, edges, requiredParams, source, aiStatus }
 */
export const generateGraph = async (task, options = {}) => {
  try {
    const { model, parentContext, useTools, enabledTools, useSDA = false } = options;
    const response = await api.post('/generate', {
      task,
      model,
      parentContext,
      useTools,
      enabledTools,
      useSDA
    });
    if (response.data.success) {
      return response.data;
    } else {
      throw new Error(response.data.error || 'Failed to generate graph');
    }
  } catch (error) {
    console.error('Failed to generate GXE graph:', error);
    throw error;
  }
};

/**
 * Generate knowledge graph from text via extraction pipeline (SSE)
 * Returns a raw fetch Response for SSE streaming
 * @param {string} text - Input text for entity/relationship extraction
 * @param {Object} options - { method: 'hybrid'|'pattern' }
 * @returns {Promise<Response>} Raw fetch Response with SSE stream
 */
export const generateKnowledgeGraph = async (text, options = {}) => {
  const response = await fetch(`${API_BASE_URL}/gxe/generate-knowledge-graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, options })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response;
};

// ═══════════════════════════════════════════════════════════════════════════
// MCP Tools Settings Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get full list of MCP tools with metadata
 * @returns {Promise<Object>} Tools data with grouping and stats
 */
export const getMcpToolsList = async () => {
  try {
    const response = await api.get('/mcp-tools');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch MCP tools list:', error);
    throw error;
  }
};

/**
 * Save MCP tools settings
 * @param {string[]} enabledTools - Array of enabled tool IDs
 * @param {string} settingsId - Settings profile ID (default: 'default')
 * @param {Object} metadata - Additional metadata (name, description)
 * @returns {Promise<Object>} Save result
 */
export const saveMcpSettings = async (enabledTools, settingsId = 'default', metadata = {}) => {
  try {
    const response = await api.post('/mcp-settings', {
      enabledTools,
      settingsId,
      metadata
    });
    return response.data;
  } catch (error) {
    console.error('Failed to save MCP settings:', error);
    throw error;
  }
};

/**
 * Load MCP tools settings
 * @param {string} settingsId - Settings profile ID (default: 'default')
 * @returns {Promise<Object>} Settings data with enabled tools
 */
export const loadMcpSettings = async (settingsId = 'default') => {
  try {
    const response = await api.get(`/mcp-settings/${settingsId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to load MCP settings:', error);
    throw error;
  }
};

/**
 * Delete MCP tools settings
 * @param {string} settingsId - Settings profile ID
 * @returns {Promise<Object>} Delete result
 */
export const deleteMcpSettings = async (settingsId) => {
  try {
    const response = await api.delete(`/mcp-settings/${settingsId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to delete MCP settings:', error);
    throw error;
  }
};

/**
 * List all saved MCP settings profiles
 * @returns {Promise<Array>} List of settings profiles
 */
export const listMcpSettings = async () => {
  try {
    const response = await api.get('/mcp-settings');
    return response.data;
  } catch (error) {
    console.error('Failed to list MCP settings:', error);
    throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AI Settings & System Prompt Management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load AI settings (model, temperature, maxTokens, etc.)
 * @returns {Promise<Object>} { success, data }
 */
export const loadAiSettings = async () => {
  try {
    const response = await api.get('/ai-settings');
    return response.data;
  } catch (error) {
    console.error('Failed to load AI settings:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Save AI settings
 * @param {Object} settings - { selectedModel, temperature, maxTokens, useTools, useSDA }
 * @returns {Promise<Object>} { success }
 */
export const saveAiSettings = async (settings) => {
  try {
    const response = await api.post('/ai-settings', settings);
    return response.data;
  } catch (error) {
    console.error('Failed to save AI settings:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get current system prompt
 * @returns {Promise<Object>} { success, data: { content, version, createdAt, metadata } }
 */
export const getSystemPrompt = async () => {
  try {
    const response = await api.get('/system-prompt');
    return response.data;
  } catch (error) {
    console.error('Failed to get system prompt:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Save new system prompt version
 * @param {string} content - Prompt text
 * @param {Object} metadata - { description, author }
 * @returns {Promise<Object>} { success, data: { version } }
 */
export const saveSystemPrompt = async (content, metadata = {}) => {
  try {
    const response = await api.post('/system-prompt', { content, metadata });
    return response.data;
  } catch (error) {
    console.error('Failed to save system prompt:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get system prompt version history
 * @param {number} limit - Max number of versions (default 20)
 * @returns {Promise<Object>} { success, data: [{ version, content, createdAt, metadata, isCurrent }] }
 */
export const getSystemPromptHistory = async (limit = 20) => {
  try {
    const response = await api.get('/system-prompt/history', { params: { limit } });
    return response.data;
  } catch (error) {
    console.error('Failed to get system prompt history:', error);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// GXE Generation Prompt Management
// ═══════════════════════════════════════════════════════════════════════════

export const listGenerationPrompts = async (limit = 50) => {
  try {
    const response = await api.get('/generation-prompts', { params: { limit } });
    return response.data;
  } catch (error) {
    console.error('Failed to list generation prompts:', error);
    return { success: false, error: error.message };
  }
};

export const getDefaultGenerationPrompt = async () => {
  try {
    const response = await api.get('/generation-prompts/default');
    return response.data;
  } catch (error) {
    console.error('Failed to get default generation prompt:', error);
    return { success: false, error: error.message };
  }
};

export const saveGenerationPrompt = async (content, name, metadata = {}) => {
  try {
    const response = await api.post('/generation-prompts', { content, name, metadata });
    return response.data;
  } catch (error) {
    console.error('Failed to save generation prompt:', error);
    return { success: false, error: error.message };
  }
};

export const setDefaultGenerationPrompt = async (promptId) => {
  try {
    const response = await api.put(`/generation-prompts/${promptId}/set-default`);
    return response.data;
  } catch (error) {
    console.error('Failed to set default generation prompt:', error);
    return { success: false, error: error.message };
  }
};

export const getGenerationPromptMetrics = async (promptId) => {
  try {
    const response = await api.get(`/generation-prompts/${promptId}/metrics`);
    return response.data;
  } catch (error) {
    console.error('Failed to get generation prompt metrics:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Analyze generation result and get prompt optimization suggestions (Claude 4.6 Fast)
 */
export const analyzePromptOptimization = async (task, systemPrompt, generationResult, model) => {
  try {
    const response = await api.post('/analyze-prompt-optimization', {
      task, systemPrompt, generationResult, model
    });
    return response.data;
  } catch (error) {
    console.error('Failed to analyze prompt optimization:', error);
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Graph Analyst Chat (SSE streaming)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a streaming Graph Analyst Chat session
 * @param {string} message - User message
 * @param {Array} history - Previous messages [{role, content}]
 * @param {Object} graphContext - Current graph {nodes, edges}
 * @param {Object} options - {model, namespace}
 * @returns {{ responsePromise: Promise<Response>, abort: Function }}
 */
export const streamGraphAnalystChat = (message, history = [], graphContext = {}, options = {}) => {
  const { model = 'claude-opus-4.6', namespace } = options;
  const controller = new AbortController();

  const responsePromise = fetch(`${API_BASE_URL}/gxe/graph-analyst-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, graphContext, model, namespace }),
    signal: controller.signal,
  });

  return { responsePromise, abort: () => controller.abort() };
};

/**
 * Start a streaming Execution Assistant Chat session
 * @param {string} message - User or auto-generated message
 * @param {Array} history - Previous messages [{role, content}]
 * @param {Object} graphContext - Current graph {nodes, edges}
 * @param {Object} options - {model, namespace, executionError}
 * @returns {{ responsePromise: Promise<Response>, abort: Function }}
 */
export const streamExecutionAssistantChat = (message, history = [], graphContext = {}, options = {}) => {
  const { model = 'claude-opus-4.6', namespace, executionError } = options;
  const controller = new AbortController();

  const responsePromise = fetch(`${API_BASE_URL}/gxe/execution-assistant-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, graphContext, model, namespace, executionError }),
    signal: controller.signal,
  });

  return { responsePromise, abort: () => controller.abort() };
};

// ═══════════════════════════════════════════════════════════════════════════
// AI Layout — LLM-powered graph layout
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute graph layout using LLM (Claude).
 * @param {{ canvas, nodes, edges, hints, configOverrides }} request
 * @returns {Promise<{ success, nodePositions, edgeRoutes, metadata }>}
 */
export const computeAILayout = async (request) => {
  const response = await api.post('/ai-layout', request);
  return response.data;
};

/**
 * Load AI Layout configuration from Core KB.
 * @returns {Promise<Object>} Config: { selectedModel, temperature, maxTokens, systemPrompt }
 */
export const loadAILayoutConfig = async () => {
  try {
    const response = await api.get('/ai-layout-config');
    return response.data?.data || response.data;
  } catch (error) {
    console.warn('Failed to load AI Layout config, using defaults:', error.message);
    return null;
  }
};

/**
 * Save AI Layout configuration to Core KB.
 * @param {{ selectedModel, temperature, maxTokens, systemPrompt }} config
 */
export const saveAILayoutConfig = async (config) => {
  const response = await api.post('/ai-layout-config', config);
  return response.data;
};

/**
 * Compute hex grid layout using LLM (Claude).
 * Returns hex coordinates (q, r) per node — NOT pixel positions.
 * @param {{ canvas, nodes, edges, hints, configOverrides }} request
 * @returns {Promise<{ success, nodePositions: Record<string, {q,r}>, isHex, metadata }>}
 */
export const computeAIHexLayout = async (request) => {
  const response = await api.post('/ai-hex-layout', request);
  return response.data;
};

export default {
  getTools,
  getCapabilities,
  getScenarios,
  executeScenario,
  createScenario,
  getHistory,
  streamExecution,
  getHealth,
  getModels,
  generateGraph,
  generateKnowledgeGraph,
  // MCP Tools Settings
  getMcpToolsList,
  saveMcpSettings,
  loadMcpSettings,
  deleteMcpSettings,
  listMcpSettings,
  // AI Settings & System Prompt
  loadAiSettings,
  saveAiSettings,
  getSystemPrompt,
  saveSystemPrompt,
  getSystemPromptHistory,
  // GXE Generation Prompts
  listGenerationPrompts,
  getDefaultGenerationPrompt,
  saveGenerationPrompt,
  setDefaultGenerationPrompt,
  getGenerationPromptMetrics,
  analyzePromptOptimization,
  // Graph Analyst Chat
  streamGraphAnalystChat,
  // Execution Assistant Chat
  streamExecutionAssistantChat,
  // AI Layout
  computeAILayout,
  computeAIHexLayout,
  loadAILayoutConfig,
  saveAILayoutConfig,
};
