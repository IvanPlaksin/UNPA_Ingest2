/**
 * Runtime Service
 * Frontend API service for GXE Runtime (P1/P2) operations
 *
 * Connects to /api/v1/runtime endpoints for DAG execution with:
 * - Full FSM-based execution lifecycle
 * - Real-time SSE streaming
 * - Pause/resume/cancel support
 * - Checkpoint/recovery (P2)
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/runtime`,
  headers: { 'Content-Type': 'application/json' }
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH & DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get runtime health status
 * @returns {Promise<Object>} Health status including AOPEG connection
 */
export const getHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

/**
 * Get available executors from AOPEG registry
 * @returns {Promise<Array>} List of available executors with metadata
 */
export const getExecutors = async () => {
  const response = await api.get('/executors');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start DAG execution (fire-and-forget)
 * Returns immediately with execution ID for SSE subscription
 *
 * @param {Object} dag - DAG definition with nodes and edges
 * @param {Object} inputData - Initial input data for entry nodes
 * @param {Object} config - Optional execution config overrides
 * @returns {Promise<Object>} { executionId, streamUrl }
 */
export const executeDAG = async (dag, inputData = {}, config = {}) => {
  const response = await api.post('/execute', { dag, inputData, config });
  return response.data;
};

/**
 * Start DAG execution with SSE stream
 * Returns an EventSource for real-time updates
 *
 * @param {Object} dag - DAG definition
 * @param {Object} inputData - Initial input data
 * @param {Object} callbacks - Event callbacks { onNodeStart, onNodeComplete, onError, onComplete }
 * @returns {Promise<{ executionId: string, eventSource: EventSource, close: Function }>}
 */
export const executeDAGWithStream = async (dag, inputData = {}, callbacks = {}) => {
  // First start execution
  const result = await executeDAG(dag, inputData);

  if (!result.success || !result.executionId) {
    throw new Error(result.error || 'Failed to start execution');
  }

  // Create SSE connection
  const eventSource = createSSEConnection(result.executionId, callbacks);

  return {
    executionId: result.executionId,
    eventSource,
    close: () => eventSource.close()
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// SSE STREAMING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create SSE connection for execution updates
 *
 * @param {string} executionId - Execution ID
 * @param {Object} callbacks - Event callbacks
 * @returns {EventSource}
 */
export const createSSEConnection = (executionId, callbacks = {}) => {
  const streamUrl = `${API_BASE_URL}/runtime/execute/${executionId}/stream`;
  const eventSource = new EventSource(streamUrl);

  // Handle different event types
  eventSource.addEventListener('connected', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onConnected?.(data);
  });

  eventSource.addEventListener('node:start', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onNodeStart?.(data);
  });

  eventSource.addEventListener('node:complete', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onNodeComplete?.(data);
  });

  eventSource.addEventListener('node:error', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onNodeError?.(data);
  });

  eventSource.addEventListener('state:change', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onStateChange?.(data);
  });

  eventSource.addEventListener('execution:complete', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onComplete?.(data);
    eventSource.close();
  });

  eventSource.addEventListener('execution:failed', (event) => {
    const data = JSON.parse(event.data);
    callbacks.onFailed?.(data);
    eventSource.close();
  });

  eventSource.addEventListener('heartbeat', (event) => {
    callbacks.onHeartbeat?.();
  });

  eventSource.onerror = (error) => {
    callbacks.onError?.(error);
  };

  return eventSource;
};

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get execution status
 * @param {string} executionId
 * @returns {Promise<Object>} Execution status and progress
 */
export const getExecutionStatus = async (executionId) => {
  const response = await api.get(`/execute/${executionId}/status`);
  return response.data;
};

/**
 * Cancel a running execution
 * @param {string} executionId
 * @returns {Promise<Object>} Final state
 */
export const cancelExecution = async (executionId) => {
  const response = await api.post(`/execute/${executionId}/cancel`);
  return response.data;
};

/**
 * Pause a running execution
 * @param {string} executionId
 * @returns {Promise<Object>} Paused state
 */
export const pauseExecution = async (executionId) => {
  const response = await api.post(`/execute/${executionId}/pause`);
  return response.data;
};

/**
 * Resume a paused execution
 * @param {string} executionId
 * @returns {Promise<Object>} Resumed state
 */
export const resumeExecution = async (executionId) => {
  const response = await api.post(`/execute/${executionId}/resume`);
  return response.data;
};

/**
 * Get all active executions
 * @returns {Promise<Array>} List of active executions
 */
export const getActiveExecutions = async () => {
  const response = await api.get('/executions/active');
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════
// DAG CONVERSION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert React Flow nodes/edges to Runtime DAG format
 *
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @param {Object} metadata - Additional DAG metadata
 * @returns {Object} Runtime DAG
 */
export const convertReactFlowToDAG = (nodes, edges, metadata = {}) => {
  const dag = {
    id: metadata.id || `dag-${Date.now()}`,
    version: metadata.version || 1,
    name: metadata.name || 'Untitled DAG',

    nodes: nodes.map(node => ({
      id: node.id,
      executorType: node.data?.executorType || node.data?.toolId || 'unknown',
      parameters: node.data?.parameters || {},
      displayName: node.data?.label || node.data?.displayName || node.id,
      description: node.data?.description || '',
      position: node.position || { x: 0, y: 0 },
      timeout: node.data?.timeout,
      retryPolicy: node.data?.retryPolicy
    })),

    edges: edges.map(edge => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      condition: edge.data?.condition || null,
      priority: edge.data?.priority || 1,
      dataMapping: edge.data?.dataMapping || []
    })),

    entryNodeId: metadata.entryNodeId || findEntryNode(nodes, edges),
    exitNodeIds: metadata.exitNodeIds || findExitNodes(nodes, edges)
  };

  return dag;
};

/**
 * Find entry node (no incoming edges)
 */
function findEntryNode(nodes, edges) {
  const targetIds = new Set(edges.map(e => e.target));
  const entry = nodes.find(n => !targetIds.has(n.id));
  return entry?.id || nodes[0]?.id;
}

/**
 * Find exit nodes (no outgoing edges)
 */
function findExitNodes(nodes, edges) {
  const sourceIds = new Set(edges.map(e => e.source));
  const exits = nodes.filter(n => !sourceIds.has(n.id));
  return exits.map(n => n.id);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  getHealth,
  getExecutors,
  executeDAG,
  executeDAGWithStream,
  createSSEConnection,
  getExecutionStatus,
  cancelExecution,
  pauseExecution,
  resumeExecution,
  getActiveExecutions,
  convertReactFlowToDAG
};
