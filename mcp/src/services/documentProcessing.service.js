/**
 * Document Processing API Service
 * Wraps /api/v1/documents endpoints
 */
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const base = `${API_BASE_URL}/documents`;

/**
 * Upload a file. Returns { documentId, filename, status, namespace } immediately;
 * classification runs asynchronously server-side.
 */
export async function uploadDocument(file, namespace = 'DEFAULT') {
    const form = new FormData();
    form.append('file', file);
    form.append('namespace', namespace);
    const { data } = await axios.post(`${base}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data.data;
}

/** Re-trigger classification for a document. */
export async function classifyDocument(documentId) {
    const { data } = await axios.post(`${base}/${documentId}/classify`);
    return data.data;
}

/** Override classification with a specific UN document type code. */
export async function overrideClassification(documentId, typeCode, reason = '') {
    const { data } = await axios.post(`${base}/${documentId}/classify/override`, { typeCode, reason });
    return data.data;
}

/** Trigger extraction pipeline for a classified document. */
export async function extractDocument(documentId, options = {}) {
    const { data } = await axios.post(`${base}/${documentId}/extract`, options);
    return data.data;
}

/** List available extraction models (Claude + regex). */
export async function getExtractionModels() {
    const { data } = await axios.get(`${base}/models`);
    return data.data;
}

/** Get full document status including classification result. */
export async function getDocumentStatus(documentId) {
    const { data } = await axios.get(`${base}/${documentId}/status`);
    return data.data;
}

/**
 * List documents with optional filters.
 * @param {{ namespace?, status?, layer?, since?, limit?, offset? }} filters
 */
export async function listDocuments(filters = {}) {
    const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v != null && v !== '')
    );
    const { data } = await axios.get(base, { params });
    return data;
}

/** Aggregate stats: total + by-status breakdown. */
export async function getDocumentStats(namespace) {
    const params = namespace ? { namespace } : {};
    const { data } = await axios.get(`${base}/stats`, { params });
    return data.data;
}

/** List all available UN document types (from Memgraph). */
export async function listDocumentTypes() {
    const { data } = await axios.get(`${base}/types`);
    return data.data;
}
