'use strict';

/**
 * P1-12 — cascade-dictionary resolution, at conversation time.
 *
 * A cascade slot's value lives in an Altiora dictionary filtered by ANOTHER slot's
 * value: type the index number and the staff member's name, grade, duty station and
 * appointment expiry all follow from it. Altiora's own form treats these as AUTOFILL
 * (DynamicForm.tsx `DICT_AUTOFILL_FIELD_TYPES`), so the chat should not interrogate the
 * user for facts the HR system already holds — it should look them up and confirm.
 *
 * This module is pure and injection-based (`fetchLovValues`), like altiora-lov.service,
 * so the whole decision table is unit-testable without Altiora.
 *
 * Statuses returned by `resolveCascadeSlot`:
 *   blocked      – a filter's source slot is still empty (Altiora expresses this by
 *                  returning null from resolveFilters; slot ordering normally prevents it)
 *   resolved     – exactly one row: an autofill candidate
 *   ambiguous    – several rows: the user has to pick
 *   empty        – the dictionary has no matching row
 *   unavailable  – the lookup failed
 * `empty` and `unavailable` both mean "fall back to manual entry" — never a silent
 * partial match.
 *
 * @module instances/flowdesk/interpreter/cascade-resolver
 */

const { toLovRequest, normalizeOptions } = require('../services/altiora-lov.service');

/** Rows to request for a cascade: a handful is plenty — a cascade should be near-unique. */
const CASCADE_MAX_ROWS = 25;

/**
 * The scalar a filled slot contributes as a filter argument. Directory-resolved slots
 * hold an object, so prefer its identifying field over its display name.
 */
function filterArgOf(draft, slotId) {
  const sv = draft && draft.slots && draft.slots[slotId];
  if (!sv) return null;
  const v = sv.value;
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return null; // a multi-select cannot key a single dictionary row
  if (typeof v === 'object') {
    const id = v.code || v.value || v.id || v.userId || v.name;
    return id ? String(id) : null;
  }
  return String(v);
}

/** Are every one of this slot's cascade dependencies filled? */
function cascadeReady(slotDef, draft) {
  const filters = (slotDef && slotDef.dictRef && slotDef.dictRef.filters) || [];
  return filters.length > 0 && filters.every((f) => filterArgOf(draft, f.slotId) !== null);
}

/**
 * Resolve one cascade slot against the dictionary.
 * @returns {Promise<{status:string, value?:string, display?:string, options?:Array, missing?:string}>}
 */
async function resolveCascadeSlot(slotDef, draft, { fetchLovValues, maxResults = CASCADE_MAX_ROWS } = {}) {
  const ref = slotDef && slotDef.dictRef;
  if (!ref) return { status: 'not_cascade' };

  const filters = [];
  for (const f of ref.filters) {
    const value = filterArgOf(draft, f.slotId);
    if (value === null) return { status: 'blocked', missing: f.slotId };
    filters.push({ fieldId: f.fieldId, operator: f.operator, value });
  }

  let rows;
  try {
    rows = await fetchLovValues(toLovRequest({ ...ref, filters }, { maxResults }));
  } catch {
    return { status: 'unavailable' };
  }

  const options = normalizeOptions(rows, maxResults);
  if (!options.length) return { status: 'empty' };
  if (options.length === 1) return { status: 'resolved', value: options[0].value, display: options[0].label };
  return { status: 'ambiguous', options };
}

/**
 * Resolve every still-unfilled cascade slot whose dependencies are already satisfied —
 * the "cluster" one answer unlocks (an index number typically unlocks four or five).
 * Resolving them together is what lets the caller ask for ONE confirmation instead of
 * repeating itself per field.
 *
 * @returns {Promise<Array<{slot:Object, result:Object}>>} in snapshot order
 */
async function resolveCascadeCluster(snapshot, draft, deps = {}) {
  const isFilled = (s) => {
    const sv = draft && draft.slots && draft.slots[s.slotId];
    return !!(sv && sv.value !== undefined && sv.value !== null && sv.value !== '' && !sv.pending);
  };
  const candidates = (snapshot.slots || []).filter((s) => s.dictRef && !isFilled(s) && cascadeReady(s, draft));
  const out = [];
  for (const slot of candidates) {
    const result = await resolveCascadeSlot(slot, draft, deps);
    out.push({ slot, result });
  }
  return out;
}

