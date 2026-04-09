'use strict';

/**
 * CatalogReuseService
 *
 * Searches Graph Catalog for similar graphs and determines reuse strategy
 * BEFORE AI generation begins. Integrates with ReuseStrategyResolver and
 * graphCatalogService to avoid generating graphs that already exist.
 *
 * Flow: User message → classifyIntent → findReuseOpportunity → strategy decision
 */

const { ReuseStrategyResolver } = require('./reuse-strategy-resolver');
const { graphCatalogService } = require('../graphCatalog.service');

const THRESHOLDS = {
  DIRECT_REUSE: 0.9,
  CLONE_MODIFY: 0.6,
  ABSTRACT_INHERIT: 0.5,
  MINIMUM_RELEVANCE: 0.3,
};

class CatalogReuseService {
  constructor() {
    this.resolver = new ReuseStrategyResolver();
  }

  /**
   * Search catalog and determine reuse strategy for user's intent.
   * @param {string} userIntent - User's message/request
   * @param {Object} intentClassification - From classifyTaskIntent(): { primaryDomain, confidence, allDomains }
   * @returns {Object} { strategy, candidates[], bestMatch, score, recommendation, searchTerms }
   */
  async findReuseOpportunity(userIntent, intentClassification = {}) {
    const startTime = Date.now();

    try {
      // 1. Build search terms from intent
      const searchTerms = this._buildSearchTerms(userIntent, intentClassification);
      const searchQuery = searchTerms.join(' ');

      if (!searchQuery) {
        return this._createNewResult('No search terms extracted');
      }

      // 2. Search catalog via listGraphs (keyword search in name/description)
      const searchResult = await graphCatalogService.listGraphs({
        search: searchQuery,
        rootOnly: true,
        limit: 10,
      });

      const candidates = searchResult.data || [];

      if (candidates.length === 0) {
        return this._createNewResult('No similar graphs found in catalog');
      }

      // 3. Score each candidate using ReuseStrategyResolver's scoring logic
      const scoredCandidates = candidates.map(candidate => {
        const score = this._scoreCandidateAgainstIntent(candidate, userIntent, searchTerms);
        return { ...candidate, similarityScore: score };
      });

      // Sort by score descending
      scoredCandidates.sort((a, b) => b.similarityScore - a.similarityScore);

      const bestMatch = scoredCandidates[0];
      const score = bestMatch.similarityScore;

      // 4. Determine strategy
      const strategy = this._determineStrategy(score);

      // 5. Build recommendation
      const recommendation = this._buildRecommendation(strategy, bestMatch, score);

      const duration = Date.now() - startTime;
      console.log(`[CatalogReuse] Search complete: strategy=${strategy} score=${score.toFixed(3)} candidates=${candidates.length} best="${bestMatch.name}" (${duration}ms)`);

      return {
        strategy,
        candidates: scoredCandidates.slice(0, 5),
        bestMatch,
        score,
        recommendation,
        searchTerms,
        durationMs: duration,
      };
    } catch (error) {
      console.error('[CatalogReuse] Search failed:', error.message);
      return this._createNewResult(`Search error: ${error.message}`);
    }
  }

