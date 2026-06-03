/**
 * Extraction Module — Entry point
 */

'use strict';

const schemas = require('./schemas');
const prompts = require('./prompts');
const entityExtractor = require('./entity.extractor');
const relationExtractor = require('./relation.extractor');
const extractionQueue = require('./extraction-queue');

module.exports = {
  ...schemas,
  ...prompts,
  ...entityExtractor,
  ...relationExtractor,
  ...extractionQueue
};
