'use strict';

/**
 * DraftSR reference reducer — Contract 2 executable spec.
 *
 * PURE functions defining the DraftSR state transitions and invariants. No
 * Redis, no Memgraph, no clock/uuid side effects (time + ref generation are
 * injected). The production C2 service (step 10) wraps these with Redis
 * persistence and Memgraph materialization but MUST preserve these semantics.
 *
 * Invariants (ratified, ARCHITECT re:STEP-4):
 *   I1. user_edited provenance is never overwritten by extracted (patch rejected).
 *   I2. stale=true cascades to any slot whose dependsOn includes a changed slot.
 *   I3. TTL refreshes on every applied patch (expiresAt = now + ttlMs).
 *   I4. submit validates required slots (honouring trefCondition) against the
 *       SchemaSnapshot and refuses if any required slot is missing or stale.
 *
 * @module instances/flowdesk/contracts/draft-sr.reducer
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const PROVENANCE_RANK = { context: 0, extracted: 1, resolved: 2, user_edited: 3 };

// ── tref evaluation ─────────────────────────────────────────────────────────
// The trefCondition dialect lives in ./tref-parser (IP-0b): a real grammar with
// AND/OR/NOT and twelve operators, parsed by recursive descent, never eval'd.
// It is re-exported here because this reducer has always been the contract's
// entry point for tref semantics; `parseTref` is kept as an alias of `parse` so
// existing callers (the linter) keep working.
//
// Strictness is the load-bearing property, and it dates to IP-0a. The original
// evaluator returned `true` when it could not parse — an intentional fail-open
// ("better to ask a question than silently skip it") that never actually guarded
// the dangerous case: a compound condition still *matched* its lenient regex,
// just wrongly, yielding a garbage literal and a false verdict. The slot then
// vanished from the dialogue with no error and no log. Rejecting the input is
// the only way to distinguish "condition says no" from "condition is broken".

const { parse, evaluate, evalTref, TrefParseError } = require('./tref-parser');

const parseTref = parse;

// ── core reducer ────────────────────────────────────────────────────────────

function iso(now) {
  return new Date(now).toISOString();
}

/**
 * @param {Object} p
 * @param {string} p.sessionId
 * @param {string} p.serviceId
 * @param {number} p.schemaVersion
 * @param {Object} [p.beneficiary]
 * @param {number} p.now       - injected epoch ms
 * @param {number} [p.ttlMs]
 * @returns {Object} DraftSR
 */
function createDraft({ sessionId, serviceId, schemaVersion, beneficiary, userId, now, ttlMs = DEFAULT_TTL_MS }) {
  const ts = iso(now);
  return {
    sessionId,
    serviceId,
    schemaVersion,
    ...(userId ? { userId } : {}),
    ...(beneficiary ? { beneficiary } : {}),
    slots: {},
    patches: [],
    intentTrace: [],
    dialogueStack: [],
    repair: { perSlot: {}, session: 0 },
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    expiresAt: iso(now + ttlMs),
  };
}

/**
 * The form under a draft has been replaced — carry over what still fits.
 *
 * A service is not one form. The provider that serves it is chosen by LOCATION, so
 * confirming a duty station in Nairobi for a request opened in Geneva can swap the
 * whole schema underneath a half-filled draft (see schema-context). What was true
 * of the old form is not automatically true of the new one: fields disappear,
 * arrive, and change type.
 *
 * Three rules, and each one is a value judgement worth stating:
 *   - A slot the new form does not define is DROPPED. Keeping it would file an
 *     answer against a field the provider has no place for.
 *   - A slot whose TYPE changed is dropped too: 'temp' as an enum option and 'temp'
 *     as free text are not the same answer, and the options behind an enum belong
 *     to the old provider.
 *   - Everything else is kept. Re-asking a name or a date the user already gave
 *     because the office changed would be a worse answer than reusing it.
 *
 * What was dropped is RECORDED on the draft rather than discarded silently: the
 * next question is chosen by code, but the user is owed an explanation for why
 * something they already answered is being asked again.
 *
 * Pure, and a no-op when the schema is the same one.
 *
 * @param {object} draft
 * @param {object} snapshot  the newly resolved SchemaSnapshot
 * @param {number} now
 * @param {number} [ttlMs]
 * @returns {object} the draft (unchanged when nothing had to move)
 */
