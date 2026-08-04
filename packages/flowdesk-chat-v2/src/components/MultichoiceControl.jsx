import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * MultichoiceControl (I-3 / P1-13) — check ANY NUMBER of a closed option set.
 * Backs an enum slot marked `multi` (an Altiora checklist), where the single-choice
 * control silently dropped every option but one. The chosen set is committed in one
 * `multichoice_select` action; the backend re-validates it against presentOptions.
 */
export default function MultichoiceControl({ control, onCommit }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const options = control.options || [];
  const [selected, setSelected] = useState(() => new Set(control.selected || []));

  const toggle = (value) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  // Preserve the option order rather than the click order — it is the form's order.
  const commit = () => {
    const values = options.map((o) => o.value).filter((v) => selected.has(v));
    if (values.length) onCommit(values);
  };

  return (
    <div className="fdv2-multichoice-control">
      <ul className="fdv2-multichoice-list">
        {options.map((o) => (
          <li key={o.value} className="fdv2-multichoice-option">
            <label>
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                disabled={loading}
                onChange={() => toggle(o.value)}
              />
              <span>{o.label}{o.description ? ` — ${o.description}` : ''}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="fdv2-choice-row">
        <button
          type="button"
          className="fdv2-choice-btn fdv2-choice-confirm"
          disabled={loading || selected.size === 0}
          onClick={commit}
        >
          {t('multichoice.confirm')}
        </button>
        {selected.size > 0 && (
          <button type="button" className="fdv2-choice-btn" disabled={loading} onClick={() => setSelected(new Set())}>
            {t('multichoice.clear')}
          </button>
        )}
      </div>
    </div>
  );
}
