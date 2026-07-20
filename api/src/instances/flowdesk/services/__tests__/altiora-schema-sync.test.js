'use strict';

/**
 * IP-1e test — SchemaSyncService. Pure unit tests over fakes: a fake registry, a
 * fake schema client, a fake SignalR connection, and injected timers. No live
 * Altiora, no Memgraph, no real @microsoft/signalr.
 */

const { createSchemaSyncService } = require('../altiora-schema-sync');

/** A registry double recording stale-marks, with a settable cache list. */
function fakeRegistry(cached = []) {
  const marked = [];
  return {
    cached,
    marked,
    listCached: async () => cached,
    markStale: async (ousId) => { marked.push(ousId); return true; },
  };
}

/** A schema client whose version-by-ousId map drives poll comparisons. */
function fakeClient(versionByOus = {}) {
  return {
    getSchemaVersion: async (ousId) => (ousId in versionByOus ? versionByOus[ousId] : null),
  };
}

/** A SignalR connection double: capture handlers, fire events, record stop. */
function fakeConnection() {
  const handlers = {};
  let closeHandler = null;
  return {
    stopped: false,
    on: (event, fn) => { handlers[event] = fn; },
    onclose: (fn) => { closeHandler = fn; },
    stop: async function stop() { this.stopped = true; },
    emit: (event, payload) => handlers[event] && handlers[event](payload),
    close: () => closeHandler && closeHandler(),
  };
}

/** Injectable timers that never actually fire (we call pollOnce directly). */
const noopTimers = { setInterval: () => 1, clearInterval: () => {} };

describe('IP-1e/I-5: SignalR track', () => {
  test('ServiceFormChanged (serviceId = ousId, structural) → registry.markStale', async () => {
    const registry = fakeRegistry();
    const conn = fakeConnection();
    const svc = createSchemaSyncService({
      registry, schemaClient: fakeClient(), connectSignalR: async () => conn, timers: noopTimers,
    });
    await svc.start();
    expect(svc.signalrConnected()).toBe(true);

    conn.emit('ServiceFormChanged', { serviceId: 42, catalogItemId: 'guid', changedParts: ['structure'] });
    await Promise.resolve(); // let the async handler run

    expect(registry.marked).toContain(42);
    await svc.stop();
    expect(conn.stopped).toBe(true);
  });

  test('a non-integer payload is ignored, not marked', async () => {
    const registry = fakeRegistry();
    const svc = createSchemaSyncService({ registry, schemaClient: fakeClient(), connectSignalR: async () => fakeConnection(), timers: noopTimers });
    await svc.start();
    await svc.onServiceFormChanged({ serviceId: 'not-a-number' });
    expect(registry.marked).toEqual([]);
    await svc.stop();
  });

  test('a non-structural change (availability only) is ignored', async () => {
    const registry = fakeRegistry();
    const svc = createSchemaSyncService({ registry, schemaClient: fakeClient(), timers: noopTimers });
    await svc.onServiceFormChanged({ serviceId: 42, changedParts: ['availability'] });
    expect(registry.marked).toEqual([]);
  });

  test('an unspecified change (no changedParts) refreshes to be safe', async () => {
    const registry = fakeRegistry();
    const svc = createSchemaSyncService({ registry, schemaClient: fakeClient(), timers: noopTimers });
    await svc.onServiceFormChanged({ serviceId: 7 });
    expect(registry.marked).toEqual([7]);
  });

  test('SignalR unavailable → polling-only, service still starts', async () => {
    const registry = fakeRegistry();
    const svc = createSchemaSyncService({
      registry, schemaClient: fakeClient(), connectSignalR: async () => { throw new Error('hub down'); }, timers: noopTimers,
    });
    await svc.start();
    expect(svc.isRunning()).toBe(true);
    expect(svc.signalrConnected()).toBe(false);
    await svc.stop();
  });

  test('no connectSignalR at all → polling-only', async () => {
    const svc = createSchemaSyncService({ registry: fakeRegistry(), schemaClient: fakeClient(), timers: noopTimers });
    await svc.start();
    expect(svc.signalrConnected()).toBe(false);
    await svc.stop();
  });
});

