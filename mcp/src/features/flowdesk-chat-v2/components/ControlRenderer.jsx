import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, useChatActions } from '../store/chat-store';
import AutocompleteControl from './AutocompleteControl.jsx';
import DateControl from './DateControl.jsx';
import MultichoiceControl from './MultichoiceControl.jsx';
import FreeInputControl from './FreeInputControl.jsx';
import ToggleControl from './ToggleControl.jsx';
import CascadeConfirmControl from './CascadeConfirmControl.jsx';

const FREE_INPUT_TYPES = ['text', 'textarea', 'number'];

/**
 * ControlRenderer (I-3 / FE-001) — renders the `controls[]` turn-contract and emits
 * `controlAction` replies. Generalizes the legacy ChoiceButtons; MessageBubble
 * prefers this and falls back to ChoiceButtons for `resolveChoices` during the
 * deprecation window.
 *
 * Control types: confirm (accept a default, or choose an alternative / search a
 * directory), choice (pick one option — enum slots + the I-2c service
 * disambiguation), autocomplete (typeahead). Composite: `children` revealed when the
 * parent value equals `showChildrenOn` (the `_search` sentinel, or an option value).
 */

const optionText = (o) => `${o.label}${o.description ? ` — ${o.description}` : ''}`;

/** Rebuild the resolver-shaped value object from a typeahead pick (downstream expects it). */
function pickToValue(directory, r) {
  if (directory === 'location') return { code: r.value, name: r.label };
  return { userId: r.value, name: r.label, ...(r.meta && r.meta.email ? { email: r.meta.email } : {}) };
}

function Control({ control }) {
  const { t } = useTranslation();
  const { loading } = useUI();
  const actions = useChatActions();
  const [reveal, setReveal] = useState(null); // active showChildrenOn value, or 'list'

  const { id, type, slotId, label, defaultValue, options = [], children = [], showChildrenOn } = control;
  const send = (action, value, echo) => actions.sendControlAction({ controlId: id, slotId, action, value }, echo);

  const hasSearch = showChildrenOn === '_search' && children.some((c) => c.type === 'autocomplete');
  // Children are revealed when the active reveal value equals showChildrenOn (the
  // '_search' sentinel set by the Search trigger, or an option value picked above).
  // 'list' is the confirm alternatives dropdown, not a children reveal.
  const activeChildren = (reveal != null && reveal !== 'list' && reveal === showChildrenOn) ? children : [];

  const renderChild = (child) => (child.type === 'autocomplete'
    ? <AutocompleteControl key={child.id} control={child} onPick={(r) => send('submit', pickToValue(child.source?.directory, r), r.label)} />
    : <div key={child.id} className="fdv2-control-child"><Control control={child} /></div>);

  const onOption = (o) => {
    // Composite: an option that reveals nested children (e.g. "for someone else")
    // opens them instead of committing.
    if (children.length && showChildrenOn === o.value) { setReveal(reveal === o.value ? null : o.value); return; }
    send('select', o.value, o.label);
  };

  return (
    <div className="fdv2-control">
      {label && type !== 'confirm' && type !== 'autocomplete' && <div className="fdv2-control-label">{label}</div>}
      <div className="fdv2-choice-row">
        {type === 'confirm' && (
          <button type="button" className="fdv2-choice-btn fdv2-choice-confirm" disabled={loading} onClick={() => send('confirm', undefined, t('choice.yes'))}>
            {t('choice.yes')}
          </button>
        )}
        {type === 'choice' && options.map((o) => (
          <button type="button" key={o.value} className="fdv2-choice-btn" disabled={loading} onClick={() => onOption(o)}>
            {optionText(o)}
          </button>
        ))}
        {type === 'confirm' && options.length > 0 && (
          <button type="button" className="fdv2-choice-btn" disabled={loading} onClick={() => setReveal(reveal === 'list' ? null : 'list')}>
            {t('choice.chooseOther')} ▾
          </button>
        )}
        {type === 'confirm' && hasSearch && (
          <button type="button" className="fdv2-choice-btn" disabled={loading} onClick={() => setReveal(reveal === '_search' ? null : '_search')}>
            {t('choice.search')}
          </button>
        )}
      </div>

      {type === 'confirm' && reveal === 'list' && (
        <ul className="fdv2-choice-list">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" disabled={loading} onClick={() => send('select', o.value, o.label)}>{optionText(o)}</button>
            </li>
          ))}
        </ul>
      )}

      {type === 'autocomplete' && (
        <AutocompleteControl control={control} onPick={(r) => send('submit', pickToValue(control.source?.directory, r), r.label)} />
      )}
      {type === 'date' && (
        <DateControl control={control} onSelect={(v) => send('date_select', v, v)} />
      )}
      {type === 'multichoice' && (
        <MultichoiceControl
          control={control}
          onCommit={(values) => actions.sendControlAction({ controlId: id, slotId, action: 'multichoice_select', values }, values.join(', '))}
        />
      )}
      {FREE_INPUT_TYPES.includes(type) && (
        <FreeInputControl
          control={control}
          onCommit={(v) => send(type === 'number' ? 'number_input' : 'text_input', v, String(v))}
        />
      )}
      {type === 'cascade_confirm' && (
        <CascadeConfirmControl
          control={control}
          onAccept={() => send('cascade_accept', undefined, t('cascade.accept'))}
          onEdit={() => send('cascade_edit', undefined, t('cascade.edit'))}
        />
      )}
      {type === 'toggle' && (
        <ToggleControl control={control} onCommit={(v) => send('toggle_input', v, t(v ? 'toggle.on' : 'toggle.off'))} />
      )}
      {activeChildren.map(renderChild)}
    </div>
  );
}

export default function ControlRenderer({ controls }) {
  if (!Array.isArray(controls) || controls.length === 0) return null;
  return (
    <div className="fdv2-controls">
      {controls.map((c) => <Control key={c.id} control={c} />)}
    </div>
  );
}
