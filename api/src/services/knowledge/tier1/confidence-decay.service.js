'use strict';

const memgraph  = require('../../memgraph.service');
const neo4j     = require('neo4j-driver');
const hypothesis = require('./hypothesis.service');

// λ values per decay rate (fractional decay per day)
const DECAY_RATES = {
  STABLE:   0,        // Never decays
  SLOW:     0.000274, // ~10% per year  (ln(0.9) / 365 ≈ -0.000289, use 0.000274)
  MEDIUM:   0.000952, // ~30% per year
  FAST:     0.008447, // ~95% per year
  VOLATILE: 0.076961, // ~99% per month
};

const VALID_DECAY_RATES = Object.keys(DECAY_RATES);
const DEFAULT_THRESHOLD = 0.3; // below this → create DECAY_RECOVERY hypothesis

function _ageInDays(lastReinforced, now = new Date()) {
  if (!lastReinforced) return 0;
  return (now.getTime() - new Date(lastReinforced).getTime()) / 86400000;
}

function computeEffectiveWeight(weightOriginal, decayRate, lastReinforced) {
  const lambda = DECAY_RATES[decayRate || 'STABLE'] ?? 0;
  if (lambda === 0) return weightOriginal || 1.0;
  const age    = _ageInDays(lastReinforced);
  return (weightOriginal || 1.0) * Math.exp(-lambda * age);
}

// ─────────────────────────────────────────────────────────────────────────────

async function setDecayRate(edgeId, rate) {
  if (!VALID_DECAY_RATES.includes(rate)) {
    throw new Error(`Invalid decay rate '${rate}'. Must be one of: ${VALID_DECAY_RATES.join(', ')}`);
  }

  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.weight_original AS wo, r.last_reinforced AS lr`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const we = computeEffectiveWeight(rows[0].wo, rate, rows[0].lr);
  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.decay_rate = $rate, r.weight_effective = $we`,
    { edgeId: neo4j.int(edgeId), rate, we }
  );
  return { edgeId, decay_rate: rate, weight_effective: we };
}

