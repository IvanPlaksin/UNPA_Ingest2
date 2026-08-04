'use strict';

/**
 * DOC-5 — linking staged documents onto the submitted ticket.
 *
 * The properties that matter here are about damage: linking twice must not put
 * the same document on a ticket twice, and one failing file must not cost the
 * others — this runs AFTER submit, when the user has already moved on and
 * nobody is watching to retry.
 */

const { linkSessionAttachments } = require('../attachment-link.service');

const PDF = { attachmentId: 'att-1', fileName: 'itinerary.pdf', contentType: 'application/pdf', size: 100, linkedTo: null };
const DOCX = { attachmentId: 'att-2', fileName: 'authorisation.docx', contentType: 'application/msword', size: 200, linkedTo: null };

function mkStore(rows = [PDF]) {
  const data = rows.map((r) => ({ ...r }));
  const marked = [];
  return {
    data,
    marked,
    getAttachments: async () => data.map((r) => ({ ...r })),
    markAsLinked: async (sessionId, id, kind, ownerId) => {
      marked.push({ sessionId, id, kind, ownerId });
      const i = data.findIndex((r) => r.attachmentId === id);
      if (i >= 0) data[i].linkedTo = { kind, ownerId: String(ownerId) };
      return data[i];
    },
  };
}

function mkClient(impl) {
  const calls = [];
  return {
    calls,
    linkAttachment: async (token, opts) => {
      calls.push({ token, opts });
      if (impl) return impl(token, opts);
      return { attachmentId: `copy-of-${opts.sourceAttachmentId}` };
    },
  };
}

const mkAudit = () => { const calls = []; const fn = async (e) => { calls.push(e); return e; }; fn.calls = calls; return fn; };

const WHO = { userId: 'u-1', userEmail: 'ivan@un.org', orgCode: 'ODSRSGFP' };

describe('DOC-5: linking', () => {
  test('copies every staged document onto the ticket', async () => {
    const store = mkStore([PDF, DOCX]);
    const client = mkClient();
    const audit = mkAudit();

    const out = await linkSessionAttachments('s1', 551, 'user-tok', WHO, { store, client, audit });

    expect(out).toMatchObject({ linked: 2, skipped: 0, failed: 0 });
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]).toEqual({
      token: 'user-tok',
      opts: { kind: 'Ticket', ownerId: '551', sourceAttachmentId: 'att-1' },
    });
  });

  test('records where each copy went, so the store stops calling them unlinked', async () => {
    const store = mkStore([PDF, DOCX]);
    await linkSessionAttachments('s1', 551, 'user-tok', WHO, { store, client: mkClient(), audit: mkAudit() });

    expect(store.marked).toEqual([
      { sessionId: 's1', id: 'att-1', kind: 'Ticket', ownerId: 551 },
      { sessionId: 's1', id: 'att-2', kind: 'Ticket', ownerId: 551 },
    ]);
  });

  test('reports the id of the copy Altiora made, which is NOT the staged id', async () => {
    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, {
      store: mkStore([PDF]), client: mkClient(), audit: mkAudit(),
    });

    expect(out.details[0]).toMatchObject({
      attachmentId: 'att-1',
      linkedAttachmentId: 'copy-of-att-1',
      status: 'linked',
    });
    expect(out.details[0].linkedAttachmentId).not.toBe(out.details[0].attachmentId);
  });

  test('accepts the PascalCase id Altiora may return', async () => {
    const client = mkClient(async () => ({ AttachmentId: 'copy-pascal' }));
    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, { store: mkStore([PDF]), client, audit: mkAudit() });
    expect(out.details[0].linkedAttachmentId).toBe('copy-pascal');
  });

  test('a document goes with the user\'s own bearer, never the service account', async () => {
    const client = mkClient();
    await linkSessionAttachments('s1', 551, 'ivan-bearer', WHO, { store: mkStore([PDF]), client, audit: mkAudit() });
    expect(client.calls[0].token).toBe('ivan-bearer');
  });

  test('a session with nothing attached is a no-op, not an error', async () => {
    const client = mkClient();
    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, { store: mkStore([]), client, audit: mkAudit() });

    expect(out).toEqual({ linked: 0, skipped: 0, failed: 0, details: [] });
    expect(client.calls).toHaveLength(0);
  });
});

describe('DOC-5: calling it twice must not attach the document twice', () => {
  test('an already-linked document is skipped, not linked again', async () => {
    const linkedAlready = { ...PDF, linkedTo: { kind: 'Ticket', ownerId: '551' } };
    const client = mkClient();

    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, {
      store: mkStore([linkedAlready, DOCX]), client, audit: mkAudit(),
    });

    expect(out).toMatchObject({ linked: 1, skipped: 1, failed: 0 });
    expect(client.calls.map((c) => c.opts.sourceAttachmentId)).toEqual(['att-2']);
    expect(out.details[0]).toMatchObject({ status: 'already_linked', linkedTo: { kind: 'Ticket', ownerId: '551' } });
  });

  test('running the whole thing twice links each document exactly once', async () => {
    // The caller is a browser reacting to submit: it can retry or double-fire.
    const store = mkStore([PDF, DOCX]);
    const client = mkClient();

    const first = await linkSessionAttachments('s1', 551, 'tok', WHO, { store, client, audit: mkAudit() });
    const second = await linkSessionAttachments('s1', 551, 'tok', WHO, { store, client, audit: mkAudit() });

    expect(first.linked).toBe(2);
    expect(second).toMatchObject({ linked: 0, skipped: 2, failed: 0 });
    expect(client.calls).toHaveLength(2);   // not four
  });
});

