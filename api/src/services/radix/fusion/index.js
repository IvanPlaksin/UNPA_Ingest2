/**
 * Radix fusion layer — public entry point.
 *
 * @module services/radix/fusion
 */

'use strict';

const { FUSION_METHODS, FusionPolicy } = require('./fusion-policy.interface');
const { RRFFusionPolicy } = require('./rrf-fusion');
const scoreNormalizer = require('./score-normalizer');

/**
 * Builds the fusion policy for a configured method.
 *
 * Only 'rrf' is implemented. 'linear' and 'max' remain in the config enum but
 * throw: they add raw scores together, and Radix mixes strategies whose scores
 * live on different scales (cosine vs edge-weight product). Silently allowing
 * them would produce a plausible-looking but meaningless ranking.
 *
 * @param {string} [method='rrf']
 * @param {Object} [dependencies]
 * @returns {FusionPolicy}
 */
function createFusionPolicy(method = 'rrf', dependencies = {}) {
  if (method === 'rrf') {
    return new RRFFusionPolicy(dependencies);
  }
  if (FUSION_METHODS.includes(method)) {
    throw new Error(
      `Fusion method '${method}' is not implemented for heterogeneous strategies — use 'rrf'`
    );
  }
  throw new Error(`Unknown fusion method: ${method}`);
}

module.exports = {
  FUSION_METHODS,
  FusionPolicy,
  RRFFusionPolicy,
  createFusionPolicy,
  scoreNormalizer
};
