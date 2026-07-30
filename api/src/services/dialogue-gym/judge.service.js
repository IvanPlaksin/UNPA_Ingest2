'use strict';

/**
 * JudgeService — multi-criteria evaluation of an ArenaRun (P2).
 *
 * Two phases:
 *   1. DETERMINISTIC (no LLM, instant): intentAccuracy vs ratified ground truth,
 *      turnsToIdentify, clarificationEfficiency.
 *   2. LLM RUBRIC (Sonnet by default): grounding, tone (UN-collegial),
 *      controlsCorrectness, helpfulness — each scored 0..1 with a one-line note.
 *
 * The rubric prompt scaffold is a fork of session-analysis.service (same
 * structuredOutput seam) retargeted from prompt-overlay recommendations to pure
 * evaluation. Overall score is a weighted blend over the criteria that are
 * present (deterministic-only runs simply omit the LLM weights).
 *
 * Calibrated on a golden set BEFORE any optimization (Nubank lesson): a human
 * (judge-manual.js, judgeModel="human:ivan") labels the same runs and Cohen's κ
 * is computed between human and LLM verdicts.
 *
 * All collaborators injectable → deterministic phase is unit-testable with no DB
 * or LLM.
 *
 * @module services/dialogue-gym/judge.service
 */

const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const JUDGE_PROMPT_VERSION = 'v1';

const SCORE_WEIGHTS = {
  intentAccuracy: 0.30,        // most important — right service identified?
  clarificationEfficiency: 0.15,
  grounding: 0.20,
  tone: 0.10,
  controlsCorrectness: 0.10,
  helpfulness: 0.15,
};

// ── PHASE 1 — deterministic metrics (pure, exported) ───────────────────────────

/** Same service family when the first 3 code segments match (EO-HR-BE-* ≈ EO-HR-BE-*). */
function sameServiceDomain(a, b) {
  if (!a || !b) return false;
  const seg = (c) => String(c).split('-').slice(0, 3).join('-');
  return seg(a) === seg(b);
}

function findFirstIdentificationTurn(turns) {
  for (const t of turns || []) {
    if (t.identifiedService) return t.turnIndex;
  }
  return null;
}

/**
 * @param {object} run       finalized ArenaRun (identifiedServiceCode, ...)
 * @param {Array}  turns     ArenaTurn[]
 * @param {object} scenario  DialogueGymScenario (expectedServiceCode, groundTruthVerified)
 */
function computeDeterministicMetrics(run, turns, scenario) {
  const expected = scenario ? scenario.expectedServiceCode : null;
  const verified = scenario ? Boolean(scenario.groundTruthVerified) : false;
  const identified = run ? run.identifiedServiceCode : null;

  let intentAccuracy;
  let intentAccuracyScore;
  if (expected == null) {
    // Edge-case scenario. If ground truth is ratified as "no single service",
    // the CORRECT behaviour is to NOT force a service (deflect / disambiguate).
    if (verified) {
      intentAccuracy = identified ? 'incorrect' : 'correct';
      intentAccuracyScore = identified ? 0.0 : 1.0;
    } else {
      intentAccuracy = 'not_applicable';
      intentAccuracyScore = null; // excluded from the weighted overall
    }
  } else if (identified && identified === expected) {
    intentAccuracy = 'correct'; intentAccuracyScore = 1.0;
  } else if (identified && sameServiceDomain(identified, expected)) {
    intentAccuracy = 'partial'; intentAccuracyScore = 0.5;
  } else {
    intentAccuracy = 'incorrect'; intentAccuracyScore = 0.0; // wrong service or none
  }

  const turnsToIdentify = findFirstIdentificationTurn(turns);
  let clarificationEfficiencyScore = 0.0;
  if (turnsToIdentify !== null) {
    if (turnsToIdentify <= 1) clarificationEfficiencyScore = 1.0;
    else if (turnsToIdentify <= 3) clarificationEfficiencyScore = 0.7;
    else if (turnsToIdentify <= 6) clarificationEfficiencyScore = 0.4;
    else clarificationEfficiencyScore = 0.2;
  }

  return { intentAccuracy, intentAccuracyScore, turnsToIdentify, clarificationEfficiencyScore };
}

