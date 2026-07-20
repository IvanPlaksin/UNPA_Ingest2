'use strict';

/**
 * F11e — CachedProvider: hit/miss, TTL expiry, stale-while-revalidate,
 * disabled pass-through, invalidation. Uses an injected clock + fake store so
 * time and Redis are deterministic.
 */

const { createCachedProvider } = require('../cached.provider');

function fakeStore(now) {
  const m = new Map();
  return {
    async get(k) { const e = m.get(k); if (!e) return null; if (now() >= e.exp) { m.delete(k); return null; } return e.v; },
    async set(k, v, ttlSec) { m.set(k, { v, exp: now() + ttlSec * 1000 }); return true; },
    async del(k) { m.delete(k); return true; },
    _has: (k) => m.has(k),
  };
}

function spyBase() {
  const calls = {};
  const bump = (m) => { calls[m] = (calls[m] || 0) + 1; };
  const base = {
    providerId: 'mock',
    resolveUser: async () => { bump('resolveUser'); return [{ userId: 'U1', name: 'X' }]; },
    getUser: async (id) => { bump('getUser'); return id === 'U1' ? { userId: 'U1', name: 'X', location: { code: 'GVA', name: 'Geneva' }, role: 'staff' } : null; },
    getCurrentUser: async () => { bump('getCurrentUser'); return { userId: 'U1' }; },
    getManager: async () => { bump('getManager'); return { userId: 'U2' }; },
    resolveApprover: async () => { bump('resolveApprover'); return { userId: 'U2' }; },
    listManagers: async () => { bump('listManagers'); return [{ userId: 'U2' }]; },
    listLocations: async () => { bump('listLocations'); return [{ code: 'GVA', name: 'Geneva' }]; },
    resolveLocation: async (c) => { bump('resolveLocation'); return { code: c, name: 'X' }; },
    searchLocations: async () => { bump('searchLocations'); return []; },
  };
  return { base, calls };
}

const CFG = { userTTL: 10, searchTTL: 5, locationTTL: 20 };

function build() {
  const clock = { ms: 1000 };
  const now = () => clock.ms;
  const { base, calls } = spyBase();
  const p = createCachedProvider(base, { store: fakeStore(now), now, config: CFG });
  return { p, calls, clock };
}

describe('F11e: CachedProvider', () => {
  test('cache hit — second lookup does not hit the base', async () => {
    const { p, calls } = build();
    await p.getUser('U1');
    await p.getUser('U1');
    expect(calls.getUser).toBe(1);
  });

  test('cache miss on cold key', async () => {
    const { p, calls } = build();
    await p.getUser('U1');
    await p.getManager('U1');
    expect(calls.getUser).toBe(1);
    expect(calls.getManager).toBe(1);
  });

  test('physical TTL expiry — base is called again', async () => {
    const { p, calls, clock } = build();
    await p.listLocations();
    clock.ms += CFG.locationTTL * 1000 + 1; // past the plain TTL
    await p.listLocations();
    expect(calls.listLocations).toBe(2);
  });

  test('stale-while-revalidate — stale served immediately, refresh async', async () => {
    const { p, calls, clock } = build();
    await p.getUser('U1');                 // miss → base 1
    clock.ms += CFG.userTTL * 1000 + 1;    // past soft, within physical (2×)
    const r = await p.getUser('U1');        // returns stale value, schedules refresh
    expect(r.userId).toBe('U1');            // served from cache, not re-fetched synchronously
    await p._lastRefresh();                 // let the async refresh complete
    expect(calls.getUser).toBe(2);          // refreshed in the background
  });

  test('disabled (store: null) → pure pass-through', async () => {
    const { base, calls } = spyBase();
    const p = createCachedProvider(base, { store: null, config: CFG });
    await p.getUser('U1');
    await p.getUser('U1');
    expect(calls.getUser).toBe(2);
  });

  test('invalidateUser clears the user + manager + approver keys', async () => {
    const { p, calls } = build();
    await p.getUser('U1');
    await p.getManager('U1');
    await p.resolveApprover('U1');
    await p.invalidateUser('U1');
    await p.getUser('U1');
    await p.getManager('U1');
    await p.resolveApprover('U1');
    expect(calls.getUser).toBe(2);
    expect(calls.getManager).toBe(2);
    expect(calls.resolveApprover).toBe(2);
  });

  test('providerId is transparent (mirrors base)', () => {
    const { p } = build();
    expect(p.providerId).toBe('mock');
    expect(p.cached).toBe(true);
  });

  test('getCurrentUser with a pre-resolved sessionUser bypasses the cache', async () => {
    const { p, calls } = build();
    await p.getCurrentUser({ sessionUser: { userId: 'U9' } });
    await p.getCurrentUser({ sessionUser: { userId: 'U9' } });
    expect(calls.getCurrentUser).toBe(2); // not cached — already resolved upstream
  });
});
