/**
 * Result Fusion Service
 *
 * Implements various fusion algorithms for combining search results
 * from multiple sources (vector search, graph traversal, keyword search).
 *
 * Supported methods:
 * - RRF (Reciprocal Rank Fusion)
 * - Linear combination
 * - Max score selection
 * - Borda count
 *
 * @module services/retrieval/result-fusion
 */

/**
 * Default fusion configuration
 */
const DEFAULT_CONFIG = {
  method: 'rrf',
  k: 60, // RRF constant (default from original paper)
  deduplicateBy: 'id', // 'id', 'content', or null
  minScore: 0,
  preserveSource: true
};

/**
 * Reciprocal Rank Fusion (RRF)
 *
 * RRF formula: score(d) = Σ 1 / (k + rank(d))
 *
 * @param {Array<Object>} rankedLists - Array of {results, weight} objects
 * @param {number} k - RRF constant (default: 60)
 * @returns {Array<Object>} Fused results
 */
function rrfFusion(rankedLists, k = 60) {
  const scores = new Map();
  const items = new Map();

  for (const { results, weight = 1 } of rankedLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const item = results[rank];
      const id = item.id || item.content;

      // RRF score
      const rrfScore = weight / (k + rank + 1);

      if (scores.has(id)) {
        scores.set(id, scores.get(id) + rrfScore);
      } else {
        scores.set(id, rrfScore);
        items.set(id, item);
      }
    }
  }

  // Sort by RRF score
  const sortedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return sortedIds.map(id => ({
    ...items.get(id),
    fusedScore: scores.get(id),
    fusionMethod: 'rrf'
  }));
}

/**
 * Linear combination fusion
 *
 * Combines scores using weighted sum: score(d) = Σ w_i * score_i(d)
 *
 * @param {Array<Object>} rankedLists - Array of {results, weight} objects
 * @returns {Array<Object>} Fused results
 */
function linearFusion(rankedLists) {
  const scores = new Map();
  const items = new Map();

  for (const { results, weight = 1 } of rankedLists) {
    for (const item of results) {
      const id = item.id || item.content;
      const itemScore = (item.score || 0) * weight;

      if (scores.has(id)) {
        scores.set(id, scores.get(id) + itemScore);
      } else {
        scores.set(id, itemScore);
        items.set(id, item);
      }
    }
  }

  // Sort by combined score
  const sortedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return sortedIds.map(id => ({
    ...items.get(id),
    fusedScore: scores.get(id),
    fusionMethod: 'linear'
  }));
}

/**
 * Max score fusion
 *
 * Takes the maximum score across all lists for each item
 *
 * @param {Array<Object>} rankedLists - Array of {results, weight} objects
 * @returns {Array<Object>} Fused results
 */
function maxFusion(rankedLists) {
  const scores = new Map();
  const items = new Map();

  for (const { results, weight = 1 } of rankedLists) {
    for (const item of results) {
      const id = item.id || item.content;
      const itemScore = (item.score || 0) * weight;

      if (scores.has(id)) {
        scores.set(id, Math.max(scores.get(id), itemScore));
      } else {
        scores.set(id, itemScore);
        items.set(id, item);
      }
    }
  }

  // Sort by max score
  const sortedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return sortedIds.map(id => ({
    ...items.get(id),
    fusedScore: scores.get(id),
    fusionMethod: 'max'
  }));
}

/**
 * Borda count fusion
 *
 * Assigns points based on position: n-1 for rank 1, n-2 for rank 2, etc.
 *
 * @param {Array<Object>} rankedLists - Array of {results, weight} objects
 * @returns {Array<Object>} Fused results
 */
function bordaFusion(rankedLists) {
  const scores = new Map();
  const items = new Map();

  for (const { results, weight = 1 } of rankedLists) {
    const n = results.length;
    for (let rank = 0; rank < results.length; rank++) {
      const item = results[rank];
      const id = item.id || item.content;

      // Borda score: (n - rank) * weight
      const bordaScore = (n - rank) * weight;

      if (scores.has(id)) {
        scores.set(id, scores.get(id) + bordaScore);
      } else {
        scores.set(id, bordaScore);
        items.set(id, item);
      }
    }
  }

  // Sort by Borda score
  const sortedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return sortedIds.map(id => ({
    ...items.get(id),
    fusedScore: scores.get(id),
    fusionMethod: 'borda'
  }));
}

/**
 * Main fusion function
 *
 * @param {Object} list1 - First list with {results, weight}
 * @param {Object} list2 - Second list with {results, weight}
 * @param {Object} options - Fusion options
 * @returns {Array<Object>} Fused and deduplicated results
 */
function resultFusion(list1, list2, options = {}) {
  const opts = { ...DEFAULT_CONFIG, ...options };
  const rankedLists = [list1, list2].filter(l => l && l.results && l.results.length > 0);

  if (rankedLists.length === 0) {
    return [];
  }

  if (rankedLists.length === 1) {
    return rankedLists[0].results.map(r => ({
      ...r,
      fusedScore: r.score || 0,
      fusionMethod: 'single'
    }));
  }

  // Apply fusion method
  let fused;
  switch (opts.method) {
    case 'rrf':
      fused = rrfFusion(rankedLists, opts.k);
      break;
    case 'linear':
      fused = linearFusion(rankedLists);
      break;
    case 'max':
      fused = maxFusion(rankedLists);
      break;
    case 'borda':
      fused = bordaFusion(rankedLists);
      break;
    default:
      fused = rrfFusion(rankedLists, opts.k);
  }

  // Apply deduplication if configured
  if (opts.deduplicateBy) {
    fused = deduplicateResults(fused, opts.deduplicateBy);
  }

  // Filter by minimum score
  if (opts.minScore > 0) {
    fused = fused.filter(r => r.fusedScore >= opts.minScore);
  }

  return fused;
}

