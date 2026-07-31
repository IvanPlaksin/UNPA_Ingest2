/**
 * Host Adapter Protocol v1.0.
 *
 * Most of these test what the protocol does when the HOST misbehaves — returns
 * nothing, throws, hangs, or cannot do the thing at all. That is the whole reason the
 * protocol exists rather than a few callbacks: the tour has to keep its promises on
 * top of an application it did not write and cannot fix.
 */

import test from 'node:test';
import assert from 'node:assert';

import { createNavigator, checkAdapter, nullAdapter, safetyOf, AnchorRegistry } from '../index.js';

const CAPS = {
  navigation: { routes: true, tabs: true, modals: false, drawers: true, anchors: true },
  query: { sessions: true, rules: true },
  interact: { select: true, expand: true, focus: true, highlight: true },
  constraints: { maxQueryResults: 5, asyncNavigationTimeout: 3000 },
};

const adapter = (over = {}) => ({
  hostType: 'test',
  capabilities: () => CAPS,
  navigate: async () => ({ ok: true }),
  query: async () => ({ ok: true, items: [], total: 0 }),
  reveal: async () => ({ ok: true }),
  interact: async () => ({ ok: true }),
  ...over,
});

// ── wiring ────────────────────────────────────────────────────────────────────

test('a half-built adapter is refused at wiring time, not mid-tour', () => {
  assert.deepEqual(checkAdapter({ navigate: () => {} }).missing.length > 0, true);
  assert.throws(() => createNavigator({ navigate: () => {} }), /missing/);
});

