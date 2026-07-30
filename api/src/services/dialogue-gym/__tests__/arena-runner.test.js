'use strict';

/**
 * ArenaRunner unit tests — fully faked collaborators (no live LLM, no DB).
 * Verifies orchestration: loop control, terminal conditions, deterministic
 * service-match metric, and that every turn is persisted.
 */

const { createArenaRunner, extractAgentInternals, identityFromToken, isDirectoryUnavailableTurn } = require('../arena-runner.service');

// ── fakes ──────────────────────────────────────────────────────────────────
function fakeStore() {
  const runs = new Map();
  const turns = [];
  return {
    runs, turns,
    async ensureIndexes() {},
    async createRun(n) { runs.set(n.runId, { ...n }); return n; },
    async appendTurn(n) { turns.push({ ...n }); return n; },
    async finalizeRun(runId, patch) { runs.set(runId, { ...runs.get(runId), ...patch }); },
    async getRun(runId) { return runs.get(runId) || null; },
    async listRuns() { return [...runs.values()]; },
    async getTurns(runId) { return turns.filter((t) => t.runId === runId).sort((a, b) => a.turnIndex - b.turnIndex); },
  };
}

const persona = {
  personaId: 'p1', name: 'New HR Staff', description: 'newbie',
  domainKnowledge: 'symptom_only', patience: 7, verbosity: 'verbose',
  cooperativeness: 'cooperative', language: 'en', persona: '', enabled: true,
};
const scenario = {
  scenarioId: 's1', name: 'Leave balance', userGoal: 'check leave',
  initialMessage: 'how many vacation days do I have?', expectedServiceCode: 'EO-HR-HRA-O-GI',
  maxTurns: 20, enabled: true,
};

function fakeGym({ p = persona, s = scenario } = {}) {
  return { getPersona: async () => p, getScenario: async () => s };
}

// simulator that keeps saying "continue" for N turns then goal_achieved.
// A step may carry choiceIndex to simulate picking an offered choice.
function fakeSimulator(script) {
  let i = 0;
  return {
    async generateInitialMessage() { return { userMessage: scenario.initialMessage, signal: 'continue', choiceIndex: 0, tokens: { input: 1, output: 1, costUsd: 0.0001 }, latencyMs: 1 }; },
    async generateNextMessage(_p, _s, _h, opts = {}) {
      const step = script[Math.min(i, script.length - 1)]; i++;
      // guard choiceIndex against offered options, mirroring the real simulator
      let choiceIndex = step.choiceIndex || 0;
      const n = (opts.choices || []).length;
      if (!(choiceIndex >= 1 && choiceIndex <= n)) choiceIndex = 0;
      return { userMessage: step.msg || 'ok', signal: step.signal || 'continue', choiceIndex, reasoning: 'because', patience: step.patience ?? 5, tokens: { input: 2, output: 2, costUsd: 0.0002 }, latencyMs: 1 };
    },
  };
}

// sandbox session whose agent responses are scripted; optionally resolves a service on a given turn.
// Records the controlAction it receives so tests can assert the arena replied to controls.
function fakeSandboxFactory(agentScript, sink = {}) {
  sink.calls = sink.calls || [];
  return () => {
    let t = 0;
    return {
      sessionId: 'sbx-test',
      async sendTurn(message, opts = {}) {
        sink.calls.push({ message, controlAction: opts.controlAction || null });
        const step = agentScript[Math.min(t, agentScript.length - 1)]; t++;
        if (step.throw) return { ok: false, error: 'boom', ms: 1 };
        return { ok: true, ms: 1, turn: { response: step.response || 'agent says hi', route: step.route || 'question_planner', askingSlot: step.askingSlot || null, isComplete: !!step.isComplete, draft: step.draft || null, controls: step.controls || null } };
      },
    };
  };
}

/**
 * The prompt loader, faked — and this is not decoration.
 *
 * The header of this file promises "no live LLM, no DB", and every collaborator was
 * injected except this one. Left real, `resolvePrompt` reaches prompt-editor.service
 * → the graph catalog → Memgraph on the very first test, which initialises the
 * catalog schema against a database other suites are using at the same time. In
 * isolation that costs 2.1s and passes; in a parallel run it contends
 * ("Cannot get read only access to the storage") and blows the 5s timeout — a
 * failure that reads like a behavioural regression and is nothing of the kind.
 *
 * Returning null is what the runner documents as "no active prompt": the engine
 * uses its base prompt. That is exactly the condition these orchestration tests
 * want, since none of them is about prompt provenance.
 */
