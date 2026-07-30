import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * CascadeConfirmControl (P1-12) — one review for the cluster of fields a dictionary
 * resolved from a single answer (index number → name, grade, duty station, …).
 *
 * The values are display-only: accepting sends `cascade_accept` and the backend
 * re-resolves from the dictionary before writing, so nothing here can decide a staff
 * member's grade. "Edit" declines the lookup and returns to ordinary questions.
 */
export default function CascadeConfirmControl({ control, onAccept, onEdit }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const fields = control.fields || [];

  return (
    <div className="fdv2-cascade-control">
      <dl className="fdv2-cascade-list">
        {fields.map((f) => (
          <div key={f.slotId} className="fdv2-cascade-row">
            <dt>{f.label}</dt>
            <dd>{f.display}</dd>
          </div>
        ))}
      </dl>
      <div className="fdv2-choice-row">
        <button type="button" className="fdv2-choice-btn fdv2-choice-confirm" disabled={loading} onClick={onAccept}>
          {t('cascade.accept')}
        </button>
        <button type="button" className="fdv2-choice-btn" disabled={loading} onClick={onEdit}>
          {t('cascade.edit')}
        </button>
      </div>
    </div>
  );
}
