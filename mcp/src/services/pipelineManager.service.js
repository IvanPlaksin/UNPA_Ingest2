import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const base = `${API_BASE_URL}/pipeline`;

export const getStats = async () => {
  const { data } = await axios.get(`${base}/stats`);
  return data.data;
};

export const getJobs = async (params = {}) => {
  const { data } = await axios.get(`${base}/jobs`, { params });
  return data.data;
};

export const enqueueDocuments = async (documentIds, options = {}) => {
  const { data } = await axios.post(`${base}/enqueue`, { documentIds, options });
  return data.data;
};

export const enqueueDocumentsByMethodology = async (documentIds, methodology, options = {}) => {
  const results = await Promise.allSettled(
    documentIds.map(id =>
      axios.post(`${base}/enqueue-methodology`, { documentId: id, methodology, options })
        .then(r => r.data.data)
    )
  );
  return results.map((r, i) => ({
    documentId: documentIds[i],
    ok:    r.status === 'fulfilled',
    data:  r.status === 'fulfilled' ? r.value : null,
    error: r.status === 'rejected'  ? r.reason?.message : null,
  }));
};

export const getExtractionMethodologies = async () => {
  const { data } = await axios.get(`/api/extraction/methodologies`);
  return data.data || [];
};

export const getExtractionHistory = async (docId) => {
  const { data } = await axios.get(`${base}/extraction-history/${docId}`);
  return data.data || [];
};

export const verifyCompletedJobs = async (limit = 500) => {
  const { data } = await axios.get(`${base}/verify-completed`, { params: { limit } });
  return data.data;
};

export const getDocRefStats = async () => {
  const { data } = await axios.get(`${base}/docref-stats`);
  return data.data;
};

export const queueDocRefs = async (options = {}) => {
  const { data } = await axios.post(`${base}/queue-docrefs`, { options });
  return data.data;
};

export const reconcileDocRefs = async () => {
  const { data } = await axios.post(`${base}/docref-reconcile`);
  return data.data;
};

export const cancelJob = async (jobId) => {
  const { data } = await axios.delete(`${base}/jobs/${jobId}`);
  return data.data;
};

export const retryJob = async (jobId) => {
  const { data } = await axios.post(`${base}/jobs/${jobId}/retry`);
  return data.data;
};

export const retryAllFailed = async () => {
  const { data } = await axios.post(`${base}/jobs/retry-all-failed`);
  return data.data;
};

// ─── ES Ingestion Agent ───────────────────────────────────────────────────────

const agentBase = `${API_BASE_URL}/es-ingestion-agent`;

export const agentStatus = async () => {
  const { data } = await axios.get(`${agentBase}/status`);
  return data.data;
};

export const agentStart = async ({ namespace = 'DEFAULT', batchSize = 5, methodology = 'M2C' } = {}) => {
  const { data } = await axios.post(`${agentBase}/start`, { namespace, batchSize, methodology });
  return data.data;
};

export const agentStop = async () => {
  const { data } = await axios.post(`${agentBase}/stop`);
  return data.data;
};

export const agentPause = async () => {
  const { data } = await axios.post(`${agentBase}/pause`);
  return data.data;
};

export const agentResume = async () => {
  const { data } = await axios.post(`${agentBase}/resume`);
  return data.data;
};

export const agentLogs = async (limit = 100) => {
  const { data } = await axios.get(`${agentBase}/logs`, { params: { limit } });
  return data.data;
};

export const connectAgentLogStream = (handlers = {}) => {
  const url = `${agentBase}/logs/stream`;
  const es = new EventSource(url);
  if (handlers.onHistory) es.addEventListener('history', e => handlers.onHistory(JSON.parse(e.data)));
  if (handlers.onEntry)   es.onmessage = e => handlers.onEntry(JSON.parse(e.data));
  if (handlers.onError)   es.onerror = handlers.onError;
  return es;
};

export const setConcurrency = async (concurrency) => {
  const { data } = await axios.post(`${base}/concurrency`, { concurrency });
  return data.data;
};

export const requeueDocuments = async (mode, documentIds = [], options = {}) => {
  const { data } = await axios.post(`${base}/requeue`, { mode, documentIds, options });
  return data.data;
};

export const getZeroEntityDocs = async () => {
  const { data } = await axios.get(`${base}/zero-entity-docs`);
  return data.data;
};

export const enqueuePendingFromQueue = async (options = {}, dryRun = false) => {
  const { data } = await axios.post(`${base}/enqueue-pending-from-queue`, { options, dryRun });
  return data.data;
};

// ─── Pipeline Statistics ──────────────────────────────────────────────────────

const statsBase = `${API_BASE_URL}/pipeline-stats`;

export const getStatsOverview = async (params = {}) => {
  const { data } = await axios.get(`${statsBase}/overview`, { params });
  return data.data;
};

export const getStatsTimeline = async (params = {}) => {
  const { data } = await axios.get(`${statsBase}/timeline`, { params });
  return data.data;
};

export const getStatsEntities = async (params = {}) => {
  const { data } = await axios.get(`${statsBase}/entities`, { params });
  return data.data;
};

export const getStatsNamespaces = async () => {
  const { data } = await axios.get(`${statsBase}/namespaces`);
  return data.data;
};

export const getStatsDocuments = async (params = {}) => {
  const { data } = await axios.get(`${statsBase}/documents`, { params });
  return data.data;
};

export const getStatsPerformance = async (params = {}) => {
  const { data } = await axios.get(`${statsBase}/performance`, { params });
  return data.data;
};

export const getStatsStepTiming = async (params = {}) => {
  const { data } = await axios.get(`${statsBase}/step-timing`, { params });
  return data.data;
};

// ─── Pipeline Advisor ─────────────────────────────────────────────────────────

export const advisorCommands = async () => {
  const { data } = await axios.get(`${base}/advisor/commands`);
  return data.data;
};

export const advisorAnalyze = async ({ jobId, message, history = [] }) => {
  const { data } = await axios.post(`${base}/advisor/analyze`, { jobId, message, history });
  return data.data;
};

export const connectStream = (handlers = {}) => {
  const url = `${base}/stream`;
  const es = new EventSource(url);
  if (handlers.onConnected) es.addEventListener('connected', e => handlers.onConnected(JSON.parse(e.data)));
  if (handlers.onJob)       es.addEventListener('job',       e => handlers.onJob(JSON.parse(e.data)));
  if (handlers.onError)     es.onerror = handlers.onError;
  return es;
};
