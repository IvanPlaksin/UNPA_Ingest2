const { BaseTool } = require('../primitives/BaseTool.js');

let _catalogService = null;
function getCatalog() {
  if (!_catalogService) {
    _catalogService = require('../../../services/graphCatalog.service.js').graphCatalogService;
  }
  return _catalogService;
}

const GNN_SERVICE_URL = process.env.GNN_SERVICE_URL || 'http://localhost:5001';

/**
 * Call GNN service endpoint. Returns null on failure (graceful degradation).
 */
async function callGNN(endpoint, data) {
  try {
    const response = await fetch(`${GNN_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

class FindSimilarGraphsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.find_similar_graphs',
      name: 'Find Similar Graphs',
      version: '2.0.0',
      level: 3,
      category: 'catalog',
      description: 'Find structurally or semantically similar graphs in the catalog. Uses hybrid scoring: keyword search + structural fingerprint (Jaccard on toolId sets) + GNN graph embeddings (when available).',
      inputSchema: {
        type: 'object',
        required: ['description'],
        properties: {
          description: { type: 'string', description: 'Natural language description of desired graph behavior' },
          nodeCount:   { type: 'integer', description: 'Approximate expected node count (for structural matching)' },
          toolIds:     { type: 'array', items: { type: 'string' }, description: 'Expected tool IDs in the graph' },
          namespace:   { type: 'string', description: 'Limit search to namespace' },
          limit:       { type: 'integer', default: 5, description: 'Max results' },
          useGNN:      { type: 'boolean', default: true, description: 'Try GNN-based similarity (falls back if unavailable)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'object' } },
          scoringMethod: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 20000, maxMemoryMb: 50 }
    };
  }

  async execute(args) {
    this.validateArgs(args, ['description']);
    const { description, nodeCount, toolIds = [], namespace, limit = 5, useGNN = true } = args;

    const catalog = getCatalog();

    // Phase 1: keyword search — extract significant words from description
    const keywords = description
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5)
      .join(' ');

    const searchResult = await catalog.listGraphs({
      search: keywords,
      namespace,
      page: 1,
      limit: 30
    });

    const candidates = searchResult.data || [];
    if (candidates.length === 0) {
      return this.success({ results: [], scoringMethod: 'none', message: 'No graphs found matching description keywords.' });
    }

    // Phase 2: structural fingerprint scoring
    const queryToolSet = new Set(toolIds.map(t => t.toLowerCase()));
    const scored = candidates.map(g => this._scoreCandidate(g, queryToolSet, nodeCount, keywords));

    // Phase 3: GNN embedding boost (optional, parallel)
    let gnnUsed = false;
    if (useGNN) {
      gnnUsed = await this._applyGNNBoost(scored, description);
    }

    // Sort by final score descending
    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    const results = scored.slice(0, Math.min(limit, 10));

    return this.success({
      results,
      scoringMethod: gnnUsed ? 'hybrid_keyword+structural+gnn' : 'keyword+structural',
    });
  }

  _scoreCandidate(g, queryToolSet, nodeCount, keywords) {
    let graphNodes = [], graphToolIds = new Set();
    try {
      const def = g.definition || {};
      const nodes = typeof def.nodes === 'string' ? JSON.parse(def.nodes) : (def.nodes || []);
      graphNodes = Array.isArray(nodes) ? nodes : [];
      for (const n of graphNodes) {
        const tid = n.data?.toolId || n.data?.executorType;
        if (tid) graphToolIds.add(tid.toLowerCase());
      }
    } catch {}

    const graphEdges = (() => {
      try {
        const def = g.definition || {};
        const edges = typeof def.edges === 'string' ? JSON.parse(def.edges) : (def.edges || []);
        return Array.isArray(edges) ? edges : [];
      } catch { return []; }
    })();

    // Jaccard similarity on toolId sets
    let toolSimilarity = 0;
    if (queryToolSet.size > 0 && graphToolIds.size > 0) {
      const intersection = [...queryToolSet].filter(t => graphToolIds.has(t)).length;
      const union = new Set([...queryToolSet, ...graphToolIds]).size;
      toolSimilarity = union > 0 ? intersection / union : 0;
    }

    // Node count proximity (0-1)
    let nodeCountScore = 0;
    if (nodeCount && graphNodes.length > 0) {
      const diff = Math.abs(graphNodes.length - nodeCount);
      nodeCountScore = Math.max(0, 1 - diff / Math.max(nodeCount, graphNodes.length));
    }

    // Text match bonus
    const nameLower = (g.name || '').toLowerCase();
    const descLower = (g.description || '').toLowerCase();
    const keywordLower = keywords.toLowerCase();
    const textBonus = nameLower.includes(keywordLower) ? 0.3 :
                       descLower.includes(keywordLower.split(' ')[0] || '') ? 0.1 : 0;

    // Base structural score (weighted)
    const structuralScore = (toolSimilarity * 0.5) + (nodeCountScore * 0.3) + textBonus + 0.1;

    const reasons = [];
    if (toolSimilarity > 0) reasons.push(`toolId overlap: ${(toolSimilarity * 100).toFixed(0)}%`);
    if (nodeCountScore > 0) reasons.push(`node count: ${graphNodes.length} (target: ${nodeCount})`);
    if (textBonus > 0) reasons.push('name/description keyword match');

    // Extract Memgraph node IDs for GNN lookup
    const memgraphNodeIds = [];
    for (const n of graphNodes) {
      const mid = n.data?.memgraphId || n.data?.externalId || n.id;
      if (mid) memgraphNodeIds.push(String(mid));
    }

    return {
      graphId: g.id,
      name: g.name,
      type: g.type,
      namespace: g.namespace,
      description: (g.description || '').slice(0, 150),
      similarityScore: Math.round(structuralScore * 100) / 100,
      structuralScore: Math.round(structuralScore * 100) / 100,
      gnnScore: null,
      matchReason: reasons.join('; ') || 'keyword match only',
      nodeCount: graphNodes.length,
      edgeCount: graphEdges.length,
      tags: g.tags || [],
      _memgraphNodeIds: memgraphNodeIds, // internal, for GNN lookup
    };
  }

  /**
   * Optionally boost scores using GNN graph-level embeddings.
   * Calls POST /api/v1/gnn/embed/text to get query embedding,
   * then POST /api/v1/gnn/graph-embedding for each candidate.
   * Returns true if GNN was successfully used.
   */
  async _applyGNNBoost(scored, description) {
    // Get query embedding from description text
    const queryEmb = await callGNN('/api/v1/gnn/embed/text', { text: description });
    if (!queryEmb || !queryEmb.embedding) return false;

    const queryVec = queryEmb.embedding;

    // Get graph embeddings for candidates that have Memgraph node IDs
    const candidatesWithIds = scored.filter(s => s._memgraphNodeIds.length > 0);
    if (candidatesWithIds.length === 0) return false;

    // Batch: get all graph embeddings in parallel (max 10)
    const batchSize = Math.min(candidatesWithIds.length, 10);
    const promises = candidatesWithIds.slice(0, batchSize).map(async (candidate) => {
      const result = await callGNN('/api/v1/gnn/graph-embedding', {
        nodeIds: candidate._memgraphNodeIds,
        method: 'mean_pool'
      });
      return { graphId: candidate.graphId, result };
    });

    const embeddings = await Promise.all(promises);
    let anyGNN = false;

    for (const { graphId, result } of embeddings) {
      if (!result || !result.embedding) continue;

      const gnnSim = cosineSimilarity(queryVec, result.embedding);
      const candidate = scored.find(s => s.graphId === graphId);
      if (!candidate) continue;

      candidate.gnnScore = Math.round(gnnSim * 100) / 100;

      // Hybrid: 60% structural + 40% GNN
      candidate.similarityScore = Math.round(
        (candidate.structuralScore * 0.6 + gnnSim * 0.4) * 100
      ) / 100;

      if (gnnSim > 0.1) {
        candidate.matchReason += `; GNN similarity: ${(gnnSim * 100).toFixed(0)}%`;
      }
      anyGNN = true;
    }

    // Clean up internal field
    for (const s of scored) {
      delete s._memgraphNodeIds;
    }

    return anyGNN;
  }
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  const minLen = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < minLen; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

module.exports = { FindSimilarGraphsTool };
