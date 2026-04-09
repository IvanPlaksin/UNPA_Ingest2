/**
 * ReuseStrategyResolver — Phase B
 *
 * Analyzes a node that needs a sub-graph and recommends a reuse strategy
 * by searching the graph catalog for similar existing graphs.
 *
 * Strategies:
 *   DIRECT_REUSE     — similarity ≥ 0.9, link existing graph
 *   CLONE_MODIFY     — similarity 0.6–0.9, clone + modify
 *   ABSTRACT_INHERIT — template/pattern match
 *   CREATE_NEW       — no suitable match, create from scratch
 */

let _catalogService = null;
function getCatalog() {
  if (!_catalogService) {
    _catalogService = require('../graphCatalog.service').graphCatalogService;
  }
  return _catalogService;
}

const GNN_SERVICE_URL = process.env.GNN_SERVICE_URL || 'http://localhost:5000';

/**
 * Call GNN service. Returns null on failure (graceful degradation).
 */
async function callGNN(endpoint, data) {
  try {
    const response = await fetch(`${GNN_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const STRATEGY = {
  DIRECT_REUSE: 'DIRECT_REUSE',
  CLONE_MODIFY: 'CLONE_MODIFY',
  ABSTRACT_INHERIT: 'ABSTRACT_INHERIT',
  CREATE_NEW: 'CREATE_NEW'
};

const THRESHOLDS = {
  DIRECT_REUSE: 0.9,
  CLONE_MODIFY: 0.6,
  ABSTRACT_INHERIT: 0.5, // for templates
  MINIMUM_RELEVANCE: 0.3
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'are', 'was', 'be', 'this', 'that', 'it',
  'from', 'as', 'do', 'not', 'will', 'can', 'has', 'have', 'all', 'each'
]);

class ReuseStrategyResolver {
  constructor(catalogService = null) {
    this.catalog = catalogService || getCatalog();
  }

  /**
   * Main entry: analyze node and recommend reuse strategy
   * @param {Object} nodeContext - { nodeId, nodeLabel, nodeDescription, expectedToolIds, parentGraphId }
   * @returns {Promise<StrategyProposal>}
   */
  async analyze(nodeContext) {
    const { nodeId, nodeLabel } = nodeContext;

    // Step 1: Extract search criteria from node context
    const criteria = this.extractSearchCriteria(nodeContext);

    // Step 2: Search catalog for candidates
    const candidates = await this.searchCatalog(criteria);

    // Step 3: Score each candidate (structural)
    const scored = this.scoreCandidates(candidates, criteria);

    // Step 3b: Optionally boost with GNN similarity
    const gnnUsed = await this._applyGNNBoost(scored, nodeContext);

    // Step 4: Decide strategy
    const decision = this.decideStrategy(scored, criteria);

    // Step 5: Build proposal
    const proposal = this.generateProposal(decision, scored, nodeContext);
    proposal.gnnUsed = gnnUsed;
    return proposal;
  }

  // ───────────────────────────────────────────────────
  // Step 1: Extract search criteria
  // ───────────────────────────────────────────────────

  extractSearchCriteria(nodeContext) {
    const { nodeLabel = '', nodeDescription = '', expectedToolIds = [] } = nodeContext;

    const text = `${nodeLabel} ${nodeDescription}`.toLowerCase();
    const keywords = text
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));

    // Infer topology from keywords
    const topologyHints = {
      PIPELINE: ['process', 'transform', 'convert', 'extract', 'load', 'etl', 'pipeline', 'sequential'],
      DAG:      ['parallel', 'merge', 'split', 'aggregate', 'combine', 'fan', 'join'],
      TREE:     ['branch', 'condition', 'switch', 'route', 'decision', 'conditional']
    };

    let inferredTopology = 'DAG';
    for (const [topo, hints] of Object.entries(topologyHints)) {
      if (hints.some(h => keywords.includes(h))) {
        inferredTopology = topo;
        break;
      }
    }

    return {
      keywords: [...new Set(keywords)],
      expectedToolIds,
      inferredTopology,
      type: 'SUBGRAPH'
    };
  }

  // ───────────────────────────────────────────────────
  // Step 2: Search catalog
  // ───────────────────────────────────────────────────

  async searchCatalog(criteria) {
    const { keywords } = criteria;
    const candidates = [];

    try {
      // Search by keywords
      if (keywords.length > 0) {
        const searchTerm = keywords.slice(0, 5).join(' ');
        const keywordResults = await this.catalog.listGraphs({
          search: searchTerm,
          limit: 15
        });
        if (keywordResults?.graphs) {
          candidates.push(...keywordResults.graphs);
        } else if (Array.isArray(keywordResults)) {
          candidates.push(...keywordResults);
        }
      }

      // Also search for templates
      const templateResults = await this.catalog.listGraphs({
        type: 'template',
        limit: 10
      });
      if (templateResults?.graphs) {
        candidates.push(...templateResults.graphs);
      } else if (Array.isArray(templateResults)) {
        candidates.push(...templateResults);
      }
    } catch (err) {
      console.warn('[ReuseResolver] Catalog search error:', err.message);
    }

    // Deduplicate by id
    const seen = new Set();
    return candidates.filter(c => {
      const key = c.entryId || c.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ───────────────────────────────────────────────────
  // Step 3: Score candidates
  // ───────────────────────────────────────────────────

  scoreCandidates(candidates, criteria) {
    const { expectedToolIds, inferredTopology, keywords } = criteria;

    return candidates.map(candidate => {
      let score = 0;
      const breakdown = {};

      // Extract toolIds from candidate (may be in definition JSON or top-level)
      const candToolIds = candidate.toolIds ||
        this._extractToolIdsFromNodes(candidate.nodes);

      // 1. ToolId Jaccard similarity (weight: 0.4)
      if (expectedToolIds.length > 0 && candToolIds.length > 0) {
        const intersection = expectedToolIds.filter(t => candToolIds.includes(t));
        const union = new Set([...expectedToolIds, ...candToolIds]);
        breakdown.toolIdJaccard = Math.round((intersection.length / union.size) * 100) / 100;
        score += breakdown.toolIdJaccard * 0.4;
      } else {
        breakdown.toolIdJaccard = 0;
      }

      // 2. Topology match (weight: 0.15)
      const candTopology = candidate.topology ||
        this._inferTopologyFromCandidate(candidate);
      breakdown.topologyMatch = candTopology === inferredTopology ? 1 : 0;
      score += breakdown.topologyMatch * 0.15;

      // 3. Tag/keyword overlap (weight: 0.25)
      const tags = (candidate.tags || []).map(t => t.toLowerCase());
      const nameWords = (candidate.name || '').toLowerCase().split(/\s+/);
      const descWords = (candidate.description || '').toLowerCase().split(/\s+/);
      const allCandWords = new Set([...tags, ...nameWords, ...descWords]);

      const matchingKw = keywords.filter(k => allCandWords.has(k));
      breakdown.keywordOverlap = keywords.length > 0
        ? Math.round((matchingKw.length / keywords.length) * 100) / 100
        : 0;
      score += breakdown.keywordOverlap * 0.25;

      // 4. Node count proximity (weight: 0.1) — prefer similar complexity
      const candNodeCount = candidate.nodeCount ||
        (candidate.nodes ? candidate.nodes.length : 0);
      if (candNodeCount > 0) {
        // Sigmoid-like proximity: 1.0 for exact match, drops off
        breakdown.sizeProximity = candNodeCount >= 3 && candNodeCount <= 20 ? 0.8 : 0.4;
        score += breakdown.sizeProximity * 0.1;
      }

      // 5. Quality/usage bonus (weight: 0.1)
      breakdown.qualityBonus = Math.min(1, (candidate.qualityScore || 0.5));
      score += breakdown.qualityBonus * 0.1;

      return {
        entryId: candidate.entryId || candidate.id,
        name: candidate.name,
        description: candidate.description,
        type: candidate.type,
        nodeCount: candNodeCount,
        edgeCount: candidate.edgeCount || (candidate.edges ? candidate.edges.length : 0),
        toolIds: candToolIds,
        tags: candidate.tags || [],
        topology: candTopology,
        qualityScore: candidate.qualityScore,
        similarityScore: Math.round(score * 100) / 100,
        scoreBreakdown: breakdown
      };
    }).sort((a, b) => b.similarityScore - a.similarityScore);
  }

  // ───────────────────────────────────────────────────
  // Step 4: Decide strategy
  // ───────────────────────────────────────────────────

  decideStrategy(scoredCandidates, criteria) {
    if (scoredCandidates.length === 0) {
      return {
        strategy: STRATEGY.CREATE_NEW,
        reason: 'No graphs found in catalog'
      };
    }

    const best = scoredCandidates[0];

    // Template match takes priority
    if (best.type === 'template' && best.similarityScore > THRESHOLDS.ABSTRACT_INHERIT) {
      return {
        strategy: STRATEGY.ABSTRACT_INHERIT,
        reason: `Template "${best.name}" matches (${pct(best.similarityScore)} confidence)`,
        sourceGraph: best
      };
    }

    // High similarity → direct reuse
    if (best.similarityScore >= THRESHOLDS.DIRECT_REUSE) {
      return {
        strategy: STRATEGY.DIRECT_REUSE,
        reason: `"${best.name}" is ${pct(best.similarityScore)} similar — direct reuse recommended`,
        sourceGraph: best
      };
    }

    // Medium similarity → clone and modify
    if (best.similarityScore >= THRESHOLDS.CLONE_MODIFY) {
      return {
        strategy: STRATEGY.CLONE_MODIFY,
        reason: `"${best.name}" is ${pct(best.similarityScore)} similar — clone and modify`,
        sourceGraph: best,
        suggestedModifications: this._computeModificationHints(best, criteria)
      };
    }

    // Low but notable
    if (best.similarityScore >= THRESHOLDS.MINIMUM_RELEVANCE) {
      return {
        strategy: STRATEGY.CREATE_NEW,
        reason: `Best match "${best.name}" is only ${pct(best.similarityScore)} similar — new graph recommended`,
        alternatives: scoredCandidates.slice(0, 3)
      };
    }

    return {
      strategy: STRATEGY.CREATE_NEW,
      reason: 'No sufficiently similar graphs found'
    };
  }

  // ───────────────────────────────────────────────────
  // Step 5: Generate proposal
  // ───────────────────────────────────────────────────

  generateProposal(decision, scoredCandidates, nodeContext) {
    return {
      nodeId: nodeContext.nodeId,
      nodeLabel: nodeContext.nodeLabel,
      strategy: decision.strategy,
      confidence: decision.sourceGraph?.similarityScore || 0,
      reasoning: decision.reason,
      sourceGraph: decision.sourceGraph ? {
        entryId: decision.sourceGraph.entryId,
        name: decision.sourceGraph.name,
        description: decision.sourceGraph.description,
        nodeCount: decision.sourceGraph.nodeCount,
        edgeCount: decision.sourceGraph.edgeCount,
        toolIds: decision.sourceGraph.toolIds,
        similarityScore: decision.sourceGraph.similarityScore,
        scoreBreakdown: decision.sourceGraph.scoreBreakdown
      } : null,
      suggestedModifications: decision.suggestedModifications || [],
      alternatives: (decision.alternatives || scoredCandidates.slice(1, 4)).map(alt => ({
        entryId: alt.entryId,
        name: alt.name,
        similarityScore: alt.similarityScore
      })),
      totalCandidatesSearched: scoredCandidates.length
    };
  }

  // ───────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────

  _extractToolIdsFromNodes(nodes) {
    if (!Array.isArray(nodes)) return [];
    return [...new Set(
      nodes.filter(n => n.data?.toolId).map(n => n.data.toolId)
    )];
  }

  _inferTopologyFromCandidate(candidate) {
    const edges = candidate.edges || [];
    const nodes = candidate.nodes || [];
    if (nodes.length === 0) return 'DAG';

    const inDeg = new Map();
    const outDeg = new Map();
    for (const n of nodes) { inDeg.set(n.id, 0); outDeg.set(n.id, 0); }
    for (const e of edges) {
      const src = e.source || e.sourceNodeId;
      const tgt = e.target || e.targetNodeId;
      inDeg.set(tgt, (inDeg.get(tgt) || 0) + 1);
      outDeg.set(src, (outDeg.get(src) || 0) + 1);
    }
    const maxIn = Math.max(0, ...inDeg.values());
    const maxOut = Math.max(0, ...outDeg.values());
    if (maxIn <= 1 && maxOut <= 1) return 'PIPELINE';
    if (maxIn <= 1) return 'TREE';
    return 'DAG';
  }

  /**
   * GNN similarity boost: call Python GNN service to compare graph structures.
   * Gracefully degrades if GNN service is unavailable.
   * @returns {boolean} whether GNN was successfully used
   */
  async _applyGNNBoost(scoredCandidates, nodeContext) {
    if (scoredCandidates.length === 0) return false;

    const { nodeDescription = '', nodeLabel = '' } = nodeContext;
    const queryText = `${nodeLabel} ${nodeDescription}`.trim();
    if (!queryText) return false;

    // Get query text embedding from GNN
    const queryEmb = await callGNN('/api/v1/gnn/embed/text', { text: queryText });
    if (!queryEmb || !queryEmb.embedding) return false;

    const queryVec = queryEmb.embedding;
    let anySuccess = false;

    // For each candidate, try to get its graph-level embedding
    const candidates = scoredCandidates.slice(0, 10);
    const promises = candidates.map(async (cand) => {
      // Extract Memgraph-compatible node IDs from candidate
      const nodeIds = (cand.toolIds || []).length > 0
        ? cand.toolIds  // Use tool IDs as proxy identifiers
        : [];

      if (nodeIds.length === 0) return { cand, gnnSim: null };

      const result = await callGNN('/api/v1/gnn/graph-embedding', {
        nodeIds,
        method: 'mean_pool'
      });

      if (!result || !result.embedding) return { cand, gnnSim: null };

      const gnnSim = cosineSimilarity(queryVec, result.embedding);
      return { cand, gnnSim };
    });

    const results = await Promise.all(promises);

    for (const { cand, gnnSim } of results) {
      if (gnnSim === null) continue;

      const structScore = cand.similarityScore;
      // Hybrid: 60% structural + 40% GNN
      cand.similarityScore = Math.round((structScore * 0.6 + gnnSim * 0.4) * 100) / 100;
      cand.scoreBreakdown.gnnSimilarity = Math.round(gnnSim * 100) / 100;
      anySuccess = true;
    }

    // Re-sort after GNN boost
    if (anySuccess) {
      scoredCandidates.sort((a, b) => b.similarityScore - a.similarityScore);
    }

    return anySuccess;
  }

  _computeModificationHints(sourceGraph, criteria) {
    const hints = [];

    const sourceTools = new Set(sourceGraph.toolIds || []);
    const missing = (criteria.expectedToolIds || []).filter(t => !sourceTools.has(t));
    if (missing.length > 0) {
      hints.push({ type: 'ADD_TOOLS', tools: missing, description: `Add: ${missing.join(', ')}` });
    }

    const extra = (sourceGraph.toolIds || []).filter(t =>
      criteria.expectedToolIds.length > 0 && !criteria.expectedToolIds.includes(t)
    );
    if (extra.length > 0) {
      hints.push({ type: 'REVIEW_TOOLS', tools: extra, description: `Review: ${extra.join(', ')}` });
    }

    if (sourceGraph.topology !== criteria.inferredTopology) {
      hints.push({
        type: 'TOPOLOGY_CHANGE',
        from: sourceGraph.topology,
        to: criteria.inferredTopology,
        description: `Restructure from ${sourceGraph.topology} to ${criteria.inferredTopology}`
      });
    }

    return hints;
  }
}

function pct(val) {
  return `${Math.round((val || 0) * 100)}%`;
}

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

module.exports = { ReuseStrategyResolver, STRATEGY, THRESHOLDS };
