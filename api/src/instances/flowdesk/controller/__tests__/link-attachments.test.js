'use strict';

/**
 * DOC-5-001/002 — POST /chat/attachments/link.
 *
 * Driven through a real Express app so the JSON body, the query parameter and
 * the acting-user context behave as they do in the running server — the upload
 * route taught us that a hand-rolled `req` hides exactly the failures that
 * matter (multer silently breaking AsyncLocalStorage).
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

function makeApp({ actingToken = 'user-tok', link } = {}) {
  jest.resetModules();
  const calls = [];

  jest.doMock('../../services/attachment-link.service', () => ({
    linkSessionAttachments: async (sessionId, ticketId, token, who) => {
      calls.push({ sessionId, ticketId, token, who });
      if (typeof link === 'function') return link(sessionId, ticketId, token, who);
      return { linked: 1, skipped: 0, failed: 0, details: [{ attachmentId: 'att-1', fileName: 'a.pdf', status: 'linked' }] };
    },
  }));

  const controller = require('../flowdesk.controller');
  const { runWithActingUser } = require('../../services/acting-user.context');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (!actingToken) return next();
    req.flowdeskUser = { userId: 'u-1', email: 'ivan@un.org', token: actingToken, orgUnit: { code: 'ODSRSGFP' } };
    runWithActingUser(req.flowdeskUser, () => next());
  });
  app.post('/chat/attachments/link', controller.linkSessionAttachments);
  return { app, calls };
}

afterEach(() => { jest.resetModules(); jest.dontMock('../../services/attachment-link.service'); });

describe('DOC-5-002: the happy path', () => {
  test('links the session onto the ticket and returns the counts', async () => {
    const { app, calls } = makeApp();

    const res = await request(app)
      .post('/chat/attachments/link?sessionId=sess-42')
      .send({ ticketId: 551 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ linked: 1, skipped: 0, failed: 0 });
    expect(calls[0]).toMatchObject({ sessionId: 'sess-42', ticketId: 551, token: 'user-tok' });
    expect(calls[0].who).toEqual({ userId: 'u-1', userEmail: 'ivan@un.org', orgCode: 'ODSRSGFP' });
  });

  test('a ticket id that arrives as a string is passed on unchanged', async () => {
    const { app, calls } = makeApp();
    await request(app).post('/chat/attachments/link?sessionId=s1').send({ ticketId: 'SR-551' });
    expect(calls[0].ticketId).toBe('SR-551');
  });

  test('PARTIAL FAILURE IS STILL 200 — the request is already submitted', async () => {
    // A 500 here would tell the caller nothing about WHICH document failed, and
    // the ticket exists either way. The per-file detail is the useful answer.
    const { app } = makeApp({
      link: async () => ({
        linked: 1, skipped: 0, failed: 1,
        details: [
          { attachmentId: 'att-1', fileName: 'good.pdf', status: 'linked' },
          { attachmentId: 'att-2', fileName: 'bad.pdf', status: 'failed', error: 'Source attachment not found.' },
        ],
      }),
    });

    const res = await request(app).post('/chat/attachments/link?sessionId=s1').send({ ticketId: 551 });

    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.details[1]).toMatchObject({ fileName: 'bad.pdf', status: 'failed' });
  });

  test('a session with nothing attached answers 200 with zeroes', async () => {
    const { app } = makeApp({ link: async () => ({ linked: 0, skipped: 0, failed: 0, details: [] }) });
    const res = await request(app).post('/chat/attachments/link?sessionId=s1').send({ ticketId: 551 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: 0, skipped: 0, failed: 0, details: [] });
  });
});

describe('DOC-5-002: bad requests', () => {
  test('400 without sessionId', async () => {
    const { app, calls } = makeApp();
    const res = await request(app).post('/chat/attachments/link').send({ ticketId: 551 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_SESSION');
    expect(calls).toHaveLength(0);
  });

  test('400 without ticketId', async () => {
    const { app, calls } = makeApp();
    const res = await request(app).post('/chat/attachments/link?sessionId=s1').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_TICKET');
    expect(calls).toHaveLength(0);
  });

  test('400 with no body at all', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/chat/attachments/link?sessionId=s1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_TICKET');
  });

  test('ticket 0 is accepted — it is a value, not an absence', async () => {
    const { app, calls } = makeApp();
    const res = await request(app).post('/chat/attachments/link?sessionId=s1').send({ ticketId: 0 });

    expect(res.status).toBe(200);
    expect(calls[0].ticketId).toBe(0);
  });
});

describe('DOC-5-002: identity is fail-closed', () => {
  test('401 without an acting user — files are never attached as the service account', async () => {
    const { app, calls } = makeApp({ actingToken: null });
    const res = await request(app).post('/chat/attachments/link?sessionId=s1').send({ ticketId: 551 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_ACTING_USER');
    expect(calls).toHaveLength(0);
  });
});

describe('DOC-5-002: failures', () => {
  test('an unexpected error is 500 and leaks nothing', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = makeApp({ link: async () => { throw new Error('bolt://memgraph:7687 refused'); } });

    const res = await request(app).post('/chat/attachments/link?sessionId=s1').send({ ticketId: 551 });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('LINK_FAILED');
    expect(JSON.stringify(res.body)).not.toMatch(/memgraph|bolt/);
    err.mockRestore();
  });
});
