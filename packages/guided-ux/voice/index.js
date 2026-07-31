/**
 * Narration — speaking a step without owning a speech vendor.
 *
 * The package does not talk to Azure, or to anyone. It takes a `synthesize(text, opts)`
 * function from the host and manages the awkward parts around it: the wait before
 * sound starts, the prefetch that hides that wait, and stopping mid-sentence when the
 * user has something to say.
 *
 * WHY PREFETCH IS NOT AN OPTIMISATION HERE.
 *
 * Measured against Azure Speech in swedencentral, the first audio chunk arrives
 * 540–1317 ms after the request. On a tour that is a silence between "next" and any
 * sound — long enough to click again, and then two steps are talking. So the narration
 * for the step AFTER the current one is fetched while the user is still reading this
 * one, and by the time they advance the audio is already in hand.
 *
 * WHY INTERRUPTION IS A FIRST-CLASS OPERATION.
 *
 * The tour has a button that opens an assistant. Continuing to narrate over somebody
 * asking a question is the rudest thing this system could do, so `stop()` is immediate
 * and unconditional, and resuming is always an explicit act by the caller — never an
 * automatic continuation after an answer.
 *
 * @module @guided-ux/tour/voice
 */

/**
 * @typedef {object} NarratorOptions
 * @property {(text:string, opts:{lang:string, voice?:string}) => Promise<any>} synthesize
 *           Host-provided. Returns whatever `play` understands (a URL, a Blob, PCM).
 * @property {(audio:any) => Promise<void>|void} play    Host-provided playback.
 * @property {() => void} [stopPlayback]                 Host-provided immediate stop.
 * @property {string} [lang]
 * @property {string} [voice]
 * @property {boolean} [enabled]  Starts MUTED by default — see below.
 */

class Narrator {
  /** @param {NarratorOptions} opts */
  constructor(opts) {
    if (typeof opts.synthesize !== 'function') throw new TypeError('narrator needs synthesize()');
    if (typeof opts.play !== 'function') throw new TypeError('narrator needs play()');
    this.synthesize = opts.synthesize;
    this.play = opts.play;
    this.stopPlayback = opts.stopPlayback || (() => {});
    this.lang = opts.lang || 'en';
    this.voice = opts.voice;
    // Muted until asked. Sound that starts by itself is the single most complained-about
    // behaviour in guided tours — an open-plan office, a shared screen, a meeting.
    this.enabled = opts.enabled === true;

    /** @type {Map<string, Promise<any>>} key → in-flight or settled synthesis */
    this._cache = new Map();
    this._token = 0;
    this.speaking = false;
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.stop();
    return this.enabled;
  }

  setLanguage(lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    // Cached audio is in the old language: keeping it would have a step narrated in a
    // language the user just switched away from.
    this._cache.clear();
  }

  setVoice(voice) {
    if (voice === this.voice) return;
    this.voice = voice;
    this._cache.clear();
  }

  _key(text) { return `${this.lang}|${this.voice || 'default'}|${text}`; }

  /**
   * Fetch audio without playing it. Errors are swallowed on purpose: a prefetch that
   * failed must not surface anywhere — the real attempt will fail loudly enough.
   */
  prefetch(text) {
    if (!this.enabled || !text) return;
    const key = this._key(text);
    if (this._cache.has(key)) return;
    const p = Promise.resolve()
      .then(() => this.synthesize(text, { lang: this.lang, voice: this.voice }))
      .catch(() => null);
    this._cache.set(key, p);
  }

  /**
   * Speak, cancelling anything already speaking.
   * @returns {Promise<{spoken:boolean, reason?:string}>}
   */
  async speak(text) {
    if (!this.enabled) return { spoken: false, reason: 'muted' };
    if (!text) return { spoken: false, reason: 'nothing to say' };

    this.stop();
    const token = ++this._token;
    const key = this._key(text);

    let audio;
    try {
      if (!this._cache.has(key)) {
        this._cache.set(key, Promise.resolve().then(() => this.synthesize(text, { lang: this.lang, voice: this.voice })));
      }
      audio = await this._cache.get(key);
    } catch (e) {
      this._cache.delete(key);
      // A tour that dies because speech is down would be worse than a silent tour.
      return { spoken: false, reason: `speech unavailable: ${e.message}` };
    }

    // The user moved on while we were waiting — the whole reason a token exists.
    if (token !== this._token) return { spoken: false, reason: 'superseded' };
    if (!audio) return { spoken: false, reason: 'speech unavailable' };

    this.speaking = true;
    try {
      await this.play(audio);
    } catch (e) {
      return { spoken: false, reason: `playback failed: ${e.message}` };
    } finally {
      if (token === this._token) this.speaking = false;
    }
    return { spoken: true };
  }

  /** Immediate and unconditional — someone is talking to us. */
  stop() {
    this._token += 1;
    this.speaking = false;
    try { this.stopPlayback(); } catch { /* stopping must never throw */ }
  }

  /** Bound cache growth on a long tour; the current step's audio is never dropped. */
  trimCache(keep = 8) {
    if (this._cache.size <= keep) return;
    const keys = [...this._cache.keys()];
    for (const k of keys.slice(0, keys.length - keep)) this._cache.delete(k);
  }
}

/**
 * A narrator wired to an HTTP endpoint that returns audio bytes, and to the browser's
 * Audio element. The default for a web host; anything exotic supplies its own pair.
 *
 * @param {{endpoint:string, fetchImpl?:Function, AudioImpl?:any, lang?:string, voice?:string, enabled?:boolean,
 *          headers?:object}} p
 */
function createHttpNarrator(p) {
  const doFetch = p.fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const AudioCtor = p.AudioImpl || (typeof Audio !== 'undefined' ? Audio : null);
  if (!doFetch) throw new Error('no fetch available; pass fetchImpl');

  let current = null;

  return new Narrator({
    lang: p.lang, voice: p.voice, enabled: p.enabled,
    synthesize: async (text, opts) => {
      const res = await doFetch(p.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(p.headers || {}) },
        body: JSON.stringify({ text, lang: opts.lang, voice: opts.voice }),
      });
      if (!res.ok) throw new Error(`speech endpoint returned ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    play: (url) => new Promise((resolve, reject) => {
      if (!AudioCtor) return resolve();
      const a = new AudioCtor(url);
      current = a;
      a.onended = () => resolve();
      a.onerror = () => reject(new Error('audio element failed'));
      const started = a.play();
      if (started && typeof started.catch === 'function') {
        // Autoplay policies reject until the user has interacted. Reported, not thrown:
        // the tour carries on in text.
        started.catch((e) => reject(new Error(e.message || 'autoplay blocked')));
      }
      return undefined;
    }),
    stopPlayback: () => {
      if (!current) return;
      try { current.pause(); current.currentTime = 0; } catch { /* ignore */ }
      current = null;
    },
  });
}

export { Narrator, createHttpNarrator };
