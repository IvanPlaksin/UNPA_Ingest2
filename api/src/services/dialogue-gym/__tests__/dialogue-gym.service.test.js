'use strict';

/**
 * Dialogue Gym service unit tests (ШАГ 2 / P1).
 * Uses an in-memory fake repo so the suite never needs a live Memgraph.
 */

const {
  createDialogueGymService,
  personaMatches,
  scenarioMatches,
} = require('../dialogue-gym.service');

// ── in-memory fake repo (mirrors the memgraphRepo interface) ──────────────────
function fakeRepo() {
  const personas = new Map(); // personaId -> node props
  const scenarios = new Map(); // scenarioId -> node props
  const edges = []; // {personaId, scenarioId, weight, notes}
  return {
    _personas: personas,
    _scenarios: scenarios,
    _edges: edges,
    async ensureIndexes() {},
    async savePersona(node) { personas.set(node.personaId, { ...node }); return node; },
    async getPersona(id) { const n = personas.get(id); return n ? { ...n } : null; },
    async listPersonas() { return [...personas.values()].map((n) => ({ ...n })); },
    async saveScenario(node) { scenarios.set(node.scenarioId, { ...node }); return node; },
    async getScenario(id) { const n = scenarios.get(id); return n ? { ...n } : null; },
    async listScenarios() { return [...scenarios.values()].map((n) => ({ ...n })); },
    async putEdge(personaId, scenarioId, props) {
      const e = edges.find((x) => x.personaId === personaId && x.scenarioId === scenarioId);
      if (e) Object.assign(e, props);
      else edges.push({ personaId, scenarioId, ...props });
    },
    async delEdge(personaId, scenarioId) {
      const i = edges.findIndex((x) => x.personaId === personaId && x.scenarioId === scenarioId);
      if (i >= 0) edges.splice(i, 1);
    },
    async personasForScenario(scenarioId) {
      return edges.filter((e) => e.scenarioId === scenarioId)
        .map((e) => ({ persona: personas.get(e.personaId), weight: e.weight, notes: e.notes }))
        .filter((x) => x.persona);
    },
    async scenariosForPersona(personaId) {
      return edges.filter((e) => e.personaId === personaId)
        .map((e) => ({ scenario: scenarios.get(e.scenarioId), weight: e.weight, notes: e.notes }))
        .filter((x) => x.scenario);
    },
  };
}

const validPersona = {
  name: 'Test Officer',
  description: 'A test persona',
  domainKnowledge: 'symptom_only',
  patience: 6,
  verbosity: 'normal',
  cooperativeness: 'cooperative',
  language: 'en',
  persona: 'I describe my problem in plain words.',
};

const validScenario = {
  name: 'Request travel advance',
  description: 'User needs a travel advance',
  userGoal: 'Obtain a travel advance for an upcoming mission',
  initialMessage: 'I need money for my mission trip',
  expectedServiceCode: 'EO-FIN-TRAVEL-ADVANCE',
  expectedRoute: 'question_planner',
  expectedSlots: { destination: 'required', dates: 'required' },
  successCriteria: { serviceIdentified: true, slotsCollected: ['destination', 'dates'] },
  category: 'typical',
  domain: 'EO-FIN',
  difficulty: 'easy',
  tags: ['travel', 'finance'],
  source: 'manual',
};

// Ratification now checks the expected service against the live catalogue
// (a third of the golden set was ratified against services that could not answer
// the goal). These unit tests run without a database, so they inject a validator
// that accepts anything — what they exercise is the audit-field logic, not the
// catalogue check, which has its own suite in scenario-validator.test.js.
const permissiveValidator = {
  validate: async (_scenario, code) => ({
    ok: true, blocking: [], warnings: [], serviceTitle: code ? `Title for ${code}` : null, similarity: null,
  }),
};
function svc(over = {}) {
  return createDialogueGymService({ repo: fakeRepo(), rand: () => 0, scenarioValidator: permissiveValidator, ...over });
}

