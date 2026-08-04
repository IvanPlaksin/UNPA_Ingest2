'use strict';

/**
 * DOC-1-005 — retiring staged documents that never reached a ticket.
 *
 * This is the only code in the feature that DESTROYS something a user gave us,
 * so the tests are weighted accordingly: most of them assert that a file is
 * NOT deleted. The one that matters most is the young unlinked file — the case
 * where a link failed and the staged copy is the only one left.
 */

const {
  cleanupOrphanedAttachments, isCandidate, DEFAULT_AGE_MS, DEFAULT_LIMIT,
} = require('../attachment-cleanup.service');

const NOW = 1_700_000_000_000;
const HOURS = (n) => n * 60 * 60 * 1000;
const now = () => NOW;

const att = (over = {}) => ({
  attachmentId: 'att-1', fileName: 'itinerary.pdf', contentType: 'application/pdf',
  size: 100, uploadedAt: NOW - HOURS(72), linkedTo: null, ...over,
});

/** Redis double implementing just enough SCAN. */
function mkRedis(sessionIds) {
  const keys = sessionIds.map((s) => `chat:attachments:${s}`);
  const calls = [];
  return {
    calls,
    scan: async (cursor, ...args) => {
      calls.push([cursor, ...args]);
      // One page, then done — enough to exercise the cursor loop's exit.
      return cursor === '0' ? ['0', keys] : ['0', []];
    },
  };
}

function mkStore(bySession) {
  const removed = [];
  return {
    removed,
    getAttachments: async (sessionId) => {
      const v = bySession[sessionId];
      if (typeof v === 'function') return v();
      return (v || []).map((a) => ({ ...a }));
    },
    removeAttachment: async (sessionId, id) => { removed.push({ sessionId, id }); return true; },
  };
}

function mkClient(impl) {
  const deleted = [];
  return {
    deleted,
    deleteAttachment: async (token, id) => {
      deleted.push({ token, id });
      if (impl) return impl(token, id);
      return null;
    },
  };
}

const mkAudit = () => { const calls = []; const fn = async (e) => { calls.push(e); return e; }; fn.calls = calls; return fn; };

const run = (opts = {}, bySession = { s1: [att()] }, redisSessions = Object.keys(bySession)) => {
  const redis = mkRedis(redisSessions);
  const store = mkStore(bySession);
  const client = mkClient(opts.clientImpl);
  const audit = mkAudit();
  return cleanupOrphanedAttachments({
    now, deps: { redis, store, client, audit }, ...opts,
  }).then((out) => ({ out, redis, store, client, audit }));
};

describe('DOC-1-005: what is NOT deleted', () => {
  test('a LINKED document is never a candidate — it is on a ticket', async () => {
    const { out, client } = await run({ dryRun: false, token: 't' }, {
      s1: [att({ linkedTo: { kind: 'Ticket', ownerId: '551' }, uploadedAt: NOW - HOURS(500) })],
    });

    expect(out.found).toBe(0);
    expect(client.deleted).toHaveLength(0);
  });

  test('A YOUNG UNLINKED DOCUMENT IS NEVER DELETED — the link may simply have failed', async () => {
    // The case this whole waiting period exists for: Altiora was down at submit,
    // the staged copy is the ONLY copy, and the user believes it is attached.
    const { out, client } = await run({ dryRun: false, token: 't' }, {
      s1: [att({ uploadedAt: NOW - HOURS(2) })],
    });

    expect(out.found).toBe(0);
    expect(client.deleted).toHaveLength(0);
  });

  test('a record with no usable uploadedAt has unknown age and is left alone', async () => {
    for (const bad of [undefined, null, 'yesterday', NaN]) {
      const { out } = await run({ dryRun: false, token: 't' }, { s1: [att({ uploadedAt: bad })] });
      expect(out.found).toBe(0);
    }
  });

  test('exactly at the boundary it is a candidate; a minute younger it is not', () => {
    const cutoff = NOW - DEFAULT_AGE_MS;
    expect(isCandidate(att({ uploadedAt: cutoff }), cutoff)).toBe(true);
    expect(isCandidate(att({ uploadedAt: cutoff + 60_000 }), cutoff)).toBe(false);
  });

  test('an unreadable session is reported, not skipped silently, and stops nothing else', async () => {
    const { out, client } = await run({ dryRun: false, token: 't' }, {
      s1: () => { throw new Error('redis timeout'); },
      s2: [att({ attachmentId: 'att-2' })],
    });

    expect(out.details).toContainEqual(expect.objectContaining({ sessionId: 's1', status: 'session_unreadable' }));
    expect(client.deleted.map((d) => d.id)).toEqual(['att-2']);
  });
});

describe('DOC-1-005: dry run is the default', () => {
  test('with no options at all it only reports', async () => {
    const { out, client } = await run({}, { s1: [att()] });

    expect(out.dryRun).toBe(true);
    expect(out.found).toBe(1);
    expect(out.deleted).toBe(0);
    expect(client.deleted).toHaveLength(0);
    expect(out.details[0]).toMatchObject({ status: 'would_delete', fileName: 'itinerary.pdf', ageHours: 72 });
  });

  test('deleting without a token is refused rather than attempted', async () => {
    await expect(cleanupOrphanedAttachments({
      dryRun: false, now, deps: { redis: mkRedis(['s1']), store: mkStore({ s1: [att()] }), client: mkClient(), audit: mkAudit() },
    })).rejects.toThrow(/token is required to delete/);
  });

  test('a dry run needs no token', async () => {
    const { out } = await run({ dryRun: true }, { s1: [att()] });
    expect(out.found).toBe(1);
  });
});

