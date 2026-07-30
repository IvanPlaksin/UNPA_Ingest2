'use strict';

/**
 * Form policy — which slots may be asked, which are required right now, and in
 * what order.
 *
 * These rules used to live inside interpreter-engine, where only the state
 * machine could reach them. The agent interpreter (EXP-002) walks the same forms
 * and needs the same answers: a slot hidden by its tref condition does not exist
 * for this request, a `requiredWhen` slot is required only sometimes, an
 * `autoResolve` slot is never a question, and an autofill cascade dependant is
 * the form's job rather than the chat's.
 *
 * They are EXTRACTED here rather than copied. A copy would drift — which is
 * exactly how PROMPT_NODES drifted from the engine that read it, leaving three
 * scopes that silently governed nothing (TASK-FLOWDESK-BUG-001). One definition,
 * two callers.
 *
 * @module instances/flowdesk/interpreter/form-policy
 */

const { evalTref, isRequiredNow } = require('../contracts/draft-sr.reducer');
const { isAutofillCascadeSlot, autofillHandledByForm } = require('./cascade-resolver');

/** The evaluation context tref conditions are resolved against. */
function trefContext(draft, snapshot) {
  const slots = {};
  for (const [id, sv] of Object.entries((draft && draft.slots) || {})) slots[id] = sv.value;
  return {
    service: { approvalRequired: !!(snapshot && snapshot.metadata && snapshot.metadata.approvalRequired) },
    slots,
  };
}

/** A slot counts as unfilled when it is empty, stale, or still pending confirmation. */
function isUnfilled(draft, slotId) {
  const sv = (draft && draft.slots) ? draft.slots[slotId] : null;
  return !sv || sv.value === undefined || sv.value === null || sv.value === '' || sv.stale || sv.pending;
}

/** A slot counts as settled only when it holds a value that has not gone stale. */
function isFilled(draft, slotId) {
  const sv = (draft && draft.slots) ? draft.slots[slotId] : null;
  return !!(sv && sv.value !== undefined && sv.value !== null && sv.value !== '' && !sv.stale);
}

/**
 * Required RIGHT NOW: honours trefCondition (hidden ⇒ not required) and
 * requiredWhen (conditionally required), not just the static `required` flag.
 */
function activeRequiredSlots(draft, snapshot) {
  const ctx = trefContext(draft, snapshot);
  return (snapshot.slots || []).filter((s) => {
    if (!isRequiredNow(s, ctx)) return false;
    return isUnfilled(draft, s.slotId);
  });
}

/**
 * Every tref-ACTIVE slot still unfilled — required OR optional. This, not
 * activeRequiredSlots, is what may be ASKED: the chat offers optional fields too.
 *
 * A slot hidden by its trefCondition is never asked, required or not — it does
 * not exist for this request. An autoResolve slot is never a question. An
 * autofill cascade dependant is skipped when the form fills it itself, because
 * the form discards whatever the chat sends for it.
 */
function activeAskableSlots(draft, snapshot) {
  const ctx = trefContext(draft, snapshot);
  return (snapshot.slots || []).filter((s) => {
    if (!evalTref(s.trefCondition, ctx)) return false;
    if (s.autoResolve) return false;
    if (isAutofillCascadeSlot(s) && autofillHandledByForm()) return false;
    return isUnfilled(draft, s.slotId);
  });
}

/** All tref-active slot ids, filled or not — what is worth extracting into. */
function activeSlotIds(draft, snapshot) {
  const ctx = trefContext(draft, snapshot);
  return (snapshot.slots || []).filter((s) => evalTref(s.trefCondition, ctx)).map((s) => s.slotId);
}

/**
 * The single next slot to ask (one question per turn).
 *
 * Order: phase (context → detail → closing), then the source form's own order. A
 * dependency only DEFERS a slot while the thing it waits on is still in the
 * queue; filtering the pool by eligibility first would let dependency-free slots
 * overtake earlier ones that were merely waiting, which is how optional
 * questions once jumped to the front.
 */
