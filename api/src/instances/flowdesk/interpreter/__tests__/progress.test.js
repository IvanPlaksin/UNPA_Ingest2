'use strict';

/**
 * F3 test — progress bus + engine node-progress emission.
 *
 * Verifies (a) the in-process bus delivers/removes subscribers, and (b) the
 * engine emits turn:start → node:start/node:done … → turn:done in order for a
 * Hardware turn (scripted mock provider, in-memory DraftSR).
 */

const fs = require('fs');
const path = require('path');
const progressBus = require('../progress-bus');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));
const loadSnapshot = async () => hardware;

describe('F3: progress bus pub/sub', () => {
  test('subscribe receives events; unsubscribe stops them', () => {
    const got = [];
    const unsub = progressBus.subscribe('sX', (e) => got.push(e));
    progressBus.emit('sX', { type: 'turn:start' });
    progressBus.emit('sOther', { type: 'turn:start' }); // different session — ignored
    unsub();
    progressBus.emit('sX', { type: 'turn:done' }); // after unsubscribe — ignored
    expect(got).toEqual([{ type: 'turn:start' }]);
  });
});

describe('F3: engine emits ordered node progress', () => {
  function makeEngine(events) {
    const store = new Map();
    const draftService = createDraftSRService({
      store: {
        async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
        async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
      },
      loadSnapshot,
      graphWrite: async () => [],
      now: () => Date.parse('2026-07-14T10:00:00Z'),
      makeRef: (_d, p = 'SR') => `${p}-700001`,
    });
    const llm = new MockLLMProvider({
      structured: (prompt, schema) => {
        if (schema.properties && schema.properties.route) return { route: 'NEW_INTENT' };
        // extract all 5 hardware slots so the turn reaches CONFIRM
        return {
          beneficiary: { mode: 'self' }, location: { name: 'Geneva' },
          assetType: 'laptop_standard', justification: 'onboarding',
          approverComment: 'approved',
        };
      },
      completion: () => 'question?',
    });
    const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { serviceId: 'IT-HW-LAP', version: 1 }, score: 0.9, confidence: 'high' }];
    return createEngine({
      llm, resolveSearch, draftService, loadSnapshot,
      emitProgress: (_sid, ev) => events.push(ev),
    });
  }

  test('turn:start first, turn:done last, node pairs in between', async () => {
    const events = [];
    const engine = makeEngine(events);
    await engine.runTurn({ sessionId: 's-prog', message: 'I need a standard laptop for myself in Geneva, onboarding, approved' });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('turn:start');
    expect(types[types.length - 1]).toBe('turn:done');

    const nodesStarted = events.filter((e) => e.type === 'node:start').map((e) => e.node);
    const nodesDone = events.filter((e) => e.type === 'node:done').map((e) => e.node);
    // key slow nodes have start+done (RESOLVERS runs for the directory-backed
    // beneficiary slot, ending the turn at a confirm-or-choose)
    expect(nodesStarted).toEqual(expect.arrayContaining(['LOAD_DRAFT', 'ROUTER', 'RESOLVE', 'SLOT_EXTRACT', 'RESOLVERS']));
    // deterministic fast nodes report done
    expect(nodesDone).toEqual(expect.arrayContaining(['VALIDATE', 'PATCH', 'ACTIVE_SLOTS', 'TERM_CHECK']));

    // every node:start is followed (later) by a matching node:done
    for (const started of nodesStarted) {
      expect(nodesDone).toContain(started);
    }
    // node:done carries duration + status
    const anyDone = events.find((e) => e.type === 'node:done' && e.node === 'ROUTER');
    expect(anyDone.status).toBe('success');
    expect(typeof anyDone.duration).toBe('number');
  });
});
