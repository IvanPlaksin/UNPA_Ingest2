'use strict';

/**
 * DOC-1-004 — files attached to a chat session.
 *
 * WHY THIS IS NOT PART OF DraftSR, WHICH IS THE OBVIOUS PLACE FOR IT.
 *
 * A draft and its attachments have different lifetimes, and the difference is
 * destructive rather than cosmetic. `draft-sr.service.discard()` writes
 * `draft:{sessionId}` to null whenever the user changes their mind about which
 * service they are requesting (the F10d switch), and `parkArchive()` moves the
 * draft out from under the live session id entirely. Both are ordinary things
 * for a user to do — and a user who uploads a scan, then realises they picked
 * the wrong service, would watch the file they just attached disappear.
 *
 * The file belongs to the CONVERSATION, not to the draft: it survives a service
 * switch, and it may be uploaded before any draft exists at all, since a person
 * can attach a document and then ask what to do with it. So it lives under its
 * own key, in the same Redis and with the same 24h TTL as the draft — the same
 * storage contour, a different lifetime.
 *
 * WHAT IS STORED IS A REFERENCE, NOT A FILE. The bytes live in Altiora under
 * `Chat/{sessionId}` (see altiora-client.uploadAttachment). This is the index
 * that says which ones belong to this conversation and what has been done with
 * them, and it is deliberately small enough to read on every turn.
 *
 * @module instances/flowdesk/services/chat-attachments.store
 */

const { isSupportedForExtraction } = require('../../../services/ai/llm-provider/multimodal');

/** Same 24h as the draft: a conversation older than that is not resumed. */
const TTL_SECONDS = 24 * 60 * 60;
const KEY = (sessionId) => `chat:attachments:${sessionId}`;

