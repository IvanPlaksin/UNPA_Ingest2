'use strict';

/**
 * DOC-5 — putting the chat's documents onto the ticket the user just submitted.
 *
 * WHY THIS EXISTS RATHER THAN A FIELD IN THE HAND-OFF.
 *
 * The obvious design — hand the wizard our attachment ids in `initialFormData
 * .attachments` — does not attach anything. Altiora's create path takes any
 * attachment entry without file bytes and INSERTs it verbatim, and
 * `FileAttachments.AttachmentId` is the primary key: our id is already in that
 * table, because it IS the staged row. The insert violates the key and the
 * ticket is never created. Measured against the schema, not guessed
 * (Database/01_Tables/50_FileAttachments.sql:9, AttachmentRepository.cs:220).
 *
 * `Attachments/{kind}/{owner}/link/{sourceId}` is the supported move: it copies
 * the bytes under a fresh id, so nothing collides and no file travels through a
 * chat payload. It needs the ticket id, which exists only after submit — hence a
 * step of its own, called once the wizard reports what it created.
 *
 * IDEMPOTENT ON PURPOSE. The caller is a browser reacting to a submit: it can
 * retry, double-fire, or arrive after the user reloaded. Linking twice would put
 * the same document on the ticket twice, so anything already linked is skipped
 * and reported as such rather than done again.
 *
 * @module instances/flowdesk/services/attachment-link.service
 */

/**
 * Link every staged document of a session onto a ticket.
 *
 * Never throws for a single file: one failure is reported and the rest continue,
 * because the alternative is losing four documents to one bad one at the moment
 * the request has already been submitted and the user has moved on.
 *
 * @param {string} sessionId
 * @param {string|number} ticketId the ticket Altiora just created
 * @param {string} actingToken the user's own bearer — never the service account
 * @param {{userId?:string, userEmail?:string, orgCode?:string}} [who] for the audit
 * @param {{store?:object, client?:object, audit?:Function}} [deps]
 * @returns {Promise<{linked:number, skipped:number, failed:number, details:Array}>}
 */
async function linkSessionAttachments(sessionId, ticketId, actingToken, who = {}, deps = {}) {
  if (!sessionId) throw new Error('attachment-link: sessionId is required');
  if (ticketId === undefined || ticketId === null || ticketId === '') {
    throw new Error('attachment-link: ticketId is required');
  }
  if (!actingToken) throw new Error('attachment-link: an acting user is required');

  const store = deps.store || require('./chat-attachments.store').getChatAttachmentsStore();
  const client = deps.client || require('./altiora-client').getAltioraClient();
  const audit = deps.audit || require('./chat-action-log.service').recordAction;

  const attachments = await store.getAttachments(sessionId);
  const details = [];
  let linked = 0; let skipped = 0; let failed = 0;

  for (const att of attachments) {
    if (att.linkedTo) {
      skipped += 1;
      details.push({
        attachmentId: att.attachmentId, fileName: att.fileName,
        status: 'already_linked', linkedTo: att.linkedTo,
      });
      continue;
    }

    const record = (status, extra) => audit({
      sessionId,
      userId: who.userId || null,
      userEmail: who.userEmail || null,
      orgCode: who.orgCode || null,
      actionType: 'ATTACH_FILE',
      actionParams: { fileName: att.fileName, sourceAttachmentId: att.attachmentId, ticketId: String(ticketId) },
      targetLabel: 'Ticket',
      targetId: String(ticketId),
      ticketId: String(ticketId),
      status,
      motivation: 'The user attached this document in the chat; it follows the request they submitted.',
      ...extra,
    }).catch(() => { /* audit never costs the attachment */ });

    try {
      const copy = await client.linkAttachment(actingToken, {
        kind: 'Ticket', ownerId: String(ticketId), sourceAttachmentId: att.attachmentId,
      });
      const copyId = copy && (copy.attachmentId || copy.AttachmentId);

      await store.markAsLinked(sessionId, att.attachmentId, 'Ticket', ticketId);
      await record('EXECUTED', { result: { linkedAttachmentId: copyId || null } });

      linked += 1;
      details.push({
        attachmentId: att.attachmentId, fileName: att.fileName,
        status: 'linked', linkedAttachmentId: copyId || null,
      });
    } catch (e) {
      await record('FAILED', { error: e.message });
      failed += 1;
      details.push({
        attachmentId: att.attachmentId, fileName: att.fileName,
        status: 'failed', error: e.message,
      });
    }
  }

  return { linked, skipped, failed, details };
}

module.exports = { linkSessionAttachments };
