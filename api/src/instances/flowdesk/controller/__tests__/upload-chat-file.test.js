'use strict';

/**
 * DOC-1-001 + DOC-1-002 — POST /chat/upload.
 *
 * Driven through a real Express app with real multer, because the things worth
 * asserting are the ones that only exist once a multipart request is actually
 * parsed: that `sessionId` survives in the query, that an oversized file is
 * answered as JSON rather than an HTML 500, and that a request arriving without
 * the proxy's identity headers is refused rather than served as the service
 * account.
 */

const express = require('express');
const request = require('supertest');

/**
 * These tests rebuild the module registry per case (`jest.resetModules()` inside
 * `makeApp`), which re-parses the whole controller dependency graph each time —
 * a few seconds per test under a full in-band run. The work is real, not a hang,
 * so the file gets a timeout that matches it rather than the 5s default.
 */
jest.setTimeout(60000);

const PDF = Buffer.from('%PDF-1.7 a small pretend document');

/**
 * Builds the app with the pieces the handler reaches for stubbed at the module
 * registry, which is how the handler resolves them (lazy require).
 *
 * EVERYTHING IS REQUIRED AFTER `resetModules`, INCLUDING acting-user.context.
 * That module's AsyncLocalStorage is per module instance: a copy required
 * before the reset is a different storage from the one the controller reads,
 * so the acting user set by the test would be invisible to the handler and
 * every request would 401.
 *
 * `throws` names the failure to simulate rather than taking an error instance,
 * for the same reason — an `instanceof` check only matches the constructor
 * from the registry the controller is using.
 */
function makeApp({ actingToken = 'user-tok', upload, throws, store, audit } = {}) {
  jest.resetModules();

  const calls = { upload: [], added: [], audit: [] };

  jest.doMock('../../services/altiora-client', () => {
    const real = jest.requireActual('../../services/altiora-client');
    const failures = {
      validation: () => new real.AltioraValidationError('Altiora POST failed', {
        status: 400,
        body: { message: 'File content does not match its extension (Magic Number Mismatch).' },
      }),
      extension: () => new real.AltioraValidationError('Altiora POST failed', {
        status: 400, body: { message: "Extension '.exe' is not allowed." },
      }),
      auth: () => new real.AltioraAuthError('unauthorized', { status: 401 }),
      unavailable: () => new real.AltioraUnavailableError('Altiora unreachable'),
      generic: () => new Error('bolt://memgraph:7687 refused'),
    };
    return {
      ...real,
      getAltioraClient: () => ({
        uploadAttachment: async (token, opts) => {
          calls.upload.push({ token, opts });
          if (throws) throw failures[throws]();
          if (typeof upload === 'function') return upload(token, opts);
          return { attachmentId: 'att-new-1' };
        },
      }),
    };
  });

  jest.doMock('../../services/chat-attachments.store', () => ({
    getChatAttachmentsStore: () => ({
      addAttachment: async (sessionId, a) => {
        calls.added.push({ sessionId, a });
        if (typeof store === 'function') return store(sessionId, a);
        return {
          attachmentId: a.attachmentId,
          fileName: a.fileName,
          contentType: a.contentType,
          size: a.size,
          canExtract: a.contentType === 'application/pdf',
        };
      },
    }),
  }));

  jest.doMock('../../services/chat-action-log.service', () => ({
    recordAction: async (e) => {
      calls.audit.push(e);
      if (typeof audit === 'function') return audit(e);
      return e;
    },
  }));

  const controller = require('../flowdesk.controller');
  const { runWithActingUser } = require('../../services/acting-user.context');
  const app = express();

  // Stands in for flowdeskUserMiddleware: opens the acting-user context only
  // when there is an identity, exactly as the real one does.
  app.use((req, _res, next) => {
    if (!actingToken) return next();
    req.flowdeskUser = { userId: 'u-1', email: 'ivan@un.org', token: actingToken, orgUnit: { code: 'ODSRSGFP' } };
    runWithActingUser(req.flowdeskUser, () => next());
  });

  app.post('/chat/upload', controller.uploadChatFileMiddleware, controller.uploadChatFile);
  return { app, calls, UPLOAD_MAX_BYTES: controller.UPLOAD_MAX_BYTES };
}

afterEach(() => { jest.resetModules(); jest.dontMock('../../services/altiora-client'); });

