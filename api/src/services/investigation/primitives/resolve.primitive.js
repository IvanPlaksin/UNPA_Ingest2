'use strict';

/**
 * RESOLVE primitive — entity resolution: find candidate duplicates or near-matches.
 *
 * Given an anchor entity, finds other ESEntity nodes with similar names or
 * overlapping relationships, ranked by similarity.
 *
 * Input params:
 *   entityId   {string} required — anchor entity
 *   threshold  {number} 0-1, default 0.6 — minimum similarity to include as candidate
 *   namespace  {string} optional — restrict search to namespace
 *   limit      {number} default 20 — max candidates
 *
 * Output (artifact content):
 *   anchor:          { entityId, name, type, namespace }
 *   candidates:      [{entityId, name, type, namespace, similarity, matchReasons[]}]
 *   suggestedMerges: [{keepId, keepName, mergeId, mergeName, confidence}]
 *   summary:         { candidateCount, highConfidenceMerges }
 */

const PRIMITIVE_TYPE = 'RESOLVE';

const inputSchema = {
  entityId:  { type: 'string', required: true },
  threshold: { type: 'number', default: 0.6 },
  namespace: { type: 'string' },
  limit:     { type: 'number', default: 20 },
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

// Token-based Jaccard similarity between two strings
function _jaccardSimilarity(a, b) {
  const tokA = new Set(_tokenize(a));
  const tokB = new Set(_tokenize(b));
  const intersection = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

function _tokenize(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

// Prefix similarity (starts with same first N chars)
function _prefixSimilarity(a, b) {
  const la = (a || '').toLowerCase();
  const lb = (b || '').toLowerCase();
  const shorter = Math.min(la.length, lb.length);
  if (shorter === 0) return 0;
  let common = 0;
  for (let i = 0; i < shorter; i++) {
    if (la[i] === lb[i]) common++;
    else break;
  }
  return common / Math.max(la.length, lb.length);
}

async function execute(params, _context, _services) {
  const { entityId, threshold = 0.6, namespace = null, limit = 20 } = params;
  if (!entityId) throw new Error('RESOLVE requires entityId');

  // Fetch anchor entity
  const anchorRows = await mg().runQuery(
    `MATCH (e:ESEntity {id: $id})
     RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns`,
    { id: entityId }
  );
  if (!anchorRows.length) throw new Error(`Entity not found: ${entityId}`);
  const anchor = anchorRows[0];
  const anchorTokens = _tokenize(anchor.name || '');

  // Candidates: same type, optional same namespace, name contains at least one token in common
  const nsClause = namespace ? `AND e.namespace = $ns` : '';
  const cands = await mg().runQuery(
    `MATCH (e:ESEntity)
     WHERE e.id <> $id AND e.type = $type ${nsClause}
     RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns`,
    { id: entityId, type: anchor.type, ...(namespace ? { ns: namespace } : {}) }
  );

  // Also try candidates in same namespace regardless of type (acronym/alias detection)
  const nsOnly = namespace ? await mg().runQuery(
    `MATCH (e:ESEntity {namespace: $ns})
     WHERE e.id <> $id AND e.type <> $type
     RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns`,
    { ns: namespace || anchor.ns, id: entityId, type: anchor.type }
  ) : [];

  const allCandidates = [...cands, ...nsOnly];

  // Fetch anchor's direct neighbors for relationship-overlap scoring
  const anchorNeighbors = await mg().runQuery(
    `MATCH (a:ESEntity {id: $id})-[:ES_RELATED_TO]-(n:ESEntity)
     RETURN DISTINCT n.id AS nid`,
    { id: entityId }
  );
  const anchorNeighborSet = new Set(anchorNeighbors.map(r => r.nid));

  const scored = [];

  for (const cand of allCandidates) {
    const matchReasons = [];
    let similarity = 0;

    // Name-based similarity
    const jaccard = _jaccardSimilarity(anchor.name, cand.name);
    const prefix  = _prefixSimilarity(anchor.name, cand.name);
    const nameSim = Math.max(jaccard, prefix);

    if (nameSim >= threshold) matchReasons.push(`name similarity ${(nameSim * 100).toFixed(0)}%`);

    // Exact name match (case-insensitive) → very high confidence
    if ((anchor.name || '').toLowerCase() === (cand.name || '').toLowerCase()) {
      matchReasons.push('exact name match (case-insensitive)');
      similarity = Math.max(similarity, 0.99);
    }

    // Token overlap
    const candTokens = _tokenize(cand.name);
    const sharedTokens = anchorTokens.filter(t => candTokens.includes(t));
    if (sharedTokens.length >= 2) {
      matchReasons.push(`shares tokens: ${sharedTokens.join(', ')}`);
      similarity = Math.max(similarity, 0.7 + 0.05 * sharedTokens.length);
    }

    similarity = Math.max(similarity, nameSim);

    // Relationship neighborhood overlap
    if (anchorNeighborSet.size > 0) {
      const candNeighbors = await mg().runQuery(
        `MATCH (c:ESEntity {id: $cid})-[:ES_RELATED_TO]-(n:ESEntity)
         RETURN DISTINCT n.id AS nid`,
        { cid: cand.id }
      );
      const candNeighborSet = new Set(candNeighbors.map(r => r.nid));
      const sharedNeighbors = [...anchorNeighborSet].filter(id => candNeighborSet.has(id));
      if (sharedNeighbors.length > 0) {
        const neighSim = sharedNeighbors.length / Math.max(anchorNeighborSet.size, candNeighborSet.size);
        if (neighSim > 0.3) {
          matchReasons.push(`${sharedNeighbors.length} shared neighbors`);
          similarity = Math.max(similarity, similarity + 0.1 * neighSim);
        }
      }
    }

    if (similarity >= threshold && matchReasons.length > 0) {
      scored.push({
        entityId:     cand.id,
        name:         cand.name,
        type:         cand.type,
        namespace:    cand.ns,
        similarity:   parseFloat(Math.min(similarity, 1).toFixed(3)),
        matchReasons,
      });
    }
  }

  // Sort by similarity desc, cap to limit
  scored.sort((a, b) => b.similarity - a.similarity);
  const candidates = scored.slice(0, limit);

  // Suggest merges for high-confidence pairs
  const suggestedMerges = candidates
    .filter(c => c.similarity >= 0.85)
    .map(c => ({
      keepId:    anchor.id,
      keepName:  anchor.name,
      mergeId:   c.entityId,
      mergeName: c.name,
      confidence: c.similarity,
    }));

  return {
    content: {
      anchor: { entityId: anchor.id, name: anchor.name, type: anchor.type, namespace: anchor.ns },
      candidates,
      suggestedMerges,
      summary: {
        candidateCount:      candidates.length,
        highConfidenceMerges: suggestedMerges.length,
      },
    },
    evidencedBy: [entityId, ...candidates.map(c => c.entityId)],
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
