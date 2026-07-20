/**
 * DraftPanel view helpers (F8).
 */

export const PROVENANCE = {
  extracted: { icon: '🤖', label: 'Извлечено из сообщения' },
  user_edited: { icon: '✏️', label: 'Изменено вручную' },
  context: { icon: '📍', label: 'Из вашего профиля' },
  resolved: { icon: '⚙️', label: 'Определено системой' },
};

export const STATUS_LABELS = {
  idle: 'черновик',
  active: 'черновик',
  draft: 'черновик',
  confirmed: 'подтверждается',
  submitted: 'создана',
  escalated: 'эскалация',
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

const PHASE_LABELS = { context: 'Контекст', routing: 'Маршрутизация', detail: 'Детали' };
export const phaseLabel = (p) => PHASE_LABELS[p] || p;

/** Display a slot value (objects → name/id, else string). */
export function displayValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') return value.name || value.city || value.id || value.mode || JSON.stringify(value);
  return String(value);
}
