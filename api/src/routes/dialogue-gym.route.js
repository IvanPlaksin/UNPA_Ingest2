'use strict';

/**
 * Dialogue Gym REST API — PersonaLibrary + ScenarioBank (Phase 1, ШАГ 2).
 * Mounted at /api/v1/dialogue-gym (see api/index.js).
 *
 * @module routes/dialogue-gym.route
 */

const express = require('express');
const router = express.Router();
const gym = require('../services/dialogue-gym/dialogue-gym.service');
const arena = require('../services/dialogue-gym/arena-runner.service');
const judge = require('../services/dialogue-gym/judge.service');
const promptLoader = require('../services/dialogue-gym/prompt-loader');
const candidateStore = require('../services/dialogue-gym/candidate-store');
const comparison = require('../services/dialogue-gym/comparison.service');
const governance = require('../services/dialogue-gym/governance.service');
const gepa = require('../services/dialogue-gym/gepa-orchestrator');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, error, status = 500) => res.status(status).json({ success: false, error: error.message || String(error) });
// invalid-input (validation) → 400, everything else → 500
const isValidation = (e) => /invalid|required|not found/i.test(e.message || '');

// ── meta / health ─────────────────────────────────────────────────────────────
router.get('/meta', (req, res) => ok(res, { enums: gym.ENUMS }));

// Health for the UI header: directory availability + entity counts.
router.get('/health', async (req, res) => {
  try {
    const [directory, personas, scenarios, runs, judged] = await Promise.all([
      arena.checkDirectory({}),
      gym.listPersonas({ limit: 1 }),
      gym.listScenarios({ limit: 1 }),
      arena.listRuns({ limit: 1 }),
      judge.listRecords({ limit: 1 }),
    ]);
    ok(res, {
      directory,
      counts: { personas: personas.total, scenarios: scenarios.total, runs: runs.total, judgeRecords: judged.total },
    });
  } catch (e) { fail(res, e); }
});

// ── personas ──────────────────────────────────────────────────────────────────
router.get('/personas', async (req, res) => {
  try {
    const { enabled, isBuiltin, domainKnowledge, cooperativeness, language, limit, offset } = req.query;
    const filters = { domainKnowledge, cooperativeness, language, limit, offset };
    if (enabled !== undefined) filters.enabled = enabled !== 'false';
    if (isBuiltin !== undefined) filters.isBuiltin = isBuiltin === 'true';
    ok(res, await gym.listPersonas(filters));
  } catch (e) { fail(res, e); }
});

router.post('/personas', async (req, res) => {
  try {
    const created = await gym.createPersona(req.body, {
      createdBy: req.body.createdBy || req.headers['x-agent-id'] || 'anonymous',
      isBuiltin: false,
    });
    ok(res, created, 201);
  } catch (e) { fail(res, e, isValidation(e) ? 400 : 500); }
});

router.get('/personas/:id', async (req, res) => {
  try {
    const p = await gym.getPersona(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Persona not found' });
    ok(res, p);
  } catch (e) { fail(res, e); }
});

router.put('/personas/:id', async (req, res) => {
  try {
    const upd = await gym.updatePersona(req.params.id, req.body);
    if (!upd) return res.status(404).json({ success: false, error: 'Persona not found' });
    ok(res, upd);
  } catch (e) { fail(res, e, isValidation(e) ? 400 : 500); }
});

router.delete('/personas/:id', async (req, res) => {
  try {
    const done = await gym.deletePersona(req.params.id);
    if (!done) return res.status(404).json({ success: false, error: 'Persona not found' });
    ok(res, { deleted: true });
  } catch (e) { fail(res, e); }
});

// ── scenarios ─────────────────────────────────────────────────────────────────
router.get('/scenarios', async (req, res) => {
  try {
    const { enabled, isBuiltin, category, domain, difficulty, tags, limit, offset } = req.query;
    const filters = { category, domain, difficulty, limit, offset };
    if (enabled !== undefined) filters.enabled = enabled !== 'false';
    if (isBuiltin !== undefined) filters.isBuiltin = isBuiltin === 'true';
    if (tags) filters.tags = Array.isArray(tags) ? tags : String(tags).split(',').map((t) => t.trim()).filter(Boolean);
    ok(res, await gym.listScenarios(filters));
  } catch (e) { fail(res, e); }
});

router.post('/scenarios', async (req, res) => {
  try {
    ok(res, await gym.createScenario(req.body, { isBuiltin: false }), 201);
  } catch (e) { fail(res, e, isValidation(e) ? 400 : 500); }
});

router.get('/scenarios/:id', async (req, res) => {
  try {
    const s = await gym.getScenario(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: 'Scenario not found' });
    ok(res, s);
  } catch (e) { fail(res, e); }
});

