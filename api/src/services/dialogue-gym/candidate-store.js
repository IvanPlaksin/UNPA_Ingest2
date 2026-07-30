'use strict';

/**
 * CandidateStore (ШАГ 7A) — persistence for OptimizationRun + PromptCandidate
 * (the GEPA loop's bookkeeping). Same DI shape as arena-store: Memgraph-backed
 * default (shared platform driver), injectable fake in tests. JSON-shaped fields
 * (promptGraph, mutations, arenaRunIds, scenario/persona id lists) are stored as
 * *Json strings and parsed on read.
 *
 * @module services/dialogue-gym/candidate-store
 */

const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const OPT_LABEL = 'OptimizationRun';
const CAND_LABEL = 'PromptCandidate';

const jparse = (s, d = null) => { if (s == null || s === '') return d; try { return JSON.parse(s); } catch { return d; } };
const num = (v) => (typeof v === 'number' ? v : (v == null ? null : (Number.isNaN(Number(v)) ? null : Number(v))));

function optFromNode(n) {
  if (!n) return null;
  return {
    optimizationId: n.optimizationId,
    name: n.name || null,
    status: n.status || 'running',
    basePromptEntryId: n.basePromptEntryId ?? null,
    basePromptVersion: num(n.basePromptVersion),
    maxIterations: num(n.maxIterations) ?? 0,
    scenarioIds: jparse(n.scenarioIdsJson, []),
    personaIds: jparse(n.personaIdsJson, []),
    currentIteration: num(n.currentIteration) ?? 0,
    candidatesEvaluated: num(n.candidatesEvaluated) ?? 0,
    bestScore: num(n.bestScore),
    bestCandidateId: n.bestCandidateId ?? null,
    startedAt: n.startedAt, completedAt: n.completedAt ?? null,
    totalCostUsd: num(n.totalCostUsd) ?? 0,
    improvementPercent: num(n.improvementPercent),
    recommendedCandidateId: n.recommendedCandidateId ?? null,
    governanceStatus: n.governanceStatus ?? null,
  };
}

function candFromNode(n) {
  if (!n) return null;
  return {
    candidateId: n.candidateId,
    optimizationId: n.optimizationId,
    iteration: num(n.iteration) ?? 0,
    promptGraph: jparse(n.promptGraphJson, { nodes: [], edges: [] }),
    mutations: jparse(n.mutationsJson, null),
    parentCandidateId: n.parentCandidateId ?? null,
    promptEntryId: n.promptEntryId ?? null,
    arenaRunIds: jparse(n.arenaRunIdsJson, []),
    aggregateScore: num(n.aggregateScore),
    intentAccuracyRate: num(n.intentAccuracyRate),
    paretoRank: n.paretoRank == null ? null : num(n.paretoRank),
    reflectionNotes: n.reflectionNotes ?? null,
    savedAsVersion: n.savedAsVersion == null ? null : num(n.savedAsVersion),
    governanceStatus: n.governanceStatus ?? null,
    createdAt: n.createdAt, evaluatedAt: n.evaluatedAt ?? null,
  };
}

function memgraphCandidateStore() {
  let _mg = null;
  const mg = () => (_mg || (_mg = require('../memgraph.service')));
  const rows = (res) => (Array.isArray(res) ? res : []);
  const props = (r, k) => rows(r).map((x) => (x[k] && x[k].properties) || x[k]).filter(Boolean);

  return {
    async ensureIndexes() {
      const stmts = [
        `CREATE CONSTRAINT ON (o:${OPT_LABEL}) ASSERT o.optimizationId IS UNIQUE`,
        `CREATE CONSTRAINT ON (c:${CAND_LABEL}) ASSERT c.candidateId IS UNIQUE`,
        `CREATE INDEX ON :${CAND_LABEL}(optimizationId)`,
      ];
      for (const s of stmts) { try { await mg().runQuery(s); } catch { /* ignore */ } }
    },
    async saveOpt(node) {
      await mg().runQuery(`MERGE (o:${OPT_LABEL} {optimizationId:$id}) SET o += $node RETURN o`, { id: node.optimizationId, node });
      return node;
    },
    async getOpt(id) { return props(await mg().runQuery(`MATCH (o:${OPT_LABEL} {optimizationId:$id}) RETURN o`, { id }), 'o')[0] || null; },
    async listOpts() { return props(await mg().runQuery(`MATCH (o:${OPT_LABEL}) RETURN o`), 'o'); },
    async saveCand(node) {
      await mg().runQuery(
        `MERGE (c:${CAND_LABEL} {candidateId:$id}) SET c += $node
         WITH c OPTIONAL MATCH (o:${OPT_LABEL} {optimizationId:$optId})
         FOREACH (_ IN CASE WHEN o IS NULL THEN [] ELSE [1] END | MERGE (o)-[:HAS_CANDIDATE]->(c))
         RETURN c`,
        { id: node.candidateId, optId: node.optimizationId, node }
      );
      return node;
    },
    async getCand(id) { return props(await mg().runQuery(`MATCH (c:${CAND_LABEL} {candidateId:$id}) RETURN c`, { id }), 'c')[0] || null; },
    async candsForOpt(optId) { return props(await mg().runQuery(`MATCH (c:${CAND_LABEL} {optimizationId:$optId}) RETURN c ORDER BY c.iteration`, { optId }), 'c'); },
    async linkCandRun(candidateId, runId) {
      await mg().runQuery(`MATCH (c:${CAND_LABEL} {candidateId:$candidateId}),(r:ArenaRun {runId:$runId}) MERGE (c)-[:EVALUATED_BY]->(r)`, { candidateId, runId });
    },
  };
}

