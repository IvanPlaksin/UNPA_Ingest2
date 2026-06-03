'use strict';
/**
 * KQSService — Knowledge Quality Score
 *
 * KQS = 0.35×NormativeWeight + 0.30×EmpiricalCertainty + 0.20×TemporalCurrency + 0.15×SourceAuthority
 *
 * Components:
 *   NormativeWeight  — epistemic authority of the source layer (0.0 L4 → 1.0 L0)
 *   EmpiricalCertainty — presence and quality of L4 empirical validation in triangle
 *   TemporalCurrency — recency of knowledge relative to layer volatility (exponential decay)
 *   SourceAuthority  — Admiralty code-based reliability, defaults to layer-based value
 */

const { computeEffectiveWeight, DECAY_RATES } = require('./tier1/confidence-decay.service');
const { knowledgeTriangleService } = require('./knowledge-triangle.service');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

// ─── Constants ────────────────────────────────────────────────────────────────

const KQS_WEIGHTS = {
  normativeWeight:    0.35,
  empiricalCertainty: 0.30,
  temporalCurrency:   0.20,
  sourceAuthority:    0.15
};

// Epistemic layer → decay rate for TemporalCurrency
const LAYER_DECAY_RATE = {
  L0: 'STABLE',  // Constitutional — never decays
  L1: 'SLOW',    // Regulatory — ~10% per year
  L2: 'MEDIUM',  // Administrative — ~30% per year
  L3: 'MEDIUM',  // Operational — ~30% per year
  L4: 'FAST',    // Empirical — ~95% per year (findings become stale quickly)
  L5: 'SLOW'     // Strategic — ~10% per year
};

// Default normative weights by layer (mirrors DocumentType.normativeWeight)
const LAYER_NORMATIVE_DEFAULTS = {
  L0: 1.00,
  L1: 0.85,
  L2: 0.63,  // midpoint of 0.55-0.70
  L3: 0.40,
  L4: 0.00,
  L5: 0.25
};

// Default Admiralty-equivalent source authority by layer
// UN official documents map to specific Admiralty codes:
//   L0 (UN Charter, GA Res) → A1 = sqrt(1.0×1.0) = 1.0
//   L1 (ST/SGB) → A2 = sqrt(1.0×0.8) = 0.894
//   L2 (ST/AI, ST/IC) → B2 = sqrt(0.8×0.8) = 0.8
//   L3 (SOP, Manual) → B3 = sqrt(0.8×0.6) = 0.693
//   L4 (OIOS, JIU, BOA) → A2 = sqrt(1.0×0.8) = 0.894 (audited = reliable source)
//   L5 (SG reports) → B3 = sqrt(0.8×0.6) = 0.693
const LAYER_AUTHORITY_DEFAULTS = {
  L0: 1.000,
  L1: 0.894,
  L2: 0.800,
  L3: 0.693,
  L4: 0.894,
  L5: 0.693
};

// Gap severity penalty for EmpiricalCertainty
const GAP_SEVERITY_PENALTY = {
  HIGH:   0.30,
  MEDIUM: 0.15,
  LOW:    0.05
};

// ─── KQSService ───────────────────────────────────────────────────────────────

class KQSService {

  // ─── Component calculators (synchronous where possible) ────────────────────

  /**
   * NormativeWeight component.
   * Uses node.normativeWeight if set, else looks up by layer.
   */
  calculateNormativeWeight(entity) {
    if (entity.normativeWeight !== undefined && entity.normativeWeight !== null) {
      return Math.min(1, Math.max(0, Number(entity.normativeWeight)));
    }
    const layer = entity.epistemicLayer || entity.layer;
    return LAYER_NORMATIVE_DEFAULTS[layer] ?? 0.0;
  }

