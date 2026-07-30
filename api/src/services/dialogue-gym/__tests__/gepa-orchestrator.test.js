'use strict';

/**
 * GEPAOrchestrator loop tests (ШАГ 7B) — fully faked collaborators (no live LLM,
 * arena, DB). Verifies: baseline from production, reflect→mutate→evaluate loop,
 * convergence stop, final approval request, and the no-production guard.
 */

const { createGepaOrchestrator } = require('../gepa-orchestrator');
const realComparison = require('../comparison.service');

const node = (k, over = {}) => ({ id: `rule-${k}`, type: 'ruleNode', position: { x: 0, y: 0 }, data: { kind: 'rule', key: k, title: k, text: `t${k}`, category: 'routing', appliesTo: ['router'], enabled: true, priority: 100, ...over } });

// score/intent by candidate iteration → drives convergence deterministically
const SCORE = { 0: 0.5, 1: 0.7, 2: 0.71, 3: 0.72 };
const INTENT = { 0: 0.5, 1: 0.8, 2: 0.8, 3: 0.8 };

function fakeCandidateStore() {
  const opts = new Map(); const cands = new Map(); let seq = 0;
  return {
    async ensureIndexes() {},
    async createOptimizationRun(d) { const id = `opt-${++seq}`; const o = { optimizationId: id, ...d, status: 'running', currentIteration: 0 }; opts.set(id, o); return o; },
    async getOptimizationRun(id) { return opts.get(id) || null; },
    async updateOptimizationRun(id, u) { const o = { ...opts.get(id), ...u }; opts.set(id, o); return o; },
    async listOptimizationRuns(f = {}) { return [...opts.values()].filter((o) => !f.status || o.status === f.status); },
    async createCandidate(d) { const id = `cand-${++seq}`; const c = { candidateId: id, arenaRunIds: [], ...d }; cands.set(id, c); return c; },
    async getCandidate(id) { return cands.get(id) || null; },
    async updateCandidate(id, u) { const c = { ...cands.get(id), ...u }; cands.set(id, c); return c; },
    async getCandidatesForOptimization(o) { return [...cands.values()].filter((c) => c.optimizationId === o); },
    async linkCandidateToRun(cid, rid) { const c = cands.get(cid); if (c) { c.arenaRunIds = [...(c.arenaRunIds || []), rid]; } },
  };
}

function makeOrch(over = {}) {
  const runs = { count: 0, judged: 0 };
  const orch = createGepaOrchestrator({
    candidateStore: fakeCandidateStore(),
    promptLoader: { loadProduction: async () => ({ nodes: [node('a')], edges: [], metadata: { entryId: 'e1', versionNumber: 2 } }) },
    gym: {
      listScenarios: async () => ({ items: [{ scenarioId: 's1', name: 'S', userGoal: 'g', expectedServiceCode: 'X' }] }),
      listPersonas: async () => ({ items: [{ personaId: 'p1', enabled: true }] }),
      getScenario: async () => ({ scenarioId: 's1', name: 'S', userGoal: 'g', expectedServiceCode: 'X' }),
      getPersonasForScenario: async () => [],
    },
    arena: {
      runArena: async () => { runs.count++; return { run: { runId: `r${runs.count}`, scenarioId: 's1', identifiedServiceCode: 'X', expectedServiceCode: 'X', terminalCondition: 'service_matched' } }; },
      getRun: async (id) => ({ run: { runId: id, scenarioId: 's1', identifiedServiceCode: 'X', expectedServiceCode: 'X' }, turns: [] }),
    },
    judge: { judgeRun: async () => { runs.judged++; return {}; }, getRecordsForRun: async () => [] },
    mutation: {
      suggestMutations: async () => ({ mutations: [{ op: 'update', key: 'a', patch: { text: 'better' } }], reasoning: 'router bias' }),
      applyMutations: (g) => ({ graph: { nodes: [node('a', { text: 'better' })], edges: [] }, result: { updated: 1 } }),
    },
    comparison: {
      aggregateCandidateMetrics: async (c) => ({ aggregateScore: SCORE[c.iteration] ?? 0.5, intentAccuracyRate: INTENT[c.iteration] ?? 0.5, n: 1 }),
      assignParetoRanks: realComparison.assignParetoRanks,
      computeParetoFrontier: realComparison.computeParetoFrontier,
      compareCandidates: realComparison.compareCandidates,
    },
    governance: { createApprovalRequest: async (id) => ({ candidateId: id, improvementPercent: 42, diff: { added: [], removed: [], modified: [{ key: 'a' }] } }) },
    ...over,
  });
  return { orch, runs };
}

