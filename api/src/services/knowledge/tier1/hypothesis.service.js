'use strict';

const { v4: uuidv4 } = require('uuid');
const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');
const {
  HYPOTHESIS_TYPES,
  HYPOTHESIS_STATUSES,
  RESOLUTION_METHODS,
} = require('./schemas/hypothesis-schema');

// ─────────────────────────────────────────────────────────────────────────────

async function createHypothesis({ type, statement, context, subject_nodes, subject_edges, namespace, expires_at }) {
  if (!HYPOTHESIS_TYPES[type]) throw new Error(`Unknown hypothesis type: ${type}`);
  if (!statement)              throw new Error('statement is required');
  if (!namespace)              throw new Error('namespace is required');

  const typeDef = HYPOTHESIS_TYPES[type];
  const now     = new Date().toISOString();
  const id      = uuidv4();

  const expiresAt = expires_at
    || (typeDef.default_expires_days
      ? new Date(Date.now() + typeDef.default_expires_days * 86400000).toISOString()
      : null);

  await memgraph.runQuery(
    `CREATE (h:Hypothesis {
       id: $id, namespace: $namespace, type: $type, status: 'OPEN',
       statement: $statement, context: $context,
       confidence: $confidence, prior_confidence: $confidence,
       resolved_at: null, resolved_by: null,
       resolution_reason: null, resolution_action: null,
       created_at: $now, updated_at: $now, expires_at: $expiresAt,
       subject_nodes: $subject_nodes, subject_edges: $subject_edges
     })`,
    {
      id, namespace, type, statement,
      context:       context ? JSON.stringify(context) : null,
      confidence:    typeDef.default_confidence,
      now,
      expiresAt:     expiresAt || null,
      subject_nodes: (subject_nodes || []).map(String),
      subject_edges: (subject_edges || []).map(String),
    }
  );

  return { hypothesisId: id, type, status: 'OPEN', confidence: typeDef.default_confidence };
}

// ─────────────────────────────────────────────────────────────────────────────

