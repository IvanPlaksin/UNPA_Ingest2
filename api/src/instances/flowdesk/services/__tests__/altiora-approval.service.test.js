'use strict';

/** P9-006 — AltioraApprovalService: queue mapping, ticket→auth-id match, decision DTO + error re-keying. */

const { createAltioraApprovalService, ApprovalError } = require('../altiora-approval.service');

function fakeClient({ pending = [], onPost } = {}) {
  const calls = { get: [], post: [] };
  return {
    calls,
    get: async (path) => { calls.get.push(path); return pending; },
    post: async (path, body, opts) => { calls.post.push({ path, body, opts }); return onPost ? onPost(path, body) : {}; },
  };
}
const authErr = (status) => Object.assign(new Error('auth'), { status });

describe('getPendingAuthorizations', () => {
  test('maps Altiora records to the compact shape', async () => {
    const client = fakeClient({ pending: [{ Id: 11, RfsNumber: 'SR-9', Title: 'VPN', Requester: { name: 'Alice' }, Status: 'Pending' }] });
    const svc = createAltioraApprovalService({ client });
    const items = await svc.getPendingAuthorizations();
    expect(client.calls.get[0]).toBe('/api/authorizations/pending');
    expect(items[0]).toMatchObject({ authorizationId: 11, ticketNumber: 'SR-9', title: 'VPN', requester: 'Alice' });
  });
});

describe('findByTicket', () => {
  const svc = (pending) => createAltioraApprovalService({ client: fakeClient({ pending }) });
  test('exact ticket-number match → the item', async () => {
    const r = await svc([{ Id: 1, RfsNumber: 'SR-100' }, { Id: 2, RfsNumber: 'SR-200' }]).findByTicket('sr-200');
    expect(r.authorizationId).toBe(2);
  });
  test('unique suffix match → the item; bare number resolves', async () => {
    const r = await svc([{ Id: 5, RfsNumber: 'RFS-2026-00045' }]).findByTicket('00045');
    expect(r.authorizationId).toBe(5);
  });
  test('no match / ambiguous → null', async () => {
    expect(await svc([{ Id: 1, RfsNumber: 'SR-1' }]).findByTicket('SR-999')).toBeNull();
    expect(await svc([{ Id: 1, RfsNumber: 'SR-1' }, { Id: 2, RfsNumber: 'SR-1' }]).findByTicket('SR-1')).toBeNull();
  });
});

describe('submitDecision', () => {
  test('approve → Status Approved, no justification needed', async () => {
    const client = fakeClient();
    const r = await createAltioraApprovalService({ client }).submitDecision(11, 'approve');
    expect(client.calls.post[0].path).toBe('/api/authorizations/11/decision');
    expect(client.calls.post[0].body).toEqual({ Status: 'Approved', Justification: null });
    expect(r).toMatchObject({ ok: true, decision: 'Approved' });
  });

  test('reject requires a justification (enforced before the POST)', async () => {
    const client = fakeClient();
    await expect(createAltioraApprovalService({ client }).submitDecision(11, 'reject'))
      .rejects.toMatchObject({ code: 'JUSTIFICATION_REQUIRED' });
    expect(client.calls.post).toHaveLength(0);
  });

  test('reject with justification → Status Denied', async () => {
    const client = fakeClient();
    await createAltioraApprovalService({ client }).submitDecision(11, 'reject', 'not budgeted');
    expect(client.calls.post[0].body).toEqual({ Status: 'Denied', Justification: 'not budgeted' });
  });

  test('403 is re-keyed to NOT_APPROVER', async () => {
    const client = fakeClient({ onPost: () => { throw authErr(403); } });
    await expect(createAltioraApprovalService({ client }).submitDecision(11, 'approve'))
      .rejects.toMatchObject({ code: 'NOT_APPROVER' });
  });

  test('400 → ALREADY_PROCESSED', async () => {
    const client = fakeClient({ onPost: () => { throw authErr(400); } });
    await expect(createAltioraApprovalService({ client }).submitDecision(11, 'approve'))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });

  test('401 (bad token) is NOT masked as NOT_APPROVER — original error propagates', async () => {
    const client = fakeClient({ onPost: () => { throw authErr(401); } });
    let caught;
    try { await createAltioraApprovalService({ client }).submitDecision(11, 'approve'); }
    catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(401);
    expect(caught instanceof ApprovalError).toBe(false);
  });
});
