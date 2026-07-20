'use strict';

/**
 * Voice Live configuration — single source of truth for how a FlowDesk voice
 * session is wired to Azure AI Voice Live (Phase 1.1).
 *
 * The whole model/transport decision lives on the SERVER. The browser only ever
 * receives an already-assembled session config + a connection descriptor, never
 * the Foundry key or the choice of LLM. Switching Dev↔prod transport or
 * native↔BYOM model is a single env var — no client change.
 *
 *   VOICE_LLM_MODEL   gpt-realtime (native, default) | haiku-byom (Claude BYOM)
 *   VOICE_TRANSPORT   direct (browser↔Azure, default) | proxy (via our backend)
 *
 * Protocol facts (verified against swedencentral, api-version 2025-10-01):
 *   - WS path is /voice-live/realtime
 *   - auth is the `api-key` QUERY param (a Bearer header only triggers a 302 that
 *     re-appends it), so the key must be injected server-side into the direct URL
 *   - the WS upgrade MUST negotiate the `realtime` subprotocol or the server stays
 *     silent after connect
 *   - `gpt-realtime` is a service-native model referenced via `model=` in the
 *     query; it needs no deployment
 *   - session.update is a STRICT object — unknown fields (e.g. model_provider) are
 *     rejected, so the model is chosen at connect (query), not in session.update
 *
 * @module instances/flowdesk/voice/voice-config
 */

const VOICE_API_VERSION = '2025-10-01';
const VOICE_WS_PATH = '/voice-live/realtime';
const VOICE_WS_SUBPROTOCOL = 'realtime';

// Six official UN languages — continuous language identification candidates.
// Azure continuous LID accepts up to 10 candidates and returns exactly one per
// utterance; it does NOT switch language mid-sentence (accepted UX limit).
const UN_LOCALE_CANDIDATES = ['ar-SA', 'zh-CN', 'en-US', 'fr-FR', 'ru-RU', 'es-ES'];

// One multilingual HD voice on start; per-language voice mapping is a later step.
const DEFAULT_VOICE = 'en-US-AvaMultilingualNeural';

/**
 * Model registry. `native` models are provided by Voice Live and referenced via
 * `model=` in the query. `byom` models are brought via the Foundry deployment;
 * the exact BYOM wire syntax is still being confirmed, so its `connect()` throws
 * a clear error until wired — Dev runs on the native default meanwhile.
 */
const VOICE_LLM_MODELS = {
  'gpt-realtime': {
    kind: 'native',
    model: 'gpt-realtime', // service-native, no deployment required
  },
  'haiku-byom': {
    kind: 'byom',
    // The Claude deployment name in the Foundry AIServices resource.
    model: process.env.AZURE_VOICE_DEPLOYMENT || 'claude-haiku-4-5',
    byomMode: 'byom-foundry-anthropic-messages', // exact wire syntax TBD
  },
};

function getActiveModelKey() {
  return process.env.VOICE_LLM_MODEL || 'gpt-realtime';
}

