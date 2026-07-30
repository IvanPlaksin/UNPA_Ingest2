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

// SUADA-PREREQ-001 — provenance of the active prompt is the join key between a
// recorded chat turn and the prompt-graph version that shaped it.
describe('system-prompt provenance (fake graph)', () => {
  const systemPrompt = require('../system-prompt.service');
  const row = (props) => ({ get: () => ({ properties: props }) });

  afterEach(() => { systemPrompt._setDeps({}); });

  test('reports entryId, version and the stored text hash', async () => {
    systemPrompt._setDeps({
      read: async () => [row({
        text: '# P\n- rule', textHash: 'deadbeef', graphEntryId: 'entry-9', graphVersion: 4,
      })],
      write: async () => [],
    });
    await expect(systemPrompt.getProvenance()).resolves.toEqual({
      promptGraphEntryId: 'entry-9', promptGraphVersion: 4, promptTextHash: 'deadbeef',
    });
  });

  test('derives the hash for prompts applied before the field existed', async () => {
    const text = '# P\n- legacy rule';
    systemPrompt._setDeps({
      read: async () => [row({ text, graphEntryId: 'entry-8', graphVersion: 1 })],
      write: async () => [],
    });
    const prov = await systemPrompt.getProvenance();
    expect(prov.promptTextHash).toBe(systemPrompt.textHashOf(text));
    expect(prov.promptTextHash).toHaveLength(64);
  });

  test('no active prompt yields all-null provenance without throwing', async () => {
    systemPrompt._setDeps({ read: async () => [], write: async () => [] });
    await expect(systemPrompt.getProvenance()).resolves.toEqual({
      promptGraphEntryId: null, promptGraphVersion: null, promptTextHash: null,
    });
  });

  test('a store failure yields all-null provenance (chat must never break)', async () => {
    systemPrompt._setDeps({ read: async () => { throw new Error('memgraph down'); }, write: async () => [] });
    await expect(systemPrompt.getProvenance()).resolves.toEqual({
      promptGraphEntryId: null, promptGraphVersion: null, promptTextHash: null,
    });
  });

  test('identical prompt text hashes identically across versions', () => {
    expect(systemPrompt.textHashOf('- a')).toBe(systemPrompt.textHashOf('- a'));
    expect(systemPrompt.textHashOf('- a')).not.toBe(systemPrompt.textHashOf('- b'));
    expect(systemPrompt.textHashOf(null)).toBeNull();
  });
});

// SUADA-PREREQ-001.1 — overlays are the second lever on chat behavior; a turn
// attributed only by prompt version cannot tell two overlay states apart.
describe('prompt-overlay provenance (fake graph)', () => {
  const overlays = require('../prompt-overlay.service');
  const row = (overlayId, text) => ({ get: (k) => (k === 'overlayId' ? overlayId : text) });

  afterEach(() => { overlays._setDeps({}); });

  test('hashes the effective guidance and lists the contributing overlays', async () => {
    overlays._setDeps({
      read: async (_cypher, params) => (params.scope === 'global'
        ? [row('POV-a', 'always greet by name'), row('POV-b', 'never promise a deadline')]
        : [row('POV-c', 'ask for the duty station first')]),
      write: async () => [],
    });
    const prov = await overlays.getProvenance('EO-HR-BE-TRE-TRE');
    expect(prov.overlayIds).toEqual(['POV-a', 'POV-b', 'POV-c']);
    expect(prov.overlayHash).toHaveLength(64);
  });

  test('the hash tracks the guidance, not the overlay count', async () => {
    const withTexts = (texts) => ({
      read: async (_cypher, params) => (params.scope === 'global' ? texts.map((t, i) => row(`POV-${i}`, t)) : []),
      write: async () => [],
    });
    overlays._setDeps(withTexts(['be brief']));
    const first = await overlays.getProvenance(null);
    overlays._setDeps(withTexts(['be brief']));
    expect((await overlays.getProvenance(null)).overlayHash).toBe(first.overlayHash);
    overlays._setDeps(withTexts(['be verbose']));
    expect((await overlays.getProvenance(null)).overlayHash).not.toBe(first.overlayHash);
  });

  test('service-scoped overlays are excluded when no service is in play', async () => {
    const scopes = [];
    overlays._setDeps({
      read: async (_cypher, params) => { scopes.push(params.scope); return []; },
      write: async () => [],
    });
    const prov = await overlays.getProvenance(null);
    expect(scopes).toEqual(['global']);
    expect(prov).toEqual({ overlayHash: null, overlayIds: [] });
  });

  test('a store failure yields a null hash rather than breaking the turn', async () => {
    overlays._setDeps({ read: async () => { throw new Error('memgraph down'); }, write: async () => [] });
    await expect(overlays.getProvenance('svc')).resolves.toEqual({ overlayHash: null, overlayIds: [] });
  });

  test('getGuidance keeps its string contract after the shape change', async () => {
    overlays._setDeps({
      read: async (_cypher, params) => (params.scope === 'global' ? [row('POV-a', 'be brief')] : []),
      write: async () => [],
    });
    await expect(overlays.getGuidance(null)).resolves.toEqual({ global: '- be brief', service: null });
  });
});