  /**
   * TemporalCurrency component.
   * Applies exponential decay based on layer's volatility and document age.
   * Reuses computeEffectiveWeight() from confidence-decay.service.js.
   */
  calculateTemporalCurrency(entity, layer = null) {
    const l = layer || entity.epistemicLayer || entity.layer || 'L3';
    const decayRate = LAYER_DECAY_RATE[l] || 'MEDIUM';
    const lastUpdated = entity.updatedAt || entity.updated_at || entity.createdAt || entity.created_at;
    // computeEffectiveWeight returns: weightOriginal × exp(-λ × ageDays)
    // We use 1.0 as weightOriginal since we just want the temporal factor
    return Math.min(1, Math.max(0, computeEffectiveWeight(1.0, decayRate, lastUpdated)));
  }

  /**
   * SourceAuthority component.
   * Uses node.admiralty_weight if set (already a 0-1 score).
   * Falls back to layer-based default.
   */
  calculateSourceAuthority(entity, layer = null) {
    if (entity.admiralty_weight !== undefined && entity.admiralty_weight !== null) {
      return Math.min(1, Math.max(0, Number(entity.admiralty_weight)));
    }
    const l = layer || entity.epistemicLayer || entity.layer || 'L3';
    return LAYER_AUTHORITY_DEFAULTS[l] ?? 0.5;
  }

  /**
   * EmpiricalCertainty component.
   * Based on Knowledge Triangle: whether L4 validation exists and how many open gaps.
   * Requires an async call to KnowledgeTriangleService.
   */
  async calculateEmpiricalCertainty(processId) {
    if (!processId) return 0.0;
    try {
      const [triangle, openGaps] = await Promise.all([
        knowledgeTriangleService.getTriangleForProcess(processId),
        knowledgeTriangleService.getOpenGaps(processId)
      ]);

      // No empirical evidence at all → 0.0
      if (!triangle.empirical || triangle.empirical.length === 0) return 0.0;

      // Calculate penalty from open gaps
      const penalty = openGaps.reduce((sum, gap) => {
        return sum + (GAP_SEVERITY_PENALTY[gap.severity] || GAP_SEVERITY_PENALTY.MEDIUM);
      }, 0);

      return Math.max(0, 1.0 - penalty);
    } catch {
      return 0.0;
    }
  }

  // ─── Main KQS calculation ──────────────────────────────────────────────────

  /**
   * Calculate KQS for a KnowledgeNode entity.
   *
   * @param {Object} entity - node with at least { id, epistemicLayer } properties
   * @param {Object} options - { processId: string } for EmpiricalCertainty lookup
   * @returns {{ kqs, components, weights, layer, calculatedAt }}
   */
  async calculateKQS(entity, options = {}) {
    const layer = entity.epistemicLayer || entity.layer || 'L3';
    const processId = options.processId || entity.id;

    const [normativeWeight, empiricalCertainty, temporalCurrency, sourceAuthority] =
      await Promise.all([
        Promise.resolve(this.calculateNormativeWeight(entity)),
        this.calculateEmpiricalCertainty(processId),
        Promise.resolve(this.calculateTemporalCurrency(entity, layer)),
        Promise.resolve(this.calculateSourceAuthority(entity, layer))
      ]);

    const kqs =
      KQS_WEIGHTS.normativeWeight    * normativeWeight    +
      KQS_WEIGHTS.empiricalCertainty * empiricalCertainty +
      KQS_WEIGHTS.temporalCurrency   * temporalCurrency   +
      KQS_WEIGHTS.sourceAuthority    * sourceAuthority;

    const components = {
      normativeWeight:    { value: round3(normativeWeight),    weighted: round3(KQS_WEIGHTS.normativeWeight    * normativeWeight) },
      empiricalCertainty: { value: round3(empiricalCertainty), weighted: round3(KQS_WEIGHTS.empiricalCertainty * empiricalCertainty) },
      temporalCurrency:   { value: round3(temporalCurrency),   weighted: round3(KQS_WEIGHTS.temporalCurrency   * temporalCurrency) },
      sourceAuthority:    { value: round3(sourceAuthority),    weighted: round3(KQS_WEIGHTS.sourceAuthority    * sourceAuthority) }
    };

    return {
      entityId: entity.id,
      kqs: round3(kqs),
      components,
      weights: KQS_WEIGHTS,
      layer,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Calculate KQS for a node fetched from Memgraph by ID.
   * Persists kqs_score property on the node if persist=true (default: true).
   */
  async calculateKQSById(nodeId, options = {}) {
    const entity = await this._fetchNode(nodeId);
    const result = await this.calculateKQS(entity, options);
    if (options.persist !== false) {
      await this._persistKQS(nodeId, result.kqs);
    }
    return result;
  }

  /**
   * Calculate KQS for multiple nodes in parallel.
   * Returns array of results; failures return { entityId, error }.
   */
  async calculateKQSBatch(nodeIds, options = {}) {
    const results = await Promise.allSettled(
      nodeIds.map(id => this.calculateKQSById(id, options))
    );
    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { entityId: nodeIds[i], error: r.reason?.message || 'calculation failed' };
    });
  }

