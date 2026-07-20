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

module.exports = { buildConfirmControl, buildChoiceControl, directoryOf, toOption };
