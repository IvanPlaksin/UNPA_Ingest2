'use strict';

/**
 * EC-012/EC-014 — attribution once a rule can be in the version and not in the prompt.
 *
 * The first block is the correction. "In force" used to mean "compiled into the
 * version the turn recorded", which was exact while every compile was the same
 * compile. With conditions it over-credits: a rule scoped to one phase would be
 * reported as governing every turn of its version, including the ones where the model
 * never saw it. Wrong in the flattering direction — the direction nobody checks.
 */

const {
  explainExclusion, firstMismatch, parseContext,
} = require('../prompt-attribution.service');

const ctx = (over = {}) => ({
  phase: 'confirm', toolContext: ['has_draft'], serviceCategory: 'EO-HR',
  serviceId: 'EO-HR-01', language: 'en', channel: 'text', ...over,
});

describe('the context recorded on a turn', () => {
  test('is read from the stored JSON', () => {
    expect(parseContext('{"phase":"fill"}')).toEqual({ phase: 'fill' });
  });

  test('is null when the turn predates context tracking, rather than an empty object', () => {
    // The difference matters: `{}` would compile as "no constraints" and quietly
    // report the unconditional prompt as what ran.
    expect(parseContext(null)).toBeNull();
    expect(parseContext('')).toBeNull();
  });

  test('survives corrupt JSON without taking the panel down with it', () => {
    expect(parseContext('{oh no')).toBeNull();
  });
});

describe('which key of a condition the turn failed', () => {
  test('names the key, what it wanted, and what the turn actually was', () => {
    expect(firstMismatch({ phase: ['fill'] }, ctx()))
      .toBe('it requires phase to be fill; this turn had confirm');
  });

  test('says nothing when the condition held', () => {
    expect(firstMismatch({ phase: ['confirm'] }, ctx())).toBeNull();
  });

  test('matches against a LIST-valued context key', () => {
    // toolContext is several facts at once; the condition holds if any of them match.
    expect(firstMismatch({ toolContext: ['has_draft'] }, ctx())).toBeNull();
    expect(firstMismatch({ toolContext: ['searching_kb'] }, ctx()))
      .toBe('it requires toolContext to be searching_kb; this turn had has_draft');
  });

  test('reports the FIRST failing key, since one is enough to exclude the rule', () => {
    const miss = firstMismatch({ phase: ['fill'], language: ['fr'] }, ctx());
    expect(miss).toMatch(/phase/);
    expect(miss).not.toMatch(/language/);
  });

  test('skips the keys that DID hold and names the one that did not', () => {
    expect(firstMismatch({ phase: ['confirm'], language: ['fr'] }, ctx()))
      .toBe('it requires language to be fr; this turn had en');
  });

  test('says so plainly when the turn recorded nothing for that key', () => {
    expect(firstMismatch({ serviceCategory: ['EO-FIN'] }, ctx({ serviceCategory: null })))
      .toBe('it requires serviceCategory to be EO-FIN; this turn had nothing recorded');
  });
});

describe('why a rule is missing from this prompt', () => {
  const node = { nodeId: 'form-guidance', title: 'Form guidance', status: 'ACTIVE' };
  const graph = {
    nodes: [node],
    edges: [{ edgeId: 'c1', type: 'APPLIES_WHEN', source: 'form-guidance', target: 'form-guidance', condition: { phase: ['fill'] } }],
  };

  test('a condition that did not hold is explained by the comparison, not by its name', () => {
    // "Excluded by condition" restates the question. This answers it.
    const out = explainExclusion({ nodeId: 'form-guidance', reason: 'condition' }, node, graph, ctx());
    expect(out).toBe('it requires phase to be fill; this turn had confirm');
  });

  test('admits when the turn has no context instead of guessing which key failed', () => {
    const out = explainExclusion({ nodeId: 'form-guidance', reason: 'condition' }, node, graph, null);
    expect(out).toMatch(/no context/);
  });

  test('several conditions are ORed, so the answer says all of them failed', () => {
    const g = {
      nodes: [node],
      edges: [
        { edgeId: 'c1', type: 'APPLIES_WHEN', source: 'form-guidance', target: 'form-guidance', condition: { phase: ['fill'] } },
        { edgeId: 'c2', type: 'APPLIES_WHEN', source: 'form-guidance', target: 'form-guidance', condition: { language: ['fr'] } },
      ],
    };
    const out = explainExclusion({ nodeId: 'form-guidance', reason: 'condition' }, node, g, ctx());
    expect(out).toMatch(/None of its conditions held/);
    expect(out).toMatch(/phase/);
    expect(out).toMatch(/language/);
  });

  test('a CANDIDATE is explained as not-yet-accepted, not as broken', () => {
    const out = explainExclusion({ reason: 'status' }, { status: 'CANDIDATE' }, graph, ctx());
    expect(out).toMatch(/proposed but not yet accepted/);
  });

  test('a DEPRECATED rule is explained as withdrawn', () => {
    expect(explainExclusion({ reason: 'status' }, { status: 'DEPRECATED' }, graph, ctx()))
      .toMatch(/DEPRECATED/);
  });

  test('a rule scoped to the state machine says which part, and that the agent never runs it', () => {
    const out = explainExclusion({ reason: 'engine_node' }, { appliesToNodes: ['router'] }, graph, ctx());
    expect(out).toMatch(/router/);
    expect(out).toMatch(/state machine/);
  });

  test('an unknown reason does not invent one', () => {
    expect(explainExclusion({ reason: 'something-new' }, node, graph, ctx()))
      .toBe('Not compiled into this prompt.');
  });
});
