import { jsxs as T, jsx as l } from "react/jsx-runtime";
import { useState as U, useRef as G, useEffect as v, useCallback as R } from "react";
function q(s, t) {
  const e = (s.apiBaseUrl || "").replace(/\/+$/, "");
  if (!e) throw new Error('[voice-launcher] apiBaseUrl is not configured. Pass it to <VoiceLauncher apiBaseUrl="…/api/v1" />.');
  return `${e}${t}`;
}
function F(s) {
  return s.fetchImpl || globalThis.fetch.bind(globalThis);
}
async function M(s, t = {}) {
  const e = typeof s.getAuthHeaders == "function" ? await s.getAuthHeaders() : null;
  return { ...t, ...e || {} };
}
const V = 24e3, K = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this._buf = []; this._target = 2400; /* ~100ms @24k */ }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      while (this._buf.length >= this._target) {
        const frame = this._buf.splice(0, this._target);
        this.port.postMessage(Float32Array.from(frame));
      }
    }
    return true;
  }
}
registerProcessor('fdvl-capture', CaptureProcessor);
`;
function z(s) {
  const t = new Int16Array(s.length);
  for (let n = 0; n < s.length; n++) {
    const r = Math.max(-1, Math.min(1, s[n]));
    t[n] = r < 0 ? r * 32768 : r * 32767;
  }
  const e = new Uint8Array(t.buffer);
  let i = "";
  for (let n = 0; n < e.length; n++) i += String.fromCharCode(e[n]);
  return btoa(i);
}
class j {
  constructor({ onFrame: t } = {}) {
    this.onFrame = t, this.ctx = null, this.stream = null, this.node = null, this.source = null;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: !0, noiseSuppression: !0, autoGainControl: !0 }
    });
    const t = window.AudioContext || window.webkitAudioContext;
    this.ctx = new t({ sampleRate: V }), this.ctx.state === "suspended" && await this.ctx.resume();
    const e = URL.createObjectURL(new Blob([K], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(e);
    } finally {
      URL.revokeObjectURL(e);
    }
    this.source = this.ctx.createMediaStreamSource(this.stream), this.node = new AudioWorkletNode(this.ctx, "fdvl-capture"), this.node.port.onmessage = (i) => {
      this.onFrame && this.onFrame(z(i.data));
    }, this.source.connect(this.node);
  }
  async stop() {
    try {
      this.node && (this.node.port.onmessage = null);
    } catch {
    }
    try {
      this.source && this.source.disconnect();
    } catch {
    }
    try {
      this.node && this.node.disconnect();
    } catch {
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
      }
      this.ctx = null;
    }
  }
}
const D = 24e3;
function J(s) {
  const t = atob(s), e = t.length, i = new Uint8Array(e);
  for (let n = 0; n < e; n++) i[n] = t.charCodeAt(n);
  return new Int16Array(i.buffer, 0, e >> 1);
}
function H(s) {
  const t = new Float32Array(s.length);
  for (let e = 0; e < s.length; e++) t[e] = Math.max(-1, s[e] / 32768);
  return t;
}
class Q {
  constructor({ onStarted: t, onEnded: e } = {}) {
    this.ctx = null, this.nextStartTime = 0, this.activeSources = /* @__PURE__ */ new Set(), this.playing = !1, this.onStarted = t, this.onEnded = e, this._endTimer = null, this.analyser = null, this._freq = null;
  }
  _ensureCtx() {
    if (!this.ctx) {
      const t = window.AudioContext || window.webkitAudioContext;
      this.ctx = new t({ sampleRate: D });
    }
    if (!this.analyser)
      try {
        this.analyser = this.ctx.createAnalyser(), this.analyser.fftSize = 256, this.analyser.smoothingTimeConstant = 0.8, this.analyser.connect(this.ctx.destination), this._freq = new Uint8Array(this.analyser.frequencyBinCount);
      } catch {
        this.analyser = null;
      }
    return this.ctx.state === "suspended" && this.ctx.resume(), this.ctx;
  }
  /** Create + resume the AudioContext eagerly, from inside a user gesture. */
  unlock() {
    const t = this._ensureCtx();
    return t && t.state === "running" && (this.nextStartTime = Math.max(this.nextStartTime, t.currentTime)), t && t.state;
  }
  /** Current TTS amplitude in [0,1] for the orb; 0 when idle. */
  getLevel() {
    if (!this.playing || !this.analyser || !this._freq) return 0;
    this.analyser.getByteFrequencyData(this._freq);
    let t = 0;
    for (let e = 0; e < this._freq.length; e++) t += this._freq[e];
    return t / this._freq.length / 255;
  }
  enqueue(t) {
    const e = this._ensureCtx(), i = H(J(t));
    if (i.length === 0) return;
    const n = e.createBuffer(1, i.length, D);
    n.getChannelData(0).set(i);
    const r = e.createBufferSource();
    r.buffer = n, r.connect(this.analyser || e.destination);
    const o = e.currentTime, a = Math.max(o, this.nextStartTime);
    this.playing || (this.playing = !0, this.onStarted && this.onStarted()), r.start(a), this.nextStartTime = a + n.duration, this.activeSources.add(r), r.onended = () => {
      this.activeSources.delete(r), this._endTimer && clearTimeout(this._endTimer), this._endTimer = setTimeout(() => {
        this.activeSources.size === 0 && this.playing && (this.playing = !1, this.onEnded && this.onEnded());
      }, 60);
    };
  }
  /** Barge-in / cancel: stop everything scheduled. */
  clear() {
    for (const t of this.activeSources)
      try {
        t.onended = null, t.stop();
      } catch {
      }
    this.activeSources.clear(), this.nextStartTime = this.ctx ? this.ctx.currentTime : 0, this.playing && (this.playing = !1, this.onEnded && this.onEnded());
  }
  async close() {
    if (this.clear(), this.ctx) {
      try {
        await this.ctx.close();
      } catch {
      }
      this.ctx = null;
    }
  }
}
const c = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  ERROR: "error"
}, $ = { listening: c.LISTENING, processing: c.PROCESSING, speaking: c.SPEAKING }, X = 15e3;
class Y {
  constructor({ sessionId: t, userId: e, lang: i, voice: n, config: r, onState: o, onTranscript: a, onChoices: d, onError: f } = {}) {
    this.sessionId = t, this.userId = e || "voice-user", this.lang = i || null, this.voice = n || null, this.config = r || {}, this.onState = o || (() => {
    }), this.onTranscript = a || (() => {
    }), this.onChoices = d || (() => {
    }), this.onError = f || (() => {
    }), this.ws = null, this.capture = null, this.playback = null, this.state = c.IDLE, this._closed = !1, this._idleTimer = null;
  }
  _setState(t) {
    this.state = t, this.onState(t);
  }
  // V2 idle auto-disable: armed only when the agent has finished speaking and we
  // are listening; any activity clears it; on timeout the session ends.
  _armIdle() {
    this._clearIdle(), this._idleTimer = setTimeout(() => {
      this._idleTimer = null, this._closed || this.stop();
    }, X);
  }
  _clearIdle() {
    this._idleTimer && (clearTimeout(this._idleTimer), this._idleTimer = null);
  }
  /** Arm the idle timer once the current utterance's audio has fully drained. */
  _maybeArmIdleAfterSpeech() {
    this.state === c.LISTENING && (!this.playback || !this.playback.playing) && this._armIdle();
  }
  /** Current TTS output amplitude [0,1] for the pulsing orb. */
  getLevel() {
    return this.playback ? this.playback.getLevel() : 0;
  }
  async start() {
    this._setState(c.CONNECTING), this._ensurePlayback();
    try {
      this.playback.unlock();
    } catch {
    }
    try {
      const t = await this._fetchToken(), e = await M(this.config), i = this._buildWsUrl(t, e);
      await this._openWs(i, t);
    } catch (t) {
      this._fail(t);
    }
  }
  async _fetchToken() {
    const t = await M(this.config, { "Content-Type": "application/json" }), e = await F(this.config)(q(this.config, "/flowdesk/voice/token"), {
      method: "POST",
      headers: t,
      credentials: "include",
      body: JSON.stringify({ sessionId: this.sessionId, userId: this.userId })
    });
    if (!e.ok) throw new Error(`voice token failed (HTTP ${e.status})`);
    const i = await e.json();
    if (i.wsUrl) throw new Error("unexpected direct wsUrl (key-leak guard)");
    if (!i.useProxy || !i.ticket) throw new Error("voice token missing proxy fields");
    return i;
  }
  _buildWsUrl(t, e = {}) {
    const i = new URL(this.config.apiBaseUrl, window.location.origin), n = i.protocol === "https:" ? "wss:" : "ws:", r = i.pathname.replace(/\/+$/, ""), o = t.proxySuffix || "/flowdesk/voice/proxy", a = new URLSearchParams();
    a.set("sessionId", this.sessionId), a.set("ticket", t.ticket), this.lang && a.set("lang", this.lang), this.voice && a.set("voice", this.voice);
    const d = (b, ...k) => {
      for (const g of k)
        if (b && b[g]) return b[g];
      return null;
    }, f = d(e, "API-Key", "Api-Key", "api-key", "apikey");
    f && a.set("api_key", f);
    const w = d(e, "Authorization", "authorization");
    return w && /^Bearer\s+/i.test(w) && a.set("access_token", w.replace(/^Bearer\s+/i, "")), `${n}//${i.host}${r}${o}?${a.toString()}`;
  }
  _openWs(t, e) {
    return new Promise((i, n) => {
      const r = new WebSocket(t, [e.subprotocol || "realtime"]);
      this.ws = r;
      let o = !1;
      r.onopen = async () => {
        o || (o = !0, i());
        try {
          await this._startCapture(), this._setState(c.LISTENING);
        } catch (a) {
          this._fail(a);
        }
      }, r.onmessage = (a) => {
        let d;
        try {
          d = JSON.parse(a.data);
        } catch {
          return;
        }
        this._onServerEvent(d);
      }, r.onerror = () => {
        o || (o = !0, n(new Error("voice relay connection error")));
      }, r.onclose = () => {
        this._closed || this._teardown();
      };
    });
  }
  _onServerEvent(t) {
    switch (t.type) {
      case "state":
        $[t.status] && (this._setState($[t.status]), $[t.status] === c.LISTENING ? this._maybeArmIdleAfterSpeech() : this._clearIdle());
        break;
      case "barge_in":
        this._clearIdle(), this.playback && this.playback.clear();
        break;
      case "transcript":
        this._clearIdle(), t.text && this.onTranscript(t.role || "assistant", t.text, { language: t.lang, meta: t.meta || null });
        break;
      case "choices":
        this.onChoices(t.items || []);
        break;
      case "audio":
        t.data && (this._clearIdle(), this._ensurePlayback(), this.playback.enqueue(t.data));
        break;
      case "audioDone":
        break;
      case "error":
        this.onError(new Error(t.message || "voice error"));
        break;
    }
  }
  _ensurePlayback() {
    this.playback || (this.playback = new Q({ onEnded: () => this._maybeArmIdleAfterSpeech() }));
  }
  async _startCapture() {
    this.capture = new j({
      onFrame: (t) => {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "audio", data: t }));
      }
    }), await this.capture.start();
  }
  _fail(t) {
    this._setState(c.ERROR), this.onError(t instanceof Error ? t : new Error(String(t))), this._teardown();
  }
  async _teardown() {
    if (!this._closed) {
      this._closed = !0, this._clearIdle();
      try {
        this.capture && await this.capture.stop();
      } catch {
      }
      try {
        this.playback && await this.playback.close();
      } catch {
      }
      try {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "stop" }));
      } catch {
      }
      try {
        this.ws && this.ws.close();
      } catch {
      }
    }
  }
  async stop() {
    await this._teardown(), this.state !== c.ERROR && this._setState(c.IDLE);
  }
  /** V2: request a zero-query anchor explanation over the open WS ("Get help"). */
  sendExplain(t) {
    this.ws && this.ws.readyState === WebSocket.OPEN && t && t.id && this.ws.send(JSON.stringify({ type: "explain", anchor: { id: t.id, title: t.title } }));
  }
}
function Z() {
  return `vl-${typeof crypto < "u" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}
function tt({ apiBaseUrl: s, userId: t, getAuthHeaders: e, fetchImpl: i, lang: n, voice: r, sessionId: o, onTranscript: a, onError: d } = {}) {
  const [f, w] = U(c.IDLE), [b, k] = U(null), [g, S] = U(0), h = G(null), u = G(null);
  v(() => {
    if (!(f !== c.IDLE && f !== c.ERROR)) {
      S(0);
      return;
    }
    let x = !0;
    const E = () => {
      x && (S(h.current ? h.current.getLevel() : 0), u.current = requestAnimationFrame(E));
    };
    return u.current = requestAnimationFrame(E), () => {
      x = !1, u.current && cancelAnimationFrame(u.current);
    };
  }, [f]);
  const m = R(async () => {
    const y = h.current;
    h.current = null, y && await y.stop(), w(c.IDLE);
  }, []), _ = R(async () => {
    if (h.current) return;
    k(null);
    const y = new Y({
      sessionId: o || Z(),
      userId: t,
      lang: n,
      voice: r,
      config: { apiBaseUrl: s, userId: t, getAuthHeaders: e, fetchImpl: i },
      onState: w,
      onTranscript: (x, E, A) => {
        a && a(x, E, A);
      },
      onError: (x) => {
        k(x), w(c.ERROR), d && d(x), h.current = null;
      }
    });
    h.current = y, await y.start();
  }, [s, t, e, i, n, r, o, a, d]), p = R(() => h.current ? m() : _(), [_, m]), P = R(async (y) => {
    h.current || await _(), h.current && h.current.sendExplain(y);
  }, [_]);
  v(() => () => {
    h.current && h.current.stop();
  }, []);
  const N = f !== c.IDLE && f !== c.ERROR;
  return { state: f, level: g, error: b, isActive: N, start: _, stop: m, toggle: p, explain: P };
}
const et = {
  start: "Talk to the assistant",
  stop: "End the conversation",
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  idle: "Voice assistant",
  error: "Connection failed — tap to try again",
  openText: "Open text chat",
  closeText: "Close text chat"
}, st = {
  [c.CONNECTING]: "thinking",
  [c.LISTENING]: "listening",
  [c.PROCESSING]: "thinking",
  [c.SPEAKING]: "speaking"
};
function it() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "24",
      height: "24",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ l("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }),
        /* @__PURE__ */ l("path", { d: "M5 10a7 7 0 0 0 14 0" }),
        /* @__PURE__ */ l("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
      ]
    }
  );
}
function nt() {
  return /* @__PURE__ */ l(
    "svg",
    {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ l("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" })
    }
  );
}
function rt() {
  return /* @__PURE__ */ T(
    "svg",
    {
      width: "24",
      height: "24",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.9",
      strokeLinecap: "round",
      children: [
        /* @__PURE__ */ l("line", { x1: "4", y1: "10", x2: "4", y2: "14" }),
        /* @__PURE__ */ l("line", { x1: "8", y1: "7", x2: "8", y2: "17" }),
        /* @__PURE__ */ l("line", { x1: "12", y1: "4", x2: "12", y2: "20" }),
        /* @__PURE__ */ l("line", { x1: "16", y1: "7", x2: "16", y2: "17" }),
        /* @__PURE__ */ l("line", { x1: "20", y1: "10", x2: "20", y2: "14" })
      ]
    }
  );
}
function ct({
  apiBaseUrl: s,
  userId: t,
  getAuthHeaders: e,
  fetchImpl: i,
  lang: n,
  voice: r,
  sessionId: o,
  position: a = "bottom-right",
  size: d = 60,
  labels: f,
  onTranscript: w,
  onError: b,
  onToggleTextChat: k,
  isTextChatOpen: g = !1,
  onActiveChange: S,
  onState: h
}) {
  const u = { ...et, ...f || {} }, { state: m, level: _, isActive: p, toggle: P, stop: N, explain: y } = tt({ apiBaseUrl: s, userId: t, getAuthHeaders: e, fetchImpl: i, lang: n, voice: r, sessionId: o, onTranscript: w, onError: b });
  v(() => {
    S && S(p);
  }, [p, S]), v(() => {
    h && h(m);
  }, [m, h]), v(() => {
    if (!p) return;
    const I = (L) => {
      L.key === "Escape" && N();
    };
    return document.addEventListener("keydown", I), () => document.removeEventListener("keydown", I);
  }, [p, N]), v(() => {
    const I = (L) => {
      const C = L && L.detail;
      C && C.anchorId && y({ id: C.anchorId, title: C.anchorTitle });
    };
    return window.addEventListener("altioraVoiceExplain", I), () => window.removeEventListener("altioraVoiceExplain", I);
  }, [y]);
  const x = {
    [c.CONNECTING]: u.connecting,
    [c.LISTENING]: u.listening,
    [c.PROCESSING]: u.thinking,
    [c.SPEAKING]: u.speaking
  }[m] || u.idle, A = m === c.ERROR ? u.error : u.start, O = st[m] || "idle", B = Math.max(0, Math.min(1, Number(_) || 0)), W = O === "speaking" || O === "listening" ? 1 + B * 0.45 : 1;
  return /* @__PURE__ */ T("div", { className: `fdvl-dock fdvl-dock--${a}`, children: [
    /* @__PURE__ */ T(
      "button",
      {
        type: "button",
        className: `fdvl-fab${p ? " is-active" : ""}`,
        style: { "--fab-size": `${d}px`, "--halo-scale": W },
        "data-voice-state": m,
        onClick: P,
        "aria-pressed": p,
        "aria-label": p ? u.stop : A,
        title: p ? x : A,
        children: [
          p && /* @__PURE__ */ l("span", { className: `fdvl-halo fdvl-halo--${O}`, "aria-hidden": "true" }),
          /* @__PURE__ */ l("span", { className: "fdvl-fab-core", children: p ? /* @__PURE__ */ l(rt, {}) : /* @__PURE__ */ l(it, {}) })
        ]
      }
    ),
    typeof k == "function" && /* @__PURE__ */ l(
      "button",
      {
        type: "button",
        className: `fdvl-text-toggle${g ? " is-open" : ""}`,
        onClick: k,
        "aria-pressed": g,
        "aria-label": g ? u.closeText : u.openText,
        title: g ? u.closeText : u.openText,
        children: /* @__PURE__ */ l(nt, {})
      }
    )
  ] });
}
function lt({ state: s = "idle", amplitude: t = 0, size: e = 140, label: i, className: n = "" }) {
  const r = Math.max(0, Math.min(1, Number(t) || 0)), a = s === "speaking" || s === "listening" ? 1 + r * 0.35 : 1;
  return /* @__PURE__ */ l(
    "div",
    {
      className: `fdvl-orb fdvl-orb--${s}${n ? ` ${n}` : ""}`,
      style: { "--orb-size": `${e}px`, "--orb-scale": a },
      role: "status",
      "aria-label": i || s,
      children: /* @__PURE__ */ l("span", { className: "fdvl-orb-core" })
    }
  );
}
function ht({ response: s, onControlClick: t, onClose: e, labels: i = {} }) {
  if (!s || !s.text) return null;
  const r = (Array.isArray(s.controls) ? s.controls : []).flatMap((o) => (Array.isArray(o.options) ? o.options : []).map((a) => ({
    key: `${o.id || o.slotId}:${a.value}`,
    label: a.label || String(a.value),
    action: { slotId: o.slotId, action: o.type === "confirm" ? "confirm" : "select", value: a.value }
  })));
  return /* @__PURE__ */ T("div", { className: "fdvl-response-panel", role: "status", "aria-live": "polite", children: [
    /* @__PURE__ */ l(
      "button",
      {
        type: "button",
        className: "fdvl-response-close",
        onClick: e,
        "aria-label": i.close || "Close",
        title: i.close || "Close",
        children: "×"
      }
    ),
    /* @__PURE__ */ l("div", { className: "fdvl-response-text", children: s.text }),
    r.length > 0 && /* @__PURE__ */ l("div", { className: "fdvl-response-chips", children: r.map((o) => /* @__PURE__ */ l(
      "button",
      {
        type: "button",
        className: "fdvl-response-chip",
        onClick: () => t && t(o.action, o.label),
        children: o.label
      },
      o.key
    )) })
  ] });
}
export {
  ct as VoiceLauncher,
  lt as VoiceOrb,
  ht as VoiceResponsePanel,
  Y as VoiceSession,
  c as VoiceState,
  ct as default,
  tt as useVoice
};
//# sourceMappingURL=flowdesk-voice-launcher.js.map
