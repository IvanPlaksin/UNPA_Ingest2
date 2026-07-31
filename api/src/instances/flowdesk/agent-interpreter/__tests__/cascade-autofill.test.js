'use strict';

/**
 * SCH-002 — the dictionary fields the Altiora form fills for itself.
 *
 * `payeeName` is required, sits in the schema, and was never asked in chat. That
 * part is correct: Altiora's own form resolves it from the BP/Index number
 * (`DynamicForm` DICT_AUTOFILL_FIELD_TYPES, `maxResults: 1`), so interrogating the
 * user for a fact the HR system already holds would be wrong.
 *
 * What was wrong is that nobody resolved it either. The resolver has existed since
 * P1-12 and was wired only into the state machine; the agent interpreter that
 * replaced it never called it — the same loss as the hybrid, in a different place.
 * The field was neither asked, nor resolved, nor sent.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');

const DICT = {
  entityId: 'intg:payees',
  displayFieldIds: ['intg:name'],
  filters: [{ fieldId: 'intg:bp', operator: 'eq', slotId: 'bpOrIndex' }],
};

const SNAPSHOT = {
  serviceId: 'EO-FIN-PAY-INQ',
  version: 1,
  phases: ['detail'],
  metadata: { title: 'Payment Inquiry', approvalRequired: false, altioraOusId: 4, fieldIdMapping: { bpOrIndex: 'f_bp', payeeName: 'f_payee', amount: 'f_amount' } },
  slots: [
    { slotId: 'bpOrIndex', type: 'string', required: true, phase: 'detail', promptHint: 'BP or Index #', altioraFieldId: 'f_bp' },
    { slotId: 'payeeName', type: 'string', required: true, phase: 'detail', promptHint: 'Payee Name', altioraFieldId: 'f_payee', dependsOn: ['bpOrIndex'], dictRef: DICT },
    { slotId: 'amount', type: 'number', required: true, phase: 'detail', promptHint: 'Amount', altioraFieldId: 'f_amount' },
  ],
};

/** A draft service backed by a plain object, patched the way the real one is. */
function fakeDraft(initial = {}) {
  const draft = { sessionId: 's1', serviceId: 'EO-FIN-PAY-INQ', slots: { ...initial }, status: 'DRAFT' };
  return {
    draft,
    service: {
      get: async () => JSON.parse(JSON.stringify(draft)),
      create: async () => JSON.parse(JSON.stringify(draft)),
      patch: async (_s, patches) => {
        for (const p of patches) draft.slots[p.slotId] = { value: p.value, pending: !!p.pending, provenance: p.provenance };
        return JSON.parse(JSON.stringify(draft));
      },
      discard: async () => true,
    },
  };
}

const ctx = () => ({ sessionId: 's1', session: createToolSession(), lang: 'en' });

const mk = (rows, initial) => {
  const d = fakeDraft(initial);
  const calls = [];
  const tools = createAgentTools({
    draftService: d.service,
    loadSnapshot: async () => SNAPSHOT,
    fetchLovValues: async (req) => { calls.push(req); return rows; },
    resolveSearch: async () => [],
  });
  return { tools, draft: d.draft, calls };
};

