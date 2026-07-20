import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * VoiceControls (F6) — visible-but-disabled voice affordances.
 *
 * Voice input (mic) and voice output (TTS) are planned; the controls ship now
 * as disabled placeholders so the UX shape is established and later wiring is a
 * drop-in. Both are non-interactive (disabled, aria-disabled) with a "скоро"
 * tooltip. Do NOT enable until the voice backend lands.
 */

export function MicButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="fdv2-icon-btn fdv2-mic"
      disabled
      aria-disabled="true"
      title={t('micTooltip')}
      aria-label={t('micTooltip')}
    >
      {/* microphone glyph */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </button>
  );
}

export function TtsToggle() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="fdv2-icon-btn fdv2-tts"
      disabled
      aria-disabled="true"
      aria-pressed="false"
      title={t('ttsTooltip')}
      aria-label={t('ttsTooltip')}
    >
      {/* speaker glyph */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
      <span className="fdv2-tts-label">{t('voice')}</span>
    </button>
  );
}
