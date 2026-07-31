import { describe, it, expect, beforeEach } from 'vitest';

import { useRulesStore, CANVAS_MODES } from '../rulesStore';
import { shortCondition } from '../conditionText';

/**
 * EC-010 — four modes, because "the graph" answers four different questions.
 *
 * The test that carries the most weight is the last one in the first block: no mode
 * draws an APPLIES_WHEN edge. A condition is stored as a self-loop, and a self-loop
 * drawn on the canvas is a circle on a node that the operator will try to delete.
 */

const origin = { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' };
const node = (nodeId) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion: `${nodeId}.`, origin,
});
const edge = (edgeId, source, target, type, over = {}) => ({ edgeId, source, target, type, ...over });

const GRAPH = () => useRulesStore.getState().loadGraph({
  nodes: [node('a'), node('b'), node('c')],
  edges: [
    edge('e1', 'a', 'b', 'REFINES'),
    edge('e2', 'b', 'c', 'DEPENDS_ON'),
    edge('e3', 'a', 'c', 'ILLUSTRATES'),
    edge('e4', 'a', 'b', 'CONFLICTS_WITH', { reason: 'both claim the turn' }),
    edge('c1', 'a', 'a', 'APPLIES_WHEN', { condition: { phase: ['fill'] } }),
  ],
  entryId: 'e', name: 'g', namespace: 'EVOLUTIO:PROMPT',
});

beforeEach(() => {
  useRulesStore.getState().reset();
  try { window.localStorage.clear(); } catch { /* jsdom-less run */ }
});

describe('what each mode draws', () => {
  it('Clean draws no connections at all — the bands are the order that matters', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('clean');
    expect(useRulesStore.getState().visibleEdges()).toHaveLength(0);
  });

  it('Structure draws the three relations that describe how rules build on each other', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('structure');
    expect(useRulesStore.getState().visibleEdges().map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('Conflicts draws only conflicts, so they can be taken one at a time', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('conflicts');
    expect(useRulesStore.getState().visibleEdges().map((e) => e.id)).toEqual(['e4']);
  });

  it('no mode ever draws a condition — it would render as a loop on the node', () => {
    GRAPH();
    for (const m of CANVAS_MODES) {
      useRulesStore.getState().setCanvasMode(m);
      const drawn = useRulesStore.getState().visibleEdges();
      expect(drawn.some((e) => (e.data?.edgeType || e.type) === 'APPLIES_WHEN')).toBe(false);
    }
  });

  it('…but the graph still holds it, whatever the canvas is showing', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('clean');
    expect(useRulesStore.getState().toGraph().edges.filter((e) => e.type === 'APPLIES_WHEN')).toHaveLength(1);
  });
});

describe('the mode survives the session', () => {
  it('is remembered, because an operator working through conflicts comes back to it', () => {
    useRulesStore.getState().setCanvasMode('conflicts');
    expect(window.localStorage.getItem('promptEditor.canvasMode')).toBe('conflicts');
  });

  it('refuses a mode that does not exist rather than blanking the canvas', () => {
    useRulesStore.getState().setCanvasMode('structure');
    useRulesStore.getState().setCanvasMode('nonsense');
    expect(useRulesStore.getState().canvasMode).toBe('structure');
  });
});

describe('coverage on the node', () => {
  it('counts the contexts each rule reaches, from the coverage report', () => {
    GRAPH();
    useRulesStore.getState().setCoverage({
      matrix: { a: [true, true, false], b: [false, false, false], c: [true, true, true] },
    });
    const cov = useRulesStore.getState().coverageByNode;
    expect(cov.a).toEqual({ reached: 2, total: 3 });
    expect(cov.b).toEqual({ reached: 0, total: 3 });   // dead weight, visible on the canvas
    expect(cov.c).toEqual({ reached: 3, total: 3 });
  });

  it('clears rather than keeping a count from a graph that has since been edited', () => {
    useRulesStore.getState().setCoverage({ matrix: { a: [true] } });
    useRulesStore.getState().setCoverage(null);
    expect(useRulesStore.getState().coverageByNode).toBeNull();
  });
});

