/**
 * Centralized API Configuration
 * All API URLs should reference this config
 */

// Base API URL from environment variable or default
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010/api/v1';

// Extract just the host for SSE connections; fall back to current origin when URL is relative
const urlParts = API_BASE_URL.match(/^(https?:\/\/[^/]+)/);
export const API_HOST = urlParts
    ? urlParts[1]
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3010');

// API Endpoints
export const API_ENDPOINTS = {
    // Chat
    CHAT_STREAM: `${API_BASE_URL}/chat/stream`,

    // RabbitHole
    RABBITHOLE_SEARCH: `${API_BASE_URL}/rabbithole/search`,
    RABBITHOLE_CHAT: `${API_BASE_URL}/rabbithole/chat`,

    // Nexus
    NEXUS_ENTITY: (type, id) => `${API_BASE_URL}/nexus/entity/${type}/${id}`,
    NEXUS_STREAM_ANALYZE: (entityType, entityId, sources) =>
        `${API_BASE_URL}/nexus/stream/analyze?entityType=${entityType}&entityId=${entityId}&sources=${sources}`,

    // Knowledge
    KNOWLEDGE_GRAPH: `${API_BASE_URL}/knowledge/graph`,
    KNOWLEDGE_INGEST: `${API_BASE_URL}/knowledge/ingest`,
    KNOWLEDGE_STREAM: (jobId) => `${API_BASE_URL}/knowledge/stream/${jobId}`,

    // TFVC
    TFVC_TREE: `${API_BASE_URL}/tfvc/tree`,
    TFVC_CONTENT: `${API_BASE_URL}/tfvc/content`,
    TFVC_HISTORY: `${API_BASE_URL}/tfvc/history`,

    // Health
    HEALTH: `${API_BASE_URL}/health`,
};

export default {
    API_BASE_URL,
    API_HOST,
    API_ENDPOINTS,
};
