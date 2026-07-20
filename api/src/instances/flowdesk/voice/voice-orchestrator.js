'use strict';

/**
 * Decoupled voice orchestrator (Phase 2'').
 *
 * The voice agent must obey the SAME dialogue rules as the text agent, so the
 * "brain" is the FlowDesk interpreter — NOT an LLM inside Azure. This orchestrator
 * uses Azure Speech only as ears and mouth:
 *
 *   mic (client) → Azure STT (continuous, language-ID over the 6 UN locales)
 *                → FlowDesk interpreter (chat-v2.processMessage, SAME sessionId)
 *                → Azure TTS (neural voice per detected language) → client
 *
 * Because the interpreter runs on the same sessionId as the text chat, voice and
 * text share one DraftSR — a conversation can move between modalities seamlessly.
 *
 * Wire protocol (JSON over the existing ticket-authenticated WS):
 *   client → { type:'audio', data:<base64 pcm16 24k> } | { type:'stop' }
 *   server → { type:'state', status:'listening|processing|speaking' }
 *          | { type:'transcript', role:'user'|'assistant', text, lang? }
 *          | { type:'choices', items:[{value,label}] }
 *          | { type:'audio', data:<base64 pcm16 24k> }   // TTS chunk
 *          | { type:'audioDone' }
 *          | { type:'error', message }
 *
 * @module instances/flowdesk/voice/voice-orchestrator
 */

const sdk = require('microsoft-cognitiveservices-speech-sdk');

const UN_LOCALES = ['ar-SA', 'zh-CN', 'en-US', 'fr-FR', 'ru-RU', 'es-ES'];

// Neural voice per detected language (multilingual where available).
const VOICE_BY_LANG = {
  'ar-SA': 'ar-SA-HamedNeural',
  'zh-CN': 'zh-CN-XiaoxiaoMultilingualNeural',
  'en-US': 'en-US-AvaMultilingualNeural',
  'fr-FR': 'fr-FR-VivienneMultilingualNeural',
  'ru-RU': 'ru-RU-SvetlanaNeural',
  'es-ES': 'es-ES-ElviraNeural',
};
const DEFAULT_VOICE = 'en-US-AvaMultilingualNeural';

// 2-letter selected UI language → Azure locale (for fixed-language STT + TTS voice).
const LOCALE_BY_LANG = { en: 'en-US', ru: 'ru-RU', fr: 'fr-FR', es: 'es-ES', ar: 'ar-SA', zh: 'zh-CN' };
const DEFAULT_LOCALE = 'en-US';

function send(ws, obj) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    try { ws.send(JSON.stringify(obj)); } catch (_) { /* ignore */ }
  }
}

class VoiceOrchestratorSession {
  /**
   * @param {WebSocket} clientWs
   * @param {{sessionId:string,userId:string}} ctx
   * @param {{key:string,region:string}} speech
   */
  constructor(clientWs, ctx, speech) {
    this.ws = clientWs;
    this.ctx = ctx;
    this.speech = speech;
    this.pushStream = null;
    this.recognizer = null;
    this.synthesizer = null;
    this.speaking = false;
    this.processing = false;
    this.closed = false;
  }

  start() {
    try {
      this._startRecognizer();
      send(this.ws, { type: 'state', status: 'listening' });
    } catch (err) {
      send(this.ws, { type: 'error', message: `voice init failed: ${err.message}` });
      this.close();
    }

    this.ws.on('message', (data) => this._onClientMessage(data));
    this.ws.on('close', () => this.close());
    this.ws.on('error', () => this.close());
  }

