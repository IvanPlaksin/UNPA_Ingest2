import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * DOC-3 — attaching a document from the chat.
 *
 * Two things carry the design and are asserted directly: the multipart request
 * must NOT carry a hand-written Content-Type (a boundary the browser generates
 * is what makes it parseable), and "uploaded" must not be reported as "the
 * assistant can read it" — Altiora accepts .docx, which the model cannot open.
 */

vi.mock('../../../config/api.config', () => ({ API_BASE_URL: 'http://api.test' }));

let uploadFile; let linkAttachments; let linkStagedAttachments; let ChatError;

beforeEach(async () => {
  vi.resetModules();
  ({ uploadFile, linkAttachments, linkStagedAttachments, ChatError } = await import('../api/chat-client'));
});
afterEach(() => { vi.unstubAllGlobals(); });

/** fetch double that records the request it was given. */
function stubFetch(response) {
  const calls = [];
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (typeof response === 'function') return response(url, init);
    const { status = 200, body = {} } = response || {};
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
  impl.calls = calls;
  vi.stubGlobal('fetch', impl);
  return impl;
}

const mkFile = (name = 'passport.pdf', type = 'application/pdf') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('DOC-3: uploadFile', () => {
  test('POSTs multipart to the upload route with the session in the query', async () => {
    const f = stubFetch({ body: { attachmentId: 'att-1', fileName: 'passport.pdf', canExtract: true } });

    await uploadFile('sess-42', mkFile());

    expect(f.calls[0].url).toBe('http://api.test/flowdesk/chat/upload?sessionId=sess-42');
    expect(f.calls[0].init.method).toBe('POST');
    expect(f.calls[0].init.body).toBeInstanceOf(FormData);
    expect(f.calls[0].init.body.get('file')).toBeInstanceOf(File);
  });

  test('does NOT set Content-Type — the browser must supply the boundary', async () => {
    const f = stubFetch({ body: {} });
    await uploadFile('s1', mkFile());

    const headers = f.calls[0].init.headers || {};
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });

  test('escapes a session id that would otherwise break the query', async () => {
    const f = stubFetch({ body: {} });
    await uploadFile('a b&c=d', mkFile());
    expect(f.calls[0].url).toContain('sessionId=a%20b%26c%3Dd');
  });

  test('returns the record, canExtract included', async () => {
    stubFetch({ body: { attachmentId: 'att-1', fileName: 'a.pdf', size: 3, contentType: 'application/pdf', canExtract: true } });
    const out = await uploadFile('s1', mkFile());
    expect(out).toMatchObject({ attachmentId: 'att-1', canExtract: true });
  });

  test("a rejected file carries the server's own reason to the caller", async () => {
    // Altiora's verdict — written for whoever chose the file.
    stubFetch({ status: 400, body: { code: 'REJECTED_BY_ALTIORA', error: 'File content does not match its extension (Magic Number Mismatch).' } });

    await expect(uploadFile('s1', mkFile())).rejects.toMatchObject({
      name: 'ChatError',
      code: 'REJECTED_BY_ALTIORA',
      message: expect.stringContaining('Magic Number Mismatch'),
    });
  });

  test('an oversized file surfaces its own code, not a generic failure', async () => {
    stubFetch({ status: 413, body: { code: 'FILE_TOO_LARGE', error: 'File is too large. Maximum is 10 MB.' } });
    await expect(uploadFile('s1', mkFile())).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  test('a network failure is a NETWORK ChatError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(uploadFile('s1', mkFile())).rejects.toMatchObject({ code: 'NETWORK' });
  });

  test('a non-JSON error body still produces a typed error', async () => {
    stubFetch(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    await expect(uploadFile('s1', mkFile())).rejects.toBeInstanceOf(ChatError);
  });
});

describe('DOC-3: linkAttachments', () => {
  test('POSTs the ticket id as JSON, session in the query', async () => {
    const f = stubFetch({ body: { linked: 2, skipped: 0, failed: 0, details: [] } });

    const out = await linkAttachments('sess-42', 551);

    expect(f.calls[0].url).toBe('http://api.test/flowdesk/chat/attachments/link?sessionId=sess-42');
    expect(f.calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ ticketId: 551 });
    expect(out.linked).toBe(2);
  });

  test('a partial failure is a normal result, not an exception', async () => {
    // The request already exists; per-file detail is the news.
    stubFetch({ body: { linked: 1, failed: 1, skipped: 0, details: [{ fileName: 'bad.pdf', status: 'failed' }] } });

    const out = await linkAttachments('s1', 551);
    expect(out.failed).toBe(1);
  });

  test('a server failure is a typed error', async () => {
    stubFetch({ status: 500, body: { code: 'LINK_FAILED', error: 'nope' } });
    await expect(linkAttachments('s1', 551)).rejects.toMatchObject({ code: 'LINK_FAILED' });
  });
});

/**
 * The one a host actually calls.
 *
 * A hand-off is terminal: `onOpenForm` fires and the component immediately
 * resets to a new session with an empty attachment list. So by the time the
 * wizard has produced a ticket, the chat no longer knows which conversation
 * staged the files — only the hand-off payload does. These tests pin that the
 * conversation is read out of the payload and never assumed from live state.
 */
describe('DOC-3: linkStagedAttachments — the hand-off path', () => {
  const staged = [{
    attachmentId: 'att-1', fileName: 'itinerary.pdf', contentType: 'application/pdf',
    size: 100, stagedUnder: { kind: 'Chat', ownerId: 'sess-OLD' },
  }];

  test('links against the conversation named in the payload, not the live one', async () => {
    const f = stubFetch({ body: { linked: 1, skipped: 0, failed: 0, details: [] } });

    const out = await linkStagedAttachments({ sessionId: 'sess-OLD', stagedAttachments: staged }, 551);

    expect(f.calls[0].url).toContain('sessionId=sess-OLD');
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ ticketId: 551 });
    expect(out.linked).toBe(1);
  });

  test('falls back to the entry when an older payload carries no top-level sessionId', async () => {
    const f = stubFetch({ body: { linked: 1 } });
    await linkStagedAttachments({ stagedAttachments: staged }, 551);
    expect(f.calls[0].url).toContain('sessionId=sess-OLD');
  });

  test('does nothing — and sends nothing — when no document was attached', async () => {
    const f = stubFetch({ body: {} });

    expect(await linkStagedAttachments({ sessionId: 's1' }, 551)).toBeNull();
    expect(await linkStagedAttachments({ sessionId: 's1', stagedAttachments: [] }, 551)).toBeNull();
    expect(await linkStagedAttachments(null, 551)).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  test('a missing ticket id is a no-op rather than a bad request', async () => {
    const f = stubFetch({ body: {} });
    const payload = { sessionId: 's1', stagedAttachments: staged };

    expect(await linkStagedAttachments(payload, undefined)).toBeNull();
    expect(await linkStagedAttachments(payload, null)).toBeNull();
    expect(await linkStagedAttachments(payload, '')).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  test('ticket 0 is a value and does go out', async () => {
    const f = stubFetch({ body: { linked: 1 } });
    await linkStagedAttachments({ sessionId: 's1', stagedAttachments: staged }, 0);
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ ticketId: 0 });
  });
});
