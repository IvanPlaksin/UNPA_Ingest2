'use strict';

/**
 * F11f — engine-level graceful degradation when the directory backend is down
 * (ADCC-085 no dead end): offer retry / manual entry, never crash or block.
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

function unavailable() { const e = new Error('directory down'); e.code = 'DIRECTORY_UNAVAILABLE'; return e; }

// A directory whose calls throw DIRECTORY_UNAVAILABLE until `live` is flipped.
function flakyDirectory(state) {
  const guard = async (v) => { if (!state.live) throw unavailable(); return v; };
  return {
    resolveUser: () => guard([{ userId: 'U9', name: 'Resolved User', location: { code: 'GVA', name: 'Geneva' }, role: 'staff' }]),
    getUser: () => guard({ userId: 'U9', name: 'Resolved User', location: { code: 'GVA', name: 'Geneva' }, role: 'staff' }),
    getCurrentUser: () => guard({ userId: 'U1', name: 'Ivan Petrov', location: { code: 'NYC', name: 'New York HQ' }, role: 'manager' }),
    getManager: () => guard({ userId: 'U4', name: 'Li Wei' }),
    resolveApprover: () => guard({ userId: 'U4', name: 'Li Wei' }),
    listManagers: () => guard([{ userId: 'U4', name: 'Li Wei', role: 'director' }]),
    listLocations: () => guard([{ code: 'NYC', name: 'New York HQ' }]),
    resolveLocation: () => guard({ code: 'NYC', name: 'New York HQ' }),
    searchLocations: () => guard([]),
  };
}

function makeEngine(state) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(v) : null; }, async set(k, v) { store.set(k, JSON.stringify(v)); return true; } },
    loadSnapshot: async () => hardware, graphWrite: async () => [],
    now: () => Date.parse('2026-07-15T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' } : {}),
    completion: () => 'Question?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { version: 2 }, score: 0.9, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot: async () => hardware, directory: flakyDirectory(state) });
}

describe('F11f: directory graceful degradation', () => {
  test('directory down → degraded response (retry / manual), not a crash', async () => {
    const state = { live: false };
    const engine = makeEngine(state);
    const r = await engine.runTurn({ sessionId: 'g1', message: 'I need a laptop', lang: 'en' });
    expect(r.responseType).toBe('directory_unavailable');
    expect(r.choices).toEqual(['retry', 'manual']);
    expect(r.response).toMatch(/temporarily unavailable/i);
    expect(r.askingSlot).toBe('author');
  });

  test('retry after recovery → resolves normally', async () => {
    const state = { live: false };
    const engine = makeEngine(state);
    await engine.runTurn({ sessionId: 'g2', message: 'I need a laptop', lang: 'en' }); // degraded
    state.live = true; // directory recovers
    const r = await engine.runTurn({ sessionId: 'g2', message: 'retry', lang: 'en' });
    expect(r.responseType).toBe('confirm_or_choose');
    expect(r.askingSlot).toBe('author');
  });

  test('manual entry accepted while directory is down (no dead end)', async () => {
    const state = { live: false };
    const engine = makeEngine(state);
    await engine.runTurn({ sessionId: 'g3', message: 'I need a laptop', lang: 'en' }); // degraded on author
    const r = await engine.runTurn({ sessionId: 'g3', message: 'Jane Doe, jane.doe@un.org', lang: 'en' });
    // author captured manually; the flow moved on (never a dead end)
    expect(r.manualEntry).toBe(true);
    expect(r.askingSlot).toBeDefined();
  });
});
