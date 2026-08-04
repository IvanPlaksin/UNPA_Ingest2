/**
 * Reciprocal Rank Fusion for Radix.
 *
 *   score(d) = Σ over strategies s where d appears:  1 / (k + rank_s(d))
 *
 * RRF ranks by POSITION, not by value, which is exactly what a heterogeneous
 * pipeline needs: a cosine similarity from Qdrant and an edge-weight product
 * from a graph walk are not on the same scale and must never be added directly.
 *
 * Dedup is not noise removal here — an element found by two independent paths
 * is a corroborated element, and summing its contributions is what lifts it:
 *
 *   X: rank 3 in vector, rank 7 in graph → 1/63 + 1/67 = 0.0308
 *   Y: rank 1 in vector only            → 1/61          = 0.0164
 *
 * X outranks Y despite never being anyone's top hit. That is the intended
 * behaviour, not a side effect.
 *
 * @module services/radix/fusion/rrf-fusion
 */

'use strict';

const { FusionPolicy } = require('./fusion-policy.interface');
const { DEFAULT_CONFIG } = require('../contracts/context-bundle');
const logger = require('../../../utils/logger');

class RRFFusionPolicy extends FusionPolicy {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    super();
    this.logger = dependencies.logger || logger.child('Radix');
  }

  /** @returns {string} */
  get name() {
    return 'rrf';
  }

  /**
   * @param {import('../contracts/strategy.interface').StrategyResult[]} results
   * @param {import('../contracts/context-bundle').RetrievalConfig} [config]
   * @returns {import('./fusion-policy.interface').FusedCandidate[]}
   */
  fuse(results, config = DEFAULT_CONFIG) {
    const k = typeof config.rrfK === 'number' && config.rrfK >= 1
      ? config.rrfK
      : DEFAULT_CONFIG.rrfK;
    // Fusion hands downstream a POOL, not the final answer — truncating to
    // maxElements here would leave the reranker and the assembler nothing to
    // work with. maxElements is applied in the assembler.
    const poolSize = typeof config.fusionPoolSize === 'number' && config.fusionPoolSize >= 1
      ? config.fusionPoolSize
      : DEFAULT_CONFIG.fusionPoolSize;

    /** @type {Map<string, import('./fusion-policy.interface').FusedCandidate>} */
    const fusedById = new Map();
    let skipped = 0;

    for (const result of this._usableResults(results)) {
      result.candidates.forEach((candidate, index) => {
        if (!candidate || !candidate.id) {
          // Without an id there is no dedup key — counting it would corrupt the
          // ranks of everything after it, so drop it and say so.
          skipped += 1;
          return;
        }

        const rank = index + 1; // 1-based
        const contribution = 1 / (k + rank);
        const attribution = {
          strategyName: result.strategyName,
          strategyType: result.strategyType,
          rawScore: typeof candidate.score === 'number' ? candidate.score : null,
          normalizedScore: null, // filled by the orchestrator after fusion
          rank
        };

        const existing = fusedById.get(candidate.id);
        if (existing) {
          existing.score += contribution;
          existing.strategies.push(attribution);
          // Metadata is UNIONED, not taken from whoever got here first.
          // Strategies describe the same node from different angles: the graph
          // walk knows the path and the contradiction, the vector hit does not.
          // First-seen still wins per key, so the result stays deterministic —
          // but a key only one strategy supplies is no longer thrown away.
          // Without this, a contradicting draft that also matches the query
          // semantically (the common case — it is about the same topic) loses
          // its conflict block entirely.
          existing.metadata = { ...(candidate.metadata || {}), ...existing.metadata };
          return;
        }

        fusedById.set(candidate.id, {
          id: candidate.id,
          type: candidate.type,
          content: candidate.content,
          contentRaw: candidate.contentRaw !== undefined ? candidate.contentRaw : null,
          score: contribution,
          strategies: [attribution],
          provenance: candidate.provenance,
          metadata: candidate.metadata || {}
        });
      });
    }

    if (skipped > 0) {
      this.logger.warn('[Radix:rrf] dropped candidates without id', { skipped });
    }

    this._fillNormalizedScores(fusedById);

    // Array.prototype.sort is stable (ES2019+), so ties keep first-seen order —
    // fusion is deterministic for a given input ordering.
    const fused = Array.from(fusedById.values()).sort((a, b) => b.score - a.score);

    return fused.slice(0, poolSize);
  }

  /**
   * Fills `normalizedScore` on every attribution, min-max WITHIN each strategy.
   *
   * The fused score answers "how relevant overall"; this answers "how strong was
   * this hit for the strategy that found it" — a cosine of 0.87 means something
   * different among vector hits than an edge-weight product of 0.87 does among
   * graph hits, so the two are normalized separately and never against each other.
   *
   * @param {Map<string, import('./fusion-policy.interface').FusedCandidate>} fusedById
   * @private
   */
  _fillNormalizedScores(fusedById) {
    /** @type {Map<string, {min: number, max: number}>} */
    const ranges = new Map();

    for (const candidate of fusedById.values()) {
      for (const attribution of candidate.strategies) {
        if (!Number.isFinite(attribution.rawScore)) continue;
        const range = ranges.get(attribution.strategyName);
        if (!range) {
          ranges.set(attribution.strategyName, {
            min: attribution.rawScore,
            max: attribution.rawScore
          });
        } else {
          if (attribution.rawScore < range.min) range.min = attribution.rawScore;
          if (attribution.rawScore > range.max) range.max = attribution.rawScore;
        }
      }
    }

    for (const candidate of fusedById.values()) {
      for (const attribution of candidate.strategies) {
        if (!Number.isFinite(attribution.rawScore)) continue;
        const { min, max } = ranges.get(attribution.strategyName);
        const spread = max - min;
        // No spread means no evidence that these hits differ in strength —
        // mapping them all to 0 would misreport a valid result set as worthless.
        attribution.normalizedScore = spread === 0 ? 1 : (attribution.rawScore - min) / spread;
      }
    }
  }
}

module.exports = { RRFFusionPolicy };
