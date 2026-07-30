'use strict';

/**
 * C1, at the write funnel — every slot write in either interpreter comes through
 * draftService.patch, which makes it the one place that can keep the FORM and the
 * LOCATION in step.
 *
 * Two behaviours, both invisible from outside and both load-bearing:
 *   - the draft is reconciled to the form it is being validated against, so a
 *     patch is never applied to a draft still carrying another provider's fields;
 *   - after the write, the ambient schema context follows the answer, so the rest
 *     of the turn loads the form for the location now on the draft.
 *
 * In-memory store, injected snapshots, no Altiora and no Memgraph.
 */

const { createDraftSRService } = require('../draft-sr.service');
const { runWithSchemaContext, getSchemaContext } = require('../schema-context');

const GENEVA_FORM = {
  serviceId: 'EO-HR-SEP', version: 1, phases: ['context', 'detail'],
  metadata: { title: 'Separation', altioraOusId: 11 },
  slots: [
    { slotId: 'beneficiary', type: 'user', required: true, phase: 'context' },
    { slotId: 'location', type: 'location', required: true, phase: 'context' },
    { slotId: 'lastDay', type: 'date', required: true, phase: 'detail' },
    { slotId: 'gvaBadgeReturn', type: 'text', required: false, phase: 'detail' },
  ],
};

// The same service in Nairobi: a different provider, a different form. No badge
// field; a field Geneva's provider does not have.
const NAIROBI_FORM = {
  serviceId: 'EO-HR-SEP', version: 2, phases: ['context', 'detail'],
  metadata: { title: 'Separation', altioraOusId: 12 },
  slots: [
    { slotId: 'beneficiary', type: 'user', required: true, phase: 'context' },
    { slotId: 'location', type: 'location', required: true, phase: 'context' },
    { slotId: 'lastDay', type: 'date', required: true, phase: 'detail' },
    { slotId: 'repatriationGrant', type: 'boolean', required: true, phase: 'detail' },
  ],
};

function makeStore() {
  const map = new Map();
  return {
    async get(k) { const v = map.get(k); return v ? JSON.parse(JSON.stringify(v)) : null; },
    async set(k, v, _ttl) { if (v === null) map.delete(k); else map.set(k, JSON.parse(JSON.stringify(v))); return true; },
  };
}

/** A service whose form follows whatever `form.current` says — as location does live. */
function makeService() {
  const form = { current: GENEVA_FORM };
  const svc = createDraftSRService({
    store: makeStore(),
    loadSnapshot: async () => form.current,
    graphWrite: async () => [],
    ticketService: { createTicket: async () => ({ srNumber: 'SR-1' }) },
    now: () => 1700000000000,
    makeRef: () => 'SR-1',
    ttlSeconds: 3600,
  });
  return { svc, form };
}

describe('the form changing under a half-filled draft', () => {
  test('what the new provider has a field for survives; what it does not is dropped and recorded', async () => {
    const { svc, form } = makeService();
    await svc.create('s1', 'EO-HR-SEP', GENEVA_FORM.version, null, 'u1');
    await svc.patch('s1', [
      { op: 'set', slotId: 'lastDay', value: '2026-09-30', provenance: 'user' },
      { op: 'set', slotId: 'gvaBadgeReturn', value: 'returned to reception', provenance: 'user' },
    ]);

    // The duty station is confirmed as Nairobi: from here the form is Nairobi's.
    form.current = NAIROBI_FORM;
    const after = await svc.patch('s1', [
      { op: 'set', slotId: 'location', value: { name: 'Nairobi' }, provenance: 'resolved' },
    ]);

    expect(after.slots.lastDay.value).toBe('2026-09-30');       // still a field — kept
    expect(after.slots.gvaBadgeReturn).toBeUndefined();          // Geneva's only — dropped
    expect(after.schemaVersion).toBe(2);
    expect(after.schemaSwitch).toMatchObject({ from: 1, to: 2, dropped: ['gvaBadgeReturn'] });
  });

  test('the location answered is the location the REST of the turn loads the form for', async () => {
    const { svc } = makeService();
    await svc.create('s2', 'EO-HR-SEP', GENEVA_FORM.version, null, 'u1');

    await runWithSchemaContext({ locationPath: 'Geneva' }, async () => {
      await svc.patch('s2', [{ op: 'set', slotId: 'location', value: { name: 'Nairobi' }, provenance: 'resolved' }]);
      // Without this the turn would go on choosing the next question from Geneva's
      // form after the user had said Nairobi.
      expect(getSchemaContext().locationPath).toBe('Nairobi');
    });
  });

  test('an ordinary field write says nothing about where the request is for', async () => {
    const { svc } = makeService();
    await svc.create('s3', 'EO-HR-SEP', GENEVA_FORM.version, null, 'u1');

    await runWithSchemaContext({ locationPath: 'Geneva' }, async () => {
      await svc.patch('s3', [{ op: 'set', slotId: 'lastDay', value: '2026-09-30', provenance: 'user' }]);
      expect(getSchemaContext().locationPath).toBe('Geneva');
    });
  });

  test('outside a turn a write still works — background jobs have no context to revise', async () => {
    const { svc } = makeService();
    await svc.create('s4', 'EO-HR-SEP', GENEVA_FORM.version, null, 'u1');
    const out = await svc.patch('s4', [{ op: 'set', slotId: 'location', value: { name: 'Nairobi' }, provenance: 'resolved' }]);
    expect(out.slots.location.value).toEqual({ name: 'Nairobi' });
  });
});
