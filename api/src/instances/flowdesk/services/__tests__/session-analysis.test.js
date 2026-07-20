'use strict';

/**
 * ADMIN P5 — session-analysis agent + prompt overlays (fakes; no Memgraph/LLM).
 */

const { createSessionAnalysis } = require('../session-analysis.service');
const overlaySvc = require('../prompt-overlay.service');
const { runQuestionPlanner } = require('../../contracts/llm-provider.stub');

const SESSION = {
  sessionId: 's1', serviceId: 'EO-HR-SA-SS-ISP', outcome: 'completed',
  turns: 4, repairSession: 2, outOfScopeTurns: 0, errorTurns: 0, srNumber: 'TKT-1',
};
const TURNS = [
  { seq: 1, route: 'NEW_INTENT', userText: 'separation please', agentText: 'What notes?' },
  { seq: 2, route: 'SLOT_FILL', userText: 'contract end', agentText: 'Are supporting documents attached?' },
];
const SNAPSHOT = {
  serviceId: 'EO-HR-SA-SS-ISP', version: 1, phases: ['detail'],
  metadata: { title: 'Initiate Separation Process' },
  slots: [
    { slotId: 'notes', type: 'text', required: true, phase: 'detail', promptHint: 'Additional notes' },
    { slotId: 'docs', type: 'enum', required: true, phase: 'detail', presentOptions: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  ],
};
const ANALYSIS = {
  successAssessment: { userGoalAchieved: 'achieved', score: 0.9, summary: 'Ticket created smoothly.' },
  problems: [{ category: 'schema_clarity', description: 'docs field unclear', evidenceTurns: [2] }],
  generalPromptRecommendation: { needed: false },
  schemaPromptRecommendation: { needed: true, proposedText: 'Explain which documents are meant.', rationale: 'User hesitated.' },
  schemaClarityFindings: [{ slotId: 'docs', issue: 'jargon', suggestion: 'List examples of documents' }],
};

describe('session-analysis agent', () => {
  const mkSvc = ({ session = SESSION, llmData = ANALYSIS } = {}) => {
    const persisted = [];
    const llmCalls = [];
    const svc = createSessionAnalysis({
      llm: { structuredOutput: async (prompt, schema) => { llmCalls.push({ prompt, schema }); return { data: llmData }; } },
      getSessionData: async () => ({ session, draft: { status: 'submitted', slots: {}, repair: { session: 2 } }, turns: TURNS }),
      loadSnapshot: async () => SNAPSHOT,
      persist: async (id, analysis, model) => persisted.push({ id, analysis, model }),
    });
    return { svc, persisted, llmCalls };
  };

  test('runs the LLM with transcript + schema and persists the result', async () => {
    const { svc, persisted, llmCalls } = mkSvc();
    const res = await svc.analyzeSession('s1');
    expect(res.cached).toBe(false);
    expect(res.analysis.successAssessment.userGoalAchieved).toBe('achieved');
    expect(persisted).toHaveLength(1);
    const prompt = llmCalls[0].prompt;
    expect(prompt).toContain('separation please');                    // transcript
    expect(prompt).toContain('Initiate Separation Process');          // schema
    expect(prompt).toContain('- docs (type:enum');                    // field review input
    expect(prompt).toContain('outcome: completed');                   // metadata
  });

  test('returns cached analysis without an LLM call unless force', async () => {
    const cachedSession = { ...SESSION, analysisJson: JSON.stringify(ANALYSIS), analyzedAt: 'T', analysisModel: 'm' };
    const { svc, llmCalls } = mkSvc({ session: cachedSession });
    const res = await svc.analyzeSession('s1');
    expect(res.cached).toBe(true);
    expect(llmCalls).toHaveLength(0);
    const res2 = await svc.analyzeSession('s1', { force: true });
    expect(res2.cached).toBe(false);
    expect(llmCalls).toHaveLength(1);
  });

  test('schema recommendation is disabled when no service was resolved', async () => {
    const { svc } = mkSvc({ session: { ...SESSION, serviceId: null } });
    const res = await svc.analyzeSession('s1');
    expect(res.analysis.schemaPromptRecommendation.needed).toBe(false);
  });

  test('409 when the session has no recorded turns', async () => {
    const svc = createSessionAnalysis({
      llm: { structuredOutput: async () => ({ data: ANALYSIS }) },
      getSessionData: async () => ({ session: SESSION, draft: null, turns: [] }),
      loadSnapshot: async () => SNAPSHOT,
      persist: async () => {},
    });
    await expect(svc.analyzeSession('s1')).rejects.toMatchObject({ status: 409 });
  });
});

describe('prompt-overlay service (fake graph)', () => {
  const nodes = [];
  const fake = {
    write: async (cypher, params) => {
      if (cypher.startsWith('CREATE')) { nodes.push({ ...params }); return []; }
      if (cypher.includes('SET o.active')) {
        const n = nodes.find((x) => x.overlayId === params.overlayId);
        if (!n) return [];
        n.active = params.active;
        return [{ get: () => ({ properties: n }) }];
      }
      return [];
    },
    read: async (cypher, params) => {
      let list = nodes.filter((n) => !params.scope || n.scope === params.scope);
      if (params.serviceId) list = list.filter((n) => n.serviceId === params.serviceId);
      if (cypher.includes('o.active = true')) list = list.filter((n) => n.active);
      if (cypher.includes('RETURN o.text AS text')) return list.map((n) => ({ get: () => n.text }));
      return list.map((n) => ({ get: () => ({ properties: n }) }));
    },
  };
  beforeEach(() => { nodes.length = 0; overlaySvc._setDeps(fake); });
  afterEach(() => overlaySvc._setDeps({}));

  test('apply + getGuidance for both scopes', async () => {
    await overlaySvc.applyOverlay({ scope: 'global', text: 'Always confirm the beneficiary explicitly.' });
    await overlaySvc.applyOverlay({ scope: 'service', serviceId: 'EO-HR-SA-SS-ISP', text: 'Explain which supporting documents are meant.' });
    const g = await overlaySvc.getGuidance('EO-HR-SA-SS-ISP');
    expect(g.global).toContain('Always confirm');
    expect(g.service).toContain('supporting documents');
    const other = await overlaySvc.getGuidance('EO-FIN-GM-GA-ACA');
    expect(other.service).toBe(null);
  });

  test('deactivated overlays drop out of guidance', async () => {
    const o = await overlaySvc.applyOverlay({ scope: 'global', text: 'Temporary guidance for testing.' });
    await overlaySvc.setOverlayActive(o.overlayId, false);
    const g = await overlaySvc.getGuidance(null);
    expect(g.global).toBe(null);
  });

  test('validation: scope, service requirement, length', async () => {
    await expect(overlaySvc.applyOverlay({ scope: 'nope', text: 'x'.repeat(20) })).rejects.toMatchObject({ status: 400 });
    await expect(overlaySvc.applyOverlay({ scope: 'service', text: 'x'.repeat(20) })).rejects.toMatchObject({ status: 400 });
    await expect(overlaySvc.applyOverlay({ scope: 'global', text: 'short' })).rejects.toMatchObject({ status: 400 });
    await expect(overlaySvc.applyOverlay({ scope: 'global', text: 'x'.repeat(3000) })).rejects.toMatchObject({ status: 400 });
  });

  test('getGuidance never throws (store failure → empty)', async () => {
    overlaySvc._setDeps({ read: async () => { throw new Error('down'); }, write: fake.write });
    const g = await overlaySvc.getGuidance('X');
    expect(g).toEqual({ global: null, service: null });
  });
});

describe('runQuestionPlanner guidance passthrough', () => {
  test('guidance is appended to the prompt; absent → unchanged', async () => {
    const calls = [];
    const provider = { completion: async (prompt) => { calls.push(prompt); return { text: 'Q?' }; } };
    const snapshot = { slots: [{ slotId: 'a', promptHint: 'thing' }] };
    await runQuestionPlanner(provider, { snapshot, unfilledSlotIds: ['a'], lang: 'en', guidance: 'Be extra specific about dates.' });
    expect(calls[0]).toContain('Operator guidance');
    expect(calls[0]).toContain('extra specific about dates');
    await runQuestionPlanner(provider, { snapshot, unfilledSlotIds: ['a'], lang: 'en' });
    expect(calls[1]).not.toContain('Operator guidance');
  });
});
