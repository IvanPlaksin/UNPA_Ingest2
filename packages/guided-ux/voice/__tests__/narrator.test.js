/**
 * Narration. Most of these are about restraint: staying silent until asked, stopping
 * the instant someone speaks to the assistant, and never letting a speech failure
 * become a tour failure.
 */

import test from 'node:test';
import assert from 'node:assert';
import { Narrator } from '../index.js';

const mk = (over = {}) => {
  const calls = { synth: [], played: [], stopped: 0 };
  const n = new Narrator({
    enabled: true,
    synthesize: async (text, opts) => { calls.synth.push({ text, ...opts }); return `audio:${text}`; },
    play: async (a) => { calls.played.push(a); },
    stopPlayback: () => { calls.stopped += 1; },
    ...over,
  });
  return { n, calls };
};

test('it starts MUTED unless asked — sound that starts by itself is the top complaint', () => {
  const { n } = mk({ enabled: undefined });
  assert.equal(n.enabled, false);
});

test('muted, it says why instead of pretending it spoke', async () => {
  const { n, calls } = mk({ enabled: false });
  const r = await n.speak('hello');
  assert.deepEqual(r, { spoken: false, reason: 'muted' });
  assert.equal(calls.synth.length, 0);
});

test('it speaks, once, through the host', async () => {
  const { n, calls } = mk();
  const r = await n.speak('This tab shows the rules in force.');
  assert.equal(r.spoken, true);
  assert.equal(calls.synth.length, 1);
  assert.equal(calls.played[0], 'audio:This tab shows the rules in force.');
});

test('prefetch removes the 0.5–1.3s silence before the NEXT step', async () => {
  // Measured on Azure Speech: first chunk 540–1317ms. Without prefetch that gap sits
  // between the click and any sound, and users click again into it.
  const { n, calls } = mk();
  n.prefetch('step two');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.synth.length, 1, 'fetched ahead of time');
  await n.speak('step two');
  assert.equal(calls.synth.length, 1, 'and not fetched again when spoken');
});

test('a prefetch that fails stays invisible; the real attempt reports', async () => {
  let first = true;
  const { n } = mk({
    synthesize: async (t) => { if (first) { first = false; throw new Error('boom'); } return `audio:${t}`; },
  });
  n.prefetch('x');
  await new Promise((r) => setTimeout(r, 5));
  const r = await n.speak('x');
  // The cached rejection resolved to null rather than poisoning the speak call.
  assert.equal(r.spoken, false);
  assert.match(r.reason, /unavailable/);
});

test('stop is immediate and unconditional — someone is talking to us', async () => {
  const { n, calls } = mk();
  n.stop();
  assert.equal(calls.stopped, 1);
  assert.equal(n.speaking, false);
});

test('a step superseded while its audio was in flight does not play late', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { n, calls } = mk({
    synthesize: async (t) => { await gate; return `audio:${t}`; },
  });
  const p = n.speak('slow one');
  n.stop();                       // user advanced
  release();
  const r = await p;
  assert.equal(r.spoken, false);
  assert.equal(r.reason, 'superseded');
  assert.equal(calls.played.length, 0);
});

test('speech being down does not take the tour with it', async () => {
  const { n } = mk({ synthesize: async () => { throw new Error('azure unreachable'); } });
  const r = await n.speak('anything');
  assert.equal(r.spoken, false);
  assert.match(r.reason, /azure unreachable/);
});

test('switching language drops cached audio, so nothing is narrated in the old one', async () => {
  const { n, calls } = mk();
  await n.speak('hello');
  n.setLanguage('ru');
  await n.speak('hello');
  assert.equal(calls.synth.length, 2);
  assert.equal(calls.synth[1].lang, 'ru');
});

test('muting mid-sentence stops the sound, not just future ones', () => {
  const { n, calls } = mk();
  n.setEnabled(false);
  assert.equal(calls.stopped, 1);
});

test('the cache is bounded on a long tour', async () => {
  const { n } = mk();
  for (let i = 0; i < 20; i += 1) n.prefetch(`step ${i}`);
  n.trimCache(8);
  assert.ok(n._cache.size <= 8);
});
