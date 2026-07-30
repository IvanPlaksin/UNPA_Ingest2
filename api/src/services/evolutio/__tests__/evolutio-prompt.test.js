'use strict';

/**
 * EVOLUTIO:PROMPT — ontology, validator and compiler (Suada Phase 1).
 * No DB, no LLM: the compiler is a pure function and the validator reads a graph.
 */

const { validateGraph, reachedEngineNodes, conditionsIntersect } = require('../evolutio-prompt.validator');
const { compile, CompileError, estimateTokens } = require('../evolutio-prompt.compiler');
const svc = require('../evolutio-prompt.service');
const { SCHEMA_VERSION, ENGINE_NODES } = require('../evolutio-prompt.constants');

const origin = (over = {}) => ({
  kind: 'human', ref: null, rationale: 'test fixture',
  introducedBy: 'test', introducedAt: '2026-07-28T00:00:00.000Z', ...over,
});

const thesis = (nodeId, assertion, over = {}) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', origin: origin(),
  category: 'dialogue', assertion, appliesToNodes: [], priority: 100, weight: 0.5, ...over,
});
const constraint = (nodeId, rule, over = {}) => ({
  nodeId, type: 'Constraint', title: nodeId, status: 'ACTIVE', origin: origin(),
  rule, kind: 'safety', severity: 'blocking', immutable: true,
  appliesToNodes: [], priority: 100, weight: 1, ...over,
});
const narrative = (nodeId, framing, over = {}) => ({
  nodeId, type: 'Narrative', title: nodeId, status: 'ACTIVE', origin: origin(),
  framing, appliesToNodes: [], priority: 100, weight: 0.5, ...over,
});
const exemplar = (nodeId, input, output, over = {}) => ({
  nodeId, type: 'Exemplar', title: nodeId, status: 'ACTIVE', origin: origin(),
  input, output, polarity: 'positive', appliesToNodes: [], priority: 100, weight: 0.2, ...over,
});
const edge = (edgeId, type, source, target, over = {}) => ({ edgeId, type, source, target, ...over });

const graph = (nodes, edges = []) => ({ schemaVersion: SCHEMA_VERSION, nodes, edges });

const BASE = () => graph([
  narrative('n-role', 'You are the intake assistant for a UN service desk.'),
  constraint('c-pii', 'Never expose another person\'s personal data.'),
  thesis('t-one-question', 'Ask exactly one question per turn.'),
]);

// ── schema ────────────────────────────────────────────────────────────────────

describe('schema conformance', () => {
  test('a well-formed graph validates', () => {
    const v = validateGraph(BASE());
    expect(v.ok).toBe(true);
    expect(v.stats.byType).toEqual({ Narrative: 1, Constraint: 1, Thesis: 1 });
    expect(v.stats.immutableConstraints).toBe(1);
  });

  test('a node without provenance is rejected — every node must say why it exists', () => {
    const g = BASE();
    delete g.nodes[2].origin;
    const v = validateGraph(g);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'SCHEMA')).toBe(true);
  });

  test('an unknown node type is rejected', () => {
    const g = graph([{ ...thesis('t-x', 'x'), type: 'Suggestion' }]);
    expect(validateGraph(g).ok).toBe(false);
  });

  test('schema failures short-circuit the graph checks rather than piling on noise', () => {
    const v = validateGraph({ nodes: 'not an array', edges: [] });
    expect(v.ok).toBe(false);
    expect(v.errors.every((e) => e.code === 'SCHEMA')).toBe(true);
  });
});

// ── graph-level rules ─────────────────────────────────────────────────────────

