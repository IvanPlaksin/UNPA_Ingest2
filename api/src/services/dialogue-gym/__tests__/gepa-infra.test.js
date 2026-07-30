'use strict';

/**
 * GEPA infrastructure unit tests (ШАГ 7A) — mutation apply, comparison/Pareto,
 * governance diff, candidate-store CRUD. No DB / no live LLM.
 */

const { createMutationService } = require('../mutation.service');
const comparison = require('../comparison.service');
const { computePromptDiff, createGovernanceService } = require('../governance.service');
const { createCandidateStore } = require('../candidate-store');

const node = (key, over = {}) => ({ id: `rule-${key}`, type: 'ruleNode', position: { x: 0, y: 0 }, data: { kind: 'rule', key, title: key, text: `text ${key}`, category: 'routing', appliesTo: ['router'], enabled: true, priority: 100, ...over } });
const graph = (keys) => ({ nodes: keys.map((k) => node(k)), edges: [] });

describe('MutationService — apply + suggest', () => {
  const svc = createMutationService({ llm: { structuredOutput: async () => ({ data: { reasoning: 'router bias', mutations: [
    { op: 'update', key: 'a', patch: { text: 'better' }, rationale: 'fix router' },
    { op: 'add', node: { key: 'z', title: 'Z', text: 'new rule', category: 'routing', appliesTo: ['router'], priority: 50 }, rationale: 'missing' },
    { op: 'bogus' }, // dropped
  ] }, inputTokens: 5, outputTokens: 5, costUsd: 0.001 }) } });

  test('applyMutations delegates to the editor applier (add/update/remove)', () => {
    const { graph: g, result } = svc.applyMutations(graph(['a', 'b']), [
      { op: 'update', key: 'a', patch: { text: 'X' } },
      { op: 'add', node: { key: 'c', text: 'C' } },
      { op: 'remove', key: 'b' },
    ]);
    expect(result).toEqual({ added: 1, updated: 1, removed: 1 });
    const keys = g.nodes.map((n) => n.data.key);
    expect(keys).toContain('a'); expect(keys).toContain('c'); expect(keys).not.toContain('b');
    expect(g.nodes.find((n) => n.data.key === 'a').data.text).toBe('X');
  });

  test('suggestMutations returns well-formed ops (drops malformed)', async () => {
    const out = await svc.suggestMutations({ graph: graph(['a']), evaluations: [{ scenarioName: 's', overallVerdict: 'failure', overallScore: 0.1, intentAccuracy: 'incorrect', problems: [{ description: 'router misroute' }] }] });
    expect(out.reasoning).toBe('router bias');
    expect(out.mutations).toHaveLength(2); // bogus dropped
    expect(out.mutations[0]).toMatchObject({ op: 'update', key: 'a' });
  });
});

describe('ComparisonService — Pareto', () => {
  const c = (id, intent, score) => ({ candidateId: id, intentAccuracyRate: intent, aggregateScore: score });

  test('dominates: no worse on all, strictly better on ≥1', () => {
    expect(comparison.dominates(c('a', 0.8, 0.7), c('b', 0.6, 0.5))).toBe(true);
    expect(comparison.dominates(c('a', 0.8, 0.4), c('b', 0.6, 0.5))).toBe(false); // trade-off
    expect(comparison.dominates(c('a', 0.6, 0.5), c('b', 0.6, 0.5))).toBe(false); // equal
  });

  test('computeParetoFrontier keeps non-dominated', () => {
    const cands = [c('a', 0.9, 0.5), c('b', 0.5, 0.9), c('c', 0.4, 0.4)];
    const front = comparison.computeParetoFrontier(cands).map((x) => x.candidateId).sort();
    expect(front).toEqual(['a', 'b']); // c dominated by both
  });

  test('assignParetoRanks layers frontiers', () => {
    const cands = [c('a', 0.9, 0.9), c('b', 0.5, 0.5), c('c', 0.4, 0.4)];
    const ranked = comparison.assignParetoRanks(cands);
    expect(ranked.find((x) => x.candidateId === 'a').paretoRank).toBe(0);
    expect(ranked.find((x) => x.candidateId === 'b').paretoRank).toBe(1);
    expect(ranked.find((x) => x.candidateId === 'c').paretoRank).toBe(2);
  });

  test('aggregateCandidateMetrics averages judge records', async () => {
    const svc = comparison.createComparisonService({
      judge: { getRecordsForRun: async (id) => [{ judgeModel: 'claude', judgedAt: '2026', overallScore: id === 'r1' ? 0.8 : 0.4, intentAccuracy: id === 'r1' ? 'correct' : 'incorrect' }] },
    });
    const m = await svc.aggregateCandidateMetrics({ arenaRunIds: ['r1', 'r2'] });
    expect(m.aggregateScore).toBeCloseTo(0.6, 5);
    expect(m.intentAccuracyRate).toBeCloseTo(0.5, 5);
    expect(m.n).toBe(2);
  });
});