/**
 * Fuse multiple lists
 *
 * @param {Array<Object>} lists - Array of {results, weight} objects
 * @param {Object} options - Fusion options
 * @returns {Array<Object>} Fused results
 */
function fuseMultiple(lists, options = {}) {
  const opts = { ...DEFAULT_CONFIG, ...options };
  const rankedLists = lists.filter(l => l && l.results && l.results.length > 0);

  if (rankedLists.length === 0) return [];
  if (rankedLists.length === 1) {
    return rankedLists[0].results.map(r => ({
      ...r,
      fusedScore: r.score || 0
    }));
  }

  let fused;
  switch (opts.method) {
    case 'rrf':
      fused = rrfFusion(rankedLists, opts.k);
      break;
    case 'linear':
      fused = linearFusion(rankedLists);
      break;
    case 'max':
      fused = maxFusion(rankedLists);
      break;
    case 'borda':
      fused = bordaFusion(rankedLists);
      break;
    default:
      fused = rrfFusion(rankedLists, opts.k);
  }

  if (opts.deduplicateBy) {
    fused = deduplicateResults(fused, opts.deduplicateBy);
  }

  return fused;
}

/**
 * Deduplicate results
 *
 * @param {Array<Object>} results - Results to deduplicate
 * @param {string} by - Field to deduplicate by ('id', 'content')
 * @returns {Array<Object>} Deduplicated results
 */
function deduplicateResults(results, by = 'id') {
  const seen = new Set();
  return results.filter(r => {
    const key = by === 'content'
      ? (r.content || '').substring(0, 100).toLowerCase()
      : r[by];

    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Normalize scores to 0-1 range
 *
 * @param {Array<Object>} results - Results to normalize
 * @param {string} scoreField - Field containing score
 * @returns {Array<Object>} Normalized results
 */
function normalizeResults(results, scoreField = 'score') {
  if (!results || results.length === 0) return [];

  const scores = results.map(r => r[scoreField] || 0);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;

  if (range === 0) {
    return results.map(r => ({ ...r, [scoreField]: 1 }));
  }

  return results.map(r => ({
    ...r,
    [scoreField]: (r[scoreField] - minScore) / range,
    originalScore: r[scoreField]
  }));
}

/**
 * Rerank results using a reranker function
 *
 * @param {Array<Object>} results - Results to rerank
 * @param {Function} reranker - Reranking function (item, query) => score
 * @param {string} query - Original query
 * @returns {Promise<Array<Object>>} Reranked results
 */
async function rerankResults(results, reranker, query) {
  const reranked = await Promise.all(
    results.map(async (item) => {
      const rerankScore = await reranker(item, query);
      return {
        ...item,
        rerankScore,
        combinedScore: (item.fusedScore || 0) * 0.5 + rerankScore * 0.5
      };
    })
  );

  return reranked.sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Calculate diversity score for results
 *
 * @param {Array<Object>} results - Results to analyze
 * @returns {Object} Diversity metrics
 */
function calculateDiversity(results) {
  if (!results || results.length === 0) {
    return { typeDiv: 0, sourceDiv: 0, overall: 0 };
  }

  // Type diversity
  const types = new Set(results.map(r => r.type).filter(Boolean));
  const typeDiv = types.size / results.length;

  // Source diversity
  const sources = new Set(results.map(r => r.source).filter(Boolean));
  const sourceDiv = sources.size / results.length;

  return {
    typeDiv,
    sourceDiv,
    uniqueTypes: [...types],
    uniqueSources: [...sources],
    overall: (typeDiv + sourceDiv) / 2
  };
}

/**
 * Apply Maximum Marginal Relevance (MMR) for diversity
 *
 * @param {Array<Object>} results - Results to diversify
 * @param {number} lambda - Balance between relevance and diversity (0-1)
 * @param {number} limit - Number of results to return
 * @returns {Array<Object>} Diversified results
 */
function mmrDiversify(results, lambda = 0.7, limit = 10) {
  if (!results || results.length === 0) return [];

  const selected = [];
  const candidates = [...results];

  // Select first item (highest score)
  selected.push(candidates.shift());

  while (selected.length < limit && candidates.length > 0) {
    let bestScore = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      // Relevance score
      const relevance = candidate.fusedScore || candidate.score || 0;

      // Diversity: max similarity to already selected items
      const maxSimilarity = Math.max(
        ...selected.map(s => contentSimilarity(candidate, s))
      );

      // MMR score
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(candidates.splice(bestIdx, 1)[0]);
  }

  return selected.map((item, idx) => ({
    ...item,
    mmrRank: idx + 1
  }));
}

/**
 * Simple content similarity (Jaccard on words)
 * @private
 */
function contentSimilarity(item1, item2) {
  const words1 = new Set((item1.content || '').toLowerCase().split(/\s+/));
  const words2 = new Set((item2.content || '').toLowerCase().split(/\s+/));

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return union > 0 ? intersection / union : 0;
}

module.exports = {
  resultFusion,
  fuseMultiple,
  rrfFusion,
  linearFusion,
  maxFusion,
  bordaFusion,
  deduplicateResults,
  normalizeResults,
  rerankResults,
  calculateDiversity,
  mmrDiversify,
  DEFAULT_CONFIG
};
