import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const BASE = `${API_BASE_URL}/document-index`;

// Local cross-source document search (never hits external sources).
export const searchIndex   = (params = {}) => axios.get(`${BASE}/search`, { params }).then(r => r.data);
export const getIndexFacets = (params = {}) => axios.get(`${BASE}/facets`, { params }).then(r => r.data);
export const getIndexStats  = ()            => axios.get(`${BASE}/stats`).then(r => r.data);
export const getIndexedDocument = (id)      => axios.get(`${BASE}/${id}/document`).then(r => r.data);

// Indexer control.
export const getIndexerStatus = ()          => axios.get(`${BASE}/status`).then(r => r.data);
export const controlIndexer   = (action)    => axios.post(`${BASE}/control`, { action }).then(r => r.data);
export const reindexSource    = (id, body = {}) => axios.post(`${BASE}/sources/${id}/reindex`, body).then(r => r.data);
export const probeSourceCount = (id)            => axios.post(`${BASE}/sources/${id}/probe-count`).then(r => r.data);
export const recountAllSources = (body = {})    => axios.post(`${BASE}/recount-all`, body).then(r => r.data);
export const setSourceEnabled  = (id, enabled)   => axios.post(`${BASE}/sources/${id}/enabled`, { enabled }).then(r => r.data);

// Pool-share quota allocation.
export const getQuota          = ()              => axios.get(`${BASE}/quota`).then(r => r.data);
export const setQuotaMode      = (mode, body = {}) => axios.post(`${BASE}/quota/mode`, { mode, ...body }).then(r => r.data);
export const setQuotaShares    = (shares)        => axios.post(`${BASE}/quota/shares`, { shares }).then(r => r.data);

// Observability: processing errors/warnings log + throughput series.
export const getIndexErrors     = (params = {}) => axios.get(`${BASE}/errors`, { params }).then(r => r.data);
export const getIndexThroughput = (minutes = 60) => axios.get(`${BASE}/throughput`, { params: { minutes } }).then(r => r.data);
export const getIndexCategories = ()             => axios.get(`${BASE}/categories`).then(r => r.data);

// Indexer config — worker count applied instantly.
export const setIndexerConfig   = (body = {})    => axios.post(`${BASE}/config`, body).then(r => r.data);

// Quarantine — durable source & per-document parking (survives restart).
export const getQuarantine      = ()             => axios.get(`${BASE}/quarantine`).then(r => r.data);
export const quarantineSource   = (id, body = {}) => axios.post(`${BASE}/sources/${id}/quarantine`, body).then(r => r.data);
export const unquarantineSource = (id)           => axios.post(`${BASE}/sources/${id}/unquarantine`).then(r => r.data);
export const clearDocQuarantine = (id)           => axios.post(`${BASE}/sources/${id}/clear-doc-quarantine`).then(r => r.data);

// Incident / AI error-response system.
export const getIncidents       = (params = {})  => axios.get(`${BASE}/incidents`, { params }).then(r => r.data);
export const getIncident        = (id)           => axios.get(`${BASE}/incidents/${id}`).then(r => r.data);
export const decideIncidentAction = (id, actionId, decision) =>
  axios.post(`${BASE}/incidents/${id}/actions/${actionId}/decision`, { decision }).then(r => r.data);
export const resolveIncident    = (id)           => axios.post(`${BASE}/incidents/${id}/resolve`, {}).then(r => r.data);
export const chatIncident       = (id, text)     => axios.post(`${BASE}/incidents/${id}/chat`, { text }).then(r => r.data);
export const getCriticality     = ()             => axios.get(`${BASE}/criticality`).then(r => r.data);
export const patchCriticality   = (body)         => axios.patch(`${BASE}/criticality`, body).then(r => r.data);
export const getAiState         = ()             => axios.get(`${BASE}/ai/state`).then(r => r.data);
export const runAi              = ()             => axios.post(`${BASE}/ai/run`, {}).then(r => r.data);

export const getIndexProgressUrl = () => `${BASE}/progress`;
