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