  /**
   * Find nodes with KQS below threshold (stale/low-quality knowledge).
   */
  async findLowKQSNodes({ namespace, layer, threshold = 0.3, limit = 50 } = {}) {
    let cypher = `MATCH (n:KnowledgeNode) WHERE n.kqs_score < $threshold`;
    if (namespace) cypher += ` AND n.namespace = $ns`;
    if (layer)     cypher += ` AND n.epistemicLayer = $layer`;
    cypher += ` RETURN n.id as id, n.content as content, n.epistemicLayer as epistemicLayer,
                       n.kqs_score as kqs_score, n.documentType as documentType
                ORDER BY n.kqs_score ASC LIMIT $limit`;

    return mg().runQuery(cypher, {
      threshold,
      ns:    namespace || null,
      layer: layer     || null,
      limit: require('neo4j-driver').int(limit)
    });
  }

  /**
   * Rank KnowledgeNodes by KQS score.
   */
  async getRankedNodes({ namespace, layer, minKQS = 0, limit = 50 } = {}) {
    let cypher = `MATCH (n:KnowledgeNode) WHERE n.kqs_score IS NOT NULL AND n.kqs_score >= $minKQS`;
    if (namespace) cypher += ` AND n.namespace = $ns`;
    if (layer)     cypher += ` AND n.epistemicLayer = $layer`;
    cypher += ` RETURN n.id as id, n.content as content, n.epistemicLayer as epistemicLayer,
                       n.kqs_score as kqs_score, n.documentType as documentType
                ORDER BY n.kqs_score DESC LIMIT $limit`;

    return mg().runQuery(cypher, {
      minKQS,
      ns:    namespace || null,
      layer: layer     || null,
      limit: require('neo4j-driver').int(limit)
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  async _fetchNode(nodeId) {
    const result = await mg().runQuery(
      `MATCH (n:KnowledgeNode {id: $id})
       RETURN n.id as id, n.epistemicLayer as epistemicLayer, n.layer as layer,
              n.normativeWeight as normativeWeight,
              n.admiralty_weight as admiralty_weight,
              n.updatedAt as updatedAt, n.createdAt as createdAt,
              n.documentType as documentType, n.content as content`,
      { id: nodeId }
    );
    if (!result.length) throw new Error(`KnowledgeNode not found: ${nodeId}`);
    return result[0];
  }

  async _persistKQS(nodeId, kqs) {
    await mg().runQuery(
      `MATCH (n:KnowledgeNode {id: $id})
       SET n.kqs_score = $kqs, n.kqs_calculated_at = $now`,
      { id: nodeId, kqs, now: new Date().toISOString() }
    );
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

const kqsService = new KQSService();
module.exports = {
  kqsService,
  KQSService,
  KQS_WEIGHTS,
  LAYER_DECAY_RATE,
  LAYER_NORMATIVE_DEFAULTS,
  LAYER_AUTHORITY_DEFAULTS,
  GAP_SEVERITY_PENALTY
};
