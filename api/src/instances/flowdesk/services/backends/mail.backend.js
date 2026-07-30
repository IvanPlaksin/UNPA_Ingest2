'use strict';

/**
 * Mail backend (V3) — lists + details the CURRENT user's Altiora messages for the
 * voice/chat "my mail" intents. Runs under the acting-user bearer (Altiora scopes
 * `/api/messages` to the caller's email).
 *
 * Endpoints (see V0 recon): list `GET /api/messages?folder=&search=&sort=&offset=&limit=`,
 * detail `GET /api/messages/{id}`, summaries `GET /api/messages/unread-counts`
 * + `GET /api/messages/stats`. Folders: inbox / sent / trash / archived.
 *
 * @module instances/flowdesk/services/backends/mail.backend
 */

const FOLDER_ALIASES = {
  inbox: 'inbox', in: 'inbox', received: 'inbox',
  sent: 'sent', outbox: 'sent',
  trash: 'trash', deleted: 'trash', bin: 'trash',
  archive: 'archived', archived: 'archived',
};

function normalizeFolder(v) {
  if (!v) return 'inbox';
  return FOLDER_ALIASES[String(v).trim().toLowerCase()] || 'inbox';
}

function buildQuery(f = {}) {
  const q = new URLSearchParams();
  q.set('folder', normalizeFolder(f.folder));
  if (f.search) q.set('search', f.search);
  q.set('sort', f.sort === 'asc' ? 'asc' : 'desc');
  q.set('offset', String(f.offset || 0));
  q.set('limit', String(f.limit || 10));
  return q.toString();
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null) return o[k]; return undefined; };
const stripHtml = (s) => (s ? String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '');

/** Altiora Message → the compact shape for a list row. */
function mapMessage(m) {
  return {
    id: pick(m, ['id', 'Id']),
    from: pick(m, ['fromName', 'FromName', 'senderName', 'SenderName']),
    subject: pick(m, ['subject', 'Subject']),
    date: pick(m, ['date', 'Date', 'receivedAt', 'ReceivedAt']),
    read: !!pick(m, ['read', 'Read', 'isRead', 'IsRead']),
    ref: pick(m, ['relatedNumber', 'RelatedNumber']) || pick(m, ['rfsNumber', 'RfsNumber']) || pick(m, ['ticketNumber', 'TicketNumber']),
  };
}

function makeMailBackend(deps = {}) {
  const clientOf = () => deps.client || require('../altiora-client').getAltioraClient();

  /** @returns {Promise<{messages:Array, folder:string, count:number}>} */
  async function listMail(filters = {}) {
    const folder = normalizeFolder(filters.folder);
    const res = await clientOf().get(`/api/messages?${buildQuery({ ...filters, folder })}`);
    const items = Array.isArray(res) ? res : (pick(res, ['items', 'Items']) || []);
    const messages = items.map(mapMessage);
    return { messages, folder, count: messages.length };
  }

  /** Full detail for one message (body + participants). */
  async function getMail(messageId) {
    const m = await clientOf().get(`/api/messages/${encodeURIComponent(messageId)}`);
    return { ...mapMessage(m), body: stripHtml(pick(m, ['body', 'Body'])) };
  }

  /** Per-folder unread counts + totals (for "how many unread"). */
  async function counts() {
    const [unread, stats] = await Promise.all([
      clientOf().get('/api/messages/unread-counts').catch(() => ({})),
      clientOf().get('/api/messages/stats').catch(() => []),
    ]);
    const byFolder = {};
    (Array.isArray(stats) ? stats : []).forEach((s) => {
      const f = pick(s, ['folder', 'Folder']);
      if (f) byFolder[String(f).toLowerCase()] = { total: pick(s, ['total', 'Total']) || 0, unread: pick(s, ['unread', 'Unread']) || 0 };
    });
    return { unread: unread || {}, folders: byFolder, inboxUnread: (unread && (unread.inbox || unread.Inbox)) || 0 };
  }

  return { listMail, getMail, counts };
}

module.exports = { makeMailBackend, buildQuery, mapMessage, normalizeFolder };
