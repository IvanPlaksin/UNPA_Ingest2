/**
 * Core behaviour. The subject of most of these is what happens when the screen is NOT
 * what the scenario expected — because that is the normal case on a live interface,
 * and pointing confidently at nothing is the failure this package exists to prevent.
 *
 * Plain `node --test`: the core has no dependencies, and a test suite that needed a
 * bundler would quietly disprove that.
 */

import test from 'node:test';
import assert from 'node:assert';

import { AnchorRegistry, TourRunner, validateScenario, coverage, spokenSeconds } from '../index.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

const el = (name) => ({ tag: name });

const SCENARIO = {
  id: 'operator-path',
  name: 'Find why the assistant answered oddly',
  entry: 's1',
  steps: [
    { id: 's1', content: { title: 'Start', text: 'This tour follows one problem to its fix.' }, next: 's2' },
    { id: 's2', anchorId: 'sessions.table', content: { text: 'Sessions are listed here.' }, next: 's3' },
    { id: 's3', anchorId: 'session.prompt-tab', content: { text: 'This tab shows the rules in force.' }, next: 's4' },
    { id: 's4', anchorId: 'editor.explorer', optional: true, content: { text: 'The rule explorer finds a rule by its text.' }, next: 's5' },
    { id: 's5', content: { text: 'That is the whole path.' } },
  ],
};

const makeRegistry = (present = []) => {
  const r = new AnchorRegistry();
  for (const id of present) r.register(id, { element: () => el(id), label: id });
  return r;
};

const run = (registry, over = {}) => new TourRunner({
  scenario: SCENARIO, registry, waitMs: 0, ...over,
});

// ── the registry ──────────────────────────────────────────────────────────────

test('an unregistered anchor is an answer, not an exception', () => {
  const r = new AnchorRegistry();
  const res = r.resolve('nothing.here');
  assert.equal(res.ok, false);
  assert.equal(res.status, 'not_registered');
  assert.match(res.reason, /has not been declared/i);
});

test('an anchor whose element is not mounted reports where it lives', () => {
  const r = new AnchorRegistry();
  r.register('editor.explorer', { element: () => null, label: 'Rule explorer', route: '/flowdesk-admin/prompt' });
  const res = r.resolve('editor.explorer');
  assert.equal(res.status, 'not_mounted');
  assert.match(res.reason, /\/flowdesk-admin\/prompt/);
});

test('an anchor can exist and still be unusable, and that is a different answer', () => {
  const r = new AnchorRegistry();
  r.register('save', { element: () => el('button'), label: 'Save', available: () => false });
  assert.equal(r.resolve('save').status, 'unavailable');
});

test('a host predicate that throws cannot take the tour down with it', () => {
  const r = new AnchorRegistry();
  r.register('bad', { element: () => { throw new Error('host blew up'); } });
  const res = r.resolve('bad');
  assert.equal(res.ok, false);
  assert.equal(res.status, 'threw');
  assert.match(res.reason, /host blew up/);
});

test('registering demands a getter, not an element', () => {
  const r = new AnchorRegistry();
  // A captured node keeps pointing at the first render's DOM after React replaces it —
  // a spotlight on a detached node looks exactly like a spotlight on nothing.
  assert.throws(() => r.register('x', { element: el('div') }), /function/);
});

test('a late unmount cannot delete a newer registration of the same id', () => {
  const r = new AnchorRegistry();
  const off1 = r.register('dup', { element: () => el('first') });
  r.register('dup', { element: () => el('second') });
  off1();
  assert.equal(r.has('dup'), true);
  assert.equal(r.resolve('dup').element.tag, 'second');
});

test('waitFor resolves as soon as a late anchor registers', async () => {
  const r = new AnchorRegistry();
  const p = r.waitFor('late', { timeoutMs: 500, pollMs: 10 });
  setTimeout(() => r.register('late', { element: () => el('late') }), 20);
  const res = await p;
  assert.equal(res.ok, true);
});

test('waitFor gives up with the reason, not with a hang', async () => {
  const r = new AnchorRegistry();
  const res = await r.waitFor('never', { timeoutMs: 30, pollMs: 5 });
  assert.equal(res.ok, false);
  assert.equal(res.status, 'not_registered');
});

// ── the runner ────────────────────────────────────────────────────────────────

