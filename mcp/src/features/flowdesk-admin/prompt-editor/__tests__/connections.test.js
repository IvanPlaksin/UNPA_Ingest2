import { describe, it, expect, beforeEach } from 'vitest';

import {
  fromEvolutioEdge, toEvolutioEdge, connectionsOf, conflictWouldBlock, useRulesStore,
} from '../rulesStore';

/**
 * EC-008 — edges, which the ontology has always had and the editor never could touch.
 *
 * Two of the tests here cover damage that was already possible before this feature
 * existed: an edge dragged on the canvas was written with a type the schema does not
 * have, and an edge loaded from the API came back out of `toGraph()` with no id. Both
 * were invisible only because the live graph has no edges yet — which stops being
 * true the moment operators get this UI.
 */

const origin = { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' };
const node = (nodeId, over = {}) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion: `${nodeId}.`, origin, ...over,
});
const edge = (edgeId, source, target, type, over = {}) => ({ edgeId, source, target, type, ...over });

const load = (nodes, edges) => useRulesStore.getState().loadGraph({
  nodes, edges, entryId: 'e1', name: 'g', namespace: 'EVOLUTIO:PROMPT',
});

beforeEach(() => useRulesStore.getState().reset());

describe('the shape the canvas needs, and the shape the schema allows', () => {
  it('gives every loaded edge an id — without one ReactFlow drops it and the save writes undefined', () => {
    load([node('a'), node('b')], [edge('e1', 'a', 'b', 'REFINES')]);
    const [e] = useRulesStore.getState().edges;
    expect(e.id).toBe('e1');
    expect(e.source).toBe('a');
    expect(e.data.edgeType).toBe('REFINES');
  });

  it('survives a load → save round trip unchanged', () => {
    load([node('a'), node('b')], [edge('e1', 'a', 'b', 'CONFLICTS_WITH', { reason: 'both claim the turn' })]);
    const out = useRulesStore.getState().toGraph().edges;
    expect(out).toEqual([{ edgeId: 'e1', type: 'CONFLICTS_WITH', source: 'a', target: 'b', reason: 'both claim the turn' }]);
  });

  it('emits nothing the schema forbids — it refuses additional properties', () => {
    const rf = fromEvolutioEdge(edge('e1', 'a', 'b', 'REFINES'));
    // The canvas needs style, label, animated; the API must not see any of them.
    expect(Object.keys(toEvolutioEdge(rf)).sort()).toEqual(['edgeId', 'source', 'target', 'type']);
  });

  it('never writes ORDER, the value that made the whole graph unsaveable', () => {
    // ReactFlow's own `type` is a RENDERER name; the schema's is a RELATION. The old
    // code read one as the other and fell back to 'ORDER', which the enum lacks.
    const out = toEvolutioEdge({ id: 'e1', source: 'a', target: 'b', type: 'smoothstep', data: {} });
    expect(out.type).toBe('REFINES');
  });
});

describe('drawing a connection', () => {
  it('a drag on the canvas produces a real relation, not a default', () => {
    load([node('a'), node('b')], []);
    useRulesStore.getState().onConnect({ source: 'a', target: 'b' });
    expect(useRulesStore.getState().toGraph().edges[0].type).toBe('REFINES');
  });

  it('a drag onto the node itself is dropped rather than saved and rejected', () => {
    // Every type but APPLIES_WHEN fails SELF_EDGE, and a condition is not something
    // you draw. Accepting it here would mean an error message about the graph at save
    // time for a gesture made minutes earlier.
    load([node('a')], []);
    useRulesStore.getState().onConnect({ source: 'a', target: 'a' });
    expect(useRulesStore.getState().edges).toHaveLength(0);
  });

  it('the same relation twice between the same pair is not duplicated', () => {
    load([node('a'), node('b')], []);
    const first = useRulesStore.getState().addConnection({ source: 'a', target: 'b', type: 'REFINES' });
    const again = useRulesStore.getState().addConnection({ source: 'a', target: 'b', type: 'REFINES' });
    expect(again).toBe(first);
    expect(useRulesStore.getState().edges).toHaveLength(1);
  });

  it('but two DIFFERENT relations between the same pair are both kept', () => {
    load([node('a'), node('b')], []);
    useRulesStore.getState().addConnection({ source: 'a', target: 'b', type: 'REFINES' });
    useRulesStore.getState().addConnection({ source: 'a', target: 'b', type: 'ILLUSTRATES' });
    expect(useRulesStore.getState().edges).toHaveLength(2);
  });

  it('re-typing a connection moves the canvas with it', () => {
    load([node('a'), node('b')], [edge('e1', 'a', 'b', 'REFINES')]);
    useRulesStore.getState().updateConnection('e1', { edgeType: 'CONFLICTS_WITH' });
    const [e] = useRulesStore.getState().edges;
    expect(e.animated).toBe(true);
    expect(e.label).toBe('conflicts with');
    expect(useRulesStore.getState().toGraph().edges[0].type).toBe('CONFLICTS_WITH');
  });
});

