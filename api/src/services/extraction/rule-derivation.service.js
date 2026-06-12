'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const LOG  = '[RuleDerivation]';
function now() { return new Date().toISOString(); }
function _n(v) { return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); }
function _f(v) { return typeof v === 'object' ? (v?.low ?? null) : (v ?? null); }

const DEFAULT_MIN_SAMPLE    = 10;
const DEFAULT_MIN_CONFIDENCE = 0.8;
const MIN_KQS_IMPROVEMENT   = 0.05; // 5% improvement to be worth a rule

/**
 * RuleDerivationService — P6-001 (schema) + P6-002 (derivation).
 *
 * Graph model:
 *   (:DerivedRule)-[:RECOMMENDS]->(m:Methodology)
 *   (:DerivedRule)-[:BASED_ON_SAMPLE]->(em:ExtractionMetrics)
 *   (:DerivedRule)-[:SUPERSEDES]->(old:DerivedRule)
 */
class RuleDerivationService {

  // ── Derivation ─────────────────────────────────────────────────────────

  /**
   * Analyze ExtractionMetrics and derive new CANDIDATE rules.
   *
   * Algorithm:
   *   1. GROUP metrics BY (documentType, epistemicLayer)
   *   2. FOR each group with sampleSize >= minSampleSize:
   *      a. RANK methodologies by avg KQS DESC
   *      b. IF best methodology > overall group avg by MIN_KQS_IMPROVEMENT → create rule
   *   3. Skip groups where a matching ACTIVE rule already exists
   *
   * @returns {Promise<DerivedRule[]>} new CANDIDATE rules created this run
   */
  async deriveRules({ minSampleSize = DEFAULT_MIN_SAMPLE, minConfidence = DEFAULT_MIN_CONFIDENCE } = {}) {
    console.log(`${LOG} Deriving rules (minSample=${minSampleSize})`);

    // Get group statistics
    const groups = await mg().runQuery(
      `MATCH (m:ExtractionMetrics)
       WHERE m.kqsScore IS NOT NULL AND m.documentType IS NOT NULL
             AND m.methodologyId IS NOT NULL
       WITH m.documentType AS docType, m.epistemicLayer AS layer,
            m.methodologyId AS methId,
            avg(m.kqsScore) AS avgKqs,
            count(m) AS sampleSize
       WHERE sampleSize >= $min
       RETURN docType, layer, methId, avgKqs, sampleSize
       ORDER BY docType, layer, avgKqs DESC`,
      { min: minSampleSize }
    );

    // Group by (docType, layer) to find best methodology per group
    const profileMap = new Map();
    for (const row of groups) {
      const key = `${row.docType}||${row.layer || 'ANY'}`;
      if (!profileMap.has(key)) profileMap.set(key, []);
      profileMap.get(key).push({
        docType:    row.docType,
        layer:      row.layer || null,
        methId:     row.methId,
        avgKqs:     _f(row.avgKqs),
        sampleSize: _n(row.sampleSize),
      });
    }

    const created = [];

    for (const [key, candidates] of profileMap) {
      if (candidates.length < 2) continue; // need at least 2 methodologies to compare

      const best   = candidates[0];
      const second = candidates[1];

      const improvement = best.avgKqs - second.avgKqs;
      if (improvement < MIN_KQS_IMPROVEMENT) continue;

      const confidence = Math.min(1.0, improvement * 5 + (best.sampleSize >= 50 ? 0.2 : 0));
      if (confidence < minConfidence) continue;

      // Check if an ACTIVE rule already covers this profile
      const existing = await this.findMatchingRule({
        documentType:   best.docType,
        epistemicLayer: best.layer,
        statusFilter:   ['ACTIVE', 'CANDIDATE'],
      });
      if (existing) continue;

      const rule = await this._createRule({
        conditionDocTypes:    [best.docType],
        conditionLayers:      best.layer ? [best.layer] : [],
        recommendsMethodologyId: best.methId,
        confidence,
        sampleSize:           best.sampleSize,
        avgKqsWithRule:       best.avgKqs,
        avgKqsWithoutRule:    second.avgKqs,
        kqsImprovement:       improvement,
      });
      created.push(rule);
      console.log(`${LOG} Created CANDIDATE rule=${rule.id} docType=${best.docType} layer=${best.layer} improvement=${improvement.toFixed(3)}`);
    }

    console.log(`${LOG} Derived ${created.length} new CANDIDATE rules`);
    return created;
  }

  // ── Manual Review ───────────────────────────────────────────────────────

  async activateRule(ruleId, reviewedBy = 'system') {
    const ts = now();
    await mg().runQuery(
      `MATCH (r:DerivedRule {id: $id})
       SET r.status = 'ACTIVE', r.activatedAt = $ts, r.reviewedBy = $by, r.updatedAt = $ts`,
      { id: ruleId, ts, by: reviewedBy }
    );
    console.log(`${LOG} Activated rule=${ruleId} by=${reviewedBy}`);
    return this.getRule(ruleId);
  }

  async rejectRule(ruleId, reason = '', reviewedBy = 'system') {
    const ts = now();
    await mg().runQuery(
      `MATCH (r:DerivedRule {id: $id})
       SET r.status = 'REJECTED', r.rejectedAt = $ts, r.rejectionReason = $reason,
           r.reviewedBy = $by, r.updatedAt = $ts`,
      { id: ruleId, ts, reason, by: reviewedBy }
    );
    return this.getRule(ruleId);
  }

  // ── Query ───────────────────────────────────────────────────────────────

