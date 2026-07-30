import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import { useAIPrefs } from '../prefs/ai-prefs';

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
          <span id="fdv2-settings-title" className="fdv2-settings-title">{t('settings.title', 'AI Settings')}</span>
          <button type="button" className="fdv2-settings-close" onClick={onClose} aria-label={t('settings.close', 'Close')}>×</button>
        </header>

        <div className="fdv2-settings-body">
          <div className="fdv2-setting-group">
            <label className="fdv2-setting-label" htmlFor="fdv2-setting-language">{t('settings.language', 'Language')}</label>
            <select
              id="fdv2-setting-language"
              className="fdv2-setting-select"
              value={prefs.language}
              onChange={(e) => setPrefs({ language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="fdv2-setting-hint">{t('settings.languageHint', 'Used for AI responses and for voice/text recognition. Auto-detection is off.')}</p>
          </div>

          {/* Voice picker — CS-2 (mounts here) */}
        </div>
      </div>
    </div>,
    document.body,
  );
}