describe('DOC-1-005: deleting', () => {
  test('retires the candidate, drops the index entry and audits it', async () => {
    const { out, client, store, audit } = await run({ dryRun: false, token: 'svc-tok' }, { s1: [att()] });

    expect(out).toMatchObject({ found: 1, deleted: 1, failed: 0, dryRun: false });
    expect(client.deleted).toEqual([{ token: 'svc-tok', id: 'att-1' }]);
    expect(store.removed).toEqual([{ sessionId: 's1', id: 'att-1' }]);
    expect(audit.calls[0]).toMatchObject({
      sessionId: 's1', actionType: 'CLEANUP_STAGED', status: 'EXECUTED', targetId: 'att-1',
    });
    expect(audit.calls[0].actionParams).toMatchObject({ fileName: 'itinerary.pdf', ageHours: 72 });
    expect(audit.calls[0].motivation).toBeTruthy();
  });

  test('a failed delete leaves the index entry alone, so the next run sees it again', async () => {
    const { out, store } = await run(
      { dryRun: false, token: 't', clientImpl: () => { throw new Error('Altiora unreachable'); } },
      { s1: [att()] },
    );

    expect(out).toMatchObject({ deleted: 0, failed: 1 });
    expect(store.removed).toHaveLength(0);
    expect(out.details[0]).toMatchObject({ status: 'failed', error: 'Altiora unreachable' });
  });

  test('one failure does not stop the rest of the run', async () => {
    const { out } = await run(
      { dryRun: false, token: 't', clientImpl: (t, id) => { if (id === 'att-1') throw new Error('boom'); } },
      { s1: [att(), att({ attachmentId: 'att-2', fileName: 'b.pdf' })] },
    );

    expect(out).toMatchObject({ found: 2, deleted: 1, failed: 1 });
  });

  test('an audit outage never costs the cleanup', async () => {
    const redis = mkRedis(['s1']);
    const store = mkStore({ s1: [att()] });
    const client = mkClient();
    const out = await cleanupOrphanedAttachments({
      dryRun: false, token: 't', now,
      deps: { redis, store, client, audit: async () => { throw new Error('memgraph down'); } },
    });
    expect(out.deleted).toBe(1);
  });

  test('walks every session the scan returned', async () => {
    const { out, client } = await run({ dryRun: false, token: 't' }, {
      s1: [att()], s2: [att({ attachmentId: 'att-2' })], s3: [att({ attachmentId: 'att-3' })],
    });

    expect(out.scannedSessions).toBe(3);
    expect(client.deleted.map((d) => d.id).sort()).toEqual(['att-1', 'att-2', 'att-3']);
  });
});

describe('DOC-1-005: the run has a ceiling', () => {
  const many = (n, over = {}) => Array.from({ length: n }, (_, i) => att({ attachmentId: `att-${i}`, ...over }));

  test('stops at the limit and says how many it left', async () => {
    const { out, client } = await run({ dryRun: false, token: 't', limit: 3 }, { s1: many(10) });

    expect(out.deleted).toBe(3);
    expect(out.skippedByLimit).toBe(7);
    expect(client.deleted).toHaveLength(3);
  });

  test('THE CEILING COUNTS FAILURES TOO — a run that only fails still stops', async () => {
    // Counting successes would let a wholly-failing run retry forever.
    const { out, client } = await run(
      { dryRun: false, token: 't', limit: 3, clientImpl: () => { throw new Error('down'); } },
      { s1: many(10) },
    );

    expect(out.failed).toBe(3);
    expect(out.skippedByLimit).toBe(7);
    expect(client.deleted).toHaveLength(3);
  });

  test('a dry run is bounded too, so its report cannot run away', async () => {
    const { out } = await run({ limit: 5 }, { s1: many(50) });
    expect(out.details.filter((d) => d.status === 'would_delete')).toHaveLength(5);
    expect(out.skippedByLimit).toBe(45);
  });

  test('the default ceiling is 100', () => {
    expect(DEFAULT_LIMIT).toBe(100);
  });
});

describe('DOC-1-005: the window', () => {
  test('the default is 48 hours', () => {
    expect(DEFAULT_AGE_MS).toBe(48 * 60 * 60 * 1000);
  });

  test('a caller may widen it, and a wider window finds fewer', async () => {
    const rows = { s1: [att({ uploadedAt: NOW - HOURS(72) })] };
    expect((await run({ olderThanMs: HOURS(48) }, rows)).out.found).toBe(1);
    expect((await run({ olderThanMs: HOURS(96) }, rows)).out.found).toBe(0);
  });
});

describe('DOC-1-005: scanning', () => {
  test('uses SCAN with the attachment key prefix, never KEYS', async () => {
    const { redis } = await run({}, { s1: [att()] });

    expect(redis.calls[0]).toEqual(['0', 'MATCH', 'chat:attachments:*', 'COUNT', 200]);
  });

  test('an empty keyspace is a clean no-op', async () => {
    const out = await cleanupOrphanedAttachments({
      now, deps: { redis: mkRedis([]), store: mkStore({}), client: mkClient(), audit: mkAudit() },
    });
    expect(out).toMatchObject({ scannedSessions: 0, found: 0, deleted: 0, details: [] });
  });
});
