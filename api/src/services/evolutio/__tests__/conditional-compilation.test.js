'use strict';

/**
 * EC-006/EC-007 — conditional compilation, and being honest about it.
 *
 * Once rules can be scoped to a phase, a rule missing from the prompt is the ORDINARY
 * case rather than a fault. That makes silence dangerous in a new way: "absent because
 * it does not apply here" and "absent because you broke something" look identical to
 * whoever is staring at a prompt wondering why their edit did nothing.
 */

const { compile } = require('../evolutio-prompt.compiler');
const { validateGraph } = require('../evolutio-prompt.validator');

const origin = { kind: 'human', rationale: 'r', introducedBy: 'test', introducedAt: '2026-07-31T00:00:00.000Z' };

const thesis = (nodeId, assertion, over = {}) => ({
  nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
  category: 'dialogue', assertion, origin, ...over,
});

const constraint = (nodeId, over = {}) => ({
  nodeId, type: 'Constraint', title: nodeId, status: 'ACTIVE', priority: 100, origin,
  rule: 'never invent a service', kind: 'safety', severity: 'blocking', ...over,
});

const appliesWhen = (source, condition, edgeId = `e-${source}`) => ({
  edgeId, type: 'APPLIES_WHEN', source, target: source, condition,
});

const narrative = (nodeId, framing) => ({
  nodeId, type: 'Narrative', title: nodeId, status: 'ACTIVE', priority: 100, origin, framing,
});

const persona = (nodeId, register) => ({
  nodeId, type: 'Persona', title: nodeId, status: 'ACTIVE', priority: 100, origin, register,
});

const graph = (nodes, edges = []) => ({ schemaVersion: '1.0.0', nodes, edges });

describe('a rule scoped to a phase', () => {
  const g = graph(
    [
      thesis('always', 'This applies everywhere.'),
      thesis('while-filling', 'Ask one field at a time.'),
    ],
    [appliesWhen('while-filling', { phase: ['fill'] })],
  );

  test('is in the prompt in its phase', () => {
    const out = compile(g, { language: 'en', phase: 'fill' }, {});
    expect(out.text).toContain('Ask one field at a time.');
    expect(out.text).toContain('This applies everywhere.');
  });

  test('and out of it elsewhere', () => {
    const out = compile(g, { language: 'en', phase: 'intent' }, {});
    expect(out.text).not.toContain('Ask one field at a time.');
    expect(out.text).toContain('This applies everywhere.');
  });

  test('a MISSING context key excludes the rule — the trap that made this dangerous', () => {
    // `conditionHolds` treats an absent key as "does not hold". Before the agent passed
    // any context, adding a single condition would have dropped the rule from every
    // prompt, silently, everywhere.
    const out = compile(g, { language: 'en' }, {});
    expect(out.text).not.toContain('Ask one field at a time.');
  });
});

describe('every exclusion is named, with its reason (EC-007)', () => {
  const g = graph(
    [
      thesis('kept', 'Kept.'),
      thesis('wrong-phase', 'Only while filling.'),
      thesis('retired', 'Withdrawn.', { status: 'DEPRECATED' }),
    ],
    [appliesWhen('wrong-phase', { phase: ['fill'] })],
  );

  test('a rule excluded by its condition says so, and says what the condition was', () => {
    const out = compile(g, { language: 'en', phase: 'intent' }, {});
    const hit = out.manifest.excluded.find((x) => x.nodeId === 'wrong-phase');
    expect(hit.reason).toBe('condition');
    // The condition that did not hold, so the panel can say what the turn would have
    // needed to look like.
    expect(hit.detail[0]).toEqual({ phase: ['fill'] });
  });

  test('a rule excluded by its STATUS is a different answer', () => {
    const out = compile(g, { language: 'en', phase: 'intent' }, {});
    const hit = out.manifest.excluded.find((x) => x.nodeId === 'retired');
    expect(hit.reason).toBe('status');
    expect(hit.detail).toBe('DEPRECATED');
  });

  test('what was kept is not reported as excluded', () => {
    const out = compile(g, { language: 'en', phase: 'fill' }, {});
    expect(out.manifest.excluded.map((x) => x.nodeId)).not.toContain('kept');
    expect(out.manifest.excluded.map((x) => x.nodeId)).not.toContain('wrong-phase');
  });
});

