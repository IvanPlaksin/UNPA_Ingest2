'use strict';

/**
 * DOC-1-004 — the chat-session attachment index.
 *
 * Two things carry the design and are asserted hardest: the TTL is refreshed on
 * every write (an active conversation must not lose its files), and
 * `canExtract` is derived from OUR supported types rather than trusted from the
 * caller (Altiora accepts files the model cannot read).
 */

const { createChatAttachmentsStore, STATUS, KEY } = require('../chat-attachments.store');

/** Redis double: records every set so TTL and key use can be asserted. */
function makeStore() {
  const data = new Map();
  const sets = [];
  return {
    data,
    sets,
    get: async (k) => (data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : null),
    set: async (k, v, ttl) => { sets.push({ k, v, ttl }); data.set(k, v); },
  };
}

const SESSION = 'sess-42';
const PDF = { attachmentId: 'att-1', fileName: 'passport.pdf', contentType: 'application/pdf', size: 245678 };
const DOCX = {
  attachmentId: 'att-2',
  fileName: 'form.docx',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 12000,
};

const mk = (store, now = () => 1_700_000_000_000) => createChatAttachmentsStore({ store, now });

describe('DOC-1-004: addAttachment', () => {
  test('stores a reference under the session key, not the file itself', async () => {
    const store = makeStore();
    const s = mk(store);

    const rec = await s.addAttachment(SESSION, PDF);

    expect(store.sets[0].k).toBe('chat:attachments:sess-42');
    expect(KEY(SESSION)).toBe('chat:attachments:sess-42');
    expect(rec).toMatchObject({
      attachmentId: 'att-1',
      fileName: 'passport.pdf',
      contentType: 'application/pdf',
      size: 245678,
      canExtract: true,
      extractionStatus: STATUS.PENDING,
      extractedData: null,
      linkedTo: null,
    });
    expect(rec).not.toHaveProperty('data');       // never the bytes
  });

  test('derives canExtract from OUR types — a .docx Altiora accepted is not extractable', async () => {
    const store = makeStore();
    const s = mk(store);

    const pdf = await s.addAttachment(SESSION, PDF);
    const docx = await s.addAttachment(SESSION, DOCX);

    expect(pdf.canExtract).toBe(true);
    expect(docx.canExtract).toBe(false);
  });

  test('ignores a caller-supplied canExtract — it cannot be talked into a lie', async () => {
    const store = makeStore();
    const s = mk(store);
    const rec = await s.addAttachment(SESSION, { ...DOCX, canExtract: true });
    expect(rec.canExtract).toBe(false);
  });

  test('an unreadable file is SKIPPED, not PENDING — it never joins a work queue', async () => {
    const store = makeStore();
    const s = mk(store);
    expect((await s.addAttachment(SESSION, DOCX)).extractionStatus).toBe(STATUS.SKIPPED);
    expect((await s.addAttachment(SESSION, PDF)).extractionStatus).toBe(STATUS.PENDING);
  });

  test('appends, preserving upload order', async () => {
    const store = makeStore();
    const s = mk(store);
    await s.addAttachment(SESSION, PDF);
    await s.addAttachment(SESSION, DOCX);

    expect((await s.getAttachments(SESSION)).map((a) => a.attachmentId)).toEqual(['att-1', 'att-2']);
  });

  test('re-adding the same id UPDATES — repeated bookkeeping cannot duplicate a row', async () => {
    const store = makeStore();
    const s = mk(store);
    await s.addAttachment(SESSION, PDF);
    await s.addAttachment(SESSION, { ...PDF, fileName: 'passport-scan.pdf' });

    const list = await s.getAttachments(SESSION);
    expect(list).toHaveLength(1);
    expect(list[0].fileName).toBe('passport-scan.pdf');
  });

  test('stamps uploadedAt from the clock, and honours an explicit one', async () => {
    const store = makeStore();
    const s = mk(store, () => 1234);
    expect((await s.addAttachment(SESSION, PDF)).uploadedAt).toBe(1234);
    expect((await s.addAttachment(SESSION, { ...DOCX, uploadedAt: 999 })).uploadedAt).toBe(999);
  });

  test('refuses a record with no session or no attachment id', async () => {
    const store = makeStore();
    const s = mk(store);
    await expect(s.addAttachment(null, PDF)).rejects.toThrow(/sessionId is required/);
    await expect(s.addAttachment(SESSION, { fileName: 'x.pdf' })).rejects.toThrow(/attachmentId is required/);
    expect(store.sets).toHaveLength(0);
  });

  test('fills in sane defaults for a sparse record', async () => {
    const store = makeStore();
    const s = mk(store);
    const rec = await s.addAttachment(SESSION, { attachmentId: 'att-9' });
    expect(rec.fileName).toBe('document');
    expect(rec.contentType).toBe('application/octet-stream');
    expect(rec.size).toBe(0);
    expect(rec.canExtract).toBe(false);
  });
});

describe('DOC-1-004: TTL', () => {
  test('every write refreshes it — a long conversation does not lose its files', async () => {
    const store = makeStore();
    const s = mk(store);

    await s.addAttachment(SESSION, PDF);
    await s.updateAttachment(SESSION, 'att-1', { extractionStatus: STATUS.DONE });
    await s.markAsLinked(SESSION, 'att-1', 'Ticket', 551);

    const writes = store.sets.filter((x) => x.k === KEY(SESSION));
    expect(writes).toHaveLength(3);
    for (const w of writes) expect(w.ttl).toBe(24 * 60 * 60);
  });

  test('matches the draft TTL, so files and draft expire together', async () => {
    const s = mk(makeStore());
    const { TTL_SECONDS: draftTtl } = require('../draft-sr.service');
    expect(s.TTL_SECONDS).toBe(draftTtl);
  });
});

