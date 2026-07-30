'use strict';

/**
 * Dictionary hydration for the hand-off to Altiora's request form.
 *
 * When the chat hands over (see form-handoff.js), the wizard opens and every
 * dictionary-backed field on its dynamic step fetches its own options from
 * `POST /FormLookup/*` — once per field, on mount. Everything those calls return we
 * already hold: LOV option sets are baked into the SchemaSnapshot at materialization
 * (altiora-lov.service `bakeLov`), and cascade dictionaries are resolved during the
 * conversation (cascade-resolver). Shipping them with the hand-off lets the form paint
 * complete on its first frame instead of filling in a round-trip later.
 *
 * Contract with the client (DynamicForm `initialDictionary`):
 *   values[fieldId] – rows shaped like `POST /FormLookup/values`, i.e. `[{label,value}]`
 *   autofill[fieldId] – a value the CHAT resolved for a field the form would auto-fill
 *
 * Two properties make this safe to ship blind:
 *
 *   1. The CLIENT decides what to use. It recomputes its own cache key and only consumes
 *      an entry for a field it would have fetched that exact way; anything that does not
 *      line up is ignored and fetched as before. A wrong entry therefore costs a wasted
 *      round-trip, never a wrong value.
 *   2. Absence is always valid. Budget exhaustion, a failed lookup, a dictionary shape we
 *      cannot express — all degrade to "not hydrated", which is today's behaviour.
 *
 * Keyed by ALTIORA field id (via `snapshot.metadata.fieldIdMapping`), because that is what
 * the form's fields are keyed by — the same correspondence draftToInitialFormData uses.
 *
 * @module instances/flowdesk/interpreter/form-hydration
 */

const { toLovRequest, normalizeOptions } = require('../services/altiora-lov.service');
const { filterArgOf, isAutofillCascadeSlot, autofillHandledByForm } = require('./cascade-resolver');

/** Options per field. Matches the client's own `maxResults`-driven ceiling closely enough. */
const DEFAULT_MAX_OPTIONS = 200;
/** Wall-clock the hand-off is willing to spend on hydration lookups. */
const DEFAULT_BUDGET_MS = 1500;
/** Cap on lookups issued for one hand-off, so a huge form cannot fan out without bound. */
const DEFAULT_MAX_LOOKUPS = 12;

/**
 * Whether the client would fetch this dictionary through `/FormLookup/values` (flat
 * `[{label,value}]`) rather than `/FormLookup/rows` (structured rows).
 *
 * The client decides by `[dictionaryFieldId, ...dictionaryDisplayFields].length > 1`. The
 * materializer records `displayFieldIds` as `dictionaryDisplayFields` when it has any and
 * `[dictionaryFieldId]` otherwise — so a single display field is the case where the two
 * agree and our flat rows are the shape the client wants. With more than one, the client
 * wants rows we do not hold; we emit nothing and it fetches, as today.
 */
function isFlatLookup(ref) {
  return !!(ref && Array.isArray(ref.displayFieldIds) && ref.displayFieldIds.length === 1);
}

/** Resolve a cascade slot's filters against the draft, or null when a dependency is unfilled. */
function cascadeFilters(ref, draft) {
  const filters = [];
  for (const f of (ref.filters || [])) {
    const value = filterArgOf(draft, f.slotId);
    if (value === null) return null;
    filters.push({ fieldId: f.fieldId, operator: f.operator, value });
  }
  return filters;
}

