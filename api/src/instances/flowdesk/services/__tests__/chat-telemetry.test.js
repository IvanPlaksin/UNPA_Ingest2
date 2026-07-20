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

  test('writes session-merge + turn-create with derived counters', async () => {
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; } });
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

  test('terminal turn stamps outcome + links ServiceRequest', async () => {
    const writes = [];
    telemetry._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; } });
    await telemetry.recordTurn({
      sessionId: 'sess-2', message: 'yes',
      result: { response: 'Done — TKT-1', srNumber: 'TKT-2026-000075', ticketId: 75, route: 'CONFIRM_YES', trace: ['SUBMIT'] },
    });
    expect(writes[0].params.outcome).toBe('completed');
    expect(writes[0].params.ticketId).toBe(75);
    expect(writes[1].cypher).toContain('RESULTED_IN');
  });

  test('a graph failure never throws (fire-and-forget contract)', async () => {
    telemetry._setDeps({ write: async () => { throw new Error('memgraph down'); } });
    await expect(telemetry.recordTurn({ sessionId: 's', result: {} })).resolves.toBeUndefined();
  });
});

describe('chat-session sweeper', () => {
  const mkRecord = (obj) => ({ get: (k) => obj[k] });

  test('stamps abandoned with draft snapshot, parked_abandoned, retention', async () => {
    const writes = [];
    const sweeper = createChatSessionSweeper({
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
      read: async () => { throw new Error('down'); },
      write: async () => { throw new Error('down'); },
      getDraft: async () => null,
      log: () => {},
    });
    const summary = await sweeper.sweepOnce();
    expect(summary.errors).toBeGreaterThan(0);
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
