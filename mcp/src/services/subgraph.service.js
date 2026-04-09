/**
 * Subgraph Service
 * Frontend API service for subgraph operations and graph-RAG hybrid search.
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const subgraphApi = axios.create({
  baseURL: `${API_BASE_URL}/subgraph`,
  headers: { 'Content-Type': 'application/json' }
});

const graphRagApi = axios.create({
  baseURL: `${API_BASE_URL}/graph-rag`,
  headers: { 'Content-Type': 'application/json' }
});

// ── Subgraph Analysis ──────────────────────────────────────────

/**
 * Run structural analysis on a namespace (density, degree distribution, anomalies)
 */
export const analyzeStructure = async (namespace) => {
  try {
    const { data } = await subgraphApi.post('/analyze', { namespace });
    return data;
  } catch (err) {
    console.error('[subgraph.service] analyzeStructure failed:', err.message);
    throw err;
  }
};

/**
 * Segment a namespace into cluster candidates using community/ontology strategies
 */
export const segmentGraph = async (namespace, options = {}) => {
  try {
    const { data } = await subgraphApi.post('/segment', {
      namespace,
      strategies: options.strategies || ['community', 'ontology'],
      useLlm: options.useLlm || false,
      minCoherence: options.minCoherence,
    });
    return data;
  } catch (err) {
    console.error('[subgraph.service] segmentGraph failed:', err.message);
    throw err;
  }
};

// ── Subgraph CRUD ──────────────────────────────────────────────

/**
 * Extract selected nodes into a named SubGraph with boundary resolution
 */
export const extractSubgraph = async (namespace, nodeIds, name, metadata = {}) => {
  try {
    const { data } = await subgraphApi.post('/extract', {
      namespace,
      nodeIds,
      name,
      metadata,
    });
    return data;
  } catch (err) {
    console.error('[subgraph.service] extractSubgraph failed:', err.message);
    throw err;
  }
};

/**
 * Consolidate a subgraph (archive members, rewire boundary, create checkpoint)
 */
export const consolidateSubgraph = async (subgraphId, namespace) => {
  try {
    const { data } = await subgraphApi.post('/consolidate', { subgraphId, namespace });
    return data;
  } catch (err) {
    console.error('[subgraph.service] consolidateSubgraph failed:', err.message);
    throw err;
  }
};

/**
 * Rollback a consolidation from checkpoint
 */
export const rollbackSubgraph = async (checkpointId) => {
  try {
    const { data } = await subgraphApi.post('/rollback', { checkpointId });
    return data;
  } catch (err) {
    console.error('[subgraph.service] rollbackSubgraph failed:', err.message);
    throw err;
  }
};

/**
 * List rollback checkpoints for a namespace
 */
export const listCheckpoints = async (namespace) => {
  try {
    const { data } = await subgraphApi.get('/checkpoints', { params: { namespace } });
    return data;
  } catch (err) {
    console.error('[subgraph.service] listCheckpoints failed:', err.message);
    throw err;
  }
};

// ── Search ─────────────────────────────────────────────────────

/**
 * GNN-RAG hybrid search (semantic + structural + GNN)
 */
export const hybridSearch = async (query, topK = 10) => {
  try {
    const { data } = await graphRagApi.post('/retrieve/hybrid', { query, topK });
    return data;
  } catch (err) {
    console.error('[subgraph.service] hybridSearch failed:', err.message);
    throw err;
  }
};

export default {
  analyzeStructure,
  segmentGraph,
  extractSubgraph,
  consolidateSubgraph,
  rollbackSubgraph,
  listCheckpoints,
  hybridSearch,
};