function chooseNextSlot(remaining, draft, snapshot) {
  if (!remaining || !remaining.length) return null;
  const pending = new Set(remaining.map((s) => s.slotId));
  const inOrder = orderAskable(remaining, snapshot);
  const ready = (s) => (s.dependsOn || []).every((d) => isFilled(draft, d) || !pending.has(d));
  return inOrder.find(ready) || inOrder[0];
}

/**
 * The ask order itself: phase first, then the source form's own order. Shared
 * with chooseNextSlot so a list shown to the model cannot disagree with the
 * field the same code picks next.
 */
function orderAskable(slots, snapshot) {
  const phaseIdx = (p) => (snapshot.phases || []).indexOf(p);
  const orderOf = new Map((snapshot.slots || []).map((s, i) => [s.slotId, i]));
  return (slots || []).slice().sort((a, b) =>
    (phaseIdx(a.phase) - phaseIdx(b.phase)) || (orderOf.get(a.slotId) - orderOf.get(b.slotId)));
}

/**
 * A form this large is faster to fill in the form itself than one question at a
 * time in chat, so the user is offered the choice instead of being walked
 * through fourteen turns.
 */
const LARGE_FORM_THRESHOLD = 14;
const isLargeForm = (snapshot) => ((snapshot && snapshot.slots) || []).length >= LARGE_FORM_THRESHOLD;

// ── value validation ────────────────────────────────────────────────────────

/** VALIDATE node: drop patches whose value violates the slot type/enum. */
function validatePatches(patches, snapshot) {
  const byId = new Map(snapshot.slots.map((s) => [s.slotId, s]));
  const good = [];
  const rejected = [];
  for (const p of patches) {
    const slot = byId.get(p.slotId);
    if (!slot) { rejected.push({ ...p, reason: 'unknown slot' }); continue; }
    const v = p.value;
    if (slot.type === 'enum') {
      const allowed = (slot.presentOptions || []).map((o) => o.value);
      // P1-13: a multi enum holds an ARRAY of its options. A typed answer still
      // arrives as a scalar (SLOT_EXTRACT), and with the rollout gate OFF the slot is
      // asked as a single `choice` — so normalize scalar → array here (splitting a
      // comma list when every part is a real option) instead of rejecting it. The
      // stored value type stays consistent: multi slots are always arrays.
      if (slot.multi) {
        let list = v;
        if (typeof list === 'string') {
          const parts = list.split(',').map((x) => x.trim()).filter(Boolean);
          list = (parts.length > 1 && parts.every((x) => allowed.includes(x))) ? parts : [list];
        }
        if (!Array.isArray(list) || list.length === 0) { rejected.push({ ...p, reason: 'not a non-empty array' }); continue; }
        const bad = list.filter((x) => !allowed.includes(x));
        if (bad.length) { rejected.push({ ...p, reason: `not in enum: ${bad.join(', ')}` }); continue; }
        good.push({ ...p, value: list });
        continue;
      }
      if (!allowed.includes(v)) { rejected.push({ ...p, reason: 'not in enum' }); continue; }
    } else if (slot.type === 'number' && typeof v !== 'number') {
      rejected.push({ ...p, reason: 'not a number' }); continue;
    }
    good.push(p);
  }
  return { good, rejected };
}

/**
 * A slot whose valid values come from somewhere else: a people/location
 * directory (resolverRef), a cascade dictionary (dictRef), or a list-of-values
 * lookup that has not been baked into an enum yet.
 *
 * These must never take free text. The state machine keeps a mention as a HINT
 * and only promotes it to a value once it resolves against that reference — the
 * comment there names the failure exactly: a grade or duty station that is not a
 * real dictionary entry filling the slot.
 */
function isReferenceSlot(slot) {
  if (!slot) return false;
  return !!(slot.resolverRef || slot.dictRef || (slot.lov && slot.type !== 'enum'));
}

module.exports = {
  trefContext, isUnfilled, isFilled,
  activeRequiredSlots, activeAskableSlots, activeSlotIds, chooseNextSlot, orderAskable,
  isRequiredNow, evalTref,
  LARGE_FORM_THRESHOLD, isLargeForm,
  validatePatches, isReferenceSlot,
};
