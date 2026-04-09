import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

/**
 * GxeManager Service
 *
 * REST + SSE client for GxeManager backend.
 * All REST calls return response.data; SSE is managed via connect/disconnect.
 */

const api = axios.create({
  baseURL: `${API_BASE_URL}/gxe-manager`,
  headers: { 'Content-Type': 'application/json' },
});

// Debug interceptor
api.interceptors.response.use(
  (res) => { console.log('[GxeService] Response:', res.config.url, 'data count:', res.data?.executions?.length || res.data?.count || '?'); return res; },
  (err) => { console.error('[GxeService] Error:', err.config?.url, err.message); return Promise.reject(err); }
);

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchExecutions(filters = {}) {
  const { data } = await api.get('/executions', { params: filters });
  return data;
}

export async function fetchExecution(executionId) {
  const { data } = await api.get(`/executions/${executionId}`);
  return data;
}

export async function fetchExecutionResult(executionId) {
  const { data } = await api.get(`/executions/${executionId}/result`);
  return data;
}

export async function launchExecution(graphId, inputPayload = {}, options = {}) {
  const { data } = await api.post('/executions', { graphId, inputPayload, ...options });
  return data;
}

export async function pauseExecution(executionId, options = {}) {
  const { data } = await api.post(`/executions/${executionId}/pause`, options);
  return data;
}

export async function resumeExecution(executionId, payload = {}, resumeToken = null) {
  const { data } = await api.post(`/executions/${executionId}/resume`, {
    payload, resumeToken,
  });
  return data;
}

export async function cancelExecution(executionId, options = {}) {
  const { data } = await api.post(`/executions/${executionId}/cancel`, options);
  return data;
}

export async function rollbackExecution(executionId, options = {}) {
  const { data } = await api.post(`/executions/${executionId}/rollback`, options);
  return data;
}

export async function overrideAsyncWait(executionId, nodeId, payload = {}, reason = '') {
  const { data } = await api.post(`/executions/${executionId}/override-wait`, {
    nodeId, payload, reason,
  });
  return data;
}

export async function injectVariable(executionId, key, value, reason = '') {
  const { data } = await api.post(`/executions/${executionId}/inject-variable`, { key, value, reason });
  return data;
}

export async function fetchCheckpoints(executionId) {
  const { data } = await api.get(`/executions/${executionId}/checkpoints`);
  return data;
}

export async function fetchVariables(executionId) {
  const { data } = await api.get(`/executions/${executionId}/variables`);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS / AUDIT / CAPACITY
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchStats() {
  const { data } = await api.get('/stats');
  return data;
}

export async function fetchAuditLog(filters = {}) {
  const { data } = await api.get('/audit', { params: filters });
  return data;
}

export async function fetchCapacity() {
  const { data } = await api.get('/capacity');
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIGGERS
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchTriggers(filters = {}) {
  const { data } = await api.get('/triggers', { params: filters });
  return data;
}

export async function createTrigger(definition) {
  const { data } = await api.post('/triggers', definition);
  return data;
}

export async function deleteTrigger(triggerId) {
  const { data } = await api.delete(`/triggers/${triggerId}`);
  return data;
}

export async function enableTrigger(triggerId) {
  const { data } = await api.post(`/triggers/${triggerId}/enable`);
  return data;
}

export async function disableTrigger(triggerId) {
  const { data } = await api.post(`/triggers/${triggerId}/disable`);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNALS
// ═══════════════════════════════════════════════════════════════════════════

export async function sendSignal(signalType, payload = {}) {
  const { data } = await api.post(`/signals/${signalType}`, payload);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// SSE — Server-Sent Events
// ═══════════════════════════════════════════════════════════════════════════

let sseSource = null;

/**
 * Connect to GxeManager SSE stream.
 * @param {Object} handlers - Event handlers
 * @param {Function} handlers.onExecution - (executionRecord) => void
 * @param {Function} handlers.onStatus - (statusChangeEvent) => void
 * @param {Function} handlers.onNode - (nodeEvent) => void
 * @param {Function} handlers.onResult - (resultEvent) => void
 * @param {Function} handlers.onTrigger - (triggerEvent) => void
 * @param {Function} handlers.onConnected - () => void
 * @param {Function} handlers.onError - (error) => void
 * @returns {EventSource}
 */
export function connectSSE(handlers = {}) {
  disconnectSSE();

  const url = `${API_BASE_URL}/gxe-manager/stream`;
  sseSource = new EventSource(url);

  sseSource.onopen = () => {
    handlers.onConnected?.();
  };

  // execution.launched / execution.statusChanged
  sseSource.addEventListener('execution', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onExecution?.(data);
    } catch { /* ignore parse errors */ }
  });

  // execution.statusChanged (dedicated channel)
  sseSource.addEventListener('statusChange', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onStatus?.(data);
    } catch { /* ignore */ }
  });

  // node-level events
  sseSource.addEventListener('node', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onNode?.(data);
    } catch { /* ignore */ }
  });

  // execution result
  sseSource.addEventListener('result', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onResult?.(data);
    } catch { /* ignore */ }
  });

  // trigger events
  sseSource.addEventListener('trigger', (e) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onTrigger?.(data);
    } catch { /* ignore */ }
  });

  // Generic message (heartbeat, etc.)
  sseSource.onmessage = (e) => {
    // heartbeat messages — no action needed
  };

  sseSource.onerror = (err) => {
    handlers.onError?.(err);
  };

  return sseSource;
}

/**
 * Disconnect SSE stream
 */
export function disconnectSSE() {
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }
}

/**
 * Check if SSE is connected
 */
export function isSSEConnected() {
  return sseSource?.readyState === EventSource.OPEN;
}
