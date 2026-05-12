'use strict';

const { v4: uuidv4 } = require('uuid');
const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');
const { INFERENCE_TYPES } = require('./schemas/inference-schema');
const { buildDefaults }   = require('../../knowledge/tier0/schemas/edge-schema');

// ─────────────────────────────────────────────────────────────────────────────

async function registerRule({ name, description, type, pattern, confidence_modifier, namespace, created_by }) {
  if (!INFERENCE_TYPES[type])  throw new Error(`Unknown inference type: ${type}`);
  if (!name)                   throw new Error('name is required');
  if (!namespace)              throw new Error('namespace is required');
  if (!pattern)                throw new Error('pattern is required');

  const id  = uuidv4();
  const now = new Date().toISOString();

  await memgraph.runQuery(
    `CREATE (r:InferenceRule {
       id: $id, namespace: $namespace, name: $name,
       description: $desc, type: $type,
       pattern: $pattern, confidence_modifier: $cm,
       enabled: true, priority: 100,
       created_at: $now, created_by: $by
     })`,
    {
      id, namespace, name,
      desc:    description || '',
      type,
      pattern: JSON.stringify(pattern),
      cm:      confidence_modifier ?? 0.9,
      now,
      by:      created_by || 'system',
    }
  );
  return { ruleId: id };
}

async function getRule(ruleId) {
  const rows = await memgraph.runQuery(
    `MATCH (r:InferenceRule { id: $id }) RETURN r`,
    { id: ruleId }
  );
  if (!rows.length) throw new Error(`InferenceRule ${ruleId} not found`);
  return rows[0].r;
}

async function listRules({ namespace, type, enabled, limit = 100 } = {}) {
  let cypher = `MATCH (r:InferenceRule) WHERE 1=1`;
  if (namespace)         cypher += ` AND r.namespace = $ns`;
  if (type)              cypher += ` AND r.type = $type`;
  if (enabled != null)   cypher += ` AND r.enabled = $enabled`;
  cypher += ` RETURN properties(r) AS r ORDER BY r.priority DESC, r.name LIMIT $limit`;
  return memgraph.runQuery(cypher, {
    ns:      namespace || null,
    type:    type      || null,
    enabled: enabled   ?? null,
    limit:   neo4j.int(limit),
  });
}

