/**
 * Radix strategy registry.
 *
 * @module services/radix/strategies
 */

'use strict';

const { BaseStrategy, MockStrategy } = require('./base-strategy');
const { VectorSeedStrategy } = require('./vector-seed.strategy');
const { KHopExpansionStrategy } = require('./k-hop-expansion.strategy');
const { SourceChunkSeedStrategy } = require('./source-chunk-seed.strategy');

/**
 * Builds the production strategy registry.
 *
 * The orchestrator, fusion and assembly are all strategy-agnostic by design —
 * registering a strategy here is the only change needed to put it in the pipeline.
 *
 * @param {Object} [dependencies] - Shared services (qdrantService, memgraphService, logger, ...)
 * @returns {Map<string, BaseStrategy>}
 */
function createDefaultStrategies(dependencies = {}) {
  return new Map([
    ['vector-seed', new VectorSeedStrategy(dependencies)],
    ['source-chunk-seed', new SourceChunkSeedStrategy(dependencies)],
    ['k-hop-expansion', new KHopExpansionStrategy(dependencies)]
    // TODO R3.1: ['ppr-approximation', new PPRApproximationStrategy(dependencies)]
    // TODO R3.2: ['community', new CommunityStrategy(dependencies)]
  ]);
}

module.exports = {
  BaseStrategy,
  MockStrategy,
  VectorSeedStrategy,
  SourceChunkSeedStrategy,
  KHopExpansionStrategy,
  createDefaultStrategies
};