  /**
   * Score a candidate graph against user intent.
   * Simplified version of ReuseStrategyResolver scoring, adapted for text-based matching.
   */
  _scoreCandidateAgainstIntent(candidate, userIntent, searchTerms) {
    let score = 0;

    // --- Text/keyword overlap (50% weight) ---
    const candidateText = [
      candidate.name || '',
      candidate.description || '',
      ...(candidate.tags || []),
    ].join(' ').toLowerCase();

    const matchedTerms = searchTerms.filter(term => candidateText.includes(term.toLowerCase()));
    const textScore = searchTerms.length > 0 ? matchedTerms.length / searchTerms.length : 0;
    score += textScore * 0.5;

    // --- Tag overlap (25% weight) ---
    const intentWords = new Set(userIntent.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const candidateTags = new Set((candidate.tags || []).map(t => t.toLowerCase()));
    let tagOverlap = 0;
    for (const tag of candidateTags) {
      if (intentWords.has(tag)) tagOverlap++;
      // Also check partial match
      for (const word of intentWords) {
        if (tag.includes(word) || word.includes(tag)) tagOverlap += 0.5;
      }
    }
    const tagScore = candidateTags.size > 0 ? Math.min(1, tagOverlap / Math.max(candidateTags.size, 1)) : 0;
    score += tagScore * 0.25;

    // --- Node count reasonableness (15% weight) ---
    const nodeCount = candidate.nodeCount || (candidate.nodes ? candidate.nodes.length : 0);
    const sizeScore = (nodeCount >= 3 && nodeCount <= 30) ? 0.8 : 0.3;
    score += sizeScore * 0.15;

    // --- Quality/type bonus (10% weight) ---
    const typeBonus = candidate.type === 'business' ? 1.0
      : candidate.type === 'composite' ? 0.8
        : candidate.type === 'template' ? 0.9
          : 0.5;
    score += typeBonus * 0.1;

    return Math.min(1, score);
  }

  /**
   * Build search terms from user intent.
   */
  _buildSearchTerms(userIntent, intentClassification) {
    const terms = new Set();

    // From classification domains
    if (intentClassification?.allDomains) {
      intentClassification.allDomains.forEach(d => terms.add(d.replace(/_/g, ' ')));
    }
    if (intentClassification?.primaryDomain) {
      terms.add(intentClassification.primaryDomain.replace(/_/g, ' '));
    }

    // Extract meaningful words from intent
    const stopWords = new Set([
      'create', 'make', 'build', 'want', 'need', 'please', 'graph', 'can', 'you',
      'the', 'for', 'and', 'with', 'that', 'this', 'from', 'will', 'should',
      'have', 'has', 'how', 'what', 'which', 'where', 'when', 'who',
      'создай', 'сделай', 'нужен', 'хочу', 'граф', 'пожалуйста',
    ]);

    const words = userIntent
      .toLowerCase()
      .replace(/[^\w\sа-яё]/gi, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    words.forEach(w => terms.add(w));

    return Array.from(terms).slice(0, 10);
  }

  /**
   * Determine strategy from similarity score.
   */
  _determineStrategy(score) {
    if (score >= THRESHOLDS.DIRECT_REUSE) return 'DIRECT_REUSE';
    if (score >= THRESHOLDS.CLONE_MODIFY) return 'CLONE_MODIFY';
    if (score >= THRESHOLDS.ABSTRACT_INHERIT) return 'ABSTRACT_INHERIT';
    return 'CREATE_NEW';
  }

  /**
   * Build human-readable recommendation.
   */
  _buildRecommendation(strategy, bestMatch, score) {
    const pct = (score * 100).toFixed(0);
    switch (strategy) {
      case 'DIRECT_REUSE':
        return {
          action: 'USE_EXISTING',
          message: `Found highly similar graph "${bestMatch.name}" (${pct}% match). Recommend using it directly with minor adjustments.`,
          graphId: bestMatch.id,
          graphName: bestMatch.name,
        };
      case 'CLONE_MODIFY':
        return {
          action: 'CLONE_AND_MODIFY',
          message: `Found similar graph "${bestMatch.name}" (${pct}% match). Recommend cloning and modifying to match your requirements.`,
          graphId: bestMatch.id,
          graphName: bestMatch.name,
        };
      case 'ABSTRACT_INHERIT':
        return {
          action: 'USE_AS_REFERENCE',
          message: `Found related graph "${bestMatch.name}" (${pct}% match). Can use as reference/template.`,
          graphId: bestMatch.id,
          graphName: bestMatch.name,
        };
      default:
        return {
          action: 'CREATE_NEW',
          message: 'No sufficiently similar graphs found. Will generate new graph.',
          graphId: null,
          graphName: null,
        };
    }
  }

  /**
   * Fallback result for CREATE_NEW.
   */
  _createNewResult(reason) {
    return {
      strategy: 'CREATE_NEW',
      candidates: [],
      bestMatch: null,
      score: 0,
      recommendation: {
        action: 'CREATE_NEW',
        message: reason,
        graphId: null,
        graphName: null,
      },
      searchTerms: [],
      durationMs: 0,
    };
  }

  /**
   * Load full graph definition for reuse (DIRECT_REUSE or CLONE_MODIFY).
   * @param {string} graphId - CatalogEntry ID
   * @returns {Object} { id, name, nodes, edges, description, tags }
   */
  async loadGraphForReuse(graphId) {
    const graph = await graphCatalogService.getGraphById(graphId);
    if (!graph) {
      throw new Error(`Graph ${graphId} not found in catalog`);
    }
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : JSON.parse(graph.nodes || '[]');
    const edges = Array.isArray(graph.edges) ? graph.edges : JSON.parse(graph.edges || '[]');
    return {
      id: graph.id,
      name: graph.name,
      description: graph.description,
      tags: graph.tags || [],
      nodes,
      edges,
    };
  }
}

module.exports = { CatalogReuseService, THRESHOLDS };
