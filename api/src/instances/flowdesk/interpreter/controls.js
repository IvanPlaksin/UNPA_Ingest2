'use strict';

/**
 * Controls builder (I-3) — turns the interpreter's existing confirm-or-choose and
 * enum-question decisions into the typed `controls[]` turn-contract
 * (contracts/controls.schema.json), emitted ALONGSIDE the legacy
 * resolveChoices/choices during the deprecation window.
 *
 * Nothing here changes what the engine decides; it only re-expresses that decision
 * in the new shape, so the two emissions can never disagree. Pure + injection-free,
 * so it is unit-tested directly.
 *
 * @module instances/flowdesk/interpreter/controls
 */

/** slotId/type → directory kind for an autocomplete source, or null for non-directory slots. */
const USER_SLOTS = new Set(['beneficiary', 'author', 'approver', 'employee', 'forWhom']);
const LOCATION_SLOTS = new Set(['location', 'dutyStation', 'facility']);

function directoryOf(slotDef) {
  if (!slotDef) return null;
  if (slotDef.type === 'user' || USER_SLOTS.has(slotDef.slotId)) return 'user';
  if (slotDef.type === 'location' || LOCATION_SLOTS.has(slotDef.slotId)) return 'location';
  return null;
}

/** A resolved user/location object (or scalar) → an {value,label,description} option. */
function toOption(v, directory) {
  if (v && typeof v === 'object') {
    if (directory === 'user' || v.userId || v.email) {
      const value = String(v.userId || v.id || v.value || '');
      const label = v.name || v.displayName || v.label || value;
      const description = v.email || (v.location && v.location.name) || v.department || undefined;
      return { value, label: String(label), ...(description ? { description: String(description) } : {}) };
    }
    // location-ish
    const value = String(v.code || v.dutyStationId || v.id || v.value || '');
    const label = v.name || v.label || value;
    const description = v.city || v.building || undefined;
    return { value, label: String(label), ...(description ? { description: String(description) } : {}) };
  }
  return { value: String(v), label: String(v) };
}

const autocompleteEndpoint = (directory) => `/api/v1/flowdesk/directory/${directory}`;

/**
 * confirm-or-choose → a `confirm` control. When the slot is directory-backed
 * (allowSearch), it carries an `autocomplete` child revealed on the `_search`
 * sentinel — the client offers "search for someone else" under the resolved default.
 *
 * @returns {Array} a single-element controls[] (kept an array for a uniform contract)
 */
function buildConfirmControl(slotDef, defaultValue, alternatives, { label, allowSearch, minChars = 2, placeholder } = {}) {
  const directory = directoryOf(slotDef);
  const control = {
    id: `ctrl-${slotDef.slotId}`,
    type: 'confirm',
    slotId: slotDef.slotId,
    ...(label ? { label } : {}),
    defaultValue,
    options: (alternatives || []).map((a) => toOption(a, directory)),
  };
  if (allowSearch && directory) {
    control.children = [{
      id: `ctrl-${slotDef.slotId}-search`,
      type: 'autocomplete',
      slotId: slotDef.slotId,
      source: {
        directory,
        endpoint: autocompleteEndpoint(directory),
        minChars,
        ...(placeholder ? { placeholder } : {}),
      },
    }];
    control.showChildrenOn = '_search';
  }
  return [control];
}

/**
 * An enum slot's question → a `choice` control over its presentOptions.
 * @returns {Array} a single-element controls[]
 */
function buildChoiceControl(slotDef, presentOptions, { label } = {}) {
  return [{
    id: `ctrl-${slotDef.slotId}`,
    type: 'choice',
    slotId: slotDef.slotId,
    ...(label ? { label } : {}),
    options: (presentOptions || []).map((o) => ({ value: String(o.value), label: String(o.label != null ? o.label : o.value) })),
  }];
}

/**
 * A date slot's question → a `date` control (TASK-PROMPT-001). Additive: date slots
 * previously fell through to a free-text question. `prefill` (optional ISO 8601) is a
 * convenience only — the committed value is always what the user picks and returns via
 * a `date_select` action, so the LLM never authors a date value.
 * @returns {Array} a single-element controls[]
 */
function buildDateControl(slotDef, { label, prefill } = {}) {
  return [{
    id: `ctrl-${slotDef.slotId}`,
    type: 'date',
    slotId: slotDef.slotId,
    ...(label ? { label } : {}),
    ...(prefill ? { prefill: String(prefill) } : {}),
  }];
}

/**
 * A multi-select enum slot's question → a `multichoice` control (P1-13). Same option
 * domain as `choice`; the client may check any number of them and commits the set via
 * `multichoice_select`. Used for Altiora checklist fields, where collapsing to a single
 * value silently dropped the other attachments the user had ticked.
 * @returns {Array} a single-element controls[]
 */
function buildMultichoiceControl(slotDef, presentOptions, { label, selected } = {}) {
  return [{
    id: `ctrl-${slotDef.slotId}`,
    type: 'multichoice',
    slotId: slotDef.slotId,
    ...(label ? { label } : {}),
    options: (presentOptions || []).map((o) => ({ value: String(o.value), label: String(o.label != null ? o.label : o.value) })),
    ...(Array.isArray(selected) && selected.length ? { selected: selected.map(String) } : {}),
  }];
}

