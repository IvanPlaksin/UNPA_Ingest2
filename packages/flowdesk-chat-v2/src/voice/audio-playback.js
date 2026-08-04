/**
 * Streaming PCM16 playback for Voice Live TTS.
 *
 * Azure sends `response.audio.delta` frames as base64 PCM16 (24 kHz, mono, LE).
 * We decode each frame to Float32 and schedule it back-to-back on a single
 * AudioContext timeline so playback is gapless. `clear()` (barge-in) stops the
 * current utterance immediately.
 */

const SAMPLE_RATE = 24000;

function base64ToInt16(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, len >> 1);
}

function int16ToFloat32(int16) {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = Math.max(-1, int16[i] / 0x8000);
  return out;
}

export class AudioPlayback {
  constructor({ onStarted, onEnded } = {}) {
    this.ctx = null;
    this.nextStartTime = 0;
    this.activeSources = new Set();
    this.playing = false;
    this.onStarted = onStarted;
    this.onEnded = onEnded;
    this._endTimer = null;
    // Phase 6: a shared AnalyserNode on the output path lets the UI read the TTS
    // amplitude for the pulsing voice orb. Every source connects through it.
    this.analyser = null;
    this._freq = null;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ sampleRate: SAMPLE_RATE });
    }
    if (!this.analyser) {
      try {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
        this.analyser.connect(this.ctx.destination);
        this._freq = new Uint8Array(this.analyser.frequencyBinCount);
      } catch (_) { this.analyser = null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  /**
   * Current output amplitude in [0,1] for the pulsing orb (Phase 6). Mean of the
   * frequency magnitudes, normalized; 0 when idle or when no analyser is available.
   */
  getLevel() {
    if (!this.playing || !this.analyser || !this._freq) return 0;
    this.analyser.getByteFrequencyData(this._freq);
    let sum = 0;
    for (let i = 0; i < this._freq.length; i++) sum += this._freq[i];
    return sum / this._freq.length / 255;
  }

  /**
   * Create + resume the output AudioContext eagerly. MUST be called from within a
   * user gesture (the Live Chat click) — browsers keep an AudioContext suspended
   * if it is first touched outside a gesture, which silences the agent's TTS even
   * though audio frames arrive. Called at session start so playback is unlocked
   * before the first `audio` frame (which arrives outside any gesture).
   */
  unlock() {
    const ctx = this._ensureCtx();
    // Nudge the timeline forward so the first real frame schedules cleanly.
    if (ctx && ctx.state === 'running') this.nextStartTime = Math.max(this.nextStartTime, ctx.currentTime);
    return ctx && ctx.state;
  }

  /** Enqueue one base64 PCM16 delta for gapless playback. */
  enqueue(base64) {
    const ctx = this._ensureCtx();
    const float32 = int16ToFloat32(base64ToInt16(base64));
    if (float32.length === 0) return;

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Route through the analyser (Phase 6) so the orb can read amplitude; the
    // analyser is wired to ctx.destination. Fall back to direct output if absent.
    src.connect(this.analyser || ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    if (!this.playing) { this.playing = true; this.onStarted && this.onStarted(); }
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      // Fire onEnded once the queue drains.
      if (this._endTimer) clearTimeout(this._endTimer);
      this._endTimer = setTimeout(() => {
        if (this.activeSources.size === 0 && this.playing) {
          this.playing = false;
          this.onEnded && this.onEnded();
        }
      }, 60);
    };
  }

  /** Barge-in / cancel: stop everything currently scheduled. */
  clear() {
    for (const src of this.activeSources) {
      try { src.onended = null; src.stop(); } catch (_) {}
    }
    this.activeSources.clear();
    this.nextStartTime = this.ctx ? this.ctx.currentTime : 0;
    if (this.playing) { this.playing = false; this.onEnded && this.onEnded(); }
  }

  async close() {
    this.clear();
    if (this.ctx) { try { await this.ctx.close(); } catch (_) {} this.ctx = null; }
  }
}