function reconcileToSchema(draft, snapshot, now, ttlMs = DEFAULT_TTL_MS) {
  if (!draft || !snapshot || !Array.isArray(snapshot.slots)) return draft;
  const sameSchema = snapshot.version != null && draft.schemaVersion != null
    && String(snapshot.version) === String(draft.schemaVersion);
  if (sameSchema) return draft;

  const defs = new Map(snapshot.slots.map((sl) => [sl.slotId, sl]));
  const slots = {};
  const dropped = [];
  for (const [slotId, value] of Object.entries(draft.slots || {})) {
    const def = defs.get(slotId);
    if (!def) { dropped.push(slotId); continue; }
    if (value && value.type && def.type && value.type !== def.type) { dropped.push(slotId); continue; }
    slots[slotId] = value;
  }

  return {
    ...draft,
    schemaVersion: snapshot.version != null ? snapshot.version : draft.schemaVersion,
    slots,
    // Read by the interpreters to explain the re-ask; overwritten by the next
    // switch, because only the most recent one is still being explained.
    ...(dropped.length
      ? { schemaSwitch: { at: iso(now), from: draft.schemaVersion ?? null, to: snapshot.version ?? null, dropped } }
      : {}),
    updatedAt: iso(now),
    expiresAt: iso(now + ttlMs),
  };
}

function buildTrefContext(draft, snapshot) {
  const slotValues = {};
  for (const [id, sv] of Object.entries(draft.slots)) slotValues[id] = sv.value;
  return {
    service: { approvalRequired: !!snapshot.metadata.approvalRequired },
    slots: slotValues,
  };
}

/**
 * Whether a slot must be gathered *now*, given the current draft context.
 *
 * The single source of truth for this predicate — the interpreter (which slot to
 * ask next) and submit validation (is the draft complete) MUST agree, or the flow
 * either loops on a slot it will not accept as complete, or submits missing one.
 *
 * A slot is required-now when it is VISIBLE and REQUIRED-given-context:
 *   - visible          = evalTref(trefCondition)          (absent ⇒ always visible)
 *   - required-given    = slot.required === true          (unconditional), OR
 *                         requiredWhen holds               (conditional, e.g. an
 *                         Altiora field revealed by a show-rule → I-4)
 * `requiredWhen` alone (with slot.required false) means "optional until its
 * condition holds"; without it a non-required slot is never demanded.
 */
function isRequiredNow(slot, ctx) {
  if (!evalTref(slot.trefCondition, ctx)) return false; // not visible ⇒ not required
  if (slot.required === true) return true;
  if (slot.requiredWhen) return evalTref(slot.requiredWhen, ctx);
  return false;
}

/**
 * Apply an ordered list of patches. Returns a NEW draft (immutable).
 * Each patch: {op:'set'|'clear', slotId, value?, provenance, confidence?, source?}
 *
 * @param {Object} draft
 * @param {Array}  patches
 * @param {Object} snapshot  - SchemaSnapshot (for dependsOn + stale cascade)
 * @param {number} now
 * @param {number} [ttlMs]
 */
