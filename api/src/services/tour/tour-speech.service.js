'use strict';

/**
 * Narration audio — one sentence in, audio out.
 *
 * The chat's voice path is a duplex session: microphone in, recogniser, interpreter,
 * synthesiser, all over a socket. A tour needs a fraction of that — it has nothing to
 * listen to, it just has to say a sentence — so this uses the same Azure Speech
 * credentials and the same neural voices, and nothing else.
 *
 * Keeping it separate from `voice-orchestrator` is deliberate: that class owns a
 * conversation, and borrowing it to speak one line would drag a recogniser, a session
 * and a WebSocket along for the ride.
 *
 * Measured before building this (swedencentral, 68-character sentence):
 *   en-US-AvaMultilingualNeural  first chunk 1317ms, complete 1673ms, 3988ms of audio
 *   ru-RU-SvetlanaNeural         first chunk  540ms, complete 1045ms, 4838ms of audio
 *
 * Two consequences, both handled here: the wait is real enough that the client
 * prefetches the next step (see the package's Narrator), and the same sentence is
 * asked for repeatedly across users, so it is cached.
 *
 * @module services/tour/tour-speech.service
 */

const crypto = require('crypto');

const VOICE_BY_LANG = {
  en: 'en-US-AvaMultilingualNeural',
  ru: 'ru-RU-SvetlanaNeural',
  fr: 'fr-FR-VivienneMultilingualNeural',
  es: 'es-ES-ElviraNeural',
  ar: 'ar-SA-HamedNeural',
  zh: 'zh-CN-XiaoxiaoMultilingualNeural',
};
const DEFAULT_VOICE = VOICE_BY_LANG.en;

/**
 * TWO CACHES, AND THE FAR ONE IS THE POINT.
 *
 * Narration is identical for every user who takes a tour, so synthesising it per
 * visitor is pure waste — and worse, it is 0.5–2.1 seconds of silence each time.
 *
 * REDIS holds the audio across processes and restarts, so the first visitor after a
 * deploy does not pay for everyone. A process-local map sits in front of it purely to
 * avoid a round trip for the sentence being spoken right now.
 *
 * The cache is keyed by the TEXT, not by the step: two steps that say the same thing
 * share one recording, and — more importantly — editing a step's wording changes its
 * key, so the old audio simply stops being asked for. `invalidate()` then clears what
 * a scenario left behind, on the tour-graph change trigger.
 */
const CACHE_MAX = Number(process.env.TOUR_TTS_CACHE || 200);
const REDIS_TTL = Number(process.env.TOUR_TTS_TTL || 30 * 24 * 3600);   // 30 days
const REDIS_PREFIX = 'tour:tts:';
const _cache = new Map();   // key -> Buffer (process-local, in front of Redis)

let _redis = null;
function redis() {
  if (!_redis) _redis = require('../redis.service');
  return _redis;
}
function _setDeps(d) { if (d.redis) _redis = d.redis; }

const MAX_CHARS = 800;      // ~47s spoken; past this something is wrong upstream

let _sdk = null;
function sdk() {
  if (!_sdk) _sdk = require('microsoft-cognitiveservices-speech-sdk');
  return _sdk;
}

function creds() {
  const key = process.env.AZURE_VOICE_FOUNDRY_KEY;
  const region = process.env.AZURE_VOICE_REGION || 'swedencentral';
  if (!key) {
    const err = new Error('speech is not configured on this server');
    err.status = 503;
    throw err;
  }
  return { key, region };
}

const keyFor = (text, lang, voice) => crypto.createHash('sha1').update(`${lang}|${voice}|${text}`).digest('hex');

/**
 * @param {string} text
 * @param {{lang?:string, voice?:string, format?:'mp3'|'pcm'}} [opts]
 * @returns {Promise<{audio:Buffer, contentType:string, cached:boolean, ms:number}>}
 */
