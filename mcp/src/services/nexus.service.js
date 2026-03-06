/**
 * NEXUS API Service
 *
 * Handles all API calls to the NEXUS Advisor backend.
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE FILTERS
// Infrastructure nodes/edges are proxy structures for parent↔sub-graph
// relationships and must be excluded from analysis, search, and similarity.
// ═══════════════════════════════════════════════════════════════════════════

export const INFRASTRUCTURE_LABELS = [
  'SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint',
];

export const INFRASTRUCTURE_EDGE_TYPES = [
  'CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK',
];

/**
 * Filter out infrastructure nodes — returns only domain knowledge nodes.
 */
export const filterDomainNodes = (nodes) =>
  nodes.filter(n => !INFRASTRUCTURE_LABELS.includes(n.type || n.data?.type || n.labels?.[0]));

/**
 * Filter out infrastructure edges.
 */
export const filterDomainEdges = (edges) =>
  edges.filter(e => !INFRASTRUCTURE_EDGE_TYPES.includes(e.type || e.label || e.data?.type));

/**
 * Fetch insights for a namespace.
 */
export const fetchInsights = async (namespace = 'GXE', options = {}) => {
  const params = { namespace };
  if (options.refresh) params.refresh = 'true';

  const response = await api.get('/advisor/insights', { params });
  return response.data;
};

/**
 * Force refresh insights (bypass cache).
 */
export const refreshInsights = async (namespace = 'GXE') => {
  const response = await api.post('/advisor/insights/refresh', { namespace });
  return response.data;
};

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURAL ANALYSIS (Guided Mode)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run structural analysis via the subgraph/analyze endpoint.
 */
export const analyzeGraph = async (namespace = 'GXE') => {
  const response = await api.post('/subgraph/analyze', { namespace });
  return response.data;
};

/**
 * Combined analysis for Guided Mode Phase 1 (Understand).
 */