function computeOverallScore(det, llm = {}) {
  let sum = 0;
  let w = 0;
  const add = (score, weight) => { if (typeof score === 'number') { sum += score * weight; w += weight; } };
  add(det.intentAccuracyScore, SCORE_WEIGHTS.intentAccuracy);
  add(det.clarificationEfficiencyScore, SCORE_WEIGHTS.clarificationEfficiency);
  add(llm.groundingScore, SCORE_WEIGHTS.grounding);
  add(llm.toneScore, SCORE_WEIGHTS.tone);
  add(llm.controlsCorrectnessScore, SCORE_WEIGHTS.controlsCorrectness);
  add(llm.helpfulnessScore, SCORE_WEIGHTS.helpfulness);
  return w > 0 ? sum / w : 0;
}

function scoreToVerdict(score) {
  if (score >= 0.85) return 'excellent';
  if (score >= 0.70) return 'good';
  if (score >= 0.50) return 'acceptable';
  if (score >= 0.30) return 'poor';
  return 'failure';
}

// ── PHASE 2 — LLM rubric ────────────────────────────────────────────────────────

const JUDGE_SCHEMA = {
  type: 'object',
  description: 'Multi-criteria quality scores for a service-desk dialogue.',
  properties: {
    groundingScore: { type: 'number', description: '0..1 — factual claims supported by KB / no hallucinated services.' },
    groundingNotes: { type: 'string' },
    toneScore: { type: 'number', description: '0..1 — UN-collegial: polite but not over-formal or robotic.' },
    toneNotes: { type: 'string' },
    controlsCorrectnessScore: { type: 'number', description: '0..1 — right UI controls (choices/forms) shown at the right time.' },
    controlsCorrectnessNotes: { type: 'string' },
    helpfulnessScore: { type: 'number', description: '0..1 — did the agent move the user toward their goal.' },
    helpfulnessNotes: { type: 'string' },
    summaryNotes: { type: 'string', description: '1-2 sentence overall assessment.' },
  },
  required: ['groundingScore', 'toneScore', 'controlsCorrectnessScore', 'helpfulnessScore', 'summaryNotes'],
};

const RUBRIC = [
  'You are a strict but fair evaluator of a dialogue between a UN staff user and an IT/HR service-desk chatbot.',
  'Score each criterion 0.0–1.0 and give a one-sentence note. Be evidence-based; cite what the agent did.',
  '',
  'CRITERIA:',
  '1. grounding — factual claims are supported by the knowledge base; the agent invents no non-existent services or facts. 1.0 = all accurate; 0.0 = major hallucination.',
  '2. tone — UN collegial register: polite and warm but NOT bureaucratic, robotic, or over-familiar. 1.0 = natural professional; 0.0 = rude/dismissive or stiff boilerplate.',
  '3. controlsCorrectness — the agent offered the right interactive controls (disambiguation choices, forms) at the right moment with clear labels. 1.0 = well-timed & relevant; 0.0 = none when needed or wrong ones.',
  '4. helpfulness — overall, did the agent move the user toward their goal (or a correct handoff)? 1.0 = goal achieved / clear path; 0.0 = user no better off.',
].join('\n');

function formatTranscript(turns) {
  return (turns || []).map((t) => {
    const ctrl = (() => { try { const c = t.controls; return Array.isArray(c) && c.length ? ` [controls: ${c.map((x) => x.type || x.id).join(',')}]` : ''; } catch { return ''; } })();
    return `#${t.turnIndex} USER: ${t.userMessage}\n#${t.turnIndex} AGENT${ctrl}: ${t.agentResponse}`;
  }).join('\n');
}

function buildJudgePrompt(run, turns, scenario, persona, det) {
  return [
    RUBRIC,
    '',
    '## User goal',
    scenario ? scenario.userGoal : '(unknown)',
    '',
    `## User persona`,
    persona ? `${persona.name} — domain knowledge: ${persona.domainKnowledge}, cooperativeness: ${persona.cooperativeness}, language: ${persona.language}` : '(unknown)',
    '',
    '## Dialogue transcript',
    formatTranscript(turns),
    '',
    '## Pre-computed facts (do not re-judge intent identification — it is deterministic)',
    `Expected service: ${scenario && scenario.expectedServiceCode ? scenario.expectedServiceCode : 'N/A (no single correct service — deflection/disambiguation expected)'}`,
    `Agent identified service: ${run.identifiedServiceCode || 'none'}`,
    `Intent accuracy (deterministic): ${det.intentAccuracy}`,
    `Terminal condition: ${run.terminalCondition}`,
    '',
    'Now score grounding, tone, controlsCorrectness, helpfulness for THIS dialogue and give a summary.',
  ].join('\n');
}

