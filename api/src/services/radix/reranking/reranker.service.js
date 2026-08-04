/**
 * LLM-based reranking of the fused candidate pool.
 *
 * RRF ranks by POSITION across strategies. It knows a candidate was found twice,
 * but nothing about what it says — so within a single strategy's list the order
 * is only ever "what the vector index thought". Measured on real data, the pool
 * reaching assembly is ~31 candidates for ~14 shown: roughly half are discarded
 * on rank alone, never on meaning. This reorders that half.
 *
 * Two deliberate limits:
 *
 * - CORROBORATED CANDIDATES ARE NOT RERANKED. A candidate found by both the
 *   vector and the graph already has two independent signals agreeing. Letting a
 *   single model opinion reorder that is trading evidence for a guess.
 * - EVERY CANDIDATE IS TRUNCATED to the same length before judging, so a long
 *   source chunk cannot outrank a short draft on surface area alone.
 *
 * Failure is never fatal: if the model is unavailable, malformed, or slow, the
 * RRF order stands. Retrieval degrades to exactly what it was before reranking.
 *
 * @module services/radix/reranking/reranker.service
 */

'use strict';

const { RERANK_SCHEMA, buildRerankPrompt, CONTENT_LIMIT } = require('./rerank-prompt');
const logger = require('../../../utils/logger');

/**
 * Radix picks its LLM explicitly rather than through the global defaults:
 * `LLM_PROVIDER` in this deployment is set to a value the provider registry does
 * not recognise, so relying on the default would throw on every retrieval.
 */
const RERANK_PROVIDER = process.env.RADIX_RERANK_PROVIDER || 'anthropic-api';
const RERANK_MODEL = process.env.RADIX_RERANK_MODEL
  || process.env.FLOWDESK_LLM_MODEL
  || 'claude-haiku-4-5-20251001';

class RerankerService {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [dependencies.llmProvider] - Must expose structuredOutput()
   * @param {Object} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    this.llmProvider = dependencies.llmProvider || null;
    this.logger = dependencies.logger || logger.child('Radix');
  }

  /** @returns {Object|null} */
  _provider() {
    if (this.llmProvider) return this.llmProvider;
    try {
      const { getLLMProvider } = require('../../ai/llm-provider');
      this.llmProvider = getLLMProvider({ provider: RERANK_PROVIDER, model: RERANK_MODEL });
      return this.llmProvider;
    } catch (error) {
      this.logger.warn('[Radix:rerank] provider unavailable', { message: error.message });
      return null;
    }
  }

  /**
   * Reorders the pool.
   *
   * @param {string} query
   * @param {Object[]} candidates - Fused candidates, in RRF order
   * @param {import('../contracts/context-bundle').RetrievalConfig} config
   * @returns {Promise<{candidates: Object[], reranked: boolean, rerankedCount: number,
   *   ms: number, reason?: string}>}
   */
  async rerank(query, candidates, config = {}) {
    const started = Date.now();
    const pool = Array.isArray(candidates) ? candidates : [];

    if (config.rerankEnabled === false) {
      return { candidates: pool, reranked: false, rerankedCount: 0, ms: 0, reason: 'disabled' };
    }

    const maxElements = config.maxElements || 15;
    const corroborated = pool.filter((c) => (c.strategies || []).length > 1);
    const single = pool.filter((c) => (c.strategies || []).length <= 1);

    // Corroborated candidates alone already fill the answer — reranking the rest
    // could not change what is shown, so the LLM call would be pure cost.
    if (corroborated.length >= maxElements) {
      return {
        candidates: pool,
        reranked: false,
        rerankedCount: 0,
        ms: Date.now() - started,
        reason: 'corroborated fill the result'
      };
    }

    // Nothing to reorder.
    if (single.length < 2) {
      return {
        candidates: pool,
        reranked: false,
        rerankedCount: 0,
        ms: Date.now() - started,
        reason: 'too few single-strategy candidates'
      };
    }

    const limit = config.rerankMaxCandidates || 30;
    const toRank = single.slice(0, limit);
    const untouched = single.slice(limit);

    const provider = this._provider();
    if (!provider || typeof provider.structuredOutput !== 'function') {
      return {
        candidates: pool,
        reranked: false,
        rerankedCount: 0,
        ms: Date.now() - started,
        reason: 'no llm provider'
      };
    }

    try {
      const prompt = buildRerankPrompt(query, toRank, config.rerankContentLimit || CONTENT_LIMIT);
      const result = await provider.structuredOutput(prompt, RERANK_SCHEMA, {
        maxTokens: 1024,
        temperature: 0
      });

      // Providers differ: anthropic-api wraps the tool input as `{data, raw, ...}`,
      // others may return the object itself. Accept both rather than silently
      // falling back to RRF because of an envelope.
      const payload = (result && result.data) || result;
      const ordered = this._applyRanking(toRank, payload && payload.ranking);
      if (!ordered) {
        return {
          candidates: pool,
          reranked: false,
          rerankedCount: 0,
          ms: Date.now() - started,
          reason: 'malformed ranking'
        };
      }

      return {
        candidates: [...corroborated, ...ordered, ...untouched],
        reranked: true,
        rerankedCount: ordered.length,
        ms: Date.now() - started
      };
    } catch (error) {
      this.logger.warn('[Radix:rerank] failed, keeping RRF order', { message: error.message });
      return {
        candidates: pool,
        reranked: false,
        rerankedCount: 0,
        ms: Date.now() - started,
        reason: error.message
      };
    }
  }

  /**
   * Applies a returned index order to the candidates.
   *
   * A model can repeat, omit, or invent an index. Rather than trusting the list,
   * valid indices are taken in order and anything the model failed to mention is
   * appended in its original position — so a partial answer degrades to a
   * partial reorder instead of silently dropping candidates.
   *
   * @param {Object[]} candidates
   * @param {number[]} ranking
   * @returns {Object[]|null} null when the ranking is unusable
   * @private
   */
  _applyRanking(candidates, ranking) {
    if (!Array.isArray(ranking) || ranking.length === 0) return null;

    const seen = new Set();
    const ordered = [];

    for (const index of ranking) {
      if (!Number.isInteger(index)) continue;
      if (index < 0 || index >= candidates.length) continue;
      if (seen.has(index)) continue;
      seen.add(index);
      ordered.push(candidates[index]);
    }

    if (ordered.length === 0) return null;

    candidates.forEach((candidate, index) => {
      if (!seen.has(index)) ordered.push(candidate);
    });

    return ordered;
  }
}

module.exports = {
  RerankerService,
  RERANK_PROVIDER,
  RERANK_MODEL
};
