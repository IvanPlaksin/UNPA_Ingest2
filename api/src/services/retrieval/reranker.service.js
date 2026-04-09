/**
 * Reranker Service
 *
 * Provides result reranking using multiple signals:
 * - Heuristic boosts (title match, exact phrase, recency)
 * - Cross-encoder scoring (optional external service)
 * - MMR diversity filtering
 *
 * @module services/retrieval/reranker.service
 */

'use strict';

const axios = require('axios');

/**
 * Default reranker configuration
 */
const DEFAULT_CONFIG = {
  diversityWeight: 0.3,      // Weight for diversity in MMR (0-1)
  recencyWeight: 0.1,        // Boost for recent documents
  titleMatchBoost: 0.05,     // Boost per title term match
  exactPhraseBoost: 0.1,     // Boost for exact phrase match
  entityMatchBoost: 0.03,    // Boost per entity match
  layerBoost: 0.05,          // Boost for preferred layer
  sourceBoosts: {            // Boost by result source
    vector: 0,
    graph_entity: 0.02,
    graph_keyword: 0.01
  },
  timeout: 10000             // Cross-encoder timeout
};

/**
 * Reranker Service
 */
class RerankerService {
  /**
   * @param {Object} options - Service options
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.crossEncoderUrl = options.crossEncoderUrl || process.env.CROSS_ENCODER_URL;
    this.useCrossEncoder = options.useCrossEncoder && this.crossEncoderUrl;
  }

  /**
   * Rerank search results
   * @param {string} query - Original query
   * @param {Object[]} results - Search results to rerank
   * @param {Object} options - Reranking options
   * @returns {Promise<Object[]>} Reranked results
   */
  async rerank(query, results, options = {}) {
    if (!results || results.length === 0) return [];
    if (results.length === 1) {
      return results.map(r => ({ ...r, rerankerScore: r.fusedScore || r.score || 1, rank: 1 }));
    }

    const {
      topK = 10,
      applyDiversity = true,
      boostRecent = false,
      boostLayer = null
    } = options;

    // Initialize scores
    let scored = results.map(r => ({
      ...r,
      rerankerScore: r.fusedScore || r.score || 0,
      boosts: {}
    }));

    // Step 1: Cross-encoder scoring (if available)
    if (this.useCrossEncoder) {
      scored = await this.applyCrossEncoderScores(query, scored);
    }

    // Step 2: Apply heuristic boosts
    scored = this.applyHeuristicBoosts(query, scored, { boostRecent, boostLayer });

    // Step 3: Apply diversity (MMR)
    if (applyDiversity && scored.length > 2) {
      scored = this.applyMMRDiversity(scored, this.config.diversityWeight);
    }

    // Step 4: Sort by final score
    scored.sort((a, b) => b.rerankerScore - a.rerankerScore);

    // Step 5: Return top K with updated ranks
    return scored.slice(0, topK).map((r, idx) => ({
      ...r,
      rank: idx + 1,
      finalScore: r.rerankerScore
    }));
  }

  /**
   * Apply cross-encoder scores via external service
   * @param {string} query - Query string
   * @param {Object[]} results - Results to score
   * @returns {Promise<Object[]>} Scored results
   */
  async applyCrossEncoderScores(query, results) {
    try {
      const pairs = results.map(r => ({
        query,
        document: r.content || r.text || ''
      }));

      const response = await axios.post(
        `${this.crossEncoderUrl}/rerank`,
        { pairs },
        { timeout: this.config.timeout }
      );

      const scores = response.data;

      return results.map((r, i) => ({
        ...r,
        crossEncoderScore: scores[i]?.score || 0,
        rerankerScore: r.rerankerScore * 0.4 + (scores[i]?.score || 0) * 0.6,
        boosts: { ...r.boosts, crossEncoder: true }
      }));

    } catch (error) {
      console.warn('Cross-encoder unavailable, using original scores:', error.message);
      return results;
    }
  }

  /**
   * Apply heuristic boosts based on metadata
   * @param {string} query - Query string
   * @param {Object[]} results - Results to boost
   * @param {Object} options - Boost options
   * @returns {Object[]} Boosted results
   */
  applyHeuristicBoosts(query, results, options) {
    const queryLower = query.toLowerCase();
    const queryTerms = new Set(
      queryLower
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2)
    );

