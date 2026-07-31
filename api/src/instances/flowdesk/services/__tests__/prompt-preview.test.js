'use strict';

/**
 * EC-011 — the prompt per context, and the table that says what differs.
 *
 * The first test in this file is the one that matters. Until EC-011 the compile path
 * silently dropped the context and passed only the language, which was harmless while
 * every compile was the same compile. With conditions it stops being harmless: every
 * preview would show the unconditional prompt and report, convincingly, that nothing
 * had been excluded.
 */

const pe = require('../prompt-editor.service');

const origin = { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' };
const thesis = (nodeId, assertion, over = {}) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion, origin, ...over,
});
const constraint = (nodeId) => ({
  nodeId, type: 'Constraint', title: nodeId, status: 'ACTIVE', priority: 100, origin,
  rule: 'never invent a service', kind: 'safety', severity: 'blocking',
});
const when = (source, condition, edgeId = `c-${source}`) => ({
  edgeId, type: 'APPLIES_WHEN', source, target: source, condition,
});
const graph = (nodes, edges = []) => ({ schemaVersion: '1.0.0', nodes, edges });

const FILL = 'filling the form';
const CONFIRM = 'confirming';

describe('the context reaches the compiler', () => {
  const g = graph(
    [thesis('while-filling', 'Ask one field at a time.'), constraint('safe')],
    [when('while-filling', { phase: ['fill'] })],
  );

  test('a conditional rule is in the prompt where its condition holds', () => {
    const p = pe.previewContexts(g, { contexts: [FILL] });
    expect(p.contexts[0].included).toContain('while-filling');
    expect(p.contexts[0].text).toMatch(/Ask one field at a time/);
  });

  test('…and is absent, with a reason, where it does not', () => {
    const p = pe.previewContexts(g, { contexts: [CONFIRM] });
    expect(p.contexts[0].included).not.toContain('while-filling');
    expect(p.contexts[0].excluded.find((e) => e.nodeId === 'while-filling').reason).toBe('condition');
    expect(p.contexts[0].text).not.toMatch(/Ask one field at a time/);
  });

  test('the cacheable core does not move between contexts — only the tail does', () => {
    // The whole point of the two-layer emit. If the core differed per context the
    // provider could not cache it, and every turn would be charged in full.
    const p = pe.previewContexts(g, { contexts: [FILL, CONFIRM] });
    const [a, b] = p.contexts;
    expect(a.layers.coreTokens).toBe(b.layers.coreTokens);
    expect(a.layers.conditionalTokens).toBeGreaterThan(0);
    expect(b.layers.conditionalTokens).toBe(0);
  });
});

describe('the per-rule table', () => {
  const g = graph(
    [
      thesis('while-filling', 'Ask one field at a time.'),
      thesis('while-confirming', 'Read the summary back.'),
      thesis('always', 'Be brief.'),
      constraint('safe'),
    ],
    [
      when('while-filling', { phase: ['fill'] }, 'c1'),
      when('while-confirming', { phase: ['confirm'] }, 'c2'),
    ],
  );

  test('says, per rule, whether it reaches each context', () => {
    const p = pe.previewContexts(g, { contexts: [FILL, CONFIRM] });
    const row = (id) => p.rules.find((r) => r.nodeId === id);
    expect(row('while-filling').cells.map((c) => c.state)).toEqual(['in', 'out']);
    expect(row('while-confirming').cells.map((c) => c.state)).toEqual(['out', 'in']);
    expect(row('always').cells.map((c) => c.state)).toEqual(['in', 'in']);
  });

  test('sorts the rules that DIFFER first — they are why the panel was opened', () => {
    const p = pe.previewContexts(g, { contexts: [FILL, CONFIRM] });
    const differing = p.rules.slice(0, 2).map((r) => r.nodeId).sort();
    expect(differing).toEqual(['while-confirming', 'while-filling']);
  });

  test('carries the title, so the table is readable without the graph beside it', () => {
    const p = pe.previewContexts(graph([thesis('n1', 'x', { title: 'One question per turn' })]), { contexts: [FILL] });
    expect(p.rules[0].title).toBe('One question per turn');
  });
});

describe('what the caller may ask for', () => {
  test('the full list of contexts travels with the answer', () => {
    const p = pe.previewContexts(graph([thesis('a', 'x')]), {});
    expect(p.allContexts).toHaveLength(9);
    expect(p.allContexts).toContain(FILL);
  });

  test('an unknown context name is ignored rather than invented', () => {
    // Four independent dropdowns would let someone ask for `fill + no_draft`, a turn
    // that cannot happen. The name has to be one of the nine.
    const p = pe.previewContexts(graph([thesis('a', 'x')]), { contexts: ['fill + no_draft'] });
    expect(p.contexts).toHaveLength(0);
  });

  test('with no context named it previews the first rather than nothing', () => {
    const p = pe.previewContexts(graph([thesis('a', 'x')]), {});
    expect(p.contexts).toHaveLength(1);
  });
});

describe('the vocabulary a condition may use', () => {
  test('comes from the schema, so the editor cannot offer a value the compiler lacks', () => {
    const v = pe.conditionVocabulary();
    expect(v.phase.values).toEqual(['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off']);
    expect(v.toolContext.values).toContain('has_draft');
  });

  test('marks the service family as free text — the catalogue supplies it, not an enum', () => {
    expect(pe.conditionVocabulary().serviceCategory.free).toBe(true);
    expect(pe.conditionVocabulary().serviceCategory.values).toBeNull();
  });

  test('names the keys it does NOT offer, so they are carried rather than dropped', () => {
    expect(pe.conditionVocabulary().passthroughKeys).toEqual(
      expect.arrayContaining(['channel', 'engineNode', 'serviceId', 'activeRoute']),
    );
  });

  test('and meta() serves it — this is the only place the editor reads it from', () => {
    expect(pe.meta().conditions.phase.values).toContain('fill');
  });
});