const fakePromptLoader = () => ({
  async loadProduction() { return null; },
  async loadVersion(entryId, versionNumber) {
    return { nodes: [], edges: [], metadata: { entryId, versionNumber: versionNumber ?? 1, source: 'version' } };
  },
});

function makeRunner({ agentScript, simScript, store = fakeStore() }) {
  const sink = {};
  return {
    store,
    sink,
    runner: createArenaRunner({
      gym: fakeGym(),
      simulator: fakeSimulator(simScript),
      store,
      sandboxFactory: fakeSandboxFactory(agentScript, sink),
      promptLoader: fakePromptLoader(),
    }),
  };
}

describe('ArenaRunner — orchestration', () => {
  test('service_matched terminates deterministically and records the run', async () => {
    const { store, runner } = makeRunner({
      agentScript: [
        { response: 'what do you need?' },
        { response: 'got it', draft: { serviceId: 'EO-HR-HRA-O-GI', slots: { period: '2026' } } },
      ],
      simScript: [{ signal: 'continue', msg: 'my leave' }, { signal: 'continue' }],
    });
    const { run, metrics } = await runner.runArena('p1', 's1');
    expect(metrics.terminalCondition).toBe('service_matched');
    expect(metrics.serviceIdentified).toBe(true);
    expect(metrics.identifiedServiceCode).toBe('EO-HR-HRA-O-GI');
    expect(run.status).toBe('completed');
    // 2 agent turns recorded
    const turns = await store.getTurns(run.runId);
    expect(turns.length).toBe(2);
    expect(turns[1].identifiedService).toBe('EO-HR-HRA-O-GI');
    expect(metrics.slotsCollected).toContain('period');
  });

  test('persona goal_achieved terminates the run', async () => {
    const { runner } = makeRunner({
      agentScript: [{ response: 'here is your answer' }],
      simScript: [{ signal: 'goal_achieved' }],
    });
    const { metrics } = await runner.runArena('p1', 's1');
    expect(metrics.terminalCondition).toBe('goal_achieved');
    // expected code never matched → serviceIdentified false (expected set, none resolved)
    expect(metrics.serviceIdentified).toBe(false);
  });

  test('gave_up terminates the run', async () => {
    const { runner } = makeRunner({
      agentScript: [{ response: 'huh?' }],
      simScript: [{ signal: 'gave_up' }],
    });
    const { metrics } = await runner.runArena('p1', 's1');
    expect(metrics.terminalCondition).toBe('gave_up');
  });

  test('max_turns caps the dialogue', async () => {
    const { store, runner } = makeRunner({
      agentScript: [{ response: 'still asking' }],
      simScript: [{ signal: 'continue' }],
    });
    const { run, metrics } = await runner.runArena('p1', 's1', { maxTurns: 3 });
    expect(metrics.terminalCondition).toBe('max_turns');
    expect(metrics.turnsCount).toBe(3);
    expect((await store.getTurns(run.runId)).length).toBe(3);
  });

  test('directory_unavailable aborts the run (invalid — no misleading result)', async () => {
    const { store, runner } = makeRunner({
      agentScript: [
        { response: 'ok, which person?', route: 'question_planner' },
        { response: 'The employee directory is temporarily unavailable. You can try again…', responseType: 'directory_unavailable', route: 'SLOT_FILL' },
      ],
      simScript: [{ signal: 'continue' }, { signal: 'continue' }],
    });
    const { run, metrics } = await runner.runArena('p1', 's1');
    expect(metrics.terminalCondition).toBe('directory_unavailable');
    expect(run.status).toBe('aborted');
    expect(run.errorMessage).toMatch(/directory unavailable/i);
    // both turns recorded, then it stopped
    expect((await store.getTurns(run.runId)).length).toBe(2);
  });

  test('agent_error terminates with failed status', async () => {
    const { runner } = makeRunner({
      agentScript: [{ throw: true }],
      simScript: [{ signal: 'continue' }],
    });
    const { run, metrics } = await runner.runArena('p1', 's1');
    expect(metrics.terminalCondition).toBe('agent_error');
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toBe('boom');
  });

  test('persona picks a disambiguation choice → arena replies with a controlAction', async () => {
    const { store, sink, runner } = makeRunner({
      agentScript: [
        // turn 0: agent offers a service disambiguation choice
        { response: 'which one?', route: 'DISAMBIGUATE', controls: [{ id: 'ctrl-serviceDisambiguation', type: 'choice', slotId: '__service__', options: [
          { value: 'EO-HR-HRA-O-GI', label: 'General Leave Info' },
          { value: 'EO-HR-OTHER', label: 'Other' },
        ] }] },
        // turn 1: after the pick, agent has resolved the service
        { response: 'starting your request', route: 'NEW_INTENT', draft: { serviceId: 'EO-HR-HRA-O-GI', slots: {} } },
      ],
      simScript: [
        { choiceIndex: 1 },      // persona selects option 1 on turn 0
        { signal: 'continue' },
      ],
    });
    const { run, metrics } = await runner.runArena('p1', 's1');
    expect(metrics.terminalCondition).toBe('service_matched');
    expect(metrics.identifiedServiceCode).toBe('EO-HR-HRA-O-GI');
    // the SECOND sendTurn carried the controlAction with the picked serviceId
    expect(sink.calls[1].controlAction).toEqual({ slotId: '__service__', value: 'EO-HR-HRA-O-GI' });
    // and the transcript recorded the human-readable label as the user message
    const turns = await store.getTurns(run.runId);
    expect(turns[1].userMessage).toBe('General Leave Info');
  });

  test('unknown persona/scenario throws 404', async () => {
    const runner = createArenaRunner({
      gym: { getPersona: async () => null, getScenario: async () => scenario },
      simulator: fakeSimulator([]), store: fakeStore(), sandboxFactory: fakeSandboxFactory([]),
    });
    await expect(runner.runArena('nope', 's1')).rejects.toThrow(/persona nope not found/);
  });
});

