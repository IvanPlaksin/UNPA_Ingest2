'use strict';

/**
 * FlowDesk Voice Live controller (Phase 1.2 / 1.3).
 *
 *   POST /flowdesk/voice/token        → connection descriptor for a voice session
 *   POST /flowdesk/voice/transcript   → persist voice utterances into session history
 *   GET  /flowdesk/voice/transcript/:sessionId → read persisted voice transcript
 *
 * Mounted behind flowdeskUserMiddleware (see flowdesk.route.js), so req.flowdeskUser
 * is the authoritative identity. The Foundry key never leaves the server: the direct
 * transport bakes it into the wss URL server-side; the proxy transport keeps it here.
 *
 * @module instances/flowdesk/voice/voice.controller
 */

const voiceConfig = require('./voice-config');
const voiceProxy = require('./voice-proxy');
const redis = require('../../../services/redis.service');

const TRANSCRIPT_TTL_SECONDS = 60 * 60 * 24; // 24h — matches a working session lifetime
const TRANSCRIPT_KEY = (sessionId) => `voice:transcript:${sessionId}`;

// Base instruction for the voice session. Reuses the FlowDesk intake framing and
// adds a voice-brevity addendum (spoken answers must stay short). Full reuse of the
// interpreter's per-node prompts is a later refinement.
const VOICE_SYSTEM_PROMPT = [
  'You are the FlowDesk intake assistant for an internal UN service desk.',
  'You are speaking with the user by voice. Respond concisely and naturally, as in a spoken conversation.',
  'Keep answers to at most 2-3 sentences unless the user explicitly asks for detail.',
  'Detect and reply in the user\'s language (Arabic, Chinese, English, French, Russian, or Spanish).',
].join(' ');

let msgCounter = 0;
function makeMessage(role, content, extraMeta) {
  msgCounter += 1;
  return {
    id: `m${Date.now()}_${msgCounter}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata: { source: 'voice', ...(extraMeta || null) },
  };
}

/**
 * POST /flowdesk/voice/token
 * Body: { sessionId }
 * Returns the connection descriptor the client needs to open a voice session.
 * For `direct` transport wsUrl is the full Azure URL (key embedded server-side);
 * for `proxy` transport wsUrl is null and the client must use its own relay path.
 */
async function issueToken(req, res) {
  try {
    const sessionId = req.body?.sessionId;
    const userId = req.flowdeskUser?.userId || req.body?.userId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // No ephemeral token is minted yet: the Voice Live WS rejects STS tokens, so a
    // browser-safe short-lived credential mechanism is still unresolved. Until then
    // buildConnectionDescriptor will NOT put the permanent key in a client URL — for
    // direct transport it returns wsUrl:null + requiresEphemeralToken:true, and the
    // client must use the proxy relay (Phase 3). The permanent Foundry key never
    // leaves the server.
    const descriptor = voiceConfig.buildConnectionDescriptor({ instructions: VOICE_SYSTEM_PROMPT });
    const useProxy = descriptor.transport === 'proxy' || descriptor.requiresEphemeralToken;

    const payload = {
      sessionId,
      transport: descriptor.transport,
      subprotocol: descriptor.subprotocol,
      apiVersion: descriptor.apiVersion,
      model: descriptor.model,
      modelKind: descriptor.kind,
      // Present only when a browser-safe (ephemeral) credential is available.
      // Never contains the permanent Foundry key.
      wsUrl: descriptor.wsUrl,
      requiresEphemeralToken: descriptor.requiresEphemeralToken,
      // When true, the browser must use the proxy relay (direct not usable).
      useProxy,
      sessionConfig: descriptor.sessionConfig,
    };

    if (useProxy) {
      // Mint a short-lived, single-use ticket bound to this session/user. The
      // browser connects to the relay path with it; the permanent key stays server-side.
      payload.proxyPath = voiceProxy.PROXY_PATH;         // absolute node path (matched on upgrade)
      payload.proxySuffix = voiceProxy.PROXY_SUFFIX;     // relative to apiBaseUrl (/api/v1) — proxy-safe
      payload.ticket = await voiceProxy.mintTicket(sessionId, userId);
    }

    return res.json(payload);
  } catch (err) {
    console.error('[FlowDesk voice] token error:', err.message);
    return res.status(500).json({ error: 'voice token failed', detail: err.message });
  }
}

/**
 * POST /flowdesk/voice/transcript
 * Body: { sessionId, messages: [{ role, content, timestamp? }] }
 * Appends voice utterances to the server-side transcript for the session so they
 * survive reloads and can be merged with the unified chat history. Uses the same
 * message shape as the text chat (id/role/content/timestamp/metadata.source=voice).
 */
async function appendTranscript(req, res) {
  try {
    const { sessionId, messages } = req.body || {};
    const userId = req.flowdeskUser?.userId || req.body?.userId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] is required' });
    }

    const normalized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => makeMessage(m.role, m.content, m.timestamp ? { clientTimestamp: m.timestamp } : null));

    if (normalized.length === 0) {
      return res.status(400).json({ error: 'no valid messages (need {role: user|assistant, content: string})' });
    }

    const key = TRANSCRIPT_KEY(sessionId);
    const existing = (await redis.get(key)) || [];
    const updated = existing.concat(normalized);
    await redis.set(key, updated, TRANSCRIPT_TTL_SECONDS);

    return res.json({ sessionId, appended: normalized.length, total: updated.length });
  } catch (err) {
    console.error('[FlowDesk voice] transcript error:', err.message);
    return res.status(500).json({ error: 'voice transcript failed', detail: err.message });
  }
}

/**
 * GET /flowdesk/voice/transcript/:sessionId
 * Returns the persisted voice transcript (for reload / continuity).
 */
async function getTranscript(req, res) {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    const messages = (await redis.get(TRANSCRIPT_KEY(sessionId))) || [];
    return res.json({ sessionId, messages });
  } catch (err) {
    console.error('[FlowDesk voice] get transcript error:', err.message);
    return res.status(500).json({ error: 'voice get transcript failed', detail: err.message });
  }
}

module.exports = { issueToken, appendTranscript, getTranscript, VOICE_SYSTEM_PROMPT };
