/**
 * ContextAssembler — turns a fused candidate pool into the finished ContextBundle.
 *
 * Three jobs:
 *   1. Normalize fused scores into the [0..1] that ContextElement guarantees.
 *      A raw RRF sum is roughly 1/(k+1) per contributing strategy — a number
 *      around 0.016 that means nothing to a caller reading `score`.
 *   2. Greedy-fill the prompt under both limits (maxElements AND tokenBudget).
 *   3. Serialize, keeping contradictions in a trailing block of their own.
 *
 * Two deliberate rules:
 *
 * - Elements are never cut in half. Half a business rule is not context, it is
 *   a misleading fragment. An element that does not fit is skipped whole and
 *   the next (smaller) one is tried, so the budget is used rather than abandoned.
 *
 * - Contradictions go last. The model should read what the sources say before
 *   it reads where they disagree; leading with a conflict distorts the answer
 *   even when the conflict is minor.
 *
 * @module services/radix/assembly/context-assembler
 */

'use strict';

const { createContextElement } = require('../contracts/context-bundle');
const { CONFLICT_EDGE_TYPE } = require('../contracts/strategy.interface');
const { minMaxNormalize } = require('../fusion/score-normalizer');
const { createSerializer } = require('./serializers');
const { estimateTokens } = require('./token-counter');
const logger = require('../../../utils/logger');

class ContextAssembler {
  /**
   * @param {Object} [dependencies]
   * @param {Object} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || logger.child('Radix');
  }

  /**
   * Fills `elements`, `assembledContext`, `stats` and `truncated` on the bundle.
   * Mutates and returns the bundle the orchestrator passed in.
   *
   * @param {import('../contracts/context-bundle').ContextBundle} bundle
   * @param {import('../fusion/fusion-policy.interface').FusedCandidate[]} candidates
   * @returns {import('../contracts/context-bundle').ContextBundle}
   */
  assemble(bundle, candidates) {
    const startTime = Date.now();
    const config = bundle.config;
    const serializer = createSerializer(config.assemblyFormat);

    const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    bundle.stats.afterFusion = pool.length;

    if (pool.length === 0) {
      bundle.elements = [];
      bundle.assembledContext = '';
      bundle.stats.afterTruncation = 0;
      bundle.stats.totalTokens = 0;
      bundle.truncated = false;
      bundle.timing.assemblyMs = Date.now() - startTime;
      return bundle;
    }

    // Normalize across the WHOLE pool, not the surviving slice — otherwise the
    // top element would always score 1.0 regardless of how good it actually was
    // relative to everything found.
    const normalized = minMaxNormalize(pool.map((c) => c.score));
    const scored = pool.map((candidate, i) => ({ candidate, score: normalized[i] }));

    const isConflict = ({ candidate }) =>
      (candidate.metadata || {}).terminalEdgeType === CONFLICT_EDGE_TYPE;

    const mainPool = scored.filter((s) => !isConflict(s));
    const conflictPool = scored.filter(isConflict);

    const budget = config.tokenBudget;
    let used = estimateTokens(serializer.CONTEXT_HEADER);
    // Reserve the conflict header up front, so the budget cannot be spent down
    // to the point where a detected contradiction has no room to be reported.
    const conflictHeaderCost = conflictPool.length > 0
      ? estimateTokens(serializer.CONFLICT_HEADER)
      : 0;

    const accepted = [];
    const mainBlocks = [];
    const conflictBlocks = [];
    let truncated = false;

    for (const { candidate, score } of mainPool) {
      if (accepted.length >= config.maxElements) {
        truncated = true;
        break;
      }
      const text = serializer.serializeElement(candidate, score);
      const cost = estimateTokens(text) + 1; // +1 for the separating blank line

      if (used + cost + conflictHeaderCost > budget) {
        // Skip whole, keep going: a later element may still fit.
        truncated = true;
        continue;
      }

      used += cost;
      accepted.push({ candidate, score });
      mainBlocks.push(text);
    }

    if (conflictPool.length > 0) {
      used += conflictHeaderCost;
      for (const { candidate, score } of conflictPool) {
        if (accepted.length >= config.maxElements) {
          truncated = true;
          break;
        }
        const text = serializer.serializeConflict(candidate, score);
        const cost = estimateTokens(text) + 1;

        if (used + cost > budget) {
          truncated = true;
          continue;
        }

        used += cost;
        accepted.push({ candidate, score });
        conflictBlocks.push(text);
      }
    }

    bundle.elements = accepted.map(({ candidate, score }) =>
      createContextElement({
        id: candidate.id,
        type: candidate.type,
        content: candidate.content,
        contentRaw: candidate.contentRaw,
        score,
        strategies: candidate.strategies || [],
        provenance: candidate.provenance,
        metadata: candidate.metadata || {}
      })
    );

    bundle.assembledContext = this._joinSections(serializer, mainBlocks, conflictBlocks);
    bundle.truncated = truncated;
    bundle.stats.afterTruncation = bundle.elements.length;
    bundle.stats.totalTokens = estimateTokens(bundle.assembledContext);
    bundle.timing.assemblyMs = Date.now() - startTime;

    if (truncated) {
      this.logger.debug('[Radix:assembler] context truncated', {
        pool: pool.length,
        kept: bundle.elements.length,
        tokens: bundle.stats.totalTokens,
        budget
      });
    }

    return bundle;
  }

  /**
   * @param {import('./serializers').Serializer} serializer
   * @param {string[]} mainBlocks
   * @param {string[]} conflictBlocks
   * @returns {string}
   * @private
   */
  _joinSections(serializer, mainBlocks, conflictBlocks) {
    if (mainBlocks.length === 0 && conflictBlocks.length === 0) return '';

    const sections = [];
    if (mainBlocks.length > 0) {
      sections.push(serializer.CONTEXT_HEADER + '\n' + mainBlocks.join('\n\n'));
    }
    if (conflictBlocks.length > 0) {
      sections.push(serializer.CONFLICT_HEADER + '\n' + conflictBlocks.join('\n\n'));
    }
    return sections.join('\n');
  }
}

module.exports = { ContextAssembler };
