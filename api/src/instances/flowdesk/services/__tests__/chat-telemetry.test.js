'use strict';

/**
 * ADMIN P0 — chat telemetry unit tests (no Memgraph/Redis: injected fakes).
 */

const telemetry = require('../chat-telemetry.service');
const { createChatSessionSweeper } = require('../chat-session-sweeper.service');
const { flowdeskAdminMiddleware } = require('../../../../middleware/flowdesk-admin.middleware');

describe('chat-telemetry outcomeOf', () => {
  const { outcomeOf } = telemetry;

  test('submit → completed', () => {
    expect(outcomeOf({ srNumber: 'SR-1' })).toBe('completed');
  });
  test('escalation → escalated', () => {
    expect(outcomeOf({ escalationId: 'ESC-1' })).toBe('escalated');
  });
  test('park → parked', () => {
    expect(outcomeOf({ parked: true })).toBe('parked');
  });
  test('error during SUBMIT → submit_failed', () => {
    expect(outcomeOf({ error: 'AltioraServerError', trace: ['LOAD_DRAFT', 'ROUTER', 'SUBMIT', 'ERROR'] })).toBe('submit_failed');
  });
  test('ordinary turn → null (session stays active)', () => {
    expect(outcomeOf({ response: 'What is your duty station?', route: 'SLOT_FILL' })).toBe(null);
    expect(outcomeOf({ error: 'ERROR', trace: ['ROUTER', 'ERROR'] })).toBe(null); // error but not at SUBMIT
  });
});

