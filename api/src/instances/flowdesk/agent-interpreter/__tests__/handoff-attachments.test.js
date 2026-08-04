'use strict';

/**
 * DOC-4-001 / DOC-4-002 — the attached documents travel with the hand-off.
 *
 * Last link in the chain: upload → staged in Altiora → indexed → published with
 * the hand-off so they can be linked onto the ticket once it exists.
 *
 * Three properties are load-bearing and asserted directly: the list stays OUT of
 * `prefill.attachments` (that key breaks ticket creation — see the regression
 * test below), `draftToInitialFormData` stays pure, and a document the MODEL
 * could not read still travels.
 */

const { createAgentTools } = require('../agent-tools');
const { draftToInitialFormData } = require('../../interpreter/form-handoff');
const { pickTurnPayload } = require('../../interpreter/turn-contract');

const SNAPSHOT = {
  serviceId: 'svc-travel',
  version: 3,
  metadata: { altioraOusId: 59, title: 'Travel request', fieldIdMapping: { purpose: 'f_purpose' } },
  slots: [{ slotId: 'purpose', type: 'text', promptHint: 'Purpose', altioraFieldId: 'f_purpose' }],
};

const PDF = {
  attachmentId: 'att-1', fileName: 'itinerary.pdf', contentType: 'application/pdf',
  size: 1000, canExtract: true, extractionStatus: 'done',
};
const DOCX = {
  attachmentId: 'att-2', fileName: 'authorisation.docx',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 2000, canExtract: false, extractionStatus: 'skipped',
};

function mkTools({ attachments = [], draft = { sessionId: 's1', serviceId: 'svc-travel', slots: { purpose: { value: 'Conference' } } }, getAttachments } = {}) {
  return createAgentTools({
    draftService: { get: async () => draft },
    loadSnapshot: async () => SNAPSHOT,
    attachmentsStore: {
      getAttachments: getAttachments || (async () => attachments),
      getExtractable: async () => attachments.filter((a) => a.canExtract),
      STATUS: { DONE: 'done', FAILED: 'failed' },
    },
    fetchLovValues: async () => [],
  });
}

const CTX = () => ({ sessionId: 's1', session: {}, userId: 'u1', lang: 'en' });

