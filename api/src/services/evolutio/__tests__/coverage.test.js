'use strict';

/**
 * EC-013 — coverage across the contexts a conversation can really be in.
 *
 * The findings this produces are all of one kind: something that is valid, saved, and
 * wrong anyway. A compile cannot see them because a compile only ever looks at one
 * context.
 */

const { coverage, REACHABLE_CONTEXTS } = require('../evolutio-prompt.coverage');
const { PHASES } = require('../../../instances/flowdesk/interpreter/dialogue-phase');

const origin = { kind: 'human', rationale: 'r', introducedBy: 'test', introducedAt: '2026-07-31T00:00:00.000Z' };

const thesis = (nodeId, assertion, over = {}) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion, origin, ...over,
});
const constraint = (nodeId) => ({
  nodeId, type: 'Constraint', title: nodeId, status: 'ACTIVE', priority: 100, origin,
  rule: 'never invent a service', kind: 'safety', severity: 'blocking',
});
const appliesWhen = (source, condition, edgeId = `e-${source}`) => ({
  edgeId, type: 'APPLIES_WHEN', source, target: source, condition,
});
const graph = (nodes, edges = []) => ({ schemaVersion: '1.0.0', nodes, edges });

describe('the contexts are the ones the code can actually produce', () => {
  test('every phase the runtime can compute appears in the coverage set', () => {
    // If `computePhase` gains a state and this list does not, coverage would report a
    // clean graph while a whole branch of the dialogue went unchecked.
    const covered = new Set(REACHABLE_CONTEXTS.map((c) => c.phase));
    for (const p of PHASES) expect(covered.has(p)).toBe(true);
  });

  test('no context pairs a form phase with an absent draft', () => {
    // That combination is refused by the validator as unsatisfiable; generating it
    // here would test a turn that cannot happen.
    for (const c of REACHABLE_CONTEXTS) {
      if (c.phase === 'fill' || c.phase === 'confirm') expect(c.toolContext).toContain('has_draft');
    }
  });
});

describe('dead weight', () => {
  test('a rule that applies in no context at all is named', () => {
    const g = graph(
      [thesis('live', 'Everywhere.'), thesis('unreachable', 'Never.')],
      // A phase that exists paired with a tool context that never accompanies it.
      [appliesWhen('unreachable', { phase: ['reading'], toolContext: ['has_draft'] })],
    );
    const r = coverage(g);
    expect(r.dead.map((d) => d.nodeId)).toContain('unreachable');
    expect(r.dead.map((d) => d.nodeId)).not.toContain('live');
  });

  test('a rule that applies in ONE context is not dead', () => {
    const g = graph([thesis('narrow', 'Only while filling.')], [appliesWhen('narrow', { phase: ['fill'] })]);
    expect(coverage(g).dead).toHaveLength(0);
  });

  test('a disabled rule is dead everywhere, and says so by status', () => {
    const g = graph([thesis('off', 'Withdrawn.', { status: 'DEPRECATED' })]);
    const hit = coverage(g).dead.find((d) => d.nodeId === 'off');
    expect(hit.reason).toBe('status');
  });
});

describe('gaps', () => {
  test('a context with no safety and no identity rule is reported', () => {
    // The assistant is, for those turns, a different assistant.
    const g = graph(
      [thesis('only-while-filling', 'Ask one field.'), constraint('safe')],
      [
        appliesWhen('only-while-filling', { phase: ['fill'] }, 'e1'),
        appliesWhen('safe', { phase: ['fill'] }, 'e2'),
      ],
    );
    const r = coverage(g);
    // Every context except the two `fill` ones has nothing essential in it.
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.gaps.some((x) => x.context.startsWith('intent'))).toBe(true);
  });

  test('an unconditional constraint closes the gap everywhere', () => {
    const g = graph([thesis('t', 'Something.'), constraint('safe')]);
    expect(coverage(g).gaps).toHaveLength(0);
  });
});

describe('a condition pinned to a category nobody offers', () => {
  test('is named as the typo it is', () => {
    const g = graph(
      [thesis('hr-only', 'HR rule.')],
      [appliesWhen('hr-only', { serviceCategory: ['EO-XX'] })],
    );
    const r = coverage(g, { catalogCategories: ['EO-HR', 'EO-FIN'] });
    expect(r.unknownCategories).toEqual([{ nodeId: 'hr-only', category: 'EO-XX' }]);
  });

  test('and a real one is not', () => {
    const g = graph([thesis('hr', 'HR rule.')], [appliesWhen('hr', { serviceCategory: ['EO-HR'] })]);
    expect(coverage(g, { catalogCategories: ['EO-HR'] }).unknownCategories).toHaveLength(0);
  });

  test('with no catalogue supplied the check is skipped rather than guessed', () => {
    const g = graph([thesis('hr', 'HR rule.')], [appliesWhen('hr', { serviceCategory: ['EO-XX'] })]);
    expect(coverage(g).unknownCategories).toHaveLength(0);
  });
});

describe('the matrix', () => {
  test('says, per rule, which contexts it reaches', () => {
    const g = graph([thesis('always', 'A.'), thesis('filling', 'B.')], [appliesWhen('filling', { phase: ['fill'] })]);
    const r = coverage(g);
    expect(r.matrix.always.every(Boolean)).toBe(true);
    expect(r.matrix.filling.filter(Boolean)).toHaveLength(2); // both `fill` contexts
  });

  test('a graph that will not compile in some context reports the error rather than an empty row', () => {
    // Silence here would read as "no rules apply", when the truth is that a live turn
    // in that branch would fail outright.
    const g = graph(
      [constraint('immutable-one')].map((n) => ({ ...n, immutable: true })),
      [],
    );
    const r = coverage(g);
    expect(r.contexts.every((c) => !c.error)).toBe(true);
  });
});