// TASK-FLOWDESK-BUG-001 — the scope list is a promise: every name offered to the
// operator must be read by the engine, and a rule aimed at a name that is not
// must reach nothing rather than everything.
describe('appliesTo scopes are an honest contract', () => {
  const { PROMPT_NODES } = require('../prompt-graph-compiler');

  test('every offered scope is one the engine actually reads', () => {
    const engine = require('fs').readFileSync(
      require('path').join(__dirname, '../../interpreter/interpreter-engine.js'), 'utf8');
    for (const node of PROMPT_NODES) {
      expect(engine).toContain(`fetchSystemPrompt('${node}')`);
    }
  });

  test('retired scopes are gone from the offer', () => {
    expect(PROMPT_NODES).not.toContain('slot_extract');
    expect(PROMPT_NODES).not.toContain('my_requests');
    expect(PROMPT_NODES).toContain('field_help');
  });

  test('a rule scoped only to a retired name governs nothing, not everything', () => {
    const graph = {
      nodes: [
        rule('gone', 'tone', 'Only for the retired scope.', ['slot_extract']),
        rule('kept', 'tone', 'For everyone.', ['all']),
      ],
      edges: [],
    };
    const c = compilePromptGraph(graph);
    for (const node of PROMPT_NODES) {
      expect(c.byNode[node]).toContain('For everyone.');
      expect(c.byNode[node]).not.toContain('Only for the retired scope.');
    }
    // It still appears in the full prompt text — the rule exists and is readable;
    // it simply governs no LLM node until the operator rescopes it.
    expect(c.text).toContain('Only for the retired scope.');
  });

  test('an explicitly empty appliesTo still means every node', () => {
    const c = compilePromptGraph({ nodes: [rule('e', 'tone', 'Applies broadly.', [])], edges: [] });
    for (const node of PROMPT_NODES) expect(c.byNode[node]).toContain('Applies broadly.');
  });

  test('the validator names a rule that can never take effect', () => {
    const v = validatePromptGraph({
      nodes: [
        rule('id', 'identity', 'You are FlowDesk.'),
        rule('dead', 'tone', 'Aimed at a retired scope.', ['my_requests']),
      ],
      edges: [],
    });
    const codes = v.warnings.map((w) => w.code);
    expect(codes).toContain('RULE_REACHES_NO_NODE');
    expect(codes).toContain('UNKNOWN_APPLIESTO');
    // A misdirected rule is a warning, not a hard error — the graph still applies.
    expect(v.ok).toBe(true);
  });

  test('a rule with at least one live scope draws no unreachable warning', () => {
    const v = validatePromptGraph({
      nodes: [
        rule('id', 'identity', 'You are FlowDesk.'),
        rule('mixed', 'tone', 'Partly retired scope list.', ['my_requests', 'field_help']),
      ],
      edges: [],
    });
    expect(v.warnings.map((w) => w.code)).not.toContain('RULE_REACHES_NO_NODE');
    const c = compilePromptGraph({ nodes: [rule('mixed', 'tone', 'Partly retired.', ['my_requests', 'field_help'])], edges: [] });
    expect(c.byNode.field_help).toContain('Partly retired.');
    expect(c.byNode.router).not.toContain('Partly retired.');
  });
});
