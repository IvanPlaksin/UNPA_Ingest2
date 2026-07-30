'use strict';

/**
 * ArenaStore — persistence for arena runs/turns (ArenaRun, ArenaTurn).
 *
 * Same DI shape as dialogue-gym.service's repo: the default is Memgraph-backed
 * (shared platform driver); tests inject an in-memory fake. JSON-shaped fields
 * are stored as *Json strings and parsed on read.
 *
 * @module services/dialogue-gym/arena-store
 */

const RUN_LABEL = 'ArenaRun';
const TURN_LABEL = 'ArenaTurn';
const PERSONA_LABEL = 'DialogueGymPersona';
const SCENARIO_LABEL = 'DialogueGymScenario';

const jsonParse = (s) => { if (s == null || s === '') return null; try { return JSON.parse(s); } catch { return null; } };

function runFromNode(n) {
  if (!n) return null;
  return {
    runId: n.runId,
    personaId: n.personaId,
    scenarioId: n.scenarioId,
    promptVersionId: n.promptVersionId ?? null,
    promptLabel: n.promptLabel || 'production',
    promptSource: n.promptSource || 'production',
    promptEntryId: n.promptEntryId ?? null,
    promptVersionNumber: n.promptVersionNumber == null ? null : (typeof n.promptVersionNumber === 'number' ? n.promptVersionNumber : parseInt(n.promptVersionNumber, 10)),
    startedAt: n.startedAt,
    completedAt: n.completedAt ?? null,
    status: n.status,
    terminalCondition: n.terminalCondition ?? null,
    turnsCount: typeof n.turnsCount === 'number' ? n.turnsCount : parseInt(n.turnsCount, 10) || 0,
    serviceIdentified: n.serviceIdentified ?? null,
    identifiedServiceCode: n.identifiedServiceCode ?? null,
    expectedServiceCode: n.expectedServiceCode ?? null,
    slotsCollected: Array.isArray(n.slotsCollected) ? n.slotsCollected : [],
    controlsShown: Array.isArray(n.controlsShown) ? n.controlsShown : [],
    judgeScores: jsonParse(n.judgeScoresJson),
    judgeVerdict: n.judgeVerdict ?? null,
    errorMessage: n.errorMessage ?? null,
    llmCostUsd: typeof n.llmCostUsd === 'number' ? n.llmCostUsd : parseFloat(n.llmCostUsd) || 0,
    totalTokens: typeof n.totalTokens === 'number' ? n.totalTokens : parseInt(n.totalTokens, 10) || 0,
    namespace: n.namespace || 'CORE',
    // Archived runs are excluded from the human-labeling / calibration path
    // (e.g. superseded by a re-run after a bug fix) without being deleted.
    archived: Boolean(n.archived),
  };
}

function turnFromNode(n) {
  if (!n) return null;
  return {
    turnId: n.turnId,
    runId: n.runId,
    turnIndex: typeof n.turnIndex === 'number' ? n.turnIndex : parseInt(n.turnIndex, 10) || 0,
    userMessage: n.userMessage || '',
    agentResponse: n.agentResponse || '',
    userMessageRu: n.userMessageRu ?? null,
    agentResponseRu: n.agentResponseRu ?? null,
    route: n.route ?? null,
    identifiedService: n.identifiedService ?? null,
    askingSlot: n.askingSlot ?? null,
    slotsFilled: jsonParse(n.slotsFilledJson),
    controls: jsonParse(n.controlsJson),
    isComplete: Boolean(n.isComplete),
    personaReasoning: n.personaReasoning ?? null,
    personaSignal: n.personaSignal ?? null,
    personaPatience: n.personaPatience ?? null,
    startedAt: n.startedAt,
    agentLatencyMs: n.agentLatencyMs ?? 0,
    personaLatencyMs: n.personaLatencyMs ?? 0,
    agentTokens: n.agentTokens ?? 0,
    personaTokens: n.personaTokens ?? 0,
  };
}

// ── default Memgraph-backed store ──────────────────────────────────────────────
function memgraphArenaStore() {
  let _mg = null;
  const mg = () => (_mg || (_mg = require('../memgraph.service')));
  const rows = (res) => (Array.isArray(res) ? res : []);
  const props = (r, k) => rows(r).map((x) => (x[k] && x[k].properties) || x[k]).filter(Boolean);

  return {
    async ensureIndexes() {
      const stmts = [
        `CREATE CONSTRAINT ON (r:${RUN_LABEL}) ASSERT r.runId IS UNIQUE`,
        `CREATE CONSTRAINT ON (t:${TURN_LABEL}) ASSERT t.turnId IS UNIQUE`,
        `CREATE INDEX ON :${RUN_LABEL}(scenarioId)`,
        `CREATE INDEX ON :${RUN_LABEL}(status)`,
        `CREATE INDEX ON :${TURN_LABEL}(runId)`,
      ];
      for (const s of stmts) { try { await mg().runQuery(s); } catch { /* ignore */ } }
    },
    async createRun(node) {
      await mg().runQuery(
        `MERGE (r:${RUN_LABEL} {runId: $runId}) SET r += $node
         WITH r
         OPTIONAL MATCH (p:${PERSONA_LABEL} {personaId: $node.personaId})
         OPTIONAL MATCH (s:${SCENARIO_LABEL} {scenarioId: $node.scenarioId})
         FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (r)-[:USES_PERSONA]->(p))
         FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END | MERGE (r)-[:RUNS_SCENARIO]->(s))
         RETURN r`,
        { runId: node.runId, node }
      );
      return node;
    },
    async appendTurn(node) {
      await mg().runQuery(
        `MATCH (r:${RUN_LABEL} {runId: $runId})
         CREATE (t:${TURN_LABEL}) SET t += $node
         MERGE (r)-[rel:HAS_TURN]->(t) SET rel.turnIndex = $node.turnIndex
         RETURN t`,
        { runId: node.runId, node }
      );
      return node;
    },
    async finalizeRun(runId, patch) {
      await mg().runQuery(
        `MATCH (r:${RUN_LABEL} {runId: $runId}) SET r += $patch RETURN r`,
        { runId, patch }
      );
    },
    async getRun(runId) {
      return props(await mg().runQuery(`MATCH (r:${RUN_LABEL} {runId: $runId}) RETURN r`, { runId }), 'r')[0] || null;
    },
    async listRuns() {
      return props(await mg().runQuery(`MATCH (r:${RUN_LABEL}) RETURN r`), 'r');
    },
    async getTurns(runId) {
      const r = await mg().runQuery(
        `MATCH (r:${RUN_LABEL} {runId: $runId})-[:HAS_TURN]->(t:${TURN_LABEL}) RETURN t ORDER BY t.turnIndex`,
        { runId }
      );
      return props(r, 't');
    },
    async setTurnTranslation(turnId, { userMessageRu, agentResponseRu }) {
      await mg().runQuery(
        `MATCH (t:${TURN_LABEL} {turnId: $turnId}) SET t.userMessageRu = $u, t.agentResponseRu = $a RETURN t`,
        { turnId, u: userMessageRu || '', a: agentResponseRu || '' }
      );
    },
  };
}

module.exports = { memgraphArenaStore, runFromNode, turnFromNode, RUN_LABEL, TURN_LABEL };