    return results.map(r => {
      const boosts = { ...r.boosts };
      let totalBoost = 0;

      // Title match boost
      const title = (r.title || r.name || '').toLowerCase();
      if (title) {
        const titleMatchCount = [...queryTerms].filter(t => title.includes(t)).length;
        const titleBoost = titleMatchCount * this.config.titleMatchBoost;
        if (titleBoost > 0) {
          totalBoost += titleBoost;
          boosts.titleMatch = titleBoost;
        }
      }

      // Exact phrase match boost
      const content = (r.content || r.text || '').toLowerCase();
      if (content.includes(queryLower)) {
        totalBoost += this.config.exactPhraseBoost;
        boosts.exactPhrase = this.config.exactPhraseBoost;
      }

      // Entity match boost
      if (r.entities && Array.isArray(r.entities)) {
        const entityMatches = r.entities.filter(e =>
          queryLower.includes((e.name || e).toString().toLowerCase())
        ).length;
        const entityBoost = entityMatches * this.config.entityMatchBoost;
        if (entityBoost > 0) {
          totalBoost += entityBoost;
          boosts.entityMatch = entityBoost;
        }
      }

      // Recency boost
      if (options.boostRecent && (r.changedDate || r.createdDate)) {
        const date = new Date(r.changedDate || r.createdDate);
        const age = Date.now() - date.getTime();
        const dayAge = age / (1000 * 60 * 60 * 24);

        let recencyBoost = 0;
        if (dayAge < 7) recencyBoost = 0.08;
        else if (dayAge < 30) recencyBoost = 0.05;
        else if (dayAge < 90) recencyBoost = 0.02;

        if (recencyBoost > 0) {
          totalBoost += recencyBoost;
          boosts.recency = recencyBoost;
        }
      }

      // Layer boost
      if (options.boostLayer && r.layer === options.boostLayer) {
        totalBoost += this.config.layerBoost;
        boosts.layer = this.config.layerBoost;
      }

      // Source boost
      if (r.source && this.config.sourceBoosts[r.source]) {
        const sourceBoost = this.config.sourceBoosts[r.source];
        totalBoost += sourceBoost;
        boosts.source = sourceBoost;
      }

      return {
        ...r,
        rerankerScore: Math.min(1, r.rerankerScore + totalBoost),
        boosts,
        totalBoost
      };
    });
  }

  /**
   * Apply Maximal Marginal Relevance for diversity
   * @param {Object[]} results - Scored results
   * @param {number} lambda - Balance between relevance and diversity (0-1)
   * @returns {Object[]} Diversified results
   */
  applyMMRDiversity(results, lambda = 0.3) {
    const selected = [results[0]]; // Start with most relevant
    const remaining = [...results.slice(1)];

    while (remaining.length > 0 && selected.length < results.length) {
      let bestIdx = -1;
      let bestMMR = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Calculate max similarity to already selected docs
        const maxSim = Math.max(
          ...selected.map(s => this.calculateSimilarity(candidate, s))
        );

        // MMR = lambda * relevance - (1-lambda) * max_similarity
        const mmr = lambda * candidate.rerankerScore - (1 - lambda) * maxSim;

        if (mmr > bestMMR) {
          bestMMR = mmr;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        const chosen = remaining.splice(bestIdx, 1)[0];
        // Slight penalty for diversity-selected items
        chosen.rerankerScore = chosen.rerankerScore * (1 - (1 - lambda) * 0.05);
        chosen.boosts = { ...chosen.boosts, mmrSelected: true };
        selected.push(chosen);
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Calculate similarity between two results (for diversity)
   * @param {Object} a - First result
   * @param {Object} b - Second result
   * @returns {number} Similarity score (0-1)
   */
  calculateSimilarity(a, b) {
    const textA = (a.content || a.text || '').toLowerCase();
    const textB = (b.content || b.text || '').toLowerCase();

    // Jaccard similarity on words
    const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 2));

    if (wordsA.size === 0 && wordsB.size === 0) return 0;

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    const jaccardSim = union.size > 0 ? intersection.size / union.size : 0;

    // Also consider type/source similarity
    const typeSim = a.type === b.type ? 0.2 : 0;
    const layerSim = a.layer === b.layer ? 0.1 : 0;

    return Math.min(1, jaccardSim + typeSim + layerSim);
  }

  /**
   * Simple rerank without external services
   * @param {string} query - Query string
   * @param {Object[]} results - Results to rerank
   * @param {number} topK - Number of results to return
   * @returns {Object[]} Reranked results
   */
  simpleRerank(query, results, topK = 10) {
    if (!results || results.length === 0) return [];

    let scored = results.map(r => ({
      ...r,
      rerankerScore: r.fusedScore || r.score || 0,
      boosts: {}
    }));

    scored = this.applyHeuristicBoosts(query, scored, {});

    if (scored.length > 2) {
      scored = this.applyMMRDiversity(scored, 0.3);
    }

    return scored
      .sort((a, b) => b.rerankerScore - a.rerankerScore)
      .slice(0, topK)
      .map((r, idx) => ({
        ...r,
        rank: idx + 1,
        finalScore: r.rerankerScore
      }));
  }

  /**
   * Get reranking statistics
   * @param {Object[]} results - Reranked results
   * @returns {Object} Statistics
   */
  getStats(results) {
    if (!results || results.length === 0) {
      return { count: 0 };
    }

    const boostTypes = {};
    let totalBoost = 0;

    for (const r of results) {
      if (r.boosts) {
        for (const [type, value] of Object.entries(r.boosts)) {
          if (typeof value === 'number') {
            boostTypes[type] = (boostTypes[type] || 0) + 1;
            totalBoost += value;
          }
        }
      }
    }

    return {
      count: results.length,
      avgScore: results.reduce((sum, r) => sum + (r.rerankerScore || 0), 0) / results.length,
      boostTypes,
      avgBoost: totalBoost / results.length
    };
  }
}

/**
 * Create reranker service
 */
function createRerankerService(options = {}) {
  return new RerankerService(options);
}

module.exports = {
  RerankerService,
  createRerankerService,
  DEFAULT_CONFIG
};