async function calculateEffectiveWeight(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.weight_original AS wo, r.decay_rate AS dr, r.last_reinforced AS lr`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);
  const { wo, dr, lr } = rows[0];
  return computeEffectiveWeight(wo, dr, lr);
}

// ─────────────────────────────────────────────────────────────────────────────

async function reinforce(edgeId, newSourceQuantumId) {
  const now = new Date().toISOString();

  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.weight_original AS wo, r.decay_rate AS dr, r.source_quanta AS sq`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const { wo, dr, sq } = rows[0];
  const we = computeEffectiveWeight(wo, dr, now); // age=0 after reinforce

  const source_quanta = newSourceQuantumId
    ? [...(sq || []), newSourceQuantumId]
    : (sq || []);

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.last_reinforced = $now, r.weight_effective = $we,
         r.source_quanta = $sq`,
    { edgeId: neo4j.int(edgeId), now, we, sq: source_quanta }
  );

  // If a DECAY_RECOVERY hypothesis exists for this edge, resolve it
  await _resolveDecayRecovery(String(edgeId));

  return { edgeId, weight_effective: we, last_reinforced: now };
}

// ─────────────────────────────────────────────────────────────────────────────

async function applyDecay({ namespace, minAge = 0, batchSize = 100, threshold } = {}) {
  const decayThreshold = threshold ?? DEFAULT_THRESHOLD;
  const now            = new Date();

  let processed = 0, decayed = 0, hypothesesCreated = 0;
  let offset = 0;

  while (true) {
    let cypher = `MATCH ()-[r]->()
      WHERE (r.status IS NULL OR r.status = 'ACTIVE')
        AND (r.valid_to IS NULL OR r.valid_to > $now)
        AND r.decay_rate IS NOT NULL
        AND r.decay_rate <> 'STABLE'`;
    if (namespace) cypher += ` AND r.namespace = $ns`;
    cypher += ` RETURN id(r) AS edgeId, r.weight_original AS wo,
                       r.decay_rate AS dr, r.last_reinforced AS lr,
                       r.weight_effective AS we_current,
                       r.namespace AS ns
               SKIP $skip LIMIT $limit`;

    const rows = await memgraph.runQuery(cypher, {
      now:   now.toISOString(),
      ns:    namespace || null,
      skip:  neo4j.int(offset),
      limit: neo4j.int(batchSize),
    });
    if (!rows.length) break;

    for (const row of rows) {
      const age = _ageInDays(row.lr, now);
      if (age < minAge) continue;

      const we_new = computeEffectiveWeight(row.wo, row.dr, row.lr);

      await memgraph.runQuery(
        `MATCH ()-[r]->() WHERE id(r) = $edgeId SET r.weight_effective = $we`,
        { edgeId: neo4j.int(row.edgeId), we: we_new }
      );
      processed++;

      if (we_new < row.we_current) decayed++;

      // Create DECAY_RECOVERY hypothesis if below threshold and none exists
      if (we_new < decayThreshold) {
        const created = await _ensureDecayRecoveryHypothesis(row.edgeId, row.ns, we_new);
        if (created) hypothesesCreated++;
      }
    }

    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  return { processed, decayed, hypothesesCreated };
}

// ─────────────────────────────────────────────────────────────────────────────

async function getDecayedEdges({ namespace, threshold, limit = 100 } = {}) {
  const t = threshold ?? DEFAULT_THRESHOLD;
  let cypher = `MATCH ()-[r]->()
    WHERE r.weight_effective < $threshold AND r.status = 'ACTIVE'`;
  if (namespace) cypher += ` AND r.namespace = $ns`;
  cypher += ` RETURN id(r) AS edgeId, type(r) AS relType,
                     r.weight_effective AS weight_effective,
                     r.weight_original AS weight_original,
                     r.decay_rate AS decay_rate,
                     r.last_reinforced AS last_reinforced
              ORDER BY r.weight_effective ASC LIMIT $limit`;

  return memgraph.runQuery(cypher, {
    threshold: t,
    ns:        namespace || null,
    limit:     neo4j.int(limit),
  });
}

async function getDecayStatistics(namespace) {
  let cypher = `MATCH ()-[r]->() WHERE r.decay_rate IS NOT NULL`;
  if (namespace) cypher += ` AND r.namespace = $ns`;
  cypher += `
    RETURN r.decay_rate AS decay_rate, count(r) AS count,
           avg(r.weight_effective) AS avg_effective
    ORDER BY count DESC`;

  return memgraph.runQuery(cypher, { ns: namespace || null });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function _ensureDecayRecoveryHypothesis(edgeId, ns, currentWeight) {
  const existing = await memgraph.runQuery(
    `MATCH (h:Hypothesis { type: 'DECAY_RECOVERY', status: 'OPEN' })
     WHERE $edgeId IN h.subject_edges RETURN h.id AS id LIMIT 1`,
    { edgeId: String(edgeId) }
  );
  if (existing.length > 0) return false;

  await hypothesis.createHypothesis({
    type:          'DECAY_RECOVERY',
    statement:     `Edge ${edgeId} confidence decayed to ${currentWeight.toFixed(3)} — below threshold`,
    namespace:     ns || 'UNPA',
    subject_edges: [String(edgeId)],
  });
  return true;
}

async function _resolveDecayRecovery(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH (h:Hypothesis { type: 'DECAY_RECOVERY', status: 'OPEN' })
     WHERE $edgeId IN h.subject_edges RETURN h.id AS id`,
    { edgeId }
  );
  for (const r of rows) {
    await hypothesis.resolveHypothesis(r.id, {
      status:            'CONFIRMED',
      resolved_by:       'AUTO',
      resolution_reason: `Edge ${edgeId} reinforced — confidence recovered`,
    });
  }
}

module.exports = {
  DECAY_RATES,
  computeEffectiveWeight,
  setDecayRate,
  calculateEffectiveWeight,
  reinforce,
  applyDecay,
  getDecayedEdges,
  getDecayStatistics,
};
