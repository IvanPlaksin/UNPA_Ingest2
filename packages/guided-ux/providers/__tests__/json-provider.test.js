/**
 * The static provider. Its job is to be enough — and to be honest about what it is
 * not, because an assistant that answers confidently from a provider that cannot look
 * anything up is the failure mode this design keeps refusing to ship.
 */

import test from 'node:test';
import assert from 'node:assert';
import { createJsonProvider } from '../json-provider.js';
import { checkProvider, resilientProvider, TourRunner, AnchorRegistry } from '../../core/index.js';

const DATA = {
  scenarios: [{
    id: 'operator-path',
    name: { en: 'Find why the assistant answered oddly' },
    languages: ['en', 'ru'],
    steps: [
      { id: 's1', content: { text: { en: 'Sessions are listed here.', ru: 'Здесь список сессий.' } }, next: 's2' },
      { id: 's2', anchorId: 'session.prompt-tab', content: { text: { en: 'This tab shows the rules in force on a turn.' } } },
    ],
  }],
  documents: [{ id: 'doc-hybrid', title: { en: 'Hybrid interpreter' }, text: { en: 'A template answers a click without calling the model.' } }],
};

test('it satisfies the provider contract', () => {
  assert.deepEqual(checkProvider(createJsonProvider(DATA)), { ok: true, missing: [] });
});

test('it declares that it CANNOT do vector search, so the assistant can say so', () => {
  const caps = createJsonProvider(DATA).capabilities();
  assert.equal(caps.vectorSearch, false);
  assert.match(caps.note, /only find what the tour itself says/i);
});

test('a scenario loads and runs with no database anywhere', async () => {
  // The point of this provider: the whole package works on a site that has nothing.
  const p = createJsonProvider(DATA);
  const scenario = await p.getScenario('operator-path');
  const registry = new AnchorRegistry();
  registry.register('session.prompt-tab', { element: () => ({}), label: 'Prompt tab' });
  const runner = new TourRunner({ scenario, registry, waitMs: 0 });
  const s = await runner.start();
  assert.equal(s.step.id, 's1');
  assert.equal((await runner.next()).anchor.ok, true);
});

test('a missing scenario throws rather than yielding an empty tour', async () => {
  await assert.rejects(() => createJsonProvider(DATA).getScenario('nope'), /no scenario/);
});

test('search finds a step and says which step it was — so the tour can go there', async () => {
  const hits = await createJsonProvider(DATA).search('rules in force');
  assert.ok(hits.length);
  assert.equal(hits[0].kind, 'step');
  assert.equal(hits[0].stepId, 's2');
  assert.equal(hits[0].source, 'json');
});

test('search follows the asked-for language', async () => {
  const hits = await createJsonProvider(DATA).search('сессий', { lang: 'ru' });
  assert.ok(hits.length, 'found the Russian text');
});

test('search finds standalone documents too, and labels them as such', async () => {
  const hits = await createJsonProvider(DATA).search('template click model');
  assert.ok(hits.some((h) => h.kind === 'document' && h.id === 'doc-hybrid'));
});

test('no match is an empty list, never a wrong-but-plausible one', async () => {
  assert.deepEqual(await createJsonProvider(DATA).search('quantum tunnelling'), []);
});

test('resilient() keeps a failing search from ending the tour, but never fakes a scenario', async () => {
  const broken = {
    capabilities: () => ({ vectorSearch: false }),
    listScenarios: async () => { throw new Error('down'); },
    getScenario: async () => { throw new Error('down'); },
    search: async () => { throw new Error('down'); },
  };
  const errs = [];
  const p = resilientProvider(broken, { onError: (where) => errs.push(where) });

  assert.deepEqual(await p.search('x'), []);
  assert.deepEqual(await p.listScenarios(), []);
  // A scenario that cannot load must NOT degrade to an empty tour on screen.
  await assert.rejects(() => p.getScenario('x'), /down/);
  assert.deepEqual(errs, ['search', 'listScenarios']);
});

test('a half-built provider is refused at wiring time, not mid-tour', () => {
  assert.throws(() => resilientProvider({ search: () => {} }), /missing/);
});