describe('DOC-1-002: the happy path', () => {
  test('stages the file under Chat/{sessionId} and answers with the record', async () => {
    const { app, calls } = makeApp();

    const res = await request(app)
      .post('/chat/upload?sessionId=sess-42')
      .attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      attachmentId: 'att-new-1',
      fileName: 'passport.pdf',
      size: PDF.length,
      contentType: 'application/pdf',
      canExtract: true,
    });

    expect(calls.upload).toHaveLength(1);
    expect(calls.upload[0].token).toBe('user-tok');
    expect(calls.upload[0].opts).toMatchObject({
      kind: 'Chat', ownerId: 'sess-42', fileName: 'passport.pdf', contentType: 'application/pdf',
    });
    expect(calls.upload[0].opts.file.equals(PDF)).toBe(true);
  });

  test('indexes the upload against the conversation', async () => {
    const { app, calls } = makeApp();

    await request(app)
      .post('/chat/upload?sessionId=sess-42')
      .attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(calls.added).toEqual([{
      sessionId: 'sess-42',
      a: { attachmentId: 'att-new-1', fileName: 'passport.pdf', contentType: 'application/pdf', size: PDF.length },
    }]);
  });

  test('canExtract comes from the store, not from the upload succeeding', async () => {
    // Altiora accepts .docx; the model cannot read it. The response must say so.
    const { app } = makeApp();
    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', Buffer.from('PK zip'), {
        filename: 'form.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(res.status).toBe(200);
    expect(res.body.canExtract).toBe(false);
  });

  test('accepts PascalCase AttachmentId as well as camelCase', async () => {
    const { app } = makeApp({ upload: async () => ({ AttachmentId: 'att-pascal' }) });
    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.attachmentId).toBe('att-pascal');
  });

  test('an accepted upload with no id is an error, not a record with undefined', async () => {
    const { app, calls } = makeApp({ upload: async () => ({ ok: true }) });
    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    expect(calls.added).toHaveLength(0);
  });
});

describe('DOC-1-002: identity is fail-closed', () => {
  test('401 without an acting user — a file is never uploaded as the service account', async () => {
    const { app, calls } = makeApp({ actingToken: null });

    const res = await request(app)
      .post('/chat/upload?sessionId=sess-42')
      .attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_ACTING_USER');
    expect(calls.upload).toHaveLength(0);
    expect(calls.added).toHaveLength(0);
  });

  test("uploads as the user's own bearer, not the client's", async () => {
    const { app, calls } = makeApp({ actingToken: 'ivan-bearer' });
    await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(calls.upload[0].token).toBe('ivan-bearer');
  });
});

describe('DOC-1-002: bad requests', () => {
  test('400 with no sessionId', async () => {
    const { app, calls } = makeApp();
    const res = await request(app)
      .post('/chat/upload')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_SESSION');
    expect(calls.upload).toHaveLength(0);
  });

  test('400 with no file', async () => {
    const { app, calls } = makeApp();
    const res = await request(app).post('/chat/upload?sessionId=s1');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_FILE');
    expect(calls.upload).toHaveLength(0);
  });

  test('an oversized file is 413 JSON, NOT an HTML 500', async () => {
    // Without multer's error being caught, Express answers with an HTML error
    // page — which a fetch() expecting JSON reads as the server falling over.
    const { app, UPLOAD_MAX_BYTES } = makeApp();
    const tooBig = Buffer.alloc(UPLOAD_MAX_BYTES + 1024, 0x41);

    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', tooBig, { filename: 'huge.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(res.body.error).toMatch(/10 MB/);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe("DOC-1-002: Altiora's verdict reaches the user", () => {
  test('a rejected file returns 400 carrying Altiora\'s own reason', async () => {
    const { app } = makeApp({ throws: 'validation' });

    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'notreally.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REJECTED_BY_ALTIORA');
    expect(res.body.error).toMatch(/Magic Number Mismatch/);
  });

  test('an expired session is 401, not 500', async () => {
    const { app } = makeApp({ throws: 'auth' });
    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_FAILED');
  });

  test('an unreachable Altiora is 503, so a client can sensibly retry', async () => {
    const { app } = makeApp({ throws: 'unavailable' });
    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  test('an unexpected failure does not leak internals to the client', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = makeApp({ throws: 'generic' });

    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/memgraph|bolt/);
    err.mockRestore();
  });
});

describe('DOC-1-002: audit', () => {
  test('a successful upload is recorded as EXECUTED with the acting user', async () => {
    const { app, calls } = makeApp();
    await request(app)
      .post('/chat/upload?sessionId=sess-42')
      .attach('file', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(calls.audit).toHaveLength(1);
    expect(calls.audit[0]).toMatchObject({
      sessionId: 'sess-42',
      userId: 'u-1',
      userEmail: 'ivan@un.org',
      orgCode: 'ODSRSGFP',
      actionType: 'UPLOAD_FILE',
      status: 'EXECUTED',
      targetId: 'att-new-1',
    });
    expect(calls.audit[0].actionParams).toMatchObject({ fileName: 'passport.pdf', size: PDF.length });
    expect(calls.audit[0].motivation).toBeTruthy();
  });

  test('a REJECTED file is still audited, as FAILED with the reason', async () => {
    const { app, calls } = makeApp({ throws: 'extension' });

    await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'x.exe', contentType: 'application/pdf' });

    expect(calls.audit).toHaveLength(1);
    expect(calls.audit[0]).toMatchObject({ status: 'FAILED', actionType: 'UPLOAD_FILE' });
    expect(calls.audit[0].error).toBeTruthy();
  });

  test('an audit failure never breaks the upload', async () => {
    const { app } = makeApp({ audit: async () => { throw new Error('memgraph down'); } });
    const res = await request(app)
      .post('/chat/upload?sessionId=s1')
      .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.attachmentId).toBe('att-new-1');
  });
});
