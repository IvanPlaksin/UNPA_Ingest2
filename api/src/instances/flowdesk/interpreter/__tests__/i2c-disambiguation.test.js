'use strict';

/**
 * I-2c — low-confidence service disambiguation. When resolve returns a tight sibling
 * cluster (the I-2b embedding limitation), the engine offers a choice control over
 * the top candidates instead of guessing the wrong sibling.
 */

const Ajv = require('ajv');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const ajv = new Ajv({ allErrors: true, strict: false });
const controlsSchema = require('../../contracts/controls.schema.json');
const validate = ajv.compile({ type: 'array', items: { $ref: '#/definitions/control' }, definitions: controlsSchema.definitions });

// Minimal one-slot snapshot per service so the reply path can start a flow.
const snapshotFor = (serviceId) => ({
  serviceId, version: 1, phases: ['detail'],
  metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }],
});

function makeEngine(hits) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: {
      async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
      async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    },
    loadSnapshot: async (sid) => snapshotFor(sid), graphWrite: async () => [],
    now: () => Date.parse('2026-07-16T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route ? { route: 'NEW_INTENT' } : {}),
    completion: () => 'Subject?',
  });
  const resolveSearch = async () => hits;
  return createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async (sid) => snapshotFor(sid) });
}

const svc = (serviceId, title, score) => ({ type: 'SERVICE', serviceId, title, score, schemaRef: { serviceId, version: 1 } });

describe('I-2c: disambiguation trigger', () => {
  test('tight sibling cluster (low conf, small gap) → disambiguation choice control', async () => {
    const engine = makeEngine([
      svc('EO-HR-SP-PD-RMCU', 'Record Marriage / Civil Union', 0.915),
      svc('EO-HR-SP-PD-RD', 'Record Divorce', 0.905),
      svc('EO-HR-SP-HD-RDS', 'Record Dependent Spouse', 0.89),
    ]);
    const r = await engine.runTurn({ sessionId: 'd1', message: 'record my marriage' });
    expect(r.responseType).toBe('disambiguation');
    expect(r.route).toBe('DISAMBIGUATE');
    expect(r.controls).toHaveLength(1);
    expect(r.controls[0]).toMatchObject({ type: 'choice', slotId: '__service__' });
    expect(r.controls[0].options.map((o) => o.value)).toEqual(['EO-HR-SP-PD-RMCU', 'EO-HR-SP-PD-RD', 'EO-HR-SP-HD-RDS']);
    expect(r.choices).toEqual(['Record Marriage / Civil Union', 'Record Divorce', 'Record Dependent Spouse']);
    expect(validate(r.controls)).toBe(true);
    // no draft was created — we did not guess
    expect(r.draft).toBeUndefined();
  });

  test('confident top (medium: gap ≥ 0.10) → auto-picks, no disambiguation', async () => {
    const engine = makeEngine([
      svc('EO-HR-SA-SS-ISP', 'Initiate Separation Process', 0.92),
      svc('EO-HR-SA-SS-SP', 'Separation Process Queries', 0.78),
    ]);
    const r = await engine.runTurn({ sessionId: 'd2', message: 'I want to start my separation' });
    expect(r.route).not.toBe('DISAMBIGUATE');
    expect(r.draft).toBeDefined();
    expect(r.draft.serviceId).toBe('EO-HR-SA-SS-ISP');
  });

  test('single candidate → no disambiguation even at low score', async () => {
    const engine = makeEngine([svc('EO-FIN-PAY-INQ', 'Payroll Inquiry', 0.6)]);
    const r = await engine.runTurn({ sessionId: 'd3', message: 'pay question' });
    expect(r.route).not.toBe('DISAMBIGUATE');
    expect(r.draft.serviceId).toBe('EO-FIN-PAY-INQ');
  });

  test('unresolved (top < 0.55) → normal flow, not disambiguation', async () => {
    const engine = makeEngine([svc('X-Y-Z', 'Something', 0.4), svc('A-B-C', 'Other', 0.38)]);
    const r = await engine.runTurn({ sessionId: 'd4', message: 'vague' });
    expect(r.route).not.toBe('DISAMBIGUATE');
  });
});

describe('I-2c: disambiguation reply', () => {
  test('picking a service via controlAction starts that service', async () => {
    const engine = makeEngine([
      svc('EO-HR-SP-PD-RMCU', 'Record Marriage / Civil Union', 0.915),
      svc('EO-HR-SP-PD-RD', 'Record Divorce', 0.905),
    ]);
    // turn 1: disambiguation offered
    await engine.runTurn({ sessionId: 'd5', message: 'record my marriage' });
    // turn 2: user picks Record Marriage
    const r = await engine.runTurn({ sessionId: 'd5', controlAction: { controlId: 'ctrl-serviceDisambiguation', slotId: '__service__', action: 'select', value: 'EO-HR-SP-PD-RMCU' } });
    expect(r.route).not.toBe('DISAMBIGUATE');
    expect(r.draft).toBeDefined();
    expect(r.draft.serviceId).toBe('EO-HR-SP-PD-RMCU'); // the chosen sibling, not a guess
    expect(r.askingSlot).toBe('subject'); // proceeded into the flow
  });

  test('picking a service whose form is not materialized is reported gracefully', async () => {
    const engine = makeEngine([
      svc('EO-HR-SP-PD-RMCU', 'Record Marriage', 0.9),
      svc('EO-HR-SP-PD-RD', 'Record Divorce', 0.89),
    ]);
    // override loadSnapshot to return null for the picked service
    const engine2 = (() => {
      const store = new Map();
      const draftService = createDraftSRService({
        store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
        loadSnapshot: async () => null, graphWrite: async () => [], now: () => 0, makeRef: () => 'SR-1',
      });
      const llm = new MockLLMProvider({ structured: (p, s) => (s.properties?.route ? { route: 'NEW_INTENT' } : {}), completion: () => 'q' });
      return createEngine({ injectContext: false, llm, resolveSearch: async () => [], draftService, loadSnapshot: async () => null });
    })();
    const r = await engine2.runTurn({ sessionId: 'd6', controlAction: { slotId: '__service__', action: 'select', value: 'EO-HR-SP-PD-RMCU' } });
    expect(r.response).toMatch(/not available yet/);
  });
});