describe('GEPAOrchestrator', () => {
  test('runs baseline → iterates → converges → creates approval request', async () => {
    const { orch, runs } = makeOrch();
    const r = await orch.runOptimization({ maxIterations: 3, candidatesPerIteration: 1, convergenceThreshold: 0.02, personasPerScenario: 1 });
    expect(r.success).toBe(true);
    expect(r.baselineScore).toBeCloseTo(0.5, 5);
    // iter1 candidate 0.7 (improvement 40% > 2% → continue); iter2 candidate 0.71
    // (improvement 0.71/0.7-1 ≈ 1.4% < 2% → converge, best=0.71)
    expect(r.finalScore).toBeCloseTo(0.71, 5);
    expect(r.iterations).toBe(2);
    expect(r.improvementPercent).toBeCloseTo(42, 0);
    expect(r.approvalRequest).not.toBeNull();
    expect(runs.count).toBeGreaterThan(0); // arena actually ran
    expect(runs.judged).toBe(runs.count);   // every run judged
  });

  test('throws when production prompt has no graph', async () => {
    const { orch } = makeOrch({ promptLoader: { loadProduction: async () => ({ systemPromptText: '# inline', metadata: {} }) } });
    await expect(orch.runOptimization({})).rejects.toThrow(/no graph/i);
  });

  test('stops early on no_mutations (nothing to improve)', async () => {
    const { orch } = makeOrch({ mutation: { suggestMutations: async () => ({ mutations: [] }), applyMutations: (g) => ({ graph: g, result: {} }) } });
    const r = await orch.runOptimization({ maxIterations: 3, personasPerScenario: 1 });
    expect(r.success).toBe(true);
    expect(r.finalScore).toBeCloseTo(0.5, 5); // stayed on baseline
    expect(r.approvalRequest).toBeNull();      // no candidate beat baseline
  });

  test('requestStop halts the loop (status paused)', async () => {
    const cs = fakeCandidateStore();
    const { orch } = makeOrch({ candidateStore: cs });
    // stop as soon as we learn the id
    const p = orch.runOptimization({ maxIterations: 5, personasPerScenario: 1, onCreate: (id) => orch.requestStop(id) });
    const r = await p;
    expect(r.iterations).toBe(0); // never entered the loop body
  });
});

// TASK-GEPA-ROBUST-001 — reflection is the one creative step in the loop, and a
// creative step is allowed to come back empty. It is not allowed to destroy an
// optimization that already measured a baseline: EXP-001 died exactly there,
// after ~10 minutes of arena time, because one Haiku reply omitted `mutations`.
describe('reflection robustness', () => {
  const { createMutationService } = require('../mutation.service');
  const schemaError = () => { throw new Error("[anthropic-api] structuredOutput schema invalid: / must have required property 'mutations'"); };

  test('a schema failure yields empty mutations plus the error, never a throw', async () => {
    const svc = createMutationService({ llm: { structuredOutput: schemaError } });
    const out = await svc.suggestMutations({ graph: { nodes: [], edges: [] }, evaluations: [] });
    expect(out.mutations).toEqual([]);
    expect(out.reasoning).toBeNull();
    // The error is reported rather than swallowed — a broken reflection must not
    // read as a model that simply had no ideas.
    expect(out.error).toMatch(/schema invalid/);
  });

  test('one retry: a call that fails then succeeds still produces mutations', async () => {
    let calls = 0;
    const svc = createMutationService({
      llm: {
        structuredOutput: async () => {
          calls += 1;
          if (calls === 1) schemaError();
          return { data: { reasoning: 'router over-deflects', mutations: [{ op: 'update', key: 'routing-prefer-info', patch: { text: 'x' } }] } };
        },
      },
    });
    const out = await svc.suggestMutations({ graph: { nodes: [], edges: [] }, evaluations: [] });
    expect(calls).toBe(2);
    expect(out.mutations).toHaveLength(1);
    expect(out.reasoning).toBe('router over-deflects');
    expect(out.error).toBeUndefined();
  });

  test('it retries at most once — a reliably broken model must not burn tokens', async () => {
    let calls = 0;
    const svc = createMutationService({ llm: { structuredOutput: async () => { calls += 1; schemaError(); } } });
    await svc.suggestMutations({ graph: { nodes: [], edges: [] }, evaluations: [] });
    expect(calls).toBe(2);
  });

  test('a non-array mutations field degrades to empty rather than throwing', async () => {
    const svc = createMutationService({ llm: { structuredOutput: async () => ({ data: { reasoning: 'r', mutations: 'oops' } }) } });
    const out = await svc.suggestMutations({ graph: { nodes: [], edges: [] }, evaluations: [] });
    expect(out.mutations).toEqual([]);
    expect(out.reasoning).toBe('r');
  });

  test('malformed ops are dropped, well-formed ones kept', async () => {
    const svc = createMutationService({
      llm: {
        structuredOutput: async () => ({
          data: {
            mutations: [
              { op: 'update', key: 'k1', patch: { text: 'a' } },
              { op: 'update' },                       // no key
              { op: 'add', node: { key: 'k2' } },     // no text
              { op: 'teleport', key: 'k3' },          // unknown op
              { op: 'add', node: { key: 'k4', text: 'ok' } },
            ],
          },
        }),
      },
    });
    const out = await svc.suggestMutations({ graph: { nodes: [], edges: [] }, evaluations: [] });
    expect(out.mutations.map((m) => m.op)).toEqual(['update', 'add']);
  });
});
