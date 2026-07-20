'use strict';

/**
 * F11f — ResilientProvider: success pass-through (+ last-known-good write),
 * failure → DirectoryUnavailableError, and LKG fallback on outage.
 */

const { createResilientProvider } = require('../resilient.provider');
const { DirectoryUnavailableError } = require('../../adapter.interface');

function okBase() {
  return {
    providerId: 'mock',
    resolveUser: async () => [{ userId: 'U1', name: 'X' }],
    getUser: async () => ({ userId: 'U1' }),
    getCurrentUser: async () => ({ userId: 'U1' }),
    getManager: async () => ({ userId: 'U2' }),
    resolveApprover: async () => ({ userId: 'U2' }),
    listManagers: async () => [],
    listLocations: async () => [{ code: 'GVA', name: 'Geneva' }],
    resolveLocation: async () => ({ code: 'GVA', name: 'Geneva' }),
    searchLocations: async () => [],
  };
}
function failBase() {
  const boom = async () => { throw new Error('ECONNREFUSED'); };
  return { providerId: 'altiora', resolveUser: boom, getUser: boom, getCurrentUser: boom, getManager: boom, resolveApprover: boom, listManagers: boom, listLocations: boom, resolveLocation: boom, searchLocations: boom };
}
function memStore() { const m = new Map(); return { async get(k) { return m.has(k) ? m.get(k) : null; }, async set(k, v) { m.set(k, v); return true; }, _m: m }; }
const silent = { warn() {}, error() {} };

describe('F11f: ResilientProvider', () => {
  test('success passes through and writes last-known-good', async () => {
    const store = memStore();
    const p = createResilientProvider(okBase(), { fallbackStore: store, logger: silent });
    expect(await p.resolveUser('ivan')).toEqual([{ userId: 'U1', name: 'X' }]);
    expect(store._m.size).toBeGreaterThan(0); // LKG cached
  });

  test('backend failure → DirectoryUnavailableError (no fallback)', async () => {
    const p = createResilientProvider(failBase(), { logger: silent });
    await expect(p.resolveUser('ivan')).rejects.toBeInstanceOf(DirectoryUnavailableError);
    await expect(p.getCurrentUser({})).rejects.toMatchObject({ code: 'DIRECTORY_UNAVAILABLE' });
  });

  test('LKG fallback served on outage', async () => {
    const store = memStore();
    // Prime LKG via a healthy call, then fail and expect the cached value back.
    await createResilientProvider(okBase(), { fallbackStore: store, logger: silent }).resolveUser('ivan');
    const p = createResilientProvider(failBase(), { fallbackStore: store, logger: silent });
    const r = await p.resolveUser('ivan');
    expect(r).toEqual([{ userId: 'U1', name: 'X' }]); // last-known-good, not an error
  });

  test('providerId is transparent', () => {
    expect(createResilientProvider(okBase(), { logger: silent }).providerId).toBe('mock');
  });
});
