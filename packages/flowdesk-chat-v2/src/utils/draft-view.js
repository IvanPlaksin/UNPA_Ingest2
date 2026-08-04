/**
 * DraftPanel view helpers (F8).
 */

/**
 * Where a slot's value came from. Icon only — the label is looked up per render
 * as t(`provenance.${key}`), so it follows the selected language.
 */
export const PROVENANCE_ICONS = {
  extracted: '🤖',
  user_edited: '✏️',
  context: '📍',
  resolved: '⚙️',
};

/**
 * RULE-078: a slot is "affected by stale" if it is stale, OR any slot in its
 * transitive dependsOn chain is stale. Memoize per call via a cache set.
 */
export function isAffectedByStale(slotId, slots, schema, _seen = new Set()) {
  if (_seen.has(slotId)) return false;
  _seen.add(slotId);
  const sv = slots?.[slotId];
  if (sv?.stale) return true;
  const def = (schema?.slots || []).find((s) => s.slotId === slotId);
  const deps = def?.dependsOn || [];
  return deps.some((dep) => isAffectedByStale(dep, slots, schema, _seen));
}

/** Group schema slots by phase, in the snapshot's phase order. */
export function groupSlotsByPhase(schema) {
  const phases = schema?.phases || [];
  const groups = phases.map((phase) => ({
    phase,
    slots: (schema?.slots || []).filter((s) => s.phase === phase),
  }));
  return groups.filter((g) => g.slots.length > 0);
}

/** Display a slot value (objects → name/id, else string). */
export function displayValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value.name || value.city || value.id || value.mode || JSON.stringify(value);
  return String(value);
}
