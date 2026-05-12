'use strict';

const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');
const { buildDefaults, validateProperties, inferTemporalPattern } = require('./schemas/edge-schema');

// Create a new edge with full Tier 0 properties applied.
// relationType must be a valid Cypher relationship type string.
async function createEdge(fromNodeId, toNodeId, relationType, properties = {}) {
  const defaults = buildDefaults();
  const merged   = { ...defaults, ...properties };

  const errors = validateProperties(merged);
  if (errors.length) throw new Error(`Edge validation failed: ${errors.join('; ')}`);

  // Memgraph doesn't support parameterized relationship types; use template safely
  if (!/^[A-Z_][A-Z0-9_]*$/.test(relationType)) {
    throw new Error(`Invalid relationType: ${relationType}`);
  }

  const rows = await memgraph.runQuery(
    `MATCH (a), (b) WHERE id(a) = $fromId AND id(b) = $toId
     CREATE (a)-[r:${relationType}]->(b) SET r = $props RETURN id(r) AS edgeId`,
    {
      fromId: neo4j.int(fromNodeId),
      toId:   neo4j.int(toNodeId),
      props:  merged,
    }
  );
  if (!rows.length) throw new Error('Failed to create edge — nodes not found?');
  return { edgeId: rows[0].edgeId, ...merged };
}

async function updateEdgeProperties(edgeId, properties) {
  // Fetch current props for validation merge
  const current = await getEdgeWithTier0(edgeId);
  const merged  = { ...current, ...properties };
  const errors  = validateProperties(merged);
  if (errors.length) throw new Error(`Validation failed: ${errors.join('; ')}`);

  // Build SET clause dynamically (only update provided keys)
  const setClause = Object.keys(properties)
    .map(k => `r.\`${k}\` = $props_${k}`)
    .join(', ');

  const params = { edgeId: neo4j.int(edgeId) };
  for (const [k, v] of Object.entries(properties)) {
    params[`props_${k}`] = v;
  }

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId SET ${setClause}`,
    params
  );
  return { edgeId, updated: Object.keys(properties) };
}

async function validateEdge(edgeId) {
  const props = await getEdgeWithTier0(edgeId);
  const errors = validateProperties(props);
  return { valid: errors.length === 0, errors };
}

// Add missing Tier 0 defaults to a legacy edge (idempotent).
async function migrateEdge(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId RETURN properties(r) AS props`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const current  = rows[0].props || {};
  const defaults = buildDefaults();
  const patch    = {};

  for (const [key, val] of Object.entries(defaults)) {
    // Only patch truly absent fields with non-null defaults.
    // Null-defaulted fields (valid_from, valid_to, etc.) are never stored by
    // Memgraph when set to null, so absence === null — no patch needed.
    if (current[key] === undefined && val !== null && val !== undefined) {
      patch[key] = val;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { edgeId, migrated: false, reason: 'already compliant' };
  }

  const setClause = Object.keys(patch)
    .map(k => `r.\`${k}\` = $p_${k}`)
    .join(', ');

  const params = { edgeId: neo4j.int(edgeId) };
  for (const [k, v] of Object.entries(patch)) {
    params[`p_${k}`] = v;
  }

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId SET ${setClause}`,
    params
  );
  return { edgeId, migrated: true, patchedFields: Object.keys(patch) };
}

async function getEdgeWithTier0(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH (a)-[r]->(b) WHERE id(r) = $edgeId
     RETURN properties(r) AS props, id(a) AS fromId, id(b) AS toId, type(r) AS relType`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const { props, fromId, toId, relType } = rows[0];
  const pattern = inferTemporalPattern(props.valid_from, props.valid_to);
  return {
    edgeId,
    fromId,
    toId,
    relType,
    ...props,
    _pattern:  pattern.label,
    _isActive: props.status === 'ACTIVE' || props.status == null,
  };
}

// Check whether an edge is currently active and temporally valid.
function isActive(edgeProps, atTime = new Date()) {
  if (edgeProps.status && edgeProps.status !== 'ACTIVE') return false;
  if (edgeProps.polarity === 'NEGATED') return false;

  const now  = atTime instanceof Date ? atTime : new Date(atTime);
  const from = edgeProps.valid_from ? new Date(edgeProps.valid_from) : null;
  const to   = edgeProps.valid_to   ? new Date(edgeProps.valid_to)   : null;

  if (from && from > now) return false;
  if (to   && to  <= now) return false;
  return true;
}

module.exports = {
  createEdge,
  updateEdgeProperties,
  validateEdge,
  migrateEdge,
  getEdgeWithTier0,
  isActive,
};
