'use strict';

/**
 * DOC-1-005 — retiring chat-staged documents that never reached a ticket.
 *
 * A file uploaded in the chat is staged under `Chat/{sessionId}` and, on submit,
 * COPIED onto the ticket (see attachment-link.service). The staged original
 * survives that copy, so without something like this every chat attachment stays
 * under Chat forever.
 *
 * THE DANGEROUS CASE, AND WHY THIS WAITS.
 *
 * "Not linked" covers two situations that the data cannot tell apart: the user
 * changed their mind or abandoned the conversation — and the link FAILED, in
 * which case the staged copy is the only one and the person believes their
 * document is on their request. Deleting the second kind destroys a document
 * someone attached to a UN service request.
 *
 * So nothing is retired on the strength of "unlinked" alone. A candidate must
 * also be OLD — 48 hours by default, ratified — which is long enough for a
 * retry, for the user to notice, and for support to be told, while still
 * clearing abandoned drafts. Age is read from `uploadedAt`; a record that does
 * not carry one has unknown age and is never a candidate.
 *
 * DRY RUN IS THE DEFAULT. Deleting is opt-in per call, so a caller that forgets
 * the flag reports what it would have done instead of doing it.
 *
 * WHAT THIS DOES NOT ACHIEVE. Altiora's delete is soft — `IsDeleted = 1`, bytes
 * left in `FileAttachments.FileData`. This stops staged copies appearing in
 * listings and records who retired them; it does not give storage back.
 *
 * @module instances/flowdesk/services/attachment-cleanup.service
 */

const { KEY } = require('./chat-attachments.store');

/** Ratified: two calendar days, so at least one working day passes. */
const DEFAULT_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * How many candidates one run will act on.
 *
 * A ceiling on CANDIDATES, not on successes. Counting successes lets a run that
 * fails every time keep going forever, which is exactly the runaway the limit is
 * meant to stop.
 */
const DEFAULT_LIMIT = 100;

const KEY_PREFIX = KEY('');

/**
 * Session ids that still have an attachment index.
 *
 * SCAN rather than KEYS: `KEYS` walks the whole keyspace in one blocking call,
 * which on a shared Redis stalls every other client — a maintenance job must not
 * be able to do that.
 */
async function scanSessionIds(client, { count = 200 } = {}) {
  const ids = [];
  let cursor = '0';
  do {
    /* eslint-disable no-await-in-loop */
    const [next, keys] = await client.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', count);
    cursor = next;
    for (const k of keys) ids.push(String(k).slice(KEY_PREFIX.length));
    /* eslint-enable no-await-in-loop */
  } while (cursor !== '0');
  return [...new Set(ids)];
}

/** Old enough, never linked, and with an age we can actually vouch for. */
function isCandidate(att, cutoff) {
  if (!att || !att.attachmentId) return false;
  if (att.linkedTo) return false;
  if (typeof att.uploadedAt !== 'number' || !Number.isFinite(att.uploadedAt)) return false;
  return att.uploadedAt <= cutoff;
}

/**
 * Find — and, if told to, retire — staged documents that never reached a ticket.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=true]      report only; deleting is opt-in
 * @param {string}  [opts.token]            bearer used for the delete; required to delete
 * @param {number}  [opts.olderThanMs=48h]
 * @param {number}  [opts.limit=100]        candidates acted on in one run
 * @param {number}  [opts.now]              injectable clock
 * @param {object}  [opts.deps]             redis/store/client/audit seams
 * @returns {Promise<{scannedSessions:number, found:number, deleted:number, failed:number,
 *                    skippedByLimit:number, dryRun:boolean, details:Array}>}
 */
async function cleanupOrphanedAttachments(opts = {}) {
  const {
    dryRun = true,
    token = null,
    olderThanMs = DEFAULT_AGE_MS,
    limit = DEFAULT_LIMIT,
    deps = {},
  } = opts;

  const now = typeof opts.now === 'function' ? opts.now() : Date.now();
  const cutoff = now - olderThanMs;

  const redis = deps.redis || require('../../../services/redis.service').getClient();
  const store = deps.store || require('./chat-attachments.store').getChatAttachmentsStore();
  const client = deps.client || require('./altiora-client').getAltioraClient();
  const audit = deps.audit || require('./chat-action-log.service').recordAction;

  if (!dryRun && !token) {
    throw new Error('attachment-cleanup: a token is required to delete; pass dryRun to inspect without one');
  }

  const sessionIds = await scanSessionIds(redis);
  const out = {
    scannedSessions: sessionIds.length,
    found: 0,
    deleted: 0,
    failed: 0,
    skippedByLimit: 0,
    dryRun,
    details: [],
  };
  let acted = 0;

  for (const sessionId of sessionIds) {
    /* eslint-disable no-await-in-loop */
    let attachments = [];
    try {
      attachments = await store.getAttachments(sessionId);
    } catch (e) {
      out.details.push({ sessionId, status: 'session_unreadable', error: e.message });
      continue;
    }

    for (const att of attachments) {
      if (!isCandidate(att, cutoff)) continue;
      out.found += 1;

      const ageHours = Math.round((now - att.uploadedAt) / (60 * 60 * 1000));
      const base = { sessionId, attachmentId: att.attachmentId, fileName: att.fileName, ageHours };

      // The ceiling counts every candidate ACTED ON — deleted, failed, or
      // merely reported. Counting successes would let a wholly-failing run go
      // on forever, and counting only real deletions would let a dry run emit
      // an unbounded report, which is the same runaway with a different cost.
      if (acted >= limit) {
        out.skippedByLimit += 1;
        out.details.push({ ...base, status: 'skipped_limit' });
        continue;
      }
      acted += 1;

      if (dryRun) {
        out.details.push({ ...base, status: 'would_delete' });
        continue;
      }

      try {
        await client.deleteAttachment(token, att.attachmentId);
        await store.removeAttachment(sessionId, att.attachmentId);
        await audit({
          sessionId,
          actionType: 'CLEANUP_STAGED',
          actionParams: { attachmentId: att.attachmentId, fileName: att.fileName, ageHours },
          targetLabel: 'Attachment',
          targetId: att.attachmentId,
          status: 'EXECUTED',
          motivation: 'Staged in the chat, never attached to a request, and older than the retention window.',
        }).catch(() => { /* audit never costs the cleanup */ });

        out.deleted += 1;
        out.details.push({ ...base, status: 'deleted' });
      } catch (e) {
        // Left in place on purpose: an unreachable Altiora must not cost us the
        // record of a file that still exists, and the next run will find it again.
        out.failed += 1;
        out.details.push({ ...base, status: 'failed', error: e.message });
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  return out;
}

module.exports = {
  cleanupOrphanedAttachments,
  scanSessionIds,
  isCandidate,
  DEFAULT_AGE_MS,
  DEFAULT_LIMIT,
};