describe('Dialogue Gym — Persona CRUD', () => {
  test('create → get returns persona with defaults and generated id', async () => {
    const s = svc();
    const created = await s.createPersona(validPersona);
    expect(created.personaId).toBeTruthy();
    expect(created.enabled).toBe(true);
    expect(created.isBuiltin).toBe(false);
    expect(created.namespace).toBe('CORE');
    const got = await s.getPersona(created.personaId);
    expect(got.name).toBe('Test Officer');
    expect(got.patience).toBe(6);
    expect(got.cooperativeness).toBe('cooperative');
  });

  test('patience is clamped to 1..10', async () => {
    const s = svc();
    const p = await s.createPersona({ ...validPersona, patience: 99 });
    expect(p.patience).toBe(10);
    const p2 = await s.createPersona({ ...validPersona, patience: -5 });
    expect(p2.patience).toBe(1);
  });

  test('invalid enum is rejected', async () => {
    const s = svc();
    await expect(s.createPersona({ ...validPersona, cooperativeness: 'bogus' }))
      .rejects.toThrow(/cooperativeness/);
    await expect(s.createPersona({ ...validPersona, name: '' }))
      .rejects.toThrow(/name/);
  });

  test('update mutates fields', async () => {
    const s = svc();
    const p = await s.createPersona(validPersona);
    const upd = await s.updatePersona(p.personaId, { patience: 2, cooperativeness: 'adversarial' });
    expect(upd.patience).toBe(2);
    expect(upd.cooperativeness).toBe('adversarial');
  });

  test('delete is soft (enabled=false)', async () => {
    const s = svc();
    const p = await s.createPersona(validPersona);
    expect(await s.deletePersona(p.personaId)).toBe(true);
    const got = await s.getPersona(p.personaId);
    expect(got.enabled).toBe(false);
  });
});

describe('Dialogue Gym — Scenario CRUD', () => {
  test('create → get round-trips JSON fields', async () => {
    const s = svc();
    const created = await s.createScenario(validScenario);
    expect(created.scenarioId).toBeTruthy();
    const got = await s.getScenario(created.scenarioId);
    expect(got.expectedServiceCode).toBe('EO-FIN-TRAVEL-ADVANCE');
    expect(got.expectedSlots).toEqual({ destination: 'required', dates: 'required' });
    expect(got.successCriteria.slotsCollected).toEqual(['destination', 'dates']);
    expect(got.maxTurns).toBe(20);
    expect(got.tags).toEqual(['travel', 'finance']);
  });

  test('required fields are enforced', async () => {
    const s = svc();
    await expect(s.createScenario({ ...validScenario, userGoal: '' })).rejects.toThrow(/userGoal/);
    await expect(s.createScenario({ ...validScenario, category: 'nope' })).rejects.toThrow(/category/);
  });

  test('update mutates + delete is soft', async () => {
    const s = svc();
    const sc = await s.createScenario(validScenario);
    const upd = await s.updateScenario(sc.scenarioId, { difficulty: 'hard' });
    expect(upd.difficulty).toBe('hard');
    expect(await s.deleteScenario(sc.scenarioId)).toBe(true);
    expect((await s.getScenario(sc.scenarioId)).enabled).toBe(false);
  });

  test('new scenario is groundTruthVerified=false by default', async () => {
    const s = svc();
    const sc = await s.createScenario(validScenario);
    expect(sc.groundTruthVerified).toBe(false);
    expect(sc.verifiedAt).toBeNull();
  });
});

describe('Dialogue Gym — ground-truth verification (3.6)', () => {
  test('verifyGroundTruth sets code + audit fields, preserves scenario', async () => {
    const s = svc();
    const sc = await s.createScenario(validScenario);
    const v = await s.verifyGroundTruth(sc.scenarioId, { expectedServiceCode: 'EO-HR-CORRECT', verifiedBy: 'ivan', groundTruthNotes: 'confirmed' });
    expect(v.groundTruthVerified).toBe(true);
    expect(v.expectedServiceCode).toBe('EO-HR-CORRECT');
    expect(v.verifiedBy).toBe('ivan');
    expect(v.groundTruthNotes).toBe('confirmed');
    expect(v.verifiedAt).toBeTruthy();
    expect(v.name).toBe(validScenario.name); // untouched
  });

  test('verifyGroundTruth with null clears expectedServiceCode but stays verified', async () => {
    const s = svc();
    const sc = await s.createScenario({ ...validScenario, expectedServiceCode: 'EO-OLD' });
    const v = await s.verifyGroundTruth(sc.scenarioId, { expectedServiceCode: null, verifiedBy: 'ivan' });
    expect(v.groundTruthVerified).toBe(true);
    expect(v.expectedServiceCode).toBeNull();
  });

  test('list filters by groundTruthVerified', async () => {
    const s = svc();
    const a = await s.createScenario(validScenario);
    await s.createScenario({ ...validScenario, name: 'Other' });
    await s.verifyGroundTruth(a.scenarioId, { expectedServiceCode: 'X', verifiedBy: 'ivan' });
    expect((await s.listScenarios({ groundTruthVerified: true })).total).toBe(1);
    expect((await s.listScenarios({ groundTruthVerified: false })).total).toBe(1);
  });
});

