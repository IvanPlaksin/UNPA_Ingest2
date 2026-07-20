'use strict';

/**
 * ADMIN P6 — prompt-graph compiler / validator / sandbox (fakes; no DB/LLM).
 */

const { compilePromptGraph, edgeOrder } = require('../prompt-graph-compiler');
const { validatePromptGraph } = require('../prompt-graph-validator');
const { runSandbox } = require('../prompt-sandbox.service');
const { MockLLMProvider } = require('../../contracts/llm-provider.stub');

const rule = (key, category, text, appliesTo = ['all'], extra = {}) => ({
  id: `rule-${key}`, type: 'ruleNode', position: { x: 0, y: 0 },
  data: { kind: 'rule', key, title: key, category, text, appliesTo, enabled: true, priority: 100, ...extra },
});

describe('prompt-graph compiler', () => {
  test('groups by category in order and emits bullet lines', () => {
    const graph = {
      nodes: [
        rule('tone1', 'tone', 'Be concise.'),
        rule('id1', 'identity', 'You are FlowDesk.'),
        rule('safe1', 'safety', 'Never invent data.'),
      ],
      edges: [],
    };
    const c = compilePromptGraph(graph, { title: 'T' });
    expect(c.ruleCount).toBe(3);
    // identity precedes tone precedes safety (CATEGORY_ORDER)
    const idIdx = c.text.indexOf('You are FlowDesk.');
    const toneIdx = c.text.indexOf('Be concise.');
    const safeIdx = c.text.indexOf('Never invent data.');
    expect(idIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeLessThan(toneIdx);
    expect(toneIdx).toBeLessThan(safeIdx);
    expect(c.text).toContain('## Identity & role');
  });

  test('appliesTo scopes per-node output', () => {
    const graph = {
      nodes: [
        rule('all1', 'tone', 'Global tone.', ['all']),
        rule('r1', 'routing', 'Router only.', ['router']),
        rule('q1', 'dialogue', 'Planner only.', ['question_planner']),
      ],
      edges: [],
    };
    const c = compilePromptGraph(graph);
    expect(c.byNode.router).toContain('Global tone.');
    expect(c.byNode.router).toContain('Router only.');
    expect(c.byNode.router).not.toContain('Planner only.');
    expect(c.byNode.question_planner).toContain('Planner only.');
    expect(c.byNode.question_planner).not.toContain('Router only.');
  });

  test('disabled and empty rules are dropped', () => {
    const graph = {
      nodes: [
        rule('a', 'tone', 'Kept.'),
        rule('b', 'tone', 'Dropped.', ['all'], { enabled: false }),
        rule('c', 'tone', ''),
      ],
      edges: [],
    };
    const c = compilePromptGraph(graph);
    expect(c.ruleCount).toBe(1);
    expect(c.text).toContain('Kept.');
    expect(c.text).not.toContain('Dropped.');
  });

  test('edgeOrder is topological and cycle-tolerant', () => {
    const order = edgeOrder(['a', 'b', 'c'], [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]);
    expect(order).toEqual(['a', 'b', 'c']);
    const cyc = edgeOrder(['x', 'y'], [{ source: 'x', target: 'y' }, { source: 'y', target: 'x' }]);
    expect(cyc.sort()).toEqual(['x', 'y']); // no throw, both present
  });
});

describe('prompt-graph validator', () => {
  test('clean graph validates', () => {
    const graph = { nodes: [rule('id', 'identity', 'You are FlowDesk.'), rule('t', 'tone', 'Be nice.')], edges: [] };
    const v = validatePromptGraph(graph);
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
  });
  test('empty text on enabled rule is an error', () => {
    const graph = { nodes: [rule('id', 'identity', 'x'), { id: 'r-e', data: { kind: 'rule', key: 'e', category: 'tone', text: '', enabled: true } }], edges: [] };
    const v = validatePromptGraph(graph);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === 'EMPTY_RULE')).toBe(true);
  });
  test('duplicate rule keys error, dangling edge errors', () => {
    const graph = { nodes: [rule('dup', 'tone', 'a'), rule('dup', 'tone', 'b')], edges: [{ source: 'rule-dup', target: 'ghost' }] };
    const v = validatePromptGraph(graph);
    expect(v.errors.some((e) => e.code === 'DUP_RULE_KEY')).toBe(true);
    expect(v.errors.some((e) => e.code === 'DANGLING_EDGE')).toBe(true);
  });
  test('no rules / no identity produce error / warning', () => {
    expect(validatePromptGraph({ nodes: [], edges: [] }).errors.some((e) => e.code === 'NO_RULES')).toBe(true);
    const noId = validatePromptGraph({ nodes: [rule('t', 'tone', 'Be nice.')], edges: [] });
    expect(noId.ok).toBe(true);
    expect(noId.warnings.some((w) => w.code === 'NO_IDENTITY')).toBe(true);
  });
});

describe('prompt sandbox (mock LLM, in-memory, no side effects)', () => {
  test('drives turns against a candidate prompt with zero real writes', async () => {
    // Mock LLM: route everything OUT_OF_SCOPE so no service resolution / no submit.
    const llm = new MockLLMProvider({
      structured: () => ({ route: 'OUT_OF_SCOPE' }),
      completion: () => 'ok',
    });
    const res = await runSandbox({
      systemPromptText: '## Identity\n- You are a test assistant.',
      messages: ['hello there', 'what is the weather'],
      lang: 'en',
    }, { llm, resolveSearch: async () => [], loadSnapshot: async () => null });
    expect(res.transcript).toHaveLength(2);
    expect(res.sideEffects.ticketsCreated).toBe(0);
    expect(res.sideEffects.memgraphWrites).toBe(0);
    expect(res.transcript[0].agent).toBeTruthy();
  });

  test('compiles a graph and reports validation + ruleCount', async () => {
    const llm = new MockLLMProvider({ structured: () => ({ route: 'OUT_OF_SCOPE' }), completion: () => 'hi' });
    const graph = { nodes: [rule('id', 'identity', 'You are FlowDesk.')], edges: [] };
    const res = await runSandbox({ graph, messages: ['hi'] }, { llm, resolveSearch: async () => [], loadSnapshot: async () => null });
    expect(res.ruleCount).toBe(1);
    expect(res.validation.ok).toBe(true);
    expect(res.systemPromptText).toContain('You are FlowDesk.');
  });
});