// Add evidence (KnowledgeQuantum or any node with an id) to hypothesis.
// Uses Bayesian-inspired update: P(H|E) ∝ P(E|H) × P(H)
async function addEvidence(hypothesisId, {
  quantumId,
  relationship, // 'SUPPORTS' | 'CONTRADICTS'
  diagnostic_value = 0.5,
  admiralty,
  eliminates = false,
}) {
  if (!['SUPPORTS', 'CONTRADICTS'].includes(relationship)) {
    throw new Error(`relationship must be SUPPORTS or CONTRADICTS`);
  }

  const hRows = await memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $id }) RETURN h.confidence AS confidence, h.status AS status`,
    { id: hypothesisId }
  );
  if (!hRows.length) throw new Error(`Hypothesis ${hypothesisId} not found`);
  if (hRows[0].status !== 'OPEN') throw new Error(`Hypothesis is not OPEN (status: ${hRows[0].status})`);

  const now = new Date().toISOString();

  // Create evidence relationship
  await memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $hId })
     MATCH (q) WHERE q.id = $qId
     CREATE (h)-[r:${relationship}]->(q)
     SET r.diagnostic_value = $dv, r.admiralty = $admiralty,
         r.eliminates = $eliminates, r.added_at = $now`,
    {
      hId:       hypothesisId,
      qId:       String(quantumId),
      dv:        diagnostic_value,
      admiralty: admiralty || null,
      eliminates,
      now,
    }
  );

  // If eliminates + CONTRADICTS → auto-falsify
  if (eliminates && relationship === 'CONTRADICTS') {
    await resolveHypothesis(hypothesisId, {
      status:            'FALSIFIED',
      resolved_by:       'AUTO',
      resolution_reason: `Eliminated by quantum ${quantumId} (eliminates=true)`,
    });
    return { newConfidence: 0.0, statusChanged: true };
  }

  // Recalculate confidence using ACH-inspired update
  const { supporting, contradicting } = await _countEvidence(hypothesisId);
  const newConfidence = _computeConfidence(hRows[0].confidence, relationship, diagnostic_value);

  await memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $id }) SET h.confidence = $conf, h.updated_at = $now`,
    { id: hypothesisId, conf: newConfidence, now }
  );

  const statusChanged = false;
  return { newConfidence, statusChanged, supporting, contradicting };
}

// ─────────────────────────────────────────────────────────────────────────────

async function getHypothesis(hypothesisId) {
  const rows = await memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $id })
     OPTIONAL MATCH (h)-[rs:SUPPORTS]->(sq)
     OPTIONAL MATCH (h)-[rc:CONTRADICTS]->(cq)
     RETURN properties(h) AS h,
            collect(DISTINCT { quantumId: sq.id, diagnostic_value: rs.diagnostic_value,
                                admiralty: rs.admiralty, added_at: rs.added_at }) AS supporting,
            collect(DISTINCT { quantumId: cq.id, diagnostic_value: rc.diagnostic_value,
                                admiralty: rc.admiralty, eliminates: rc.eliminates,
                                added_at: rc.added_at }) AS contradicting`,
    { id: hypothesisId }
  );
  if (!rows.length) throw new Error(`Hypothesis ${hypothesisId} not found`);

  const h = rows[0].h || {};
  return {
    ...h,
    supporting:   (rows[0].supporting   || []).filter(e => e.quantumId),
    contradicting:(rows[0].contradicting || []).filter(e => e.quantumId),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function queryHypotheses({ namespace, type, status, minConfidence, maxConfidence, limit = 100 } = {}) {
  let cypher = `MATCH (h:Hypothesis) WHERE 1=1`;
  if (namespace)     cypher += ` AND h.namespace = $namespace`;
  if (type)          cypher += ` AND h.type = $type`;
  if (status)        cypher += ` AND h.status = $status`;
  if (minConfidence != null) cypher += ` AND h.confidence >= $minConf`;
  if (maxConfidence != null) cypher += ` AND h.confidence <= $maxConf`;
  cypher += ` RETURN properties(h) AS h ORDER BY h.confidence DESC LIMIT $limit`;

  return memgraph.runQuery(cypher, {
    namespace:  namespace     || null,
    type:       type          || null,
    status:     status        || null,
    minConf:    minConfidence ?? 0,
    maxConf:    maxConfidence ?? 1,
    limit:      neo4j.int(limit),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function resolveHypothesis(hypothesisId, {
  status,
  resolved_by,
  resolution_reason,
  resolution_action,
}) {
  if (!['CONFIRMED', 'FALSIFIED', 'SUPERSEDED', 'DEFERRED', 'EXPIRED'].includes(status)) {
    throw new Error(`Invalid resolution status: ${status}`);
  }
  if (!RESOLUTION_METHODS.includes(resolved_by)) {
    throw new Error(`Invalid resolved_by: ${resolved_by}`);
  }

  const now = new Date().toISOString();
  await memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $id })
     SET h.status = $status, h.resolved_at = $now, h.resolved_by = $resolved_by,
         h.resolution_reason = $reason, h.resolution_action = $action,
         h.updated_at = $now`,
    {
      id:          hypothesisId,
      status,
      now,
      resolved_by,
      reason:      resolution_reason || null,
      action:      resolution_action ? JSON.stringify(resolution_action) : null,
    }
  );

  return { success: true, hypothesisId, status };
}

// ─────────────────────────────────────────────────────────────────────────────

async function getCompetingHypotheses(hypothesisId) {
  return memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $id })-[:COMPETES_WITH]-(other:Hypothesis)
     RETURN properties(other) AS other ORDER BY other.confidence DESC`,
    { id: hypothesisId }
  );
}

async function linkCompeting(hypothesisId1, hypothesisId2) {
  await memgraph.runQuery(
    `MATCH (a:Hypothesis { id: $id1 }), (b:Hypothesis { id: $id2 })
     MERGE (a)-[:COMPETES_WITH]-(b)`,
    { id1: hypothesisId1, id2: hypothesisId2 }
  );
  return { linked: true };
}

// ─────────────────────────────────────────────────────────────────────────────

// ACH: rank competing hypotheses by minimum count of CONTRADICTS evidence.
// Fewer contradictions = more defensible hypothesis.
async function evaluateWithACH(hypothesisId) {
  const competing = await getCompetingHypotheses(hypothesisId);
  const allIds    = [hypothesisId, ...competing.map(r => r.other?.id || r.id)].filter(Boolean);

  const counts = await memgraph.runQuery(
    `MATCH (h:Hypothesis) WHERE h.id IN $ids
     OPTIONAL MATCH (h)-[r:CONTRADICTS]->()
     RETURN h.id AS id, h.statement AS statement,
            h.confidence AS confidence, count(r) AS contradicts_count
     ORDER BY contradicts_count ASC, h.confidence DESC`,
    { ids: allIds }
  );

  const topId = counts[0]?.id;
  return {
    ranking:        counts,
    recommendation: topId === hypothesisId ? 'CURRENT_HYPOTHESIS_PREFERRED' : 'COMPETING_HYPOTHESIS_PREFERRED',
    top:            counts[0],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

// Expire all OPEN hypotheses past their expires_at date
async function checkExpired() {
  const now = new Date().toISOString();
  const rows = await memgraph.runQuery(
    `MATCH (h:Hypothesis { status: 'OPEN' })
     WHERE h.expires_at IS NOT NULL AND h.expires_at < $now
     RETURN h.id AS id`,
    { now }
  );

  for (const row of rows) {
    await resolveHypothesis(row.id, {
      status:            'EXPIRED',
      resolved_by:       'TIMEOUT',
      resolution_reason: 'Hypothesis expired without resolution',
    });
  }

  return { expiredCount: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _countEvidence(hypothesisId) {
  const rows = await memgraph.runQuery(
    `MATCH (h:Hypothesis { id: $id })
     OPTIONAL MATCH (h)-[s:SUPPORTS]->()
     OPTIONAL MATCH (h)-[c:CONTRADICTS]->()
     RETURN count(DISTINCT s) AS supporting, count(DISTINCT c) AS contradicting`,
    { id: hypothesisId }
  );
  return rows[0] || { supporting: 0, contradicting: 0 };
}

// Simple Bayesian-like update: P = P + dv*(1-P) for SUPPORTS, P = P - dv*P for CONTRADICTS
function _computeConfidence(current, relationship, diagnostic_value) {
  const p  = current ?? 0.5;
  const dv = Math.min(1, Math.max(0, diagnostic_value));
  let updated;
  if (relationship === 'SUPPORTS') {
    updated = p + dv * (1 - p);
  } else {
    updated = p - dv * p;
  }
  return Math.round(Math.min(1, Math.max(0, updated)) * 1000) / 1000;
}

module.exports = {
  createHypothesis,
  addEvidence,
  getHypothesis,
  queryHypotheses,
  resolveHypothesis,
  getCompetingHypotheses,
  linkCompeting,
  evaluateWithACH,
  checkExpired,
};
