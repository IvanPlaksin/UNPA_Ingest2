'use strict';
const {
  createEnvelope, buildNode, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');

/**
 * LOCATE primitive — find KB entities matching criteria.
 *
 * Input params:
 *   query         {string}  semantic / name search
 *   namespace     {string}  optional namespace filter
 *   type          {string}  optional entity type filter
 *   limit         {number}  default 20
 *
 * Output: CGE envelope (projection.kind = 'list')
 *   nodes: matched entities as CGE nodes
 *   projection.hints.results: legacy result array (for LocateRenderer)
 *   summary: { query, totalFound }
 */

const PRIMITIVE_TYPE = 'LOCATE';

const inputSchema = {
  query: { type: 'string', required: true },
  namespace: { type: 'string' },
  type: { type: 'string' },
  limit: { type: 'number', default: 20 },
};

async function execute(params, _context, services) {
  const { entityStoreService } = services;
  const { query, namespace = null, type = null, limit = 20 } = params;

  if (!query) throw new Error('LOCATE requires a query');

  const results = await entityStoreService.listEntities({
    namespace,
    type,
    search: query,
  });

  // Trim to limit
  const sliced = results.slice(0, limit);
  const legacyResults = sliced.map(e => ({
    entityId:      e.id || e.entityId,
    name:          e.name,
    type:          e.type,
    namespace:     e.namespace,
    description:   e.description   || '',
    epistemicLayer:e.epistemicLayer || '',
    mentionCount:  e.mentionCount   || 0,
    isInForce:     e.isInForce !== false,
  }));

  const envelope = createEnvelope({
    roots:      [],
    kind:       PROJECTION_KIND.LIST,
    hints:      { results: legacyResults, query },
    producedBy: 'TOOL',
    toolId:     'investigation.locate',
  });

  for (const e of sliced) envelope.nodes.push(buildNode(e));

  const byType = {};
  for (const e of legacyResults) byType[e.type || 'UNKNOWN'] = (byType[e.type || 'UNKNOWN'] || 0) + 1;

  envelope.summary = {
    headline:   `${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"`,
    query,
    totalFound: results.length,
    byType,
  };

  const evidencedBy = sliced.map(e => e.id || e.entityId).filter(Boolean);
  return { content: envelope, evidencedBy };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
