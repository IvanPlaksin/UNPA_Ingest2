/**
 * WorkSpace API Service
 *
 * Frontend HTTP client for WorkSpace REST API.
 * All calls go to /api/v1/workspaces/*
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/workspaces`,
  headers: { 'Content-Type': 'application/json' }
});

// ==================== WORKSPACE LIFECYCLE ====================

export const listWorkspaces = async (params = {}) => {
  const { data } = await api.get('/', { params });
  return data;
};

export const getWorkspace = async (id) => {
  const { data } = await api.get(`/${id}`);
  return data;
};

export const createWorkspace = async ({ name, description, domain, tags }) => {
  const { data } = await api.post('/', { name, description, domain, tags });
  return data;
};

export const updateWorkspace = async (id, updates) => {
  const { data } = await api.patch(`/${id}`, updates);
  return data;
};

export const updateWorkspaceStatus = async (id, status, reason = '') => {
  const { data } = await api.patch(`/${id}/status`, { status, reason });
  return data;
};

export const archiveWorkspace = async (id) => {
  const { data } = await api.delete(`/${id}`);
  return data;
};

export const deleteWorkspacePermanent = async (id) => {
  const { data } = await api.delete(`/${id}/permanent`);
  return data;
};

export const getWorkspaceStats = async (id) => {
  const { data } = await api.get(`/${id}/stats`);
  return data;
};

// ==================== SOURCES ====================

export const listSources = async (wsId) => {
  const { data } = await api.get(`/${wsId}/sources`);
  return data;
};

export const addSource = async (wsId, sourceData) => {
  const { data } = await api.post(`/${wsId}/sources`, sourceData);
  return data;
};

export const uploadFileSource = async (wsId, file, description = '') => {
  const formData = new FormData();
  formData.append('file', file);
  if (description) formData.append('description', description);
  const { data } = await api.post(`/${wsId}/sources/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
};

export const getSource = async (wsId, sourceId) => {
  const { data } = await api.get(`/${wsId}/sources/${sourceId}`);
  return data;
};

export const getSourceDetails = async (wsId, sourceId) => {
  const { data } = await api.get(`/${wsId}/sources/${sourceId}/details`);
  return data;
};

export const analyzeSource = async (wsId, sourceId) => {
  const { data } = await api.post(`/${wsId}/sources/${sourceId}/analyze`);
  return data;
};

export const startExtraction = async (wsId, sourceId, options = {}) => {
  const { data } = await api.post(`/${wsId}/sources/${sourceId}/extract`, options);
  return data;
};

export const getExtractionStatus = async (wsId, jobId) => {
  const { data } = await api.get(`/${wsId}/extract/${jobId}`);
  return data;
};

export const cancelExtraction = async (wsId, jobId) => {
  const { data } = await api.delete(`/${wsId}/extract/${jobId}`);
  return data;
};

export const listExtractionJobs = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/extract/jobs`, { params });
  return data;
};

export const deleteSource = async (wsId, sourceId) => {
  const { data } = await api.delete(`/${wsId}/sources/${sourceId}`);
  return data;
};

// ==================== DRAFTS ====================

export const listDrafts = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/drafts`, { params });
  return data;
};

export const getDraft = async (wsId, draftId) => {
  const { data } = await api.get(`/${wsId}/drafts/${draftId}`);
  return data;
};

export const createDraft = async (wsId, draftData) => {
  const { data } = await api.post(`/${wsId}/drafts`, draftData);
  return data;
};

export const updateDraft = async (wsId, draftId, updates) => {
  const { data } = await api.patch(`/${wsId}/drafts/${draftId}`, updates);
  return data;
};

export const deleteDraft = async (wsId, draftId) => {
  const { data } = await api.delete(`/${wsId}/drafts/${draftId}`);
  return data;
};

export const searchDrafts = async (wsId, query, params = {}) => {
  const { data } = await api.post(`/${wsId}/drafts/search`, { query, ...params });
  return data;
};

// ==================== EDGES ====================

export const createEdge = async (wsId, edgeData) => {
  const { data } = await api.post(`/${wsId}/edges`, edgeData);
  return data;
};

export const getEdges = async (wsId, draftId, direction = 'both') => {
  const { data } = await api.get(`/${wsId}/drafts/${draftId}/edges`, { params: { direction } });
  return data;
};

// ==================== KB ACCESS (READ-ONLY) ====================

export const kbSearch = async (wsId, query, params = {}) => {
  const { data } = await api.post(`/${wsId}/kb/search`, { query, ...params });
  return data;
};

export const kbGetNode = async (wsId, entityId, full = false) => {
  const { data } = await api.get(`/${wsId}/kb/nodes/${entityId}`, { params: { full } });
  return data;
};

// ==================== PROMOTION ====================

export const computePromotionDiff = async (wsId, options = {}) => {
  const { data } = await api.post(`/${wsId}/promotion/diff`, options);
  return data;
};

export const executePromotion = async (wsId, options = {}) => {
  const { data } = await api.post(`/${wsId}/promotion/execute`, options);
  return data;
};

// ==================== AUDIT ====================

export const getAuditLog = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/audit`, { params });
  return data;
};

// ==================== DATASOURCE CATALOG (BRIDGE) ====================

export const listWorkspaceDataSources = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/datasources`, { params });
  return data;
};

export const registerWorkspaceSourceAsDataSource = async (wsId, sourceId) => {
  const { data } = await api.post(`/${wsId}/datasources/register-source`, { sourceId });
  return data;
};

/**
 * Create a v2 DataSource scoped to the workspace AND a paired SourceReference
 * in one transaction. Used by the unified DataSourceCreateDialog from
 * the workspace SourcesTab.
 */
