'use strict';

/**
 * IP-1d test — SchemaOrchestrator. Pure unit tests over injected fakes; no live
 * Altiora or Memgraph. The orchestration logic (cache hit/miss/stale, provider
 * selection, non-Altiora fallback, context-slot injection) is what is under test.
 */

const {
  createSchemaLoader,
  injectContextSlots,
  ServiceNotAvailableError,
} = require('../schema-orchestrator');
const { lintSnapshot } = require('../../schema-graph/schema-linter');

/** A minimal materialized (detail-only) snapshot, as the registry would return. */
function detailSnapshot(serviceId = 'IT-HW-LAP', ousId = 42) {
  return {
    serviceId,
    version: 1,
    phases: ['detail'],
    metadata: { title: 'Laptop', approvalRequired: false, altioraOusId: ousId, contentHash: 'h1', fieldIdMapping: { os: 'os' } },
    slots: [
      { slotId: 'os', type: 'enum', required: true, phase: 'detail', altioraFieldId: 'os', presentOptions: [{ value: 'W', label: 'W' }] },
    ],
  };
}

/** Build a loader over configurable fakes; records calls for assertions. */
function makeLoader(overrides = {}) {
  const calls = { detect: 0, getSchema: 0, materialize: 0, store: 0, graphLoad: 0, warns: [] };
  const deps = {
    catalogLookup: async (code) => (code === 'PLATFORM' ? null : { guid: 'guid-' + code, approvalRequired: false, title: 'T' }),
    locationPathOf: () => '/1/840/ds/',
    detectProviders: async () => { calls.detect++; return [{ organizationUnitServiceId: 42, score: 100 }, { organizationUnitServiceId: 43, score: 50 }]; },
    getSchemaVersion: async () => ({ contentHash: 'h1', version: 1 }),
    getSchema: async () => { calls.getSchema++; return { fields: [{ id: 'os', label: 'OS', type: 'select', required: true, options: ['W'] }] }; },
    materialize: (p) => { calls.materialize++; return { snapshot: detailSnapshot(p.serviceCode, p.ousId), warnings: [] }; },
    registry: {
      checkFreshness: async () => 'missing',
      getSchema: async () => detailSnapshot(),
      storeSchema: async () => { calls.store++; return { replaced: null }; },
    },
    graphLoad: async (sid) => { calls.graphLoad++; return { serviceId: sid, version: 1, phases: ['detail'], metadata: { title: sid, approvalRequired: false }, slots: [{ slotId: 'x', type: 'string', required: true, phase: 'detail' }] }; },
    onWarn: (w) => calls.warns.push(w),
    ...overrides,
  };
  return { loader: createSchemaLoader(deps), calls, deps };
}

describe('IP-1d: cache hit / miss / stale', () => {
  test('MISS → fetch, materialize, store, then inject context slots', async () => {
    const { loader, calls } = makeLoader({ registry: {
      checkFreshness: async () => 'missing',
      getSchema: async () => detailSnapshot(),
      storeSchema: async () => { calls; return { replaced: null }; },
    } });
    // rebuild with call tracking via closure
    const c = { store: 0, mat: 0, get: 0 };
    const { loader: l } = makeLoader({
      registry: {
        checkFreshness: async () => 'missing',
        getSchema: async () => { c.get++; return detailSnapshot(); },
        storeSchema: async () => { c.store++; return { replaced: null }; },
      },
      materialize: (p) => { c.mat++; return { snapshot: detailSnapshot(p.serviceCode, p.ousId), warnings: [] }; },
    });
    const snap = await l.loadSnapshot('IT-HW-LAP');
    expect(c.mat).toBe(1);
    expect(c.store).toBe(1);
    expect(snap.slots.map((s) => s.slotId)).toContain('beneficiary');
    expect(snap.slots.some((s) => s.slotId === 'os')).toBe(true);
  });

  test('FRESH → serve from registry, no fetch/materialize/store', async () => {
    const c = { get: 0, mat: 0, store: 0, detect: 0 };
    const { loader } = makeLoader({
      detectProviders: async () => { c.detect++; return [{ organizationUnitServiceId: 42, score: 100 }]; },
      registry: {
        checkFreshness: async () => 'fresh',
        getSchema: async () => { c.get++; return detailSnapshot(); },
        storeSchema: async () => { c.store++; return { replaced: null }; },
      },
      materialize: () => { c.mat++; return { snapshot: detailSnapshot(), warnings: [] }; },
    });
    await loader.loadSnapshot('IT-HW-LAP');
    expect(c.mat).toBe(0);
    expect(c.store).toBe(0);
    expect(c.get).toBe(1);
  });

  test('STALE → re-fetch and re-store like a miss', async () => {
    const c = { mat: 0, store: 0 };
    const { loader } = makeLoader({
      registry: {
        checkFreshness: async () => 'stale',
        getSchema: async () => detailSnapshot(),
        storeSchema: async () => { c.store++; return { replaced: null }; },
      },
      materialize: (p) => { c.mat++; return { snapshot: detailSnapshot(p.serviceCode, p.ousId), warnings: [] }; },
    });
    await loader.loadSnapshot('IT-HW-LAP');
    expect(c.mat).toBe(1);
    expect(c.store).toBe(1);
  });
});

