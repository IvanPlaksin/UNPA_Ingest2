'use strict';

/**
 * DOC-1-003 — AltioraClient attachments.
 *
 * What is worth asserting here is the REQUEST, not the reply. Every failure
 * mode in this file is silent in production:
 *
 *   - a hand-written multipart Content-Type loses the boundary, and the server
 *     rejects a request that looks correct;
 *   - a binary download read as text returns a corrupted PDF, not an error;
 *   - a retried upload creates a second attachment on the user's ticket;
 *   - the wrong `kind` files the document under the wrong owner type.
 */

const {
  createAltioraClient,
  AltioraValidationError,
  AltioraNotFoundError,
  AltioraUnavailableError,
} = require('../altiora-client');

const BASE = 'http://localhost:5000';
const KEY = 'test-api-key';

/** fetch double that records calls; queue entries may be objects or functions. */
function makeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === 'function') return next();
    const { status = 200, body = null, bytes = null } = next;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === null ? '' : JSON.stringify(body)),
      json: async () => body,
      arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)),
    };
  };
  impl.calls = calls;
  return impl;
}

const mkClient = (fetchImpl) => createAltioraClient({
  baseUrl: BASE, apiKey: KEY, fetchImpl, tokenProvider: async () => 'service-tok',
});

const PDF = Buffer.from('%PDF-1.7 hello');