describe('the condition badge on a node', () => {
  it('is empty for an unconditional rule, so the node stays quiet', () => {
    expect(shortCondition(null)).toBe('');
    expect(shortCondition({})).toBe('');
  });

  it('shows the vocabulary, not prose — a sentence would push the rule text off the node', () => {
    expect(shortCondition({ phase: ['fill', 'confirm'] })).toBe('fill, confirm');
  });

  it('joins the dimensions', () => {
    expect(shortCondition({ phase: ['fill'], toolContext: ['has_draft'] })).toBe('fill · has_draft');
  });

  it('truncates rather than growing the node', () => {
    const s = shortCondition({
      phase: ['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off'],
    });
    expect(s.length).toBeLessThanOrEqual(34);
    expect(s.endsWith('…')).toBe(true);
  });
});

/**
 * The defect Ivan found: connections could not be made on the canvas.
 *
 * They could, technically — `onConnect` created one. But Clean mode draws no edges
 * and Clean is the default, so the connection vanished at the moment of creation.
 * Created, saved, invisible, with nothing on screen to say it had worked; the only
 * reasonable conclusion is that the canvas does not support connections.
 */
describe('a connection you can actually see', () => {
  it('drawing one in Clean mode switches to a mode that draws it', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('clean');
    useRulesStore.getState().onConnect({ source: 'a', target: 'c' });
    expect(useRulesStore.getState().canvasMode).toBe('structure');
    expect(useRulesStore.getState().visibleEdges().some((e) => e.source === 'a' && e.target === 'c')).toBe(true);
  });

  it('a conflict added from the panel reveals itself in the conflicts mode', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('clean');
    useRulesStore.getState().addConnection({ source: 'b', target: 'c', type: 'CONFLICTS_WITH', reason: 'x' });
    expect(useRulesStore.getState().canvasMode).toBe('conflicts');
  });

  it('does NOT hijack the mode when the current one already shows it', () => {
    GRAPH();
    useRulesStore.getState().setCanvasMode('structure');
    useRulesStore.getState().onConnect({ source: 'a', target: 'c' });
    expect(useRulesStore.getState().canvasMode).toBe('structure');
  });

  it('selects the new connection, so the panel opens on what was just made', () => {
    GRAPH();
    useRulesStore.getState().onConnect({ source: 'a', target: 'c' });
    const sel = useRulesStore.getState().selectedEdge();
    expect(sel).toMatchObject({ source: 'a', target: 'c', type: 'REFINES' });
  });
});

describe('editing a connection from the canvas', () => {
  it('reads as a sentence with both rule titles', () => {
    GRAPH();
    useRulesStore.getState().setSelectedEdge('e1');
    expect(useRulesStore.getState().selectedEdge()).toMatchObject({
      type: 'REFINES', sourceTitle: 'a', targetTitle: 'b',
    });
  });

  it('reverses a connection drawn the wrong way round, without losing its reason', () => {
    GRAPH();
    useRulesStore.getState().setSelectedEdge('e4');
    useRulesStore.getState().flipConnection('e4');
    const e = useRulesStore.getState().toGraph().edges.find((x) => x.edgeId === 'e4');
    expect(e).toMatchObject({ source: 'b', target: 'a', reason: 'both claim the turn' });
  });

  it('selecting a rule clears the connection selection, and the reverse', () => {
    // Otherwise the panel shows an edge while the canvas highlights a node.
    GRAPH();
    useRulesStore.getState().setSelectedEdge('e1');
    useRulesStore.getState().setSelected('a');
    expect(useRulesStore.getState().selectedEdgeId).toBeNull();
    useRulesStore.getState().setSelectedEdge('e1');
    expect(useRulesStore.getState().selectedId).toBeNull();
  });

  it('deleting the selected connection clears the selection with it', () => {
    GRAPH();
    useRulesStore.getState().setSelectedEdge('e1');
    useRulesStore.getState().removeConnection('e1');
    expect(useRulesStore.getState().selectedEdgeId).toBeNull();
    expect(useRulesStore.getState().selectedEdge()).toBeNull();
  });

  it('counts what each mode would draw, so a chip can admit it has nothing', () => {
    GRAPH();
    const c = useRulesStore.getState().edgeCounts();
    expect(c.structure).toBe(3);
    expect(c.conflicts).toBe(1);
    expect(c.clean).toBe(0);
  });
});