describe('IP-1d: provider selection + availability', () => {
  test('uses the first (highest-scored) provider ousId', async () => {
    let seenOus = null;
    const { loader } = makeLoader({
      detectProviders: async () => [{ organizationUnitServiceId: 77, score: 120 }, { organizationUnitServiceId: 88, score: 40 }],
      registry: {
        checkFreshness: async (ous) => { seenOus = ous; return 'fresh'; },
        getSchema: async () => detailSnapshot(),
        storeSchema: async () => ({ replaced: null }),
      },
    });
    await loader.loadSnapshot('IT-HW-LAP');
    expect(seenOus).toBe(77);
  });

  test('no provider at the location → ServiceNotAvailableError', async () => {
    const { loader } = makeLoader({ detectProviders: async () => [] });
    await expect(loader.loadSnapshot('IT-HW-LAP')).rejects.toBeInstanceOf(ServiceNotAvailableError);
  });
});

describe('IP-1d: non-Altiora fallback', () => {
  test('a service with no catalog GUID falls back to the graph loader, no Altiora calls', async () => {
    const c = { detect: 0, graph: 0 };
    const { loader } = makeLoader({
      detectProviders: async () => { c.detect++; return []; },
      graphLoad: async (sid) => { c.graph++; return { serviceId: sid, version: 1, phases: ['detail'], metadata: { title: sid, approvalRequired: false }, slots: [{ slotId: 'x', type: 'string', required: true, phase: 'detail' }] }; },
    });
    const snap = await loader.loadSnapshot('PLATFORM');
    expect(c.detect).toBe(0);
    expect(c.graph).toBe(1);
    expect(snap.serviceId).toBe('PLATFORM');
  });
});

describe('IP-1d: multi-provider replace warning', () => {
  test('a replaced cache surfaces an onWarn event', async () => {
    const warns = [];
    const { loader } = makeLoader({
      registry: {
        checkFreshness: async () => 'missing',
        getSchema: async () => detailSnapshot(),
        storeSchema: async () => ({ replaced: { oldOusId: 41 } }),
      },
      onWarn: (w) => warns.push(w),
    });
    await loader.loadSnapshot('IT-HW-LAP');
    expect(warns.some((w) => w.event === 'multi_provider_replace' && w.oldOusId === 41)).toBe(true);
  });
});

describe('IP-1d: injectContextSlots', () => {
  test('prepends beneficiary/location/author; no approver when not required', () => {
    const out = injectContextSlots(detailSnapshot(), false);
    const ids = out.slots.map((s) => s.slotId);
    expect(ids.slice(0, 3)).toEqual(['beneficiary', 'location', 'author']);
    expect(ids).not.toContain('approver');
    expect(out.phases).toEqual(['context', 'detail']);
    expect(out.slots.find((s) => s.slotId === 'location').dependsOn).toEqual(['beneficiary']);
  });

  test('appends approver last when approval is required', () => {
    const out = injectContextSlots(detailSnapshot(), true);
    const ids = out.slots.map((s) => s.slotId);
    expect(ids[ids.length - 1]).toBe('approver');
    const approver = out.slots.find((s) => s.slotId === 'approver');
    expect(approver.trefCondition).toBe('service.approvalRequired == true');
    expect(out.metadata.approvalRequired).toBe(true);
  });

  test('a Altiora field occupying a reserved slotId is not double-injected', () => {
    const snap = detailSnapshot();
    snap.slots.push({ slotId: 'location', type: 'string', required: true, phase: 'detail', altioraFieldId: 'loc' });
    const out = injectContextSlots(snap, false);
    expect(out.slots.filter((s) => s.slotId === 'location')).toHaveLength(1);
    // The one kept is the Altiora field, not the injected resolver slot.
    expect(out.slots.find((s) => s.slotId === 'location').altioraFieldId).toBe('loc');
  });

  test('the injected snapshot is lint-clean', () => {
    const out = injectContextSlots(detailSnapshot(), true);
    const lint = lintSnapshot(out);
    if (!lint.ok) throw new Error(JSON.stringify(lint.violations, null, 2));
    expect(lint.ok).toBe(true);
  });
});