test('a full walk when every anchor is there', async () => {
  const runner = run(makeRegistry(['sessions.table', 'session.prompt-tab', 'editor.explorer']));
  let s = await runner.start();
  assert.equal(s.step.id, 's1');
  assert.equal(s.anchor, null, 'a narration step needs no anchor');
  s = await runner.next();
  assert.equal(s.step.id, 's2');
  assert.equal(s.anchor.ok, true);
  s = await runner.next();
  s = await runner.next();
  assert.equal(s.step.id, 's4');
  s = await runner.next();
  assert.equal(s.step.id, 's5');
  s = await runner.next();
  assert.equal(s.status, 'finished');
});

test('a REQUIRED step with a missing anchor blocks and says why — it never points at nothing', async () => {
  const runner = run(makeRegistry(['sessions.table']));       // s3's anchor absent
  await runner.start();
  await runner.next();                                        // s2
  await runner.next();                                        // s3 — shown at once
  const s = await runner.settled();                           // …and then blocked
  assert.equal(s.status, 'blocked');
  assert.equal(s.step.id, 's3');
  assert.equal(s.anchor.ok, false);
  assert.match(s.notice, /not been declared|not on screen/i);
});

test('an OPTIONAL step with a missing anchor is skipped ALOUD', async () => {
  // Silently dropping it would leave a numbered tour quietly losing steps, with no way
  // for the user to know whether they missed something.
  const runner = run(makeRegistry(['sessions.table', 'session.prompt-tab']));  // s4 absent
  await runner.start();
  await runner.next();
  await runner.next();
  await runner.next();
  const s = await runner.settled();
  assert.equal(s.step.id, 's5', 'skipped past the optional step');
  assert.match(s.notice, /Skipped/i);
});

test('back returns to what was actually SEEN, not to the authored predecessor', async () => {
  const runner = run(makeRegistry(['sessions.table', 'session.prompt-tab']));
  await runner.start();
  await runner.next();
  await runner.next();
  const s = await runner.back();
  assert.equal(s.step.id, 's2');
});

test('a branch is chosen by asking the registry, never by guessing', async () => {
  const branching = {
    id: 'b', entry: 'a',
    steps: [
      { id: 'a', content: { text: 'start' }, next: [
        { to: 'has', when: { anchorAvailable: 'fancy.widget' } },
        { to: 'hasnt' },
      ] },
      { id: 'has', content: { text: 'you have the widget' } },
      { id: 'hasnt', content: { text: 'no widget here' } },
    ],
  };
  const withWidget = new TourRunner({ scenario: branching, registry: makeRegistry(['fancy.widget']), waitMs: 0 });
  await withWidget.start();
  assert.equal((await withWidget.next()).step.id, 'has');

  const without = new TourRunner({ scenario: branching, registry: makeRegistry([]), waitMs: 0 });
  await without.start();
  assert.equal((await without.next()).step.id, 'hasnt');
});

test('pause keeps the step, so the assistant can answer and hand back', async () => {
  const runner = run(makeRegistry(['sessions.table']));
  await runner.start();
  await runner.next();
  const paused = runner.pause('the user asked a question');
  assert.equal(paused.status, 'paused');
  assert.equal(paused.step.id, 's2');
  assert.equal(runner.resume().status, 'running');
});

test('the summary records what was shown, including a tour abandoned midway', async () => {
  const runner = run(makeRegistry(['sessions.table']));
  await runner.start();
  await runner.next();
  runner.stop();
  const sum = runner.summary();
  assert.deepEqual(sum.visited, ['s1', 's2']);
  assert.equal(sum.scenarioId, 'operator-path');
});

test('language falls back rather than rendering nothing', async () => {
  const runner = run(makeRegistry([]), {
    lang: 'ru',
    scenario: { id: 'x', steps: [{ id: 'only', content: { text: { en: 'English only' } } }] },
  });
  const s = await runner.start();
  assert.equal(runner.text(s.step), 'English only');
});

// ── the validator ─────────────────────────────────────────────────────────────

test('a dangling successor is refused before anyone sees the tour', () => {
  const { errors } = validateScenario({ id: 'x', steps: [{ id: 'a', content: { text: 'hi' }, next: 'ghost' }] });
  assert.ok(errors.some((e) => e.code === 'DANGLING_NEXT'));
});

