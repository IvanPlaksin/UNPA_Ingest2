'use strict';

/**
 * JudgeService unit tests — deterministic phase + aggregation + LLM-fake path.
 * No DB, no live LLM.
 */

const {
  createJudge,
  computeDeterministicMetrics,
  computeOverallScore,
  scoreToVerdict,
  sameServiceDomain,
} = require('../judge.service');

describe('Judge — deterministic metrics', () => {
  const turns = (codeAtTurn) => codeAtTurn.map((c, i) => ({ turnIndex: i, identifiedService: c }));

  test('correct identification → score 1.0', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: 'EO-HR-BE-EG-EGC' },
      turns([null, 'EO-HR-BE-EG-EGC']),
      { expectedServiceCode: 'EO-HR-BE-EG-EGC', groundTruthVerified: true }
    );
    expect(d.intentAccuracy).toBe('correct');
    expect(d.intentAccuracyScore).toBe(1.0);
    expect(d.turnsToIdentify).toBe(1);
    expect(d.clarificationEfficiencyScore).toBe(1.0);
  });

  test('same-domain sibling → partial 0.5', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: 'EO-HR-BE-EG-OTHER' },
      turns(['EO-HR-BE-EG-OTHER']),
      { expectedServiceCode: 'EO-HR-BE-EG-EGC', groundTruthVerified: true }
    );
    expect(d.intentAccuracy).toBe('partial');
    expect(d.intentAccuracyScore).toBe(0.5);
  });

  test('wrong service → incorrect 0.0', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: 'EO-FIN-PAY-INQ' },
      turns(['EO-FIN-PAY-INQ']),
      { expectedServiceCode: 'EO-HR-BE-EG-EGC', groundTruthVerified: true }
    );
    expect(d.intentAccuracy).toBe('incorrect');
    expect(d.intentAccuracyScore).toBe(0.0);
  });

  test('no identification → incorrect 0.0, efficiency 0', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: null },
      turns([null, null]),
      { expectedServiceCode: 'EO-HR-BE-EG-EGC', groundTruthVerified: true }
    );
    expect(d.intentAccuracy).toBe('incorrect');
    expect(d.turnsToIdentify).toBeNull();
    expect(d.clarificationEfficiencyScore).toBe(0.0);
  });

  test('edge-case verified null: no service resolved → correct 1.0', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: null },
      turns([null, null]),
      { expectedServiceCode: null, groundTruthVerified: true }
    );
    expect(d.intentAccuracy).toBe('correct');
    expect(d.intentAccuracyScore).toBe(1.0);
  });

  test('edge-case verified null: forced a service → incorrect 0.0', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: 'EO-HR-X' },
      turns(['EO-HR-X']),
      { expectedServiceCode: null, groundTruthVerified: true }
    );
    expect(d.intentAccuracy).toBe('incorrect');
    expect(d.intentAccuracyScore).toBe(0.0);
  });

  test('unverified null → not_applicable, score excluded (null)', () => {
    const d = computeDeterministicMetrics(
      { identifiedServiceCode: null }, turns([null]),
      { expectedServiceCode: null, groundTruthVerified: false }
    );
    expect(d.intentAccuracy).toBe('not_applicable');
    expect(d.intentAccuracyScore).toBeNull();
  });

  test('efficiency bands by turnsToIdentify', () => {
    const mk = (idx) => computeDeterministicMetrics(
      { identifiedServiceCode: 'X' },
      Array.from({ length: idx + 1 }, (_, i) => ({ turnIndex: i, identifiedService: i === idx ? 'X' : null })),
      { expectedServiceCode: 'X', groundTruthVerified: true }
    ).clarificationEfficiencyScore;
    expect(mk(0)).toBe(1.0);
    expect(mk(3)).toBe(0.7);
    expect(mk(5)).toBe(0.4);
    expect(mk(8)).toBe(0.2);
  });
});

