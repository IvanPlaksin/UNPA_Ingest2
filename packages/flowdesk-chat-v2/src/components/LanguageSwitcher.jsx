import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLang } from '../i18n';

/**
 * LanguageSwitcher (F9.3c) — switch the chat UI language among the 6 UN official
 * languages. Rendered as a compact icon pill (globe + the active language's
 * abbreviation, e.g. "EN"); clicking it opens a dropdown list of languages that
 * opens upward, since the switcher lives in the composer at the bottom of the
 * panel. Changing the language updates the UI immediately (react-i18next) and,
 * via the store's currentLang() on the next send, makes the AI reply in it.
 */
export default function LanguageSwitcher({ onChange }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];
  const label = t('language', { defaultValue: 'Language' });

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (code) => {
    setLang(code);
    onChange && onChange(code);
    setOpen(false);
  };

  return (
    <div className="fdv2-lang" ref={rootRef}>
      <button
        type="button"
        className="fdv2-lang-btn"
        onClick={() => setOpen((v) => !v)}
        title={`${label}: ${current.label}`}
        aria-label={`${label}: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="fdv2-lang-globe" aria-hidden="true">🌐</span>
        <span className="fdv2-lang-abbr">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <ul className="fdv2-lang-menu" role="listbox" aria-label={label}>
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === current.code}>
              <button
                type="button"
                className={`fdv2-lang-option ${l.code === current.code ? 'is-active' : ''}`}
                onClick={() => pick(l.code)}
                dir={l.dir}
              >
                <span className="fdv2-lang-option-abbr">{l.code.toUpperCase()}</span>
                <span className="fdv2-lang-option-label">{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
