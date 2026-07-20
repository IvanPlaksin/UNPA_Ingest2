import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';
import { API_BASE_URL } from '../../../config/api.config';

/**
 * AutocompleteControl (I-3 / FE-001) — a typeahead over the directory endpoint
 * (I-6). Debounced, minChars-gated; a pick calls `onPick(resultItem)`, which the
 * parent turns into a controlAction. No LLM; the directory decides the options.
 */
export default function AutocompleteControl({ control, onPick }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const source = control.source || {};
  const minChars = source.minChars || 2;
  const directory = source.directory || 'user';

  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [fetching, setFetching] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < minChars) { setResults([]); setFetching(false); return undefined; }
    setFetching(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/flowdesk/directory/${encodeURIComponent(directory)}?q=${encodeURIComponent(term)}&limit=8`);
        const data = await res.json().catch(() => ({}));
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setFetching(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, minChars, directory]);

  const placeholder = source.placeholder
    || (directory === 'location' ? t('choice.searchLocation') : t('choice.searchUser'));

  return (
    <div className="fdv2-autocomplete fdv2-choice-search">
      <input
        className="fdv2-slot-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        disabled={loading}
        autoFocus
      />
      {fetching && <span className="fdv2-ac-loading" aria-hidden="true">…</span>}
      {results.length > 0 && (
        <ul className="fdv2-choice-list">
          {results.map((r) => (
            <li key={r.value}>
              <button type="button" disabled={loading} onClick={() => onPick(r)}>
                {r.label}{r.sublabel ? ` — ${r.sublabel}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
