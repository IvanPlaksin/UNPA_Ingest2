import { describe, it, expect } from 'vitest';
import { VOICE_OPTIONS, getVoicesForLanguage, getDefaultVoice, isValidVoice, effectiveVoice } from '../voice-options';

describe('CS-2 voice-options', () => {
  it('has 6 languages, each with a default', () => {
    for (const lang of ['en', 'ru', 'fr', 'es', 'ar', 'zh']) {
      expect(VOICE_OPTIONS[lang].length).toBeGreaterThan(0);
      expect(VOICE_OPTIONS[lang].some((v) => v.default)).toBe(true);
    }
  });
  it('getDefaultVoice returns the marked default (matches orchestrator)', () => {
    expect(getDefaultVoice('en')).toBe('en-US-AvaMultilingualNeural');
    expect(getDefaultVoice('ru')).toBe('ru-RU-SvetlanaNeural');
    expect(getDefaultVoice('xx')).toBe('en-US-AvaMultilingualNeural'); // fallback → en
  });
  it('getVoicesForLanguage handles a locale-ish code + fallback', () => {
    expect(getVoicesForLanguage('en-US')).toBe(VOICE_OPTIONS.en);
    expect(getVoicesForLanguage('zz')).toBe(VOICE_OPTIONS.en);
  });
  it('isValidVoice validates per language', () => {
    expect(isValidVoice('en-US-JennyNeural', 'en')).toBe(true);
    expect(isValidVoice('ru-RU-DmitryNeural', 'en')).toBe(false);
    expect(isValidVoice(null, 'en')).toBe(false);
  });
  it('effectiveVoice: valid pick wins, else language default', () => {
    expect(effectiveVoice({ language: 'en', voice: 'en-US-GuyNeural' }, 'en')).toBe('en-US-GuyNeural');
    // a stale pick from another language falls back to the current language default
    expect(effectiveVoice({ language: 'ru', voice: 'en-US-GuyNeural' }, 'ru')).toBe('ru-RU-SvetlanaNeural');
    expect(effectiveVoice({ language: 'fr', voice: null }, 'fr')).toBe('fr-FR-VivienneMultilingualNeural');
  });
});