describe('conditions are ORed on a node, ANDed inside one', () => {
  test('two conditions on one node mean either will do', () => {
    const g = graph(
      [thesis('two-ways', 'Applies in two phases.')],
      [
        appliesWhen('two-ways', { phase: ['fill'] }, 'e1'),
        appliesWhen('two-ways', { phase: ['confirm'] }, 'e2'),
      ],
    );
    expect(compile(g, { language: 'en', phase: 'fill' }, {}).text).toContain('Applies in two phases.');
    expect(compile(g, { language: 'en', phase: 'confirm' }, {}).text).toContain('Applies in two phases.');
    expect(compile(g, { language: 'en', phase: 'intent' }, {}).text).not.toContain('Applies in two phases.');
  });

  test('two keys in one condition mean BOTH must hold', () => {
    const g = graph(
      [thesis('narrow', 'HR forms only.')],
      [appliesWhen('narrow', { phase: ['fill'], serviceCategory: ['EO-HR'] })],
    );
    expect(compile(g, { language: 'en', phase: 'fill', serviceCategory: 'EO-HR' }, {}).text).toContain('HR forms only.');
    expect(compile(g, { language: 'en', phase: 'fill', serviceCategory: 'EO-FIN' }, {}).text).not.toContain('HR forms only.');
  });
});

describe('safety is not contextual (EC-006)', () => {
  test('an immutable Constraint may not carry a condition', () => {
    // Otherwise it fails on a live turn rather than at save time: the compile checks
    // that every immutable constraint reached the text, and a condition can exclude it.
    const g = graph([constraint('c1', { immutable: true })], [appliesWhen('c1', { phase: ['fill'] })]);
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'IMMUTABLE_CONDITIONAL')).toBe(true);
  });

  test('the same constraint without a condition is fine', () => {
    expect(validateGraph(graph([constraint('c1', { immutable: true })], [])).ok).toBe(true);
  });

  test('a NON-immutable constraint may be scoped — it is a strong rule, not an absolute', () => {
    const g = graph([constraint('c2', { immutable: false, severity: 'strong' })], [appliesWhen('c2', { phase: ['fill'] })]);
    expect(validateGraph(g).ok).toBe(true);
  });
});

describe('the compile stays reproducible', () => {
  test('the same graph and the same context give byte-identical text', () => {
    const g = graph([thesis('a', 'One.'), thesis('b', 'Two.')], []);
    const first = compile(g, { language: 'en', phase: 'fill' }, {});
    const second = compile(g, { language: 'en', phase: 'fill' }, {});
    expect(first.text).toBe(second.text);
    expect(first.manifest.textHash).toBe(second.manifest.textHash);
  });

  test('a different context gives a different hash — which is why the cache key carries it', () => {
    const g = graph([thesis('a', 'One.'), thesis('scoped', 'Only filling.')], [appliesWhen('scoped', { phase: ['fill'] })]);
    const fill = compile(g, { language: 'en', phase: 'fill' }, {});
    const intent = compile(g, { language: 'en', phase: 'intent' }, {});
    expect(fill.manifest.textHash).not.toBe(intent.manifest.textHash);
  });
});