describe('GovernanceService — diff + approve/reject', () => {
  test('computePromptDiff detects add/remove/modify by key', () => {
    const oldG = graph(['a', 'b']);
    const newG = { nodes: [node('a', { text: 'changed' }), node('c')], edges: [] };
    const diff = computePromptDiff(oldG, newG);
    expect(diff.added.map((d) => d.key)).toEqual(['c']);
    expect(diff.removed.map((d) => d.key)).toEqual(['b']);
    expect(diff.modified.map((d) => d.key)).toEqual(['a']);
  });

  test('approve saves candidate as a new version (does not apply)', async () => {
    const saved = [];
    const gov = createGovernanceService({
      candidateStore: {
        getCandidate: async () => ({ candidateId: 'cand-1', optimizationId: 'opt-1', promptEntryId: 'entry-1', promptGraph: graph(['a']), aggregateScore: 0.7, arenaRunIds: [] }),
        getCandidatesForOptimization: async () => [],
        updateCandidate: async (id, u) => saved.push(u),
      },
      promptEditor: { saveGraph: async (p) => { saved.push({ savedGraph: p }); return { versionNumber: 6 }; } },
    });
    const r = await gov.approve('cand-1', 'ivan');
    expect(r.success).toBe(true);
    expect(r.savedAsVersion).toBe(6);
    expect(r.message).toMatch(/Apply/); // reminds it is NOT auto-applied
    expect(saved.some((s) => s.governanceStatus === 'approved')).toBe(true);
  });
});

describe('CandidateStore — CRUD (fake repo)', () => {
  function fakeRepo() {
    const opts = new Map(); const cands = new Map();
    return {
      async ensureIndexes() {}, async saveOpt(n) { opts.set(n.optimizationId, { ...n }); }, async getOpt(id) { return opts.get(id) || null; },
      async listOpts() { return [...opts.values()]; }, async saveCand(n) { cands.set(n.candidateId, { ...n }); }, async getCand(id) { return cands.get(id) || null; },
      async candsForOpt(o) { return [...cands.values()].filter((c) => c.optimizationId === o); }, async linkCandRun() {},
    };
  }
  test('optimization + candidate round-trip with JSON fields', async () => {
    const store = createCandidateStore({ repo: fakeRepo() });
    const opt = await store.createOptimizationRun({ name: 'run1', scenarioIds: ['s1'], personaIds: ['p1'], maxIterations: 3 });
    expect(opt.scenarioIds).toEqual(['s1']);
    const cand = await store.createCandidate({ optimizationId: opt.optimizationId, iteration: 0, promptGraph: graph(['a']), arenaRunIds: [] });
    expect(cand.promptGraph.nodes[0].data.key).toBe('a');
    await store.linkCandidateToRun(cand.candidateId, 'run-1');
    const got = await store.getCandidate(cand.candidateId);
    expect(got.arenaRunIds).toContain('run-1');
    const upd = await store.updateOptimizationRun(opt.optimizationId, { status: 'completed', bestScore: 0.8 });
    expect(upd.status).toBe('completed'); expect(upd.bestScore).toBe(0.8);
  });
});
