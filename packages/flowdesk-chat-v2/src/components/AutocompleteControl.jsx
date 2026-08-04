import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI } from '../store/chat-store';
import { apiUrl, getFetch, buildHeaders } from '../config/runtime-config';

/**
 * AutocompleteControl (I-3 / FE-001) — a typeahead over the directory endpoint
 * (I-6). Debounced, minChars-gated; a pick calls `onPick(resultItem)`, which the
 * parent turns into a controlAction. No LLM; the directory decides the options.
 *
 * Uses the host-configured transport (getFetch + buildHeaders + apiUrl) so the
 * typeahead is authenticated the same way as every other call from the package.
 */
export default function AutocompleteControl({ control, onPick, onCommit }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const source = control.source || {};
  const minChars = source.minChars || 2;
  const directory = source.directory || 'user';

  // A field that holds SEVERAL people — "share this request with colleagues" — is
  // answered in ONE step or not at all: sending each pick as its own turn makes the
  // assistant ask again between every name. Picks are gathered here and committed
  // together, which is also how Altiora's own MultiEmployeeSelector behaves: it
  // toggles users in and out of an array and the form advances when you say so.
  const multi = control.multi === true;
  const [picked, setPicked] = useState(() => (Array.isArray(control.selected) ? control.selected : []));
  const already = (r) => picked.some((p) => String(p.value ?? p.userId ?? p.id) === String(r.value));

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
        const res = await getFetch()(
          apiUrl(`/flowdesk/directory/${encodeURIComponent(directory)}?q=${encodeURIComponent(term)}&limit=8`),
          { headers: await buildHeaders() },
        );
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

  const take = (r) => {
    if (!multi) { onPick(r); return; }
    if (!already(r)) setPicked([...picked, r]);
    // The query is cleared so the next name can be typed straight away; the chip
    // above is the record that it was taken.
    setQ('');
    setResults([]);
  };
  const drop = (v) => setPicked(picked.filter((p) => String(p.value ?? p.userId ?? p.id) !== String(v)));

  return (
    <div className="fdv2-autocomplete fdv2-choice-search">
      {multi && picked.length > 0 && (
        <ul className="fdv2-ac-chips">
          {picked.map((p) => {
            const v = p.value ?? p.userId ?? p.id;
            return (
              <li key={v} className="fdv2-ac-chip">
                <span>{p.label || p.name || v}</span>
                <button type="button" aria-label={t('choice.cancel')} disabled={loading} onClick={() => drop(v)}>✕</button>
              </li>
            );
          })}
        </ul>
      )}
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
              <button type="button" disabled={loading || (multi && already(r))} onClick={() => take(r)}>
                {r.label}{r.sublabel ? ` — ${r.sublabel}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {multi && (
        <div className="fdv2-ac-actions">
          <button type="button" className="fdv2-choice-btn fdv2-choice-confirm" disabled={loading}
            onClick={() => onCommit(picked)}>
            {picked.length ? t('choice.done', { count: picked.length }) : t('choice.skip')}
          </button>
        </div>
      )}
    </div>
  );
}