describe('DOC-1-003: uploadAttachment', () => {
  test('POSTs multipart to /api/Attachments/{kind}/{ownerId}', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: { attachmentId: 'att-1' } }]);
    const client = mkClient(fetchImpl);

    const out = await client.uploadAttachment('user-tok', {
      kind: 'Chat', ownerId: 'sess-42', file: PDF,
      fileName: 'contract.pdf', contentType: 'application/pdf',
    });

    const { url, init } = fetchImpl.calls[0];
    expect(init.method).toBe('POST');
    // Chat = 6: the route takes the numeric enum, not the name.
    expect(url).toBe('http://localhost:5000/api/Attachments/6/sess-42');
    expect(out).toEqual({ attachmentId: 'att-1' });
  });

  test('does NOT set Content-Type — fetch must derive the multipart boundary', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);

    await client.uploadAttachment('user-tok', {
      kind: 'Chat', ownerId: 's1', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf',
    });

    const { init } = fetchImpl.calls[0];
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.body).toBeInstanceOf(FormData);
  });

  test('carries the file and its name in the form, under the DTO field names', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);

    await client.uploadAttachment('user-tok', {
      kind: 'Chat', ownerId: 's1', file: PDF,
      fileName: 'contract.pdf', contentType: 'application/pdf', notes: 'from assistant',
    });

    const form = fetchImpl.calls[0].init.body;
    const filePart = form.get('File');
    expect(filePart).toBeInstanceOf(Blob);
    expect(filePart.type).toBe('application/pdf');
    expect(filePart.size).toBe(PDF.length);
    expect(form.get('Notes')).toBe('from assistant');
  });

  test('omits Notes when there are none', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    await client.uploadAttachment('t', { kind: 'Chat', ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf' });
    expect(fetchImpl.calls[0].init.body.has('Notes')).toBe(false);
  });

  test('tag rides as a query param — that is how a file binds to a form field', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);

    await client.uploadAttachment('t', {
      kind: 'Ticket', ownerId: '551', file: PDF, fileName: 'a.pdf',
      contentType: 'application/pdf', tag: 'passportScan',
    });

    expect(fetchImpl.calls[0].url).toBe('http://localhost:5000/api/Attachments/1/551?tag=passportScan');
  });

  test('sends the acting user bearer, not the service token', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    await client.uploadAttachment('acting-user-tok', {
      kind: 'Chat', ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf',
    });
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe('Bearer acting-user-tok');
    expect(fetchImpl.calls[0].init.headers['API-Key']).toBe(KEY);
  });

  test('accepts a numeric kind as well as a name', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    await client.uploadAttachment('t', { kind: 6, ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf' });
    expect(fetchImpl.calls[0].url).toContain('/api/Attachments/6/s');
  });

  test('an unknown kind is refused before any request', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    expect(() => client.uploadAttachment('t', {
      kind: 'Invoice', ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf',
    })).toThrow(/unknown attachment kind/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test('refuses a non-Buffer file, a missing name and a missing owner', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    const ok = { kind: 'Chat', ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf' };

    expect(() => client.uploadAttachment('t', { ...ok, file: 'not a buffer' })).toThrow(/must be a Buffer/);
    expect(() => client.uploadAttachment('t', { ...ok, fileName: undefined })).toThrow(/fileName is required/);
    expect(() => client.uploadAttachment('t', { ...ok, ownerId: undefined })).toThrow(/ownerId is required/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("Altiora's rejection surfaces as a typed validation error with its reason", async () => {
    // What the magic-number check actually returns.
    const fetchImpl = makeFetch([{
      status: 400,
      body: { message: 'File content does not match its extension (Magic Number Mismatch).' },
    }]);
    const client = mkClient(fetchImpl);

    await expect(client.uploadAttachment('t', {
      kind: 'Chat', ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf',
    })).rejects.toThrow(/Magic Number Mismatch/);
  });

  test('IS NOT RETRIED — a replay would create a duplicate attachment', async () => {
    // The handler mints a fresh Guid per call, so a retry does not overwrite.
    let n = 0;
    const fetchImpl = makeFetch([() => { n += 1; throw new Error('ECONNRESET'); }]);
    const client = mkClient(fetchImpl);

    await expect(client.uploadAttachment('t', {
      kind: 'Chat', ownerId: 's', file: PDF, fileName: 'a.pdf', contentType: 'application/pdf',
    })).rejects.toBeInstanceOf(AltioraUnavailableError);

    expect(n).toBe(1);
  });
});

describe('DOC-1-003: linkAttachment', () => {
  test('POSTs to the link route with target kind, owner and source id', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: { attachmentId: 'copy-1' } }]);
    const client = mkClient(fetchImpl);

    const out = await client.linkAttachment('user-tok', {
      kind: 'Ticket', ownerId: '551', sourceAttachmentId: 'att-abc',
    });

    const { url, init } = fetchImpl.calls[0];
    expect(init.method).toBe('POST');
    expect(url).toBe('http://localhost:5000/api/Attachments/1/551/link/att-abc');
    expect(init.body).toBeUndefined();          // no body — the ids are the request
    expect(out).toEqual({ attachmentId: 'copy-1' });
  });

  test('a missing source or owner is refused before any request', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    expect(() => client.linkAttachment('t', { kind: 'Ticket', ownerId: '1' })).toThrow(/sourceAttachmentId is required/);
    expect(() => client.linkAttachment('t', { kind: 'Ticket', sourceAttachmentId: 'a' })).toThrow(/ownerId is required/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test('a vanished source attachment is a typed not-found', async () => {
    const fetchImpl = makeFetch([{ status: 404, body: { message: 'Source attachment not found.' } }]);
    const client = mkClient(fetchImpl);
    await expect(client.linkAttachment('t', {
      kind: 'Ticket', ownerId: '1', sourceAttachmentId: 'gone',
    })).rejects.toBeInstanceOf(AltioraNotFoundError);
  });
});

describe('DOC-1-003: downloadAttachment', () => {
  test('returns the exact bytes — not a UTF-8 decode of them', async () => {
    // Bytes that do NOT survive a text() round trip: this is the regression.
    const binary = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x80, 0x01]);
    const fetchImpl = makeFetch([{ status: 200, bytes: binary }]);
    const client = mkClient(fetchImpl);

    const out = await client.downloadAttachment('user-tok', 'att-1');

    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(binary)).toBe(true);
    expect(fetchImpl.calls[0].url).toBe('http://localhost:5000/api/Attachments/att-1/content');
  });

  test('asks for any content type, since the reply is not JSON', async () => {
    const fetchImpl = makeFetch([{ status: 200, bytes: Buffer.from([1, 2, 3]) }]);
    const client = mkClient(fetchImpl);
    await client.downloadAttachment('t', 'att-1');
    expect(fetchImpl.calls[0].init.headers.Accept).toBe('*/*');
  });

  test('an error reply is still read as text and typed', async () => {
    const fetchImpl = makeFetch([{ status: 404, body: { message: 'File not found.' } }]);
    const client = mkClient(fetchImpl);
    await expect(client.downloadAttachment('t', 'nope')).rejects.toBeInstanceOf(AltioraNotFoundError);
  });

  test('a missing id is refused before any request', () => {
    const fetchImpl = makeFetch([{ status: 200, bytes: Buffer.from([]) }]);
    const client = mkClient(fetchImpl);
    expect(() => client.downloadAttachment('t')).toThrow(/attachmentId is required/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test('IS retried on a transient failure — a GET replays safely', async () => {
    let n = 0;
    const fetchImpl = makeFetch([() => {
      n += 1;
      if (n < 3) throw new Error('ECONNRESET');
      return {
        ok: true, status: 200,
        text: async () => '',
        json: async () => null,
        arrayBuffer: async () => Uint8Array.from([7, 7, 7]).buffer,
      };
    }]);
    const client = mkClient(fetchImpl);

    const out = await client.downloadAttachment('t', 'att-1');
    expect(n).toBe(3);
    expect(out.equals(Buffer.from([7, 7, 7]))).toBe(true);
  });
});

describe('DOC-1-003: getAttachmentConfig', () => {
  test('reads the live limits rather than hardcoding them', async () => {
    const cfg = {
      allowedExtensions: ['pdf', 'png', 'docx'],
      maxFileSizeBytes: 10485760,
      allowedFileTypes: [{ fileExtension: 'pdf', contentType: 'application/pdf', maxFileSizeBytes: 10485760 }],
    };
    const fetchImpl = makeFetch([{ status: 200, body: cfg }]);
    const client = mkClient(fetchImpl);

    expect(await client.getAttachmentConfig()).toEqual(cfg);
    expect(fetchImpl.calls[0].url).toBe('http://localhost:5000/api/Attachments/config');
  });

  test('sends no bearer — the endpoint is AllowAnonymous', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: {} }]);
    const client = mkClient(fetchImpl);
    await client.getAttachmentConfig();
    expect(fetchImpl.calls[0].init.headers).not.toHaveProperty('Authorization');
  });
});

