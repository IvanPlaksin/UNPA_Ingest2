'use strict';
const {
  ALL_EDGE_TYPES, createEnvelope, buildNode, buildEdge, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');
const _E = ALL_EDGE_TYPES.join('|');

/**
 * PROFILE primitive — structured dossier on a single entity.
 *
 * Collects everything the KB knows about one entity:
 *   - Core attributes (name, type, namespace, description, epistemicLayer)
 *   - All relationships, categorized into 5 semantic groups
 *   - Provenance (source documents, mention count)
 *   - Summary stats
 *
 * Input params:
 *   entityId              {string}  required
 *   maxRelationshipsPerType {number} default 15 — max edges per category
 *
 * Output (artifact.content):
 *   entity, relationships{}, provenance{}, summary{}
 */

const PRIMITIVE_TYPE = 'PROFILE';

const inputSchema = {
  entityId:               { type: 'string', required: true },
  maxRelationshipsPerType: { type: 'number', default: 15 },
};

// Relationship type → semantic category mapping
const REL_CATEGORY = {
  GOVERNS:          'governance',
  MANDATES:         'governance',
  OVERSEES:         'governance',
  REPORTS_TO:       'governance',
  SUPERVISES:       'governance',
  ESTABLISHES:      'governance',
  ESTABLISHED_BY:   'governance',
  DEFINES:          'governance',
  CHAIRED_BY:       'governance',
  DEPENDS_ON:       'dependencies',
  REQUIRES:         'dependencies',
  IMPLEMENTS:       'dependencies',
  USES:             'dependencies',
  FUNDS:            'dependencies',
  FUNDED_BY:        'dependencies',
  SUPPORTS:         'dependencies',
  RELATED_TO:       'associations',
  MENTIONS:         'associations',
  REFERENCES:       'associations',
  COOPERATES_WITH:  'associations',
  AUTHORED_BY:      'authorship',
  CREATED_BY:       'authorship',
  PART_OF:          'hierarchy',
  CONTAINS:         'hierarchy',
  BELONGS_TO:       'hierarchy',
};

const CATEGORIES = ['governance', 'dependencies', 'associations', 'authorship', 'hierarchy', 'other'];

function categorize(relType) {
  return REL_CATEGORY[relType] || 'other';
}

const mg = () => require('../../memgraph.service');

async function execute(params, _context, services) {
  const { entityStoreService } = services;
  const { entityId, maxRelationshipsPerType = 15 } = params;

  if (!entityId) throw new Error('PROFILE requires entityId');

  // ── 1. Fetch entity ─────────────────────────────────────────────────────────
  const entity = await entityStoreService.getEntity(entityId);
  if (!entity) throw new Error(`Entity not found: ${entityId}`);

  // ── 2. Fetch outgoing relationships ─────────────────────────────────────────
  const outRows = await mg().runQuery(
    `MATCH (e:ESEntity {id: $entityId})-[r:${_E}]->(t:ESEntity)
     RETURN t.id AS targetId, t.name AS targetName, t.type AS targetType, t.namespace AS targetNamespace,
            type(r) AS relType, r.context AS context, r.confidence AS confidence, r.documentId AS documentId
     ORDER BY r.confidence DESC`,
    { entityId }
  );

  // ── 3. Fetch incoming relationships ─────────────────────────────────────────
  const inRows = await mg().runQuery(
    `MATCH (s:ESEntity)-[r:${_E}]->(e:ESEntity {id: $entityId})
     RETURN s.id AS sourceId, s.name AS sourceName, s.type AS sourceType, s.namespace AS sourceNamespace,
            type(r) AS relType, r.context AS context, r.confidence AS confidence, r.documentId AS documentId
     ORDER BY r.confidence DESC`,
    { entityId }
  );

  // ── 4. Categorize relationships ──────────────────────────────────────────────
  const relationshipBuckets = {};
  for (const cat of CATEGORIES) relationshipBuckets[cat] = [];

  const seen = new Set(); // deduplicate by targetId+relType
  for (const r of outRows) {
    const key = `out:${r.targetId}:${r.relType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cat = categorize(r.relType);
    if (relationshipBuckets[cat].length < maxRelationshipsPerType) {
      relationshipBuckets[cat].push({
        peerId:        r.targetId,
        peerName:      r.targetName,
        peerType:      r.targetType || null,
        peerNamespace: r.targetNamespace || null,
        relType:       r.relType || 'RELATED_TO',
        direction:     'outgoing',
        context:       r.context || null,
        confidence:    _coerceNum(r.confidence),
        documentId:    r.documentId || null,
      });
    }
  }
  for (const r of inRows) {
    const key = `in:${r.sourceId}:${r.relType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cat = categorize(r.relType);
    if (relationshipBuckets[cat].length < maxRelationshipsPerType) {
      relationshipBuckets[cat].push({
        peerId:        r.sourceId,
        peerName:      r.sourceName,
        peerType:      r.sourceType || null,
        peerNamespace: r.sourceNamespace || null,
        relType:       r.relType || 'RELATED_TO',
        direction:     'incoming',
        context:       r.context || null,
        confidence:    _coerceNum(r.confidence),
        documentId:    r.documentId || null,
      });
    }
  }

  // Remove empty categories
  const relationships = {};
  for (const cat of CATEGORIES) {
    if (relationshipBuckets[cat].length > 0) {
      relationships[cat] = relationshipBuckets[cat];
    }
  }

  // ── 5. Provenance ─────────────────────────────────────────────────────────
  const sources = (entity.sources || [])
    .filter(s => s && s.docId)
    .map(s => ({
      documentId:    s.docId,
      documentTitle: s.docTitle || s.docId,
      mentionId:     s.mentionId || null,
    }))
    .slice(0, 20);

  const totalRelationships = outRows.length + inRows.length;

  const provenance = {
    sources,
    totalSources:      sources.length,
    totalMentions:     _coerceNum(entity.mentionCount) || sources.length,
    totalRelationships,
  };

  // ── 6. Summary ───────────────────────────────────────────────────────────────
  const allRelCount = Object.values(relationships).flat().length;
  const summary = {
    relationshipCount: allRelCount,
    incomingCount:     inRows.length,
    outgoingCount:     outRows.length,
    categoryBreakdown: Object.fromEntries(
      Object.entries(relationships).map(([k, v]) => [k, v.length])
    ),
    isWellConnected: totalRelationships > 5,
    hasGovernance:   !!(relationships.governance?.length),
    hasHierarchy:    !!(relationships.hierarchy?.length),
  };

  // ── 7. Build CGE envelope ─────────────────────────────────────────────────────
  const envelope = createEnvelope({
    roots:      [entityId],
    kind:       PROJECTION_KIND.DOSSIER,
    hints: {
      groups:        Object.keys(relationships),
      relationships,          // categorized map for ProfileRenderer
      normativeContext: null, // reserved for future normative context analysis
    },
    producedBy: 'TOOL',
    toolId:     'investigation.profile',
  });

  // Root entity node
  envelope.nodes.push(buildNode({
    id:             entity.id,
    type:           entity.type,
    name:           entity.name,
    namespace:      entity.namespace,
    description:    entity.description,
    epistemicLayer: entity.epistemicLayer,
    isInForce:      entity.isInForce,
    provenanceDocId: provenance.sources?.[0]?.documentId || null,
  }));

  // Peer nodes (unique) + directed edges
  const seenNodeIds = new Set([entity.id]);
  for (const r of outRows) {
    if (!seenNodeIds.has(r.targetId)) {
      seenNodeIds.add(r.targetId);
      envelope.nodes.push(buildNode({ id: r.targetId, type: r.targetType, name: r.targetName, namespace: r.targetNamespace }));
    }
    envelope.edges.push(buildEdge({ sourceId: entity.id, targetId: r.targetId, relType: r.relType, direction: 'forward', confidence: r.confidence, context: r.context, documentId: r.documentId }));
  }
  for (const r of inRows) {
    if (!seenNodeIds.has(r.sourceId)) {
      seenNodeIds.add(r.sourceId);
      envelope.nodes.push(buildNode({ id: r.sourceId, type: r.sourceType, name: r.sourceName, namespace: r.sourceNamespace }));
    }
    envelope.edges.push(buildEdge({ sourceId: r.sourceId, targetId: entity.id, relType: r.relType, direction: 'backward', confidence: r.confidence, context: r.context, documentId: r.documentId }));
  }

  // Primitive-specific summary (includes raw entity for backward-compat rendering)
  envelope.summary = {
    headline:   `Profile: ${entity.name}`,
    entity: {
      id:             entity.id,
      name:           entity.name,
      type:           entity.type || null,
      namespace:      entity.namespace || null,
      description:    entity.description || null,
      epistemicLayer: entity.epistemicLayer || null,
      category:       entity.category || null,
      provenanceDocTitle: entity.provenanceDocTitle || null,
      createdAt:      entity.createdAt || null,
      updatedAt:      entity.updatedAt || null,
    },
    statistics: summary,
    provenance,
  };

  return {
    content:     envelope,
    evidencedBy: [entityId],
  };
}

function _coerceNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'low' in v) return v.low;
  return null;
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
