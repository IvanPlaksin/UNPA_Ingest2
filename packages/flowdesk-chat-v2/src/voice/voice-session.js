/**
 * VoiceSession — orchestrates one live voice conversation (decoupled pipeline).
 *
 * The backend runs Azure STT → the FlowDesk interpreter (same sessionId as text)
 * → Azure TTS, so the voice agent obeys the SAME dialogue rules as text. This
 * client only streams mic audio up and plays TTS audio down; it does not talk to
 * any Azure LLM directly.
 *
 * Flow: POST /voice/token (ticket, no key) → open the backend WS relay → stream
 * mic PCM16 as { type:'audio' } → render { transcript | audio | choices | state }.
 *
 * Wire protocol (server side = voice-orchestrator.js):
 *   client → { type:'audio', data:<base64 pcm16 24k> } | { type:'stop' }
 *   server → { type:'state', status } | { type:'transcript', role, text, lang? }
 *          | { type:'choices', items } | { type:'audio', data } | { type:'audioDone' }
 *          | { type:'error', message }
 */

import { apiUrl, getFetch, buildHeaders, getConfig } from '../config/runtime-config';
import { AudioCapture } from './audio-capture';
import { AudioPlayback } from './audio-playback';

export const VoiceState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
};

const STATE_MAP = {
  listening: VoiceState.LISTENING,
  processing: VoiceState.PROCESSING,
  speaking: VoiceState.SPEAKING,
};

// Universal rule (V2): after the agent finishes speaking, wait this long for the
// user; if silent, end the session. Reset by any user/agent activity.
const IDLE_TIMEOUT_MS = 15000;

export class VoiceSession {
  constructor({ sessionId, userId, lang, voice, onState, onTranscript, onChoices, onError } = {}) {
    this.sessionId = sessionId;
    this.userId = userId || getConfig().userId;
    // The UI-selected interface language. Sent to the relay so the agent
    // recognizes, interprets and speaks in it — never auto-switching to whatever
    // Azure's language ID guesses from the audio.
    this.lang = lang || null;
    // CS-2: the user-selected AI voice (Azure Neural name); the relay/orchestrator
    // uses it for TTS, overriding the per-language default.
    this.voice = voice || null;
    this.onState = onState || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onChoices = onChoices || (() => {});
    this.onError = onError || (() => {});

    this.ws = null;
    this.capture = null;
    this.playback = null;
    this.state = VoiceState.IDLE;
    this._closed = false;
    this._idleTimer = null;
  }

  _setState(s) { this.state = s; this.onState(s); }

