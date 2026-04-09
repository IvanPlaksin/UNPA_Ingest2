/**
 * Extraction Module — Entry point
 */

'use strict';

const schemas = require('./schemas');
const prompts = require('./prompts');
const entityExtractor = require('./entity.extractor');
const relationExtractor = require('./relation.extractor');
const { runExtractionPipeline } = require('./extraction-pipeline');
const extractionQueue = require('./extraction-queue');

module.exports = {
  ...schemas,
  ...prompts,
  ...entityExtractor,
  ...relationExtractor,
  runExtractionPipeline,
  ...extractionQueue
};
