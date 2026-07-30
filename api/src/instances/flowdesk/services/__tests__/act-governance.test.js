'use strict';

/** P9-003 ACT authorization + P9-004 ChatActionLog (governance units). */

const authz = require('../act-authorization');
const actionLog = require('../chat-action-log.service');

describe('P9-003 ACT authorization (fail-closed allowlist)', () => {
  const OLD = process.env.FLOWDESK_ACT_USERS;
  afterEach(() => { if (OLD === undefined) delete process.env.FLOWDESK_ACT_USERS; else process.env.FLOWDESK_ACT_USERS = OLD; });

  test('empty allowlist → nobody authorized (fail closed)', () => {
    delete process.env.FLOWDESK_ACT_USERS;
    expect(authz.isActAuthorized({ userId: 'u1', email: 'a@b.c' })).toBe(false);
  });

  test('listed userId or email → authorized (case-insensitive)', () => {
    process.env.FLOWDESK_ACT_USERS = 'U1, Approver@UN.org';
    expect(authz.isActAuthorized({ userId: 'u1' })).toBe(true);
    expect(authz.isActAuthorized({ email: 'approver@un.org' })).toBe(true);
    expect(authz.isActAuthorized({ userId: 'u2', email: 'x@y.z' })).toBe(false);
  });

  test('requireActingUser throws NO_ACTING_USER without a token', () => {
    expect(() => authz.requireActingUser(null)).toThrow(authz.ActAuthorizationError);
    try { authz.requireActingUser(''); } catch (e) { expect(e.code).toBe('NO_ACTING_USER'); }
    expect(() => authz.requireActingUser('bearer-abc')).not.toThrow();
  });

  test('checkAct: no token → NO_ACTING_USER; not listed → NOT_ENABLED; both ok → ok', () => {
    process.env.FLOWDESK_ACT_USERS = 'u1';
    expect(authz.checkAct({ userId: 'u1' }, null)).toMatchObject({ ok: false, code: 'NO_ACTING_USER' });
    expect(authz.checkAct({ userId: 'u2' }, 'tok')).toMatchObject({ ok: false, code: 'NOT_ENABLED' });
    expect(authz.checkAct({ userId: 'u1' }, 'tok')).toEqual({ ok: true });
  });
});

describe('P9-004 ChatActionLog', () => {
  afterEach(() => actionLog._reset());

  test('records an entry with the governance fields and writes to the graph', async () => {
    const writes = [];
    actionLog._setDeps({ write: async (cypher, params) => { writes.push({ cypher, params }); return []; } });
    const rec = await actionLog.recordAction({
      sessionId: 's1', userId: 'u1', actionType: 'SUBMIT_SR',
      actionParams: { serviceId: 'IT-HW-LAP' }, confirmationShown: true, confirmationAccepted: true,
      status: 'EXECUTED', srNumber: 'SR-1', motivation: 'user asked to submit their laptop request',
    });
    expect(rec.actionType).toBe('SUBMIT_SR');
    expect(rec.status).toBe('EXECUTED');
    expect(rec.confirmationAccepted).toBe(true);
    expect(rec.motivation).toMatch(/laptop request/);
    expect(rec.nodeType).toBe('ChatActionLog');
    expect(writes).toHaveLength(1);
    expect(writes[0].cypher).toMatch(/HAS_ACTION_LOG/);
    expect(writes[0].params.props.srNumber).toBe('SR-1');
  });

  test('best-effort: a graph-write failure does NOT throw', async () => {
    actionLog._setDeps({ write: async () => { throw new Error('memgraph down'); } });
    await expect(actionLog.recordAction({ sessionId: 's2', actionType: 'APPROVE_ITEM', status: 'FAILED', motivation: 'x' })).resolves.toBeDefined();
  });

  test('disabled telemetry → no graph write', async () => {
    const OLD = process.env.FLOWDESK_CHAT_TELEMETRY;
    process.env.FLOWDESK_CHAT_TELEMETRY = 'false';
    let called = false;
    actionLog._setDeps({ write: async () => { called = true; return []; } });
    await actionLog.recordAction({ sessionId: 's3', actionType: 'SUBMIT_SR', status: 'PENDING', motivation: 'x' });
    expect(called).toBe(false);
    if (OLD === undefined) delete process.env.FLOWDESK_CHAT_TELEMETRY; else process.env.FLOWDESK_CHAT_TELEMETRY = OLD;
  });
});