// ── service factory ──────────────────────────────────────────────────────────────

function createJudge(deps = {}) {
  const arena = deps.arena || require('./arena-runner.service');
  const gym = deps.gym || require('./dialogue-gym.service');
  const store = deps.store || require('./judge-store').memgraphJudgeStore();
  const { recordFromNode } = require('./judge-store');
  const getLlm = deps.llm
    ? () => deps.llm
    : () => require('../ai/llm-provider').getLLMProvider({
      provider: process.env.FLOWDESK_LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude-code',
      model: process.env.DIALOGUE_GYM_JUDGE_MODEL || process.env.FLOWDESK_ADMIN_ANALYSIS_MODEL || 'claude-sonnet-4-6',
    });

  async function evaluateWithLLM(run, turns, scenario, persona, det) {
    const llm = getLlm();
    const prompt = buildJudgePrompt(run, turns, scenario, persona, det);
    const res = await llm.structuredOutput(prompt, JUDGE_SCHEMA, { temperature: 0.2, maxTokens: 900 });
    const d = res.data || {};
    const clamp = (v) => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : null);
    return {
      groundingScore: clamp(d.groundingScore), groundingNotes: d.groundingNotes || null,
      toneScore: clamp(d.toneScore), toneNotes: d.toneNotes || null,
      controlsCorrectnessScore: clamp(d.controlsCorrectnessScore), controlsCorrectnessNotes: d.controlsCorrectnessNotes || null,
      helpfulnessScore: clamp(d.helpfulnessScore), helpfulnessNotes: d.helpfulnessNotes || null,
      summaryNotes: d.summaryNotes || null,
      _model: res.model || null,
      _tokens: (res.inputTokens || 0) + (res.outputTokens || 0),
      _cost: res.costUsd || 0,
    };
  }

  /**
   * Judge one run.
   * @param {string} runId
   * @param {object} [options] { skipLLM, judgeModel }
   */
  async function judgeRun(runId, options = {}) {
    const detail = await arena.getRun(runId);
    if (!detail) throw Object.assign(new Error(`arena run ${runId} not found`), { status: 404 });
    const { run, turns } = detail;
    const scenario = await gym.getScenario(run.scenarioId);
    const persona = await gym.getPersona(run.personaId);

    const det = computeDeterministicMetrics(run, turns, scenario);

    let llm = {};
    if (!options.skipLLM) {
      llm = await evaluateWithLLM(run, turns, scenario, persona, det);
    }

    const overallScore = computeOverallScore(det, llm);
    const record = {
      judgeId: uuid(),
      runId,
      intentAccuracy: det.intentAccuracy,
      intentAccuracyScore: det.intentAccuracyScore,
      turnsToIdentify: det.turnsToIdentify,
      clarificationEfficiencyScore: det.clarificationEfficiencyScore,
      groundingScore: llm.groundingScore ?? null,
      groundingNotes: llm.groundingNotes ?? null,
      toneScore: llm.toneScore ?? null,
      toneNotes: llm.toneNotes ?? null,
      controlsCorrectnessScore: llm.controlsCorrectnessScore ?? null,
      controlsCorrectnessNotes: llm.controlsCorrectnessNotes ?? null,
      helpfulnessScore: llm.helpfulnessScore ?? null,
      helpfulnessNotes: llm.helpfulnessNotes ?? null,
      overallScore,
      overallVerdict: scoreToVerdict(overallScore),
      summaryNotes: llm.summaryNotes ?? null,
      judgedAt: nowIso(),
      judgeModel: options.skipLLM ? 'deterministic-only' : (llm._model || options.judgeModel || 'llm'),
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      llmTokens: llm._tokens || 0,
      llmCostUsd: llm._cost || 0,
      namespace: 'CORE',
    };
    await store.saveJudgeRecord(record);
    return record;
  }

  /**
   * Persist a human evaluation (calibration). Deterministic metrics are recomputed
   * from the run; the human supplies the rubric scores.
   * @param {string} runId
   * @param {object} scores {groundingScore,toneScore,controlsCorrectnessScore,helpfulnessScore,summaryNotes,by}
   */
  async function recordHumanJudgement(runId, scores = {}) {
    const detail = await arena.getRun(runId);
    if (!detail) throw Object.assign(new Error(`arena run ${runId} not found`), { status: 404 });
    const { run, turns } = detail;
    const scenario = await gym.getScenario(run.scenarioId);
    const det = computeDeterministicMetrics(run, turns, scenario);
    const llm = {
      groundingScore: scores.groundingScore, toneScore: scores.toneScore,
      controlsCorrectnessScore: scores.controlsCorrectnessScore, helpfulnessScore: scores.helpfulnessScore,
    };
    const overallScore = computeOverallScore(det, llm);
    const record = {
      judgeId: uuid(), runId,
      intentAccuracy: det.intentAccuracy, intentAccuracyScore: det.intentAccuracyScore,
      turnsToIdentify: det.turnsToIdentify, clarificationEfficiencyScore: det.clarificationEfficiencyScore,
      groundingScore: scores.groundingScore ?? null, groundingNotes: scores.groundingNotes ?? null,
      toneScore: scores.toneScore ?? null, toneNotes: scores.toneNotes ?? null,
      controlsCorrectnessScore: scores.controlsCorrectnessScore ?? null, controlsCorrectnessNotes: scores.controlsCorrectnessNotes ?? null,
      helpfulnessScore: scores.helpfulnessScore ?? null, helpfulnessNotes: scores.helpfulnessNotes ?? null,
      overallScore, overallVerdict: scoreToVerdict(overallScore),
      summaryNotes: scores.summaryNotes ?? null,
      judgedAt: nowIso(), judgeModel: `human:${scores.by || 'ivan'}`, judgePromptVersion: JUDGE_PROMPT_VERSION,
      llmTokens: 0, llmCostUsd: 0, namespace: 'CORE',
    };
    await store.saveJudgeRecord(record);
    return record;
  }

  async function judgeBatch(runIds, options = {}) {
    const results = [];
    for (const runId of runIds) {
      try { results.push({ runId, success: true, record: await judgeRun(runId, options) }); }
      catch (e) { results.push({ runId, success: false, error: e.message }); }
      if (options.onProgress) options.onProgress(results[results.length - 1]);
    }
    return results;
  }

  async function getRecordsForRun(runId) {
    return (await store.getJudgeRecordsForRun(runId)).map(recordFromNode);
  }
  async function listRecords(filters = {}) {
    let items = (await store.listJudgeRecords()).map(recordFromNode).filter(Boolean);
    if (filters.verdict) items = items.filter((r) => r.overallVerdict === filters.verdict);
    if (filters.runId) items = items.filter((r) => r.runId === filters.runId);
    if (filters.judgeModel) items = items.filter((r) => String(r.judgeModel).includes(filters.judgeModel));
    if (filters.minScore != null) items = items.filter((r) => r.overallScore >= Number(filters.minScore));
    items.sort((a, b) => String(b.judgedAt).localeCompare(String(a.judgedAt)));
    const total = items.length;
    const limit = Math.max(1, parseInt(filters.limit, 10) || 50);
    const offset = Math.max(0, parseInt(filters.offset, 10) || 0);
    return { items: items.slice(offset, offset + limit), total };
  }

  return {
    judgeRun, judgeBatch, recordHumanJudgement, getRecordsForRun, listRecords,
    ensureIndexes: () => store.ensureIndexes(),
    computeDeterministicMetrics, computeOverallScore, scoreToVerdict,
    SCORE_WEIGHTS, JUDGE_SCHEMA, JUDGE_PROMPT_VERSION,
  };
}

const singleton = createJudge();
module.exports = singleton;
module.exports.createJudge = createJudge;
module.exports.computeDeterministicMetrics = computeDeterministicMetrics;
module.exports.computeOverallScore = computeOverallScore;
module.exports.scoreToVerdict = scoreToVerdict;
module.exports.sameServiceDomain = sameServiceDomain;
module.exports.SCORE_WEIGHTS = SCORE_WEIGHTS;
module.exports.JUDGE_SCHEMA = JUDGE_SCHEMA;
