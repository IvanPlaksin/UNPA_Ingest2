/**
 * GNN Service Client
 * Communicates with Python GNN microservice
 */

const GNN_BASE_URL = import.meta.env.VITE_GNN_URL || 'http://localhost:5000';

class GNNService {
  constructor() {
    this.baseUrl = `${GNN_BASE_URL}/api/v1/gnn`;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const config = {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`GNN Service Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // ==================== Model Status ====================

  async getModelStatus() {
    return this.request('/model-status');
  }

  async loadLinkModel(modelPath) {
    return this.request('/load-link-model', {
      method: 'POST',
      body: JSON.stringify({ model_path: modelPath }),
    });
  }

  async loadClassificationModel(modelPath) {
    return this.request('/load-classification-model', {
      method: 'POST',
      body: JSON.stringify({ model_path: modelPath }),
    });
  }

  // ==================== Link Prediction ====================

  async predictLinks(sourceType, targetType, options = {}) {
    return this.request('/predict-links', {
      method: 'POST',
      body: JSON.stringify({
        source_type: sourceType,
        target_type: targetType,
        top_k: options.topK || 100,
        min_confidence: options.minConfidence || 0.7,
        exclude_existing: options.excludeExisting !== false,
      }),
    });
  }

  async predictForNode(nodeId, targetType, options = {}) {
    return this.request('/predict-for-node', {
      method: 'POST',
      body: JSON.stringify({
        node_id: nodeId,
        target_type: targetType,
        top_k: options.topK || 10,
        min_confidence: options.minConfidence || 0.5,
      }),
    });
  }

  // ==================== Classification ====================

  async classifyNodes(nodeIds, minConfidence = 0.5) {
    return this.request('/classify-nodes', {
      method: 'POST',
      body: JSON.stringify({
        node_ids: nodeIds,
        min_confidence: minConfidence,
      }),
    });
  }

  async classifyAll(minConfidence = 0.5, limit = 1000) {
    return this.request('/classify-all', {
      method: 'POST',
      body: JSON.stringify({
        min_confidence: minConfidence,
        limit: limit,
      }),
    });
  }

  // ==================== Graph Operations ====================

  async getGraphStats() {
    return this.request('/graph-stats');
  }

  async getNodeTypes() {
    return this.request('/node-types');
  }

  async getEdgeTypes() {
    return this.request('/edge-types');
  }

  async writePredictions(predictions, relationType = 'PREDICTED_LINK') {
    return this.request('/write-predictions', {
      method: 'POST',
      body: JSON.stringify({
        predictions: predictions,
        relation_type: relationType,
      }),
    });
  }

  // ==================== Training ====================

  async startTraining(task, epochs = 100, learningRate = 0.001) {
    return this.request('/train', {
      method: 'POST',
      body: JSON.stringify({
        task: task,
        epochs: epochs,
        learning_rate: learningRate,
      }),
    });
  }

  async getTrainingStatus(jobId) {
    return this.request(`/train/${jobId}`);
  }

  // ==================== Community Detection ====================

  async detectCommunities(options = {}) {
    return this.request('/detect-communities', {
      method: 'POST',
      body: JSON.stringify({
        namespace: options.namespace,
        n_clusters: options.nClusters,
        min_community_size: options.minCommunitySize || 2,
      }),
    });
  }

  // ==================== Graph Embedding ====================

  async getGraphEmbedding(nodeIds, method = 'mean_pool') {
    return this.request('/graph-embedding', {
      method: 'POST',
      body: JSON.stringify({ nodeIds, method }),
    });
  }

  async embedNodes(nodeIds) {
    return this.request('/embed/nodes', {
      method: 'POST',
      body: JSON.stringify({ nodeIds }),
    });
  }

  // ==================== SQL Import Graph Analysis ====================

  /**
   * Analyze an imported SQL graph using GNN capabilities.
   * Falls back to heuristic/structural analysis when GNN models aren't loaded.
   *
   * @param {{ nodes: Array, edges: Array }} graphData - ReactFlow graph
   * @param {{ linkPrediction: boolean, nodeClassification: boolean, communityDetection: boolean }} options
   * @param {function} onProgress - (current, total, phase) callback
   * @returns {{ predictions, classifications, communities }}
   */
  async analyzeImportedGraph(graphData, options = {}, onProgress) {
    const { nodes, edges } = graphData;
    const results = { predictions: null, classifications: null, communities: null };

    const nodeIds = nodes.map(n => n.id);
    const totalPhases = [options.linkPrediction, options.nodeClassification, options.communityDetection].filter(Boolean).length;
    let phase = 0;

    // Pre-check: are GNN models loaded? If not, skip API calls entirely.
    let useHeuristics = false;
    try {
      const health = await fetch(`${GNN_BASE_URL}/health`).then(r => r.json());
      useHeuristics = health?.components?.models?.status !== 'healthy';
    } catch {
      useHeuristics = true;
    }
    if (useHeuristics) {
      console.info('[GNN] Models not loaded — using heuristic analysis on graph structure');
    }

    // 1. Link Prediction
    if (options.linkPrediction) {
      phase++;
      onProgress?.(phase, totalPhases, useHeuristics ? 'Analyzing naming patterns...' : 'Predicting hidden relationships...');
      if (useHeuristics) {
        results.predictions = _heuristicLinkPrediction(nodes, edges);
      } else {
        try {
          const tableTypes = [...new Set(nodes.map(n => n.data?.entityType || n.type || 'Table'))];
          results.predictions = await this.predictLinks(tableTypes[0] || 'Table', tableTypes[0] || 'Table', {
            topK: 50, minConfidence: 0.5, excludeExisting: true,
          });
        } catch (err) {
          results.predictions = _heuristicLinkPrediction(nodes, edges);
        }
      }
    }

    // 2. Node Classification
    if (options.nodeClassification) {
      phase++;
      onProgress?.(phase, totalPhases, useHeuristics ? 'Classifying by column patterns...' : 'Classifying table types...');
      if (useHeuristics) {
        results.classifications = _heuristicNodeClassification(nodes, edges);
      } else {
        try {
          results.classifications = await this.classifyNodes(nodeIds, 0.4);
        } catch (err) {
          results.classifications = _heuristicNodeClassification(nodes, edges);
        }
      }
    }

    // 3. Community Detection
    if (options.communityDetection) {
      phase++;
      onProgress?.(phase, totalPhases, useHeuristics ? 'Running label propagation...' : 'Detecting schema communities...');
      if (useHeuristics) {
        results.communities = _heuristicCommunityDetection(nodes, edges);
      } else {
        try {
          results.communities = await this.detectCommunities({ minCommunitySize: 2 });
        } catch (err) {
          results.communities = _heuristicCommunityDetection(nodes, edges);
        }
      }
    }

    onProgress?.(totalPhases, totalPhases, 'Analysis complete');
    return results;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Heuristic Fallbacks — structural analysis without trained GNN models
// ═══════════════════════════════════════════════════════════════════════

/**
 * Predict likely missing links based on naming patterns and column similarity.
 * Looks for tables whose names suggest a relationship (e.g., Orders ↔ OrderDetails).
 */
function _heuristicLinkPrediction(nodes, edges) {
  const existingEdges = new Set(edges.map(e => `${e.source}→${e.target}`));
  const predictions = [];

  const names = nodes.map(n => ({
    id: n.id,
    name: (n.data?.label || n.id).toLowerCase().replace(/[^a-z0-9]/g, ''),
    columns: (n.data?.columns || []).map(c => (c.name || c).toLowerCase()),
  }));

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      if (existingEdges.has(`${a.id}→${b.id}`) || existingEdges.has(`${b.id}→${a.id}`)) continue;

      let score = 0;

      // Name containment: "OrderDetails" contains "Order"
      if (a.name.length > 3 && b.name.includes(a.name)) score += 0.4;
      else if (b.name.length > 3 && a.name.includes(b.name)) score += 0.4;

      // Shared column names (likely FK candidates)
      if (a.columns.length && b.columns.length) {
        const shared = a.columns.filter(c => b.columns.includes(c));
        const idColumns = shared.filter(c => c.endsWith('id') || c.endsWith('_id') || c === 'id');
        score += Math.min(idColumns.length * 0.2, 0.4);
        score += Math.min((shared.length - idColumns.length) * 0.05, 0.1);
      }

      // Column in one table references the other's name (e.g., column "order_id" in table "details")
      const aRefB = a.columns.some(c => c.includes(b.name) || c.replace(/_id$/, '') === b.name);
      const bRefA = b.columns.some(c => c.includes(a.name) || c.replace(/_id$/, '') === a.name);
      if (aRefB) score += 0.3;
      if (bRefA) score += 0.3;

      if (score >= 0.3) {
        predictions.push({
          source: score > 0 && bRefA ? b.id : a.id,
          target: score > 0 && bRefA ? a.id : b.id,
          probability: Math.min(score, 0.95),
        });
      }
    }
  }

  predictions.sort((a, b) => b.probability - a.probability);
  return { predictions: predictions.slice(0, 50), fallback: true, method: 'heuristic_naming' };
}

/**
 * Classify nodes based on structural patterns (degree, column names, naming conventions).
 */
function _heuristicNodeClassification(nodes, edges) {
  const inDeg = {}, outDeg = {};
  for (const e of edges) {
    outDeg[e.source] = (outDeg[e.source] || 0) + 1;
    inDeg[e.target] = (inDeg[e.target] || 0) + 1;
  }

  const classifications = {};

  const PATTERNS = {
    Log:         /log|audit|history|archive|event|trace/i,
    Config:      /config|setting|option|preference|parameter/i,
    Lookup:      /lookup|type|status|category|enum|code|ref_/i,
    Junction:    /map|link|rel|bridge|assoc|x_|xref/i,
  };

  for (const node of nodes) {
    const name = node.data?.label || node.id;
    const columns = (node.data?.columns || []).map(c => (c.name || c).toLowerCase());
    const totalDeg = (inDeg[node.id] || 0) + (outDeg[node.id] || 0);
    const fkCount = columns.filter(c => c.endsWith('_id') || c.endsWith('id')).length;

    let category = 'Unknown';
    let confidence = 0.5;

    // Pattern-based matching
    for (const [cat, rx] of Object.entries(PATTERNS)) {
      if (rx.test(name)) {
        category = cat;
        confidence = 0.75;
        break;
      }
    }

    // Junction tables: mostly FK columns, high degree relative to column count
    if (category === 'Unknown' && columns.length > 0 && fkCount / columns.length > 0.6) {
      category = 'Junction';
      confidence = 0.65;
    }

    // Transaction tables: have timestamps, amounts, or high in-degree
    if (category === 'Unknown') {
      const hasTemporal = columns.some(c => /date|time|created|updated|modified/i.test(c));
      const hasAmount = columns.some(c => /amount|total|price|cost|quantity|qty/i.test(c));
      if (hasTemporal && hasAmount) {
        category = 'Transaction';
        confidence = 0.8;
      } else if (hasTemporal && totalDeg >= 2) {
        category = 'Transaction';
        confidence = 0.6;
      }
    }

    // Reference tables: low degree, no timestamps
    if (category === 'Unknown' && totalDeg <= 1 && columns.length <= 5) {
      category = 'Reference';
      confidence = 0.55;
    }

    if (category !== 'Unknown') {
      classifications[node.id] = { category, confidence };
    }
  }

  return { classifications, fallback: true, method: 'heuristic_structural' };
}

/**
 * Detect communities using Label Propagation on the local graph structure.
 */
function _heuristicCommunityDetection(nodes, edges) {
  // Build adjacency
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (adj[e.target]) adj[e.target].push(e.source);
  }

  // Label Propagation
  const labels = {};
  let labelCounter = 0;
  for (const n of nodes) labels[n.id] = labelCounter++;

  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    const order = [...nodes].sort(() => Math.random() - 0.5);
    for (const node of order) {
      const neighbors = adj[node.id];
      if (!neighbors.length) continue;
      // Most common neighbor label
      const freq = {};
      for (const nb of neighbors) {
        freq[labels[nb]] = (freq[labels[nb]] || 0) + 1;
      }
      const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      const bestLabel = parseInt(best);
      if (labels[node.id] !== bestLabel) {
        labels[node.id] = bestLabel;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group by label
  const groups = {};
  for (const [nodeId, label] of Object.entries(labels)) {
    if (!groups[label]) groups[label] = [];
    groups[label].push(nodeId);
  }

  // Filter to communities with >= 2 nodes
  const clusters = Object.entries(groups)
    .filter(([, members]) => members.length >= 2)
    .map(([id, nodeIds], i) => ({
      id: parseInt(id),
      communityId: i,
      nodeIds,
      label: `Group ${i + 1}`,
      size: nodeIds.length,
    }));

  return { clusters, fallback: true, method: 'label_propagation' };
}

export const gnnService = new GNNService();
export default gnnService;