function createCandidateStore(deps = {}) {
  const repo = deps.repo || memgraphCandidateStore();

  return {
    ensureIndexes: () => repo.ensureIndexes(),

    async createOptimizationRun(data = {}) {
      const node = {
        optimizationId: data.optimizationId || uuid(),
        name: data.name || `optimization ${nowIso().slice(0, 16)}`,
        status: 'running',
        basePromptEntryId: data.basePromptEntryId || null,
        basePromptVersion: data.basePromptVersion ?? null,
        maxIterations: data.maxIterations ?? 5,
        scenarioIdsJson: JSON.stringify(data.scenarioIds || []),
        personaIdsJson: JSON.stringify(data.personaIds || []),
        currentIteration: 0, candidatesEvaluated: 0, bestScore: null, bestCandidateId: null,
        startedAt: nowIso(), totalCostUsd: 0, namespace: 'CORE',
      };
      Object.keys(node).forEach((k) => node[k] == null && delete node[k]);
      await repo.saveOpt(node);
      return optFromNode(node);
    },
    async getOptimizationRun(id) { return optFromNode(await repo.getOpt(id)); },
    async updateOptimizationRun(id, updates) {
      const existing = await repo.getOpt(id);
      if (!existing) return null;
      const node = { ...existing, optimizationId: id };
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'scenarioIds') node.scenarioIdsJson = JSON.stringify(v);
        else if (k === 'personaIds') node.personaIdsJson = JSON.stringify(v);
        else node[k] = v;
      }
      Object.keys(node).forEach((k) => node[k] == null && delete node[k]);
      await repo.saveOpt(node);
      return optFromNode(await repo.getOpt(id));
    },
    async listOptimizationRuns(filters = {}) {
      let items = (await repo.listOpts()).map(optFromNode).filter(Boolean);
      if (filters.status) items = items.filter((o) => o.status === filters.status);
      items.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      return items;
    },

    async createCandidate(data = {}) {
      const node = {
        candidateId: data.candidateId || uuid(),
        optimizationId: data.optimizationId,
        iteration: data.iteration ?? 0,
        promptGraphJson: JSON.stringify(data.promptGraph || { nodes: [], edges: [] }),
        mutationsJson: data.mutations ? JSON.stringify(data.mutations) : null,
        parentCandidateId: data.parentCandidateId || null,
        promptEntryId: data.promptEntryId || null,
        arenaRunIdsJson: JSON.stringify(data.arenaRunIds || []),
        aggregateScore: data.aggregateScore ?? null,
        intentAccuracyRate: data.intentAccuracyRate ?? null,
        paretoRank: data.paretoRank ?? null,
        reflectionNotes: data.reflectionNotes || null,
        governanceStatus: data.governanceStatus || null,
        createdAt: nowIso(), namespace: 'CORE',
      };
      Object.keys(node).forEach((k) => node[k] == null && delete node[k]);
      await repo.saveCand(node);
      return candFromNode(node);
    },
    async getCandidate(id) { return candFromNode(await repo.getCand(id)); },
    async updateCandidate(id, updates) {
      const existing = await repo.getCand(id);
      if (!existing) return null;
      const node = { ...existing, candidateId: id };
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'promptGraph') node.promptGraphJson = JSON.stringify(v);
        else if (k === 'mutations') node.mutationsJson = JSON.stringify(v);
        else if (k === 'arenaRunIds') node.arenaRunIdsJson = JSON.stringify(v);
        else node[k] = v;
      }
      Object.keys(node).forEach((k) => node[k] == null && delete node[k]);
      await repo.saveCand(node);
      return candFromNode(await repo.getCand(id));
    },
    async getCandidatesForOptimization(optId) { return (await repo.candsForOpt(optId)).map(candFromNode); },
    async linkCandidateToRun(candidateId, arenaRunId) {
      const cand = await repo.getCand(candidateId);
      if (cand) {
        const ids = jparse(cand.arenaRunIdsJson, []);
        if (!ids.includes(arenaRunId)) { ids.push(arenaRunId); await repo.saveCand({ ...cand, candidateId, arenaRunIdsJson: JSON.stringify(ids) }); }
      }
      try { await repo.linkCandRun(candidateId, arenaRunId); } catch { /* edge best-effort */ }
    },
  };
}

const singleton = createCandidateStore();
module.exports = singleton;
module.exports.createCandidateStore = createCandidateStore;
module.exports.memgraphCandidateStore = memgraphCandidateStore;
module.exports.optFromNode = optFromNode;
module.exports.candFromNode = candFromNode;