describe('reading connections from one node', () => {
  it('shows both directions in one list, worded from this node', () => {
    load([node('a'), node('b'), node('c')], [
      edge('e1', 'a', 'b', 'REFINES'),
      edge('e2', 'c', 'a', 'REFINES'),
    ]);
    const list = useRulesStore.getState().connections('a');
    expect(list.map((c) => `${c.marker} ${c.verb} ${c.other}`)).toEqual([
      '→ refines b',
      '← refined by c',
    ]);
  });

  it('marks a conflict as symmetric — direction is an artefact of who drew it', () => {
    load([node('a'), node('b')], [edge('e1', 'b', 'a', 'CONFLICTS_WITH', { reason: 'x' })]);
    expect(useRulesStore.getState().connections('a')[0].marker).toBe('↔');
  });

  /**
   * The reason this whole filter exists. A condition is stored as a self-loop; shown
   * as a connection it reads "this rule refines itself", the operator removes the
   * nonsense, and the rule silently starts applying in every context.
   */
  it('does NOT show APPLIES_WHEN — deleting one here would silently drop a condition', () => {
    load([node('a'), node('b')], [
      edge('e1', 'a', 'b', 'REFINES'),
      edge('e2', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } }),
    ]);
    const list = useRulesStore.getState().connections('a');
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('REFINES');
  });

  it('…and still saves it, untouched', () => {
    load([node('a')], [edge('e2', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } })]);
    const out = useRulesStore.getState().toGraph().edges;
    expect(out).toEqual([{ edgeId: 'e2', type: 'APPLIES_WHEN', source: 'a', target: 'a', condition: { phase: ['fill'] } }]);
  });

  it('connectionsOf works on raw edges too, for the delete dialog', () => {
    const list = connectionsOf([fromEvolutioEdge(edge('e1', 'a', 'b', 'DEPENDS_ON'))], 'b');
    expect(list[0].verb).toBe('required by');
    expect(list[0].outgoing).toBe(false);
  });
});

/**
 * Verified against the real validator on the live graph: a CONFLICTS_WITH between two
 * of its rules returns ACTIVE_CONFLICT, an ERROR. So the warning shown while drawing
 * one is a statement of fact, and these tests keep it from becoming a lie in either
 * direction — silent when it should warn, or crying wolf until nobody reads it.
 */
describe('warning before recording a conflict', () => {
  const withScope = (id, appliesTo) => ({ ...node(id), appliesToNodes: appliesTo });

  it('warns when both are live and unscoped — the validator will refuse this', () => {
    load([node('a'), node('b')], []);
    const { nodes, edges } = useRulesStore.getState();
    expect(conflictWouldBlock(nodes, edges, 'a', 'b')).toBe(true);
  });

  it('stays quiet when one is disabled — retiring one is the documented resolution', () => {
    load([node('a'), node('b', { status: 'DEPRECATED' })], []);
    const { nodes, edges } = useRulesStore.getState();
    expect(conflictWouldBlock(nodes, edges, 'a', 'b')).toBe(false);
  });

  it('stays quiet when their scopes cannot meet', () => {
    load([withScope('a', ['router']), withScope('b', ['field_help'])], []);
    const { nodes, edges } = useRulesStore.getState();
    expect(conflictWouldBlock(nodes, edges, 'a', 'b')).toBe(false);
  });

  it('warns anyway when one of them is scoped to everything', () => {
    load([withScope('a', ['router']), node('b')], []);
    const { nodes, edges } = useRulesStore.getState();
    expect(conflictWouldBlock(nodes, edges, 'a', 'b')).toBe(true);
  });

  it('defers to the validator when both carry conditions rather than re-deciding', () => {
    // Whether two conditions are mutually exclusive is the validator's judgement. A
    // second implementation here would drift out of step with it.
    load([node('a'), node('b')], [
      edge('c1', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } }),
      edge('c2', 'b', 'b', 'APPLIES_WHEN', { condition: { phase: ['intent'] } }),
    ]);
    const { nodes, edges } = useRulesStore.getState();
    expect(conflictWouldBlock(nodes, edges, 'a', 'b')).toBe(false);
  });
});

describe('deleting a rule', () => {
  it('takes its connections with it — a dangling edge is a graph the API rejects', () => {
    load([node('a'), node('b'), node('c')], [
      edge('e1', 'a', 'b', 'REFINES'),
      edge('e2', 'c', 'a', 'REFINES'),
      edge('e3', 'b', 'c', 'REFINES'),
    ]);
    useRulesStore.getState().removeRule('a');
    expect(useRulesStore.getState().toGraph().edges.map((e) => e.edgeId)).toEqual(['e3']);
  });

  it('takes its condition with it as well', () => {
    load([node('a')], [edge('e1', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } })]);
    useRulesStore.getState().removeRule('a');
    expect(useRulesStore.getState().edges).toHaveLength(0);
  });

  it('is undoable, edges included', () => {
    load([node('a'), node('b')], [edge('e1', 'a', 'b', 'REFINES')]);
    useRulesStore.getState().removeRule('a');
    useRulesStore.getState().undo();
    expect(useRulesStore.getState().nodes).toHaveLength(2);
    expect(useRulesStore.getState().edges).toHaveLength(1);
  });
});