// CODE-004 — disambiguation used to be stateless: the same candidates were
// re-offered on every NEW_INTENT turn because nothing recorded that the user had
// already seen and rejected them. The arena transcripts showed the identical list
// up to five times in one dialogue, and DISAMBIGUATE accounted for 153 of 291 turns.
describe('CODE-004: the same candidates are never offered twice', () => {
  const CLUSTER = [
    svc('EO-HR-SP-PD-RMCU', 'Record Marriage / Civil Union', 0.915),
    svc('EO-HR-SP-PD-RD', 'Record Divorce', 0.905),
    svc('EO-HR-SP-HD-RDS', 'Record Dependent Spouse', 0.89),
  ];

  test('second time round it stops repeating and changes the offer', async () => {
    const engine = makeEngine(CLUSTER);
    const first = await engine.runTurn({ sessionId: 'loop1', message: 'record my marriage' });
    expect(first.responseType).toBe('disambiguation');

    const second = await engine.runTurn({ sessionId: 'loop1', message: 'none of those match' });
    expect(second.responseType).toBe('disambiguation_exhausted');
    expect(second.response).not.toBe(first.response);
    expect(second.trace).toContain('DISAMBIGUATE_EXHAUSTED');
  });

  test('it never repeats, however many times the user pushes back', async () => {
    const engine = makeEngine(CLUSTER);
    const seen = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await engine.runTurn({ sessionId: 'loop2', message: 'not what I need' });
      seen.push(r.responseType);
    }
    // Exactly one plain disambiguation, then the exhausted branch for the rest.
    expect(seen.filter((t) => t === 'disambiguation')).toHaveLength(1);
    expect(seen.filter((t) => t === 'disambiguation_exhausted')).toHaveLength(4);
  });

  test('the exhausted turn explains itself and keeps the candidates selectable', async () => {
    const engine = makeEngine(CLUSTER);
    await engine.runTurn({ sessionId: 'loop3', message: 'record my marriage' });
    const r = await engine.runTurn({ sessionId: 'loop3', message: 'none of those' });
    expect(r.response).toMatch(/none of them is what you need/i);
    // The user may still recognise one, so the options remain — they are simply
    // no longer presented as the whole answer.
    expect(r.controls[0].options.map((o) => o.value)).toEqual(CLUSTER.map((c) => c.serviceId));
    expect(validate(r.controls)).toBe(true);
  });

  test('it does not promise a human hand-off it cannot perform', async () => {
    // CODE-003: there is no ESCALATE route and escalate() needs a draft that does
    // not exist here. Offering escalation would swap one broken promise for another.
    const engine = makeEngine(CLUSTER);
    await engine.runTurn({ sessionId: 'loop4', message: 'record my marriage' });
    const r = await engine.runTurn({ sessionId: 'loop4', message: 'none of those' });
    expect(r.response).not.toMatch(/escalat|human agent|transfer you|service desk team/i);
  });

  test('a DIFFERENT candidate set is still allowed to disambiguate', async () => {
    // Progress must not be punished: after a rephrase that surfaces other
    // services, asking which one is the right behaviour, not a loop. The engine
    // closes over this array, so replacing its contents changes what resolve returns.
    const hits = [...CLUSTER];
    const engine = makeEngine(hits);
    const first = await engine.runTurn({ sessionId: 'loop5', message: 'record my marriage' });
    expect(first.responseType).toBe('disambiguation');

    hits.splice(0, hits.length,
      svc('EO-HR-BE-TRE-TRE', 'Travel Entitlements', 0.91),
      svc('EO-HR-BE-TRE-AHL', 'Advance Home Leave', 0.90));
    const r = await engine.runTurn({ sessionId: 'loop5', message: 'actually I need travel' });
    expect(r.responseType).toBe('disambiguation');
  });

  test('sessions do not share the gate', async () => {
    const engine = makeEngine(CLUSTER);
    await engine.runTurn({ sessionId: 'loop6a', message: 'record my marriage' });
    await engine.runTurn({ sessionId: 'loop6a', message: 'no' });
    const other = await engine.runTurn({ sessionId: 'loop6b', message: 'record my marriage' });
    expect(other.responseType).toBe('disambiguation');
  });
});
