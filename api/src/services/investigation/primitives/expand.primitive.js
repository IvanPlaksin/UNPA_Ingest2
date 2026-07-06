'use strict';

/**
 * EXPAND primitive — explore neighborhood of an entity (search-around).
 *
 * Input params:
 *   entityId  {string} required
 *   depth     {number} 1-5, default 2
 *
 * Output (artifact content):
 *   entityId, depth, nodes:[], edges:[], nodeCount, edgeCount
 *   nodes: [ { id, name, type, namespace, ... } ]   ← from subgraph.entities
 *   edges: [ { sourceId, targetId, relType, context, confidence, documentId } ] ← from subgraph.relationships
 */

const PRIMITIVE_TYPE = 'EXPAND';

const inputSchema = {
  entityId: { type: 'string', required: true },
  depth: { type: 'number', default: 2 },
};

async function execute(params, _context, services) {
  const { entityStoreService } = services;
  const { entityId, depth = 2 } = params;

  if (!entityId) throw new Error('EXPAND requires entityId');

  const subgraph = await entityStoreService.getEntitySubgraph(entityId, depth);

  // getEntitySubgraph returns .entities and .relationships (not .nodes/.edges)
  const nodes = subgraph.entities || [];
  const edges = subgraph.relationships || [];

  const evidencedBy = nodes.map(n => n.id || n.entityId).filter(Boolean);

  return {
    content: {
      entityId,
      depth,
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    evidencedBy,
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
