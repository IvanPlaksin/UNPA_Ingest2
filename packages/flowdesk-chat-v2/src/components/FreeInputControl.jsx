import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';

/**
 * FreeInputControl (TASK-003/004) — the `text`, `textarea` and `number` controls.
 * They differ only in the input element, so they share one implementation rather than
 * three near-identical copies.
 *
 * No validation is attached: Altiora authors none (TASK-PROMPT-002 audit). The value
 * is the right widget's output instead of prose the LLM has to parse. The composer
 * stays enabled, so this is an additional affordance — the user may still just type.
 *
 * Enter submits for text/number; in a textarea Enter inserts a newline (Ctrl/⌘+Enter
 * submits) so multi-line answers are not cut short.
 */
export default function FreeInputControl({ control, onCommit }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const { type, placeholder, prefill, rows } = control;
  const [value, setValue] = useState(prefill != null ? String(prefill) : '');

  const isTextarea = type === 'textarea';
  const canSubmit = !loading && String(value).trim() !== '';
  const submit = () => { if (canSubmit) onCommit(value); };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (isTextarea && !(e.ctrlKey || e.metaKey)) return; // newline
    e.preventDefault();
    submit();
  };

  const common = {
    className: 'fdv2-slot-input',
    value,
    placeholder: placeholder || undefined,
    disabled: loading,
    onChange: (e) => setValue(e.target.value),
    onKeyDown,
  };

  return (
    <div className={`fdv2-freeinput-control fdv2-freeinput-${type}`}>
      {isTextarea
        ? <textarea {...common} rows={rows || 4} />
        : <input {...common} type={type === 'number' ? 'number' : 'text'} />}
      <div className="fdv2-choice-row">
        <button
          type="button"
          className="fdv2-choice-btn fdv2-choice-confirm"
          disabled={!canSubmit}
          onClick={submit}
        >
          {t('freeInput.submit')}
        </button>
      </div>
    </div>
  );
}
