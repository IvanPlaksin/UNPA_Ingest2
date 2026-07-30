'use strict';

/**
 * Voice transcript store (VF1-001) — the server-side record of a voice session's
 * turns, so the SHARED text window can render the voice dialogue (voice+text are
 * one session) and it survives a reload. Redis-backed, keyed by sessionId, 24h TTL
 * (a working session's lifetime). Messages use the SAME shape as the text chat
 * (id/role/content/timestamp/metadata.source='voice') so the two merge cleanly.
 *
 * Written by BOTH the orchestrator (per turn, live) and the POST /voice/transcript
 * endpoint (the client's own best-effort mirror); read by GET /voice/transcript and
 * by the text window on open. De-duplication is the reader's job (hydrate merges by
 * role+content) since the same turn can arrive via the live bridge AND persistence.
 *
 * @module instances/flowdesk/voice/voice-transcript.store
 */

const redis = require('../../../services/redis.service');

const TTL_SECONDS = 60 * 60 * 24; // 24h
const KEY = (sessionId) => `voice:transcript:${sessionId}`;

let _seq = 0;
function makeMessage(role, content, extraMeta) {
  _seq = (_seq + 1) % 1e6;
  return {
    id: `vt-${Date.now()}-${_seq}`,
    role,
    content: String(content),
    timestamp: Date.now(),
    metadata: { source: 'voice', ...(extraMeta || {}) },
  };
}

const isValid = (m) => m && (m.role === 'user' || m.role === 'assistant')
  && typeof m.content === 'string' && m.content.trim().length > 0;

/**
 * Append one or more turns to a session's transcript. Accepts either ready-made
 * message objects (kept as-is) or {role, content, timestamp?} (normalized).
 * @returns {Promise<{appended:number, total:number, messages:Array}>}
 */
async function append(sessionId, messages) {
  const list = (Array.isArray(messages) ? messages : [messages]).filter(isValid);
  const norm = list.map((m) => (m.id && m.metadata
    ? m : makeMessage(m.role, m.content, m.timestamp ? { clientTimestamp: m.timestamp } : null)));
  if (norm.length === 0) return { appended: 0, total: 0, messages: [] };
  const existing = (await redis.get(KEY(sessionId))) || [];
  const updated = existing.concat(norm);
  await redis.set(KEY(sessionId), updated, TTL_SECONDS);
  return { appended: norm.length, total: updated.length, messages: norm };
}

/** The full transcript for a session (chronological), or []. */
async function get(sessionId) {
  return (await redis.get(KEY(sessionId))) || [];
}

module.exports = { append, get, makeMessage, isValid, KEY, TTL_SECONDS };
