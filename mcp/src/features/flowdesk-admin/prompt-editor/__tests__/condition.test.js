import { describe, it, expect, beforeEach } from 'vitest';

import { useRulesStore } from '../rulesStore';
import { summarise, diagnoseCondition } from '../conditionText';

/**
 * EC-009 — the scope of a rule, stored as a self-loop the operator never sees.
 *
 * The tests that matter here are about the seam: what the panel shows must be what
 * the compiler will read, and the storage trick must not leak into either.
 */

const origin = { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' };
const node = (nodeId) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion: `${nodeId}.`, origin,
});
const cond = (edgeId, source, condition) => ({
  edgeId, source, target: source, type: 'APPLIES_WHEN', condition,
});
const load = (nodes, edges) => useRulesStore.getState().loadGraph({
  nodes, edges, entryId: 'e1', name: 'g', namespace: 'EVOLUTIO:PROMPT',
});

beforeEach(() => useRulesStore.getState().reset());

describe('setting a condition', () => {
  it('creates the self-loop the compiler reads, with no trace in the relations list', () => {
    load([node('a'), node('b')], []);
    useRulesStore.getState().setCondition('a', { phase: ['fill'] });

    const [edge] = useRulesStore.getState().toGraph().edges;
    expect(edge).toMatchObject({ type: 'APPLIES_WHEN', source: 'a', target: 'a', condition: { phase: ['fill'] } });
    expect(useRulesStore.getState().connections('a')).toHaveLength(0);
  });

  it('changing it edits in place rather than piling up a second one', () => {
    load([node('a')], []);
    useRulesStore.getState().setCondition('a', { phase: ['fill'] });
    useRulesStore.getState().setCondition('a', { phase: ['confirm'] });
    const edges = useRulesStore.getState().toGraph().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].condition).toEqual({ phase: ['confirm'] });
  });

  it('clearing it removes every condition, so "always" is true', () => {
    // Removing only the first would leave the rule conditional while the panel said
    // otherwise.
    load([node('a')], [cond('c1', 'a', { phase: ['fill'] }), cond('c2', 'a', { phase: ['confirm'] })]);
    useRulesStore.getState().setCondition('a', null);
    expect(useRulesStore.getState().toGraph().edges).toHaveLength(0);
  });

  it('leaves other rules alone', () => {
    load([node('a'), node('b')], [cond('c1', 'b', { phase: ['fill'] })]);
    useRulesStore.getState().setCondition('a', { phase: ['confirm'] });
    expect(useRulesStore.getState().conditionOf('b')).toEqual({ phase: ['fill'] });
  });

  it('is undoable', () => {
    load([node('a')], [cond('c1', 'a', { phase: ['fill'] })]);
    useRulesStore.getState().setCondition('a', null);
    useRulesStore.getState().undo();
    expect(useRulesStore.getState().conditionOf('a')).toEqual({ phase: ['fill'] });
  });

  it('reports more than one rather than showing one of two as the whole scope', () => {
    load([node('a')], [cond('c1', 'a', { phase: ['fill'] }), cond('c2', 'a', { language: ['fr'] })]);
    expect(useRulesStore.getState().conditionCount('a')).toBe(2);
    expect(useRulesStore.getState().conditionOf('a')).toEqual({ phase: ['fill'] });
  });

  it('keeps keys the editor does not offer — a condition loaded with `channel` keeps it', () => {
    load([node('a')], [cond('c1', 'a', { phase: ['fill'], channel: 'voice' })]);
    useRulesStore.getState().setCondition('a', { ...useRulesStore.getState().conditionOf('a'), phase: ['confirm'] });
    expect(useRulesStore.getState().toGraph().edges[0].condition).toEqual({ phase: ['confirm'], channel: 'voice' });
  });
});

describe('the condition in words', () => {
  it('says plainly when there is none', () => {
    expect(summarise(null)).toBe('Always — this rule is in every prompt.');
  });

  it('ANDs the keys, and says "and" — the reader must not take them as alternatives', () => {
    const s = summarise({ phase: ['fill'], toolContext: ['has_draft'] });
    expect(s).toBe('Only when the form is being filled and a request is open.');
  });

  it('ORs within one key', () => {
    expect(summarise({ phase: ['fill', 'confirm'] }))
      .toBe('Only when the form is being filled or the request is being confirmed.');
  });

  it('reads a service family and a language as themselves', () => {
    expect(summarise({ serviceCategory: ['EO-HR'], language: ['fr'] }))
      .toBe('Only when the service is EO-HR and the language is fr.');
  });
});

/**
 * Mirrors `checkConditionsSane` in the validator — the same two findings, said at the
 * click that creates them instead of at the save that rejects them. The validator
 * stays the authority; this only changes the moment.
 */
describe('a condition that does nothing', () => {
  it('blocks one that can never hold', () => {
    const d = diagnoseCondition({ phase: ['fill'], toolContext: ['no_draft'] });
    expect(d.error).toMatch(/never apply/);
  });

  it('…including when every listed phase needs a draft', () => {
    expect(diagnoseCondition({ phase: ['fill', 'confirm'], toolContext: ['no_draft'] }).error).toBeTruthy();
  });

  it('allows it when one of the phases can occur without a draft', () => {
    expect(diagnoseCondition({ phase: ['fill', 'intent'], toolContext: ['no_draft'] }).error).toBeUndefined();
  });

  it('warns when every phase is selected', () => {
    const all = ['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off'];
    expect(diagnoseCondition({ phase: all }).warning).toMatch(/no effect/);
  });

  it('warns when a draft is required to be either open or not', () => {
    expect(diagnoseCondition({ toolContext: ['has_draft', 'no_draft'] }).warning).toMatch(/no effect/);
  });

  it('says nothing about a condition that constrains something', () => {
    expect(diagnoseCondition({ phase: ['fill'] })).toEqual({});
  });
});
