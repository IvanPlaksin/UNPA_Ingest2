/**
 * Graph Catalog Service
 * Frontend API service for GXE graph catalog operations
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: `${API_BASE_URL}/graph-catalog`,
  headers: { 'Content-Type': 'application/json' }
});

// Graph types enum (mirrors backend)
export const GRAPH_TYPES = {
  ATOMIC: 'atomic',
  TOOL: 'tool',
  BUSINESS: 'business',
  COMPOSITE: 'composite',
  TEMPLATE: 'template'
};

// Type display info
export const GRAPH_TYPE_INFO = {
  atomic: { label: 'Atomic Graphs', icon: 'Atom', color: 'cyan' },
  tool: { label: 'Tool Graphs', icon: 'Wrench', color: 'green' },
  business: { label: 'Business Logic', icon: 'Briefcase', color: 'blue' },
  composite: { label: 'Composite Graphs', icon: 'Layers', color: 'purple' },
  template: { label: 'Templates', icon: 'FileCode', color: 'orange' }
};

/**
 * List graphs with filtering
 * @param {Object} options - Filter options
 * @returns {Promise<Object>} { data, pagination }
 */
export const listGraphs = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    if (options.label) params.append('namespace', options.label);
    if (options.namespace) params.append('namespace', options.namespace);
    if (options.type) params.append('type', options.type);
    if (options.search) params.append('search', options.search);
    if (options.tags?.length) params.append('tags', options.tags.join(','));
    if (options.parentId) params.append('parentId', options.parentId);
    if (options.rootOnly) params.append('rootOnly', 'true');
    if (options.page) params.append('page', String(options.page));
    if (options.limit) params.append('limit', String(options.limit));

    const queryString = params.toString();
    const url = queryString ? `/?${queryString}` : '/';

    const response = await api.get(url);

    // Handle response format: { success, data, pagination }
    return {
      data: response.data?.data || [],
      pagination: response.data?.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 },
      warning: response.data?.warning
    };
  } catch (error) {
    console.error('Failed to list graphs:', error);
    // Return empty result on error instead of throwing
    return {
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      warning: error.message
    };
  }
};

/**
 * Get graph tree structure
 * @param {Object} options - Filter options
 * @param {string} options.namespace - Optional namespace filter
 * @param {string} options.search - Optional search term (server-side)
 * @param {string} options.type - Optional type filter
 * @returns {Promise<Object>} { tree, warning? }
 */
export const getGraphTree = async (options = {}) => {
  try {
    // Support both old signature (string) and new signature (object)
    const opts = typeof options === 'string' ? { namespace: options } : options;

    const params = new URLSearchParams();
    if (opts.namespace) params.append('namespace', opts.namespace);
    if (opts.search) params.append('search', opts.search);
    if (opts.type) params.append('type', opts.type);

    const queryString = params.toString();
    const url = queryString ? `/tree?${queryString}` : '/tree';

    const response = await api.get(url);
    return {
      tree: response.data.data,
      warning: response.data.warning || null
    };
  } catch (error) {
    console.error('Failed to get graph tree:', error);
    // Return empty tree on network error
    return {
      tree: { atomic: [], tool: [], business: [], composite: [], template: [] },
      warning: 'Failed to connect: ' + error.message
    };
  }
};

/**
 * Get connection status
 * @returns {Promise<Object>} { connected, error? }
 */
export const getStatus = async () => {
  try {
    const response = await api.get('/status');
    return response.data;
  } catch (error) {
    return { connected: false, error: error.message };
  }
};

/**
 * Get graph by ID
 * @param {string} id - Graph ID
 * @returns {Promise<Object>}
 */
export const getGraphById = async (id) => {
  try {
    const response = await api.get(`/${id}`);
    return response.data.data;
  } catch (error) {
    console.error('Failed to get graph:', error);
    throw error;
  }
};

/**
 * Create new graph
 * @param {Object} data - Graph data
 * @returns {Promise<Object>}
 */
export const createGraph = async (data) => {
  try {
    const response = await api.post('/', data);
    return response.data.data;
  } catch (error) {
    console.error('Failed to create graph:', error);
    throw error;
  }
};

/**
 * Update graph
 * @param {string} id - Graph ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>}
 */
export const updateGraph = async (id, updates) => {
  try {
    const response = await api.put(`/${id}`, updates);
    return response.data.data;
  } catch (error) {
    console.error('Failed to update graph:', error);
    throw error;
  }
};

/**
 * Delete graph
 * @param {string} id - Graph ID
 * @returns {Promise<boolean>}
 */
export const deleteGraph = async (id) => {
  try {
    await api.delete(`/${id}`);
    return true;
  } catch (error) {
    console.error('Failed to delete graph:', error);
    throw error;
  }
};

/**
 * Clone graph
 * @param {string} id - Source graph ID
 * @param {Object} overrides - Properties to override
 * @returns {Promise<Object>}
 */
export const cloneGraph = async (id, overrides = {}) => {
  try {
    const response = await api.post(`/${id}/clone`, overrides);
    return response.data.data;
  } catch (error) {
    console.error('Failed to clone graph:', error);
    throw error;
  }
};