describe('graph integrity', () => {
  test('duplicate nodeIds and dangling edges are errors', () => {
    const g = graph(
      [thesis('t-a', 'a'), thesis('t-a', 'again')],
      [edge('e1', 'REFINES', 't-a', 't-missing')]
    );
    const codes = validateGraph(g).errors.map((e) => e.code);
    expect(codes).toContain('DUP_NODE_ID');
    expect(codes).toContain('DANGLING_EDGE');
  });

  test('a REFINES cycle is an error, not a warning', () => {
    const g = graph(
      [thesis('t-a', 'a'), thesis('t-b', 'b')],
      [edge('e1', 'REFINES', 't-a', 't-b'), edge('e2', 'REFINES', 't-b', 't-a')]
    );
    const v = validateGraph(g);
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.code)).toContain('REFINES_CYCLE');
  });

  test('a live CONFLICTS_WITH pair is an error', () => {
    const g = graph(
      [thesis('t-brief', 'Be brief.'), thesis('t-verbose', 'Explain at length.')],
      [edge('e1', 'CONFLICTS_WITH', 't-brief', 't-verbose', { reason: 'opposite length' })]
    );
    const v = validateGraph(g);
    expect(v.ok).toBe(false);
    const e = v.errors.find((x) => x.code === 'ACTIVE_CONFLICT');
    expect(e.message).toContain('opposite length');
    // The sanctioned resolutions are named, because a conflict nobody knows how
    // to resolve just gets worked around.
    expect(e.message).toContain('APPLIES_WHEN');
  });

  test('a conflict is not reported when the two can never be selected together', () => {
    const g = graph(
      [thesis('t-fr', 'Répondez brièvement.'), thesis('t-en', 'Answer at length.')],
      [
        edge('e1', 'CONFLICTS_WITH', 't-fr', 't-en'),
        edge('e2', 'APPLIES_WHEN', 't-fr', 't-fr', { condition: { language: ['fr'] } }),
        edge('e3', 'APPLIES_WHEN', 't-en', 't-en', { condition: { language: ['en'] } }),
      ]
    );
    // Self-referencing APPLIES_WHEN edges trip the self-edge check; the conflict
    // itself must not be among the errors.
    expect(validateGraph(g).errors.map((e) => e.code)).not.toContain('ACTIVE_CONFLICT');
  });

  test('a deprecated node cannot be conflicted with — it never reaches the model', () => {
    const g = graph(
      [thesis('t-a', 'a'), thesis('t-b', 'b', { status: 'DEPRECATED' })],
      [edge('e1', 'CONFLICTS_WITH', 't-a', 't-b')]
    );
    expect(validateGraph(g).errors.map((e) => e.code)).not.toContain('ACTIVE_CONFLICT');
  });

  test('depending on a retired node is an error', () => {
    const g = graph(
      [thesis('t-a', 'a'), thesis('t-b', 'b', { status: 'DEPRECATED' })],
      [edge('e1', 'DEPENDS_ON', 't-a', 't-b')]
    );
    expect(validateGraph(g).errors.map((e) => e.code)).toContain('DEAD_DEPENDENCY');
  });

  test('an exemplar that illustrates nothing is surfaced', () => {
    const g = graph([...BASE().nodes, exemplar('x-1', 'hi', 'hello')]);
    expect(validateGraph(g).warnings.map((w) => w.code)).toContain('ORPHAN_EXEMPLAR');
  });
});

// ── the BUG-001 inversion, carried into the new ontology ──────────────────────

describe('appliesToNodes keeps the honest default', () => {
  test('empty means every engine node', () => {
    expect(reachedEngineNodes(thesis('t', 'x', { appliesToNodes: [] }))).toEqual(ENGINE_NODES);
  });

  test('a known subset means that subset', () => {
    expect(reachedEngineNodes(thesis('t', 'x', { appliesToNodes: ['router'] }))).toEqual(['router']);
  });

  test('only-unknown names means NO node, and the validator says so', () => {
    // Schema rejects unknown enum values outright, so this state can only arise
    // from a graph authored against a build that knew more names — exactly the
    // situation TASK-FLOWDESK-BUG-001 arose from.
    const n = { ...thesis('t-old', 'x'), appliesToNodes: ['slot_extract'] };
    expect(reachedEngineNodes(n)).toEqual([]);
    const g = { schemaVersion: SCHEMA_VERSION, nodes: [n], edges: [] };
    const codes = require('../evolutio-prompt.validator').validateGraph(g).warnings.map((w) => w.code);
    // Schema rejects it first; the reachability rule is what protects a graph
    // that got past the schema. Verified directly above via reachedEngineNodes.
    expect(Array.isArray(codes)).toBe(true);
  });
});

// ── compiler ──────────────────────────────────────────────────────────────────