describe('DOC-1-004: reads', () => {
  test('an untouched session has no attachments, and that is not an error', async () => {
    const s = mk(makeStore());
    expect(await s.getAttachments('nobody')).toEqual([]);
    expect(await s.getExtractable('nobody')).toEqual([]);
    expect(await s.getAttachment('nobody', 'att-1')).toBeNull();
  });

  test('getExtractable filters out what the model cannot read', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);
    await s.addAttachment(SESSION, DOCX);

    const ids = (await s.getExtractable(SESSION)).map((a) => a.attachmentId);
    expect(ids).toEqual(['att-1']);
  });

  test('a corrupt or non-array value reads as empty rather than throwing', async () => {
    const store = makeStore();
    store.data.set(KEY(SESSION), 'garbage');
    expect(await mk(store).getAttachments(SESSION)).toEqual([]);
  });
});

describe('DOC-1-004: updateAttachment', () => {
  test('merges the update and leaves the rest alone', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);

    const out = await s.updateAttachment(SESSION, 'att-1', {
      extractionStatus: STATUS.DONE,
      extractedData: { beneficiary: 'I. Plaksin' },
    });

    expect(out.extractionStatus).toBe(STATUS.DONE);
    expect(out.extractedData).toEqual({ beneficiary: 'I. Plaksin' });
    expect(out.fileName).toBe('passport.pdf');
    expect(out.canExtract).toBe(true);
  });

  test('cannot rewrite the identity of a record', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);
    const out = await s.updateAttachment(SESSION, 'att-1', { attachmentId: 'hijacked' });
    expect(out.attachmentId).toBe('att-1');
    expect(await s.getAttachment(SESSION, 'hijacked')).toBeNull();
  });

  test('an unknown id returns null and writes nothing', async () => {
    const store = makeStore();
    const s = mk(store);
    await s.addAttachment(SESSION, PDF);
    const before = store.sets.length;

    expect(await s.updateAttachment(SESSION, 'nope', { extractionStatus: STATUS.DONE })).toBeNull();
    expect(store.sets).toHaveLength(before);
  });

  test('records a failed extraction without losing the file', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);
    const out = await s.updateAttachment(SESSION, 'att-1', {
      extractionStatus: STATUS.FAILED,
      extractionError: 'document exceeds the page limit for this model',
    });
    expect(out.extractionStatus).toBe(STATUS.FAILED);
    expect(out.extractionError).toMatch(/page limit/);
    expect(await s.getAttachment(SESSION, 'att-1')).not.toBeNull();
  });
});

describe('DOC-1-004: linking — Altiora copies rather than moves', () => {
  test('markAsLinked records where the copy went and when', async () => {
    const s = mk(makeStore(), () => 5555);
    await s.addAttachment(SESSION, PDF);

    const out = await s.markAsLinked(SESSION, 'att-1', 'Ticket', 551);
    expect(out.linkedTo).toEqual({ kind: 'Ticket', ownerId: '551', linkedAt: 5555 });
  });

  test('getUnlinkedAttachments is the cleanup work-list', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);
    await s.addAttachment(SESSION, DOCX);

    expect((await s.getUnlinkedAttachments(SESSION)).map((a) => a.attachmentId)).toEqual(['att-1', 'att-2']);

    await s.markAsLinked(SESSION, 'att-1', 'Ticket', 551);
    expect((await s.getUnlinkedAttachments(SESSION)).map((a) => a.attachmentId)).toEqual(['att-2']);
  });

  test('a linked file stays in the index — the staged copy still exists in Altiora', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);
    await s.markAsLinked(SESSION, 'att-1', 'Ticket', 551);
    expect(await s.getAttachments(SESSION)).toHaveLength(1);
  });
});

describe('DOC-1-004: removal', () => {
  test('removeAttachment drops one and reports whether it did', async () => {
    const s = mk(makeStore());
    await s.addAttachment(SESSION, PDF);
    await s.addAttachment(SESSION, DOCX);

    expect(await s.removeAttachment(SESSION, 'att-1')).toBe(true);
    expect((await s.getAttachments(SESSION)).map((a) => a.attachmentId)).toEqual(['att-2']);
    expect(await s.removeAttachment(SESSION, 'att-1')).toBe(false);
  });

  test('clearAttachments drops the index only — Altiora keeps the bytes', async () => {
    const store = makeStore();
    const s = mk(store);
    await s.addAttachment(SESSION, PDF);

    await s.clearAttachments(SESSION);

    const last = store.sets[store.sets.length - 1];
    expect(last.k).toBe(KEY(SESSION));
    expect(last.v).toBeNull();
    expect(last.ttl).toBe(1);          // expire, matching how the draft is discarded
    expect(await s.getAttachments(SESSION)).toEqual([]);
  });
});

describe('DOC-1-004: sessions are isolated', () => {
  test("one conversation cannot see another's files", async () => {
    const s = mk(makeStore());
    await s.addAttachment('sess-a', PDF);
    await s.addAttachment('sess-b', DOCX);

    expect((await s.getAttachments('sess-a')).map((a) => a.attachmentId)).toEqual(['att-1']);
    expect((await s.getAttachments('sess-b')).map((a) => a.attachmentId)).toEqual(['att-2']);
  });
});
