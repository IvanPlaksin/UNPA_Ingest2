'use strict';

/**
 * ComparisonService (ШАГ 7A) — compare prompt candidates and maintain a Pareto
 * frontier over the optimization objectives. Pure functions + a metrics
 * aggregator that reads the candidate's arena runs' judge records.
 *
 * Objectives (higher = better): intentAccuracyRate (deterministic vs ratified
 * ground truth) and aggregateScore (mean judge overallScore). Multi-objective on
 * purpose — protects against a rise in intent accuracy bought by wrecking tone.
 *
 * @module services/dialogue-gym/comparison.service
 */

const METRICS = ['intentAccuracyRate', 'aggregateScore'];

const val = (c, m) => (typeof c[m] === 'number' ? c[m] : -Infinity);

/** Does a dominate b? (no worse on every metric, strictly better on ≥1). */
function dominates(a, b) {
  let strictlyBetter = false;
  for (const m of METRICS) {
    if (val(a, m) < val(b, m)) return false;
    if (val(a, m) > val(b, m)) strictlyBetter = true;
  }
  return strictlyBetter;
}

/** Candidates NOT dominated by any other → the Pareto frontier. */
function computeParetoFrontier(candidates) {
  const list = candidates || [];
  return list.filter((c) => !list.some((o) => o !== c && dominates(o, c)));
}

/** Assign paretoRank (0 = frontier, 1 = frontier of the rest, …). */
function assignParetoRanks(candidates) {
  const remaining = [...(candidates || [])];
  const ranked = new Map();
  let rank = 0;
  while (remaining.length) {
    const frontier = computeParetoFrontier(remaining);
    if (!frontier.length) break;
    for (const c of frontier) ranked.set(c, rank);
    for (const c of frontier) remaining.splice(remaining.indexOf(c), 1);
    rank += 1;
  }
  return (candidates || []).map((c) => ({ ...c, paretoRank: ranked.has(c) ? ranked.get(c) : null }));
}

/** Head-to-head comparison of two candidates across metrics. */
function compareCandidates(c1, c2) {
  const per = {};
  for (const m of METRICS) {
    const a = val(c1, m); const b = val(c2, m);
    per[m] = { c1: c1[m] ?? null, c2: c2[m] ?? null, delta: (a === -Infinity || b === -Infinity) ? null : a - b, winner: a === b ? 0 : (a > b ? 1 : 2) };
  }
  return {
    candidate1Id: c1.candidateId, candidate2Id: c2.candidateId,
    metrics: per,
    c1DominatesC2: dominates(c1, c2),
    c2DominatesC1: dominates(c2, c1),
  };
}

function createComparisonService(deps = {}) {
  const judge = deps.judge || require('./judge.service');
  const arena = deps.arena || require('./arena-runner.service');

  /**
   * Aggregate a candidate's arena runs into its metrics, using the LATEST
   * (non-human, non-deterministic-only) judge record per run.
   * @param {object} candidate {arenaRunIds:[...]}
   * @returns {{ aggregateScore, intentAccuracyRate, n }}
   */
  async function aggregateCandidateMetrics(candidate) {
    const runIds = (candidate && candidate.arenaRunIds) || [];
    const records = [];
    for (const runId of runIds) {
      let recs = [];
      try { recs = await judge.getRecordsForRun(runId); } catch { recs = []; }
      const pick = recs
        .filter((r) => r.judgeModel !== 'deterministic-only' && !String(r.judgeModel || '').startsWith('human:'))
        .sort((a, b) => String(b.judgedAt).localeCompare(String(a.judgedAt)))[0] || recs[0];
      if (pick) records.push(pick);
    }
    if (!records.length) return { aggregateScore: null, intentAccuracyRate: null, n: 0 };
    const aggregateScore = records.reduce((s, r) => s + (r.overallScore || 0), 0) / records.length;
    const intentAccuracyRate = records.filter((r) => r.intentAccuracy === 'correct').length / records.length;
    return { aggregateScore, intentAccuracyRate, n: records.length };
  }

  return { dominates, computeParetoFrontier, assignParetoRanks, compareCandidates, aggregateCandidateMetrics, METRICS };
}

const singleton = createComparisonService();
module.exports = singleton;
module.exports.createComparisonService = createComparisonService;
module.exports.dominates = dominates;
module.exports.computeParetoFrontier = computeParetoFrontier;
module.exports.assignParetoRanks = assignParetoRanks;
module.exports.compareCandidates = compareCandidates;
module.exports.METRICS = METRICS;
