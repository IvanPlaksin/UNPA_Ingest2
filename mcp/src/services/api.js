import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

// Configurable API URL via centralized config
const API_URL = API_BASE_URL;

const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' }
});

export const sendChatMessage = async (message, userId, context) => {
    const response = await api.post('/chat', { message, userId, context });
    return response.data.response;
};

// ⭐ NEW METHODS

// Search Work Items (for Table)
export const searchWorkItems = async (filters = {}, page = 1, limit = 50) => {
    try {
        const response = await api.post('/rabbithole/search', { filters, page, limit });
        if (response.data.error) {
            console.error("Search API error:", response.data.error);
            return { items: [], total: 0 };
        }
        return { items: response.data.items || [], total: response.data.totalFound || 0 };
    } catch (error) {
        console.error("Search request failed:", error);
        return { items: [], total: 0 };
    }
};

// Legacy method wrapper
export const fetchWorkItemsList = async (query) => {
    // Just fetch recent items to fix the page for now
    const result = await searchWorkItems({}, 1, 50);
    return result.items;
};

// Trigger Ingestion
export const triggerIngestion = async (sourceType) => {
    return new Promise(resolve => setTimeout(resolve, 2000)); // Simulation
};

// Ingest Work Items
export const ingestWorkItems = async (ids, userId) => {
    const response = await api.post('/knowledge/ingest', { ids, userId });
    return response.data;
};

/**
 * Starts Ingestion Job
 * Supports legacy (ids, userId) or new (sourceConfig, userId)
 */
export const startIngestionJob = async (arg1, userId) => {
    try {
        let payload = {};
        if (Array.isArray(arg1)) {
            payload = { ids: arg1, userId };
        } else {
            payload = { sourceConfig: arg1, userId };
        }

        const response = await api.post('/knowledge/ingest', payload);
        return response.data;
    } catch (error) {
        console.warn("API failed, using mock for startIngestionJob:", error);
        return { jobId: `mock-job-${Date.now()}`, status: 'started' };
    }
};

/**
 * Get SSE Stream URL
 */
export const getIngestionStreamUrl = (jobId) => {
    return `${API_URL}/knowledge/stream/${jobId}`;
};

export const getWorkItemGraph = async (id) => {
    // Mock graph data
    return {
        nodes: [
            { id: '1', type: 'input', data: { label: `Task #${id}` }, position: { x: 250, y: 5 } },
            { id: '2', data: { label: 'Email: Re: Issue' }, position: { x: 100, y: 100 }, style: { background: '#fff3cd' } },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2' },
        ],
    };
};

export const getHealth = async () => {
    try {
        const response = await api.get('/health');
        return response.data;
    } catch (error) {
        console.error("Health check failed:", error);
        return null;
    }
};

// --- Connectors Methods ---

export const fetchConnectors = async () => {
    try {
        const response = await api.get('/connectors');
        return response.data.connectors || [];
    } catch (error) {
        console.error('Failed to fetch connectors:', error);
        return [];
    }
};

export const fetchConnectorStatus = async (name) => {
    try {
        const response = await api.get(`/connectors/${name}/status`);
        return response.data.status || null;
    } catch (error) {
        console.error(`Failed to fetch connector status for ${name}:`, error);
        return null;
    }
};

// --- TFVC Methods ---

export const fetchTfvcTree = async (path) => {
    const response = await api.get('/tfvc/tree', { params: { path } });
    return response.data;
};

export const fetchTfvcContent = async (path) => {
    const response = await api.get('/tfvc/content', { params: { path } });
    return response.data.content;
};

export const fetchTfvcHistory = async (path, limit = 20) => {
    const response = await api.get('/tfvc/history', { params: { path, limit, _t: Date.now() } });
    return response.data;
};

export const fetchTfvcChangesetChanges = async (id) => {
    const response = await api.get(`/tfvc/changesets/${id}/changes`);
    return response.data;
};

export const fetchTfvcDiff = async (path, changesetId) => {
    const response = await api.get('/tfvc/diff', { params: { path, changesetId } });
    return response.data;
};

// --- Ingestion Simulation Methods ---