router.put('/scenarios/:id', async (req, res) => {
  try {
    const upd = await gym.updateScenario(req.params.id, req.body);
    if (!upd) return res.status(404).json({ success: false, error: 'Scenario not found' });
    ok(res, upd);
  } catch (e) { fail(res, e, isValidation(e) ? 400 : 500); }
});

router.delete('/scenarios/:id', async (req, res) => {
  try {
    const done = await gym.deleteScenario(req.params.id);
    if (!done) return res.status(404).json({ success: false, error: 'Scenario not found' });
    ok(res, { deleted: true });
  } catch (e) { fail(res, e); }
});

// Ratify a scenario's ground truth (set expectedServiceCode + groundTruthVerified).
router.post('/scenarios/:id/verify-ground-truth', async (req, res) => {
  try {
    // acknowledgedServiceTitle: the caller echoes the catalogue's own name for
    // the service. A mismatch is refused — showing only a CODE is what let
    // "Change the bank account" be ratified against "Request for Salary Advance".
    const { expectedServiceCode = null, groundTruthNotes, verifiedBy, acknowledgedServiceTitle } = req.body || {};
    const s = await gym.verifyGroundTruth(req.params.id, { expectedServiceCode, groundTruthNotes, verifiedBy: verifiedBy || 'ui', acknowledgedServiceTitle });
    if (!s) return res.status(404).json({ success: false, error: 'Scenario not found' });
    ok(res, s);
  } catch (e) { fail(res, e, isValidation(e) ? 400 : 500); }
});

// ── assignment (SUITABLE_FOR) ──────────────────────────────────────────────────
router.post('/assign', async (req, res) => {
  try {
    const { personaId, scenarioId, weight, notes } = req.body || {};
    if (!personaId || !scenarioId) return res.status(400).json({ success: false, error: 'personaId and scenarioId are required' });
    ok(res, await gym.assignPersonaToScenario(personaId, scenarioId, weight ?? 1.0, notes ?? null), 201);
  } catch (e) { fail(res, e, isValidation(e) ? 400 : 500); }
});

router.delete('/assign', async (req, res) => {
  try {
    const personaId = req.body?.personaId || req.query.personaId;
    const scenarioId = req.body?.scenarioId || req.query.scenarioId;
    if (!personaId || !scenarioId) return res.status(400).json({ success: false, error: 'personaId and scenarioId are required' });
    await gym.unassignPersonaFromScenario(personaId, scenarioId);
    ok(res, { unassigned: true });
  } catch (e) { fail(res, e); }
});

// ── arena support ──────────────────────────────────────────────────────────────
router.get('/random-pair', async (req, res) => {
  try {
    const { category, domain, difficulty } = req.query;
    const pair = await gym.getRandomPair({ category, domain, difficulty });
    if (!pair) return res.status(404).json({ success: false, error: 'No eligible persona/scenario pair' });
    ok(res, pair);
  } catch (e) { fail(res, e); }
});

// ── arena runs ───────────────────────────────────────────────────────────────
// Run one dialogue (persona × scenario × candidate prompt). Blocks until done.
/**
 * Preflight gate for anything that starts real dialogues. The agent's backends
 * degrade silently to empty results, so a dead catalog or embedder yields runs
 * that score as prompt failures — the experiment measures infrastructure, not the
 * prompt. Returns a 503 carrying the failed checks so the UI can say which
 * service is down. Pass options.skipPreflight to override deliberately.
 */
async function preflightGate(req, res) {
  const options = (req.body && (req.body.options || req.body)) || {};
  if (options.skipPreflight) return true;
  const preflight = require('../services/dialogue-gym/preflight.service');
  const result = await preflight.runPreflight();
  if (!result.ok) {
    res.status(503).json({
      success: false,
      error: 'preflight failed — dependencies are down; runs would produce failures unrelated to the prompt',
      preflight: result,
    });
    return false;
  }
  return true;
}