async function enableRule(ruleId)  {
  await memgraph.runQuery(`MATCH (r:InferenceRule {id:$id}) SET r.enabled=true`,  { id: ruleId });
}
async function disableRule(ruleId) {
  await memgraph.runQuery(`MATCH (r:InferenceRule {id:$id}) SET r.enabled=false`, { id: ruleId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply a rule: find matches and create derived edges
// ─────────────────────────────────────────────────────────────────────────────

async function applyRule(ruleId, { namespace, limit = 500, dryRun = false } = {}) {
  const ruleRows = await memgraph.runQuery(
    `MATCH (r:InferenceRule { id: $id, enabled: true }) RETURN r`,
    { id: ruleId }
  );
  if (!ruleRows.length) throw new Error(`InferenceRule ${ruleId} not found or disabled`);

  const rule    = ruleRows[0].r;
  const pattern = JSON.parse(rule.pattern || '{}');

  // Execute the pattern-specific Cypher query
  const matches = await _findMatches(rule, pattern, namespace, limit);

  let created = 0, skipped = 0, errors = 0;

  for (const match of matches) {
    try {
      // Check if derived edge already exists
      const existing = await memgraph.runQuery(
        `MATCH (a)-[r:${match.conclusionType}]->(b)
         WHERE id(a) = $aId AND id(b) = $bId AND r.derived = true AND r.inference_rule_id = $ruleId
         RETURN id(r) AS eid LIMIT 1`,
        { aId: neo4j.int(match.fromId), bId: neo4j.int(match.toId), ruleId }
      );

      if (existing.length > 0) { skipped++; continue; }

      if (!dryRun) {
        await deriveEdge(match.fromId, match.toId, match.conclusionType, {
          premises:            match.premiseEdgeIds,
          ruleId,
          ruleName:            rule.name,
          confidence_modifier: rule.confidence_modifier,
          premiseWeights:      match.premiseWeights,
        });
      }
      created++;
    } catch (err) {
      errors++;
    }
  }

  return { ruleId, matches: matches.length, created, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create a derived edge with full Tier 0 + inference properties
// ─────────────────────────────────────────────────────────────────────────────

async function deriveEdge(fromNodeId, toNodeId, relationType, {
  premises = [],
  ruleId,
  ruleName,
  confidence_modifier = 0.9,
  premiseWeights = [],
}) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(relationType)) {
    throw new Error(`Invalid relationType: ${relationType}`);
  }

  const now      = new Date().toISOString();
  const defaults = buildDefaults();

  // Derived confidence = product of premise weights × modifier
  const weights     = premiseWeights.length ? premiseWeights : premises.map(() => 1.0);
  const minWeight   = weights.reduce((m, w) => Math.min(m, w), 1.0);
  const derived_confidence = Math.min(1, minWeight * confidence_modifier);

  const props = {
    ...defaults,
    derived:             true,
    inference_type:      'COMPOSITION',
    inference_rule_id:   ruleId || '',
    inference_rule_name: ruleName || '',
    premise_edge_ids:    premises.map(String),
    derived_confidence,
    premise_dependent:   true,
    derived_at:          now,
    last_revalidated:    now,
    weight_original:     derived_confidence,
    weight_effective:    derived_confidence,
    source_quanta:       [],
  };

  const rows = await memgraph.runQuery(
    `MATCH (a), (b) WHERE id(a) = $aId AND id(b) = $bId
     CREATE (a)-[r:${relationType}]->(b) SET r = $props RETURN id(r) AS edgeId`,
    { aId: neo4j.int(fromNodeId), bId: neo4j.int(toNodeId), props }
  );
  if (!rows.length) throw new Error('Failed to create derived edge');
  return { edgeId: rows[0].edgeId, derived_confidence };
}

// ─────────────────────────────────────────────────────────────────────────────

async function getJustification(edgeId, depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return { chain: [], truncated: true };

  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.derived AS derived, r.inference_rule_id AS ruleId,
            r.inference_rule_name AS ruleName, r.premise_edge_ids AS premises,
            r.derived_confidence AS confidence, r.derived_at AS derived_at`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const row = rows[0];
  if (!row.derived) return { chain: [{ edgeId, direct: true }], depth: 0, totalConfidence: 1.0 };

  const chain = [{ edgeId, ruleId: row.ruleId, ruleName: row.ruleName, confidence: row.confidence, derived_at: row.derived_at }];
  let totalConfidence = row.confidence || 1.0;

  for (const premiseId of (row.premises || [])) {
    const sub = await getJustification(Number(premiseId), depth + 1, maxDepth);
    chain.push(...(sub.chain || []));
    totalConfidence = Math.min(totalConfidence, sub.totalConfidence || 1.0);
  }

  return { chain, depth, totalConfidence };
}

// ─────────────────────────────────────────────────────────────────────────────

async function revalidateDerived(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.derived AS derived, r.premise_edge_ids AS premises,
            r.inference_rule_id AS ruleId, r.inference_rule_name AS ruleName`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);
  if (!rows[0].derived) return { valid: true, reason: 'not a derived edge' };

  const premises     = rows[0].premises || [];
  const issues       = [];
  const premiseRows  = [];

  for (const pIdStr of premises) {
    const pId = Number(pIdStr);
    const pr  = await memgraph.runQuery(
      `MATCH ()-[r]->() WHERE id(r) = $pId
       RETURN r.status AS status, r.weight_effective AS we`,
      { pId: neo4j.int(pId) }
    );
    if (!pr.length) {
      issues.push(`premise ${pId} not found`);
    } else if (pr[0].status === 'RETRACTED') {
      issues.push(`premise ${pId} is RETRACTED`);
    } else {
      premiseRows.push(pr[0].we ?? 1.0);
    }
  }

  const now = new Date().toISOString();

  if (issues.length > 0) {
    // Retract derived edge if any premise is invalid
    await memgraph.runQuery(
      `MATCH ()-[r]->() WHERE id(r) = $id
       SET r.status = 'RETRACTED', r.retracted_at = $now,
           r.retraction_reason = $reason`,
      { id: neo4j.int(edgeId), now, reason: `Premise invalidated: ${issues.join(', ')}` }
    );
    return { valid: false, newConfidence: 0, issues };
  }

  // Recalculate confidence from current premise weights
  const minWeight      = premiseRows.reduce((m, w) => Math.min(m, w), 1.0);
  const ruleRows       = await memgraph.runQuery(
    `MATCH (r:InferenceRule { id: $id }) RETURN r.confidence_modifier AS cm`,
    { id: rows[0].ruleId || '' }
  );
  const cm             = ruleRows[0]?.cm ?? 0.9;
  const newConfidence  = Math.min(1, minWeight * cm);

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $id
     SET r.derived_confidence = $conf, r.weight_effective = $conf,
         r.last_revalidated = $now`,
    { id: neo4j.int(edgeId), conf: newConfidence, now }
  );

  return { valid: true, newConfidence, issues: [] };
}

// ─────────────────────────────────────────────────────────────────────────────

// When a premise is retracted, cascade to all derived edges that depend on it
async function invalidateDerived(premiseEdgeId) {
  const dependents = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE $pId IN r.premise_edge_ids AND r.derived = true AND r.status = 'ACTIVE'
     RETURN id(r) AS edgeId`,
    { pId: String(premiseEdgeId) }
  );

  let revalidated = 0, retracted = 0;

  for (const dep of dependents) {
    const result = await revalidateDerived(dep.edgeId);
    if (result.valid) revalidated++;
    else retracted++;

    // Recurse — this derived edge may itself be a premise for others
    if (!result.valid) {
      const sub = await invalidateDerived(dep.edgeId);
      revalidated += sub.revalidated;
      retracted   += sub.retracted;
    }
  }

  return { affected: dependents.length, revalidated, retracted };
}

// ─────────────────────────────────────────────────────────────────────────────

async function runInferencePass({ namespace, ruleIds, dryRun = false } = {}) {
  let rulesQuery = `MATCH (r:InferenceRule { enabled: true })`;
  if (namespace) rulesQuery += ` WHERE r.namespace = $ns`;
  rulesQuery += ` RETURN r ORDER BY r.priority DESC`;

  const ruleRows = await memgraph.runQuery(rulesQuery, { ns: namespace || null });
  const rules    = ruleRows.map(r => r.r);

  const filtered = ruleIds
    ? rules.filter(r => ruleIds.includes(r.id))
    : rules;

  let totalCreated = 0;
  const results    = [];
  const errors     = [];

  for (const rule of filtered) {
    try {
      const result = await applyRule(rule.id, { namespace, dryRun });
      totalCreated += result.created;
      results.push(result);
    } catch (err) {
      errors.push({ ruleId: rule.id, error: err.message });
    }
  }

  return { rulesApplied: filtered.length, edgesCreated: totalCreated, results, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: find matches for a rule pattern
// Returns array of { fromId, toId, conclusionType, premiseEdgeIds, premiseWeights }
// ─────────────────────────────────────────────────────────────────────────────

async function _findMatches(rule, pattern, namespace, limit) {
  // Pattern structure: { premises: [{from, to, type}], conclusion: {from, to, type} }
  if (!pattern.premises || !pattern.conclusion) return [];

  const { premises, conclusion } = pattern;

  // Build a Cypher MATCH chain from pattern premises
  // Only handle simple 2-premise transitive patterns generically
  if (premises.length === 2) {
    const [p1, p2] = premises;
    const cypher = `
      MATCH (a)-[r1:${p1.type}]->(b)-[r2:${p2.type}]->(c)
      WHERE r1.polarity = 'AFFIRMED' AND r1.status = 'ACTIVE'
        AND r2.polarity = 'AFFIRMED' AND r2.status = 'ACTIVE'
        ${namespace ? `AND r1.namespace = '${namespace}'` : ''}
      RETURN id(a) AS fromId, id(c) AS toId, '${conclusion.type}' AS conclusionType,
             [id(r1), id(r2)] AS premiseEdgeIds,
             [coalesce(r1.weight_effective, 1.0), coalesce(r2.weight_effective, 1.0)] AS premiseWeights
      LIMIT $limit`;

    return memgraph.runQuery(cypher, { limit: neo4j.int(limit) });
  }

  if (premises.length === 1) {
    const [p1] = premises;
    const cypher = `
      MATCH (a)-[r1:${p1.type}]->(b)
      WHERE r1.polarity = 'AFFIRMED' AND r1.status = 'ACTIVE'
        ${namespace ? `AND r1.namespace = '${namespace}'` : ''}
      RETURN id(b) AS fromId, id(a) AS toId, '${conclusion.type}' AS conclusionType,
             [id(r1)] AS premiseEdgeIds,
             [coalesce(r1.weight_effective, 1.0)] AS premiseWeights
      LIMIT $limit`;

    return memgraph.runQuery(cypher, { limit: neo4j.int(limit) });
  }

  return [];
}

module.exports = {
  registerRule,
  getRule,
  listRules,
  enableRule,
  disableRule,
  applyRule,
  deriveEdge,
  getJustification,
  revalidateDerived,
  invalidateDerived,
  runInferencePass,
};