  _startRecognizer() {
    const cfg = sdk.SpeechConfig.fromSubscription(this.speech.key, this.speech.region);
    const fmt = sdk.AudioStreamFormat.getWaveFormatPCM(24000, 16, 1);
    this.pushStream = sdk.AudioInputStream.createPushStream(fmt);
    const audioCfg = sdk.AudioConfig.fromStreamInput(this.pushStream);

    const forcedLocale = this.ctx && this.ctx.lang ? LOCALE_BY_LANG[this.ctx.lang] : null;
    if (forcedLocale) {
      // Selected-language mode: recognize in the chosen language ONLY, so Azure's
      // per-utterance language ID can't misclassify (e.g. English → Chinese) and
      // the agent never auto-switches away from the user's selection.
      cfg.speechRecognitionLanguage = forcedLocale;
      this.recognizer = new sdk.SpeechRecognizer(cfg, audioCfg);
    } else {
      // No selection → continuous language identification across the 6 UN locales.
      cfg.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, 'Continuous');
      const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(UN_LOCALES);
      this.recognizer = sdk.SpeechRecognizer.FromConfig(cfg, autoDetect, audioCfg);
    }

    this.recognizer.recognized = (_s, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      const text = (e.result.text || '').trim();
      if (!text) return;
      let lang = null;
      try { lang = sdk.AutoDetectSourceLanguageResult.fromResult(e.result).language; } catch (_) {}
      this._onUserUtterance(text, lang);
    };
    this.recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        send(this.ws, { type: 'error', message: `STT canceled: ${e.errorDetails || e.reason}` });
      }
    };
    this.recognizer.startContinuousRecognitionAsync();
  }

  _onClientMessage(data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'audio' && msg.data) {
      let buf;
      try { buf = Buffer.from(msg.data, 'base64'); } catch (_) { return; }
      // While the agent is speaking, the client mic stays open and streams frames
      // continuously — silence between words plus our own TTS echoed back by the
      // speakers. A naive "any audio → cancel" barges the agent off after its very
      // first word (the next ~100 ms mic frame kills it), which reads as "no voice"
      // on the client. So gate barge-in on real speech energy: only a genuine user
      // utterance interrupts. Quiet frames are dropped entirely while speaking, so
      // the agent's own voice is never fed back into the recognizer either.
      if (this.speaking) {
        if (this._frameHasSpeech(buf)) this._stopSpeaking();
        else return;
      }
      // The Speech SDK push stream requires an ArrayBuffer, not a Node Buffer.
      try {
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        this.pushStream && this.pushStream.write(ab);
      } catch (_) {}
    } else if (msg.type === 'stop') {
      this.close();
    }
  }

  /**
   * True when a PCM16 (16-bit LE) frame carries real speech rather than silence or
   * echo-cancelled residue. The RMS threshold sits well above the near-silent floor
   * the browser's echo canceller leaves behind but below normal speech level, so the
   * agent's own TTS can never barge itself off while a user genuinely can.
   */
  _frameHasSpeech(buf) {
    const n = buf.length >> 1;
    if (n === 0) return false;
    let sumSq = 0;
    for (let i = 0; i < n; i++) { const s = buf.readInt16LE(i << 1); sumSq += s * s; }
    const rms = Math.sqrt(sumSq / n);
    return rms > 800; // ~ -32 dBFS
  }

  async _onUserUtterance(text, detectedLang) {
    // One turn at a time; ignore overlapping finals while a turn is in flight.
    if (this.processing) return;
    this.processing = true;
    // The user's SELECTED language governs interpretation + reply + TTS voice;
    // Azure's per-utterance guess is only a fallback when nothing was selected.
    const shortLang = (this.ctx && this.ctx.lang) || (detectedLang || 'en').split('-')[0];
    const ttsLocale = LOCALE_BY_LANG[shortLang] || DEFAULT_LOCALE;
    send(this.ws, { type: 'transcript', role: 'user', text, lang: shortLang });
    send(this.ws, { type: 'state', status: 'processing' });

    let result;
    try {
      const chatV2 = require('../interpreter/chat-v2.service.js');
      result = await chatV2.processMessage(this.ctx.sessionId, this.ctx.userId, text, null, null, shortLang);
    } catch (err) {
      send(this.ws, { type: 'error', message: `interpreter failed: ${err.message}` });
      this.processing = false;
      send(this.ws, { type: 'state', status: 'listening' });
      return;
    }

    const reply = (result.response || '').trim();
    // Mirror the text turn-contract so Live Chat renders the SAME embedded controls
    // (service disambiguation, enum choices, confirm, autocomplete) as the text chat.
    // The client attaches this to the assistant message metadata; ControlRenderer
    // then dispatches clicks via the shared-session REST path.
    const meta = {
      controls: Array.isArray(result.controls) ? result.controls : null,
      choices: result.choices || null,
      resolveChoices: result.resolveChoices || null,
      responseType: result.responseType || 'text',
      preamble: result.preamble || null,
    };
    send(this.ws, { type: 'transcript', role: 'assistant', text: reply, meta });
    if (Array.isArray(result.choices) && result.choices.length) {
      send(this.ws, { type: 'choices', items: result.choices });
    }

    // Speak the reply (+ a spoken hint of the choices, so the flow is audible).
    let toSpeak = reply;
    if (Array.isArray(result.choices) && result.choices.length) {
      const labels = result.choices.map((c) => c.label || c.value).filter(Boolean);
      if (labels.length) toSpeak += ` ${labels.join(', ')}?`;
    }
    await this._speak(toSpeak, ttsLocale);

    this.processing = false;
    if (!this.closed) send(this.ws, { type: 'state', status: 'listening' });
  }

  _speak(text, lang) {
    return new Promise((resolve) => {
      if (this.closed || !text) return resolve();
      const cfg = sdk.SpeechConfig.fromSubscription(this.speech.key, this.speech.region);
      cfg.speechSynthesisVoiceName = VOICE_BY_LANG[lang] || DEFAULT_VOICE;
      cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;

      // Stream TTS chunks to the client as they are produced.
      const push = sdk.PushAudioOutputStream.create({
        write: (buffer) => {
          send(this.ws, { type: 'audio', data: Buffer.from(buffer).toString('base64') });
          return buffer.byteLength;
        },
        close: () => {},
      });
      const synth = new sdk.SpeechSynthesizer(cfg, sdk.AudioConfig.fromStreamOutput(push));
      this.synthesizer = synth;
      this.speaking = true;
      send(this.ws, { type: 'state', status: 'speaking' });

      let settled = false;
      const done = () => {
        if (settled) return; // barge-in and the SDK callback can both fire
        settled = true;
        this.speaking = false;
        try { synth.close(); } catch (_) {}
        if (this.synthesizer === synth) this.synthesizer = null;
        this._speakDone = null;
        if (!this.closed) send(this.ws, { type: 'audioDone' });
        resolve();
      };
      // Expose the resolver so a real barge-in (_stopSpeaking) settles this turn —
      // otherwise the awaited _speak() would hang and processing would never reset.
      this._speakDone = done;
      synth.speakTextAsync(
        text,
        () => done(),
        (err) => { send(this.ws, { type: 'error', message: `TTS: ${err}` }); done(); }
      );
    });
  }

  _stopSpeaking() {
    if (this._speakDone) { this._speakDone(); return; }
    if (this.synthesizer) {
      try { this.synthesizer.close(); } catch (_) {}
      this.synthesizer = null;
    }
    this.speaking = false;
    send(this.ws, { type: 'audioDone' });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.recognizer && this.recognizer.stopContinuousRecognitionAsync(() => { try { this.recognizer.close(); } catch (_) {} }); } catch (_) {}
    try { this.pushStream && this.pushStream.close(); } catch (_) {}
    try { this.synthesizer && this.synthesizer.close(); } catch (_) {}
    try { this.ws && this.ws.close(); } catch (_) {}
  }
}

/** Read Speech credentials from env once. */
function getSpeechCreds() {
  const key = process.env.AZURE_VOICE_FOUNDRY_KEY;
  const region = process.env.AZURE_VOICE_REGION || 'swedencentral';
  if (!key) throw new Error('[voice-orchestrator] AZURE_VOICE_FOUNDRY_KEY missing');
  return { key, region };
}

module.exports = { VoiceOrchestratorSession, getSpeechCreds, UN_LOCALES, VOICE_BY_LANG };
