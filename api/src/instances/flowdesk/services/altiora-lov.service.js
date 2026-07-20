'use strict';

/**
 * AltioraLovService (I-4b) — resolve dictionary-backed LOV slots into concrete
 * options ("baking"), the second half of schema materialization.
 *
 * The materializer (I-4a) is pure and does no I/O: a dynamic `select`/`lookup`
 * comes out as a `type:'string'` slot carrying a durable `lov` descriptor
 * (entityId + display/value field ids + static filters). This service takes that
 * descriptor to Altiora's `POST /api/FormLookup/values` (spec §6b) and, when the
 * dictionary yields values, UPGRADES the slot to `type:'enum'` with the resolved
 * `presentOptions` and a `lovBakedAt` stamp. This is the ratified HYBRID model:
 * bake at materialize time, keep the descriptor so the options can be re-fetched
 * on TTL expiry or a `ServiceFormChanged` signal (I-5) without re-reading the
 * form schema.
 *
 * Why baking is a SEPARATE step, not folded into the materializer:
 *   - Purity: the materializer stays a deterministic, network-free function with
 *     golden-fixture tests; all Altiora I/O lives here, behind an injected
 *     `fetchLovValues` so it is equally testable with a fake.
 *   - Graceful degradation: if a dictionary is empty or the lookup call fails, the
 *     slot is LEFT as a valid free-text `string` (never a choiceless enum, which
 *     the SchemaSnapshot contract forbids). A transient failure therefore yields a
 *     usable form that self-heals on the next re-materialization, rather than a
 *     hard materialization error that takes the whole service offline.
 *
 * @module instances/flowdesk/services/altiora-lov.service
 */

/** Altiora clamps MaxResults to [1,1000]; 200 is its own default page size. */
const DEFAULT_MAX_OPTIONS = 200;

/** LOV descriptor → FormLookupRequest body (PascalCase, as the .NET controller binds). */
function toLovRequest(lov, { search, maxResults = DEFAULT_MAX_OPTIONS } = {}) {
  const req = {
    EntityId: lov.entityId,
    DisplayFieldIds: Array.isArray(lov.displayFieldIds) ? lov.displayFieldIds : [],
    MaxResults: maxResults,
  };
  if (lov.valueFieldId) req.ValueFieldId = lov.valueFieldId;
  const filters = (Array.isArray(lov.filters) ? lov.filters : [])
    .filter((f) => f && f.fieldId && f.value !== undefined && f.value !== null && f.value !== '')
    .map((f) => ({ FieldId: f.fieldId, Operator: f.operator || 'eq', Value: String(f.value) }));
  if (filters.length) req.Filters = filters;
  if (search) req.Search = String(search);
  return req;
}

/**
 * FormLookup rows (`[{label,value}]`, any casing) → deduped presentOptions, capped.
 * Value defaults to label when the dictionary has no separate value column (the
 * controller already mirrors label→value in that case, but we stay defensive).
 */
function normalizeOptions(values, cap = DEFAULT_MAX_OPTIONS) {
  const arr = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (!v || typeof v !== 'object') continue;
    const rawValue = v.value !== undefined ? v.value : v.Value;
    const rawLabel = v.label !== undefined ? v.label : v.Label;
    const value = String(rawValue !== undefined && rawValue !== null ? rawValue
      : (rawLabel !== undefined && rawLabel !== null ? rawLabel : '')).trim();
    const label = String(rawLabel !== undefined && rawLabel !== null ? rawLabel : value).trim() || value;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Resolve every LOV-descriptor slot on a materialized snapshot into concrete
 * options, mutating the snapshot in place (and returning it for convenience).
 *
 * @param {Object} snapshot                 a SchemaSnapshot from materializeSchema
 * @param {Object} deps
 * @param {Function} deps.fetchLovValues    (FormLookupRequest) => Promise<[{label,value}]>
 * @param {Function} [deps.now]             () => ISO string, for the lovBakedAt stamp
 * @param {number}   [deps.maxOptions=200]  cap on options baked per slot
 * @param {Function} [deps.onWarn]          (info) => void, for empty/failed lookups
 * @returns {Promise<{snapshot:Object, report:{baked:number, empty:number, failed:number, slots:Array}}>}
 */
async function bakeLov(snapshot, deps = {}) {
  const { fetchLovValues, now = () => new Date().toISOString(), maxOptions = DEFAULT_MAX_OPTIONS, onWarn = () => {} } = deps;
  if (typeof fetchLovValues !== 'function') throw new Error('bakeLov: fetchLovValues is required');

  const report = { baked: 0, empty: 0, failed: 0, slots: [] };
  const slots = (snapshot && Array.isArray(snapshot.slots)) ? snapshot.slots : [];

  for (const slot of slots) {
    if (!slot || !slot.lov) continue;

    let values;
    try {
      values = await fetchLovValues(toLovRequest(slot.lov, { maxResults: maxOptions }));
    } catch (err) {
      report.failed++;
      report.slots.push({ slotId: slot.slotId, status: 'failed', entityId: slot.lov.entityId, error: err.message });
      onWarn({ event: 'lov_fetch_failed', slotId: slot.slotId, entityId: slot.lov.entityId, error: err.message });
      continue; // leave as free-text string — self-heals on re-materialize
    }

    const opts = normalizeOptions(values, maxOptions);
    if (!opts.length) {
      report.empty++;
      report.slots.push({ slotId: slot.slotId, status: 'empty', entityId: slot.lov.entityId });
      onWarn({ event: 'lov_empty', slotId: slot.slotId, entityId: slot.lov.entityId });
      continue; // dictionary resolved but has no rows — stays free text
    }

    slot.type = 'enum';
    slot.presentOptions = opts;
    slot.lovBakedAt = now();
    report.baked++;
    report.slots.push({ slotId: slot.slotId, status: 'baked', entityId: slot.lov.entityId, count: opts.length });
  }

  return { snapshot, report };
}

module.exports = {
  bakeLov,
  toLovRequest,
  normalizeOptions,
  DEFAULT_MAX_OPTIONS,
};
