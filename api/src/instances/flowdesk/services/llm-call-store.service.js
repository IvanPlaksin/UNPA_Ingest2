'use strict';

/**
 * What was actually sent to the model, and what came back — kept for an hour.
 *
 * The Timeline panel can say a turn spent 2.8 seconds in `claude-haiku #2`, but
 * not what that call was. Reading a slow or wrong turn means seeing the exact
 * system prompt, the exact conversation and the exact reply — reconstructing it
 * from the code is guesswork, because the prompt is assembled from a graph, a
 * contract, tool schemas and a per-turn brief.
 *
 * REDIS, WITH A ONE-HOUR TTL, ON PURPOSE. These payloads are large (a system
 * prompt alone is ~14 KB) and they are debugging material, not a record: they
 * exist while someone is looking at the session that produced them and then go
 * away. Nothing downstream may depend on them being there — every reader treats
 * a miss as ordinary.
 *
 * @module instances/flowdesk/services/llm-call-store.service
 */

const TTL_SECONDS = 60 * 60;

/** Roughly 400 KB per call: enough for a long conversation, short of unbounded. */
const MAX_CHARS = 400_000;

const KEY = (sessionId, seq) => `flowdesk:llmcall:${sessionId}:${seq}`;

function store() {
  return require('../../../services/redis.service');
}

/** Cut a value down to size, saying so, rather than dropping it silently. */
function clamp(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (!s) return s;
  if (s.length <= MAX_CHARS) return s;
  return `${s.slice(0, MAX_CHARS)}\n… truncated at ${MAX_CHARS} characters …`;
}

/**
 * Record one model call.
 *
 * Best-effort in the strongest sense: a failure here must never surface in the
 * conversation. The user is mid-turn; losing a debugging artefact is nothing,
 * losing their answer is everything.
 *
 * @param {{sessionId:string, seq:number|string, model:string, system:*, messages:Array,
 *          tools?:Array, response:*, durationMs?:number,
 *          cacheReadTokens?:number, cacheCreationTokens?:number}} call
 * @returns {Promise<string|null>} the key it was stored under, or null
 */
async function recordCall(call) {
  if (!call || !call.sessionId) return null;
  const key = KEY(call.sessionId, call.seq);
  try {
    // The write is reported, not assumed. redis.service.set answers `false`
    // rather than throwing when the client is not ready yet — which it is not for
    // the first turns after a restart — and returning the key regardless put a
    // link on the span that led nowhere. A span that claims a payload it does not
    // have is worse than a span with no link at all.
    const ok = await store().set(key, {
      sessionId: call.sessionId,
      seq: call.seq,
      model: call.model || null,
      ts: new Date().toISOString(),
      durationMs: call.durationMs ?? null,
      cacheReadTokens: call.cacheReadTokens || 0,
      cacheCreationTokens: call.cacheCreationTokens || 0,
      // The system prompt travels as it was sent: a string, or the blocks the
      // caching split produced. The reader wants to see the split too.
      system: typeof call.system === 'string'
        ? clamp(call.system)
        : (Array.isArray(call.system) ? call.system.map((b) => ({ text: clamp(b.text) })) : null),
      messages: clamp(call.messages),
      toolNames: Array.isArray(call.tools) ? call.tools.map((t) => t.name) : [],
      response: clamp(call.response),
    }, TTL_SECONDS);
    return ok === false ? null : key;
  } catch {
    return null; // debugging material is never worth a turn
  }
}

/**
 * Read one recorded call back. Returns null when the hour has passed, which is
 * the ordinary case rather than an error.
 */
async function getCall(key) {
  if (!key || !String(key).startsWith('flowdesk:llmcall:')) return null;
  try {
    const raw = await store().get(String(key));
    if (!raw) return null;
    const call = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // `messages` was clamped to a string on the way in; hand it back parsed when
    // it survived whole, so the UI does not have to know about the clamping.
    if (typeof call.messages === 'string') {
      try { call.messages = JSON.parse(call.messages); } catch { /* truncated — leave the text */ }
    }
    if (typeof call.response === 'string') {
      try { call.response = JSON.parse(call.response); } catch { /* as above */ }
    }
    return call;
  } catch {
    return null;
  }
}

module.exports = { recordCall, getCall, TTL_SECONDS, KEY };