/** Extraction has not been attempted / succeeded / failed / cannot apply. */
const STATUS = Object.freeze({
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

function defaultStore() {
  const redis = require('../../../services/redis.service');
  return {
    get: (k) => redis.get(k),
    set: (k, v, ttl) => redis.set(k, v, ttl),
  };
}

/**
 * @param {{store?:object, ttlSeconds?:number, now?:Function}} [deps] all injectable for tests
 */
function createChatAttachmentsStore(deps = {}) {
  const store = deps.store || defaultStore();
  const ttlSeconds = deps.ttlSeconds || TTL_SECONDS;
  const now = deps.now || (() => Date.now());

  async function read(sessionId) {
    if (!sessionId) return [];
    const list = await store.get(KEY(sessionId));
    return Array.isArray(list) ? list : [];
  }

  /** Every write refreshes the TTL — an active conversation must not lose its files. */
  async function write(sessionId, list) {
    await store.set(KEY(sessionId), list, ttlSeconds);
    return list;
  }

  /**
   * Record an upload that Altiora has already accepted.
   *
   * `canExtract` is DERIVED here rather than taken from the caller, and that is
   * the point of doing it in one place: Altiora's allow-list and the model's
   * are not the same list. Altiora happily stores .docx, .xlsx and .svg, none
   * of which can become a content block — so "the upload succeeded" does not
   * mean "the assistant can read it", and a caller computing this itself will
   * eventually get it wrong.
   *
   * Re-adding the same attachmentId UPDATES it instead of appending, so a
   * client that retries the bookkeeping cannot produce a duplicate row.
   *
   * @param {string} sessionId
   * @param {{attachmentId:string, fileName:string, contentType:string, size?:number}} a
   * @returns {Promise<object>} the stored record
   */
  async function addAttachment(sessionId, a = {}) {
    if (!sessionId) throw new Error('chat-attachments: sessionId is required');
    if (!a.attachmentId) throw new Error('chat-attachments: attachmentId is required');

    const record = {
      attachmentId: String(a.attachmentId),
      fileName: a.fileName || 'document',
      contentType: a.contentType || 'application/octet-stream',
      size: Number(a.size) || 0,
      canExtract: isSupportedForExtraction(a.contentType),
      uploadedAt: a.uploadedAt || now(),
      // A file the model cannot read is not "waiting to be extracted"; saying so
      // would put it in every queue that looks for pending work.
      extractionStatus: isSupportedForExtraction(a.contentType) ? STATUS.PENDING : STATUS.SKIPPED,
      extractedData: null,
      linkedTo: null,
    };

    const list = await read(sessionId);
    const i = list.findIndex((x) => x.attachmentId === record.attachmentId);
    if (i >= 0) list[i] = { ...list[i], ...record };
    else list.push(record);

    await write(sessionId, list);
    return record;
  }

  /** Everything attached to this conversation, oldest first. */
  function getAttachments(sessionId) {
    return read(sessionId);
  }

  /** Only what the model can actually read — what extraction iterates. */
  async function getExtractable(sessionId) {
    return (await read(sessionId)).filter((a) => a.canExtract);
  }

  async function getAttachment(sessionId, attachmentId) {
    return (await read(sessionId)).find((a) => a.attachmentId === attachmentId) || null;
  }

  /**
   * Partial update — extraction status, extracted values, anything but identity.
   *
   * `attachmentId` is not writable: it is what the record IS, and letting an
   * update change it turns a typo into a silently orphaned file.
   *
   * @returns {Promise<object|null>} the updated record, or null if unknown
   */
  async function updateAttachment(sessionId, attachmentId, updates = {}) {
    const list = await read(sessionId);
    const i = list.findIndex((a) => a.attachmentId === attachmentId);
    if (i < 0) return null;

    const { attachmentId: _ignored, ...safe } = updates;
    list[i] = { ...list[i], ...safe };
    await write(sessionId, list);
    return list[i];
  }

  /**
   * Remember that this file now also exists under another owner.
   *
   * Altiora's `link` COPIES the bytes rather than moving them, so after a
   * successful submit the same document exists twice: once under
   * `Chat/{sessionId}` and once under `Ticket/{id}`. Recording the target is
   * what makes the staged copy identifiable later — without it, cleanup cannot
   * tell a file that has been filed away from one still waiting to be.
   */
  function markAsLinked(sessionId, attachmentId, targetKind, targetOwnerId) {
    return updateAttachment(sessionId, attachmentId, {
      linkedTo: { kind: targetKind, ownerId: String(targetOwnerId), linkedAt: now() },
    });
  }

  /** Staged files not yet filed onto a ticket — the cleanup work-list. */
  async function getUnlinkedAttachments(sessionId) {
    return (await read(sessionId)).filter((a) => !a.linkedTo);
  }

  async function removeAttachment(sessionId, attachmentId) {
    const list = await read(sessionId);
    const next = list.filter((a) => a.attachmentId !== attachmentId);
    if (next.length === list.length) return false;
    await write(sessionId, next);
    return true;
  }

  /**
   * Drop the index for this conversation.
   *
   * Deletes OUR record only — the bytes in Altiora are not touched. Those are
   * left to Altiora's own retention: deleting a user's uploaded file as a side
   * effect of a chat session ending is not a decision this store should be
   * making, and a file already linked to a ticket must certainly outlive us.
   */
  async function clearAttachments(sessionId) {
    await store.set(KEY(sessionId), null, 1);
    return true;
  }

  return {
    addAttachment,
    getAttachments,
    getAttachment,
    getExtractable,
    updateAttachment,
    markAsLinked,
    getUnlinkedAttachments,
    removeAttachment,
    clearAttachments,
    STATUS,
    KEY,
    TTL_SECONDS: ttlSeconds,
  };
}

let singleton = null;
function getChatAttachmentsStore() {
  if (!singleton) singleton = createChatAttachmentsStore();
  return singleton;
}

module.exports = {
  createChatAttachmentsStore,
  getChatAttachmentsStore,
  STATUS,
  TTL_SECONDS,
  KEY,
};
