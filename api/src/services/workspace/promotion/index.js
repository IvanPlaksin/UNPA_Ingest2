/**
 * Promotion Module
 *
 * Services for promoting WorkSpace drafts to Global Knowledge Base.
 * Full pipeline: Diff → Resolve → SAGA Execute
 */

'use strict';

const diffComputer = require('./diff-computer.service');
const similarityScorer = require('./similarity-scorer.service');
const conflictDetector = require('./conflict-detector.service');
const resolution = require('./resolution.service');
const promotionSaga = require('./promotion-saga.service');

module.exports = {
  ...diffComputer,
  ...similarityScorer,
  ...conflictDetector,
  ...resolution,
  ...promotionSaga
};