  async findMatchingRule({ documentType, epistemicLayer, statusFilter = ['ACTIVE'] } = {}) {
    const statusList = Array.isArray(statusFilter) ? statusFilter : [statusFilter];

    // Try exact match (docType + layer)
    if (documentType && epistemicLayer) {
      const rows = await mg().runQuery(
        `MATCH (r:DerivedRule)
         WHERE r.status IN $statuses
               AND $docType IN r.conditionDocTypes
               AND $layer IN r.conditionLayers
         RETURN r.id AS id ORDER BY r.confidence DESC LIMIT 1`,
        { statuses: statusList, docType: documentType, layer: epistemicLayer }
      );
      if (rows.length) return this.getRule(rows[0].id);
    }

    // Try docType only
    if (documentType) {
      const rows = await mg().runQuery(
        `MATCH (r:DerivedRule)
         WHERE r.status IN $statuses
               AND $docType IN r.conditionDocTypes
               AND size(r.conditionLayers) = 0
         RETURN r.id AS id ORDER BY r.confidence DESC LIMIT 1`,
        { statuses: statusList, docType: documentType }
      );
      if (rows.length) return this.getRule(rows[0].id);
    }

    return null;
  }

  async getRules({ status = null, limit = 50 } = {}) {
    const conds = [];
    const p = { limit };
    if (status) { conds.push('r.status = $status'); p.status = status; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await mg().runQuery(
      `MATCH (r:DerivedRule) ${where}
       OPTIONAL MATCH (r)-[:RECOMMENDS]->(m:Methodology)
       RETURN r.id AS id, r.status AS status, r.confidence AS confidence,
              r.sampleSize AS sampleSize, r.kqsImprovement AS kqsImprovement,
              r.conditionDocTypes AS docTypes, r.conditionLayers AS layers,
              r.avgKqsWithRule AS kqsWith, r.avgKqsWithoutRule AS kqsWithout,
              r.derivedAt AS derivedAt, r.activatedAt AS activatedAt,
              m.id AS methId, m.name AS methName
       ORDER BY r.derivedAt DESC LIMIT $limit`,
      p
    );
    return rows.map(r => ({
      id:              r.id,
      status:          r.status,
      confidence:      _f(r.confidence),
      sampleSize:      _n(r.sampleSize),
      kqsImprovement:  _f(r.kqsImprovement),
      conditionDocTypes: r.docTypes || [],
      conditionLayers:   r.layers  || [],
      avgKqsWithRule:    _f(r.kqsWith),
      avgKqsWithoutRule: _f(r.kqsWithout),
      derivedAt:         r.derivedAt,
      activatedAt:       r.activatedAt || null,
      recommendedMethodology: r.methId ? { id: r.methId, name: r.methName } : null,
    }));
  }

  async getRule(id) {
    const rows = await mg().runQuery(
      `MATCH (r:DerivedRule {id: $id})
       OPTIONAL MATCH (r)-[:RECOMMENDS]->(m:Methodology)
       RETURN r, m.id AS methId, m.name AS methName`,
      { id }
    );
    if (!rows.length) return null;
    const row = rows[0];
    const r   = row.r || {};
    return {
      id:                     r.id || id,
      status:                 r.status,
      confidence:             _f(r.confidence),
      sampleSize:             _n(r.sampleSize),
      kqsImprovement:         _f(r.kqsImprovement),
      conditionDocTypes:      r.conditionDocTypes || [],
      conditionLayers:        r.conditionLayers   || [],
      conditionSizeMin:       r.conditionSizeMin  || null,
      conditionSizeMax:       r.conditionSizeMax  || null,
      avgKqsWithRule:         _f(r.avgKqsWithRule),
      avgKqsWithoutRule:      _f(r.avgKqsWithoutRule),
      derivedAt:              r.derivedAt,
      activatedAt:            r.activatedAt  || null,
      rejectedAt:             r.rejectedAt   || null,
      rejectionReason:        r.rejectionReason || null,
      reviewedBy:             r.reviewedBy   || null,
      createdBy:              r.createdBy    || 'system',
      recommendsMethodologyId: row.methId || null,
      recommendedMethodology:  row.methId ? { id: row.methId, name: row.methName } : null,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  async _createRule({
    conditionDocTypes, conditionLayers, conditionDomains = [],
    conditionSizeMin = null, conditionSizeMax = null,
    recommendsMethodologyId,
    confidence, sampleSize,
    avgKqsWithRule, avgKqsWithoutRule, kqsImprovement,
    createdBy = 'system',
  }) {
    const id = uuidv4();
    const ts = now();
    await mg().runQuery(
      `CREATE (r:DerivedRule {
         id: $id,
         conditionDocTypes: $docTypes, conditionLayers: $layers,
         conditionDomains: $domains,
         conditionSizeMin: $sizeMin, conditionSizeMax: $sizeMax,
         confidence: $conf, sampleSize: $sample,
         avgKqsWithRule: $kqsWith, avgKqsWithoutRule: $kqsWithout,
         kqsImprovement: $kqsImp,
         status: 'CANDIDATE', derivedAt: $ts, createdAt: $ts,
         createdBy: $by
       })`,
      {
        id, docTypes: conditionDocTypes, layers: conditionLayers, domains: conditionDomains,
        sizeMin: conditionSizeMin, sizeMax: conditionSizeMax,
        conf: confidence, sample: sampleSize,
        kqsWith: avgKqsWithRule, kqsWithout: avgKqsWithoutRule, kqsImp: kqsImprovement,
        ts, by: createdBy,
      }
    );

    if (recommendsMethodologyId) {
      await mg().runQuery(
        `MATCH (r:DerivedRule {id: $rId}), (m:Methodology {id: $mId})
         CREATE (r)-[:RECOMMENDS]->(m)`,
        { rId: id, mId: recommendsMethodologyId }
      ).catch(() => {});
    }

    return this.getRule(id);
  }
}

const ruleDerivationService = new RuleDerivationService();
module.exports = { ruleDerivationService, RuleDerivationService };