test('the runner refuses to construct on a broken scenario', () => {
  assert.throws(
    () => new TourRunner({ scenario: { id: 'x', steps: [{ id: 'a', content: { text: 'hi' }, next: 'ghost' }] }, registry: new AnchorRegistry() }),
    /invalid scenario/,
  );
});

test('narration past the spoken attention limit warns, and past double it fails', () => {
  const long = 'x'.repeat(300);
  const huge = 'y'.repeat(600);
  const w = validateScenario({ id: 'x', steps: [{ id: 'a', content: { text: long } }] });
  assert.ok(w.warnings.some((x) => x.code === 'NARRATION_LONG'));
  assert.equal(w.errors.length, 0);

  const e = validateScenario({ id: 'x', steps: [{ id: 'a', content: { text: huge } }] });
  assert.ok(e.errors.some((x) => x.code === 'NARRATION_TOO_LONG'));
});

test('the spoken-length estimate matches what was measured on the real service', () => {
  // 68 characters took 3,988 ms on Azure Speech (swedencentral). The estimate has to
  // land near that or the limits above are decoration.
  assert.ok(Math.abs(spokenSeconds('x'.repeat(68)) - 4) < 0.5);
});

test('an unreachable step is reported — authored, never shown, silently', () => {
  const { warnings } = validateScenario({
    id: 'x', entry: 'a',
    steps: [{ id: 'a', content: { text: 'hi' } }, { id: 'orphan', content: { text: 'nobody gets here' } }],
  });
  assert.ok(warnings.some((w) => w.code === 'UNREACHABLE' && w.stepId === 'orphan'));
});

test('coverage turns "this will break for someone someday" into a list today', () => {
  const c = coverage(SCENARIO, makeRegistry(['sessions.table']));
  assert.equal(c.ok, false);
  assert.deepEqual(c.missing, ['session.prompt-tab', 'editor.explorer']);
});

// ── the three faults Ivan found on the first run ──────────────────────────────

test('the counter is a POSITION, not a visit count — "STEP 15 OF 12" was the symptom', async () => {
  // It counted `visited.length`, which only ever grows: walking forward and back
  // through a 12-step tour reported step 15. The number the user reads has to be
  // where they are, not how far they have walked.
  const runner = run(makeRegistry(['sessions.table', 'session.prompt-tab', 'editor.explorer']));
  await runner.start();
  await runner.next();
  await runner.next();
  await runner.back();
  await runner.back();
  const s = await runner.next();
  assert.equal(s.index, 2, 'second step of the scenario');
  assert.ok(s.index <= SCENARIO.steps.length, 'never past the end');
});

test('a step is shown IMMEDIATELY, before its anchor is found', async () => {
  // The old runner awaited the anchor first, so a step whose element lives on another
  // route left the button dead for the whole timeout — which reads as a broken tour.
  const registry = new AnchorRegistry();
  const runner = new TourRunner({ scenario: SCENARIO, registry, waitMs: 2000 });
  await runner.start();
  const t0 = Date.now();
  const s = await runner.next();                 // s2, anchor not registered at all
  assert.ok(Date.now() - t0 < 50, 'returned at once, not after the timeout');
  assert.equal(s.step.id, 's2');
  assert.equal(s.status, 'running');
  assert.equal(s.resolving, true, 'and it says the spotlight is still coming');
});

test('the spotlight lands by itself when the element finally appears', async () => {
  const registry = new AnchorRegistry();
  const runner = new TourRunner({ scenario: SCENARIO, registry, waitMs: 1000 });
  await runner.start();
  await runner.next();
  setTimeout(() => registry.register('sessions.table', { element: () => el('table') }), 20);
  const s = await runner.settled();
  assert.equal(s.anchor.ok, true);
  assert.equal(s.resolving, false);
});

test('a step abandoned mid-resolution does not overwrite the one now on screen', async () => {
  // Click Next twice quickly: the first step's late anchor must not drag the panel
  // back to it.
  const registry = new AnchorRegistry();
  const runner = new TourRunner({ scenario: SCENARIO, registry, waitMs: 300 });
  await runner.start();
  await runner.next();                            // s2, resolving
  const s = await runner.next();                  // s3 — user moved on
  registry.register('sessions.table', { element: () => el('late') });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(runner.state.step.id, s.step.id, 'still on the step the user asked for');
});
