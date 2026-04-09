/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRADICTION EVALUATOR
 * Detects contradictions in AI Society voting and computes dynamic
 * escalation thresholds based on task criticality and risk.
 *
 * Threshold is computed per-vote by AI (when available) or via heuristic.
 * ContradictionRecords are stored in META namespace for APES learning.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const BASE_THRESHOLD = 0.3;
const CRITICALITY_WEIGHT = 0.4;
const RISK_WEIGHT = 0.3;

// Domain risk levels (fallback when AI evaluation unavailable)
const DOMAIN_RISK_MAP = {
  security: 0.9,
  legal: 0.85,
  compliance: 0.85,
  finance: 0.8,
  hr: 0.6,
  procurement: 0.7,
  it: 0.5,
  operations: 0.5,
  general: 0.3,
};

// ────────────────────────────────────────────────────────────────────────────
// CONTRADICTION EVALUATOR
// ────────────────────────────────────────────────────────────────────────────

class ContradictionEvaluator {
  /**
   * @param {object} [options]
   * @param {Function} [options.llmEvaluator] - Optional LLM-based evaluator function
   *   (taskContext) => { criticality, risk, reasoning }
   */
  constructor(options = {}) {
    this._llmEvaluator = options.llmEvaluator || null;
  }

  /**
   * Evaluate contradiction threshold for a vote.
   * Uses LLM evaluator when available, falls back to heuristic.
   *
   * @param {object} contract - AsyncSignalContract
   * @param {object} context - Task context for evaluation
   * @param {string} [context.taskDescription] - What the vote is about
   * @param {string} [context.domain] - Domain (security, finance, etc.)
   * @param {string[]} [context.domainTags] - Multiple domain tags
   * @param {boolean} [context.reversible] - Is the decision reversible
   * @param {number} [context.affectedStakeholders] - Number of affected people
   * @returns {Promise<{ threshold: number, criticality: number, risk: number, reasoning: string, method: string }>}
   */
  async evaluate(contract, context = {}) {
    // Try LLM evaluation first
    if (this._llmEvaluator) {
      try {
        const llmResult = await this._llmEvaluator({
          contract: contract.toJSON ? contract.toJSON() : contract,
          context,
        });
        const threshold = this._computeThreshold(llmResult.criticality, llmResult.risk);
        return {
          threshold,
          criticality: llmResult.criticality,
          risk: llmResult.risk,
          reasoning: llmResult.reasoning,
          method: 'LLM',
        };
      } catch (e) {
        // Fall through to heuristic
      }
    }

    // Heuristic fallback
    return this.evaluateHeuristic(contract, context);
  }

  /**
   * Heuristic-based threshold evaluation (no LLM required).
   *
   * @param {object} contract - AsyncSignalContract
   * @param {object} context - Task context
   * @returns {{ threshold: number, criticality: number, risk: number, reasoning: string, method: string }}
   */
  evaluateHeuristic(contract, context = {}) {
    // Criticality from domain
    const domainRisk = this._getDomainRisk(context.domain, context.domainTags);
    const reversibilityFactor = context.reversible === false ? 0.3 : 0.0;
    const stakeholderFactor = Math.min((context.affectedStakeholders || 0) / 100, 0.2);

    const criticality = Math.min(1.0, domainRisk + reversibilityFactor + stakeholderFactor);

    // Risk from vote configuration
    const hasAI = contract.hasAIParticipants ? contract.hasAIParticipants() : false;
    const participantCount = contract.resolutionPolicy?.participants?.length || 0;
    const aiRiskBonus = hasAI ? 0.15 : 0.0;
    const participantDiversity = Math.min(participantCount / 10, 0.2);

    const risk = Math.min(1.0, 0.3 + aiRiskBonus + participantDiversity);

    const threshold = this._computeThreshold(criticality, risk);

    const reasoning = `Heuristic: domain_risk=${domainRisk.toFixed(2)}, ` +
      `reversible=${context.reversible !== false}, ` +
      `stakeholders=${context.affectedStakeholders || 0}, ` +
      `has_ai=${hasAI}, participants=${participantCount} → ` +
      `criticality=${criticality.toFixed(2)}, risk=${risk.toFixed(2)}, threshold=${threshold.toFixed(2)}`;

    return { threshold, criticality, risk, reasoning, method: 'HEURISTIC' };
  }

  /**
   * Detect contradiction in a set of votes.
   *
   * @param {object[]} votes - Recorded votes with { vote, confidence? }
   * @param {number} threshold - Escalation threshold (0.0-1.0)
   * @returns {{ detected: boolean, score: number, reason: string }}
   */
  detectContradiction(votes, threshold) {
    if (votes.length < 2) {
      return { detected: false, score: 0, reason: 'INSUFFICIENT_VOTES' };
    }

    // Count unique vote values
    const voteGroups = {};
    for (const v of votes) {
      const key = String(v.vote);
      if (!voteGroups[key]) voteGroups[key] = [];
      voteGroups[key].push(v);
    }

    const groupKeys = Object.keys(voteGroups);
    if (groupKeys.length < 2) {
      return { detected: false, score: 0, reason: 'UNANIMOUS' };
    }

    // Compute contradiction score
    // Based on: vote split × average confidence of opposing sides
    const sorted = groupKeys.map(k => ({
      option: k,
      count: voteGroups[k].length,
      avgConfidence: this._avgConfidence(voteGroups[k]),
    })).sort((a, b) => b.count - a.count);

    const majorityCount = sorted[0].count;
    const minorityCount = votes.length - majorityCount;
    const splitRatio = minorityCount / votes.length; // 0 = unanimous, 0.5 = even split

    // High confidence on both sides increases contradiction score
    const majorityConf = sorted[0].avgConfidence;
    const minorityConf = sorted.slice(1).reduce((sum, g) =>
      sum + g.avgConfidence * g.count, 0) / minorityCount;

    const confidenceFactor = (majorityConf + minorityConf) / 2;
    const score = splitRatio * confidenceFactor;

    const detected = score >= threshold;
    const reason = detected
      ? `CONTRADICTION: split=${splitRatio.toFixed(2)}, confidence=${confidenceFactor.toFixed(2)}, score=${score.toFixed(2)} >= threshold=${threshold.toFixed(2)}`
      : `NO_CONTRADICTION: score=${score.toFixed(2)} < threshold=${threshold.toFixed(2)}`;

    return { detected, score, reason };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ══════════════════════════════════════════════════════════════════════════

  _computeThreshold(criticality, risk) {
    return Math.min(1.0, Math.max(0.0,
      BASE_THRESHOLD + (criticality * CRITICALITY_WEIGHT) + (risk * RISK_WEIGHT)
    ));
  }

  _getDomainRisk(domain, domainTags) {
    if (domain && DOMAIN_RISK_MAP[domain.toLowerCase()]) {
      return DOMAIN_RISK_MAP[domain.toLowerCase()];
    }
    if (domainTags && domainTags.length > 0) {
      const risks = domainTags
        .map(t => DOMAIN_RISK_MAP[t.toLowerCase()] || DOMAIN_RISK_MAP.general)
        .sort((a, b) => b - a);
      return risks[0]; // Use highest risk domain
    }
    return DOMAIN_RISK_MAP.general;
  }

  _avgConfidence(votes) {
    const withConf = votes.filter(v => typeof v.confidence === 'number');
    if (withConf.length === 0) return 0.5; // Default confidence when not specified
    return withConf.reduce((s, v) => s + v.confidence, 0) / withConf.length;
  }
}

module.exports = { ContradictionEvaluator, DOMAIN_RISK_MAP };