router.post('/arena/run', async (req, res) => {
  try {
    const { personaId, scenarioId, options } = req.body || {};
    if (!personaId || !scenarioId) return res.status(400).json({ success: false, error: 'personaId and scenarioId are required' });
    if (!await preflightGate(req, res)) return;
    ok(res, await arena.runArena(personaId, scenarioId, options || {}), 201);
  } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});

// Report dependency health without starting anything — the UI can call this
// before showing the "Run" button, and an operator can use it to diagnose.
router.get('/preflight', async (req, res) => {
  try {
    const result = await require('../services/dialogue-gym/preflight.service').runPreflight();
    res.status(result.ok ? 200 : 503).json({ success: result.ok, data: result });
  } catch (e) { fail(res, e); }
});

// Run one dialogue against a randomly drawn pair.
router.post('/arena/run-random', async (req, res) => {
  try {
    const { filters, options } = req.body || {};
    const pair = await gym.getRandomPair(filters || {});
    if (!pair) return res.status(404).json({ success: false, error: 'No eligible persona/scenario pair' });
    if (!await preflightGate(req, res)) return;
    ok(res, await arena.runArena(pair.persona.personaId, pair.scenario.scenarioId, options || {}), 201);
  } catch (e) { fail(res, e); }
});

router.get('/arena/runs', async (req, res) => {
  try {
    const { status, scenarioId, personaId, terminalCondition, limit, offset } = req.query;
    ok(res, await arena.listRuns({ status, scenarioId, personaId, terminalCondition, limit, offset }));
  } catch (e) { fail(res, e); }
});

router.get('/arena/runs/:runId', async (req, res) => {
  try {
    const detail = await arena.getRun(req.params.runId);
    if (!detail) return res.status(404).json({ success: false, error: 'Run not found' });
    ok(res, detail);
  } catch (e) { fail(res, e); }
});

router.get('/arena/runs/:runId/turns', async (req, res) => {
  try {
    ok(res, await arena.getTurns(req.params.runId));
  } catch (e) { fail(res, e); }
});

// ── prompt versions (ШАГ 5 — bridge to the P6 prompt editor / CHAT_PROMPT) ─────
// List CHAT_PROMPT graphs from the editor.
router.get('/prompts', async (req, res) => {
  try { ok(res, await promptLoader.listPromptGraphs()); } catch (e) { fail(res, e); }
});

// The live production prompt (active :FlowdeskSystemPrompt) + compiled text.
router.get('/prompts/production', async (req, res) => {
  try {
    const prod = await promptLoader.loadProduction();
    if (!prod) return res.status(404).json({ success: false, error: 'no active production prompt' });
    let compiledText = prod.systemPromptText || null;
    if (!compiledText && prod.nodes) { try { compiledText = await promptLoader.compileToText({ nodes: prod.nodes, edges: prod.edges }); } catch { /* ignore */ } }
    ok(res, { ...prod, compiledText });
  } catch (e) { fail(res, e); }
});

// Versions of a graph.
router.get('/prompts/:entryId/versions', async (req, res) => {
  try { ok(res, await promptLoader.listVersions(req.params.entryId)); } catch (e) { fail(res, e); }
});

// Load a specific version (+ compiled text preview).
router.get('/prompts/:entryId/versions/:version', async (req, res) => {
  try {
    const loaded = await promptLoader.loadVersion(req.params.entryId, req.params.version);
    let compiledText = null;
    try { compiledText = await promptLoader.compileToText({ nodes: loaded.nodes, edges: loaded.edges }); } catch { /* ignore */ }
    ok(res, { ...loaded, compiledText });
  } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});

// ── judge (P2) ─────────────────────────────────────────────────────────────────
// Evaluate one run. Body { skipLLM?: bool } → deterministic-only when true.
router.post('/judge/run/:runId', async (req, res) => {
  try {
    ok(res, await judge.judgeRun(req.params.runId, { skipLLM: !!(req.body && req.body.skipLLM) }), 201);
  } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});

router.post('/judge/batch', async (req, res) => {
  try {
    const runIds = (req.body && req.body.runIds) || [];
    if (!Array.isArray(runIds) || !runIds.length) return res.status(400).json({ success: false, error: 'runIds[] is required' });
    ok(res, { results: await judge.judgeBatch(runIds, { skipLLM: !!(req.body && req.body.skipLLM) }) }, 201);
  } catch (e) { fail(res, e); }
});

// Record a human judgement (calibration).
router.post('/judge/run/:runId/human', async (req, res) => {
  try {
    ok(res, await judge.recordHumanJudgement(req.params.runId, req.body || {}), 201);
  } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});