describe('DOC-4-001: attachments travel with the hand-off', () => {
  test('a staged document is published beside the prefill, with where it is staged', async () => {
    const tools = mkTools({ attachments: [PDF] });
    const ctx = CTX();

    const out = await tools.execute('open_form', {}, ctx);

    expect(out.ok).toBe(true);
    expect(ctx.session.openForm.stagedAttachments).toEqual([{
      attachmentId: 'att-1',
      fileName: 'itinerary.pdf',
      contentType: 'application/pdf',
      size: 1000,
      stagedUnder: { kind: 'Chat', ownerId: 's1' },
    }]);
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * `initialFormData.attachments` is the key the wizard reads, so it looks like
   * the right home — and it breaks submit. createTicket passes any entry with no
   * `fileObj` straight into the create DTO, the controller INSERTs it with our
   * AttachmentId, and AttachmentId is the table's PRIMARY KEY: the row already
   * exists (it is the staged one), so the insert violates the key and the ticket
   * is never created. Putting the list there does not attach the files, it stops
   * the user submitting at all.
   */
  test('attachments NEVER reach prefill.attachments — that key breaks ticket creation', async () => {
    const tools = mkTools({ attachments: [PDF, DOCX] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    expect(ctx.session.openForm.prefill).not.toHaveProperty('attachments');
    expect(JSON.stringify(ctx.session.openForm.prefill)).not.toContain('att-1');
  });

  test('A DOCUMENT THE MODEL COULD NOT READ STILL GOES', async () => {
    // `skipped` means extraction cannot open it, NOT that the user did not mean
    // to attach it. A signed .docx authorisation is the commonest such file, and
    // dropping it would lose the very thing the request needs.
    const tools = mkTools({ attachments: [PDF, DOCX] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    expect(ctx.session.openForm.stagedAttachments.map((a) => a.fileName))
      .toEqual(['itinerary.pdf', 'authorisation.docx']);
  });

  /**
   * THE HAND-OFF MUST BE SELF-SUFFICIENT.
   *
   * A hand-off is terminal: the host opens the wizard and the component resets
   * to a NEW session with an empty attachment list. So when the ticket finally
   * exists, the chat no longer knows which conversation the staged files belong
   * to — only this payload does. Without the sessionId here nothing can ever
   * link them, and the files stay staged until the cleanup retires them.
   */
  test('carries the sessionId, so whoever submits the form can link the files', async () => {
    const tools = mkTools({ attachments: [PDF] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    expect(ctx.session.openForm.sessionId).toBe('s1');
  });

  test('carries the sessionId even with nothing attached', async () => {
    const tools = mkTools({ attachments: [] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    expect(ctx.session.openForm.sessionId).toBe('s1');
    expect(ctx.session.openForm).not.toHaveProperty('stagedAttachments');
  });

  test('each entry says where it is staged — that is what a link call needs', async () => {
    const tools = mkTools({ attachments: [PDF, DOCX] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    for (const a of ctx.session.openForm.stagedAttachments) {
      expect(a.stagedUnder).toEqual({ kind: 'Chat', ownerId: 's1' });
      expect(a.attachmentId).toBeTruthy();
    }
  });

  test('with nothing attached there is no stagedAttachments key at all', async () => {
    const tools = mkTools({ attachments: [] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    expect(ctx.session.openForm).not.toHaveProperty('stagedAttachments');
  });

  test('the collected field values are untouched by any of this', async () => {
    const tools = mkTools({ attachments: [PDF] });
    const ctx = CTX();

    await tools.execute('open_form', {}, ctx);

    expect(ctx.session.openForm.prefill).toEqual(draftToInitialFormData(
      { sessionId: 's1', serviceId: 'svc-travel', slots: { purpose: { value: 'Conference' } } },
      SNAPSHOT,
    ));
  });

  test('a store failure costs the attachment list, never the hand-off', async () => {
    const tools = mkTools({ getAttachments: async () => { throw new Error('redis down'); } });
    const ctx = CTX();

    const out = await tools.execute('open_form', {}, ctx);

    expect(out.ok).toBe(true);
    expect(ctx.session.openForm.prefill.dynamicData).toEqual({ f_purpose: 'Conference' });
    expect(ctx.session.openForm).not.toHaveProperty('stagedAttachments');
  });

  test('the hand-off still ends the conversation, and now mentions the documents', async () => {
    const tools = mkTools({ attachments: [PDF] });
    const out = await tools.execute('open_form', {}, CTX());

    expect(out.tellUser).toMatch(/documents they attached stay with the request/i);
    expect(out.tellUser).toMatch(/ENDS the conversation/);
  });

  test('with no documents the wording does not mention any', async () => {
    const tools = mkTools({ attachments: [] });
    const out = await tools.execute('open_form', {}, CTX());
    expect(out.tellUser).not.toMatch(/documents/i);
  });
});

describe('DOC-4-001: draftToInitialFormData stays pure', () => {
  test('it is synchronous and knows nothing about attachments or sessions', () => {
    const out = draftToInitialFormData(
      { sessionId: 's1', serviceId: 'svc-travel', slots: { purpose: { value: 'Conference' } } },
      SNAPSHOT,
    );

    expect(out).not.toBeInstanceOf(Promise);
    expect(out).not.toHaveProperty('attachments');
    expect(draftToInitialFormData.length).toBe(2);   // (draft, snapshot) — no sessionId
  });

  test('called twice with the same input it returns the same thing', () => {
    const draft = { sessionId: 's1', serviceId: 'svc-travel', slots: { purpose: { value: 'Conference' } } };
    expect(draftToInitialFormData(draft, SNAPSHOT)).toEqual(draftToInitialFormData(draft, SNAPSHOT));
  });
});

describe('DOC-4-002: the turn contract does not strip the attachments', () => {
  test('openForm reaches the client whole, stagedAttachments included', () => {
    const openForm = {
      serviceId: 'svc-travel',
      ousId: 59,
      prefill: { dynamicData: { f_purpose: 'Conference' } },
      stagedAttachments: [{ attachmentId: 'att-1', stagedUnder: { kind: 'Chat', ownerId: 's1' } }],
    };

    const payload = pickTurnPayload({ response: 'Opening the form.', controls: null, openForm });

    expect(payload.openForm.stagedAttachments)
      .toEqual([{ attachmentId: 'att-1', stagedUnder: { kind: 'Chat', ownerId: 's1' } }]);
  });

  test('the contract copies openForm rather than rebuilding it — a new key needs no change here', () => {
    const openForm = { prefill: {}, somethingAddedLater: 42 };
    const payload = pickTurnPayload({ openForm });
    expect(payload.openForm.somethingAddedLater).toBe(42);
  });

  test('an absent hand-off is still omitted, not sent as null', () => {
    const payload = pickTurnPayload({ response: 'Hello.', controls: null });
    expect(payload).not.toHaveProperty('openForm');
  });
});
