'use strict';

/**
 * F11g — provider-agnostic DirectoryAdapter contract. Any provider that claims
 * to implement the interface must pass this suite. Run against the mock now;
 * the same `runAdapterContract` runs against the Altiora provider once wired.
 */

const { ADAPTER_METHODS, NotImplementedError } = require('../../adapter.interface');
const { createMockProvider } = require('../mock.provider');
const { createAltioraProvider } = require('../altiora.provider');
const { getDirectoryProvider } = require('../../index');

function runAdapterContract(makeProvider) {
  test('exposes providerId + all 9 methods', () => {
    const p = makeProvider();
    expect(typeof p.providerId).toBe('string');
    for (const m of ADAPTER_METHODS) expect(typeof p[m]).toBe('function');
  });

  test('resolveUser → array', async () => {
    const r = await makeProvider().resolveUser('ivan');
    expect(Array.isArray(r)).toBe(true);
  });

  test('getUser → User|null with the required shape', async () => {
    const p = makeProvider();
    expect(await p.getUser('does-not-exist')).toBeNull();
    const found = (await p.resolveUser('ivan'))[0];
    if (found) {
      const u = await p.getUser(found.userId);
      for (const k of ['userId', 'name', 'email', 'location', 'role']) expect(u[k]).toBeDefined();
      expect(u.location.code).toBeDefined();
    }
  });

  test('getCurrentUser never returns null (default identity)', async () => {
    const u = await makeProvider().getCurrentUser({});
    expect(u).toBeTruthy();
    expect(u.userId).toBeDefined();
  });

  test('getCurrentUser honours an explicit context.userId', async () => {
    const p = makeProvider();
    const target = (await p.resolveUser('maria'))[0];
    if (target) {
      const u = await p.getCurrentUser({ userId: target.userId });
      expect(u.userId).toBe(target.userId);
    }
  });

  test('resolveApprover → User|null; listManagers → array', async () => {
    const p = makeProvider();
    const target = (await p.resolveUser('maria'))[0];
    const appr = await p.resolveApprover(target ? target.userId : 'x');
    expect(appr === null || appr.userId).toBeTruthy();
    expect(Array.isArray(await p.listManagers())).toBe(true);
  });

  test('locations: list/resolve/search', async () => {
    const p = makeProvider();
    const locs = await p.listLocations();
    expect(Array.isArray(locs)).toBe(true);
    if (locs.length) {
      const one = await p.resolveLocation(locs[0].code);
      expect(one.code).toBe(locs[0].code);
    }
    expect(Array.isArray(await p.searchLocations('a'))).toBe(true);
  });
}

describe('DirectoryAdapter contract — mock provider', () => {
  runAdapterContract(() => createMockProvider());
});

describe('Factory + backward-compat facade', () => {
  test('default provider is mock', () => {
    expect(getDirectoryProvider().providerId).toBe('mock');
  });
  test('unknown provider throws', () => {
    expect(() => getDirectoryProvider('nope')).toThrow(/unknown provider/);
  });
  test('flat facade delegates to the active provider', async () => {
    const dir = require('../../index');
    expect(Array.isArray(await dir.resolveUser('ivan'))).toBe(true);
    expect((await dir.getCurrentUser()).userId).toBeDefined();
  });
});

describe('Altiora provider — implements the interface shape (F11c)', () => {
  test('exposes providerId + all 9 methods', () => {
    const p = createAltioraProvider({ baseUrl: 'https://altiora.example', token: 'x' });
    expect(p.providerId).toBe('altiora');
    for (const m of ADAPTER_METHODS) expect(typeof p[m]).toBe('function');
  });
});