describe('chat-telemetry wrapLLMProvider + withTurnCapture', () => {
  test('captures latency/cost of calls made inside the turn scope', async () => {
    const llm = {
      structuredOutput: async () => ({ data: { route: 'SLOT_FILL' }, cost: 0.002, tokens: 10 }),
      completion: async () => ({ text: 'hi', cost: 0.001 }),
    };
    const wrapped = telemetry.wrapLLMProvider(llm, { model: 'test-model' });
    const { result, capture } = await telemetry.withTurnCapture(async () => {
      await wrapped.structuredOutput('p', {});
      await wrapped.completion('p2');
      return 'done';
    });
    expect(result).toBe('done');
    expect(capture.llmCalls).toHaveLength(2);
    expect(capture.llmCalls[0]).toMatchObject({ method: 'structuredOutput', model: 'test-model', costUsd: 0.002 });
    expect(capture.llmCalls[1]).toMatchObject({ method: 'completion', costUsd: 0.001 });
    expect(capture.llmCalls[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('provider errors are recorded and re-thrown untouched', async () => {
    const boom = Object.assign(new Error('nope'), { code: 'LLM_DOWN' });
    const llm = { completion: async () => { throw boom; } };
    const wrapped = telemetry.wrapLLMProvider(llm);
    const { capture } = await telemetry.withTurnCapture(async () => {
      await expect(wrapped.completion('p')).rejects.toBe(boom);
    });
    expect(capture.llmCalls[0].error).toBe('LLM_DOWN');
  });

  test('calls outside a turn scope do not throw (no store)', async () => {
    const llm = { completion: async () => ({ text: 'x', cost: 0 }) };
    const wrapped = telemetry.wrapLLMProvider(llm);
    await expect(wrapped.completion('p')).resolves.toMatchObject({ text: 'x' });
  });

  test('double-wrap is a no-op', () => {
    const llm = { completion: async () => ({}) };
    const w1 = telemetry.wrapLLMProvider(llm);
    expect(telemetry.wrapLLMProvider(w1)).toBe(w1);
  });
});

describe('recordTurn persistence (fake graph)', () => {
  afterEach(() => telemetry._setDeps({}));

  // SUADA-PREREQ-001: the prompt-graph version governing the turn under test.
  const PROV = { promptGraphEntryId: 'entry-1', promptGraphVersion: 3, promptTextHash: 'a'.repeat(64) };
  const getPromptProvenance = async () => PROV;
  // SUADA-PREREQ-001.1: the overlays layered on top of it.
  const OVERLAY = { overlayHash: 'b'.repeat(64), overlayIds: ['POV-11111111', 'POV-22222222'] };
  const getOverlayProvenance = async () => OVERLAY;

  test('writes session-merge + turn-create with derived counters', async () => {
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; }, getPromptProvenance, getOverlayProvenance });
    await telemetry.recordTurn({
      sessionId: 'sess-1', userId: 'u1',
      userContext: { displayName: 'Ivan', orgUnit: { code: 'UNCS' } },
      message: 'I need to initiate the separation process',
      result: {
        response: 'What documents?', route: 'NEW_INTENT', askingSlot: 'notes',
        draft: { serviceId: 'EO-HR-SA-SS-ISP', status: 'draft', repair: { session: 1 } },
        trace: ['LOAD_DRAFT', 'ROUTER'],
      },
      durationMs: 1234,
      capture: { llmCalls: [{ method: 'structuredOutput', costUsd: 0.003, latencyMs: 900 }], nodeEvents: [{ node: 'ROUTER', status: 'success', durationMs: 900 }] },
      channel: 'text', lang: 'en',
    });
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const { cypher, params } = writes[0];
    expect(cypher).toContain('MERGE (s:ChatSession');
    expect(cypher).toContain('CREATE (t:ChatTurn');
    expect(params).toMatchObject({
      sessionId: 'sess-1', serviceId: 'EO-HR-SA-SS-ISP', costUsd: 0.003,
      errInc: 0, oosInc: 0, outcome: null, userDisplayName: 'Ivan', orgCode: 'UNCS',
    });
    expect(JSON.parse(params.llmCallsJson)).toHaveLength(1);
  });

  test('the turn carries the prompt-graph provenance that produced it', async () => {
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; }, getPromptProvenance, getOverlayProvenance });
    await telemetry.recordTurn({ sessionId: 'sess-p', message: 'hi', result: { response: 'hello', route: 'INFO_QUESTION' } });
    const { cypher, params } = writes[0];
    // Persisted on the turn (not the session): the active prompt can change
    // mid-session, so the turn is the only honest grain for attribution.
    expect(cypher).toContain('promptGraphEntryId:$promptGraphEntryId');
    expect(cypher).toContain('promptGraphVersion:$promptGraphVersion');
    expect(cypher).toContain('promptTextHash:$promptTextHash');
    expect(params).toMatchObject(PROV);
  });

  describe('the provenance belongs to the graph that ran the turn (P-1)', () => {
    // For months this recorded the wrong graph on every agent turn. The active-prompt
    // record only exists for the state machine; the agent compiles its own graph and
    // has no such record, so 580 live turns were stamped with the entry and version of
    // CHAT_PROMPT — a graph that did not influence a single word of them.
    //
    // Nothing looked broken: the field was populated and the number was plausible.
    // These tests exist because that is exactly what makes the bug survive.
    const AGENT_META = {
      promptGraphEntryId: 'agent-entry', promptGraphVersion: 4,
      promptTextHash: 'f'.repeat(64), promptGraphTextHash: 'g'.repeat(64),
      toolCalls: [], costUsd: 0, tokens: 0,
    };

    test("an agent turn records ITS OWN manifest, not the state machine's record", async () => {
      const writes = [];
      telemetry._setDeps({ write: async (c, params) => { writes.push(params); return []; }, getPromptProvenance, getOverlayProvenance });
      await telemetry.recordTurn({
        sessionId: 'sess-a', message: 'hi',
        result: { response: 'hello', agentMeta: AGENT_META },
      });
      expect(writes[0]).toMatchObject({
        promptGraphEntryId: 'agent-entry', promptGraphVersion: 4,
        promptTextHash: 'f'.repeat(64), promptGraphTextHash: 'g'.repeat(64),
        promptProvenanceSource: 'turn',
      });
      expect(writes[0].promptGraphEntryId).not.toBe(PROV.promptGraphEntryId);
    });

    test('a TEMPLATE turn records no prompt at all — none governed it', async () => {
      // Falling back here would credit the state machine's graph for words a template
      // wrote from the field's own promptHint. "No prompt ran" is the honest record.
      const writes = [];
      telemetry._setDeps({ write: async (c, params) => { writes.push(params); return []; }, getPromptProvenance, getOverlayProvenance });
      await telemetry.recordTurn({
        sessionId: 'sess-tpl', message: '[control:set:startDate]',
        result: { response: 'Noted. When?', turnAuthor: 'template', routerReason: 'template' },
      });
      expect(writes[0]).toMatchObject({
        promptGraphEntryId: null, promptGraphVersion: null,
        promptProvenanceSource: 'template',
      });
    });

    test('a state-machine turn still reads the active record, and says so', async () => {
      const writes = [];
      telemetry._setDeps({ write: async (c, params) => { writes.push(params); return []; }, getPromptProvenance, getOverlayProvenance });
      await telemetry.recordTurn({ sessionId: 'sess-fsm', message: 'hi', result: { response: 'hello', route: 'INFO_QUESTION' } });
      expect(writes[0]).toMatchObject({ ...PROV, promptProvenanceSource: 'fsm-active' });
    });
  });

  test('who wrote the turn, and why, reach the graph (P-2)', async () => {
    // Both fields were set on every hybrid turn and written by nobody: they rode the
    // response to the client, and the CREATE had no such properties. 0 of 1203 live
    // turns carried an author, so the deterministic share of the dialogue was
    // measurable only in the arena.
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; }, getPromptProvenance, getOverlayProvenance });
    await telemetry.recordTurn({
      sessionId: 'sess-h', message: '[control:set:x]',
      result: { response: 'ok', turnAuthor: 'model', routerReason: 'free_text' },
    });
    const { cypher, params } = writes[0];
    expect(cypher).toContain('turnAuthor:$turnAuthor');
    expect(cypher).toContain('routerReason:$routerReason');
    expect(params).toMatchObject({ turnAuthor: 'model', routerReason: 'free_text' });
  });

  test('the turn also carries the overlays layered on top of the prompt', async () => {
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; }, getPromptProvenance, getOverlayProvenance });
    await telemetry.recordTurn({ sessionId: 'sess-o', message: 'hi', result: { response: 'hello', route: 'INFO_QUESTION' } });
    const { cypher, params } = writes[0];
    expect(cypher).toContain('overlayHash:$overlayHash');
    expect(cypher).toContain('overlayIds:$overlayIds');
    expect(params).toMatchObject(OVERLAY);
  });

  test('overlay provenance is resolved for the service in play', async () => {
    const seen = [];
    telemetry._setDeps({
      write: async () => [],
      getPromptProvenance,
      getOverlayProvenance: async (serviceId) => { seen.push(serviceId); return OVERLAY; },
    });
    await telemetry.recordTurn({
      sessionId: 'sess-s',
      result: { response: 'ok', draft: { serviceId: 'EO-HR-BE-TRE-TRE' } },
    });
    // Service-scoped overlays only apply to their own service — resolving with a
    // null serviceId here would silently drop them from the record.
    expect(seen).toEqual(['EO-HR-BE-TRE-TRE']);
  });

  test('an overlay-provenance failure degrades to null hash and empty ids', async () => {
    const writes = [];
    telemetry._setDeps({
      write: async (cypher, params) => { writes.push({ cypher, params }); return []; },
      getPromptProvenance,
      getOverlayProvenance: async () => { throw new Error('memgraph down'); },
    });
    await expect(telemetry.recordTurn({ sessionId: 'sess-t', result: {} })).resolves.toBeUndefined();
    expect(writes[0].params).toMatchObject({ overlayHash: null, overlayIds: [] });
  });

  test('a provenance failure degrades to nulls, it never breaks the turn', async () => {
    const writes = [];
    telemetry._setDeps({
      write: async (cypher, params) => { writes.push({ cypher, params }); return []; },
      getPromptProvenance: async () => { throw new Error('memgraph down'); }, getOverlayProvenance,
    });
    await expect(telemetry.recordTurn({ sessionId: 'sess-q', result: {} })).resolves.toBeUndefined();
    expect(writes[0].params).toMatchObject({
      promptGraphEntryId: null, promptGraphVersion: null, promptTextHash: null,
    });
  });

  test('no applied prompt yields null provenance rather than a missing property', async () => {
    const writes = [];
    telemetry._setDeps({
      write: async (cypher, params) => { writes.push({ cypher, params }); return []; },
      getPromptProvenance: async () => ({ promptGraphEntryId: null, promptGraphVersion: null, promptTextHash: null }),
      getOverlayProvenance,
    });
    await telemetry.recordTurn({ sessionId: 'sess-r', result: {} });
    expect(writes[0].params).toHaveProperty('promptTextHash', null);
  });

  test('terminal turn stamps outcome + links ServiceRequest', async () => {
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; }, getPromptProvenance, getOverlayProvenance });
    await telemetry.recordTurn({
      sessionId: 'sess-2', message: 'yes',
      result: { response: 'Done — TKT-1', srNumber: 'TKT-2026-000075', ticketId: 75, route: 'CONFIRM_YES', trace: ['SUBMIT'] },
    });
    expect(writes[0].params.outcome).toBe('completed');
    expect(writes[0].params.ticketId).toBe(75);
    expect(writes[1].cypher).toContain('RESULTED_IN');
  });

  test('a graph failure never throws (fire-and-forget contract)', async () => {
    telemetry._setDeps({ write: async () => { throw new Error('memgraph down'); }, getPromptProvenance, getOverlayProvenance });
    await expect(telemetry.recordTurn({ sessionId: 's', result: {} })).resolves.toBeUndefined();
  });
});