/**
 * Free-input controls (TASK-003/004) — `text`, `textarea`, `number`, `toggle`.
 *
 * These carry NO validation: the TASK-PROMPT-002 audit established that Altiora
 * authors no min/max/length/regex, so there is nothing to enforce. Their value is
 * structural — the right input affordance per slot type (multi-line for long text, a
 * numeric field, an unambiguous on/off) instead of parsing free prose. The composer
 * stays enabled, so a control is an ADDITIONAL affordance, never a gate.
 *
 * `placeholder` is seeded from the slot's helpText (TASK-PROMPT-005) when present —
 * the form author's own guidance, shown where it is most useful.
 */
function freeInputControl(type, slotDef, { label, placeholder, prefill, rows } = {}) {
  return [{
    id: `ctrl-${slotDef.slotId}`,
    type,
    slotId: slotDef.slotId,
    ...(label ? { label } : {}),
    ...(placeholder ? { placeholder: String(placeholder) } : {}),
    ...(prefill !== undefined && prefill !== null && prefill !== '' ? { prefill } : {}),
    ...(rows ? { rows } : {}),
  }];
}

const buildTextControl = (slotDef, opts) => freeInputControl('text', slotDef, opts);
const buildTextareaControl = (slotDef, opts = {}) => freeInputControl('textarea', slotDef, { rows: 4, ...opts });
const buildNumberControl = (slotDef, opts) => freeInputControl('number', slotDef, opts);
const buildToggleControl = (slotDef, opts) => freeInputControl('toggle', slotDef, opts);

/**
 * P1-12 — one review for a whole cascade cluster. An index number typically resolves
 * four or five fields at once; confirming them one at a time would trade the questions
 * we just removed for an equal number of confirmations.
 *
 * The values are display-only. Accepting sends `cascade_accept`, and the backend
 * re-resolves from the dictionary before writing — the client never supplies the value.
 * @returns {Array} a single-element controls[]
 */
function buildCascadeConfirmControl(fields, { label } = {}) {
  return [{
    id: 'ctrl-cascade',
    type: 'cascade_confirm',
    slotId: fields[0].slotId, // the contract keys on a slot; the cluster rides in `fields`
    ...(label ? { label } : {}),
    fields: fields.map((f) => ({ slotId: f.slotId, label: String(f.label), display: String(f.display) })),
  }];
}

/**
 * Build the control a slot deserves, from the slot itself: a date field gets a
 * date picker, a directory-backed field an autocomplete pointed at the RIGHT
 * directory (people vs duty stations) — the part a model cannot infer.
 *
 * SHARED. The agent interpreter had this privately; the hybrid interpreter needs
 * exactly the same widget for exactly the same slot, and two copies of this
 * mapping is how two chats start showing the user different forms. It lives here,
 * next to the builders it dispatches to, and both interpreters call it.
 */
function buildControlFromSlot(slotDef, { label, options, defaultValue, searchHint, alternatives } = {}) {
  const opts = { label };
  const directory = directoryOf(slotDef);
  if (directory) {
    // allowSearch attaches the autocomplete child carrying source.directory and
    // the matching endpoint. Emitting a bare autocomplete is what produced a
    // person picker for a location question.
    //
    // defaultValue is what the confirm button CONFIRMS. Without it the control
    // renders a "Yes" that agrees to nothing: the recipient question is meant to
    // read "is this for you?" — one click to accept yourself, or search for a
    // colleague — and with no default it degrades into "type your own name".
    const [c] = buildConfirmControl(slotDef, defaultValue, alternatives || [], { ...opts, allowSearch: true });
    // What the user said about the person or place opens the search already typed
    // in, so "it is for Maria Ivanova" costs one click rather than a re-typing.
    // A hint is a QUERY, never a value — the committed value is always the record
    // the user picks.
    if (searchHint && c.children && c.children[0]) c.children[0].prefill = String(searchHint);
    return c;
  }
  const present = Array.isArray(slotDef.presentOptions) && slotDef.presentOptions.length
    ? slotDef.presentOptions
    : (Array.isArray(options) ? options : null);
  switch (slotDef.type) {
    case 'date': return buildDateControl(slotDef, opts)[0];
    case 'number': return buildNumberControl(slotDef, opts)[0];
    case 'boolean': case 'toggle': return buildToggleControl(slotDef, opts)[0];
    case 'multiselect': case 'multichoice':
      return present ? buildMultichoiceControl(slotDef, present, opts)[0] : null;
    case 'enum': case 'select':
      return present ? buildChoiceControl(slotDef, present, opts)[0] : null;
    case 'text': return buildTextareaControl(slotDef, opts)[0];
    default:
      // An enum-like slot that carries options is still a choice, whatever it calls itself.
      return present ? buildChoiceControl(slotDef, present, opts)[0] : buildTextControl(slotDef, opts)[0];
  }
}

module.exports = {
  buildConfirmControl, buildChoiceControl, buildDateControl, buildMultichoiceControl,
  buildCascadeConfirmControl,
  buildTextControl, buildTextareaControl, buildNumberControl, buildToggleControl,
  directoryOf, toOption,
  buildControlFromSlot,
};