describe('a condition that cannot hold, and one that always does (EC-006)', () => {
  test('filling with no draft open is impossible, and is refused', () => {
    // `fill` exists only once a request is open, so pairing it with "no_draft"
    // describes a turn that cannot occur — the rule would never apply, and nothing
    // else in the system would ever say so.
    const g = graph(
      [thesis('impossible', 'Never reached.')],
      [appliesWhen('impossible', { phase: ['fill'], toolContext: ['no_draft'] })],
    );
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'CONDITION_UNSATISFIABLE')).toBe(true);
  });

  test('the same pair is fine when the phase does not require a draft', () => {
    const g = graph(
      [thesis('ok', 'Fine.')],
      [appliesWhen('ok', { phase: ['intent'], toolContext: ['no_draft'] })],
    );
    expect(validateGraph(g).ok).toBe(true);
  });

  test('listing every phase is the same as no condition, and says so', () => {
    const all = ['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off'];
    const g = graph([thesis('ceremony', 'Everywhere.')], [appliesWhen('ceremony', { phase: all })]);
    const r = validateGraph(g);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === 'CONDITION_ALWAYS_TRUE')).toBe(true);
  });

  test('a condition pointed at another node warns that the target is not read', () => {
    const g = graph(
      [thesis('a', 'A.'), thesis('b', 'B.')],
      [{ edgeId: 'e', type: 'APPLIES_WHEN', source: 'a', target: 'b', condition: { phase: ['fill'] } }],
    );
    const r = validateGraph(g);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === 'APPLIES_WHEN_TARGET_IGNORED')).toBe(true);
  });

  test('rules separated by phase are NOT reported as conflicting', () => {
    // Before `phase` was added to the intersection test, two rules that can never be
    // in one prompt together looked simultaneous, and the conflict check fired on a
    // perfectly correct graph.
    const g = graph(
      [thesis('while-filling', 'One.'), thesis('while-reading', 'Two.')],
      [
        appliesWhen('while-filling', { phase: ['fill'] }, 'e1'),
        appliesWhen('while-reading', { phase: ['reading'] }, 'e2'),
        { edgeId: 'e3', type: 'CONFLICTS_WITH', source: 'while-filling', target: 'while-reading', reason: 'they contradict' },
      ],
    );
    expect(validateGraph(g).ok).toBe(true);
  });
});

describe('two layers, so a conditional prompt can still be cached (EC-005)', () => {
  const g = graph(
    [
      thesis('standing', 'This is always true.'),
      thesis('while-filling', 'Ask one field at a time.'),
    ],
    [appliesWhen('while-filling', { phase: ['fill'] })],
  );

  test('the CORE is byte-identical whatever the context — that is what makes it cacheable', () => {
    // The provider caches a prefix only if the same bytes come back every time. If a
    // phase-scoped rule sat in the prefix, every phase would get its own cache entry,
    // and under the measured floor (~4.5k tokens) nothing caches at all.
    const fill = compile(g, { language: 'en', phase: 'fill' }, {});
    const intent = compile(g, { language: 'en', phase: 'intent' }, {});
    expect(fill.manifest.layers.coreText).toBe(intent.manifest.layers.coreText);
  });

  test('the conditional layer carries what varies, and only that', () => {
    const fill = compile(g, { language: 'en', phase: 'fill' }, {});
    expect(fill.manifest.layers.conditionalText).toContain('Ask one field at a time.');
    expect(fill.manifest.layers.coreText).not.toContain('Ask one field at a time.');
    expect(fill.manifest.layers.coreText).toContain('This is always true.');
  });

  test('out of its phase there is no conditional layer at all', () => {
    const intent = compile(g, { language: 'en', phase: 'intent' }, {});
    expect(intent.manifest.layers.conditionalText).toBe('');
    expect(intent.manifest.layers.conditionalTokens).toBe(0);
  });

  test('the whole prompt is still one document — the second layer has no new title', () => {
    const fill = compile(g, { language: 'en', phase: 'fill' }, {});
    expect(fill.text.match(/^# /gm)).toHaveLength(1);
    expect(fill.text.indexOf('This is always true.')).toBeLessThan(fill.text.indexOf('Ask one field at a time.'));
  });

  test('each rule says which layer it landed in', () => {
    const fill = compile(g, { language: 'en', phase: 'fill' }, {});
    const byId = Object.fromEntries(fill.manifest.nodes.map((n) => [n.nodeId, n.layer]));
    expect(byId.standing).toBe('core');
    expect(byId['while-filling']).toBe('conditional');
  });

  test('a graph with no conditions at all produces exactly what it did before', () => {
    // The 22 live rules carry no conditions, so this is the case that must not move.
    const plain = graph([thesis('a', 'One.'), thesis('b', 'Two.')], []);
    const out = compile(plain, { language: 'en', phase: 'fill' }, {});
    expect(out.manifest.layers.conditionalText).toBe('');
    expect(out.text).toBe(out.manifest.layers.coreText);
  });
});

describe('which kinds of rule may be contextual at all (EC-005)', () => {
  test('a Narrative may not be conditional — an identity that changes is not an identity', () => {
    const g = graph([narrative('who', 'You are FlowDesk.')], [appliesWhen('who', { phase: ['fill'] })]);
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'NARRATIVE_CONDITIONAL')).toBe(true);
  });

  test('a Persona MAY be scoped by channel — the spoken register really is different', () => {
    const g = graph([persona('voice-register', 'Be brief; this is read aloud.')],
      [appliesWhen('voice-register', { channel: 'voice' })]);
    expect(validateGraph(g).ok).toBe(true);
  });

  test('…but not by phase, which would change its manner mid-conversation', () => {
    const g = graph([persona('p', 'Warm.')], [appliesWhen('p', { phase: ['fill'] })]);
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'PERSONA_CONDITION_NOT_CHANNEL')).toBe(true);
  });

  test('a Thesis may be scoped freely — instructions are what a branch legitimately changes', () => {
    const g = graph([thesis('t', 'Ask one field.')], [appliesWhen('t', { phase: ['fill'] })]);
    expect(validateGraph(g).ok).toBe(true);
  });
});

