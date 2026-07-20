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
 * POST a chat turn. Returns the final turn result plus the refreshed draft.
 * @returns {Promise<{response, choices, state, executionLog, spawnResult, isComplete, version, draft}>}
 */
export async function sendMessage(sessionId, userId, message, { signal, choice, controlAction, lang, userContext } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  // Chain an external cancel signal (e.g. Composer "stop") into ours.
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });

  // Exactly one of controlAction (I-3 controls[]) / choice (legacy confirm-or-choose) /
  // message is sent; controlAction takes precedence during the deprecation window.
  // userContext (the user profile) is the acting identity when there is no proxy —
  // the backend prefers its proxy-injected req.flowdeskUser over this body value.
  const base = { sessionId, userId, lang, ...(userContext ? { userContext } : {}) };
  const body = controlAction
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

export const chatClient = { sendMessage, getDraft, patchDraft, subscribeProgress, getSchema };
export { SSE_EVENTS };
