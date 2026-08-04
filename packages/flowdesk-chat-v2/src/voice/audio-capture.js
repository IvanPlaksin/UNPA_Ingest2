/**
 * Microphone capture → PCM16 (24 kHz, mono) base64 frames for Voice Live.
 *
 * The AudioContext is created at 24 kHz so the browser resamples the mic stream
 * for us; an AudioWorklet (loaded from an inline blob so the package stays
 * self-contained) forwards ~100 ms Float32 frames to the main thread, which
 * converts them to little-endian PCM16 and base64-encodes them for
 * `input_audio_buffer.append`.
 */

const SAMPLE_RATE = 24000;

// Worklet: buffers samples and posts ~FRAME_SAMPLES-sized Float32 chunks.
const WORKLET_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._target = 2400; // ~100ms @ 24kHz
  }
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
registerProcessor('fdv2-capture', CaptureProcessor);
`;

function float32ToPcm16Base64(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class AudioCapture {
  constructor({ onFrame } = {}) {
    this.onFrame = onFrame;
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.source = null;
  }

  /** Request the mic and start streaming frames. Throws if permission denied. */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ sampleRate: SAMPLE_RATE });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    try {
      await this.ctx.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'fdv2-capture');
    this.node.port.onmessage = (e) => {
      if (this.onFrame) this.onFrame(float32ToPcm16Base64(e.data));
    };
    this.source.connect(this.node);
    // Do NOT connect node to destination — we only want frames, not local echo.
  }

  async stop() {
    try { this.node && (this.node.port.onmessage = null); } catch (_) {}
    try { this.source && this.source.disconnect(); } catch (_) {}
    try { this.node && this.node.disconnect(); } catch (_) {}
    if (this.stream) { for (const tr of this.stream.getTracks()) tr.stop(); this.stream = null; }
    if (this.ctx) { try { await this.ctx.close(); } catch (_) {} this.ctx = null; }
  }
}