/**
 * Get all namespaces with counts
 * @returns {Promise<Array>}
 */
export const getNamespaces = async () => {
  try {
    const response = await api.get('/namespaces');
    return response.data?.data || [];
  } catch (error) {
    console.error('Failed to get namespaces:', error);
    // Return empty array on error instead of throwing
    return [];
  }
};

/**
 * Get all graph types with counts
 * @returns {Promise<Object>}
 */
export const getTypes = async () => {
  try {
    const response = await api.get('/types');
    return response.data;
  } catch (error) {
    console.error('Failed to get types:', error);
    throw error;
  }
};

/**
 * Get all unique labels (tags) with counts
 * @returns {Promise<Array>} Array of { label, count }
 */
export const getLabels = async () => {
  try {
    const response = await api.get('/labels');
    return response.data?.data || [];
  } catch (error) {
    console.error('Failed to get labels:', error);
    return [];
  }
};

/**
 * Get subgraphs for a parent graph
 * @param {string} parentGraphId - Parent graph ID
 * @returns {Promise<Array>} Array of subgraph metadata
 */
export const getSubGraphs = async (parentGraphId) => {
  try {
    const response = await api.get(`/${parentGraphId}/subgraphs`);
    return response.data?.data || [];
  } catch (error) {
    console.error('Failed to get subgraphs:', error);
    return [];
  }
};

/**
 * Get subgraph for a specific node in a parent graph
 * @param {string} parentGraphId - Parent graph ID
 * @param {string} nodeId - Node ID in parent graph
 * @returns {Promise<Object|null>} Subgraph data or null
 */
export const getSubGraphForNode = async (parentGraphId, nodeId) => {
  try {
    const response = await api.get(`/${parentGraphId}/subgraphs/${nodeId}`);
    return response.data?.data || null;
  } catch (error) {
    // Node might not have a subgraph - this is not an error
    if (error.response?.status === 404) {
      return null;
    }
    console.error('Failed to get subgraph for node:', error);
    return null;
  }
};

/**
 * Expand a SubGraph node — get internal nodes, edges, and ports.
 * Calls the /api/v1/subgraph/:id/expand endpoint.
 */
export const expandSubgraphNode = async (subgraphId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/subgraph/${subgraphId}/expand`);
    const data = response.data;
    if (!data?.nodes?.length) return null;

    return {
      nodes: data.nodes.map(n => ({
        id: n.id || n.properties?.id,
        name: n.name || n.properties?.name || n.id,
        type: n.type || 'Node',
        ...n.properties,
        isSubgraphNode: true,
        parentSubgraphId: subgraphId,
      })),
      links: (data.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
      ports: data.ports || [],
    };
  } catch (error) {
    console.error('Failed to expand subgraph:', error);
    return null;
  }
};

/**
 * List all SubGraphs for a namespace.
 */
export const listSubgraphs = async (namespace) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/subgraph/list`, { params: { namespace } });
    return response.data || [];
  } catch (error) {
    console.error('Failed to list subgraphs:', error);
    return [];
  }
};

/**
 * Get all versions of a graph
 * @param {string} id - Graph entry ID
 * @returns {Promise<Array>} Array of { versionId, versionNumber, changelog, createdAt, ... }
 */
export const getVersions = async (id) => {
  try {
    const response = await api.get(`/${id}/versions`);
    return response.data?.data || [];
  } catch (error) {
    console.error('Failed to get versions:', error);
    return [];
  }
};

/**
 * Get a specific version of a graph
 * @param {string} id - Graph entry ID
 * @param {number} versionNumber - Version number
 * @returns {Promise<Object|null>}
 */
export const getVersion = async (id, versionNumber) => {
  try {
    const response = await api.get(`/${id}/version/${versionNumber}`);
    return response.data?.data || null;
  } catch (error) {
    console.error('Failed to get version:', error);
    return null;
  }
};

/**
 * Create a new version of a graph
 * @param {string} id - Graph entry ID
 * @param {Object} data - { nodes, edges, requiredParams, changelog }
 * @returns {Promise<Object>}
 */
export const createVersion = async (id, data) => {
  try {
    const response = await api.post(`/${id}/version`, data);
    return response.data?.data;
  } catch (error) {
    console.error('Failed to create version:', error);
    throw error;
  }
};

/**
 * Promote a version to Production
 * @param {string} id - Graph entry ID
 * @param {number} versionNumber - Version number to promote
 * @returns {Promise<Object>}
 */
export const promoteVersion = async (id, versionNumber) => {
  try {
    const response = await api.put(`/${id}/version/${versionNumber}/promote`);
    return response.data?.data;
  } catch (error) {
    console.error('Failed to promote version:', error);
    throw error;
  }
};

export default {
  GRAPH_TYPES,
  GRAPH_TYPE_INFO,
  listGraphs,
  getGraphTree,
  getGraphById,
  createGraph,
  updateGraph,
  deleteGraph,
  cloneGraph,
  getNamespaces,
  getTypes,
  getLabels,
  getStatus,
  getSubGraphs,
  getSubGraphForNode,
  expandSubgraphNode,
  listSubgraphs,
  getVersions,
  getVersion,
  createVersion,
  promoteVersion,
};