describe('DOC-5: one bad file does not cost the others', () => {
  test('a failure is reported per file and the rest still link', async () => {
    const client = mkClient(async (t, opts) => {
      if (opts.sourceAttachmentId === 'att-1') throw new Error('Source attachment not found.');
      return { attachmentId: 'copy-of-att-2' };
    });

    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, {
      store: mkStore([PDF, DOCX]), client, audit: mkAudit(),
    });

    expect(out).toMatchObject({ linked: 1, skipped: 0, failed: 1 });
    expect(out.details[0]).toMatchObject({ fileName: 'itinerary.pdf', status: 'failed' });
    expect(out.details[0].error).toMatch(/not found/);
    expect(out.details[1]).toMatchObject({ fileName: 'authorisation.docx', status: 'linked' });
  });

  test('a file that failed is NOT marked linked — a later retry can pick it up', async () => {
    const store = mkStore([PDF]);
    const client = mkClient(async () => { throw new Error('Altiora unreachable'); });

    await linkSessionAttachments('s1', 551, 'tok', WHO, { store, client, audit: mkAudit() });

    expect(store.marked).toHaveLength(0);
    expect(store.data[0].linkedTo).toBeNull();
  });

  test('after a failure, running again retries just that file', async () => {
    const store = mkStore([PDF, DOCX]);
    let firstPass = true;
    const client = mkClient(async (t, opts) => {
      if (firstPass && opts.sourceAttachmentId === 'att-1') throw new Error('flaky');
      return { attachmentId: `copy-of-${opts.sourceAttachmentId}` };
    });

    await linkSessionAttachments('s1', 551, 'tok', WHO, { store, client, audit: mkAudit() });
    firstPass = false;
    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, { store, client, audit: mkAudit() });

    expect(out).toMatchObject({ linked: 1, skipped: 1, failed: 0 });
  });
});

describe('DOC-5: audit', () => {
  test('each linked document is recorded against the ticket and the acting user', async () => {
    const audit = mkAudit();
    await linkSessionAttachments('s1', 551, 'tok', WHO, { store: mkStore([PDF]), client: mkClient(), audit });

    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      sessionId: 's1',
      userId: 'u-1',
      userEmail: 'ivan@un.org',
      orgCode: 'ODSRSGFP',
      actionType: 'ATTACH_FILE',
      status: 'EXECUTED',
      targetId: '551',
      ticketId: '551',
    });
    expect(audit.calls[0].motivation).toBeTruthy();
    expect(audit.calls[0].actionParams).toMatchObject({ fileName: 'itinerary.pdf', sourceAttachmentId: 'att-1' });
  });

  test('a failed link is audited too, with the reason', async () => {
    const audit = mkAudit();
    const client = mkClient(async () => { throw new Error('Source attachment not found.'); });

    await linkSessionAttachments('s1', 551, 'tok', WHO, { store: mkStore([PDF]), client, audit });

    expect(audit.calls[0]).toMatchObject({ status: 'FAILED', actionType: 'ATTACH_FILE' });
    expect(audit.calls[0].error).toMatch(/not found/);
  });

  test('a skipped document is not audited again — it was audited when it was linked', async () => {
    const audit = mkAudit();
    const linkedAlready = { ...PDF, linkedTo: { kind: 'Ticket', ownerId: '551' } };

    await linkSessionAttachments('s1', 551, 'tok', WHO, { store: mkStore([linkedAlready]), client: mkClient(), audit });

    expect(audit.calls).toHaveLength(0);
  });

  test('an audit outage never costs the attachment', async () => {
    const audit = async () => { throw new Error('memgraph down'); };
    const out = await linkSessionAttachments('s1', 551, 'tok', WHO, {
      store: mkStore([PDF]), client: mkClient(), audit,
    });
    expect(out.linked).toBe(1);
  });
});

describe('DOC-5: arguments', () => {
  const ok = { store: mkStore([]), client: mkClient(), audit: mkAudit() };

  test.each([
    ['sessionId', [null, 551, 'tok'], /sessionId is required/],
    ['ticketId', ['s1', null, 'tok'], /ticketId is required/],
    ['ticketId (empty string)', ['s1', '', 'tok'], /ticketId is required/],
    ['acting user', ['s1', 551, null], /acting user is required/],
  ])('refuses a call with no %s', async (_name, args, pattern) => {
    await expect(linkSessionAttachments(...args, WHO, ok)).rejects.toThrow(pattern);
  });

  test('ticket 0 is a value, not a missing argument', async () => {
    // `!ticketId` would treat 0 as absent; ids are Altiora's, not ours to judge.
    const client = mkClient();
    await linkSessionAttachments('s1', 0, 'tok', WHO, { store: mkStore([PDF]), client, audit: mkAudit() });
    expect(client.calls[0].opts.ownerId).toBe('0');
  });
});
