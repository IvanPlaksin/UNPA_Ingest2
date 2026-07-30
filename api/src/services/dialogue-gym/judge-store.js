'use strict';

/**
 * JudgeStore — persistence for JudgeRecord nodes (P2).
 * DI shape mirrors arena-store: Memgraph-backed default, injectable fake in tests.
 *
 * @module services/dialogue-gym/judge-store
 */

const JUDGE_LABEL = 'JudgeRecord';
const RUN_LABEL = 'ArenaRun';

const num = (v, d = null) => (typeof v === 'number' ? v : (v == null ? d : (Number.isNaN(Number(v)) ? d : Number(v))));

function recordFromNode(n) {
  if (!n) return null;
  return {
    judgeId: n.judgeId,
    runId: n.runId,
    intentAccuracy: n.intentAccuracy ?? null,
    intentAccuracyScore: num(n.intentAccuracyScore),
    turnsToIdentify: n.turnsToIdentify == null ? null : num(n.turnsToIdentify),
    clarificationEfficiencyScore: num(n.clarificationEfficiencyScore, 0),
    groundingScore: num(n.groundingScore),
    groundingNotes: n.groundingNotes ?? null,
    toneScore: num(n.toneScore),
    toneNotes: n.toneNotes ?? null,
    controlsCorrectnessScore: num(n.controlsCorrectnessScore),
    controlsCorrectnessNotes: n.controlsCorrectnessNotes ?? null,
    helpfulnessScore: num(n.helpfulnessScore),
    helpfulnessNotes: n.helpfulnessNotes ?? null,
    overallScore: num(n.overallScore, 0),
    overallVerdict: n.overallVerdict ?? null,
    summaryNotes: n.summaryNotes ?? null,
    judgedAt: n.judgedAt,
    judgeModel: n.judgeModel,
    judgePromptVersion: n.judgePromptVersion || 'v1',
    llmTokens: num(n.llmTokens, 0),
    llmCostUsd: num(n.llmCostUsd, 0),
    namespace: n.namespace || 'CORE',
  };
}

function memgraphJudgeStore() {
  let _mg = null;
  const mg = () => (_mg || (_mg = require('../memgraph.service')));
  const rows = (res) => (Array.isArray(res) ? res : []);
  const props = (r, k) => rows(r).map((x) => (x[k] && x[k].properties) || x[k]).filter(Boolean);

  return {
    async ensureIndexes() {
      const stmts = [
        `CREATE CONSTRAINT ON (j:${JUDGE_LABEL}) ASSERT j.judgeId IS UNIQUE`,
        `CREATE INDEX ON :${JUDGE_LABEL}(runId)`,
        `CREATE INDEX ON :${JUDGE_LABEL}(overallVerdict)`,
      ];
      for (const s of stmts) { try { await mg().runQuery(s); } catch { /* ignore */ } }
    },
    async saveJudgeRecord(node) {
      const clean = { ...node };
      Object.keys(clean).forEach((k) => clean[k] == null && delete clean[k]);
      await mg().runQuery(
        `MERGE (j:${JUDGE_LABEL} {judgeId: $judgeId}) SET j += $node
         WITH j
         OPTIONAL MATCH (r:${RUN_LABEL} {runId: $node.runId})
         FOREACH (_ IN CASE WHEN r IS NULL THEN [] ELSE [1] END | MERGE (j)-[:JUDGES]->(r))
         RETURN j`,
        { judgeId: node.judgeId, node: clean }
      );
      return node;
    },
    async getJudgeRecord(judgeId) {
      return props(await mg().runQuery(`MATCH (j:${JUDGE_LABEL} {judgeId: $judgeId}) RETURN j`, { judgeId }), 'j')[0] || null;
    },
    async getJudgeRecordsForRun(runId) {
      return props(await mg().runQuery(`MATCH (j:${JUDGE_LABEL} {runId: $runId}) RETURN j ORDER BY j.judgedAt DESC`, { runId }), 'j');
    },
    async listJudgeRecords() {
      return props(await mg().runQuery(`MATCH (j:${JUDGE_LABEL}) RETURN j`), 'j');
    },
  };
}

module.exports = { memgraphJudgeStore, recordFromNode, JUDGE_LABEL };
