'use strict';

/**
 * F11d — the acting identity (Altiora proxy X-FlowDesk-User-* headers, arriving
 * as runTurn's `userContext`) must drive getCurrentUser via AsyncLocalStorage,
 * replacing the hardcoded pilot default. No context threading through call sites.
 */

const fs = require('fs');
const path = require('path');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

// Spy directory that records the context passed to getCurrentUser and returns a
// User built from it (the Altiora/mock contract).
function spyDirectory() {
  const calls = [];
  return {
    _calls: calls,
    async getCurrentUser(context) {
      calls.push(context);
      const su = context && context.sessionUser;
      if (su) return { userId: su.userId, name: su.displayName || su.name, email: su.email || null, location: { code: null, name: (su.location || {}).dutyStation || null }, role: 'staff', managerId: null, mode: 'self' };
      return { userId: 'DEFAULT', name: 'Default User', location: { code: 'NYC', name: 'New York HQ' }, role: 'staff' };
    },
    resolveUser: async () => [],
    getUser: async () => null,
    getManager: async () => null,
    resolveApprover: async () => null,
    listManagers: async () => [],
    listLocations: async () => [{ code: 'NYC', name: 'New York HQ' }],
    resolveLocation: async () => ({ code: 'NYC', name: 'New York HQ' }),
    searchLocations: async () => [],
  };
}

function makeEngine(directory) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(v) : null; }, async set(k, v) { store.set(k, JSON.stringify(v)); return true; } },
    loadSnapshot: async () => hardware, graphWrite: async () => [],
    now: () => Date.parse('2026-07-15T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties?.route ? { route: /Has active draft: true/.test(prompt) ? 'SLOT_FILL' : 'NEW_INTENT' } : { assetType: 'laptop_standard' }),
    completion: () => 'Question?',
  });
  const resolveSearch = async () => [{ type: 'SERVICE', serviceId: 'IT-HW-LAP', title: 'Laptop', schemaRef: { version: 2 }, score: 0.9, confidence: 'high' }];
  return createEngine({ llm, resolveSearch, draftService, loadSnapshot: async () => hardware, directory });
}

describe('F11d: acting identity via userContext (AsyncLocalStorage)', () => {
  test('getCurrentUser receives the proxy-injected identity as context.sessionUser', async () => {
    const dir = spyDirectory();
    const engine = makeEngine(dir);
    const userContext = { userId: 'HDR-42', displayName: 'Amara Okoye', email: 'amara@un.org', orgUnit: { name: 'DPKO', path: 'UNCS/DPKO' }, location: { dutyStation: 'Nairobi' }, roles: [] };
    // "for myself" → the author resolver resolves the *current* (header) user.
    const r = await engine.runTurn({ sessionId: 'a1', message: 'I need a laptop for myself', userContext, lang: 'en' });
    // getCurrentUser must have been called with the header identity, not empty.
    const withSession = dir._calls.find((c) => c && c.sessionUser);
    expect(withSession).toBeTruthy();
    expect(withSession.sessionUser.userId).toBe('HDR-42');
    // and the resolved author is the header user (Amara), not the pilot default.
    expect(JSON.stringify(r)).toMatch(/Amara Okoye/);
  });

  test('without userContext, falls back to the pilot default', async () => {
    const dir = spyDirectory();
    const engine = makeEngine(dir);
    const r = await engine.runTurn({ sessionId: 'a2', message: 'I need a laptop for myself', lang: 'en' });
    // getCurrentUser called, but with no sessionUser → default identity.
    expect(dir._calls.length).toBeGreaterThan(0);
    expect(dir._calls.every((c) => !c || !c.sessionUser)).toBe(true);
    expect(JSON.stringify(r)).toMatch(/Default User/);
  });
});