describe('ArenaRunner — extractAgentInternals', () => {
  test('reads serviceId, slots (map), controls', () => {
    const internals = extractAgentInternals({
      response: 'x', route: 'question_planner', askingSlot: 'dates',
      draft: { serviceId: 'EO-FIN-X', slots: { a: '1', b: null, c: 'y' } },
      controls: [{ id: 'ctrl-1' }, { slotId: 'ctrl-2' }],
    });
    expect(internals.identifiedService).toBe('EO-FIN-X');
    expect(internals.slots.sort()).toEqual(['a', 'c']);
    expect(internals.controls).toEqual(['ctrl-1', 'ctrl-2']);
    expect(internals.route).toBe('question_planner');
  });

  test('handles null draft/controls gracefully', () => {
    const internals = extractAgentInternals({ response: 'x' });
    expect(internals.identifiedService).toBeNull();
    expect(internals.slots).toEqual([]);
    expect(internals.controls).toEqual([]);
  });
});

describe('ArenaRunner — identity + directory helpers', () => {
  test('identityFromToken decodes oid/upn/name from JWT claims', () => {
    const payload = Buffer.from(JSON.stringify({ oid: 'oid-1', upn: 'ivan.plaksin@un.org', name: 'Ivan Plaksin' })).toString('base64url');
    const id = identityFromToken(`h.${payload}.s`);
    expect(id.userId).toBe('oid-1');
    expect(id.id).toBe('oid-1');
    expect(id.email).toBe('ivan.plaksin@un.org');
    expect(id.displayName).toBe('Ivan Plaksin');
  });

  test('identityFromToken is safe on garbage', () => {
    expect(identityFromToken('not-a-jwt')).toEqual({});
    expect(identityFromToken(undefined)).toEqual({});
  });

  test('isDirectoryUnavailableTurn detects responseType and message', () => {
    expect(isDirectoryUnavailableTurn({ responseType: 'directory_unavailable' })).toBe(true);
    expect(isDirectoryUnavailableTurn({ response: 'The employee directory is temporarily unavailable.' })).toBe(true);
    expect(isDirectoryUnavailableTurn({ response: 'here are your options' })).toBe(false);
  });
});
