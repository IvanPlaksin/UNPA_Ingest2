/**
 * Dialogue API Service — DevDialogue Collector
 * Frontend HTTP client for /api/v1/dialogue/*
 */

import { API_BASE_URL } from '../config/api.config';

const BASE = `${API_BASE_URL}/dialogue`;

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Sessions ────────────────────────────────────────────────────────────────

export const getSessions = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.platform) params.set('platform', filters.platform);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.project) params.set('project', filters.project);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.limit != null) params.set('limit', filters.limit);
  if (filters.offset != null) params.set('offset', filters.offset);
  return request(`${BASE}/sessions?${params}`);
};

export const getSession = (sessionId, full = false) =>
  request(`${BASE}/sessions/${sessionId}${full ? '?full=true' : ''}`);

export const getSessionContext = (sessionId) =>
  request(`${BASE}/sessions/${sessionId}/context`);

export const getRelatedSessions = (sessionId, limit = 5) =>
  request(`${BASE}/sessions/${sessionId}/related?limit=${limit}`);

export const getRelatedDialoguesForBacklog = (backlogId) =>
  request(`${BASE}/related/backlog/${encodeURIComponent(backlogId)}`);

export const getProvenanceChain = (type, nodeId) =>
  request(`${BASE}/provenance/${type}/${encodeURIComponent(nodeId)}`);

export const getAnalytics = (period = 'all') =>
  request(`${BASE}/analytics?period=${encodeURIComponent(period)}`);

// ── Search ──────────────────────────────────────────────────────────────────

export const searchDialogue = (query, options = {}) =>
  request(`${BASE}/search`, {
    method: 'POST',
    body: JSON.stringify({ query, ...options }),
  });

// ── Decisions ───────────────────────────────────────────────────────────────

export const getDecisions = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.category) params.set('category', filters.category);
  if (filters.minConfidence != null) params.set('minConfidence', filters.minConfidence);
  if (filters.limit != null) params.set('limit', filters.limit);
  return request(`${BASE}/decisions?${params}`);
};

export const getDecisionDetail = (decisionId) =>
  request(`${BASE}/decisions/${decisionId}`);

export const getDecisionProvenance = (query, limit = 10) =>
  request(`${BASE}/decisions/provenance?${new URLSearchParams({ query, limit })}`);

// ── Re-analysis ─────────────────────────────────────────────────────────────

export const reanalyzeSession = (sessionId) =>
  request(`${BASE}/sessions/${sessionId}/reanalyze`, { method: 'POST' });

// ── AI Search ───────────────────────────────────────────────────────────────

export const aiSearchDialogue = (query) =>
  request(`${BASE}/ai-search`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

// ── Stats & Metrics ─────────────────────────────────────────────────────────

export const getStats = () => request(`${BASE}/stats`);

export const getMetrics = () => request(`${BASE}/metrics`);

// ── Ingestion ────────────────────────────────────────────────────────────────

export const triggerIngestion = (sourcePath, options = {}) =>
  request(`${BASE}/ingest`, {
    method: 'POST',
    body: JSON.stringify({ path: sourcePath, incremental: true, ...options }),
  });

// ── Class-based singleton (for consumers that prefer OOP style) ─────────────

class DialogueService {
  getSessions = getSessions;
  getSession = getSession;
  getSessionContext = getSessionContext;
  getRelatedSessions = getRelatedSessions;
  search = searchDialogue;
  aiSearch = aiSearchDialogue;
  reanalyzeSession = reanalyzeSession;
  getDecisions = getDecisions;
  getDecisionDetail = getDecisionDetail;
  getDecisionProvenance = getDecisionProvenance;
  getStats = getStats;
  getMetrics = getMetrics;
  triggerIngestion = triggerIngestion;
}

export const dialogueService = new DialogueService();
export default dialogueService;