function getTransport() {
  return process.env.VOICE_TRANSPORT === 'proxy' ? 'proxy' : 'direct';
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[voice-config] missing required env: ${name}`);
  return v;
}

/** Host of the Foundry AIServices resource, e.g. unpa-voice-foundry.cognitiveservices.azure.com */
function foundryHost() {
  return new URL(requireEnv('AZURE_VOICE_FOUNDRY_ENDPOINT')).host;
}

/**
 * Build the query string for the Voice Live WS connection for a given model.
 *
 * `auth` controls the credential placed in the URL:
 *   - { serverKey: true }        → the permanent Foundry api-key. SERVER-SIDE ONLY
 *                                  (proxy upstream). MUST NEVER reach the browser.
 *   - { ephemeralToken: '...' }  → a short-lived token safe to hand to the browser.
 *   - none                       → no credential (caller adds one).
 *
 * The permanent key is intentionally unreachable from any client-facing path.
 */
function buildQuery(modelDef, auth = {}) {
  const parts = [`api-version=${VOICE_API_VERSION}`];
  if (modelDef.kind === 'native') {
    parts.push(`model=${encodeURIComponent(modelDef.model)}`);
  } else {
    // BYOM: wire syntax still being confirmed by the architect. We deliberately
    // fail loud rather than emit a URL known not to hand-shake, so a misconfig
    // (VOICE_LLM_MODEL=haiku-byom before BYOM is wired) is obvious.
    throw new Error(
      '[voice-config] BYOM (haiku-byom) Voice Live wire syntax is not wired yet; ' +
      'set VOICE_LLM_MODEL=gpt-realtime for Dev until BYOM is confirmed.'
    );
  }
  if (auth.serverKey) {
    parts.push(`api-key=${encodeURIComponent(requireEnv('AZURE_VOICE_FOUNDRY_KEY'))}`);
  } else if (auth.ephemeralToken) {
    parts.push(`access_token=${encodeURIComponent(auth.ephemeralToken)}`);
  }
  return parts.join('&');
}

/**
 * The strict `session.update.session` payload the client sends after
 * `session.created`. No model / provider fields here — the model is bound at
 * connect. `instructions` is supplied by the caller (reuses the text chat's
 * system prompt + a voice-brevity addendum).
 */
function buildSessionConfig({ instructions }) {
  return {
    modalities: ['text', 'audio'],
    instructions: instructions || 'You are a helpful assistant. Respond concisely for voice.',
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    input_audio_transcription: {
      model: 'azure-speech',
      language_candidates: UN_LOCALE_CANDIDATES,
    },
    input_audio_noise_reduction: { type: 'azure_deep_noise_suppression' },
    turn_detection: { type: 'azure_semantic_vad', threshold: 0.5, silence_duration_ms: 500 },
    voice: { name: DEFAULT_VOICE, type: 'azure-standard' },
  };
}

/**
 * Assemble everything the client needs. For `direct` transport, `wsUrl` is the
 * full Azure Voice Live URL (with api-key). For `proxy` transport, `wsUrl` is
 * null (the caller supplies our own relay URL) and the key stays server-side.
 *
 * @param {object} opts
 * @param {string} opts.instructions system prompt for the voice session
 * @returns {{transport, subprotocol, apiVersion, model, kind, wsUrl, sessionConfig}}
 */
function buildConnectionDescriptor({ instructions, ephemeralToken } = {}) {
  const modelKey = getActiveModelKey();
  const modelDef = VOICE_LLM_MODELS[modelKey];
  if (!modelDef) throw new Error(`[voice-config] unknown VOICE_LLM_MODEL: ${modelKey}`);

  const transport = getTransport();
  const descriptor = {
    transport,
    subprotocol: VOICE_WS_SUBPROTOCOL,
    apiVersion: VOICE_API_VERSION,
    model: modelDef.model,
    kind: modelDef.kind,
    sessionConfig: buildSessionConfig({ instructions }),
    wsUrl: null,
    // true when direct transport was requested but no browser-safe credential is
    // available (no ephemeral token) — the caller must fall back to the proxy.
    requiresEphemeralToken: false,
  };

  if (transport === 'direct') {
    if (ephemeralToken) {
      // Browser-safe: short-lived token in the URL, never the permanent key.
      const qs = buildQuery(modelDef, { ephemeralToken });
      descriptor.wsUrl = `wss://${foundryHost()}${VOICE_WS_PATH}?${qs}`;
    } else {
      // No ephemeral token → we will NOT embed the permanent key in a client URL.
      descriptor.requiresEphemeralToken = true;
    }
  }
  return descriptor;
}

/**
 * WS URL the backend PROXY uses to reach Azure. Contains the permanent key and is
 * SERVER-SIDE ONLY — it must never be returned to a browser.
 */
function buildUpstreamUrl() {
  const modelDef = VOICE_LLM_MODELS[getActiveModelKey()];
  if (!modelDef) throw new Error(`[voice-config] unknown VOICE_LLM_MODEL: ${getActiveModelKey()}`);
  const qs = buildQuery(modelDef, { serverKey: true });
  return `wss://${foundryHost()}${VOICE_WS_PATH}?${qs}`;
}

module.exports = {
  VOICE_API_VERSION,
  VOICE_WS_PATH,
  VOICE_WS_SUBPROTOCOL,
  UN_LOCALE_CANDIDATES,
  VOICE_LLM_MODELS,
  getActiveModelKey,
  getTransport,
  buildSessionConfig,
  buildConnectionDescriptor,
  buildUpstreamUrl,
};