describe('chat-session sweeper', () => {
  const mkRecord = (obj) => ({ get: (k) => obj[k] });

  // The JSONL pass deletes real files. Every sweeper test injects a fake fs so a
  // test run can never touch the developer's logs/chat directory.
  const fakeFs = (names = [], unlinked = []) => ({
    readdirSync: () => names,
    unlinkSync: (p) => { unlinked.push(p); },
  });

  test('stamps abandoned with draft snapshot, parked_abandoned, retention', async () => {
    const writes = [];
    const sweeper = createChatSessionSweeper({
      fs: fakeFs(), logDir: '/nonexistent',
      read: async () => [mkRecord({ sessionId: 'old-1' })],
      write: async (cypher, params) => {
        writes.push({ cypher, params });
        if (cypher.includes("SET s.outcome='parked_abandoned'")) return [mkRecord({ n: 2 })];
        if (cypher.includes('RETURN count(*) AS n')) return [mkRecord({ n: 5 })];
        return [];
      },
      getDraft: async (id) => ({ sessionId: id, status: 'draft', slots: {} }),
      log: () => {},
    });
    const summary = await sweeper.sweepOnce();
    expect(summary.abandoned).toBe(1);
    expect(summary.parkedAbandoned).toBe(2);
    expect(summary.errors).toBe(0);
    const abandonWrite = writes.find((w) => w.cypher.includes("s.outcome='abandoned'"));
    expect(abandonWrite.params.draftJson).toContain('"sessionId":"old-1"');
  });

  test('a failing pass is counted, not thrown', async () => {
    const sweeper = createChatSessionSweeper({
      fs: fakeFs(), logDir: '/nonexistent',
      read: async () => { throw new Error('down'); },
      write: async () => { throw new Error('down'); },
      getDraft: async () => null,
      log: () => {},
    });
    const summary = await sweeper.sweepOnce();
    expect(summary.errors).toBeGreaterThan(0);
  });

  // TASK-SUADA-PREREQ-003 — retention has to mean the same thing in both stores.
  describe('JSONL retention', () => {
    const NOW = Date.parse('2026-07-28T12:00:00Z');
    const mkSweeper = (names, unlinked, over = {}) => createChatSessionSweeper({
      fs: fakeFs(names, unlinked), logDir: '/logs/chat', now: () => NOW,
      read: async () => [], write: async () => [], getDraft: async () => null, log: () => {},
      ...over,
    });

    test('deletes firehose files past the retention horizon, keeps the rest', async () => {
      const unlinked = [];
      const sweeper = mkSweeper([
        'chat-turns-2026-01-01.jsonl',   // ~208 days old → gone
        'chat-turns-2026-04-01.jsonl',   // ~118 days old → gone
        'chat-turns-2026-07-01.jsonl',   // 27 days old → kept
        'chat-turns-2026-07-28.jsonl',   // today → kept
      ], unlinked);
      const summary = await sweeper.sweepOnce();
      expect(summary.jsonlDeleted).toBe(2);
      expect(unlinked.map((p) => p.replace(/\\/g, '/'))).toEqual([
        '/logs/chat/chat-turns-2026-01-01.jsonl',
        '/logs/chat/chat-turns-2026-04-01.jsonl',
      ]);
    });

    test('leaves files that are not the chat firehose alone', async () => {
      const unlinked = [];
      // The ACT audit log lives in the same directory and answers to a different
      // policy — chat retention must not quietly delete audit records.
      const summary = await mkSweeper([
        'action-log-2020-01-01.jsonl', 'chat-turns-2020-01-01.jsonl.bak',
        'notes.txt', 'chat-turns-2020-01-01.jsonl',
      ], unlinked).sweepOnce();
      expect(summary.jsonlDeleted).toBe(1);
      expect(unlinked[0].replace(/\\/g, '/')).toBe('/logs/chat/chat-turns-2020-01-01.jsonl');
    });

    test('a missing log directory is normal, not an error', async () => {
      const sweeper = createChatSessionSweeper({
        fs: { readdirSync: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }, unlinkSync: () => {} },
        logDir: '/logs/chat', now: () => NOW,
        read: async () => [], write: async () => [], getDraft: async () => null, log: () => {},
      });
      const summary = await sweeper.sweepOnce();
      expect(summary.jsonlDeleted).toBe(0);
      expect(summary.errors).toBe(0);
    });

    test('an undeletable file is counted, and the rest still go', async () => {
      const unlinked = [];
      const sweeper = createChatSessionSweeper({
        fs: {
          readdirSync: () => ['chat-turns-2020-01-01.jsonl', 'chat-turns-2020-01-02.jsonl'],
          unlinkSync: (p) => { if (p.includes('01-01')) throw new Error('EBUSY'); unlinked.push(p); },
        },
        logDir: '/logs/chat', now: () => NOW,
        read: async () => [], write: async () => [], getDraft: async () => null, log: () => {},
      });
      const summary = await sweeper.sweepOnce();
      expect(summary.jsonlDeleted).toBe(1);
      expect(summary.errors).toBe(1);
    });

    test('the JSONL window can be shortened but never outlive the graph copy', async () => {
      const unlinked = [];
      process.env.FLOWDESK_CHAT_JSONL_RETENTION_DAYS = '7';
      try {
        // 27 days old: still inside the graph's 90 days, but past the 7-day disk window.
        const summary = await mkSweeper(['chat-turns-2026-07-01.jsonl'], unlinked).sweepOnce();
        expect(summary.jsonlDeleted).toBe(1);
      } finally { delete process.env.FLOWDESK_CHAT_JSONL_RETENTION_DAYS; }

      const unlinked2 = [];
      process.env.FLOWDESK_CHAT_JSONL_RETENTION_DAYS = '3650'; // ten years — ignored
      try {
        const summary = await mkSweeper(['chat-turns-2026-01-01.jsonl'], unlinked2).sweepOnce();
        expect(summary.jsonlDeleted).toBe(1); // clamped back to the ratified 90 days
      } finally { delete process.env.FLOWDESK_CHAT_JSONL_RETENTION_DAYS; }
    });
  });
});

