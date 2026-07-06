'use strict';

/**
 * LOCATE primitive — find KB entities matching criteria.
 *
 * Input params:
 *   query         {string}  semantic / name search
 *   namespace     {string}  optional namespace filter
 *   type          {string}  optional entity type filter
 *   limit         {number}  default 20
 *
 * Output (artifact content):
 *   query, results:[{entityId, name, type, namespace, description, score?}], total
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
  const evidencedBy = sliced.map(e => e.id || e.entityId).filter(Boolean);

  return {
    content: {
      query,
      results: sliced.map(e => ({
        entityId: e.id || e.entityId,
        name: e.name,
        type: e.type,
        namespace: e.namespace,
        description: e.description || '',
        epistemicLayer: e.epistemicLayer || '',
        mentionCount: e.mentionCount || 0,
        isInForce: e.isInForce !== false,
      })),
      total: results.length,
    },
    evidencedBy,
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
