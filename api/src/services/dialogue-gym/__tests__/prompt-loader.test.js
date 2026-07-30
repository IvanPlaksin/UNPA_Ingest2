'use strict';

/**
 * PromptLoader + arena prompt-provenance unit tests (ШАГ 5). Uses a fake
 * prompt-editor so no live catalog/DB is needed.
 */

const { createPromptLoader } = require('../prompt-loader');
const { createArenaRunner } = require('../arena-runner.service');

// fake prompt-editor.service
function fakeEditor() {
  return {
    listGraphs: async () => ([{ id: 'entry-1', name: 'Chat System Prompt', currentVersion: 3, nodes: [{}, {}] }]),
    getVersions: async () => ([
      { versionNumber: 3, isProduction: true, changelog: 'v3' },
      { versionNumber: 2, isProduction: false, changelog: 'v2' },
    ]),
    getGraph: async (entryId, version) => ({
      nodes: [{ id: 'rule-a', type: 'ruleNode', data: { kind: 'rule', key: 'a', text: `T${version || 'latest'}`, category: 'identity', appliesTo: [], enabled: true } }],
      edges: [],
      versionNumber: version || 3,
      name: 'Chat System Prompt',
    }),
    getActive: async () => ({ graphEntryId: 'entry-1', graphVersion: 3, text: '# active' }),
    compile: async (g) => ({ text: `compiled(${(g.nodes || []).length})`, byNode: {}, ruleCount: (g.nodes || []).length }),
  };
}

describe('PromptLoader', () => {
  const loader = createPromptLoader({ promptEditor: fakeEditor() });

  test('listPromptGraphs maps entries', async () => {
    const graphs = await loader.listPromptGraphs();
    expect(graphs).toHaveLength(1);
    expect(graphs[0]).toMatchObject({ entryId: 'entry-1', name: 'Chat System Prompt', currentVersion: 3 });
  });

  test('listVersions returns versions', async () => {
    const v = await loader.listVersions('entry-1');
    expect(v[0].versionNumber).toBe(3);
    expect(v[0].isProduction).toBe(true);
  });

  test('loadVersion returns {nodes,edges,metadata}', async () => {
    const loaded = await loader.loadVersion('entry-1', 2);
    expect(loaded.nodes[0].data.text).toBe('T2');
    expect(loaded.metadata).toMatchObject({ entryId: 'entry-1', versionNumber: 2 });
  });

  test('loadVersion requires entryId', async () => {
    await expect(loader.loadVersion(null)).rejects.toThrow(/entryId/);
  });

  test('loadProduction resolves the active prompt graph', async () => {
    const prod = await loader.loadProduction();
    expect(prod.nodes).toBeDefined();
    expect(prod.metadata).toMatchObject({ source: 'production', entryId: 'entry-1', versionNumber: 3 });
  });

  test('loadProduction falls back to text when no source entry', async () => {
    const l = createPromptLoader({ promptEditor: { ...fakeEditor(), getActive: async () => ({ graphEntryId: null, graphVersion: null, text: '# inline' }) } });
    const prod = await l.loadProduction();
    expect(prod.systemPromptText).toBe('# inline');
    expect(prod.nodes).toBeUndefined();
  });
});

describe('ArenaRunner — prompt provenance', () => {
  // minimal fakes to run the loop deterministically
  const gym = {
    getPersona: async () => ({ personaId: 'p1', name: 'P', domainKnowledge: 'partial', cooperativeness: 'neutral', verbosity: 'normal', language: 'en', enabled: true }),
    getScenario: async () => ({ scenarioId: 's1', name: 'S', userGoal: 'g', initialMessage: 'hi', expectedServiceCode: 'EO-X', enabled: true }),
  };
  const simulator = {
    generateInitialMessage: async () => ({ userMessage: 'hi', signal: 'continue', choiceIndex: 0, tokens: { input: 1, output: 1, costUsd: 0 }, latencyMs: 1 }),
    generateNextMessage: async () => ({ userMessage: 'ok', signal: 'goal_achieved', choiceIndex: 0, tokens: { input: 1, output: 1, costUsd: 0 }, latencyMs: 1 }),
  };
  function fakeStore() { const runs = new Map(); const turns = []; return {
    _runs: runs, async ensureIndexes() {}, async createRun(n) { runs.set(n.runId, { ...n }); return n; },
    async appendTurn(n) { turns.push(n); }, async finalizeRun(id, p) { runs.set(id, { ...runs.get(id), ...p }); },
    async getRun(id) { return runs.get(id); }, async listRuns() { return [...runs.values()]; }, async getTurns() { return turns; } }; }
  const capturingSandbox = (sink) => (p) => { sink.built = p; return { sessionId: 'x', async sendTurn() { return { ok: true, ms: 1, turn: { response: 'hello', route: 'x', draft: null, controls: null } }; } }; };

  test('promptSource=version loads the version graph and records provenance', async () => {
    const store = fakeStore();
    const sink = {};
    const runner = createArenaRunner({
      gym, simulator, store,
      sandboxFactory: capturingSandbox(sink),
      promptLoader: createPromptLoader({ promptEditor: fakeEditor() }),
    });
    const { run } = await runner.runArena('p1', 's1', { promptSource: 'version', promptEntryId: 'entry-1', promptVersionNumber: 2, maxTurns: 2 });
    expect(run.promptSource).toBe('version');
    expect(run.promptEntryId).toBe('entry-1');
    expect(run.promptVersionNumber).toBe(2);
    // the loaded graph was passed to the sandbox
    expect(sink.built.graph.nodes[0].data.text).toBe('T2');
  });

  test('default (no prompt opts) resolves production', async () => {
    const store = fakeStore(); const sink = {};
    const runner = createArenaRunner({ gym, simulator, store, sandboxFactory: capturingSandbox(sink), promptLoader: createPromptLoader({ promptEditor: fakeEditor() }) });
    const { run } = await runner.runArena('p1', 's1', { maxTurns: 2 });
    expect(run.promptSource).toBe('production');
    expect(run.promptEntryId).toBe('entry-1');
  });

  test('custom_text is inferred from systemPromptText', async () => {
    const store = fakeStore(); const sink = {};
    const runner = createArenaRunner({ gym, simulator, store, sandboxFactory: capturingSandbox(sink), promptLoader: createPromptLoader({ promptEditor: fakeEditor() }) });
    const { run } = await runner.runArena('p1', 's1', { systemPromptText: 'RAW', maxTurns: 2 });
    expect(run.promptSource).toBe('custom_text');
    expect(sink.built.systemPromptText).toBe('RAW');
  });
});