describe('Dialogue Gym — filtering', () => {
  test('list filters by category/domain/difficulty and tags', async () => {
    const s = svc();
    await s.createScenario(validScenario); // typical/EO-FIN/easy
    await s.createScenario({ ...validScenario, name: 'Edge', category: 'edge_case', domain: 'mixed', difficulty: 'hard', tags: ['mixed'] });
    expect((await s.listScenarios({ category: 'typical' })).total).toBe(1);
    expect((await s.listScenarios({ domain: 'mixed' })).total).toBe(1);
    expect((await s.listScenarios({ difficulty: 'hard' })).total).toBe(1);
    expect((await s.listScenarios({ tags: ['travel'] })).total).toBe(1);
    expect((await s.listScenarios()).total).toBe(2);
  });

  test('pure filter helpers work standalone', () => {
    expect(personaMatches({ enabled: true, language: 'fr' }, { language: 'fr' })).toBe(true);
    expect(personaMatches({ enabled: false }, { enabled: true })).toBe(false);
    expect(scenarioMatches({ category: 'red_team', enabled: true }, { category: 'red_team' })).toBe(true);
    expect(scenarioMatches({ tags: ['a'] }, { tags: ['b'] })).toBe(false);
  });
});

describe('Dialogue Gym — assignment + random pair', () => {
  test('assign / unassign SUITABLE_FOR', async () => {
    const s = svc();
    const p = await s.createPersona(validPersona);
    const sc = await s.createScenario(validScenario);
    await s.assignPersonaToScenario(p.personaId, sc.scenarioId, 2.0, 'good fit');
    const suited = await s.getPersonasForScenario(sc.scenarioId);
    expect(suited).toHaveLength(1);
    expect(suited[0].personaId).toBe(p.personaId);
    expect(suited[0]._weight).toBe(2.0);
    const forP = await s.getScenariosForPersona(p.personaId);
    expect(forP).toHaveLength(1);
    await s.unassignPersonaFromScenario(p.personaId, sc.scenarioId);
    expect(await s.getPersonasForScenario(sc.scenarioId)).toHaveLength(0);
  });

  test('assign rejects unknown persona/scenario', async () => {
    const s = svc();
    await expect(s.assignPersonaToScenario('nope', 'nope')).rejects.toThrow(/not found/);
  });

  test('getRandomPair returns a valid pair (prefers SUITABLE_FOR)', async () => {
    const s = svc();
    const p = await s.createPersona(validPersona);
    const sc = await s.createScenario(validScenario);
    await s.assignPersonaToScenario(p.personaId, sc.scenarioId, 1.0);
    const pair = await s.getRandomPair();
    expect(pair).not.toBeNull();
    expect(pair.scenario.scenarioId).toBe(sc.scenarioId);
    expect(pair.persona.personaId).toBe(p.personaId);
  });

  test('getRandomPair falls back to any enabled persona when no SUITABLE_FOR', async () => {
    const s = svc();
    await s.createPersona(validPersona);
    await s.createScenario(validScenario);
    const pair = await s.getRandomPair();
    expect(pair).not.toBeNull();
    expect(pair.persona).toBeTruthy();
    expect(pair.scenario).toBeTruthy();
  });

  test('getRandomPair returns null when no scenarios', async () => {
    const s = svc();
    await s.createPersona(validPersona);
    expect(await s.getRandomPair()).toBeNull();
  });
});
