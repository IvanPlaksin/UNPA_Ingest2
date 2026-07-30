import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * ToggleControl (TASK-003/004) — an unambiguous yes/no for a `boolean` slot, replacing
 * the guesswork of parsing "yes"/"да"/"sure" out of prose. Two explicit buttons rather
 * than a switch: a switch has an implicit starting state, and for a required consent
 * field ("I confirm…") the user must make a deliberate choice, not accept a default.
 *
 * Commits a native boolean — the format Altiora's own form writes.
 */
export default function ToggleControl({ control, onCommit }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const current = control.prefill;

  return (
    <div className="fdv2-toggle-control fdv2-choice-row">
      <button
        type="button"
        className={`fdv2-choice-btn ${current === true ? 'fdv2-choice-confirm' : ''}`}
        disabled={loading}
        onClick={() => onCommit(true)}
      >
        {t('toggle.on')}
      </button>
      <button
        type="button"
        className={`fdv2-choice-btn ${current === false ? 'fdv2-choice-confirm' : ''}`}
        disabled={loading}
        onClick={() => onCommit(false)}
      >
        {t('toggle.off')}
      </button>
    </div>
  );
}
