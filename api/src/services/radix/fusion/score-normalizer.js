/**
 * Cross-strategy score normalization.
 *
 * NOT NEEDED BY RRF — RRF ranks by position and is scale-free by construction.
 * This module exists for the value-based fusion methods ('linear', 'max'), which
 * cannot be used across heterogeneous strategies until their scores are brought
 * onto one scale: Qdrant returns a cosine in [0..1], a graph walk returns an
 * edge-weight product with a different distribution entirely.
 *
 * TODO R2.1: implement per-strategy min-max normalization for cross-encoder
 * reranking, where the reranker score must be combined with the fused score.
 *
 * @module services/radix/fusion/score-normalizer
 */

'use strict';

/**
 * Normalizes an array of fused scores into [0..1].
 *
 * Used by the orchestrator AFTER fusion, because ContextElement.score is
 * contractually in [0..1] while a raw RRF sum is not (it is roughly
 * 1/(k+1) * numStrategies at the top).
 *
 * Degenerate case: when every score is equal there is no spread to normalize,
 * and mapping them all to 0 would silently zero out a valid result set — so
 * they all map to 1.
 *
 * @param {number[]} scores
 * @returns {number[]} normalized scores, same order
 */
function minMaxNormalize(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return [];

  const finite = scores.filter((s) => Number.isFinite(s));
  if (finite.length === 0) return scores.map(() => 0);

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const spread = max - min;

  if (spread === 0) return scores.map((s) => (Number.isFinite(s) ? 1 : 0));

  return scores.map((s) => (Number.isFinite(s) ? (s - min) / spread : 0));
}

/**
 * Per-strategy normalization, for value-based fusion.
 * @returns {never}
 */
function normalizePerStrategy() {
  throw new Error('normalizePerStrategy not implemented — see TODO R2.1');
}

module.exports = {
  minMaxNormalize,
  normalizePerStrategy
};