export const runUnderstandPhase = async (namespace = 'GXE') => {
  const [analysis, insights] = await Promise.all([
    analyzeGraph(namespace).catch(err => {
      console.warn('[nexusService] analyzeGraph failed:', err.message);
      return null;
    }),
    fetchInsights(namespace, { refresh: true }).catch(() => ({ insights: [], summary: { total: 0, high: 0, medium: 0, low: 0 } })),
  ]);

  return {
    analysis,
    insights: insights.insights || [],
    summary: insights.summary || { total: 0, high: 0, medium: 0, low: 0 },
    timestamp: new Date().toISOString(),
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CLUSTERING (Phase 2: Discover)
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENTATION_STRATEGIES = {
  community: {
    id: 'community',
    name: 'Community Detection',
    description: 'Find densely connected groups using graph algorithms',
    icon: '🔗',
  },
  ontology: {
    id: 'ontology',
    name: 'Ontology Layers',
    description: 'Group by semantic layer (Strategic/Business/Code)',
    icon: '📚',
  },
  semantic: {
    id: 'semantic',
    name: 'Semantic Similarity',
    description: 'Group by content similarity using embeddings',
    icon: '🧠',
    requiresEmbeddings: true,
  },
};

/**
 * Run segmentation with specified strategy.
 */
export const runSegmentation = async (namespace = 'GXE', options = {}) => {
  const { strategy = 'community', minClusterSize = 3, maxClusters = 10 } = options;
  const response = await api.post('/subgraph/segment', {
    namespace,
    strategy,
    options: { minClusterSize, maxClusters },
  });
  return response.data;
};

const calculateClusterScore = (cluster) => {
  let score = 0;
  const size = cluster.nodeCount || cluster.nodeIds?.length || 0;
  if (size >= 5 && size <= 15) score += 30;
  else if (size >= 3 && size <= 20) score += 20;
  else if (size >= 2) score += 10;

  score += (cluster.isolation || cluster.modularity || 0) * 40;
  score += (cluster.density || 0) * 20;
  const coherence = cluster.coherence || cluster.coherenceScore || 0;
  if (coherence) score += coherence * 30;
  return Math.round(score);
};

/**
 * Combined discover phase — run segmentation and normalize results.
 */
export const runDiscoverPhase = async (namespace = 'GXE', options = {}) => {
  const { strategy = 'community' } = options;
  const result = await runSegmentation(namespace, { strategy, ...options });

  const clusters = (result.candidates || result.clusters || result.segments || []).map((cluster, index) => ({
    id: cluster.id || `cluster-${index}`,
    name: cluster.name || cluster.label || `Cluster ${index + 1}`,
    nodeIds: cluster.nodeIds || cluster.nodes || [],
    nodeCount: cluster.nodeCount || cluster.nodeIds?.length || cluster.nodes?.length || 0,
    strategy: cluster.strategy || strategy,
    metrics: {
      isolation: cluster.isolation || cluster.modularity || 0,
      density: cluster.density || 0,
      coherence: cluster.coherence || cluster.coherenceScore || null,
    },
    score: calculateClusterScore(cluster),
  }));

  clusters.sort((a, b) => b.score - a.score);

  return {
    clusters,
    strategy,
    totalNodes: result.totalNodes || clusters.reduce((sum, c) => sum + c.nodeCount, 0),
    timestamp: new Date().toISOString(),
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION (Phase 3: Evaluate)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate coherence of selected clusters via backend CoherenceEvaluator.
 */
export const evaluateClusters = async (namespace = 'GXE', clusters = []) => {
  const response = await api.post('/advisor/evaluate-clusters', {
    namespace,
    clusters: clusters.map(c => ({
      id: c.id,
      nodeIds: c.nodeIds,
      name: c.name,
      strategy: c.strategy,
    })),
  });
  return response.data;
};

/**
 * Combined evaluate phase — evaluate selected clusters.
 */
export const runEvaluatePhase = async (namespace = 'GXE', selectedClusters = []) => {
  if (!selectedClusters.length) {
    return { evaluations: [], timestamp: new Date().toISOString() };
  }

  const result = await evaluateClusters(namespace, selectedClusters);

  const evaluations = (result.evaluations || []).map((ev, i) => ({
    ...selectedClusters[i],
    ...ev,
    approved: false,
    customName: ev.name || selectedClusters[i]?.name || `Cluster ${i + 1}`,
  }));

  return {
    evaluations,
    timestamp: result.timestamp || new Date().toISOString(),
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS (Phase 4: Act)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Consolidate a cluster into a SubGraph node.
 */
export const consolidateCluster = async (namespace, cluster) => {
  const response = await api.post('/subgraph/extract', {
    namespace,
    nodeIds: cluster.nodeIds,
    name: cluster.customName || cluster.name,
    description: `Consolidated from ${cluster.nodeCount} nodes`,
    consolidate: true,
  });
  return response.data;
};

/**
 * Validate a consolidated SubGraph via AI quality assessment.
 */
export const validateSubgraph = async (namespace, subgraphId) => {
  const response = await api.post('/subgraph/validate', { namespace, subgraphId });
  return response.data;
};

/**
 * Rollback to a checkpoint.
 */
export const rollbackToCheckpoint = async (namespace, checkpointId) => {
  const response = await api.post('/subgraph/rollback', { namespace, checkpointId });
  return response.data;
};

/**
 * Get graph statistics for before/after comparison.
 */
export const getGraphStats = async (namespace) => {
  try {
    const analysis = await analyzeGraph(namespace);
    return {
      nodeCount: analysis.nodeCount || analysis.analysis?.nodeCount || 0,
      edgeCount: analysis.edgeCount || analysis.analysis?.edgeCount || 0,
    };
  } catch {
    return { nodeCount: 0, edgeCount: 0 };
  }
};

/**
 * Execute consolidation on approved clusters with progress callbacks.
 */
export const runActPhase = async (namespace, clusters, options = {}) => {
  const { action = 'consolidate', onProgress, onLog } = options;

  const results = { checkpoint: null, actions: [], beforeStats: null, afterStats: null, errors: [] };

  // Before stats
  onLog?.({ type: 'info', message: 'Capturing graph state...' });
  results.beforeStats = await getGraphStats(namespace);

  // Checkpoint (soft — no dedicated endpoint, just record timestamp)
  const checkpointId = `chk-${Date.now()}`;
  results.checkpoint = { checkpointId, timestamp: new Date().toISOString(), mock: true };
  onLog?.({ type: 'success', message: `Checkpoint recorded: ${checkpointId}` });

  // Execute per cluster
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const clusterName = cluster.customName || cluster.name;

    onProgress?.({ current: i + 1, total: clusters.length, currentCluster: clusterName });
    onLog?.({ type: 'info', message: `Processing "${clusterName}"...` });

    try {
      let result;
      if (action === 'consolidate') {
        result = await consolidateCluster(namespace, cluster);
        onLog?.({ type: 'success', message: `"${clusterName}" consolidated → SubGraph created` });
      } else {
        // Export — return cluster data for download
        result = { name: clusterName, nodeIds: cluster.nodeIds, nodeCount: cluster.nodeCount, exportedAt: new Date().toISOString() };
        onLog?.({ type: 'success', message: `"${clusterName}" exported` });
      }
      results.actions.push({ clusterId: cluster.id, clusterName, action, success: true, result });
    } catch (err) {
      results.errors.push({ clusterId: cluster.id, clusterName, error: err.message });
      onLog?.({ type: 'error', message: `Failed: "${clusterName}" - ${err.message}` });
    }
  }

  // After stats
  if (action === 'consolidate') {
    onLog?.({ type: 'info', message: 'Capturing final state...' });
    results.afterStats = await getGraphStats(namespace);
  }

  onLog?.({ type: 'complete', message: 'All actions completed' });
  return results;
};

// ═══════════════════════════════════════════════════════════════════════════
// PATH FINDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find paths between two nodes.
 */
export const findPaths = async (namespace, sourceId, targetId, options = {}) => {
  const {
    maxDepth = 5,
    limit = 10,
    direction = 'any',
  } = options;

  try {
    const response = await api.post('/subgraph/paths', {
      namespace,
      sourceId,
      targetId,
      maxDepth,
      limit,
      direction,
    });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] Path finding endpoint not available, using client-side fallback');
    return { paths: [], fallback: true };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Search modes
 */
export const SEARCH_MODES = {
  text: {
    id: 'text',
    name: 'Text',
    description: 'Exact and fuzzy text matching',
    icon: '📝',
  },
  semantic: {
    id: 'semantic',
    name: 'Semantic',
    description: 'AI-powered meaning-based search',
    icon: '🧠',
    requiresEmbeddings: true,
  },
  hybrid: {
    id: 'hybrid',
    name: 'Hybrid',
    description: 'Combined text and semantic search',
    icon: '🔀',
    requiresEmbeddings: true,
  },
};

/**
 * Search nodes and content via API.
 */
export const searchGraph = async (namespace, query, options = {}) => {
  const {
    mode = 'text',
    types = [],
    layers = [],
    limit = 20,
  } = options;

  try {
    const response = await api.post('/subgraph/search', {
      namespace,
      query,
      mode,
      filters: {
        types: types.length > 0 ? types : undefined,
        layers: layers.length > 0 ? layers : undefined,
      },
      limit,
    });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] Search endpoint not available, using client-side fallback');
    return { results: [], fallback: true };
  }
};

/**
 * Client-side text search (fallback).
 */
export const searchNodesClientSide = (nodes, query, options = {}) => {
  const { types = [], layers = [], limit = 20 } = options;

  if (!query || query.trim().length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0);

  const results = filterDomainNodes(nodes)
    .map(node => {
      if (types.length > 0 && !types.includes(node.type)) return null;
      if (layers.length > 0 && !layers.includes(node.layer)) return null;

      const name = (node.name || node.label || node.id || '').toLowerCase();
      const description = (node.description || node.data?.description || '').toLowerCase();
      const type = (node.type || '').toLowerCase();
      const content = (node.content || node.data?.content || '').toLowerCase();

      let score = 0;
      const matchedFields = [];
      let snippet = null;

      for (const term of queryTerms) {
        if (name.includes(term)) {
          score += name === term ? 1.0 : 0.8;
          if (!matchedFields.includes('name')) matchedFields.push('name');
        }
        if (type.includes(term)) {
          score += 0.3;
          if (!matchedFields.includes('type')) matchedFields.push('type');
        }
        if (description.includes(term)) {
          score += 0.5;
          if (!matchedFields.includes('description')) matchedFields.push('description');
          if (!snippet) {
            const idx = description.indexOf(term);
            const start = Math.max(0, idx - 40);
            const end = Math.min(description.length, idx + term.length + 40);
            snippet = '...' + description.slice(start, end) + '...';
          }
        }
        if (content.includes(term)) {
          score += 0.4;
          if (!matchedFields.includes('content')) matchedFields.push('content');
        }
      }

      if (score === 0) return null;
      score = Math.min(1, score / queryTerms.length);

      return { node, score, matchedFields, snippet, highlights: queryTerms };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
};

// ═══════════════════════════════════════════════════════════════════════════
// AI ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send a message to the AI assistant and get a response.
 */
export const sendAssistantMessage = async (namespace, message, context = {}) => {
  try {
    const response = await api.post('/advisor/assistant', {
      namespace,
      message,
      context: {
        selectedNodes: context.selectedNodes || [],
        graphStats: context.graphStats || null,
        mode: context.mode || 'explore',
      },
    });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] Assistant endpoint not available, using fallback');
    return generateFallbackResponse(message, context);
  }
};

/**
 * Generate a fallback response when API is unavailable.
 */
export const generateFallbackResponse = (message, context = {}) => {
  const msgLower = message.toLowerCase();
  const selectedCount = context.selectedNodes?.length || 0;
  const stats = context.graphStats || {};

  // Pattern matching for common questions
  if (msgLower.includes('hub') || msgLower.includes('important') || msgLower.includes('central')) {
    return {
      response: `Hub nodes are the most connected nodes in the graph. They act as bridges between different clusters. Use **Explore Mode** → sort by degree to find them. ${stats.nodeCount ? `Your graph has ${stats.nodeCount} nodes — look for nodes with degree > ${Math.max(3, Math.round(stats.nodeCount * 0.1))}.` : ''}`,
      actions: [{ label: 'Sort by degree', action: 'sort-by-degree' }],
    };
  }

  if (msgLower.includes('cluster') || msgLower.includes('community') || msgLower.includes('group')) {
    return {
      response: 'To discover clusters, switch to **Guided Mode** and run the **Discover** phase. You can choose between Community Detection (graph structure), Ontology Layers (semantic), or Semantic Similarity (AI-powered). Community Detection is the fastest starting point.',
      actions: [{ label: 'Open Guided Mode', action: 'switch-guided' }],
    };
  }

  if (msgLower.includes('path') || msgLower.includes('connect') || msgLower.includes('reach')) {
    return {
      response: `To find paths between nodes, select a node and use the **Path Finder** tool from the Inspector actions. ${selectedCount > 0 ? `You have ${selectedCount} node(s) selected — try finding paths from one of them.` : 'Select a starting node first.'}`,
      actions: selectedCount > 0 ? [{ label: 'Open Path Finder', action: 'open-pathfinder' }] : [],
    };
  }

  if (msgLower.includes('search') || msgLower.includes('find') || msgLower.includes('where')) {
    return {
      response: 'Use the **Search** tool in Explore Mode toolbar to find specific nodes. You can search by name, type, or content. Text search is always available; Semantic search requires embeddings.',
      actions: [{ label: 'Open Search', action: 'open-search' }],
    };
  }

  if (msgLower.includes('anomal') || msgLower.includes('problem') || msgLower.includes('issue') || msgLower.includes('orphan')) {
    return {
      response: `Check the **Insights Bar** for detected anomalies. Common issues include orphan nodes (no connections), isolated clusters, and bridge nodes (single points of failure). ${stats.nodeCount ? `Your graph: ${stats.nodeCount} nodes, ${stats.edgeCount || 0} edges.` : ''}`,
      actions: [{ label: 'Refresh Insights', action: 'refresh-insights' }],
    };
  }

  if (msgLower.includes('help') || msgLower.includes('what can') || msgLower.includes('how to')) {
    return {
      response: "I can help you analyze your knowledge graph. Try asking about:\n- **Hub nodes** — find important central nodes\n- **Clusters** — discover communities and patterns\n- **Paths** — find connections between nodes\n- **Anomalies** — detect problems in the graph\n- **Search** — find specific nodes or content",
      actions: [],
    };
  }

  // Generic fallback
  if (selectedCount > 0) {
    return {
      response: `You have **${selectedCount} node(s)** selected. I can help you explore their connections, find paths, or analyze their properties. Try asking about what they have in common or how they connect to other parts of the graph.`,
      actions: [
        { label: 'Inspect node', action: 'inspect-selected' },
        { label: 'Find paths', action: 'open-pathfinder' },
      ],
    };
  }

  return {
    response: "I'm your graph analysis assistant. I can help you understand the structure, find patterns, and navigate your knowledge graph. What would you like to explore?",
    actions: [],
  };
};

/**
 * Get context-aware suggested questions.
 */
export const getSuggestedQuestions = (context = {}) => {
  const { selectedCount = 0, nodeCount = 0, hasInsights = false, mode = 'explore' } = context;

  const questions = [];

  if (nodeCount === 0) {
    questions.push('How do I get started?');
    questions.push('What is NEXUS?');
    return questions;
  }

  if (selectedCount > 0) {
    questions.push('What is this node connected to?');
    questions.push('Find similar nodes');
    questions.push('Why is this node important?');
  } else {
    questions.push('What are the hub nodes?');
    questions.push('Find clusters in the graph');
  }

  if (hasInsights) {
    questions.push('What anomalies were found?');
  }

  if (mode === 'explore') {
    questions.push('How do I use Path Finder?');
  }

  if (nodeCount > 50) {
    questions.push('How can I simplify this graph?');
  }

  return questions.slice(0, 4);
};

// ═══════════════════════════════════════════════════════════════════════════
// GNN PREDICTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get GNN model status.
 */
export const getGNNStatus = async (namespace) => {
  try {
    const response = await api.get('/gnn/status', { params: { namespace } });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] GNN status not available');
    return { ready: false, error: 'GNN service not available' };
  }
};

/**
 * Predict links for a node.
 */
export const predictLinks = async (namespace, nodeId, options = {}) => {
  const { topK = 10, minScore = 0.5, edgeType = null } = options;

  try {
    const response = await api.post('/gnn/predict-links', {
      namespace, nodeId, topK, minScore, edgeType,
    });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] Link prediction API not available, using fallback');
    return generateFallbackPredictions(nodeId, options);
  }
};

/**
 * Generate fallback predictions (demo data when API unavailable).
 */
const generateFallbackPredictions = (nodeId, options) => {
  const { topK = 10, minScore = 0.5 } = options;

  const mockPredictions = [
    { targetId: 'node-1', targetName: 'DataValidator', targetType: 'CLASS', targetLayer: 'Code', score: 0.94, edgeType: 'DEPENDS_ON' },
    { targetId: 'node-2', targetName: 'ComplianceChecker', targetType: 'CLASS', targetLayer: 'Business', score: 0.87, edgeType: 'USES' },
    { targetId: 'node-3', targetName: 'ReportGenerator', targetType: 'CLASS', targetLayer: 'Business', score: 0.82, edgeType: 'CALLS' },
    { targetId: 'node-4', targetName: 'AuditLogger', targetType: 'CLASS', targetLayer: 'Code', score: 0.78, edgeType: 'DEPENDS_ON' },
    { targetId: 'node-5', targetName: 'NotificationService', targetType: 'SERVICE', targetLayer: 'Code', score: 0.71, edgeType: 'USES' },
    { targetId: 'node-6', targetName: 'ConfigManager', targetType: 'CLASS', targetLayer: 'Code', score: 0.65, edgeType: 'REFERENCES' },
    { targetId: 'node-7', targetName: 'CacheService', targetType: 'SERVICE', targetLayer: 'Code', score: 0.58, edgeType: 'USES' },
    { targetId: 'node-8', targetName: 'MetricsCollector', targetType: 'CLASS', targetLayer: 'Code', score: 0.52, edgeType: 'CALLS' },
  ];

  return {
    sourceId: nodeId,
    predictions: mockPredictions.filter(p => p.score >= minScore).slice(0, topK),
    isFallback: true,
  };
};

/**
 * Add a predicted edge to the graph.
 */
export const addPredictedEdge = async (namespace, sourceId, targetId, edgeType) => {
  try {
    const response = await api.post('/gnn/add-edge', {
      namespace, sourceId, targetId, edgeType,
      metadata: { source: 'gnn_prediction', addedAt: new Date().toISOString() },
    });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] Add edge API not available');
    return { success: false, error: error.message };
  }
};

/**
 * Refresh GNN model.
 */
export const refreshGNNModel = async (namespace) => {
  try {
    const response = await api.post('/gnn/refresh', { namespace });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] GNN refresh not available');
    return { success: false, error: error.message };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SIMILARITY
// ═══════════════════════════════════════════════════════════════════════════

export const SIMILARITY_METHODS = {
  structural: { id: 'structural', name: 'Structural', description: 'Based on graph position and connections', icon: '\uD83D\uDD17' },
  properties: { id: 'properties', name: 'Properties', description: 'Based on node attributes and metadata', icon: '\uD83D\uDCCB' },
  hybrid: { id: 'hybrid', name: 'Hybrid', description: 'Combined structural and property similarity', icon: '\uD83D\uDD00' },
};

/**
 * Find similar nodes via API.
 */
export const findSimilarNodes = async (namespace, nodeId, options = {}) => {
  const { method = 'structural', limit = 10, sameTypeOnly = false, sameLayerOnly = false } = options;

  try {
    const response = await api.post('/gnn/similar', {
      namespace, nodeId, method, limit,
      filters: { sameTypeOnly, sameLayerOnly },
    });
    return response.data;
  } catch (error) {
    console.warn('[nexusService] Similarity API not available, using fallback');
    return null;
  }
};

/**
 * Client-side similarity calculation (fallback).
 */
export const calculateSimilarityClientSide = (referenceNode, nodes, edges, options = {}) => {
  const { method = 'structural', limit = 10, sameTypeOnly = false, sameLayerOnly = false } = options;

  if (!referenceNode) return [];

  // Filter out infrastructure nodes and edges before calculating
  const domainNodes = filterDomainNodes(nodes);
  const domainEdges = filterDomainEdges(edges);

  const getNeighbors = (nodeId) => {
    const neighbors = new Set();
    domainEdges.forEach(edge => {
      if (edge.source === nodeId) neighbors.add(edge.target);
      if (edge.target === nodeId) neighbors.add(edge.source);
    });
    return neighbors;
  };

  const refNeighbors = getNeighbors(referenceNode.id);
  const refDegree = refNeighbors.size;

  const results = domainNodes
    .filter(node => {
      if (node.id === referenceNode.id) return false;
      if (sameTypeOnly && node.type !== referenceNode.type) return false;
      if (sameLayerOnly && node.layer !== referenceNode.layer) return false;
      return true;
    })
    .map(node => {
      let score = 0;
      const matchReasons = [];

      const nodeNeighbors = getNeighbors(node.id);
      const nodeDegree = nodeNeighbors.size;

      // Structural similarity
      if (method === 'structural' || method === 'hybrid') {
        const intersection = new Set([...refNeighbors].filter(x => nodeNeighbors.has(x)));
        const union = new Set([...refNeighbors, ...nodeNeighbors]);
        const jaccard = union.size > 0 ? intersection.size / union.size : 0;
        score += jaccard * 0.5;
        if (intersection.size > 0) matchReasons.push(`${intersection.size} common neighbors`);

        const maxDegree = Math.max(refDegree, nodeDegree);
        const degreeSim = maxDegree > 0 ? 1 - Math.abs(refDegree - nodeDegree) / maxDegree : 1;
        score += degreeSim * 0.2;
        if (degreeSim > 0.8) matchReasons.push('similar degree');
      }

      // Property similarity
      if (method === 'properties' || method === 'hybrid') {
        if (node.type === referenceNode.type) { score += 0.15; matchReasons.push('same type'); }
        if (node.layer === referenceNode.layer) { score += 0.1; matchReasons.push('same layer'); }

        const refName = (referenceNode.name || referenceNode.id || '').toLowerCase();
        const nodeName = (node.name || node.id || '').toLowerCase();
        const refWords = refName.split(/[^a-z0-9]+/).filter(w => w.length > 2);
        const nodeWords = nodeName.split(/[^a-z0-9]+/).filter(w => w.length > 2);
        const commonWords = refWords.filter(w => nodeWords.includes(w));
        if (commonWords.length > 0) { score += 0.05 * commonWords.length; matchReasons.push('similar name pattern'); }
      }

      return {
        node,
        similarity: Math.min(1, score),
        matchReasons,
        commonNeighbors: method !== 'properties' ? [...refNeighbors].filter(x => nodeNeighbors.has(x)).length : 0,
      };
    })
    .filter(r => r.similarity > 0.1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
};

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Health check.
 */
export const advisorHealthCheck = async () => {
  const response = await api.get('/advisor/health');
  return response.data;
};

const nexusService = {
  INFRASTRUCTURE_LABELS,
  INFRASTRUCTURE_EDGE_TYPES,
  filterDomainNodes,
  filterDomainEdges,
  fetchInsights,
  refreshInsights,
  analyzeGraph,
  runUnderstandPhase,
  runSegmentation,
  runDiscoverPhase,
  SEGMENTATION_STRATEGIES,
  evaluateClusters,
  runEvaluatePhase,
  consolidateCluster,
  validateSubgraph,
  rollbackToCheckpoint,
  getGraphStats,
  runActPhase,
  findPaths,
  SEARCH_MODES,
  searchGraph,
  searchNodesClientSide,
  sendAssistantMessage,
  generateFallbackResponse,
  getSuggestedQuestions,
  getGNNStatus,
  predictLinks,
  addPredictedEdge,
  refreshGNNModel,
  SIMILARITY_METHODS,
  findSimilarNodes,
  calculateSimilarityClientSide,
  advisorHealthCheck,
};
export default nexusService;
