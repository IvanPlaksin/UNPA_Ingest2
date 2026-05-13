'use strict';

const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');
const {
  SOURCE_RELIABILITY,
  INFORMATION_ACCURACY,
  SOURCE_TYPE_DEFAULTS,
  parseAdmiraltyCode,
  formatAdmiraltyCode,
  compareAdmiraltyCodes,
  validateCode,
  calculateAdmiraltyWeight,
} = require('./schemas/admiralty-schema');

async function setAdmiraltyCode(quantumId, sourceCode, accuracyCode) {
  const err = validateCode(sourceCode, accuracyCode);
  if (err) throw new Error(err);

  const combined = formatAdmiraltyCode(sourceCode, accuracyCode);
  const weight   = calculateAdmiraltyWeight(sourceCode, accuracyCode);

  await memgraph.runQuery(
    `MATCH (q) WHERE q.id = $id OR id(q) = $nid
     SET q.admiralty_combined = $combined,
         q.admiralty_source   = $sourceCode,
         q.admiralty_accuracy = $accuracyCode,
         q.admiralty_weight   = $weight`,
    {
      id:          String(quantumId),
      nid:         isNaN(quantumId) ? neo4j.int(-1) : neo4j.int(quantumId),
      combined,
      sourceCode,
      accuracyCode: String(accuracyCode),
      weight,
    }
  );
  return { combined, weight, sourceCode, accuracyCode };
}

async function getAdmiraltyCode(quantumId) {
  const rows = await memgraph.runQuery(
    `MATCH (q) WHERE q.id = $id OR id(q) = $nid
     RETURN q.admiralty_combined AS combined,
            q.admiralty_source   AS source,
            q.admiralty_accuracy AS accuracy,
            q.admiralty_weight   AS weight`,
    {
      id:  String(quantumId),
      nid: isNaN(quantumId) ? neo4j.int(-1) : neo4j.int(quantumId),
    }
  );
  if (!rows.length) throw new Error(`Quantum ${quantumId} not found`);
  return rows[0];
}

// Heuristic: suggest source reliability from source type string
function calculateSourceReliability(sourceType) {
  const key = (sourceType || 'unknown').toLowerCase().replace(/[\s-]/g, '_');
  return SOURCE_RELIABILITY[SOURCE_TYPE_DEFAULTS[key] || 'F'];
}

// Suggest accuracy based on independent source count and consistency
async function calculateInformationAccuracy(quantumId, { independentSources, consistent } = {}) {
  // Simple heuristic: number of confirming independent sources
  const count = independentSources || 1;
  if (count >= 2 && consistent !== false) return INFORMATION_ACCURACY[1];
  if (count >= 1 && consistent !== false) return INFORMATION_ACCURACY[2];
  if (count >= 1 && consistent === false) return INFORMATION_ACCURACY[4];
  return INFORMATION_ACCURACY[6];
}

// Suggest combined Admiralty code for a quantum
async function suggestAdmiraltyCode(quantumId, { sourceType, independentSources, consistent } = {}) {
  const sourceRel  = calculateSourceReliability(sourceType);
  const infoAcc    = await calculateInformationAccuracy(quantumId, { independentSources, consistent });
  const combined   = formatAdmiraltyCode(sourceRel.code, infoAcc.code);
  const weight     = calculateAdmiraltyWeight(sourceRel.code, infoAcc.code);

  return {
    suggested: combined,
    weight,
    reasoning: {
      source_reliability: sourceRel.name,
      information_accuracy: infoAcc.name,
    },
  };
}

// Arbitrate conflict between quanta: higher Admiralty weight wins; ties broken by recency
async function arbitrateConflict(quantumIds) {
  if (!quantumIds || quantumIds.length < 2) throw new Error('At least 2 quantumIds required');

  const rows = await memgraph.runQuery(
    `MATCH (q) WHERE q.id IN $ids
     RETURN q.id AS id, q.admiralty_weight AS weight, q.created_at AS created_at`,
    { ids: quantumIds.map(String) }
  );

  if (!rows.length) throw new Error('No quanta found for given IDs');

  const sorted = rows.slice().sort((a, b) => {
    const wDiff = (b.weight || 0) - (a.weight || 0);
    if (Math.abs(wDiff) > 0.001) return wDiff;
    // Tie-break: more recent first
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  });

  return {
    winnerId: sorted[0].id,
    reason:   sorted[0].weight > (sorted[1]?.weight || 0)
      ? 'Higher Admiralty rating'
      : 'Equal rating — more recent source wins',
    confidence: sorted[0].weight || 0.5,
    ranking: sorted.map(r => ({ id: r.id, weight: r.weight })),
  };
}

// Aggregate Admiralty weights from source_quanta onto an edge's weight_effective
async function updateWeightFromAdmiralty(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     RETURN r.source_quanta AS source_quanta, r.weight_original AS weight_original`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);

  const { source_quanta, weight_original } = rows[0];
  if (!source_quanta || !source_quanta.length) {
    return { edgeId, weight_effective: weight_original || 1.0, reason: 'no source quanta' };
  }

  const quantaRows = await memgraph.runQuery(
    `MATCH (q) WHERE q.id IN $ids RETURN q.admiralty_weight AS w`,
    { ids: source_quanta.map(String) }
  );

  const weights = quantaRows.map(r => r.w).filter(w => w != null);
  if (!weights.length) {
    return { edgeId, weight_effective: weight_original || 1.0, reason: 'quanta have no admiralty' };
  }

  // Weighted average of source admiralty weights
  const avgAdmiralty = weights.reduce((s, w) => s + w, 0) / weights.length;
  const weight_effective = (weight_original || 1.0) * avgAdmiralty;

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId SET r.weight_effective = $we`,
    { edgeId: neo4j.int(edgeId), we: weight_effective }
  );

  return { edgeId, weight_effective, avgAdmiralty };
}

async function queryByAdmiralty({ minReliability, minAccuracy, namespace, limit = 100 } = {}) {
  const minWeight = calculateAdmiraltyWeight(minReliability || 'F', minAccuracy || '6') || 0;

  let cypher = `MATCH (q) WHERE q.admiralty_weight >= $minWeight`;
  if (namespace) cypher += ` AND q.namespace = $namespace`;
  cypher += ` RETURN q.id AS id, q.admiralty_combined AS combined,
                     q.admiralty_weight AS weight, labels(q) AS labels
              LIMIT $limit`;

  return memgraph.runQuery(cypher, {
    minWeight,
    namespace: namespace || null,
    limit:     neo4j.int(limit),
  });
}

module.exports = {
  setAdmiraltyCode,
  getAdmiraltyCode,
  calculateSourceReliability,
  calculateInformationAccuracy,
  suggestAdmiraltyCode,
  arbitrateConflict,
  updateWeightFromAdmiralty,
  queryByAdmiralty,
};