/** Reject a promise once the deadline passes, so one slow dictionary cannot hold the turn. */
function withDeadline(promise, ms) {
  if (!(ms > 0)) return Promise.reject(new Error('hydration budget exhausted'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hydration budget exhausted')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Build the hydration payload for a hand-off.
 *
 * @param {Object} draft     DraftSR
 * @param {Object} snapshot  SchemaSnapshot (metadata.fieldIdMapping, slots[].lov/.dictRef)
 * @param {Object} deps
 * @param {Function} [deps.fetchLovValues]  (FormLookupRequest) => Promise<[{label,value}]>.
 *                                          Only needed for cascade dictionaries; without it
 *                                          hydration is limited to the baked LOV options.
 * @param {number} [deps.maxOptions]
 * @param {number} [deps.budgetMs]
 * @param {number} [deps.maxLookups]
 * @param {Function} [deps.now]             () => epoch ms, for testing the budget
 * @returns {Promise<Object|null>} `{values?, autofill?}`, or null when there is nothing to send
 */
async function buildFormHydration(draft, snapshot, deps = {}) {
  const {
    fetchLovValues,
    maxOptions = DEFAULT_MAX_OPTIONS,
    budgetMs = DEFAULT_BUDGET_MS,
    maxLookups = DEFAULT_MAX_LOOKUPS,
    now = () => Date.now(),
  } = deps;

  const mapping = (snapshot && snapshot.metadata && snapshot.metadata.fieldIdMapping) || {};
  const slots = (snapshot && Array.isArray(snapshot.slots)) ? snapshot.slots : [];
  if (!slots.length) return null;

  const values = {};
  const autofill = {};
  const pending = [];

  for (const slot of slots) {
    const fieldId = slot && mapping[slot.slotId];
    if (!fieldId) continue; // platform-only slot (beneficiary/location) — no form field

    // ── Baked LOV: already resolved at materialization, so this costs nothing ──
    if (slot.lov && isFlatLookup(slot.lov) && Array.isArray(slot.presentOptions) && slot.presentOptions.length) {
      values[fieldId] = slot.presentOptions
        .slice(0, maxOptions)
        .map((o) => ({ label: o.label, value: o.value }));
      continue;
    }

    if (!slot.dictRef) continue;

    // ── Cascade dictionary: filtered by other answers, so it has to be looked up now ──
    // A value the CHAT resolved (agent gate) is carried so the form does not re-resolve and
    // overwrite it. Under the default wizard gate the chat never fills these — the form owns
    // them — so nothing is emitted and its auto-fill runs exactly as it does today.
    const filled = draft && draft.slots && draft.slots[slot.slotId];
    const hasValue = !!(filled && filled.value !== undefined && filled.value !== null && filled.value !== '' && !filled.pending);
    if (hasValue && isAutofillCascadeSlot(slot) && !autofillHandledByForm() && typeof filled.value !== 'object') {
      autofill[fieldId] = String(filled.value);
    }

    if (!fetchLovValues || !isFlatLookup(slot.dictRef)) continue;
    const filters = cascadeFilters(slot.dictRef, draft);
    if (filters === null) continue; // a dependency is still empty — the form blocks it too
    pending.push({ fieldId, ref: slot.dictRef, filters });
  }

  const lookups = pending.slice(0, maxLookups);
  if (lookups.length) {
    const deadline = now() + budgetMs;
    await Promise.all(lookups.map(async ({ fieldId, ref, filters }) => {
      try {
        const rows = await withDeadline(
          Promise.resolve(fetchLovValues(toLovRequest({ ...ref, filters }, { maxResults: maxOptions }))),
          deadline - now(),
        );
        const opts = normalizeOptions(rows, maxOptions);
        if (opts.length) values[fieldId] = opts.map((o) => ({ label: o.label, value: o.value }));
      } catch {
        /* budget spent, or the dictionary is unavailable — the form fetches it itself */
      }
    }));
  }

  const out = {};
  if (Object.keys(values).length) out.values = values;
  if (Object.keys(autofill).length) out.autofill = autofill;
  return Object.keys(out).length ? out : null;
}

module.exports = {
  buildFormHydration,
  isFlatLookup,
  DEFAULT_MAX_OPTIONS,
  DEFAULT_BUDGET_MS,
  DEFAULT_MAX_LOOKUPS,
};