function applyPatches(draft, patches, snapshot, now, ttlMs = DEFAULT_TTL_MS) {
  const ts = iso(now);
  const next = {
    ...draft,
    slots: { ...draft.slots },
    patches: [...draft.patches],
  };
  const slotById = new Map(snapshot.slots.map((s) => [s.slotId, s]));
  const changedSlotIds = new Set();

  for (const patch of patches) {
    const { op, slotId } = patch;
    const existing = next.slots[slotId];

    if (op === 'clear') {
      next.patches.push({
        op: 'clear', slotId,
        oldValue: existing ? existing.value : undefined,
        newValue: undefined,
        provenance: patch.provenance || 'user_edited',
        timestamp: ts,
      });
      if (existing) {
        delete next.slots[slotId];
        changedSlotIds.add(slotId);
      }
      continue;
    }

    // op === 'set'
    // I1: user_edited is never overwritten by extracted.
    if (existing && existing.provenance === 'user_edited' && patch.provenance === 'extracted') {
      next.patches.push({
        op: 'set', slotId,
        oldValue: existing.value, newValue: patch.value,
        provenance: patch.provenance, rejected: true, timestamp: ts,
      });
      continue;
    }

    next.slots[slotId] = {
      value: patch.value,
      provenance: patch.provenance,
      ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      updatedAt: ts,
      stale: false,
      // F9.1d: directory-backed provisional state.
      ...(patch.pending !== undefined ? { pending: patch.pending } : {}),
      ...(patch.hint !== undefined ? { hint: patch.hint } : {}),
    };
    next.patches.push({
      op: 'set', slotId,
      oldValue: existing ? existing.value : undefined,
      newValue: patch.value,
      provenance: patch.provenance,
      timestamp: ts,
    });
    changedSlotIds.add(slotId);
  }

  // I2: stale cascade — any slot dependsOn a changed slot becomes stale.
  if (changedSlotIds.size > 0) {
    for (const [id, sv] of Object.entries(next.slots)) {
      if (changedSlotIds.has(id)) continue; // the changed slot itself is fresh
      const def = slotById.get(id);
      const deps = (def && def.dependsOn) || [];
      if (deps.some((d) => changedSlotIds.has(d))) {
        next.slots[id] = { ...sv, stale: true };
      }
    }
  }

  // I3: TTL refresh.
  next.updatedAt = ts;
  next.expiresAt = iso(now + ttlMs);
  return next;
}

// ── DialogueStack (F10b / ADCC-080) ─────────────────────────────────────────
// Open sequences are first-class session state. The top of the stack is the
// current pending question the next utterance is interpreted against (ADCC-081).
// All ops are pure and refresh TTL (I3) like applyPatches.

