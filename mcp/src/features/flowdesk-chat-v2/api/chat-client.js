import { API_BASE_URL } from '../../../config/api.config';

/**
 * FlowDesk Chat V2 API client (F4) — isolated REST + SSE client.
 *
 * Transport model (A): POST /chat returns the final answer synchronously; a
 * long-lived SSE channel streams node-progress in parallel (cosmetic — its loss
 * never loses data). Unified error type ChatError { code, message }.
 */

export class ChatError extends Error {
  constructor(code, message) { super(message); this.name = 'ChatError'; this.code = code; }
}

const SEND_TIMEOUT_MS = 120000; // LLM turns can take ~45s; generous ceiling
const SSE_MAX_RETRIES = 3;

const url = (p) => `${API_BASE_URL}${p}`;

/**
 * GET the current DraftSR mirror. Returns null when there is no draft yet.
 */
export async function getDraft(sessionId) {
  let res;
  try {
    res = await fetch(url(`/flowdesk/draft/${encodeURIComponent(sessionId)}`));
  } catch (e) {
    throw new ChatError('NETWORK', e.message);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ChatError('SERVER', `getDraft HTTP ${res.status}`);
  return res.json();
}

/**
 * GET the compiled SchemaSnapshot for a service (labels, phases, dependsOn).
 * Returns null when the service has no schema graph.
 */
export async function getSchema(serviceId) {
  let res;
  try {
    res = await fetch(url(`/flowdesk/schema/${encodeURIComponent(serviceId)}`));
  } catch (e) {
    throw new ChatError('NETWORK', e.message);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ChatError('SERVER', `getSchema HTTP ${res.status}`);
  return res.json();
}

/**
 * PATCH slots on the draft (inline edit from the DraftPanel).
 */
export async function patchDraft(sessionId, patches) {
  let res;
  try {
    res = await fetch(url(`/flowdesk/draft/${encodeURIComponent(sessionId)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patches }),
    });
  } catch (e) {
    throw new ChatError('NETWORK', e.message);
  }
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new ChatError('SERVER', typeof data.error === 'string' ? data.error : data.detail || 'patch failed');
  if (!res.ok) throw new ChatError('SERVER', `patchDraft HTTP ${res.status}`);
  return data;
}

/**
 * DOC-3 — attach a document to the conversation.
 *
 * Multipart, and the Content-Type is deliberately NOT set: multipart needs a
 * boundary, `fetch` derives one from the FormData, and writing the header by
 * hand loses it, so the server cannot parse a request that looks correct.
 *
 * `canExtract` in the reply says whether the assistant can READ the file, which
 * is not the same as whether the upload worked — Altiora accepts .docx and
 * .xlsx, which reach the request but which the model cannot open.
 *
 * @param {string} sessionId
 * @param {File|Blob} file
 * @returns {Promise<{attachmentId, fileName, size, contentType, canExtract}>}
 */
export async function uploadFile(sessionId, file, { signal } = {}) {
  const form = new FormData();
  form.append('file', file, file.name || 'document');

  let res;
  try {
    res = await fetch(url(`/flowdesk/chat/upload?sessionId=${encodeURIComponent(sessionId)}`), {
      method: 'POST', body: form, signal,
    });
  } catch (e) {
    throw new ChatError('NETWORK', e.message);
  }

  const data = await res.json().catch(() => ({}));
  // The server's message is the useful one — it is Altiora's own verdict on the
  // file ("File content does not match its extension", "Extension '.exe' is not
  // allowed"), written for whoever chose it.
  if (!res.ok) throw new ChatError(data.code || 'UPLOAD_FAILED', data.error || `upload HTTP ${res.status}`);
  return data;
}

/**
 * DOC-5 — put the conversation's documents on the request that was just created.
 *
 * Called once the form reports the ticket it made. Safe to call more than once:
 * the server skips anything already linked, so a retry or a double-fire cannot
 * put the same document on a request twice.
 *
 * Answers 200 even when some files failed — the request already exists, so the
 * per-file `details` is the news, not the status code.
 *
 * @returns {Promise<{linked:number, skipped:number, failed:number, details:Array}>}
 */
export async function linkAttachments(sessionId, ticketId, { signal } = {}) {
  let res;
  try {
    res = await fetch(url(`/flowdesk/chat/attachments/link?sessionId=${encodeURIComponent(sessionId)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
      signal,
    });
  } catch (e) {
    throw new ChatError('NETWORK', e.message);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChatError(data.code || 'LINK_FAILED', data.error || `link HTTP ${res.status}`);
  return data;
}

/**
 * DOC-3 — link the documents of a FINISHED conversation onto the ticket it became.
 *
 * Separate from `linkAttachments` because a hand-off is terminal: the moment the
 * form opens, the chat resets to a fresh session with an empty attachment list,
 * so by the time a ticket exists it no longer knows which conversation staged
 * the files. This reads the conversation out of the hand-off payload itself, so
 * the caller never has to hold a sessionId or guess which one was current.
 *
 * Returns null when nothing was attached. Safe to call twice — the server skips
 * what it has already linked.
 */
export async function linkStagedAttachments(openForm, ticketId, opts = {}) {
  const staged = (openForm && openForm.stagedAttachments) || [];
  if (!staged.length) return null;
  const sessionId = (openForm && openForm.sessionId)
    || (staged[0] && staged[0].stagedUnder && staged[0].stagedUnder.ownerId)
    || null;
  if (!sessionId || ticketId === undefined || ticketId === null || ticketId === '') return null;
  return linkAttachments(sessionId, ticketId, opts);
}

/**
 * POST a chat turn. Returns the final turn result plus the refreshed draft.
 * @returns {Promise<{response, choices, state, executionLog, spawnResult, isComplete, version, draft}>}
 */
export async function sendMessage(sessionId, userId, message, { signal, choice, controlAction, anchor, lang, userContext } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  // Chain an external cancel signal (e.g. Composer "stop") into ours.
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });

  // Exactly one of anchor (Phase 4 zero-query explain) / controlAction (I-3 controls[]) /
  // choice (legacy confirm-or-choose) / message is sent; anchor takes precedence.
  // userContext (the user profile) is the acting identity when there is no proxy —
  // the backend prefers its proxy-injected req.flowdeskUser over this body value.
  const base = { sessionId, userId, lang, ...(userContext ? { userContext } : {}) };
  const body = anchor
    ? { ...base, anchor }
    : controlAction
      ? { ...base, controlAction }
      : choice
        ? { ...base, choice }
        : { ...base, message };

  let res;
  try {
    res = await fetch(url('/flowdesk/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new ChatError('TIMEOUT', 'The assistant took too long to respond.');
    throw new ChatError('NETWORK', e.message);
  }
  clearTimeout(timer);

  const data = await res.json().catch(() => { throw new ChatError('SERVER', `Non-JSON response (HTTP ${res.status})`); });
  if (data.error) throw new ChatError('SERVER', typeof data.error === 'string' ? data.error : data.detail || 'Chat failed');
  if (!res.ok) throw new ChatError('SERVER', `chat HTTP ${res.status}`);

  // Attach the refreshed draft for the DraftPanel (best-effort).
  let draft = null;
  try { draft = await getDraft(sessionId); } catch { /* draft is optional */ }
  return { ...data, draft };
}

const SSE_EVENTS = ['connected', 'turn:start', 'node:start', 'node:done', 'turn:done'];

/**
 * Open the per-session SSE progress channel.
 * @param {string} sessionId
 * @param {{onConnected?, onTurnStart?, onNode?, onTurnDone?, onError?}} handlers
 * @param {{EventSourceImpl?}} [opts] - test seam
 * @returns {Function} unsubscribe
 */
export function subscribeProgress(sessionId, handlers = {}, opts = {}) {
  const ES = opts.EventSourceImpl || (typeof EventSource !== 'undefined' ? EventSource : null);
  if (!ES) { handlers.onError?.(new ChatError('SSE_DISCONNECT', 'EventSource unavailable')); return () => {}; }

  const streamUrl = url(`/flowdesk/chat/${encodeURIComponent(sessionId)}/stream`);
  let es = null;
  let retries = 0;
  let closed = false;
  let reconnectTimer = null;

  const parse = (e) => { try { return JSON.parse(e.data); } catch { return {}; } };

  const wire = () => {
    es = new ES(streamUrl);
    es.onopen = () => { retries = 0; };
    es.addEventListener('connected', (e) => handlers.onConnected?.(parse(e)));
    es.addEventListener('turn:start', (e) => handlers.onTurnStart?.(parse(e)));
    es.addEventListener('turn:done', (e) => handlers.onTurnDone?.(parse(e)));
    es.addEventListener('node:start', (e) => { const d = parse(e); handlers.onNode?.(d.node, 'start', d); });
    es.addEventListener('node:done', (e) => { const d = parse(e); handlers.onNode?.(d.node, 'done', d); });
    es.onerror = () => {
      if (closed) return;
      try { es.close(); } catch { /* ignore */ }
      if (retries >= SSE_MAX_RETRIES) {
        handlers.onError?.(new ChatError('SSE_DISCONNECT', 'Lost progress stream'));
        return;
      }
      retries += 1;
      const backoff = Math.min(1000 * 2 ** (retries - 1), 8000);
      reconnectTimer = setTimeout(() => { if (!closed) wire(); }, backoff);
    };
  };

  wire();

  return function unsubscribe() {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try { es && es.close(); } catch { /* ignore */ }
  };
}

/**
 * VF1-005: GET the persisted voice transcript for a session (voice+text share one
 * session). Returns [] when there is none.
 */
export async function getVoiceTranscript(sessionId) {
  let res;
  try {
    res = await fetch(url(`/flowdesk/voice/transcript/${encodeURIComponent(sessionId)}`));
  } catch (e) {
    throw new ChatError('NETWORK', e.message);
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new ChatError('SERVER', `getVoiceTranscript HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

export const chatClient = { sendMessage, getDraft, patchDraft, subscribeProgress, getSchema, getVoiceTranscript, uploadFile, linkAttachments, linkStagedAttachments };
export { SSE_EVENTS };
