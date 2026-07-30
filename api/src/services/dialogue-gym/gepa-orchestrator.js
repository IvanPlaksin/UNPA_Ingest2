'use strict';

/**
 * GEPAOrchestrator (ШАГ 7B) — the full reflective-Pareto prompt optimization loop.
 *
 * Loop: baseline (production prompt) → evaluate (arena × judge) → reflect on the
 * failures → propose mutations → spawn candidates → evaluate → recompute the
 * Pareto frontier → pick the best-on-frontier → stop on convergence/maxIterations
 * → finalize + create a governance approval request (SAVE-only, never auto-apply).
 *
 * All collaborators are injectable (deps) so the loop is unit-testable with fakes
 * (no live LLM / arena / DB). A per-optimization progress EventEmitter feeds the
 * SSE stream; a stop-flag registry lets the /stop endpoint end a run cleanly.
 *
 * NOTE: a real run does NOT need an Altiora user token. The directory and the
 * default acting user resolve through the service account (ALTIORA_SERVICE_EMAIL
 * / ALTIORA_SERVICE_PASSWORD). Pass `altioraUserToken` only to act as one
 * specific real person — their scoped LOV and MY_REQUESTS. An earlier version of
 * this note claimed the token was required and cost EXP-001 a day of being
 * treated as blocked; run-gepa.js has always said otherwise.
 *
 * What a real run DOES need: a reachable Altiora API at ALTIORA_API_BASE.
 *
 * @module services/dialogue-gym/gepa-orchestrator
 */

const { EventEmitter } = require('events');

const DEFAULT_CONFIG = {
  maxIterations: 5,
  candidatesPerIteration: 3,
  convergenceThreshold: 0.02,   // stop if relative improvement < 2%
  personasPerScenario: 2,
  maxTurns: 6,
  scenarioFilter: { enabled: true, groundTruthVerified: true },
  personaFilter: { enabled: true },
  altioraUserToken: undefined,  // REQUIRED for a real run (else arena aborts on directory)
  onProgress: null,
};

// per-optimization progress bus + stop flags (module-level, process-scoped)
const _buses = new Map();   // optimizationId -> EventEmitter
const _stops = new Set();   // optimizationIds asked to stop
function busFor(id) { let b = _buses.get(id); if (!b) { b = new EventEmitter(); b.setMaxListeners(0); _buses.set(id, b); } return b; }
function requestStop(id) { _stops.add(id); }
function stopRequested(id) { return _stops.has(id); }