router.get('/judge/run/:runId', async (req, res) => {
  try {
    const records = await judge.getRecordsForRun(req.params.runId);
    ok(res, records);
  } catch (e) { fail(res, e); }
});

router.get('/judge/records', async (req, res) => {
  try {
    const { verdict, runId, judgeModel, minScore, limit, offset } = req.query;
    ok(res, await judge.listRecords({ verdict, runId, judgeModel, minScore, limit, offset }));
  } catch (e) { fail(res, e); }
});

// ── optimization / GEPA infrastructure (ШАГ 7A) ────────────────────────────────
router.get('/optimizations', async (req, res) => {
  try { ok(res, await candidateStore.listOptimizationRuns({ status: req.query.status })); } catch (e) { fail(res, e); }
});
router.get('/optimizations/:id', async (req, res) => {
  try {
    const opt = await candidateStore.getOptimizationRun(req.params.id);
    if (!opt) return res.status(404).json({ success: false, error: 'Optimization run not found' });
    const candidates = await candidateStore.getCandidatesForOptimization(req.params.id);
    ok(res, { ...opt, candidates });
  } catch (e) { fail(res, e); }
});
router.get('/optimizations/:id/candidates', async (req, res) => {
  try { ok(res, await candidateStore.getCandidatesForOptimization(req.params.id)); } catch (e) { fail(res, e); }
});

router.get('/candidates/compare', async (req, res) => {
  try {
    const [c1, c2] = await Promise.all([candidateStore.getCandidate(req.query.c1), candidateStore.getCandidate(req.query.c2)]);
    if (!c1 || !c2) return res.status(404).json({ success: false, error: 'candidate(s) not found' });
    ok(res, comparison.compareCandidates(c1, c2));
  } catch (e) { fail(res, e); }
});
router.get('/candidates/:id', async (req, res) => {
  try {
    const c = await candidateStore.getCandidate(req.params.id);
    if (!c) return res.status(404).json({ success: false, error: 'Candidate not found' });
    ok(res, c);
  } catch (e) { fail(res, e); }
});

// ── GEPA loop (ШАГ 7B) ─────────────────────────────────────────────────────────
// Start an optimization (async). Returns the optimizationId; runs in background.
router.post('/optimizations/start', async (req, res) => {
  try {
    // An optimization is hundreds of runs and real money; a broken dependency
    // here wastes both and teaches the optimizer to fix a prompt that is fine.
    if (!await preflightGate(req, res)) return;
    ok(res, await gepa.startOptimization(req.body || {}), 201);
  } catch (e) { fail(res, e); }
});
// Stop a running optimization (ends cleanly after the current run).
router.post('/optimizations/:id/stop', async (req, res) => {
  try { gepa.requestStop(req.params.id); ok(res, { stopped: true, optimizationId: req.params.id }); } catch (e) { fail(res, e); }
});
// SSE progress stream for an optimization.
router.get('/optimizations/:id/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
  res.write(`event: connected\ndata: ${JSON.stringify({ optimizationId: req.params.id })}\n\n`);
  const bus = gepa.busFor(req.params.id);
  const onProgress = (ev) => { try { res.write(`event: progress\ndata: ${JSON.stringify(ev)}\n\n`); } catch { /* ignore */ } };
  bus.on('progress', onProgress);
  req.on('close', () => bus.off('progress', onProgress));
});

// ── governance (ratification of optimized prompts) ────────────────────────────
router.get('/governance/request/:candidateId', async (req, res) => {
  try { ok(res, await governance.createApprovalRequest(req.params.candidateId)); } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});
router.post('/governance/approve', async (req, res) => {
  try {
    const { candidateId, approvedBy } = req.body || {};
    if (!candidateId) return res.status(400).json({ success: false, error: 'candidateId is required' });
    ok(res, await governance.approve(candidateId, approvedBy || (req.headers['x-agent-id'] || 'admin')));
  } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});
router.post('/governance/reject', async (req, res) => {
  try {
    const { candidateId, rejectedBy, reason } = req.body || {};
    if (!candidateId) return res.status(400).json({ success: false, error: 'candidateId is required' });
    ok(res, await governance.reject(candidateId, rejectedBy || 'admin', reason));
  } catch (e) { fail(res, e, /not found/i.test(e.message) ? 404 : 500); }
});

module.exports = router;
