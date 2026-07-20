/**
 * Graph Transfer Service
 * Frontend API client for selective Memgraph(+Qdrant) export (/api/v1/graph-transfer).
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
    baseURL: `${API_BASE_URL}/graph-transfer`,
    headers: { 'Content-Type': 'application/json' },
});

/** POST /preview — counts + validation for a selection (no file written). */
export const previewExport = async (request) => {
    const r = await api.post('/preview', request);
    return r.data;
};

/** POST /jobs — enqueue an export job. Returns { success, jobId }. */
export const startExport = async (request) => {
    const r = await api.post('/jobs', request);
    return r.data;
};

/** GET /jobs — recent jobs. */
export const listJobs = async (limit = 50) => {
    const r = await api.get('/jobs', { params: { limit } });
    return r.data;
};

/** GET /jobs/:id — job detail. */
export const getJob = async (jobId) => {
    const r = await api.get(`/jobs/${jobId}`);
    return r.data;
};

/** GET /history — past ExportRecords. */
export const getHistory = async (limit = 50) => {
    const r = await api.get('/history', { params: { limit } });
    return r.data;
};

/** POST /jobs/rerun/:exportId — re-run a saved export (optional overrides). */
export const rerunExport = async (exportId, overrides = {}) => {
    const r = await api.post(`/jobs/rerun/${exportId}`, overrides);
    return r.data;
};

/** PUT /history/:exportId — update name/notes. */
export const updateExportRecord = async (exportId, updates) => {
    const r = await api.put(`/history/${exportId}`, updates);
    return r.data;
};

/** DELETE /history/:exportId — delete record (optionally the file). */
export const deleteExportRecord = async (exportId, deleteFile = false) => {
    const r = await api.delete(`/history/${exportId}`, { params: { deleteFile } });
    return r.data;
};

/** Download URL for a past export by exportId (history re-download). */
export const historyDownloadUrl = (exportId) => `${API_BASE_URL}/graph-transfer/history/${exportId}/download`;

/** GET /meta/collections — Qdrant collections + linkage info. */
export const getCollectionsMeta = async () => {
    const r = await api.get('/meta/collections');
    return r.data;
};

/** GET /meta/collections/:collection/payload-schema — distinct payload values (sampled). */
export const getPayloadSchema = async (collection) => {
    const r = await api.get(`/meta/collections/${encodeURIComponent(collection)}/payload-schema`);
    return r.data;
};

/** GET /catalog-tree — paginated GXE catalog tree level. */
export const getCatalogTree = async (params = {}) => {
    const r = await api.get('/catalog-tree', { params });
    return r.data;
};

/** GET /domains — data-domain map with live counts. */
export const getDomains = async () => {
    const r = await api.get('/domains');
    return r.data;
};

/** GET /domains/:id — domain drill-down (distinct count, namespaces, vectors). */
export const getDomainDetails = async (domainId) => {
    const r = await api.get(`/domains/${encodeURIComponent(domainId)}`);
    return r.data;
};

/** POST /domains/build-request — assemble an ExportRequest from selected domains. */
export const buildDomainRequest = async (domainIds, options = {}) => {
    const r = await api.post('/domains/build-request', { domainIds, options });
    return r.data;
};

// ── Export Assistant (AI chat) — different base path (/export-assistant) ──
const assistantApi = axios.create({ baseURL: `${API_BASE_URL}/export-assistant`, headers: { 'Content-Type': 'application/json' } });

/** POST /export-assistant/chat — natural-language export assistant (sync). */
export const chatWithAssistant = async (messages) => {
    const r = await assistantApi.post('/chat', { messages });
    return r.data;
};

/** SSE URL for streaming assistant responses. */
export const chatStreamUrl = () => `${API_BASE_URL}/export-assistant/chat/stream`;

/** SSE progress stream URL for a job (consume via native EventSource). */
export const jobEventsUrl = (jobId) => `${API_BASE_URL}/graph-transfer/jobs/${jobId}/events`;

/** Download URL for a completed export package. */
export const jobDownloadUrl = (jobId) => `${API_BASE_URL}/graph-transfer/jobs/${jobId}/download`;

export default { previewExport, startExport, listJobs, getJob, getHistory, jobEventsUrl, jobDownloadUrl };
