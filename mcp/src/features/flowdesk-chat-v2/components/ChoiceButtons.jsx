import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, useChatActions } from '../store/chat-store';

/**
 * ChoiceButtons (F9.1f) — renders a confirm-or-choose prompt for directory-backed
 * slots (beneficiary / location). Confirm the default, pick an alternative, or
 * search for another. Sends a structured `choice` (deterministic, no LLM).
 */
function labelFor(slotId, v) {
  if (!v) return '';
  if (slotId === 'beneficiary') return `${v.name || v.userId}${v.email ? ` (${v.email})` : ''}`;
  return v.name || v.code || '';
}

export default function ChoiceButtons({ resolveChoices }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const actions = useChatActions();
  const [mode, setMode] = useState(null); // null | 'list' | 'search'
  const [query, setQuery] = useState('');

  const { slotId, default: def, alternatives = [], allowSearch } = resolveChoices;

  const confirm = () => actions.sendChoice({ slotId, action: 'confirm', value: def }, labelFor(slotId, def));
  const select = (v) => actions.sendChoice({ slotId, action: 'select', value: v }, labelFor(slotId, v));
  const search = () => { const q = query.trim(); if (q) actions.sendChoice({ slotId, action: 'search', value: q }, q); };

  return (
    <div className="fdv2-choice">
      <div className="fdv2-choice-row">
        <button type="button" className="fdv2-choice-btn fdv2-choice-confirm" onClick={confirm} disabled={loading}>
          {t('choice.yes')}
        </button>
        {alternatives.length > 0 && (
          <button type="button" className="fdv2-choice-btn" onClick={() => setMode(mode === 'list' ? null : 'list')} disabled={loading}>
            {t('choice.chooseOther')} ▾
          </button>
        )}
        {allowSearch && (
          <button type="button" className="fdv2-choice-btn" onClick={() => setMode(mode === 'search' ? null : 'search')} disabled={loading}>
            {t('choice.search')}
          </button>
        )}
      </div>

      {mode === 'list' && (
        <ul className="fdv2-choice-list">
          {alternatives.map((v, i) => (
            <li key={v.userId || v.code || i}>
              <button type="button" onClick={() => select(v)} disabled={loading}>{labelFor(slotId, v)}</button>
            </li>
          ))}
        </ul>
      )}

      {mode === 'search' && (
        <div className="fdv2-choice-search">
          <input
            className="fdv2-slot-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
            placeholder={slotId === 'location' ? t('choice.searchLocation') : t('choice.searchUser')}
            disabled={loading}
            autoFocus
          />
          <button type="button" className="fdv2-choice-btn" onClick={search} disabled={loading || !query.trim()}>{t('choice.find')}</button>
        </div>
      )}
    </div>
  );
}