/**
 * An AUTOFILL cascade slot: a scalar field the Altiora form fills ITSELF from a
 * dictionary lookup on another field's value (its `DICT_AUTOFILL_FIELD_TYPES` are
 * text/textarea/label/date/time/number → our string/text/date/number). The form
 * overwrites any value we hand it and blanks it while the filter field is empty, so
 * the chat should NOT ask for these — it only needs the filter field (e.g. the index
 * number) filled, then the form resolves the cluster with the user's own token.
 *
 * An enum with a dictRef would be an OPTION cascade (the user still picks) — those are
 * NOT autofill and stay askable. None exist in the current catalog.
 */
const AUTOFILL_TYPES = new Set(['string', 'text', 'date', 'number']);
function isAutofillCascadeSlot(slot) {
  return !!(slot && slot.dictRef && AUTOFILL_TYPES.has(slot.type));
}

/**
 * Which gate owns the FINAL fill of a service form — and specifically WHO resolves the
 * AUTOFILL cascade fields (the staff member's grade / duty station / appointment expiry
 * that follow from an index number):
 *
 *   'wizard' (default) – Altiora's own `CreateRequestWizard` does it. The chat neither
 *                        asks for these fields nor prefills them; it only gathers their
 *                        filter field (the index number) and the form resolves the rest
 *                        from its own dictionary lookup with the user's token.
 *   'agent'            – the AI chat resolves them itself, up front, against the same
 *                        dictionary (the P1-12 cascade path). When the lookup is
 *                        unavailable / empty / ambiguous it degrades to a plain question,
 *                        i.e. the user fills the field manually in chat. Resolved values
 *                        are carried into the form's prefill.
 *
 * Config: FLOWDESK_FORM_FILL_GATE = wizard | agent. Read at call time so it can be
 * toggled without a restart and set per-test.
 */
function formFillGate() {
  return String(process.env.FLOWDESK_FORM_FILL_GATE || 'wizard').trim().toLowerCase() === 'agent'
    ? 'agent'
    : 'wizard';
}

/**
 * In the default 'wizard' gate an autofill cascade slot is the form's responsibility, so
 * the chat leaves it alone (neither asks nor prefills). In 'agent' gate the chat owns it.
 */
function autofillHandledByForm() {
  return formFillGate() === 'wizard';
}

/**
 * Slots that (transitively) depend on `slotId`, via the snapshot's `dependsOn`
 * (which the materializer populates from dictRef filters, trefCondition, requiredWhen
 * and optionFilters — the full cascade surface). Reverse-graph BFS; cycle-safe.
 * @returns {string[]} dependent slotIds (excludes `slotId` itself)
 */
function allDependentsOf(snapshot, slotId) {
  const rev = new Map(); // sourceSlot → [slots that depend on it]
  for (const s of (snapshot && snapshot.slots) || []) {
    for (const d of s.dependsOn || []) {
      if (!rev.has(d)) rev.set(d, []);
      rev.get(d).push(s.slotId);
    }
  }
  const out = new Set();
  const stack = [slotId];
  while (stack.length) {
    const cur = stack.pop();
    for (const dep of rev.get(cur) || []) {
      if (!out.has(dep) && dep !== slotId) { out.add(dep); stack.push(dep); }
    }
  }
  return [...out];
}

/** Is a slot filled with a real, confirmed (non-pending) value in the draft? */
function isSlotFilled(draft, slotId) {
  const sv = draft && draft.slots && draft.slots[slotId];
  return !!(sv && sv.value !== undefined && sv.value !== null && sv.value !== '' && !sv.pending);
}

/**
 * The filled slots that would be invalidated by changing `slotId` — the ones a
 * cascade-edit must warn about and reset. Returns SlotDefs (for labels), snapshot order.
 */
function filledDependentsOf(snapshot, draft, slotId) {
  const deps = new Set(allDependentsOf(snapshot, slotId));
  return ((snapshot && snapshot.slots) || []).filter((s) => deps.has(s.slotId) && isSlotFilled(draft, s.slotId));
}

module.exports = {
  resolveCascadeSlot, resolveCascadeCluster, cascadeReady, filterArgOf, isAutofillCascadeSlot, CASCADE_MAX_ROWS,
  allDependentsOf, filledDependentsOf, isSlotFilled, formFillGate, autofillHandledByForm,
};