describe('DOC-1-005: deleteAttachment', () => {
  test('DELETEs the attachment by id', async () => {
    const fetchImpl = makeFetch([{ status: 204 }]);
    const client = mkClient(fetchImpl);

    await client.deleteAttachment('user-tok', 'att-1');

    const { url, init } = fetchImpl.calls[0];
    expect(init.method).toBe('DELETE');
    expect(url).toBe('http://localhost:5000/api/Attachments/att-1');
    expect(init.headers.Authorization).toBe('Bearer user-tok');
  });

  test('an already-retired attachment is a typed not-found, not a crash', async () => {
    // Altiora's delete is soft, so a second call finds nothing to mark.
    const fetchImpl = makeFetch([{ status: 404, body: { message: 'Attachment not found or already deleted.' } }]);
    const client = mkClient(fetchImpl);

    await expect(client.deleteAttachment('t', 'att-1')).rejects.toBeInstanceOf(AltioraNotFoundError);
  });

  test('a missing id is refused before any request', () => {
    const fetchImpl = makeFetch([{ status: 204 }]);
    const client = mkClient(fetchImpl);

    expect(() => client.deleteAttachment('t')).toThrow(/attachmentId is required/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test('IS NOT RETRIED — DELETE is not replayed by the client policy', async () => {
    let n = 0;
    const fetchImpl = makeFetch([() => { n += 1; throw new Error('ECONNRESET'); }]);
    const client = mkClient(fetchImpl);

    await expect(client.deleteAttachment('t', 'att-1')).rejects.toBeInstanceOf(AltioraUnavailableError);
    expect(n).toBe(1);
  });
});

describe('DOC-1-003: the JSON path is untouched', () => {
  test('a normal POST still sends JSON with its Content-Type', async () => {
    const fetchImpl = makeFetch([{ status: 200, body: { id: 1 } }]);
    const client = mkClient(fetchImpl);

    await client.post('/api/tickets', { title: 'x' });

    const { init } = fetchImpl.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ title: 'x' }));
    expect(init.headers.Accept).toBe('application/json');
  });

  test('a 400 on the JSON path is still a validation error', async () => {
    const fetchImpl = makeFetch([{ status: 400, body: { message: 'bad' } }]);
    const client = mkClient(fetchImpl);
    await expect(client.post('/api/tickets', {})).rejects.toBeInstanceOf(AltioraValidationError);
  });
});
