'use strict';

/** VF-2 — disambiguation voice: distinguishing-field computation, enumerated speech, engine wiring. */

const d = require('../disambiguation-utils');
const { createEngine } = require('../interpreter-engine');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');
const { createDraftSRService } = require('../../services/draft-sr.service');

describe('computeDistinguishingFields', () => {
  test('identifies fields that differ, ordered by discrimination power', () => {
    const opts = [
      { name: 'John Smith', department: 'OICT', title: 'Analyst' },
      { name: 'John Smith', department: 'DMS', title: 'Analyst' },
    ];
    expect(d.computeDistinguishingFields(opts, d.USER_CANDIDATE_FIELDS)).toEqual(['department']);
  });
  test('identical options → no distinguishing fields', () => {
    const opts = [{ name: 'A', department: 'X' }, { name: 'A', department: 'X' }];
    expect(d.computeDistinguishingFields(opts, ['name', 'department'])).toEqual([]);
  });
  test('single/empty → []', () => {
    expect(d.computeDistinguishingFields([{ name: 'A' }], ['name'])).toEqual([]);
    expect(d.computeDistinguishingFields([], ['name'])).toEqual([]);
  });
});

describe('selectVoiceFields', () => {
  test('always leads with the primary identifier, then priority order', () => {
    expect(d.selectVoiceFields(['email', 'department'])).toEqual(['name', 'department', 'email']);
  });
  test('falls back when nothing distinguishes', () => {
    expect(d.selectVoiceFields([], { fallback: ['name', 'email'] })).toEqual(['name', 'email']);
  });
});

describe('buildDisambiguationSpeech', () => {
  const g = d.defaultGuidance('en');
  test('zero matches → could-not-find', () => {
    expect(d.buildDisambiguationSpeech([], ['name'], g, { query: 'quantum' })).toMatch(/could not find.*quantum/i);
  });
  test('single match → direct statement', () => {
    expect(d.buildDisambiguationSpeech([{ name: 'Printer Support', category: 'IT' }], ['name', 'category'], g, {}))
      .toBe('I found one match: Printer Support, in IT.');
  });
  test('multiple → enumerated with ordinals + distinguishing attrs + ask', () => {
    const opts = [{ name: 'John', department: 'OICT' }, { name: 'John', department: 'DMS' }];
    const out = d.buildDisambiguationSpeech(opts, ['name', 'department'], g, {});
    expect(out).toContain('I found two options.');
    expect(out).toContain('First: John, in OICT.');
    expect(out).toContain('Second: John, in DMS.');
    expect(out).toMatch(/which one did you mean\?$/i);
  });
  test('truncates past maxSpoken and mentions the remainder', () => {
    const opts = Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, category: `C${i}` }));
    const out = d.buildDisambiguationSpeech(opts, ['name', 'category'], g, {});
    expect(out).toContain('Fifth:');
    expect(out).not.toContain('S5');
    expect(out).toContain('There are three more.');
  });
});

describe('normalizers', () => {
  test('flatUser pulls name/email/unit/location', () => {
    expect(d.flatUser({ name: 'A', email: 'a@x', unit: { name: 'OICT' }, location: { name: 'NY' } }))
      .toMatchObject({ name: 'A', email: 'a@x', department: 'OICT', location: 'NY' });
  });
  test('flatService maps title→name, domain→category', () => {
    expect(d.flatService({ serviceId: 'S1', title: 'Email Setup', domain: 'IT' }))
      .toMatchObject({ name: 'Email Setup', category: 'IT', ref: 'S1' });
  });
});

// ── engine integration: service disambiguation carries enumerated speech ───────
const snapshotFor = (serviceId) => ({
  serviceId, version: 1, phases: ['detail'], metadata: { title: serviceId, approvalRequired: false },
  slots: [{ slotId: 'subject', type: 'string', required: true, phase: 'detail', promptHint: 'Subject' }],
});
function makeEngine({ resolveSearch }) {
  const store = new Map();
  const draftService = createDraftSRService({
    store: { async get(k) { const v = store.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; }, async set(k, v) { store.set(k, JSON.parse(JSON.stringify(v))); return true; } },
    loadSnapshot: async (sid) => snapshotFor(sid), graphWrite: async () => [], now: () => Date.parse('2026-07-22T10:00:00Z'), makeRef: (_d, p = 'SR') => `${p}-1`,
  });
  const llm = new MockLLMProvider({
    structured: (prompt, schema) => (schema.properties && schema.properties.route ? { route: 'NEW_INTENT' } : {}),
    completion: () => 'ok',
  });
  return createEngine({ injectContext: false, llm, resolveSearch, draftService, loadSnapshot: async (sid) => snapshotFor(sid) });
}

describe('engine: service disambiguation speech', () => {
  test('a near-tie service cluster yields enumerated voice speech', async () => {
    const resolveSearch = async () => ([
      { type: 'SERVICE', serviceId: 'svc-a', title: 'Email Setup', domain: 'IT Services', score: 0.72 },
      { type: 'SERVICE', serviceId: 'svc-b', title: 'Email Migration', domain: 'IT Services', score: 0.70 },
    ]);
    const engine = makeEngine({ resolveSearch });
    const r = await engine.runTurn({ sessionId: 'dz1', message: 'I need help with email', lang: 'en' });
    expect(r.route).toBe('DISAMBIGUATE');
    expect(r.responseType).toBe('disambiguation');
    expect(r.speech).toContain('I found two options.');
    expect(r.speech).toContain('Email Setup');
    expect(r.speech).toContain('Email Migration');
    expect(r.speech).toMatch(/which one did you mean\?$/i);
  });
});
