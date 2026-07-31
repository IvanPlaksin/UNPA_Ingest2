'use strict';

/**
 * PE-006/007 — what the operator is told about a recorded turn.
 *
 * The behaviour under test is mostly about REFUSING to answer: an empty rule list is
 * the same shape whether no prompt ran, the record was lost, or the version is gone,
 * and treating those alike is what would make the panel lie.
 */

const ENTRY = 'agent-entry-1';
const OTHER = 'fsm-entry-9';

jest.mock('../prompt-editor.service', () => ({
  getGraph: jest.fn(),
  compile: jest.fn(),
  getVersions: jest.fn(),
}));
jest.mock('../../schema-graph/driver', () => ({ read: jest.fn(async () => []) }), { virtual: true });

const editor = require('../prompt-editor.service');
const driver = require('../../schema-graph/driver');
const attribution = require('../prompt-attribution.service');

const NODE = (id, over = {}) => ({
  nodeId: id, type: 'Thesis',
  data: { title: `rule ${id}`, assertion: `say ${id}`, text: 'LEGACY COPY', category: 'dialogue', priority: 50, ...over },
});

const GRAPH = { nodes: [NODE('n1'), NODE('n2')], edges: [] };
const COMPILED = {
  text: 'SYSTEM',
  manifest: { textHash: 'graph-hash', nodes: [{ nodeId: 'n2', tokens: 7 }, { nodeId: 'n1', tokens: 5 }] },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FLOWDESK_AGENT_PROMPT_ENTRY = ENTRY;
  editor.getGraph.mockResolvedValue(GRAPH);
  editor.compile.mockReturnValue(COMPILED);
});

describe('rules in force on a turn', () => {
  test('rebuilds the recorded version and returns the rules the model was given', async () => {
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4,
      promptProvenanceSource: 'turn', promptGraphTextHash: 'graph-hash',
    });
    expect(r.status).toBe('ok');
    expect(editor.getGraph).toHaveBeenCalledWith(ENTRY, 4, 'agent');
    expect(r.ruleCount).toBe(2);
    expect(r.hashMatches).toBe(true);
    expect(r.notice).toBeNull();
  });

  test('the text is the field the node TYPE compiles, not the legacy copy', async () => {
    // A Thesis compiles `assertion`. Several nodes also carry `text` from the
    // migration, and showing that instead is how an operator ends up editing a
    // sentence the compiler never reads. The text comes from the compiler's own
    // bodyOf, so "shown" and "compiled" cannot drift apart.
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4, promptProvenanceSource: 'turn',
    });
    expect(r.rules.map((x) => x.text)).toEqual(['say n2', 'say n1']);
    expect(r.rules[0].compilesField).toBe('assertion');
  });

  test('a Narrative reads `framing` — the field name is not the type name', async () => {
    // It read `narrative` at first and every Narrative came back blank in the panel.
    editor.getGraph.mockResolvedValue({
      nodes: [{ nodeId: 'nr', type: 'Narrative', framing: 'the standing story', narrative: 'NOT THIS' }],
      edges: [],
    });
    editor.compile.mockReturnValue({ text: 'x', manifest: { textHash: 'h', nodes: [{ nodeId: 'nr' }] } });
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4, promptProvenanceSource: 'turn',
    });
    expect(r.rules[0]).toMatchObject({ text: 'the standing story', compilesField: 'framing' });
  });

  test('fields at the top level read the same as fields under `data`', async () => {
    // The catalog hands nodes out flat; the editor nests them. Both reach here.
    editor.getGraph.mockResolvedValue({ nodes: [{ nodeId: 'flat', type: 'Thesis', assertion: 'flat text' }], edges: [] });
    editor.compile.mockReturnValue({ text: 'x', manifest: { textHash: 'h', nodes: [{ nodeId: 'flat' }] } });
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4, promptProvenanceSource: 'turn',
    });
    expect(r.rules[0].text).toBe('flat text');
  });

  test('the order is the order in the compiled prompt, not the order in the graph', async () => {
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4, promptProvenanceSource: 'turn',
    });
    expect(r.rules.map((x) => x.nodeId)).toEqual(['n2', 'n1']);
  });

  test('a node absent from the compiled text is not listed as in force', async () => {
    editor.compile.mockReturnValue({ ...COMPILED, manifest: { textHash: 'h', nodes: [{ nodeId: 'n1', tokens: 5 }] } });
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4, promptProvenanceSource: 'turn',
    });
    expect(r.rules.map((x) => x.nodeId)).toEqual(['n1']);
  });

  test('a rebuild that disagrees with the record is flagged, not presented as fact', async () => {
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4,
      promptProvenanceSource: 'turn', promptGraphTextHash: 'a-different-hash',
    });
    expect(r.hashMatches).toBe(false);
    expect(r.notice).toMatch(/differ/i);
  });
});

