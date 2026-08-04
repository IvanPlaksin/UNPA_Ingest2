/**
 * Radix Retrieval — Fusion Policy Contract
 *
 * A FusionPolicy takes N ranked candidate lists (one per strategy) and produces
 * ONE ranked list, deduplicated by id, with strategy attributions merged.
 *
 * Responsibility boundary:
 * - IN scope:  ranking across strategies, dedup, attribution merge, truncation
 * - OUT of scope: normalizing the fused score into [0..1] for ContextElement —
 *   the orchestrator does that after fusion, because only it sees the full set.
 *
 * @module services/radix/fusion/fusion-policy.interface
 */

'use strict';

/**
 * A candidate after fusion. Same shape as StrategyCandidate, except:
 * - `score` is the FUSED score (e.g. the RRF sum), not the strategy-local score
 * - `strategies` carries one attribution per contributing strategy
 *
 * @typedef {Object} FusedCandidate
 * @property {string} id
 * @property {import('../contracts/context-bundle').ContextElementType} type
 * @property {string} content
 * @property {*} contentRaw
 * @property {number} score - Fused score (NOT normalized to [0..1] yet)
 * @property {import('../contracts/context-bundle').StrategyAttribution[]} strategies
 * @property {import('../contracts/context-bundle').ElementProvenance} provenance
 * @property {Object} metadata
 */

/**
 * @typedef {Object} FusionPolicyContract
 * @property {string} name - Policy name, for logging/debugging
 * @property {(results: import('../contracts/strategy.interface').StrategyResult[],
 *            config: import('../contracts/context-bundle').RetrievalConfig)
 *            => FusedCandidate[]} fuse
 */

/**
 * Fusion methods the config accepts.
 * Only 'rrf' is implemented — see `createFusionPolicy`.
 * @type {string[]}
 */
const FUSION_METHODS = Object.freeze(['rrf', 'linear', 'max']);

/**
 * Abstract base for fusion policies. Mirrors the BaseStrategy pattern: the
 * contract is enforced at construction/call time, not by convention.
 */
class FusionPolicy {
  /**
   * Policy name. MUST be overridden.
   * @returns {string}
   */
  get name() {
    throw new Error('Subclass must implement name getter');
  }

  /**
   * @param {import('../contracts/strategy.interface').StrategyResult[]} results
   * @param {import('../contracts/context-bundle').RetrievalConfig} config
   * @returns {FusedCandidate[]}
   */
  fuse(results, config) { // eslint-disable-line no-unused-vars
    throw new Error('Subclass must implement fuse method');
  }

  /**
   * Drops results that must not contribute candidates: failed strategies
   * (including timeouts) and malformed payloads.
   *
   * A failed strategy contributing nothing is deliberate — its candidate list is
   * empty or partial, and letting a partial list into a rank-based fusion would
   * distort the ranks of everything else.
   *
   * @param {import('../contracts/strategy.interface').StrategyResult[]} results
   * @returns {import('../contracts/strategy.interface').StrategyResult[]}
   * @protected
   */
  _usableResults(results) {
    if (!Array.isArray(results)) return [];
    return results.filter(
      (r) => r && r.success === true && Array.isArray(r.candidates) && r.candidates.length > 0
    );
  }
}

module.exports = {
  FUSION_METHODS,
  FusionPolicy
};
