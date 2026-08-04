/**
 * AI assistant voice catalog (CS-2) — the pickable Azure Neural voices per
 * language for the AI Settings dialog. The `default:true` entry per language MUST
 * match the orchestrator's `VOICE_BY_LANG` so "Default" == current behaviour; the
 * user's explicit pick is threaded to the orchestrator (?voice=) and overrides it.
 *
 * @module prefs/voice-options
 */

export const VOICE_OPTIONS = {
  en: [
    { id: 'en-US-AvaMultilingualNeural', label: 'Ava', default: true },
    { id: 'en-US-JennyNeural', label: 'Jenny (US)' },
    { id: 'en-US-GuyNeural', label: 'Guy (US)' },
    { id: 'en-GB-SoniaNeural', label: 'Sonia (UK)' },
  ],
  ru: [
    { id: 'ru-RU-SvetlanaNeural', label: 'Светлана', default: true },
    { id: 'ru-RU-DmitryNeural', label: 'Дмитрий' },
  ],
  fr: [
    { id: 'fr-FR-VivienneMultilingualNeural', label: 'Vivienne', default: true },
    { id: 'fr-FR-DeniseNeural', label: 'Denise' },
    { id: 'fr-FR-HenriNeural', label: 'Henri' },
  ],
  es: [
    { id: 'es-ES-ElviraNeural', label: 'Elvira', default: true },
    { id: 'es-ES-AlvaroNeural', label: 'Álvaro' },
  ],
  ar: [
    { id: 'ar-SA-HamedNeural', label: 'حامد', default: true },
    { id: 'ar-SA-ZariyahNeural', label: 'زارية' },
  ],
  zh: [
    { id: 'zh-CN-XiaoxiaoMultilingualNeural', label: '晓晓', default: true },
    { id: 'zh-CN-YunxiNeural', label: '云希' },
  ],
};

const short = (lang) => String(lang || 'en').split('-')[0];

/** Voices offered for a language (falls back to English). */
export function getVoicesForLanguage(lang) {
  return VOICE_OPTIONS[short(lang)] || VOICE_OPTIONS.en;
}

/** The default voice id for a language (matches the orchestrator). */
export function getDefaultVoice(lang) {
  const list = getVoicesForLanguage(lang);
  const def = list.find((v) => v.default) || list[0];
  return def ? def.id : null;
}

/** Is `voice` a valid option for `lang`? */
export function isValidVoice(voice, lang) {
  return !!voice && getVoicesForLanguage(lang).some((v) => v.id === voice);
}

/** The voice to actually USE: a valid stored pick, else the language default. */
export function effectiveVoice(prefs, lang) {
  const l = lang || (prefs && prefs.language) || 'en';
  const picked = prefs && prefs.voice;
  return isValidVoice(picked, l) ? picked : getDefaultVoice(l);
}
