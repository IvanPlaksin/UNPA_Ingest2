'use strict';

/**
 * CONNECT primitive — two-phase path finding with Bundle enrichment.
 *
 * Phase A: Yen's K-Shortest Paths skeleton (existing infrastructure).
 * Phase B: Single-hop getAllEdgesBetween() for every adjacent node pair in
 *          the skeleton — returns ALL relType edges, not just the one used
 *          by the shortest path algorithm.
 *
 * Input params:
 *   fromEntityId      {string}  required
 *   toEntityId        {string}  required
 *   maxPaths          {number}  default 5  (max 10)
 *   maxHops           {number}  default 6  — filter paths longer than this
 *   minPathStrength   {number}  default 0  — filter weak paths (0–1)
 *   minEdgeConfidence {number}  default 0  — filter low-confidence edges from bundles
 *
 * Output (artifact content) — backward-compatible:
 *   fromEntityId, toEntityId, paths[], entities[], relationships[], structuralAnalysis,
 *   bundles: { [pairKey]: { nodeA, nodeB, relationships[], count, semantic[], frequency[] } },
 *   filters: { maxPaths, maxHops, minPathStrength, minEdgeConfidence }
 */

const { groupEdgesByCategory } = require('./constants');

const PRIMITIVE_TYPE = 'CONNECT';

const inputSchema = {
  fromEntityId:      { type: 'string', required: true },
  toEntityId:        { type: 'string', required: true },
  maxPaths:          { type: 'number', default: 5 },
  maxHops:           { type: 'number', default: 6 },
  minPathStrength:   { type: 'number', default: 0 },
  minEdgeConfidence: { type: 'number', default: 0 },
};

async function execute(params, _context, services) {
  const { entityStoreService } = services;
  const {
    fromEntityId,
    toEntityId,
    maxPaths          = 5,
    maxHops           = 6,
    minPathStrength   = 0,
    minEdgeConfidence = 0,
  } = params;

  if (!fromEntityId || !toEntityId) {
    throw new Error('CONNECT requires fromEntityId and toEntityId');
  }

  // ── Phase A: Skeleton (Yen's KSP) ───────────────────────────────────────────
  const skeleton = await entityStoreService.findKShortestPaths(fromEntityId, toEntityId, Math.min(maxPaths, 10));

  // Apply hop + strength filters
  const filteredPaths = (skeleton.paths || [])
    .filter(p => p.hopCount <= maxHops)
    .filter(p => (p.pathStrength || 0) >= minPathStrength);

  // ── Phase B: Bundle Enrichment ───────────────────────────────────────────────
  // Collect all unique adjacent node pairs from filtered paths
  const segmentPairs = new Set();
  for (const path of filteredPaths) {
    for (let i = 0; i < (path.nodeIds || []).length - 1; i++) {
      segmentPairs.add(`${path.nodeIds[i]}|${path.nodeIds[i + 1]}`);
    }
  }

  const bundles = {};
  for (const pairKey of segmentPairs) {
    const [nodeA, nodeB] = pairKey.split('|');
    let allEdges = [];
    try {
      allEdges = await entityStoreService.getAllEdgesBetween(nodeA, nodeB);
    } catch { /* non-blocking */ }

    const filtered = allEdges.filter(e => (e.confidence == null || e.confidence >= minEdgeConfidence));
    const { semantic, frequency } = groupEdgesByCategory(filtered);
    bundles[pairKey] = { nodeA, nodeB, relationships: filtered, count: filtered.length, semantic, frequency };
  }

  // ── Provenance ──────────────────────────────────────────────────────────────
  const evidencedBy = new Set();
  for (const e of (skeleton.entities || [])) evidencedBy.add(e.id || e.entityId);
  for (const path of filteredPaths) {
    for (const nodeId of (path.nodeIds || [])) evidencedBy.add(nodeId);
  }

  // ── Optional AI interpretation ───────────────────────────────────────────────
  let interpretation = null;
  if (filteredPaths.length > 0) {
    try {
      const pathInterpreter = require('../../knowledge/path-interpreter.service');
      const fromEntity = (skeleton.entities || []).find(e => e.id === fromEntityId || e.entityId === fromEntityId);
      const toEntity   = (skeleton.entities || []).find(e => e.id === toEntityId   || e.entityId === toEntityId);
      if (fromEntity && toEntity) {
        interpretation = await pathInterpreter.interpretPathConnection(
          fromEntity, toEntity, filteredPaths, skeleton.structuralAnalysis,
          skeleton.entities || [], bundles
        );
      }
    } catch { /* bonus, not a blocker */ }
  }

  const {
    createEnvelope, buildNode, buildEdge, PROJECTION_KIND,
  } = require('../../../constants/canonical-graph.constants');

  const envelope = createEnvelope({
    roots:      [fromEntityId, toEntityId],
    kind:       PROJECTION_KIND.PATHS,
    hints: {
      paths:    filteredPaths,
      bundles,
      pathCount: filteredPaths.length,
      filters:  { maxPaths, maxHops, minPathStrength, minEdgeConfidence },
    },
    producedBy: 'TOOL',
    toolId:     'investigation.connect',
  });

  for (const e of (skeleton.entities      || [])) envelope.nodes.push(buildNode(e));
  for (const r of (skeleton.relationships || [])) envelope.edges.push(buildEdge(r));

  envelope.summary = {
    headline:           filteredPaths.length > 0
      ? `${filteredPaths.length} path${filteredPaths.length !== 1 ? 's' : ''} found`
      : 'No paths found',
    fromEntityId,
    toEntityId,
    pathCount:          filteredPaths.length,
    shortestLength:     filteredPaths[0]?.hopCount ?? null,
    structuralAnalysis: skeleton.structuralAnalysis || null,
    interpretation:     interpretation              || null,
  };

  return {
    content:     envelope,
    evidencedBy: Array.from(evidencedBy).filter(Boolean),
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