describe('IP-1e/I-5: polling track', () => {
  test('a changed hash marks that provider stale', async () => {
    const registry = fakeRegistry([
      { ousId: 1, serviceId: 'IT-A', contentHash: 'old' },
      { ousId: 2, serviceId: 'IT-B', contentHash: 'same' },
    ]);
    const client = fakeClient({ 1: { contentHash: 'new' }, 2: { contentHash: 'same' } });
    const svc = createSchemaSyncService({ registry, schemaClient: client, timers: noopTimers });

    const res = await svc.pollOnce();
    expect(res).toEqual({ checked: 2, stale: 1, errors: 0 });
    expect(registry.marked).toEqual([1]);
  });

  test('an upstream schema that disappeared (null version) is marked stale', async () => {
    const registry = fakeRegistry([{ ousId: 5, serviceId: 'IT-X', contentHash: 'h' }]);
    const client = fakeClient({}); // getSchemaVersion → null
    const svc = createSchemaSyncService({ registry, schemaClient: client, timers: noopTimers });
    const res = await svc.pollOnce();
    expect(res.stale).toBe(1);
    expect(registry.marked).toEqual([5]);
  });

  test('matching hashes mark nothing', async () => {
    const registry = fakeRegistry([{ ousId: 1, serviceId: 'IT-A', contentHash: 'h1' }]);
    const client = fakeClient({ 1: { contentHash: 'h1' } });
    const svc = createSchemaSyncService({ registry, schemaClient: client, timers: noopTimers });
    const res = await svc.pollOnce();
    expect(res.stale).toBe(0);
    expect(registry.marked).toEqual([]);
  });

  test('one provider check failing does not abort the pass', async () => {
    const registry = fakeRegistry([
      { ousId: 1, serviceId: 'IT-A', contentHash: 'h1' },
      { ousId: 2, serviceId: 'IT-B', contentHash: 'h2' },
    ]);
    const client = {
      getSchemaVersion: async (ousId) => {
        if (ousId === 1) throw new Error('timeout');
        return { contentHash: 'changed' };
      },
    };
    const svc = createSchemaSyncService({ registry, schemaClient: client, timers: noopTimers });
    const res = await svc.pollOnce();
    expect(res).toEqual({ checked: 2, stale: 1, errors: 1 });
    expect(registry.marked).toEqual([2]); // ousId 2 still processed
  });

  test('listCached failing yields a clean error summary, no throw', async () => {
    const registry = { listCached: async () => { throw new Error('memgraph down'); }, markStale: async () => true };
    const svc = createSchemaSyncService({ registry, schemaClient: fakeClient(), timers: noopTimers });
    const res = await svc.pollOnce();
    expect(res).toEqual({ checked: 0, stale: 0, errors: 1 });
  });
});

describe('IP-1e: lifecycle', () => {
  test('start arms a poll timer; stop clears it and stops SignalR', async () => {
    let armed = null;
    let cleared = false;
    const timers = { setInterval: (fn, ms) => { armed = { fn, ms }; return 'T'; }, clearInterval: (t) => { cleared = t === 'T'; } };
    const conn = fakeConnection();
    const svc = createSchemaSyncService({
      registry: fakeRegistry(), schemaClient: fakeClient(), connectSignalR: async () => conn,
      pollIntervalMs: 12345, timers,
    });
    await svc.start();
    expect(armed.ms).toBe(12345);
    expect(svc.isRunning()).toBe(true);

    await svc.stop();
    expect(cleared).toBe(true);
    expect(conn.stopped).toBe(true);
    expect(svc.isRunning()).toBe(false);
  });

  test('double start is idempotent', async () => {
    let intervals = 0;
    const timers = { setInterval: () => { intervals++; return 1; }, clearInterval: () => {} };
    const svc = createSchemaSyncService({ registry: fakeRegistry(), schemaClient: fakeClient(), timers });
    await svc.start();
    await svc.start();
    expect(intervals).toBe(1);
    await svc.stop();
  });

  test('the poll tick reconnects SignalR when it has dropped', async () => {
    let connectCalls = 0;
    let tick = null;
    const timers = { setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => {} };
    const conn = fakeConnection();
    const svc = createSchemaSyncService({
      registry: fakeRegistry(), schemaClient: fakeClient(),
      connectSignalR: async () => { connectCalls++; return conn; }, timers,
    });
    await svc.start();
    expect(connectCalls).toBe(1);
    conn.close(); // drop
    expect(svc.signalrConnected()).toBe(false);
    tick(); // a poll tick
    await Promise.resolve();
    expect(connectCalls).toBe(2); // reconnect attempted
    await svc.stop();
  });
});