describe('flowdesk-admin middleware (ratified env allowlist)', () => {
  const run = (headers = {}, flowdeskUser = null) => {
    const req = { headers, flowdeskUser };
    const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    let nexted = false;
    flowdeskAdminMiddleware(req, res, () => { nexted = true; });
    return { nexted, res };
  };
  const OLD = { ...process.env };
  afterEach(() => { process.env.FLOWDESK_ADMIN_TOKEN = OLD.FLOWDESK_ADMIN_TOKEN || ''; process.env.FLOWDESK_ADMIN_USERS = OLD.FLOWDESK_ADMIN_USERS || ''; });

  test('open when unconfigured', () => {
    process.env.FLOWDESK_ADMIN_TOKEN = '';
    process.env.FLOWDESK_ADMIN_USERS = '';
    expect(run().nexted).toBe(true);
  });
  test('token grants, wrong token denies', () => {
    process.env.FLOWDESK_ADMIN_TOKEN = 'secret';
    expect(run({ 'x-flowdesk-admin-token': 'secret' }).nexted).toBe(true);
    const denied = run({ 'x-flowdesk-admin-token': 'wrong' });
    expect(denied.nexted).toBe(false);
    expect(denied.res.statusCode).toBe(403);
  });
  test('allowlisted proxy identity grants (case-insensitive email)', () => {
    process.env.FLOWDESK_ADMIN_TOKEN = '';
    process.env.FLOWDESK_ADMIN_USERS = 'Admin@un.org, 6936e0e0-972a-493c-98d2-87d93cf15e5e';
    expect(run({}, { email: 'admin@UN.org' }).nexted).toBe(true);
    expect(run({}, { userId: '6936E0E0-972A-493C-98D2-87D93CF15E5E' }).nexted).toBe(true);
    expect(run({}, { email: 'someone@un.org' }).nexted).toBe(false);
  });
});
