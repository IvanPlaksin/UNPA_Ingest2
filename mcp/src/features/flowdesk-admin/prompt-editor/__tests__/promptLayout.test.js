import { describe, it, expect } from 'vitest';

import { layoutByPriority } from '../promptLayout';

/**
 * The live prompt graph has no edges — 22 nodes, `edgeCount: 0`, order carried by
 * `priority`. So the layout has to show what the graph IS (typed rules in
 * compilation order) rather than pretend to be a flowchart of a flow that does not
 * exist. These tests pin the properties an operator relies on.
 */

const node = (id, type, priority, over = {}) => ({
  id, type: 'ruleNode', data: { nodeType: type, priority, title: id, ...over },
});

describe('layoutByPriority', () => {
  it('places the narrative above the theses, and the theses above the limits', () => {
    const out = layoutByPriority([
      node('c1', 'Constraint', 100),
      node('t1', 'Thesis', 10),
      node('n1', 'Narrative', 100),
    ]);
    const y = Object.fromEntries(out.map((n) => [n.id, n.position.y]));

    expect(y.n1).toBeLessThan(y.t1);
    expect(y.t1).toBeLessThan(y.c1);
  });

  it('orders theses left to right by priority — lower priority compiles earlier', () => {
    const out = layoutByPriority([node('late', 'Thesis', 100), node('early', 'Thesis', 0)]);
    const x = Object.fromEntries(out.map((n) => [n.id, n.position.x]));

    expect(x.early).toBeLessThan(x.late);
  });

  it('keeps persona and constraints in separate halves of the bottom band', () => {
    const out = layoutByPriority([node('p1', 'Persona', 100), node('c1', 'Constraint', 100)]);
    const byId = Object.fromEntries(out.map((n) => [n.id, n.position]));

    expect(byId.p1.y).toBe(byId.c1.y);
    expect(byId.p1.x).toBeLessThan(byId.c1.x);
  });

  it('puts an immutable constraint after a mutable one of equal priority', () => {
    const out = layoutByPriority([
      node('immutable', 'Constraint', 100, { immutable: true }),
      node('ordinary', 'Constraint', 100),
    ]);
    const x = Object.fromEntries(out.map((n) => [n.id, n.position.x]));

    expect(x.ordinary).toBeLessThan(x.immutable);
  });

  it('is stable — the same graph laid out twice does not move', () => {
    const nodes = [node('b', 'Thesis', 100), node('a', 'Thesis', 100), node('c', 'Thesis', 50)];
    const first = layoutByPriority(nodes);
    const second = layoutByPriority(nodes);

    expect(second.map((n) => [n.id, n.position])).toEqual(first.map((n) => [n.id, n.position]));
  });

  it('wraps a long band instead of running off the canvas', () => {
    const many = Array.from({ length: 9 }, (_, i) => node(`t${i}`, 'Thesis', i));
    const out = layoutByPriority(many, { perRow: 4 });
    const rows = new Set(out.map((n) => n.position.y));

    expect(rows.size).toBe(3); // 9 nodes, 4 per row
  });

  it('an unknown node type is laid out with the theses rather than dropped', () => {
    const out = layoutByPriority([node('weird', 'Hologram', 100)]);
    expect(out).toHaveLength(1);
    expect(out[0].position).toBeDefined();
  });

  it('never loses a node, whatever shape it is in', () => {
    const odd = { id: 'shapeless' };
    const out = layoutByPriority([node('t', 'Thesis', 1), odd]);
    expect(out.map((n) => n.id).sort()).toEqual(['shapeless', 't']);
  });

  it('handles an empty graph', () => {
    expect(layoutByPriority([])).toEqual([]);
    expect(layoutByPriority(null)).toEqual([]);
  });
});