  // V2 idle auto-disable: armed only once the agent's audio has fully drained and
  // we are listening; any activity clears it; on timeout the session ends.
  _armIdle() {
    this._clearIdle();
    this._idleTimer = setTimeout(() => { this._idleTimer = null; if (!this._closed) this.stop(); }, IDLE_TIMEOUT_MS);
  }
  _clearIdle() { if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; } }
  _maybeArmIdleAfterSpeech() { if (this.state === VoiceState.LISTENING && (!this.playback || !this.playback.playing)) this._armIdle(); }

  /** Phase 6: current TTS output amplitude [0,1] for the pulsing orb. */
  getLevel() { return this.playback ? this.playback.getLevel() : 0; }

  async start() {
    this._setState(VoiceState.CONNECTING);
    // Unlock the playback AudioContext NOW — start() runs synchronously up to the
    // first await, i.e. still inside the Live Chat click gesture. The first TTS
    // `audio` frame arrives later (outside any gesture), when a browser would keep
    // a freshly-created context suspended and silently drop the agent's voice.
    this._ensurePlayback();
    try { this.playback.unlock(); } catch (_) { /* best-effort */ }
    try {
      const token = await this._fetchToken();
      // A browser WebSocket handshake cannot carry custom headers, so fold the
      // host's injected header auth (e.g. Altiora's API-Key gate + bearer) into
      // the URL as query params — the reverse proxy accepts them there.
      const authHeaders = await buildHeaders();
      const wsUrl = this._buildWsUrl(token, authHeaders);
      await this._openWs(wsUrl, token);
    } catch (err) {
      this._fail(err);
    }
  }

  async _fetchToken() {
    const headers = await buildHeaders({ 'Content-Type': 'application/json' });
    const res = await getFetch()(apiUrl('/flowdesk/voice/token'), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ sessionId: this.sessionId, userId: this.userId }),
    });
    if (!res.ok) throw new Error(`voice token failed (HTTP ${res.status})`);
    const t = await res.json();
    if (t.wsUrl) throw new Error('unexpected direct wsUrl from token endpoint (key-leak guard)');
    if (!t.useProxy || !t.ticket) throw new Error('voice token missing proxy fields');
    return t;
  }

  _buildWsUrl(token, authHeaders = {}) {
    // Relay URL relative to apiBaseUrl so it traverses the same reverse proxy as
    // the REST calls. apiBaseUrl already ends at /api/v1; append the voice suffix.
    const base = new URL(getConfig().apiBaseUrl, window.location.origin);
    const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = base.pathname.replace(/\/+$/, '');
    const suffix = token.proxySuffix || '/flowdesk/voice/proxy';
    const params = new URLSearchParams();
    params.set('sessionId', this.sessionId);
    params.set('ticket', token.ticket);
    // Selected UI language → the relay uses it for STT/interpreter/TTS (no auto-switch).
    if (this.lang) params.set('lang', this.lang);
    if (this.voice) params.set('voice', this.voice); // CS-2: user-chosen TTS voice
    // Header-less transport: pass any injected header auth through as query
    // params. Altiora's API-Key gate reads ?api_key and its JWT reads
    // ?access_token; a direct (no-proxy) backend simply ignores the extras.
    const pick = (obj, ...names) => { for (const n of names) { if (obj && obj[n]) return obj[n]; } return null; };
    const apiKey = pick(authHeaders, 'API-Key', 'Api-Key', 'api-key', 'apikey');
    if (apiKey) params.set('api_key', apiKey);
    const authz = pick(authHeaders, 'Authorization', 'authorization');
    if (authz && /^Bearer\s+/i.test(authz)) params.set('access_token', authz.replace(/^Bearer\s+/i, ''));
    return `${scheme}//${base.host}${basePath}${suffix}?${params.toString()}`;
  }

  _openWs(wsUrl, token) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, [token.subprotocol || 'realtime']);
      this.ws = ws;
      let settled = false;

      ws.onopen = async () => {
        if (!settled) { settled = true; resolve(); }
        try {
          await this._startCapture(); // throws on mic-denied → caught below
          this._setState(VoiceState.LISTENING);
        } catch (err) {
          this._fail(err);
        }
      };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        this._onServerEvent(msg);
      };
      ws.onerror = () => { if (!settled) { settled = true; reject(new Error('voice relay connection error')); } };
      ws.onclose = () => { if (!this._closed) this._teardown(); };
    });
  }

  _onServerEvent(msg) {
    switch (msg.type) {
      case 'state':
        // Do NOT flush on a normal speaking → listening transition: TTS is
        // streamed ahead faster than realtime, so audio is still buffered when
        // that arrives and flushing would cut the reply off. Barge-in is a
        // distinct 'barge_in' event (below) — the only thing that flushes.
        if (STATE_MAP[msg.status]) {
          this._setState(STATE_MAP[msg.status]);
          // V2: entering listening with nothing left to play → start the 15s
          // window; leaving it (processing/speaking) is activity → cancel.
          if (STATE_MAP[msg.status] === VoiceState.LISTENING) this._maybeArmIdleAfterSpeech();
          else this._clearIdle();
        }
        break;
      case 'barge_in':
        this._clearIdle();
        if (this.playback) this.playback.clear();
        break;
      case 'transcript':
        // meta carries the turn-contract (controls[]/resolveChoices/…) so voice
        // replies render the same embedded controls as text replies.
        this._clearIdle(); // a turn = activity
        if (msg.text) this.onTranscript(msg.role || 'assistant', msg.text, { language: msg.lang, meta: msg.meta || null });
        break;
      case 'choices':
        this.onChoices(msg.items || []);
        break;
      case 'audio':
        if (msg.data) { this._clearIdle(); this._ensurePlayback(); this.playback.enqueue(msg.data); }
        break;
      case 'audioDone':
        // playback drains on its own; state is driven by server 'state' events.
        break;
      case 'error':
        this.onError(new Error(msg.message || 'voice error'));
        break;
      default:
        break;
    }
  }

  _ensurePlayback() {
    // onEnded fires when scheduled TTS fully drains — the true end of speech, so
    // the 15s idle window starts here (not on the state event, which arrives
    // while audio is still buffered ahead).
    if (!this.playback) this.playback = new AudioPlayback({ onEnded: () => this._maybeArmIdleAfterSpeech() });
  }

  async _startCapture() {
    this.capture = new AudioCapture({
      onFrame: (b64) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'audio', data: b64 }));
        }
      },
    });
    await this.capture.start();
  }

  _fail(err) {
    this._setState(VoiceState.ERROR);
    this.onError(err instanceof Error ? err : new Error(String(err)));
    this._teardown();
  }

  async _teardown() {
    if (this._closed) return;
    this._closed = true;
    this._clearIdle();
    try { this.capture && (await this.capture.stop()); } catch (_) {}
    try { this.playback && (await this.playback.close()); } catch (_) {}
    try { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'stop' })); } catch (_) {}
    try { this.ws && this.ws.close(); } catch (_) {}
  }

  async stop() {
    await this._teardown();
    if (this.state !== VoiceState.ERROR) this._setState(VoiceState.IDLE);
  }

  /** V2: request a zero-query anchor explanation over the open WS ("Get help"). */
  sendExplain(anchor) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && anchor && anchor.id) {
      this.ws.send(JSON.stringify({ type: 'explain', anchor: { id: anchor.id, title: anchor.title } }));
    }
  }
}
