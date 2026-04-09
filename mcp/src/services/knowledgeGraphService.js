/**
 * Knowledge Graph Service
 * Provides functions to fetch and manipulate knowledge graph data from Memgraph
 */

import { API_BASE_URL } from '../config/api.config';

/**
 * Fetch full knowledge graph from Memgraph
 * @returns {Promise<{nodes: Array, edges: Array}>}
 */
export const fetchKnowledgeGraphData = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge/graph`);
        if (!response.ok) {
            throw new Error(`Failed to fetch knowledge graph: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching knowledge graph:', error);
        throw error;
    }
};

/**
 * Fetch knowledge graph filtered by node type
 * @param {string[]} types - Array of node types (e.g., ['Project', 'Knowledge'])
 * @returns {Promise<{nodes: Array, edges: Array}>}
 */
export const fetchKnowledgeGraphByType = async (types) => {
    try {
        const typeQuery = types.map(t => `type=${encodeURIComponent(t)}`).join('&');
        const response = await fetch(`${API_BASE_URL}/knowledge/graph?${typeQuery}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch knowledge graph by type: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching knowledge graph by type:', error);
        throw error;
    }
};

/**
 * Fetch subgraph around a specific node
 * @param {string} nodeId - ID of the center node
 * @param {number} depth - Depth of traversal (default: 2)
 * @returns {Promise<{nodes: Array, edges: Array}>}
 */
export const fetchSubgraph = async (nodeId, depth = 2) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/knowledge/graph/subgraph/${encodeURIComponent(nodeId)}?depth=${depth}`
        );
        if (!response.ok) {
            throw new Error(`Failed to fetch subgraph: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching subgraph:', error);
        throw error;
    }
};

/**
 * Search nodes by property
 * @param {string} property - Property name (e.g., 'name', 'title')
 * @param {string} value - Search value
 * @returns {Promise<Array>}
 */
export const searchNodes = async (property, value) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/knowledge/search?property=${encodeURIComponent(property)}&value=${encodeURIComponent(value)}`
        );
        if (!response.ok) {
            throw new Error(`Failed to search nodes: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error searching nodes:', error);
        throw error;
    }
};

/**
 * Get node details by ID
 * @param {string} nodeId - Node ID
 * @returns {Promise<Object>}
 */
export const getNodeDetails = async (nodeId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge/node/${encodeURIComponent(nodeId)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch node details: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching node details:', error);
        throw error;
    }
};

/**
 * Get relationships for a specific node
 * @param {string} nodeId - Node ID
 * @param {string} direction - 'in', 'out', or 'both' (default: 'both')
 * @returns {Promise<Array>}
 */
export const getNodeRelationships = async (nodeId, direction = 'both') => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/knowledge/node/${encodeURIComponent(nodeId)}/relationships?direction=${direction}`
        );
        if (!response.ok) {
            throw new Error(`Failed to fetch node relationships: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching node relationships:', error);
        throw error;
    }
};

/**
 * Execute a custom Cypher query
 * @param {string} query - Cypher query string (read-only)
 * @returns {Promise<Object>}
 */
export const executeCypherQuery = async (query) => {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query })
        });
        if (!response.ok) {
            throw new Error(`Failed to execute Cypher query: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error executing Cypher query:', error);
        throw error;
    }
};

/**
 * Get graph statistics
 * @returns {Promise<Object>}
 */
export const getGraphStats = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge/stats`);
        if (!response.ok) {
            throw new Error(`Failed to fetch graph stats: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching graph stats:', error);
        throw error;
    }
};

/**
 * Find related entities using MCP tool
 * @param {string} entityName - Name of the entity
 * @param {number} depth - Traversal depth (default: 2)
 * @param {string} relationType - Optional relation type filter
 * @returns {Promise<Object>}
 */
export const findRelatedEntities = async (entityName, depth = 2, relationType = null) => {
    try {
        const params = new URLSearchParams({
            entity: entityName,
            depth: depth.toString()
        });
        if (relationType) {
            params.append('relation_type', relationType);
        }

        const response = await fetch(`${API_BASE_URL}/knowledge/related?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to find related entities: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error finding related entities:', error);
        throw error;
    }
};

/**
 * Get shortest path between two nodes
 * @param {string} fromId - Source node ID
 * @param {string} toId - Target node ID
 * @param {number} maxDepth - Maximum path length (default: 5)
 * @returns {Promise<Object>}
 */
export const findShortestPath = async (fromId, toId, maxDepth = 5) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/knowledge/path?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}&maxDepth=${maxDepth}`
        );
        if (!response.ok) {
            throw new Error(`Failed to find shortest path: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error finding shortest path:', error);
        throw error;
    }
};

/**
 * Fetch data for Knowledge Planes visualization
 * Returns nodes mapped to 5 layers with vector-based positioning
 * @param {string} projectId - Optional project filter
 * @param {number} limit - Maximum nodes to fetch (default: 200)
 * @returns {Promise<Object>} - { nodes, edges, bridges, ancestorMap, metadata }
 */
export const fetchKnowledgePlanesData = async (projectId = null, limit = 200) => {
    try {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (projectId) {
            params.append('projectId', projectId);
        }

        const response = await fetch(`${API_BASE_URL}/knowledge/planes?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch knowledge planes data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching knowledge planes data:', error);
        throw error;
    }
};

export default {
    fetchKnowledgeGraphData,
    fetchKnowledgeGraphByType,
    fetchSubgraph,
    searchNodes,
    getNodeDetails,
    getNodeRelationships,
    executeCypherQuery,
    getGraphStats,
    findRelatedEntities,
    findShortestPath,
    fetchKnowledgePlanesData
};