describe('a value that keys a dictionary resolves the fields that follow from it', () => {
  test('one match is written into the draft without asking', async () => {
    const { tools, draft } = mk([{ label: 'ACME Ltd', value: 'ACME Ltd' }]);
    await tools.TOOLS.draft_update({ fields: { bpOrIndex: '12345678' } }, ctx());
    expect(draft.slots.payeeName).toMatchObject({ value: 'ACME Ltd', provenance: 'resolved' });
  });

  test('the model is told what the dictionary answered, so it can say so', async () => {
    // Otherwise the assistant carries a value the user never saw.
    const { tools } = mk([{ label: 'ACME Ltd', value: 'ACME Ltd' }]);
    const out = await tools.TOOLS.draft_update({ fields: { bpOrIndex: '12345678' } }, ctx());
    expect(out.resolvedFromDictionary).toEqual([
      expect.objectContaining({ slotId: 'payeeName', display: 'ACME Ltd' }),
    ]);
  });

  test('the lookup is filtered by the value that keys it', async () => {
    const { tools, calls } = mk([{ label: 'ACME Ltd', value: 'ACME Ltd' }]);
    await tools.TOOLS.draft_update({ fields: { bpOrIndex: '12345678' } }, ctx());
    expect(JSON.stringify(calls[0])).toContain('12345678');
  });

  test('several matches are a QUESTION, not a silent choice of the first', async () => {
    // Altiora takes row 0. We do not: our value travels as `autofill`, which
    // suppresses the form's own resolution, so a row picked silently here is final
    // and there is no screen left on which to correct it.
    const { tools, draft } = mk([
      { label: 'ACME Ltd', value: 'ACME Ltd' },
      { label: 'ACME Holdings', value: 'ACME Holdings' },
    ]);
    const out = await tools.TOOLS.draft_update({ fields: { bpOrIndex: '12345678' } }, ctx());
    expect(draft.slots.payeeName).toBeUndefined();
    expect(out.needsChoice[0]).toMatchObject({ slotId: 'payeeName' });
    expect(out.needsChoice[0].options).toHaveLength(2);
    expect(out.tellUser).toMatch(/do not choose for them/);
  });

  test('no match leaves the field to the form rather than inventing one', async () => {
    const { tools, draft } = mk([]);
    const out = await tools.TOOLS.draft_update({ fields: { bpOrIndex: '000' } }, ctx());
    expect(draft.slots.payeeName).toBeUndefined();
    expect(out.resolvedFromDictionary).toBeUndefined();
  });

  test('a dictionary that is down does not take the turn down with it', async () => {
    const d = fakeDraft();
    const tools = createAgentTools({
      draftService: d.service,
      loadSnapshot: async () => SNAPSHOT,
      fetchLovValues: async () => { throw new Error('Altiora unreachable'); },
      resolveSearch: async () => [],
    });
    const out = await tools.TOOLS.draft_update({ fields: { bpOrIndex: '12345678' } }, ctx());
    expect(out.ok).toBe(true);
    expect(d.draft.slots.bpOrIndex.value).toBe('12345678');
  });

  test('nothing is resolved while the key is still empty', async () => {
    const { tools, calls, draft } = mk([{ label: 'ACME Ltd', value: 'ACME Ltd' }]);
    await tools.TOOLS.draft_update({ fields: { amount: 100 } }, ctx());
    expect(calls).toHaveLength(0);
    expect(draft.slots.payeeName).toBeUndefined();
  });
});

describe('the hand-off carries the dictionary work with it', () => {
  test('a resolved value rides as `autofill`, which stops the form re-resolving it', async () => {
    // Before SCH-002 this path sent prefill alone: the wizard re-derived every
    // cascade from scratch, and a value we had resolved could not reach it at all.
    const { tools } = mk([{ label: 'ACME Ltd', value: 'ACME Ltd' }]);
    const c = ctx();
    await tools.TOOLS.draft_update({ fields: { bpOrIndex: '12345678' } }, c);
    await tools.TOOLS.open_form({}, c);
    expect(c.session.openForm.dictionary.autofill).toEqual({ f_payee: 'ACME Ltd' });
  });

  test('the hand-off still happens when the dictionary cannot be reached', async () => {
    const d = fakeDraft({ bpOrIndex: { value: '1' } });
    const tools = createAgentTools({
      draftService: d.service,
      loadSnapshot: async () => SNAPSHOT,
      fetchLovValues: async () => { throw new Error('down'); },
      resolveSearch: async () => [],
    });
    const c = ctx();
    const out = await tools.TOOLS.open_form({}, c);
    expect(out.ok).toBe(true);
    expect(c.session.openForm.serviceId).toBe('EO-FIN-PAY-INQ');
  });
});
