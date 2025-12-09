import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003/api/v1';

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
 */
export const startIngestionJob = async (ids, userId) => {
    try {
        const response = await api.post('/knowledge/ingest', { ids, userId });
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

export default api;