describe('a dependency may not cross the layer boundary (EC-005)', () => {
  test('an unconditional rule cannot depend on a conditional one', () => {
    // The core is emitted before the conditional block, so this rule would be read
    // before its own premise — and the compiler cannot reorder the layers.
    const g = graph(
      [thesis('always', 'Do the thing.'), thesis('sometimes', 'Only while filling.')],
      [
        appliesWhen('sometimes', { phase: ['fill'] }, 'e1'),
        { edgeId: 'e2', type: 'DEPENDS_ON', source: 'always', target: 'sometimes' },
      ],
    );
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'DEPENDENCY_CROSSES_LAYERS')).toBe(true);
  });

  test('the other direction is fine — the premise is always there and read first', () => {
    const g = graph(
      [thesis('always', 'Do the thing.'), thesis('sometimes', 'Only while filling.')],
      [
        appliesWhen('sometimes', { phase: ['fill'] }, 'e1'),
        { edgeId: 'e2', type: 'DEPENDS_ON', source: 'sometimes', target: 'always' },
      ],
    );
    expect(validateGraph(g).ok).toBe(true);
  });

  test('two unconditional rules may depend on each other as before', () => {
    const g = graph(
      [thesis('a', 'A.'), thesis('b', 'B.')],
      [{ edgeId: 'e', type: 'DEPENDS_ON', source: 'a', target: 'b' }],
    );
    expect(validateGraph(g).ok).toBe(true);
  });
});

/**
 * EC-009 — added when the editor's live diagnosis caught a pointless condition this
 * validator did not. Two implementations of the same judgement drift; this is the one
 * that decides, so the check lives here and the editor mirrors it.
 */
describe('a condition that exhausts its own dimension', () => {
  const origin = { kind: 'human', rationale: 'r', introducedBy: 't', introducedAt: '2026-07-31T00:00:00.000Z' };
  const n = (nodeId) => ({
    nodeId, type: 'Thesis', title: nodeId, status: 'ACTIVE', priority: 100,
    category: 'dialogue', assertion: `${nodeId}.`, origin,
  });
  const g = (condition) => ({
    schemaVersion: '1.0.0',
    nodes: [n('a')],
    edges: [{ edgeId: 'c1', type: 'APPLIES_WHEN', source: 'a', target: 'a', condition }],
  });
  const codes = (r) => (r.warnings || []).map((w) => w.code);

  test('requiring a draft to be either open or not is always true', () => {
    expect(codes(validateGraph(g({ toolContext: ['has_draft', 'no_draft'] })))).toContain('CONDITION_ALWAYS_TRUE');
  });

  test('requiring one of the two is a real constraint', () => {
    expect(codes(validateGraph(g({ toolContext: ['has_draft'] })))).not.toContain('CONDITION_ALWAYS_TRUE');
  });

  test('and it does not fire when another key narrows it', () => {
    const r = validateGraph(g({ toolContext: ['has_draft', 'no_draft'], phase: ['fill'] }));
    expect(codes(r)).not.toContain('CONDITION_ALWAYS_TRUE');
  });
});
