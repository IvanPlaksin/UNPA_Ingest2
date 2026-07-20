'use strict';
const {
  createEnvelope, buildNode, buildEdge, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');

/**
 * EXPAND primitive — explore neighborhood of an entity (search-around).
 *
 * Input params:
 *   entityId  {string} required
 *   depth     {number} 1-5, default 2
 *
 * Output: CGE envelope (projection.kind = 'graph')
 *   nodes: CGE nodes (entity neighborhood)
 *   edges: CGE edges (all relationships in neighborhood)
 *   roots: [entityId]
 *   summary: { entityId, depth, nodeCount, edgeCount }
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
  const entities     = subgraph.entities     || [];
  const relationships = subgraph.relationships || [];

  const envelope = createEnvelope({
    roots:      [entityId],
    kind:       PROJECTION_KIND.GRAPH,
    hints:      { depth },
    producedBy: 'TOOL',
    toolId:     'investigation.expand',
  });

  for (const entity of entities)      envelope.nodes.push(buildNode(entity));
  for (const rel    of relationships) envelope.edges.push(buildEdge(rel));

  envelope.summary = {
    headline:  `Neighborhood: depth ${depth}`,
    entityId,
    depth,
    nodeCount: entities.length,
    edgeCount: relationships.length,
  };

  const evidencedBy = entities.map(e => e.id || e.entityId).filter(Boolean);
  return { content: envelope, evidencedBy };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