describe('the four ways there are no rules, kept apart', () => {
  test('a TEMPLATE turn: no prompt ran, and it says so instead of showing an empty list', async () => {
    const r = await attribution.rulesInForce({ turnAuthor: 'template', promptProvenanceSource: 'template' });
    expect(r.status).toBe('template');
    expect(r.notice).toMatch(/No prompt governed this turn/i);
    expect(editor.getGraph).not.toHaveBeenCalled();
  });

  test('recorded before the provenance fix: unattributable, and never guessed at', async () => {
    // 580 live turns are in this state: stamped with the state machine's graph
    // whatever actually ran. Rebuilding SOMETHING here would be the lie.
    const r = await attribution.rulesInForce({
      promptGraphEntryId: OTHER, promptGraphVersion: 6, promptProvenanceSource: null,
    });
    expect(r.status).toBe('unattributable');
    expect(r.rules).toEqual([]);
    expect(editor.getGraph).not.toHaveBeenCalled();
    expect(r.notice).toMatch(/cannot be recovered/i);
  });

  test('a version that is gone from the catalog', async () => {
    editor.getGraph.mockResolvedValue(null);
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 99, promptProvenanceSource: 'turn',
    });
    expect(r.status).toBe('unavailable');
    expect(r.notice).toMatch(/no longer in the catalog/i);
  });

  test('a version that no longer compiles is reported, not silently emptied', async () => {
    editor.compile.mockImplementation(() => { throw new Error('IMMUTABLE_CONSTRAINT_MISSING'); });
    const r = await attribution.rulesInForce({
      promptGraphEntryId: ENTRY, promptGraphVersion: 4, promptProvenanceSource: 'turn',
    });
    expect(r.status).toBe('unavailable');
    expect(r.notice).toMatch(/no longer compiles/i);
  });

  test('a turn with no version at all', async () => {
    const r = await attribution.rulesInForce({ promptProvenanceSource: 'fsm-active' });
    expect(r.status).toBe('unavailable');
  });
});

describe('turns under a rule (PE-007)', () => {
  beforeEach(() => {
    editor.getVersions.mockResolvedValue([{ versionNumber: 3 }, { versionNumber: 4 }]);
    // n1 compiled into v4 only.
    editor.compile.mockImplementation((g, o) => ({
      text: 'x',
      manifest: { textHash: 'h', nodes: o.version === 4 ? [{ nodeId: 'n1' }] : [{ nodeId: 'n2' }] },
    }));
  });

  test('counts only the versions the rule actually compiled into', async () => {
    driver.read.mockImplementation(async (cypher) => (cypher.includes('IS NULL')
      ? [{ get: () => 580 }]
      : [{ get: (k) => (k === 'turns' ? 42 : 7) }]));
    const r = await attribution.turnsUnderRule('n1');
    expect(r.versions).toEqual([4]);
    expect(r.turns).toBe(42);
    expect(r.sessions).toBe(7);
  });

  test('turns that cannot be attributed are reported, not quietly dropped', async () => {
    // They are the majority of the history. A count that ignored them would read as
    // "this rule barely ran" when the truth is "we cannot tell for most turns".
    driver.read.mockImplementation(async (cypher) => (cypher.includes('IS NULL')
      ? [{ get: () => 580 }]
      : [{ get: (k) => (k === 'turns' ? 42 : 7) }]));
    const r = await attribution.turnsUnderRule('n1');
    expect(r.unattributable).toBe(580);
  });

  test('a rule in no compiled version reports zero without touching the store', async () => {
    const r = await attribution.turnsUnderRule('never-compiled');
    expect(r).toMatchObject({ versions: [], turns: 0, sessions: 0 });
    expect(driver.read).not.toHaveBeenCalled();
  });
});