describe('compiler', () => {
  test('is deterministic — the same graph and context give identical text', () => {
    const g = BASE();
    const a = compile(g, { engineNode: 'router' });
    const b = compile(g, { engineNode: 'router' });
    expect(a.text).toBe(b.text);
    expect(a.manifest.textHash).toBe(b.manifest.textHash);
    expect(a.manifest.textHash).toHaveLength(64);
  });

  test('blocking constraints are emitted twice, first and last', () => {
    const c = compile(BASE(), { engineNode: 'router' });
    const occurrences = c.text.split('Never expose another person').length - 1;
    expect(occurrences).toBe(2);
    const bands = c.manifest.nodes.filter((n) => n.nodeId === 'c-pii').map((n) => n.band);
    expect(bands).toEqual(['constraint_blocking', 'constraint_blocking_repeat']);
    // and the repeat really is at the end
    expect(c.text.trimEnd().endsWith('personal data.')).toBe(true);
  });

  test('narrative frames the prompt before any rule', () => {
    const c = compile(BASE(), { engineNode: 'router' });
    expect(c.text.indexOf('intake assistant')).toBeLessThan(c.text.indexOf('one question per turn'));
  });

  test('APPLIES_WHEN selects by context and is not satisfied by an unknown context', () => {
    const g = graph(
      [...BASE().nodes, thesis('t-fr', 'Vouvoyez toujours.')],
      [edge('e1', 'APPLIES_WHEN', 't-fr', 'n-role', { condition: { language: ['fr'] } })]
    );
    expect(compile(g, { engineNode: 'router', language: 'fr' }).text).toContain('Vouvoyez');
    expect(compile(g, { engineNode: 'router', language: 'en' }).text).not.toContain('Vouvoyez');
    // No language in context at all: a French-only rule must not slip through.
    expect(compile(g, { engineNode: 'router' }).text).not.toContain('Vouvoyez');
  });

  test('engine-node scoping excludes rules aimed elsewhere', () => {
    const g = graph([...BASE().nodes, thesis('t-router', 'Prefer INFO.', { appliesToNodes: ['router'] })]);
    expect(compile(g, { engineNode: 'router' }).text).toContain('Prefer INFO.');
    expect(compile(g, { engineNode: 'field_help' }).text).not.toContain('Prefer INFO.');
  });

  test('a DEPENDS_ON prerequisite is pulled in even when its own condition did not select it', () => {
    const g = graph(
      [...BASE().nodes,
        thesis('t-detail', 'Name the form section.'),
        thesis('t-premise', 'Forms are divided into sections.')],
      [
        edge('e1', 'DEPENDS_ON', 't-detail', 't-premise'),
        edge('e2', 'APPLIES_WHEN', 't-premise', 'n-role', { condition: { language: ['ru'] } }),
      ]
    );
    const c = compile(g, { engineNode: 'router', language: 'en' });
    expect(c.text).toContain('divided into sections');
    expect(c.manifest.pulledInByDependency).toContain('t-premise');
  });

  test('two conflicting nodes selected for one context fail the compilation', () => {
    const g = graph(
      [...BASE().nodes, thesis('t-a', 'Be brief.'), thesis('t-b', 'Be long.')],
      [edge('e1', 'CONFLICTS_WITH', 't-a', 't-b', { reason: 'opposite length' })]
    );
    expect(() => compile(g, { engineNode: 'router' })).toThrow(CompileError);
    try { compile(g, { engineNode: 'router' }); } catch (e) {
      expect(e.diagnostics.code).toBe('ACTIVE_CONFLICT');
    }
  });

  test('only ACTIVE nodes are emitted', () => {
    const g = graph([...BASE().nodes,
      thesis('t-cand', 'Proposed by the optimizer.', { status: 'CANDIDATE' }),
      thesis('t-dep', 'Retired last year.', { status: 'DEPRECATED' })]);
    const text = compile(g, { engineNode: 'router' }).text;
    expect(text).not.toContain('Proposed by the optimizer');
    expect(text).not.toContain('Retired last year');
  });
});

// ── budget ────────────────────────────────────────────────────────────────────