test('the null adapter says plainly that this application cannot help', async () => {
  const nav = createNavigator(nullAdapter());
  const r = await nav.navigate({ type: 'tab', target: 'sessions' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_supported');
});

// ── rule 2: every action returns an outcome ───────────────────────────────────

test('a host that returns NOTHING is a failure, not a silent success', async () => {
  // Six times in this codebase: the call was accepted, the field was set, the effect
  // never happened. "Probably worked" is not an outcome we will show a user.
  const nav = createNavigator(adapter({ navigate: async () => undefined }));
  const r = await nav.navigate({ type: 'tab', target: 'sessions' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown');
});

test('a host that THROWS does not take the tour with it', async () => {
  const nav = createNavigator(adapter({ navigate: async () => { throw new Error('router exploded'); } }));
  const r = await nav.navigate({ type: 'tab', target: 'sessions' });
  assert.equal(r.ok, false);
  assert.match(r.message, /router exploded/);
});

test('a host that HANGS is given a deadline', async () => {
  const nav = createNavigator(adapter({ navigate: () => new Promise(() => {}) }), { timeoutMs: 40 });
  const r = await nav.navigate({ type: 'tab', target: 'sessions' });
  assert.equal(r.reason, 'timeout');
});

test('`true` is accepted as a terse success — a host may be simple', async () => {
  const nav = createNavigator(adapter({ navigate: async () => true }));
  assert.equal((await nav.navigate({ type: 'tab', target: 'x' })).ok, true);
});

// ── rule 3: finished means VISIBLE ────────────────────────────────────────────

test('navigation is not done when the host says so — it is done when the anchor appears', async () => {
  const registry = new AnchorRegistry();
  const nav = createNavigator(adapter(), { registry, timeoutMs: 500 });
  setTimeout(() => registry.register('sessions.table', { element: () => ({}) }), 20);
  const r = await nav.navigate({ type: 'tab', target: 'sessions', waitForAnchor: 'sessions.table' });
  assert.equal(r.ok, true);
  assert.equal(r.anchorReady, true);
});

test('a host that navigated to nowhere is reported as such', async () => {
  const registry = new AnchorRegistry();
  const nav = createNavigator(adapter(), { registry, timeoutMs: 40 });
  const r = await nav.navigate({ type: 'tab', target: 'sessions', waitForAnchor: 'never.appears' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timeout');
  assert.equal(r.navigated, true, 'the host did its part, and that is worth knowing');
});

// ── rule 5: capabilities, and degrading out loud ──────────────────────────────

test('an unsupported navigation says what the user can do instead', async () => {
  const nav = createNavigator(adapter());
  const r = await nav.navigate({ type: 'modal', target: 'settings' });   // modals: false
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_supported');
  assert.match(r.fallback, /yourself/i);
});

test('an unknown query domain is refused rather than guessed at', async () => {
  const nav = createNavigator(adapter());
  const r = await nav.query({ domain: 'invoices', criteria: { text: 'x' } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.items, []);
});

test('capabilities are filled in from the floor, so a sparse host cannot crash a caller', () => {
  const nav = createNavigator(adapter({ capabilities: () => ({ navigation: { tabs: true } }) }));
  const c = nav.capabilities();
  assert.equal(c.navigation.tabs, true);
  assert.equal(c.navigation.modals, false);
  assert.deepEqual(c.query, {});
});

test('a capabilities() that throws degrades to "can do nothing"', () => {
  const nav = createNavigator(adapter({ capabilities: () => { throw new Error('nope'); } }));
  assert.equal(nav.capabilities().navigation.tabs, false);
});

// ── rule 6: query and reveal are different operations ─────────────────────────

test('query returns data and touches nothing on screen', async () => {
  const seen = [];
  const nav = createNavigator(adapter({
    query: async (i) => { seen.push(i); return { ok: true, items: [{ id: 'fdv2-1', title: 'A session' }], total: 1 }; },
    reveal: async () => { throw new Error('reveal must not be called by query'); },
  }));
  const r = await nav.query({ domain: 'sessions', criteria: { text: 'vacation' } });
  assert.equal(r.items.length, 1);
  assert.equal(seen[0].criteria.text, 'vacation');
});

test('the host limit caps the caller, not the other way round', async () => {
  let asked = null;
  const nav = createNavigator(adapter({ query: async (i) => { asked = i.limit; return { ok: true, items: [], total: 0 }; } }));
  await nav.query({ domain: 'sessions', criteria: {}, limit: 500 });
  assert.equal(asked, 5, 'clamped to the host maximum');
});

// ── rule 7: safety classes ────────────────────────────────────────────────────

test('the classes are what the standard says they are', () => {
  assert.equal(safetyOf('navigate.tab'), 'navigation');
  assert.equal(safetyOf('query'), 'query');
  assert.equal(safetyOf('reveal'), 'mutation');
  assert.equal(safetyOf('interact.select'), 'mutation');
  assert.equal(safetyOf('interact.highlight'), 'navigation');
});

test('an unclassified action is refused — unknown blast radius is not a default', async () => {
  const nav = createNavigator(adapter());
  const r = await nav.interact({ type: 'delete', anchorId: 'x' });
  assert.equal(r.ok, false);
});

test('a restricted navigator performs navigation and query, and REFUSES mutation', async () => {
  // This is what the assistant is handed. The admin screen it runs in has "promote to
  // production" two clicks away; a model with hands here is not a UX decision.
  const nav = createNavigator(adapter()).restrictedTo(['navigation', 'query']);

  assert.equal((await nav.navigate({ type: 'tab', target: 'sessions' })).ok, true);
  assert.equal((await nav.query({ domain: 'sessions', criteria: {} })).ok, true);

  const denied = await nav.reveal({ domain: 'sessions', id: 'fdv2-1' });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'not_permitted');
  // …but it may OFFER it, and the flag says so rather than leaving the caller to guess.
  assert.equal(denied.proposable, true);
});

test('a restricted navigator never even reaches the host for a forbidden action', async () => {
  let called = false;
  const nav = createNavigator(adapter({ reveal: async () => { called = true; return { ok: true }; } }))
    .restrictedTo(['navigation']);
  await nav.reveal({ domain: 'sessions', id: 'x' });
  assert.equal(called, false);
});

// ── the case the standard names outright ──────────────────────────────────────

test('select with no index means the FIRST item', async () => {
  let got = null;
  const nav = createNavigator(adapter({ interact: async (i) => { got = i; return { ok: true }; } }));
  await nav.interact({ type: 'select', anchorId: 'sessions.table' });
  assert.equal(got.params.index, 0);
});

test('an explicit index or value is left alone', async () => {
  let got = null;
  const nav = createNavigator(adapter({ interact: async (i) => { got = i; return { ok: true }; } }));
  await nav.interact({ type: 'select', anchorId: 'x', params: { value: 'fdv2-9' } });
  assert.equal(got.params.value, 'fdv2-9');
  assert.equal(got.params.index, undefined);
});

test('every action is reported to the host application for its own audit', async () => {
  const log = [];
  const nav = createNavigator(adapter(), { onAction: (e) => log.push(e.action) });
  await nav.navigate({ type: 'tab', target: 'sessions' });
  await nav.query({ domain: 'sessions', criteria: {} });
  assert.deepEqual(log, ['navigate.tab', 'query']);
});