export const createWorkspaceDataSource = async (wsId, dataSourceConfig) => {
  const { data } = await api.post(`/${wsId}/datasources`, dataSourceConfig);
  return data;
};

// ==================== ANALYSIS ====================

export const getAnalysisSuggestions = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/analysis/suggestions`, { params });
  return data;
};

export const getAnalysisCoverage = async (wsId) => {
  const { data } = await api.get(`/${wsId}/analysis/coverage`);
  return data;
};

export const getAnalysisReport = async (wsId) => {
  const { data } = await api.get(`/${wsId}/analysis/report`);
  return data;
};

// ==================== GRAPH (CANVAS) ====================

export const getWorkspaceGraph = async (wsId) => {
  const { data } = await api.get(`/${wsId}/graph`);
  return data;
};

export const saveWorkspaceGraph = async (wsId, payload) => {
  // payload: { nodes, edges, createCheckpoint?, checkpointNote? }
  const { data } = await api.put(`/${wsId}/graph`, payload);
  return data;
};

// ==================== GRAPH VERSIONS ====================

export const listGraphVersions = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/versions`, { params });
  return data;
};

export const getGraphVersion = async (wsId, versionId) => {
  const { data } = await api.get(`/${wsId}/versions/${versionId}`);
  return data;
};

export const createGraphVersion = async (wsId, { note, createdBy } = {}) => {
  const { data } = await api.post(`/${wsId}/versions`, { note, createdBy });
  return data;
};

export const restoreGraphVersion = async (wsId, versionId) => {
  const { data } = await api.post(`/${wsId}/versions/${versionId}/restore`, { confirm: true });
  return data;
};

export const diffGraphVersions = async (wsId, v1, v2) => {
  const { data } = await api.get(`/${wsId}/versions/diff`, { params: { v1, v2 } });
  return data;
};

// ==================== AGENT ====================

export const getAgentSession = async (wsId) => {
  const { data } = await api.get(`/${wsId}/agent/session`);
  return data;
};

export const clearAgentSession = async (wsId) => {
  const { data } = await api.delete(`/${wsId}/agent/session`);
  return data;
};

export const getAgentActions = async (wsId, params = {}) => {
  const { data } = await api.get(`/${wsId}/agent/actions`, { params });
  return data;
};

/**
 * Open an SSE stream of agent events for a single user message.
 * Returns the EventSource — caller must close().
 *
 * NOTE: standard EventSource doesn't support POST bodies. We use fetch + ReadableStream.
 * This helper returns an async iterator over parsed events.
 */
export const streamAgentMessage = async (wsId, message, onEvent) => {
  const resp = await fetch(`${API_BASE_URL}/workspaces/${wsId}/agent/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  if (!resp.body) throw new Error('No response body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const lines = part.split('\n');
      let eventName = 'message';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataStr += line.slice(6);
      }
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          onEvent?.(eventName, parsed);
        } catch {
          onEvent?.(eventName, { raw: dataStr });
        }
      }
    }
  }
};