export const simulateIngestion = async (formData) => {
    // This expects a FormData object with 'file' or 'text'
    // Currently using analyze-attachment as the endpoint logic is similar
    const response = await api.post('/knowledge/analyze-attachment', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

// Fetch basic entity details for initial graph
export const fetchEntityDetails = async (type, id) => {
    // Call the real backend endpoint
    const response = await api.get(`/nexus/entity/${type}/${id}`);

    // The backend should return the structured object we need
    return response.data;
};


export const fetchRepositories = async () => {
    // Mock for Git Repos
    return new Promise(resolve => {
        setTimeout(() => {
            resolve([
                { id: '1', name: 'UNPA_Ingest', url: 'https://dev.azure.com/unpa/_git/ingest' },
                { id: '2', name: 'UNPA_Frontend', url: 'https://dev.azure.com/unpa/_git/frontend' },
                { id: '3', name: 'Legacy_Core', url: 'https://dev.azure.com/unpa/_git/core' }
            ]);
        }, 500);
    });
};

// ────────────────────────────────────────────────────────────────────────────
// AI USAGE MONITORING API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get AI API usage statistics
 * @returns {Promise<Object>} Usage stats by provider
 */
export const getAIUsageStats = async () => {
    try {
        const response = await api.get('/ai-agent/usage');
        return response.data;
    } catch (error) {
        console.error('Failed to fetch AI usage stats:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get AI API health status
 * @returns {Promise<Object>} Health status
 */
export const getAIAgentHealth = async () => {
    try {
        const response = await api.get('/ai-agent/health');
        return response.data;
    } catch (error) {
        console.error('Failed to fetch AI agent health:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get available AI models
 * @returns {Promise<Array>} List of available models
 */
export const getAIModels = async () => {
    try {
        const response = await api.get('/ai-agent/models');
        return response.data;
    } catch (error) {
        console.error('Failed to fetch AI models:', error);
        return { success: false, data: [] };
    }
};

// ═══════════════════════════════════════════════════════════════════
// STRUCTURAL FORM API
// ═══════════════════════════════════════════════════════════════════

/**
 * List all STRUCTURAL graphs with their linked CONSTRAINT graphs.
 * @returns {Promise<Array<{graphId, name, namespace, nodeCount, constraint}>>}
 */
export const listStructuralGraphs = async () => {
    const response = await api.get('/forms/structural-graphs');
    return response.data.data;
};

/**
 * Get compiled form specification from STRUCTURAL + CONSTRAINT graphs.
 * @param {string} structuralGraphId
 * @param {object} [options] - { constraintGraphId, locale }
 * @returns {Promise<FormSpecification>}
 */
export const getFormSpecification = async (structuralGraphId, options = {}) => {
    const params = new URLSearchParams({ locale: options.locale || 'en' });
    if (options.constraintGraphId) params.append('constraintGraphId', options.constraintGraphId);

    const response = await api.get(`/forms/specification/${structuralGraphId}?${params}`);
    return response.data.data;
};

/**
 * Validate form data against STRUCTURAL + CONSTRAINT on the server.
 * @param {string} structuralGraphId
 * @param {object} formData
 * @param {object} [options] - { constraintGraphId, locale }
 * @returns {Promise<{ valid: boolean, errors: Array }>}
 */
export const validateFormData = async (structuralGraphId, formData, options = {}) => {
    const response = await api.post('/forms/validate', {
        structuralGraphId,
        constraintGraphId: options.constraintGraphId,
        data: formData,
        locale: options.locale || 'en',
    });
    return response.data;
};

// ─── DataSource API ──────────────────────────────────────────────────────────

/**
 * Load items from a DataSource.
 * @param {string} dataSourceId
 * @param {object} [params] - Query params (filters, limit, offset)
 * @param {object} [options] - { signal }
 */
export const getDataSourceItems = async (dataSourceId, params = {}, options = {}) => {
    const response = await api.get(`/datasources/${dataSourceId}/load`, {
        params,
        signal: options.signal,
    });
    return response.data;
};

/**
 * Search DataSource items (autocomplete).
 * @param {string} dataSourceId
 * @param {string} query - Search text
 * @param {object} [options] - { limit, signal, ...filters }
 */
export const searchDataSource = async (dataSourceId, query, options = {}) => {
    const { limit = 20, signal, ...filters } = options;
    const response = await api.get(`/datasources/${dataSourceId}/search`, {
        params: { q: query, limit, ...filters },
        signal,
    });
    return response.data;
};

/**
 * Validate a value exists in a DataSource.
 * @param {string} dataSourceId
 * @param {*} value
 * @param {string} [field]
 */
export const validateDataSourceValue = async (dataSourceId, value, field) => {
    const response = await api.post(`/datasources/${dataSourceId}/validate-value`, {
        value,
        field,
    });
    return response.data;
};

export default api;
