import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import { useAIPrefs } from '../prefs/ai-prefs';
import { getVoicesForLanguage, effectiveVoice } from '../prefs/voice-options';

function SettingsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function GlobeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function VoiceGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * AISettingsDialog (CS-1) — the user's personal AI-chat settings, opened from the
 * Composer gear. Holds the GLOBAL language choice (drives BOTH the text UI and the
 * voice assistant — recognition + output — with auto-detect OFF) and, from CS-2,
 * the AI voice. Rendered via a portal so it escapes the composer's stacking
 * context; closes on overlay click / Escape.
 */
export default function AISettingsDialog({ open, onClose }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useAIPrefs();
  const voices = getVoicesForLanguage(prefs.language);
  const curVoice = effectiveVoice(prefs, prefs.language);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fdv2-settings-overlay" role="presentation" onClick={onClose}>
      <div
        className="fdv2-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fdv2-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fdv2-settings-header">
          <span className="fdv2-settings-header-title">
            <span className="fdv2-settings-icon" aria-hidden="true"><SettingsGlyph /></span>
            <span id="fdv2-settings-title" className="fdv2-settings-title">{t('settings.title', 'AI Settings')}</span>
          </span>
          <button type="button" className="fdv2-settings-close" onClick={onClose} aria-label={t('settings.close', 'Close')}>×</button>
        </header>

        <div className="fdv2-settings-body">
          <div className="fdv2-setting-group">
            <label className="fdv2-setting-label" htmlFor="fdv2-setting-language">
              <GlobeGlyph /> {t('settings.language', 'Language')}
            </label>
            <div className="fdv2-select-wrap">
              <select
                id="fdv2-setting-language"
                className="fdv2-setting-select"
                value={prefs.language}
                onChange={(e) => setPrefs({ language: e.target.value, voice: null })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <span className="fdv2-select-chevron" aria-hidden="true"><ChevronGlyph /></span>
            </div>
            <p className="fdv2-setting-hint">{t('settings.languageHint', 'Used for AI responses and for voice/text recognition. Auto-detection is off.')}</p>
          </div>

          <div className="fdv2-setting-group">
            <label className="fdv2-setting-label" htmlFor="fdv2-setting-voice">
              <VoiceGlyph /> {t('settings.voice', 'Assistant voice')}
            </label>
            <div className="fdv2-select-wrap">
              <select
                id="fdv2-setting-voice"
                className="fdv2-setting-select"
                value={curVoice || ''}
                onChange={(e) => setPrefs({ voice: e.target.value })}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}{v.default ? ` · ${t('settings.voiceDefault', 'Default')}` : ''}</option>
                ))}
              </select>
              <span className="fdv2-select-chevron" aria-hidden="true"><ChevronGlyph /></span>
            </div>
            <p className="fdv2-setting-hint">{t('settings.voiceHint', 'Voice used for the AI assistant’s spoken replies.')}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
