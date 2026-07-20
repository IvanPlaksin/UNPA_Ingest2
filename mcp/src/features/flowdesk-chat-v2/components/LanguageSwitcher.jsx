import React from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLang } from '../i18n';

/**
 * LanguageSwitcher (F9.3c) — switch the chat UI language among the 6 UN official
 * languages. Changing it updates the UI immediately (react-i18next) and, via the
 * store's currentLang() on the next send, makes the AI reply in that language.
 */
export default function LanguageSwitcher({ onChange }) {
  const { i18n } = useTranslation();
  return (
    <label className="fdv2-lang">
      <span className="fdv2-lang-globe" aria-hidden="true">🌐</span>
      <select
        className="fdv2-lang-select"
        value={i18n.language}
        onChange={(e) => { setLang(e.target.value); onChange && onChange(e.target.value); }}
        aria-label="Interface language"
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}