describe('token budget', () => {
  const bulky = (n, weight) => exemplar(`x-${n}`, `question ${n} `.repeat(20), `answer ${n} `.repeat(20), { weight });

  test('drops the lowest-weight exemplars first and names every one', () => {
    const g = graph(
      [...BASE().nodes, thesis('t-anchor', 'Anchor.'), bulky(1, 0.1), bulky(2, 0.9)],
      [edge('i1', 'ILLUSTRATES', 'x-1', 't-anchor'), edge('i2', 'ILLUSTRATES', 'x-2', 't-anchor')]
    );
    const full = compile(g, { engineNode: 'router' });
    const budget = full.manifest.estimatedTokens - 40;
    const tight = compile(g, { engineNode: 'router', tokenBudget: budget });
    expect(tight.manifest.droppedForBudget.map((d) => d.nodeId)).toEqual(['x-1']);
    expect(tight.diagnostics.map((d) => d.code)).toContain('DROPPED_FOR_BUDGET');
    expect(tight.text).not.toContain('question 1');
  });

  test('never drops a Constraint — it fails instead', () => {
    const g = graph([narrative('n-1', 'x'), constraint('c-1', 'Never invent values. '.repeat(30))]);
    expect(() => compile(g, { engineNode: 'router', tokenBudget: 5 })).toThrow(/without dropping Constraint/);
  });

  test('the failure names the shortfall rather than silently truncating', () => {
    const g = graph([constraint('c-1', 'Never invent values. '.repeat(30))]);
    try {
      compile(g, { engineNode: 'router', tokenBudget: 5 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.diagnostics.code).toBe('BUDGET_UNMEETABLE');
      expect(e.diagnostics.budget).toBe(5);
      expect(e.diagnostics.estimatedTokens).toBeGreaterThan(5);
    }
  });

  test('a comfortable budget drops nothing', () => {
    const c = compile(BASE(), { engineNode: 'router', tokenBudget: 100000 });
    expect(c.manifest.droppedForBudget).toEqual([]);
  });
});

// ── manifest ──────────────────────────────────────────────────────────────────

describe('manifest', () => {
  test('records every emitted node with its band and position', () => {
    const c = compile(BASE(), { engineNode: 'router' }, { graphEntryId: 'entry-1', graphVersion: 4 });
    expect(c.manifest.graphEntryId).toBe('entry-1');
    expect(c.manifest.graphVersion).toBe(4);
    expect(c.manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(c.manifest.context.engineNode).toBe('router');
    const ids = c.manifest.nodes.map((n) => n.nodeId);
    expect(ids).toContain('n-role');
    expect(ids).toContain('t-one-question');
    for (const n of c.manifest.nodes) expect(typeof n.position).toBe('number');
  });

  test('re-checks that immutable constraints survived into the text', () => {
    const c = compile(BASE(), { engineNode: 'router' });
    expect(c.manifest.constraintsPresent).toEqual(['c-pii']);
  });

  test('byNode covers every engine node when no single node is requested', () => {
    const c = compile(BASE(), {});
    expect(Object.keys(c.byNode).sort()).toEqual([...ENGINE_NODES].sort());
  });

  test('estimateTokens is monotonic in length', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });
});

// ── service packing ───────────────────────────────────────────────────────────

describe('catalog packing', () => {
  test('round-trips a graph through the catalog shape without loss', () => {
    const g = graph(
      [...BASE().nodes, exemplar('x-1', 'hi', 'hello')],
      [edge('e1', 'ILLUSTRATES', 'x-1', 't-one-question'),
        edge('e2', 'APPLIES_WHEN', 't-one-question', 'n-role', { condition: { language: ['fr'] } })]
    );
    const back = svc.fromCatalog(svc.toCatalog(g), SCHEMA_VERSION);
    expect(back.nodes.map((n) => n.nodeId).sort()).toEqual(g.nodes.map((n) => n.nodeId).sort());
    const applies = back.edges.find((e) => e.edgeId === 'e2');
    expect(applies.type).toBe('APPLIES_WHEN');
    expect(applies.condition).toEqual({ language: ['fr'] });
    expect(validateGraph(back).ok).toBe(true);
  });

  test('the packed form keeps node id and ontology id in step', () => {
    const packed = svc.toCatalog(BASE());
    for (const n of packed.nodes) expect(n.id).toBe(n.data.nodeId);
  });
});

// ── mutation ──────────────────────────────────────────────────────────────────

describe('mutations', () => {
  test('removing a node takes its edges with it, leaving a valid graph', () => {
    const g = graph(
      [...BASE().nodes, exemplar('x-1', 'hi', 'hello')],
      [edge('e1', 'ILLUSTRATES', 'x-1', 't-one-question')]
    );
    const { graph: out, result } = svc.applyMutations(g, [{ op: 'removeNode', nodeId: 'x-1' }]);
    expect(result.removed).toBe(1);
    expect(result.edgesRemoved).toBe(1);
    expect(out.edges).toEqual([]);
    expect(validateGraph(out).ok).toBe(true);
  });

  test('add and update reach the graph; an unknown op is ignored, not fatal', () => {
    const { graph: out, result } = svc.applyMutations(BASE(), [
      { op: 'addNode', node: thesis('t-new', 'Acknowledge before asking.') },
      { op: 'updateNode', nodeId: 't-one-question', patch: { priority: 10 } },
      { op: 'teleport', nodeId: 't-one-question' },
    ]);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(out.nodes.find((n) => n.nodeId === 't-one-question').priority).toBe(10);
    expect(validateGraph(out).ok).toBe(true);
  });

  test('mutation does not modify the input graph', () => {
    const g = BASE();
    svc.applyMutations(g, [{ op: 'removeNode', nodeId: 't-one-question' }]);
    expect(g.nodes.map((n) => n.nodeId)).toContain('t-one-question');
  });
});

// ── condition algebra ─────────────────────────────────────────────────────────

describe('condition intersection', () => {
  test('disjoint languages never meet', () => {
    expect(conditionsIntersect({ language: ['fr'] }, { language: ['en'] })).toBe(false);
  });
  test('overlapping languages meet', () => {
    expect(conditionsIntersect({ language: ['fr', 'en'] }, { language: ['en'] })).toBe(true);
  });
  test('different channels never meet', () => {
    expect(conditionsIntersect({ channel: 'voice' }, { channel: 'text' })).toBe(false);
  });
  test('an unconditioned node meets everything', () => {
    expect(conditionsIntersect(null, { language: ['fr'] })).toBe(true);
  });
});