function createGepaOrchestrator(deps = {}) {
  const candidateStore = deps.candidateStore || require('./candidate-store');
  const promptLoader = deps.promptLoader || require('./prompt-loader');
  const gym = deps.gym || require('./dialogue-gym.service');
  const arena = deps.arena || require('./arena-runner.service');
  const judge = deps.judge || require('./judge.service');
  const mutation = deps.mutation || require('./mutation.service');
  const comparison = deps.comparison || require('./comparison.service');
  const governance = deps.governance || require('./governance.service');

  function emit(optimizationId, data, onProgress) {
    const ev = { ...data, optimizationId, at: new Date().toISOString() };
    try { busFor(optimizationId).emit('progress', ev); } catch { /* ignore */ }
    if (onProgress) { try { onProgress(ev); } catch { /* ignore */ } }
    try { console.log('[GEPA]', JSON.stringify(ev)); } catch { /* ignore */ }
  }

  async function suitablePersonas(scenario, allPersonas, cfg) {
    let list = [];
    try { list = (await gym.getPersonasForScenario(scenario.scenarioId)).filter((p) => p.enabled); } catch { list = []; }
    if (!list.length) list = allPersonas;
    return list.slice(0, cfg.personasPerScenario);
  }

  /** Run arena (candidate graph) × judge over scenarios×personas, aggregate → candidate metrics. */
  async function evaluateCandidate(candidate, scenarios, personas, cfg, optimizationId) {
    for (const scenario of scenarios) {
      if (stopRequested(optimizationId)) break;
      const chosen = await suitablePersonas(scenario, personas, cfg);
      for (const persona of chosen) {
        if (stopRequested(optimizationId)) break;
        let run;
        try {
          const res = await arena.runArena(persona.personaId, scenario.scenarioId, {
            promptSource: 'custom_graph', promptGraph: candidate.promptGraph,
            maxTurns: cfg.maxTurns, altioraUserToken: cfg.altioraUserToken, promptLabel: `gepa:${candidate.candidateId.slice(0, 8)}`,
          });
          run = res.run;
        } catch (e) { emit(optimizationId, { phase: 'run_error', candidateId: candidate.candidateId, error: e.message }, cfg.onProgress); continue; }
        await candidateStore.linkCandidateToRun(candidate.candidateId, run.runId);
        try { await judge.judgeRun(run.runId); } catch (e) { emit(optimizationId, { phase: 'judge_error', runId: run.runId, error: e.message }, cfg.onProgress); }
      }
    }
    const fresh = await candidateStore.getCandidate(candidate.candidateId);
    const metrics = await comparison.aggregateCandidateMetrics(fresh);
    await candidateStore.updateCandidate(candidate.candidateId, { aggregateScore: metrics.aggregateScore, intentAccuracyRate: metrics.intentAccuracyRate, evaluatedAt: new Date().toISOString() });
    return { ...fresh, ...metrics };
  }

  /** Assemble the failure signal for reflection from a candidate's arena runs. */
  async function evaluationsForCandidate(candidate) {
    const out = [];
    for (const runId of candidate.arenaRunIds || []) {
      let detail = null;
      try { detail = await arena.getRun(runId); } catch { detail = null; }
      if (!detail) continue;
      const run = detail.run;
      const recs = await judge.getRecordsForRun(runId).catch(() => []);
      const j = recs.filter((r) => r.judgeModel !== 'deterministic-only' && !String(r.judgeModel || '').startsWith('human:'))
        .sort((a, b) => String(b.judgedAt).localeCompare(String(a.judgedAt)))[0] || recs[0] || {};
      let scenario = null;
      try { scenario = await gym.getScenario(run.scenarioId); } catch { scenario = null; }
      out.push({
        scenarioName: scenario ? scenario.name : run.scenarioId,
        userGoal: scenario ? scenario.userGoal : null,
        expectedServiceCode: run.expectedServiceCode || (scenario && scenario.expectedServiceCode) || null,
        identifiedServiceCode: run.identifiedServiceCode || null,
        intentAccuracy: j.intentAccuracy,
        overallVerdict: j.overallVerdict,
        overallScore: j.overallScore,
        summaryNotes: [j.summaryNotes, j.toneNotes, j.controlsCorrectnessNotes, j.groundingNotes].filter(Boolean).join(' | ') || null,
      });
    }
    return out;
  }

  /**
   * Run one full optimization. Long-running.
   * @param {object} config see DEFAULT_CONFIG
   * @returns {Promise<{success, optimizationId, iterations, baselineScore, finalScore, improvementPercent, recommendedCandidateId, approvalRequest}>}
   */
  async function runOptimization(config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    await candidateStore.ensureIndexes();

    // production prompt → baseline graph
    const prod = await promptLoader.loadProduction();
    if (!prod || !prod.nodes || !prod.nodes.length) {
      throw Object.assign(new Error('cannot start GEPA: production prompt has no graph (apply a CHAT_PROMPT graph first)'), { status: 409 });
    }

    const { items: scenarios } = await gym.listScenarios({ ...cfg.scenarioFilter, limit: 1000 });
    const { items: personas } = await gym.listPersonas({ ...cfg.personaFilter, limit: 1000 });
    if (!scenarios.length || !personas.length) throw Object.assign(new Error('no scenarios/personas to optimize on'), { status: 409 });

    const optimization = await candidateStore.createOptimizationRun({
      name: cfg.name, maxIterations: cfg.maxIterations,
      basePromptEntryId: prod.metadata && prod.metadata.entryId, basePromptVersion: prod.metadata && prod.metadata.versionNumber,
      scenarioIds: scenarios.map((s) => s.scenarioId), personaIds: personas.map((p) => p.personaId),
    });
    const optId = optimization.optimizationId;
    _stops.delete(optId);
    if (cfg.onCreate) { try { cfg.onCreate(optId); } catch { /* ignore */ } }

    try {
      emit(optId, { phase: 'start', scenarios: scenarios.length, personas: personas.length }, cfg.onProgress);

      // baseline
      let baseline = await candidateStore.createCandidate({ optimizationId: optId, iteration: 0, promptGraph: { nodes: prod.nodes, edges: prod.edges }, parentCandidateId: null, promptEntryId: prod.metadata && prod.metadata.entryId });
      baseline = await evaluateCandidate(baseline, scenarios, personas, cfg, optId);
      emit(optId, { phase: 'baseline_evaluated', score: baseline.aggregateScore, intent: baseline.intentAccuracyRate }, cfg.onProgress);

      let currentBest = baseline;
      let iteration = 0;

      while (iteration < cfg.maxIterations && !stopRequested(optId)) {
        iteration += 1;
        emit(optId, { phase: 'iteration_start', iteration, currentBestScore: currentBest.aggregateScore }, cfg.onProgress);

        const evaluations = await evaluationsForCandidate(currentBest);
        const suggestion = await mutation.suggestMutations({ graph: currentBest.promptGraph, evaluations });
        const ops = suggestion.mutations || [];
        // TASK-GEPA-ROBUST-001: reflection now returns empty rather than throwing,
        // so distinguish "the model proposed nothing" from "the call failed" —
        // otherwise a broken reflection reads as a converged optimization.
        if (suggestion.error) {
          emit(optId, { phase: 'mutation_error', iteration, error: suggestion.error }, cfg.onProgress);
        }
        if (!ops.length) { emit(optId, { phase: 'no_mutations', iteration }, cfg.onProgress); break; }

        // spawn one candidate per proposed op (up to candidatesPerIteration)
        const newCands = [];
        for (const op of ops.slice(0, cfg.candidatesPerIteration)) {
          const { graph: mutated } = mutation.applyMutations(currentBest.promptGraph, [op]);
          const cand = await candidateStore.createCandidate({
            optimizationId: optId, iteration, promptGraph: mutated, mutations: [op],
            parentCandidateId: currentBest.candidateId, promptEntryId: currentBest.promptEntryId,
            reflectionNotes: suggestion.reasoning || null,
          });
          newCands.push(cand);
        }
        for (const cand of newCands) {
          if (stopRequested(optId)) break;
          await evaluateCandidate(cand, scenarios, personas, cfg, optId);
        }

        // Pareto over all candidates so far → best-on-frontier by aggregateScore
        const all = comparison.assignParetoRanks(await candidateStore.getCandidatesForOptimization(optId));
        for (const c of all) { try { await candidateStore.updateCandidate(c.candidateId, { paretoRank: c.paretoRank }); } catch { /* ignore */ } }
        const frontier = all.filter((c) => c.paretoRank === 0 && typeof c.aggregateScore === 'number');
        const bestOnFrontier = frontier.reduce((best, c) => (best == null || c.aggregateScore > best.aggregateScore ? c : best), null) || currentBest;

        const denom = currentBest.aggregateScore || 0;
        const improvement = denom > 0 ? (bestOnFrontier.aggregateScore - currentBest.aggregateScore) / denom : (bestOnFrontier.aggregateScore > 0 ? 1 : 0);
        emit(optId, { phase: 'iteration_end', iteration, improvement, newBestScore: bestOnFrontier.aggregateScore, frontierSize: frontier.length }, cfg.onProgress);

        await candidateStore.updateOptimizationRun(optId, { currentIteration: iteration, candidatesEvaluated: all.length, bestScore: bestOnFrontier.aggregateScore, bestCandidateId: bestOnFrontier.candidateId });

        if (improvement < cfg.convergenceThreshold) { emit(optId, { phase: 'converged', iteration, improvement }, cfg.onProgress); currentBest = bestOnFrontier; break; }
        currentBest = bestOnFrontier;
      }

      const baselineScore = baseline.aggregateScore || 0;
      const improvementPercent = baselineScore > 0 ? ((currentBest.aggregateScore - baselineScore) / baselineScore) * 100 : null;
      await candidateStore.updateOptimizationRun(optId, {
        status: stopRequested(optId) ? 'paused' : 'completed', completedAt: new Date().toISOString(),
        bestScore: currentBest.aggregateScore, bestCandidateId: currentBest.candidateId,
        improvementPercent, recommendedCandidateId: currentBest.candidateId, governanceStatus: 'pending',
      });

      let approvalRequest = null;
      if (currentBest.candidateId !== baseline.candidateId) { try { approvalRequest = await governance.createApprovalRequest(currentBest.candidateId); } catch { /* ignore */ } }

      const result = { success: true, optimizationId: optId, iterations: iteration, baselineScore, finalScore: currentBest.aggregateScore, improvementPercent, recommendedCandidateId: currentBest.candidateId, approvalRequest };
      emit(optId, { phase: 'done', ...result }, cfg.onProgress);
      return result;
    } catch (err) {
      await candidateStore.updateOptimizationRun(optId, { status: 'failed', errorMessage: err.message }).catch(() => {});
      emit(optId, { phase: 'failed', error: err.message }, cfg.onProgress);
      throw err;
    } finally { _stops.delete(optId); }
  }

  /** Fire-and-forget launcher for the REST /start endpoint. Returns the id as soon
   * as the OptimizationRun is created (via the onCreate hook), then runs in the background. */
  async function startOptimization(config = {}) {
    let resolveId;
    const idPromise = new Promise((r) => { resolveId = r; });
    const res = runOptimization({ ...config, onCreate: (id) => resolveId(id) })
      .catch((e) => { try { console.error('[GEPA] run failed:', e.message); } catch { /* ignore */ } });
    const optimizationId = await Promise.race([idPromise, new Promise((r) => setTimeout(() => r(null), 8000))]);
    return { optimizationId, status: 'running', _promise: res };
  }

  return { runOptimization, startOptimization, evaluateCandidate, evaluationsForCandidate, requestStop, stopRequested, busFor, DEFAULT_CONFIG };
}

const singleton = createGepaOrchestrator();
module.exports = singleton;
module.exports.createGepaOrchestrator = createGepaOrchestrator;
module.exports.requestStop = requestStop;
module.exports.busFor = busFor;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