async function synthesize(text, opts = {}) {
  const clean = String(text || '').trim();
  if (!clean) { const e = new Error('nothing to say'); e.status = 400; throw e; }
  if (clean.length > MAX_CHARS) { const e = new Error(`narration too long (${clean.length} > ${MAX_CHARS})`); e.status = 400; throw e; }

  const lang = String(opts.lang || 'en').slice(0, 2).toLowerCase();
  const voice = opts.voice || VOICE_BY_LANG[lang] || DEFAULT_VOICE;
  // MP3 by default: an <audio> element plays it directly, where raw PCM would need
  // the client to assemble a WAV header before anything is audible.
  const wantPcm = opts.format === 'pcm';
  const contentType = wantPcm ? 'audio/l16; rate=24000' : 'audio/mpeg';

  const k = keyFor(clean, lang, `${voice}|${contentType}`);
  if (_cache.has(k)) return { audio: _cache.get(k), contentType, cached: 'memory', ms: 0 };

  // Redis before Azure: a tour that has been taken once is silent-free for everyone
  // after, across processes and restarts.
  const t0Redis = Date.now();
  try {
    const stored = await redis().get(`${REDIS_PREFIX}${k}`);
    if (stored && stored.b64) {
      const audio = Buffer.from(stored.b64, 'base64');
      remember(k, audio);
      return { audio, contentType, cached: 'redis', ms: Date.now() - t0Redis };
    }
  } catch { /* a cache miss and a cache outage are the same thing here */ }

  const { key, region } = creds();
  const s = sdk();
  const cfg = s.SpeechConfig.fromSubscription(key, region);
  cfg.speechSynthesisVoiceName = voice;
  cfg.speechSynthesisOutputFormat = wantPcm
    ? s.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm
    : s.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;

  const t0 = Date.now();
  const audio = await new Promise((resolve, reject) => {
    const synth = new s.SpeechSynthesizer(cfg, null);
    synth.speakTextAsync(
      clean,
      (result) => {
        synth.close();
        if (result && result.audioData && result.audioData.byteLength) resolve(Buffer.from(result.audioData));
        else reject(new Error(`speech returned no audio (reason ${result && result.reason})`));
      },
      (err) => { synth.close(); reject(new Error(String(err).slice(0, 200))); },
    );
  });

  remember(k, audio);
  // Written base64 because this Redis wrapper JSON-encodes everything it stores; a
  // Buffer would come back as an object of byte indices.
  try {
    await redis().set(`${REDIS_PREFIX}${k}`, { b64: audio.toString('base64'), lang, voice }, REDIS_TTL);
  } catch { /* the audio is already in hand; caching it is best-effort */ }

  return { audio, contentType, cached: false, ms: Date.now() - t0 };
}

/** Oldest out first. The sentence being spoken is the newest, so it is never evicted. */
function remember(k, audio) {
  _cache.set(k, audio);
  if (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
}

/**
 * Pre-generate the narration for a whole scenario.
 *
 * Called when a tour is created or edited, so the first visitor never waits: by the
 * time anyone presses "start", every sentence of every step, in every language it was
 * written in, is already sitting in Redis.
 *
 * Sequential on purpose — this runs off a seed or an edit, not a request, and firing
 * two dozen synthesis calls at once buys nothing but a rate limit.
 *
 * @param {object} scenario  as stored: steps with `content.text` per language
 * @param {{langs?:string[], onProgress?:Function}} [opts]
 */
async function warmScenario(scenario, opts = {}) {
  const out = { generated: 0, reused: 0, failed: 0, skipped: 0, ms: 0 };
  const t0 = Date.now();
  const steps = (scenario && scenario.steps) || [];

  for (const st of steps) {
    const content = st.content || {};
    const langs = opts.langs || Object.keys(content.text || {});
    for (const lang of (langs.length ? langs : ['en'])) {
      const text = typeof content.text === 'string' ? content.text : (content.text || {})[lang];
      if (!text) { out.skipped += 1; continue; }
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await synthesize(text, { lang });
        if (r.cached) out.reused += 1; else out.generated += 1;
        if (opts.onProgress) opts.onProgress({ stepId: st.id, lang, cached: r.cached, ms: r.ms });
      } catch (e) {
        // One unspeakable step must not stop the rest from being warmed.
        out.failed += 1;
        if (opts.onProgress) opts.onProgress({ stepId: st.id, lang, error: e.message });
      }
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

/**
 * Drop every cached recording. The blunt instrument, used on the tour-graph change
 * trigger: keys are content hashes, so a changed sentence is already unreachable —
 * this only reclaims the space its old recording occupied.
 */
async function invalidate() {
  _cache.clear();
  let removed = 0;
  try {
    const client = redis().getClient && redis().getClient();
    if (client && typeof client.keys === 'function') {
      const keys = await client.keys(`${REDIS_PREFIX}*`);
      for (const k of keys) { await client.del(k); removed += 1; }   // eslint-disable-line no-await-in-loop
    }
  } catch { /* best effort: stale audio expires on its own TTL */ }
  return { removed };
}

function stats() { return { memory: _cache.size, max: CACHE_MAX, ttl: REDIS_TTL, voices: VOICE_BY_LANG }; }

module.exports = {
  synthesize, warmScenario, invalidate, stats, _setDeps,
  VOICE_BY_LANG, MAX_CHARS, REDIS_PREFIX,
};
