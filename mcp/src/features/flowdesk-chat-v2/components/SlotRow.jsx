import React, { useState, useRef, useEffect } from 'react';
import { PROVENANCE, displayValue } from '../utils/draft-view';

/**
 * SlotRow (F8) — one draft slot: label, value (inline-editable), provenance
 * badge, stale indicator. Enum slots edit via <select>, others via <input>.
 */
export default function SlotRow({ slotDef, slotValue, affectedStale, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draftVal, setDraftVal] = useState('');
  const inputRef = useRef(null);

  const val = displayValue(slotValue?.value);
  const prov = slotValue?.provenance ? PROVENANCE[slotValue.provenance] : null;
  const isEnum = slotDef.type === 'enum';
  const isObject = slotValue && typeof slotValue.value === 'object';
  const editable = !isObject; // don't inline-edit resolved user/location objects here

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const begin = () => {
    if (!editable) return;
    setDraftVal(isEnum ? (slotValue?.value ?? '') : (val ?? ''));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draftVal;
    if (next !== '' && next !== (slotValue?.value ?? '')) onEdit(slotDef.slotId, next);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className={`fdv2-slot ${affectedStale ? 'is-stale' : ''}`}>
      <div className="fdv2-slot-label">
        {slotDef.promptHint ? slotDef.slotId : slotDef.slotId}
        {slotDef.required && <span className="fdv2-slot-req" title="Обязательно">*</span>}
      </div>
      <div className="fdv2-slot-value">
        {editing ? (
          isEnum ? (
            <select ref={inputRef} value={draftVal} onChange={(e) => setDraftVal(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} className="fdv2-slot-input">
              <option value="" disabled>—</option>
              {(slotDef.presentOptions || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input ref={inputRef} value={draftVal} onChange={(e) => setDraftVal(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} className="fdv2-slot-input" />
          )
        ) : (
          <button type="button" className={`fdv2-slot-val-btn ${val ? '' : 'is-empty'} ${editable ? '' : 'is-readonly'}`} onClick={begin} title={editable ? 'Изменить' : ''}>
            {val || '—'}
          </button>
        )}
        {prov && <span className="fdv2-slot-prov" title={prov.label} aria-label={prov.label}>{prov.icon}</span>}
        {affectedStale && <span className="fdv2-slot-stale" title="Требует переподтверждения (RULE-078)">⚠️</span>}
      </div>
    </div>
  );
}