describe('Judge — aggregation', () => {
  test('sameServiceDomain compares first 3 segments', () => {
    expect(sameServiceDomain('EO-HR-BE-EG-EGC', 'EO-HR-BE-DA-DA')).toBe(true);
    expect(sameServiceDomain('EO-HR-BE-EG-EGC', 'EO-FIN-PAY-INQ')).toBe(false);
    expect(sameServiceDomain(null, 'X')).toBe(false);
  });

  test('overall omits absent LLM criteria (deterministic-only)', () => {
    const det = { intentAccuracyScore: 1.0, clarificationEfficiencyScore: 1.0 };
    const s = computeOverallScore(det, {});
    expect(s).toBeCloseTo(1.0, 5); // only det weights present → normalized to 1.0
  });

  test('overall blends det + llm weighted', () => {
    const det = { intentAccuracyScore: 1.0, clarificationEfficiencyScore: 0.0 };
    const llm = { groundingScore: 0.5, toneScore: 1.0, controlsCorrectnessScore: 0.0, helpfulnessScore: 1.0 };
    const s = computeOverallScore(det, llm);
    // weights: intent .30*1 + clar .15*0 + ground .20*.5 + tone .10*1 + ctrl .10*0 + help .15*1 = .30+.10+.10+.15=.65 / 1.0
    expect(s).toBeCloseTo(0.65, 5);
  });

  test('scoreToVerdict bands', () => {
    expect(scoreToVerdict(0.9)).toBe('excellent');
    expect(scoreToVerdict(0.75)).toBe('good');
    expect(scoreToVerdict(0.55)).toBe('acceptable');
    expect(scoreToVerdict(0.35)).toBe('poor');
    expect(scoreToVerdict(0.1)).toBe('failure');
  });
});

describe('Judge — judgeRun with fakes', () => {
  function fakeStore() {
    const recs = [];
    return { recs, async ensureIndexes() {}, async saveJudgeRecord(n) { recs.push({ ...n }); return n; },
      async getJudgeRecord() { return null; }, async getJudgeRecordsForRun(runId) { return recs.filter((r) => r.runId === runId); }, async listJudgeRecords() { return recs; } };
  }
  const arena = {
    async getRun() {
      return {
        run: { runId: 'r1', scenarioId: 's1', personaId: 'p1', identifiedServiceCode: 'EO-HR-BE-EG-EGC', terminalCondition: 'service_matched' },
        turns: [{ turnIndex: 0, userMessage: 'hi', agentResponse: 'which one?', identifiedService: null, controls: [{ type: 'choice' }] },
          { turnIndex: 1, userMessage: 'that one', agentResponse: 'ok', identifiedService: 'EO-HR-BE-EG-EGC' }],
      };
    },
  };
  const gym = {
    async getScenario() { return { scenarioId: 's1', userGoal: 'claim grant', expectedServiceCode: 'EO-HR-BE-EG-EGC', groundTruthVerified: true }; },
    async getPersona() { return { name: 'New HR', domainKnowledge: 'symptom_only', cooperativeness: 'cooperative', language: 'en' }; },
  };

  test('skipLLM → deterministic-only record', async () => {
    const store = fakeStore();
    const j = createJudge({ arena, gym, store });
    const rec = await j.judgeRun('r1', { skipLLM: true });
    expect(rec.judgeModel).toBe('deterministic-only');
    expect(rec.intentAccuracy).toBe('correct');
    expect(rec.overallScore).toBeGreaterThan(0);
    expect(rec.groundingScore).toBeNull();
    expect(store.recs).toHaveLength(1);
  });

  test('with fake LLM → full rubric record', async () => {
    const store = fakeStore();
    const llm = { structuredOutput: async () => ({ data: { groundingScore: 0.9, toneScore: 0.8, controlsCorrectnessScore: 1.0, helpfulnessScore: 0.9, summaryNotes: 'good' }, model: 'fake', inputTokens: 10, outputTokens: 20, costUsd: 0.001 }) };
    const j = createJudge({ arena, gym, store, llm });
    const rec = await j.judgeRun('r1');
    expect(rec.groundingScore).toBe(0.9);
    expect(rec.toneScore).toBe(0.8);
    expect(rec.overallVerdict).toBe('excellent');
    expect(rec.llmTokens).toBe(30);
    expect(rec.summaryNotes).toBe('good');
  });

  test('recordHumanJudgement stamps human model', async () => {
    const store = fakeStore();
    const j = createJudge({ arena, gym, store });
    const rec = await j.recordHumanJudgement('r1', { groundingScore: 1, toneScore: 1, controlsCorrectnessScore: 1, helpfulnessScore: 1, by: 'ivan' });
    expect(rec.judgeModel).toBe('human:ivan');
    expect(rec.overallVerdict).toBe('excellent');
  });
});
