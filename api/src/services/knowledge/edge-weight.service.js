'use strict';

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const DEFAULT_STRENGTH    = 0.2;
const DEFAULT_CONFIDENCE  = 0.5;
const ALPHA_DEGREE_PENALTY = 0.1;

const INITIAL_WEIGHTS = [
  // Governance (highest weight)
  { relType: 'GOVERNS',         strength: 1.00, description: 'Direct regulatory/governance relationship' },
  { relType: 'MANDATES',        strength: 0.95, description: 'Formal mandate/authorization' },
  { relType: 'IMPLEMENTS',      strength: 0.95, description: 'Technical realization of policy/process' },
  { relType: 'OVERSEES',        strength: 0.90, description: 'Supervisory/oversight relationship' },
  { relType: 'DEFINES',         strength: 0.90, description: 'Definitional relationship' },
  // Structural
  { relType: 'ESTABLISHED_BY',  strength: 0.85, description: 'Institutional creation/founding' },
  { relType: 'ESTABLISHES',     strength: 0.85, description: 'Institutional creation (active voice)' },
  { relType: 'REQUIRES',        strength: 0.85, description: 'Mandatory dependency' },
  { relType: 'REPORTS_TO',      strength: 0.80, description: 'Reporting/accountability chain' },
  { relType: 'PART_OF',         strength: 0.75, description: 'Structural containment/membership' },
  { relType: 'CHAIRED_BY',      strength: 0.75, description: 'Leadership/chairmanship' },
  // Attribution
  { relType: 'AUTHORED_BY',     strength: 0.70, description: 'Document authorship/creation' },
  { relType: 'FUNDED_BY',       strength: 0.65, description: 'Financial dependency' },
  // Reference
  { relType: 'REFERENCES',      strength: 0.60, description: 'Explicit citation or reference' },
  // Collaboration
  { relType: 'SUPPORTS',        strength: 0.50, description: 'Supporting/enabling relationship' },
  { relType: 'COOPERATES_WITH', strength: 0.50, description: 'Collaborative relationship' },
  // Weak
  { relType: 'MENTIONS',        strength: 0.30, description: 'Weak mention without formal link' },
  { relType: 'RELATED_TO',      strength: 0.20, description: 'Generic/unclassified relationship' },
];

let _weightCache = null;

/* ── Seed ──────────────────────────────────────────────────────────────────── */

async function seedRelTypeWeights() {
  const log = [];
  for (const w of INITIAL_WEIGHTS) {
    const existing = await mg().runQuery(
      `MATCH (w:RelTypeWeight {relType: $relType}) RETURN w.relType AS relType`,
      { relType: w.relType }
    );
    if (existing.length > 0) {
      await mg().runQuery(
        `MATCH (w:RelTypeWeight {relType: $relType})
         SET w.strength = $strength, w.description = $description, w.updatedAt = $updatedAt`,
        { relType: w.relType, strength: w.strength, description: w.description, updatedAt: new Date().toISOString() }
      );
      log.push({ relType: w.relType, action: 'updated' });
    } else {
      await mg().runQuery(
        `CREATE (w:RelTypeWeight {
           relType: $relType, strength: $strength,
           description: $description, updatedAt: $updatedAt
         })`,
        { relType: w.relType, strength: w.strength, description: w.description, updatedAt: new Date().toISOString() }
      );
      log.push({ relType: w.relType, action: 'created' });
    }
  }
  _weightCache = null;
  return log;
}

/* ── Weight table ──────────────────────────────────────────────────────────── */

async function loadWeightTable() {
  if (_weightCache) return _weightCache;
  const rows = await mg().runQuery(
    `MATCH (w:RelTypeWeight)
     RETURN w.relType AS relType, w.strength AS strength, w.description AS description`,
    {}
  );
  const map = new Map();
  for (const r of rows) {
    const s = typeof r.strength === 'object' ? (r.strength?.low ?? DEFAULT_STRENGTH) : (r.strength ?? DEFAULT_STRENGTH);
    map.set(r.relType, { strength: s, description: r.description || '' });
  }
  if (map.size === 0) {
    for (const w of INITIAL_WEIGHTS) map.set(w.relType, { strength: w.strength, description: w.description });
  }
  _weightCache = map;
  return map;
}

function getStrength(relType, weightMap) {
  return weightMap?.get(relType)?.strength ?? DEFAULT_STRENGTH;
}

/* ── Cost computation ──────────────────────────────────────────────────────── */

