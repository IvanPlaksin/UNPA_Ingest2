import { useState, useEffect, useCallback } from 'react';

/**
 * AI preferences (CS-1) — the user's GLOBAL personal settings for the AI chat
 * (assistant + AltioraChat + the voice launcher): UI/answer LANGUAGE and the AI
 * assistant VOICE. One source of truth so the text chat, the in-composer Live
 * Chat, and the bottom-right voice FAB all obey the SAME language (no per-surface
 * divergence, no auto-detect). Stored in localStorage; changes broadcast on a
 * window event so every mounted surface reacts live, and a `storage` listener
 * keeps other tabs in sync.
 *
 * @module prefs/ai-prefs
 */

export const AI_PREFS_KEY = 'fdv2-ai-prefs';
export const AI_PREFS_EVENT = 'fdv2:aiPrefsChanged';
export const DEFAULT_AI_PREFS = { language: 'en', voice: null }; // voice:null → language default (CS-2)

/** Has the user ever set prefs? (so a host-provided initial language seeds them ONCE). */
export function hasStoredAIPrefs() {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(AI_PREFS_KEY) != null; }
  catch { return false; }
}

export function getAIPrefs() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AI_PREFS_KEY) : null;
    return raw ? { ...DEFAULT_AI_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_AI_PREFS };
  } catch {
    return { ...DEFAULT_AI_PREFS };
  }
}

/** Merge + persist a partial update; broadcasts so all surfaces re-sync. Returns the merged prefs. */
export function setAIPrefs(update) {
  const merged = { ...getAIPrefs(), ...(update || {}) };
  try { localStorage.setItem(AI_PREFS_KEY, JSON.stringify(merged)); } catch { /* private mode — keep in-memory only */ }
  try { window.dispatchEvent(new CustomEvent(AI_PREFS_EVENT, { detail: merged })); } catch { /* no window */ }
  return merged;
}

/** Reactive hook: `[prefs, setPrefs]`. `setPrefs(partial)` persists + syncs everywhere. */
export function useAIPrefs() {
  const [prefs, setState] = useState(getAIPrefs);
  useEffect(() => {
    const onEvent = (e) => setState(e.detail || getAIPrefs());
    const onStorage = (e) => { if (e.key === AI_PREFS_KEY) setState(getAIPrefs()); };
    window.addEventListener(AI_PREFS_EVENT, onEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AI_PREFS_EVENT, onEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const update = useCallback((partial) => setAIPrefs(partial), []);
  return [prefs, update];
}
