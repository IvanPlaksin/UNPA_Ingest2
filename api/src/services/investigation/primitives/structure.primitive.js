'use strict';
const {
  ALL_EDGE_TYPES, createEnvelope, buildNode, buildEdge, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');
const _E = ALL_EDGE_TYPES.join('|');

/**
 * STRUCTURE primitive — structural / centrality analysis of an entity neighborhood.
 *
 * Input params:
 *   entityIds  {string[]}  optional — focus set; if empty, analyzes the full ESEntity graph
 *   depth      {number}    optional — expand neighborhood to this depth (default 2)
 *   namespace  {string}    optional — restrict to a namespace
 *
 * Output (artifact content):
 *   nodes:   [{entityId, name, type, degree, inDegree, outDegree}]
 *   edges:   [{sourceId, targetId, relType}]
 *   metrics: [{entityId, name, degree, betweennessProxy, isBridge}]
 *   bridges: [{sourceId, targetId, relType}]   — edges whose removal would disconnect components
 *   summary: { nodeCount, edgeCount, bridgeCount, mostCentral: {entityId, name, degree} }
 */

const PRIMITIVE_TYPE = 'STRUCTURE';

const inputSchema = {
  entityIds: { type: 'array' },
  depth:     { type: 'number', default: 2 },
  namespace: { type: 'string' },
};

let _mg;
function mg() {
  if (!_mg) _mg = require('../../memgraph.service');
  return _mg;
}

function _num(v) {
  if (v === null || v === undefined) return 0;
  return typeof v === 'object' ? (v.low ?? 0) : (v || 0);
}

async function execute(params, _context, _services) {
  const { entityIds = [], depth = 2, namespace = null } = params;

  let nodeIds;
  let subgraphEdges;

  if (entityIds.length > 0) {
    // Expand the seed entity neighborhood
    const expanded = await mg().runQuery(
      `MATCH (seed:ESEntity) WHERE seed.id IN $ids
       OPTIONAL MATCH p = (seed)-[:${_E}*1..${Math.min(depth, 3)}]-(neighbor:ESEntity)
       WITH collect(DISTINCT seed) + collect(DISTINCT neighbor) AS allNodes
       UNWIND allNodes AS n
       RETURN DISTINCT n.id AS id, n.name AS name, n.type AS type, n.namespace AS ns`,
      { ids: entityIds }
    );
    nodeIds = expanded.map(r => r.id).filter(Boolean);
  } else if (namespace) {
    const ns = await mg().runQuery(
      `MATCH (e:ESEntity {namespace: $ns})
       RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns`,
      { ns: namespace }
    );
    nodeIds = ns.map(r => r.id).filter(Boolean);
  } else {
    // Whole graph, cap at 100 nodes to stay responsive
    const all = await mg().runQuery(
      `MATCH (e:ESEntity)
       RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns
       LIMIT 100`
    );
    nodeIds = all.map(r => r.id).filter(Boolean);
  }

  if (!nodeIds.length) {
    return {
      content: {
        nodes: [], edges: [], metrics: [], bridges: [],
        summary: { nodeCount: 0, edgeCount: 0, bridgeCount: 0, mostCentral: null },
      },
      evidencedBy: [],
    };
  }

  // Fetch entity metadata
  const entityRows = await mg().runQuery(
    `MATCH (e:ESEntity) WHERE e.id IN $ids
     RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns`,
    { ids: nodeIds }
  );
  const entityMap = Object.fromEntries(entityRows.map(r => [r.id, { entityId: r.id, name: r.name || r.id, type: r.type }]));

  // Fetch all edges within the subgraph
  const edgeRows = await mg().runQuery(
    `MATCH (a:ESEntity)-[r:${_E}]->(b:ESEntity)
     WHERE a.id IN $ids AND b.id IN $ids
     RETURN a.id AS sourceId, b.id AS targetId, type(r) AS relType`,
    { ids: nodeIds }
  );
  subgraphEdges = edgeRows.map(r => ({ sourceId: r.sourceId, targetId: r.targetId, relType: r.relType || 'RELATED_TO' }));

  // Compute degree centrality for each node
  const inDegree  = {};
  const outDegree = {};
  for (const id of nodeIds) { inDegree[id] = 0; outDegree[id] = 0; }
  for (const e of subgraphEdges) {
    outDegree[e.sourceId] = (outDegree[e.sourceId] || 0) + 1;
    inDegree[e.targetId]  = (inDegree[e.targetId]  || 0) + 1;
  }

  // Betweenness proxy: nodes that appear as both source and target of different edges
  // (a lightweight structural heuristic — not full Brandes algorithm)
  const bridgingScore = {};
  const sourceSet = new Set(subgraphEdges.map(e => e.sourceId));
  const targetSet = new Set(subgraphEdges.map(e => e.targetId));
  for (const id of nodeIds) {
    bridgingScore[id] = (sourceSet.has(id) ? 1 : 0) + (targetSet.has(id) ? 1 : 0);
  }

  const nodes = nodeIds.map(id => {
    const meta = entityMap[id] || { entityId: id, name: id, type: 'UNKNOWN' };
    return {
      ...meta,
      degree:    (outDegree[id] || 0) + (inDegree[id] || 0),
      inDegree:  inDegree[id] || 0,
      outDegree: outDegree[id] || 0,
    };
  });

  // Bridge detection: an edge (u→v) is a bridge if removing it increases the number of
  // weakly-connected components. Approximate by checking degree-1 nodes (leaf bridges).
  const bridges = subgraphEdges.filter(e => {
    const srcDeg = (outDegree[e.sourceId] || 0) + (inDegree[e.sourceId] || 0);
    const tgtDeg = (outDegree[e.targetId] || 0) + (inDegree[e.targetId] || 0);
    return srcDeg === 1 || tgtDeg === 1;
  });

  const metrics = nodes
    .map(n => ({
      entityId:         n.entityId,
      name:             n.name,
      degree:           n.degree,
      betweennessProxy: bridgingScore[n.entityId] || 0,
      isBridge:         bridges.some(b => b.sourceId === n.entityId || b.targetId === n.entityId),
    }))
    .sort((a, b) => b.degree - a.degree);

  const mostCentral = metrics[0] ? { entityId: metrics[0].entityId, name: metrics[0].name, degree: metrics[0].degree } : null;

  const envelope = createEnvelope({
    roots:      entityIds.length > 0 ? entityIds : nodeIds.slice(0, 5),
    kind:       PROJECTION_KIND.GRAPH,
    hints:      { metrics, bridges },
    producedBy: 'TOOL',
    toolId:     'investigation.structure',
  });

  for (const id of nodeIds) {
    const meta = entityMap[id] || { id, name: id, type: 'UNKNOWN' };
    envelope.nodes.push(buildNode({ id, type: meta.type, name: meta.name, namespace: meta.namespace }));
  }
  for (const e of subgraphEdges) {
    envelope.edges.push(buildEdge({ sourceId: e.sourceId, targetId: e.targetId, relType: e.relType }));
  }

  envelope.summary = {
    headline:    `Structure: ${nodeIds.length} nodes, ${bridges.length} bridge${bridges.length !== 1 ? 's' : ''}`,
    nodeCount:   nodes.length,
    edgeCount:   subgraphEdges.length,
    bridgeCount: bridges.length,
    mostCentral,
  };

  return { content: envelope, evidencedBy: nodeIds };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
