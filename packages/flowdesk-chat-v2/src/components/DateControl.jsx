import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * DateControl (I-3 / TASK-PROMPT-001) — a native calendar picker for a `date` slot.
 * The user selects a date; a commit sends a `date_select` controlAction carrying the
 * ISO 8601 (YYYY-MM-DD) value. The picker — not the LLM — is the source of truth for
 * the value, which the backend re-validates before it reaches the draft.
 *
 * `control.prefill` (optional ISO date) pre-selects the picker as a convenience.
 */
export default function DateControl({ control, onSelect }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const [value, setValue] = useState(control.prefill || '');

  const submit = () => { if (value) onSelect(value); };

  return (
    <div className="fdv2-date-control fdv2-choice-row">
      <input
        type="date"
        className="fdv2-slot-input fdv2-date-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
      />
      <button
        type="button"
        className="fdv2-choice-btn fdv2-choice-confirm"
        disabled={loading || !value}
        onClick={submit}
      >
        {t('date.set')}
      </button>
    </div>
  );
}