function computeEdgeCost(relType, confidence, weightMap, targetDegree = null) {
  const strength = getStrength(relType, weightMap);
  const conf = (confidence != null && confidence > 0) ? Math.min(confidence, 1) : DEFAULT_CONFIDENCE;
  let cost = -Math.log(strength * conf);
  if (targetDegree != null) {
    cost += ALPHA_DEGREE_PENALTY * Math.log(targetDegree + 1);
  }
  return cost;
}

function costToStrength(totalCost) {
  return Math.exp(-totalCost);
}

/* ── Materialize cost on all ES_RELATED_TO edges ───────────────────────────── */

async function recalculateAllEdgeCosts(includeDegree = false) {
  if (includeDegree) {
    // Materialise out-degree on each ESEntity node
    await mg().runQuery(
      `MATCH (n:ESEntity)
       OPTIONAL MATCH (n)-[r:ES_RELATED_TO]->()
       WITH n, count(r) AS deg
       SET n.degree = deg`,
      {}
    );
  }

  const rows = await mg().runQuery(
    includeDegree
      ? `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
         OPTIONAL MATCH (w:RelTypeWeight {relType: r.relType})
         WITH r, b, COALESCE(w.strength, $defaultStrength) AS strength
         SET r.cost = -log(strength * COALESCE(r.confidence, $defaultConf))
                    + $alpha * log(COALESCE(b.degree, 1) + 1)
         RETURN count(r) AS updated`
      : `MATCH ()-[r:ES_RELATED_TO]->()
         OPTIONAL MATCH (w:RelTypeWeight {relType: r.relType})
         WITH r, COALESCE(w.strength, $defaultStrength) AS strength
         SET r.cost = -log(strength * COALESCE(r.confidence, $defaultConf))
         RETURN count(r) AS updated`,
    { defaultStrength: DEFAULT_STRENGTH, defaultConf: DEFAULT_CONFIDENCE, alpha: ALPHA_DEGREE_PENALTY }
  );

  const updated = typeof rows[0]?.updated === 'object'
    ? (rows[0].updated?.low ?? 0)
    : (rows[0]?.updated || 0);

  // Compute distribution stats from a second read
  const statsRows = await mg().runQuery(
    `MATCH ()-[r:ES_RELATED_TO]->()
     WHERE r.cost IS NOT NULL
     RETURN
       min(r.cost) AS minCost,
       max(r.cost) AS maxCost,
       avg(r.cost) AS avgCost`,
    {}
  );
  const st = statsRows[0] || {};
  const toNum = v => (typeof v === 'object' ? (v?.low ?? 0) : (v ?? 0));

  return {
    updated,
    errors: 0,
    min: toNum(st.minCost),
    max: toNum(st.maxCost),
    avg: toNum(st.avgCost),
  };
}

/* ── CRUD for weight table ─────────────────────────────────────────────────── */

async function getWeightsWithEdgeCounts() {
  const rows = await mg().runQuery(
    `MATCH (w:RelTypeWeight)
     OPTIONAL MATCH ()-[r:ES_RELATED_TO {relType: w.relType}]->()
     WITH w, count(r) AS edgeCount
     RETURN w.relType AS relType, w.strength AS strength,
            w.description AS description, edgeCount
     ORDER BY w.strength DESC`,
    {}
  );
  return rows.map(r => ({
    relType:     r.relType,
    strength:    typeof r.strength === 'object' ? (r.strength?.low ?? DEFAULT_STRENGTH) : (r.strength ?? DEFAULT_STRENGTH),
    description: r.description || '',
    edgeCount:   typeof r.edgeCount === 'object' ? (r.edgeCount?.low ?? 0) : (r.edgeCount || 0),
  }));
}

async function updateWeight(relType, strength, description) {
  const existing = await mg().runQuery(
    `MATCH (w:RelTypeWeight {relType: $relType}) RETURN w.relType AS relType`,
    { relType }
  );
  if (existing.length === 0) {
    await mg().runQuery(
      `CREATE (w:RelTypeWeight {
         relType: $relType, strength: $strength,
         description: $description, updatedAt: $updatedAt
       })`,
      { relType, strength, description: description || '', updatedAt: new Date().toISOString() }
    );
  } else {
    await mg().runQuery(
      `MATCH (w:RelTypeWeight {relType: $relType})
       SET w.strength = $strength, w.description = $description, w.updatedAt = $updatedAt`,
      { relType, strength, description: description || '', updatedAt: new Date().toISOString() }
    );
  }
  _weightCache = null;
  return await recalculateAllEdgeCosts();
}

module.exports = {
  seedRelTypeWeights,
  loadWeightTable,
  getStrength,
  computeEdgeCost,
  costToStrength,
  recalculateAllEdgeCosts,
  getWeightsWithEdgeCounts,
  updateWeight,
  INITIAL_WEIGHTS,
};
