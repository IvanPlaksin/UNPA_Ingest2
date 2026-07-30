import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAIPrefs, setAIPrefs, hasStoredAIPrefs, DEFAULT_AI_PREFS, AI_PREFS_KEY, AI_PREFS_EVENT } from '../ai-prefs';

describe('CS-1 AI prefs', () => {
  beforeEach(() => localStorage.clear());

  it('getAIPrefs returns defaults when nothing stored', () => {
    expect(getAIPrefs()).toEqual(DEFAULT_AI_PREFS);
    expect(hasStoredAIPrefs()).toBe(false);
  });

  it('setAIPrefs persists a merged partial + marks stored', () => {
    setAIPrefs({ language: 'ru' });
    expect(getAIPrefs()).toEqual({ ...DEFAULT_AI_PREFS, language: 'ru' });
    expect(hasStoredAIPrefs()).toBe(true);
    // partial update keeps other keys
    setAIPrefs({ voice: 'ru-RU-SvetlanaNeural' });
    expect(getAIPrefs()).toEqual({ language: 'ru', voice: 'ru-RU-SvetlanaNeural' });
    expect(JSON.parse(localStorage.getItem(AI_PREFS_KEY))).toMatchObject({ language: 'ru' });
  });

  it('setAIPrefs broadcasts the change event with the merged prefs', () => {
    const handler = vi.fn();
    window.addEventListener(AI_PREFS_EVENT, handler);
    setAIPrefs({ language: 'fr' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toMatchObject({ language: 'fr' });
    window.removeEventListener(AI_PREFS_EVENT, handler);
  });

  it('tolerates corrupt storage → defaults', () => {
    localStorage.setItem(AI_PREFS_KEY, '{not json');
    expect(getAIPrefs()).toEqual(DEFAULT_AI_PREFS);
  });
});
