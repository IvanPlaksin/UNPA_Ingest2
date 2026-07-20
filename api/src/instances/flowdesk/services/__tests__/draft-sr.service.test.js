'use strict';

/**
 * C2 test — DraftSR service.
 *
 * CRUD + TTL refresh + transitive stale cascade use an in-memory store and an
 * injected SchemaSnapshot. submit/escalate materialization uses live Memgraph
 * (bolt://localhost:7687) and reads the node back, then cleans up.
 */

const fs = require('fs');
const path = require('path');
const { createDraftSRService } = require('../draft-sr.service');
const { write, read, close } = require('../../schema-graph/driver');

const hardware = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'contracts', 'fixtures', 'schema-snapshot.hardware.json'), 'utf8'));

jest.setTimeout(30000);

// In-memory store that records the TTL used on each set.
function makeFakeStore() {
  const map = new Map();
  const ttls = [];
  return {
    map, ttls,
    async get(k) { const e = map.get(k); return e ? JSON.parse(JSON.stringify(e.value)) : null; },
    async set(k, v, ttl) { map.set(k, { value: JSON.parse(JSON.stringify(v)), ttl }); ttls.push(ttl); return true; },
  };
}

let clock = Date.parse('2026-07-14T09:00:00.000Z');
const now = () => clock;
const makeRef = (draft, prefix = 'SR') => `${prefix}-${draft.serviceId}-TEST`;

function svcWith(store) {
  return createDraftSRService({
    store,
    loadSnapshot: async () => hardware,
    graphWrite: write,     // real Memgraph
    now, makeRef,
    ttlSeconds: 3600,
  });
}

afterAll(async () => {
  await write(`MATCH (sr:ServiceRequest {srNumber:'SR-IT-HW-LAP-TEST'}) DETACH DELETE sr`);
  await write(`MATCH (e:Escalation {escalationId:'ESC-IT-HW-LAP-TEST'}) DETACH DELETE e`);
  await close();
});

describe('C2: DraftSR service CRUD + TTL', () => {
  test('create is idempotent and persisted with TTL', async () => {
    const store = makeFakeStore();
    const svc = svcWith(store);
    const d1 = await svc.create('s-crud', 'IT-HW-LAP', 1, { mode: 'self', userId: 'u1' });
    expect(d1.status).toBe('draft');
    const d2 = await svc.create('s-crud', 'IT-HW-LAP', 1);
    expect(d2.createdAt).toBe(d1.createdAt); // same draft returned
    expect(store.ttls[0]).toBe(3600);
  });

  test('patch persists and refreshes TTL on every write', async () => {
    const store = makeFakeStore();
    const svc = svcWith(store);
    await svc.create('s-ttl', 'IT-HW-LAP', 1);
    await svc.patch('s-ttl', [{ op: 'set', slotId: 'assetType', value: 'laptop_standard', provenance: 'extracted' }]);
    await svc.patch('s-ttl', [{ op: 'set', slotId: 'justification', value: 'x', provenance: 'user_edited' }]);
    // create + 2 patches → 3 writes, each with ttl 3600
    expect(store.ttls).toEqual([3600, 3600, 3600]);
    const draft = await svc.get('s-ttl');
    expect(draft.slots.assetType.value).toBe('laptop_standard');
  });
});

describe('C2: transitive stale cascade through the service', () => {
  test('re-editing assetType stales justification (via reducer)', async () => {
    const store = makeFakeStore();
    const svc = svcWith(store);
    await svc.create('s-stale', 'IT-HW-LAP', 1);
    await svc.patch('s-stale', [
      { op: 'set', slotId: 'assetType', value: 'laptop_standard', provenance: 'extracted' },
      { op: 'set', slotId: 'justification', value: 'New hire', provenance: 'user_edited' },
    ]);
    await svc.patch('s-stale', [{ op: 'set', slotId: 'assetType', value: 'desktop', provenance: 'user_edited' }]);
    const draft = await svc.get('s-stale');
    expect(draft.slots.assetType.stale).toBe(false);
    expect(draft.slots.justification.stale).toBe(true);
  });
});

describe('C2: submit / escalate materialize to Memgraph', () => {
  test('submit refuses when required slots incomplete', async () => {
    const store = makeFakeStore();
    const svc = svcWith(store);
    await svc.create('s-inc', 'IT-HW-LAP', 1);
    const res = await svc.submit('s-inc');
    expect(res.error).toBeTruthy();
    expect(res.error.code).toBe('INCOMPLETE');
    expect(res.error.missing.length).toBeGreaterThan(0);
  });

  test('submit materializes a ServiceRequest node', async () => {
    const store = makeFakeStore();
    const svc = svcWith(store);
    await svc.create('s-sub', 'IT-HW-LAP', 1);
    await svc.patch('s-sub', [
      { op: 'set', slotId: 'author', value: { userId: 'u1' }, provenance: 'context' },
      { op: 'set', slotId: 'beneficiary', value: 'u1', provenance: 'context' },
      { op: 'set', slotId: 'location', value: { id: 'geneva' }, provenance: 'resolved' },
      { op: 'set', slotId: 'assetType', value: 'laptop_standard', provenance: 'extracted' },
      { op: 'set', slotId: 'justification', value: 'New hire', provenance: 'user_edited' },
      { op: 'set', slotId: 'approver', value: { userId: 'U005' }, provenance: 'resolved' },
      { op: 'set', slotId: 'approverComment', value: 'ok', provenance: 'user_edited' },
    ]);
    const res = await svc.submit('s-sub');
    expect(res.srNumber).toBe('SR-IT-HW-LAP-TEST');

    const recs = await read(`MATCH (sr:ServiceRequest {srNumber:$n}) RETURN sr.status AS status, sr.serviceId AS serviceId`, { n: res.srNumber });
    expect(recs).toHaveLength(1);
    expect(recs[0].get('status')).toBe('submitted');
    expect(recs[0].get('serviceId')).toBe('IT-HW-LAP');

    const draft = await svc.get('s-sub');
    expect(draft.status).toBe('submitted');
  });

  test('escalate materializes an Escalation node with transcript', async () => {
    const store = makeFakeStore();
    const svc = svcWith(store);
    await svc.create('s-esc', 'IT-HW-LAP', 1);
    const res = await svc.escalate('s-esc', 'user stuck', 'transcript://s-esc');
    expect(res.escalationId).toBe('ESC-IT-HW-LAP-TEST');

    const recs = await read(`MATCH (e:Escalation {escalationId:$id}) RETURN e.reason AS reason, e.transcriptRef AS tr`, { id: res.escalationId });
    expect(recs).toHaveLength(1);
    expect(recs[0].get('reason')).toBe('user stuck');
    expect(recs[0].get('tr')).toBe('transcript://s-esc');

    const draft = await svc.get('s-esc');
    expect(draft.status).toBe('escalated');
  });
});
