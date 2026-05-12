'use strict';

const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');

const VALID_POLARITIES = ['AFFIRMED', 'NEGATED'];

async function setPolarity(edgeId, polarity, confidence = 1.0) {
  if (!VALID_POLARITIES.includes(polarity)) {
    throw new Error(`Invalid polarity '${polarity}'. Must be AFFIRMED or NEGATED.`);
  }
  if (confidence < 0 || confidence > 1) {
    throw new Error(`polarity_confidence must be between 0.0 and 1.0`);
  }

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.polarity = $polarity, r.polarity_confidence = $confidence`,
    { edgeId: neo4j.int(edgeId), polarity, confidence }
  );
  return { edgeId, polarity, polarity_confidence: confidence };
}

async function getPolarity(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.polarity AS polarity, r.polarity_confidence AS polarity_confidence`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);
  return {
    polarity:            rows[0].polarity || 'AFFIRMED',
    polarity_confidence: rows[0].polarity_confidence ?? 1.0,
  };
}

// Detect if AFFIRMED and NEGATED edges of same type exist between the same pair of nodes.
// Creates a Hypothesis node on conflict (stubbed until HypothesisService exists).
async function detectContradiction(nodeAId, nodeBId, relationType) {
  const rows = await memgraph.runQuery(
    `MATCH (a)-[r:${relationType}]->(b)
     WHERE id(a) = $aId AND id(b) = $bId AND r.status <> 'RETRACTED'
     RETURN r.polarity AS polarity, id(r) AS edgeId`,
    { aId: neo4j.int(nodeAId), bId: neo4j.int(nodeBId) }
  );

  const polarities = rows.map(r => r.polarity || 'AFFIRMED');
  const hasAffirmed = polarities.includes('AFFIRMED');
  const hasNegated  = polarities.includes('NEGATED');

  if (!hasAffirmed || !hasNegated) {
    return { hasContradiction: false };
  }

  // TODO: Create actual Hypothesis node when HypothesisService exists.
  // For now, record the conflict in the graph with a placeholder node.
  const now = new Date().toISOString();
  const conflictRows = await memgraph.runQuery(
    `CREATE (h:Hypothesis {
       type: 'POLARITY_CONFLICT',
       relationType: $relationType,
       nodeAId: $aId,
       nodeBId: $bId,
       detected_at: $now,
       status: 'OPEN'
     })
     RETURN id(h) AS hypothesisId`,
    { relationType, aId: String(nodeAId), bId: String(nodeBId), now }
  );

  const hypothesisId = conflictRows[0]?.hypothesisId;
  return { hasContradiction: true, hypothesisId };
}

// Create a NEGATED counterpart for an existing AFFIRMED edge.
// Does not modify the original — adds a new edge with polarity=NEGATED.
async function negateEdge(edgeId, reason, sourceQuantumId) {
  const rows = await memgraph.runQuery(
    `MATCH (a)-[r]->(b) WHERE id(r) = $edgeId
     RETURN id(a) AS aId, id(b) AS bId, type(r) AS relType, properties(r) AS props`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const { aId, bId, relType, props } = rows[0];
  const now = new Date().toISOString();

  const negated = await memgraph.runQuery(
    `MATCH (a), (b) WHERE id(a) = $aId AND id(b) = $bId
     CREATE (a)-[r:${relType}]->(b)
     SET r = $props,
         r.polarity = 'NEGATED',
         r.polarity_confidence = 1.0,
         r.recorded_at = $now,
         r.status = 'ACTIVE',
         r.retracted_at = null,
         r.retracted_by_quantum = null,
         r.retraction_reason = null,
         r.source_quanta = $sourceQuanta
     RETURN id(r) AS newEdgeId`,
    {
      aId:          neo4j.int(aId),
      bId:          neo4j.int(bId),
      props,
      now,
      sourceQuanta: sourceQuantumId ? [sourceQuantumId] : [],
    }
  );

  const newEdgeId = negated[0]?.newEdgeId;

  // Check for contradiction after creating the NEGATED edge
  await detectContradiction(aId, bId, relType);

  return { originalEdgeId: edgeId, negatedEdgeId: newEdgeId, reason };
}

async function queryByPolarity(polarity, { namespace, relationType, limit = 100 } = {}) {
  if (!VALID_POLARITIES.includes(polarity)) {
    throw new Error(`Invalid polarity '${polarity}'`);
  }

  let cypher = `MATCH (a)-[r]->(b) WHERE r.polarity = $polarity AND r.status = 'ACTIVE'`;
  if (namespace)    cypher += ` AND r.namespace = $namespace`;
  if (relationType) cypher += ` AND type(r) = $relationType`;
  cypher += ` RETURN id(r) AS edgeId, type(r) AS relType, r.polarity_confidence AS confidence LIMIT $limit`;

  const rows = await memgraph.runQuery(cypher, {
    polarity,
    namespace:    namespace || null,
    relationType: relationType || null,
    limit:        neo4j.int(limit),
  });
  return rows;
}

module.exports = { setPolarity, getPolarity, detectContradiction, negateEdge, queryByPolarity };