function withStackMeta(draft, stack, now, ttlMs) {
  return { ...draft, dialogueStack: stack, updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
}

/** Top open sequence (or undefined). */
function topSequence(draft) {
  const st = draft.dialogueStack || [];
  return st.length ? st[st.length - 1] : undefined;
}

/**
 * Ensure the top sequence is a slot_question for `slotId`. If it already is,
 * this is a no-op (same open question re-issued). Otherwise the previous
 * question is considered answered/superseded and replaced (linear progression;
 * true nesting is reserved for insertion sequences, ADCC-083).
 */
function syncTopSequence(draft, slotId, now, ttlMs = DEFAULT_TTL_MS, makeId = null) {
  const st = (draft.dialogueStack || []).slice();
  const top = st[st.length - 1];
  if (top && top.type === 'slot_question' && top.slotId === slotId) return draft; // unchanged
  if (top && top.insertionDepth === 0) st.pop(); // replace superseded main question
  const sequenceId = (makeId && makeId(slotId)) || `seq-${slotId}`;
  st.push({ sequenceId, type: 'slot_question', slotId, openedAt: iso(now), insertionDepth: 0, repairCount: 0 });
  return withStackMeta(draft, st, now, ttlMs);
}

/** Pop the top open sequence (a question was answered / closed). */
function closeSequence(draft, now, ttlMs = DEFAULT_TTL_MS) {
  const st = (draft.dialogueStack || []).slice();
  st.pop();
  return withStackMeta(draft, st, now, ttlMs);
}

/** Increment the top sequence's repairCount; returns {draft, count}. */
function bumpRepair(draft, now, ttlMs = DEFAULT_TTL_MS) {
  const st = (draft.dialogueStack || []).slice();
  if (!st.length) return { draft, count: 0 };
  const top = { ...st[st.length - 1], repairCount: (st[st.length - 1].repairCount || 0) + 1 };
  st[st.length - 1] = top;
  return { draft: withStackMeta(draft, st, now, ttlMs), count: top.repairCount };
}

/** Clear the whole stack (flow finished / reset). */
function clearSequences(draft, now, ttlMs = DEFAULT_TTL_MS) {
  return withStackMeta(draft, [], now, ttlMs);
}

// ── Repair ladder + counters (F10c / ADCC-085, ADCC-086) ─────────────────────
// The ladder is cause-independent: whatever caused the misunderstanding, the
// same rungs apply. Position is derived deterministically from the per-slot and
// session repair counts against fixed thresholds — no model decides escalation.

const REPAIR_LADDER = ['TARGETED_REASK', 'REFORMULATE', 'PRESENT_OPTIONS', 'OFFER_SKIP_OR_PARK', 'HUMAN_HANDOFF'];
const REPAIR_THRESHOLDS = { reformulate: 1, options: 2, skipOffer: 3, handoff: 5 };

/** Map a (per-slot, session) count pair to the ladder rung to apply next. */
function ladderStepFor(perSlotCount, sessionCount) {
  if (sessionCount >= REPAIR_THRESHOLDS.handoff) return 4; // HUMAN_HANDOFF
  if (perSlotCount >= REPAIR_THRESHOLDS.skipOffer) return 3; // OFFER_SKIP_OR_PARK
  if (perSlotCount >= REPAIR_THRESHOLDS.options) return 2; // PRESENT_OPTIONS
  if (perSlotCount >= REPAIR_THRESHOLDS.reformulate) return 1; // REFORMULATE
  return 0; // TARGETED_REASK
}

/**
 * Record one failed-understanding attempt for a slot. Bumps the per-slot and
 * session counters, sets the top sequence's repairStep, and returns the derived
 * ladder position. Pure + TTL-refreshing.
 * @returns {{draft, perSlot:number, session:number, step:number, ladder:string}}
 */
function recordRepair(draft, slotId, now, ttlMs = DEFAULT_TTL_MS) {
  const prev = draft.repair || { perSlot: {}, session: 0 };
  const perSlot = { ...prev.perSlot, [slotId]: (prev.perSlot[slotId] || 0) + 1 };
  const session = (prev.session || 0) + 1;
  const step = ladderStepFor(perSlot[slotId], session);
  const stack = (draft.dialogueStack || []).slice();
  if (stack.length) stack[stack.length - 1] = { ...stack[stack.length - 1], repairStep: step, repairCount: (stack[stack.length - 1].repairCount || 0) + 1 };
  const next = { ...draft, repair: { perSlot, session }, dialogueStack: stack, updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
  return { draft: next, perSlot: perSlot[slotId], session, step, ladder: REPAIR_LADDER[step] };
}

/** Clear a slot's repair counter (call on a successful fill). Session count persists. */
function resetSlotRepair(draft, slotId, now, ttlMs = DEFAULT_TTL_MS) {
  const prev = draft.repair || { perSlot: {}, session: 0 };
  if (!prev.perSlot[slotId]) return draft;
  const perSlot = { ...prev.perSlot };
  delete perSlot[slotId];
  return { ...draft, repair: { perSlot, session: prev.session }, updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
}

/** Store the agent's last question verbatim (for the 'repeat' action). */
function setLastQuestion(draft, text, now, ttlMs = DEFAULT_TTL_MS) {
  return { ...draft, lastAgentQuestion: text, updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
}

/** Set / clear the awaited yes-no confirmation (cancel / restart / skip / handoff). */
function setPendingAction(draft, action, now, ttlMs = DEFAULT_TTL_MS) {
  return { ...draft, pendingAction: action, updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
}
function clearPendingAction(draft, now, ttlMs = DEFAULT_TTL_MS) {
  const next = { ...draft, updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
  delete next.pendingAction;
  return next;
}

/** Park a draft (kept for resume) — the default fate of unfinished work (ADCC-098). */
function park(draft, now, ttlMs = DEFAULT_TTL_MS) {
  const next = { ...draft, status: 'parked', dialogueStack: [], updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
  delete next.pendingAction;
  return next;
}

/** Un-park a draft back to editable state (ADCC-098 resume). */
function unpark(draft, now, ttlMs = DEFAULT_TTL_MS) {
  const next = { ...draft, status: 'draft', updatedAt: iso(now), expiresAt: iso(now + ttlMs) };
  delete next.pendingAction;
  return next;
}

/**
 * Draft completeness = filled required (tref-active, non-pending, non-stale)
 * slots ÷ all required slots. Drives the asymmetric mid-flow switch threshold
 * (ADCC-084): the fuller the draft, the more certain a new intent must be.
 */
function completeness(draft, snapshot) {
  const ctx = buildTrefContext(draft, snapshot);
  const required = snapshot.slots.filter((s) => s.required && evalTref(s.trefCondition, ctx));
  if (!required.length) return 1;
  const filled = required.filter((s) => {
    const sv = draft.slots[s.slotId];
    return sv && sv.value !== undefined && sv.value !== null && sv.value !== '' && !sv.stale && !sv.pending;
  });
  return filled.length / required.length;
}

/**
 * Validate a draft for submission against its SchemaSnapshot.
 * A slot is required-now when slot.required && evalTref(slot.trefCondition).
 * @returns {{ok: boolean, missing: string[], stale: string[]}}
 */
function validateForSubmit(draft, snapshot) {
  const ctx = buildTrefContext(draft, snapshot);
  const missing = [];
  const stale = [];
  for (const slot of snapshot.slots) {
    if (!isRequiredNow(slot, ctx)) continue;
    const sv = draft.slots[slot.slotId];
    if (!sv || sv.value === undefined || sv.value === null || sv.value === '' || sv.pending) {
      missing.push(slot.slotId); // pending = provisional, not yet confirmed
    } else if (sv.stale) {
      stale.push(slot.slotId);
    }
  }
  return { ok: missing.length === 0 && stale.length === 0, missing, stale };
}

/**
 * Finalize submission. Pure: validation + ref assignment. The production
 * service performs the Memgraph write; here we return the transition + payload
 * the write would use. `makeRef` is injected for determinism/idempotency.
 *
 * @returns {{ok:boolean, draft?:Object, srNumber?:string, nodeId?:string, error?:Object}}
 */
function submit(draft, snapshot, { now, makeRef }) {
  const v = validateForSubmit(draft, snapshot);
  if (!v.ok) {
    return { ok: false, error: { code: 'INCOMPLETE', missing: v.missing, stale: v.stale } };
  }
  const srNumber = makeRef(draft);
  const nodeId = `ServiceRequest:${srNumber}`;
  const submitted = {
    ...draft,
    status: 'submitted',
    srNumber,
    updatedAt: iso(now),
  };
  return { ok: true, draft: submitted, srNumber, nodeId };
}

/**
 * Package an escalation: DraftSR + transcript reference for Tier 1.
 */
function escalate(draft, { reason, transcriptRef, now, makeRef }) {
  const escalationId = makeRef(draft, 'ESC');
  return {
    ok: true,
    escalationId,
    nodeId: `Escalation:${escalationId}`,
    draft: {
      ...draft,
      status: 'escalated',
      escalationId,
      transcriptRef,
      updatedAt: iso(now),
    },
    package: { escalationId, reason, transcriptRef, draft },
  };
}

module.exports = {
  isRequiredNow,
  DEFAULT_TTL_MS,
  PROVENANCE_RANK,
  evalTref,
  parseTref,
  parse,
  evaluate,
  TrefParseError,
  createDraft,
  applyPatches,
  reconcileToSchema,
  validateForSubmit,
  submit,
  escalate,
  topSequence,
  syncTopSequence,
  closeSequence,
  bumpRepair,
  clearSequences,
  REPAIR_LADDER,
  REPAIR_THRESHOLDS,
  ladderStepFor,
  recordRepair,
  resetSlotRepair,
  setLastQuestion,
  setPendingAction,
  clearPendingAction,
  park,
  unpark,
  completeness,
};
