'use strict';

const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');
const { inferTemporalPattern } = require('./schemas/edge-schema');

const VALID_GRAINS = ['EXACT', 'DAY', 'MONTH', 'YEAR'];

function validateGrainConsistency(valid_from, valid_from_grain, valid_to, valid_to_grain) {
  if (valid_from && !valid_from_grain)
    throw new Error('valid_from_grain is required when valid_from is provided');
  if (!valid_from && valid_from_grain)
    throw new Error('valid_from_grain must be null when valid_from is null');
  if (valid_to && !valid_to_grain)
    throw new Error('valid_to_grain is required when valid_to is provided');
  if (!valid_to && valid_to_grain)
    throw new Error('valid_to_grain must be null when valid_to is null');
  if (valid_from_grain && !VALID_GRAINS.includes(valid_from_grain))
    throw new Error(`invalid valid_from_grain: ${valid_from_grain}`);
  if (valid_to_grain && !VALID_GRAINS.includes(valid_to_grain))
    throw new Error(`invalid valid_to_grain: ${valid_to_grain}`);
}

async function setTemporalValidity(edgeId, { valid_from, valid_to, valid_from_grain, valid_to_grain }) {
  validateGrainConsistency(valid_from, valid_from_grain, valid_to, valid_to_grain);

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.valid_from      = $valid_from,
         r.valid_to        = $valid_to,
         r.valid_from_grain= $valid_from_grain,
         r.valid_to_grain  = $valid_to_grain`,
    {
      edgeId:          neo4j.int(edgeId),
      valid_from:      valid_from || null,
      valid_to:        valid_to   || null,
      valid_from_grain:valid_from_grain || null,
      valid_to_grain:  valid_to_grain   || null,
    }
  );
  return { edgeId, valid_from, valid_to, valid_from_grain, valid_to_grain };
}

async function getTemporalValidity(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.valid_from AS valid_from, r.valid_to AS valid_to,
            r.valid_from_grain AS valid_from_grain, r.valid_to_grain AS valid_to_grain`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);
  const { valid_from, valid_to, valid_from_grain, valid_to_grain } = rows[0];
  return {
    valid_from,
    valid_to,
    valid_from_grain,
    valid_to_grain,
    pattern: inferTemporalPattern(valid_from, valid_to),
  };
}

// Return all active edges valid at queryTime (ISO string or Date).
async function queryAtTime(queryTime, { namespace, relationType, includeRetracted = false } = {}) {
  const ts = queryTime instanceof Date ? queryTime.toISOString() : queryTime;

  let cypher = `MATCH (a)-[r]->(b)
    WHERE (r.valid_from IS NULL OR r.valid_from <= $ts)
      AND (r.valid_to IS NULL OR r.valid_to > $ts)`;

  if (!includeRetracted) cypher += ` AND (r.status IS NULL OR r.status = 'ACTIVE')`;
  if (namespace)         cypher += ` AND r.namespace = $namespace`;
  if (relationType)      cypher += ` AND type(r) = $relationType`;

  cypher += ` RETURN id(r) AS edgeId, type(r) AS relType, r.polarity AS polarity,
                     r.valid_from AS valid_from, r.valid_to AS valid_to, r.status AS status`;

  const rows = await memgraph.runQuery(cypher, {
    ts,
    namespace:    namespace    || null,
    relationType: relationType || null,
  });
  return rows;
}

// History of all edge versions for a node in a given relationship type.
async function queryHistorical(nodeId, relationType) {
  const rows = await memgraph.runQuery(
    `MATCH (n)-[r:${relationType}]->(b)
     WHERE id(n) = $nodeId
     RETURN id(r) AS edgeId, type(r) AS relType, r.polarity AS polarity,
            r.valid_from AS valid_from, r.valid_to AS valid_to,
            r.recorded_at AS recorded_at, r.status AS status,
            r.superseded_at AS superseded_at
     ORDER BY r.valid_from DESC`,
    { nodeId: neo4j.int(nodeId) }
  );
  return rows;
}

// Temporal invalidation — sets valid_to without retracting.
async function expireEdge(edgeId, valid_to, reason) {
  if (!valid_to) throw new Error('valid_to is required for expireEdge');
  const grain = 'EXACT';

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.valid_to = $valid_to, r.valid_to_grain = $grain`,
    { edgeId: neo4j.int(edgeId), valid_to, grain }
  );
  return { edgeId, valid_to, valid_to_grain: grain, reason };
}

// Create a new edge superseding oldEdgeId. Returns new edge ID.
async function supersede(oldEdgeId, newEdgeData) {
  const now = new Date().toISOString();

  // Mark old edge as superseded
  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.status = 'SUPERSEDED', r.superseded_at = $now`,
    { edgeId: neo4j.int(oldEdgeId), now }
  );

  // Fetch topology of the old edge to reproduce it
  const rows = await memgraph.runQuery(
    `MATCH (a)-[r]->(b) WHERE id(r) = $edgeId
     RETURN id(a) AS aId, id(b) AS bId, type(r) AS relType, properties(r) AS props`,
    { edgeId: neo4j.int(oldEdgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${oldEdgeId} not found`);

  const { aId, bId, relType, props } = rows[0];
  const mergedProps = {
    ...props,
    ...newEdgeData,
    recorded_at:  now,
    superseded_at:null,
    status:       'ACTIVE',
  };

  const newRows = await memgraph.runQuery(
    `MATCH (a), (b) WHERE id(a) = $aId AND id(b) = $bId
     CREATE (a)-[r:${relType}]->(b) SET r = $props RETURN id(r) AS newEdgeId`,
    { aId: neo4j.int(aId), bId: neo4j.int(bId), props: mergedProps }
  );

  return { oldEdgeId, newEdgeId: newRows[0]?.newEdgeId };
}

module.exports = {
  setTemporalValidity,
  getTemporalValidity,
  queryAtTime,
  queryHistorical,
  expireEdge,
  supersede,
};
