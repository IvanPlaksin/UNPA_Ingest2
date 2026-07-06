'use strict';
/**
 * Document indexing subsystem.
 *   - service : the always-on harvester (DocumentIndexService)
 *   - search  : local cross-source keyword/facet/semantic search
 *   - sync    : Qdrant semantic collection management
 */

const service = require('./document-index.service');
const search  = require('./document-index.search');
const sync    = require('./document-index.sync');

module.exports = {
  ...service,          // DocumentIndexService, getDocumentIndexService
  search,
  sync,
};
