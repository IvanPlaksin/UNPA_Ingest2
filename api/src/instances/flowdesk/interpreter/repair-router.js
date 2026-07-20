'use strict';

/**
 * REPAIR_ROUTER (F10b / ADCC-081, ADCC-082) — the deterministic first pass that
 * runs BEFORE the LLM router whenever a dialogue sequence is open (a question is
 * pending). It interprets the user's utterance RELATIVE to the open sequence, in
 * the fixed priority order of ADCC-081, instead of classifying intent in
 * isolation. This is what closes the "I need big screen" bug: with the
 * approverComment question open, that utterance is accepted as the answer to a
 * freetext slot — not re-routed to NEW_INTENT.
 *
 * Interpretation order (ADCC-081):
 *   1. STRUCTURED_CHOICE  — handled upstream (input.choice); noted for completeness
 *   2. UNIVERSAL_ACTION   — repeat/rephrase/skip/cancel/capabilities/restart
 *   3. REPAIR_MARKER      — "actually…", "I meant…", "not X — Y"
 *   4. ANSWER_TO_PENDING  — answer-first acceptance by slot type (ADCC-082)
 *   5. INSERTION / 6. NEW_SEQUENCE / 7. OUT_OF_SCOPE — deferred to the LLM router
 *
 * All of steps 2–4 are deterministic (ADCC-099). The engine only reaches the LLM
 * for steps 5–7 (FALLTHROUGH).
 *
 * @module instances/flowdesk/interpreter/repair-router
 */

const { topSequence } = require('../contracts/draft-sr.reducer');
const { detectUniversalAction, detectRepairMarker, isMetaMarker } = require('./templates/dialogue-markers');

/**
 * Answer-first acceptance by slot type (ADCC-082).
 *   - text/freetext : accept ANY non-meta utterance verbatim
 *   - enum          : fuzzy-match against presentOptions; miss ⇒ reject (→ repair)
 *   - typed (user/location/date/number) : defer to the extraction fill-loop;
 *     extraction failure there triggers repair, never re-routing.
 *
 * @returns {{accepted:boolean, value?:*, defer?:boolean, reason?:string}}
 */
function tryAcceptAsAnswer(utterance, slotDef) {
  const text = String(utterance || '').trim();
  if (!slotDef) return { accepted: false, reason: 'no_slot' };

  switch (slotDef.type) {
    case 'text':
    case 'freetext':
    case 'string': {
      if (!text) return { accepted: false, reason: 'empty' };
      if (isMetaMarker(text)) return { accepted: false, reason: 'meta' };
      return { accepted: true, value: text };
    }
    case 'enum': {
      const match = fuzzyMatchOption(text, slotDef.presentOptions || []);
      if (match) return { accepted: true, value: match.value };
      return { accepted: false, reason: 'no_match' };
    }
    // Typed slots resolve through the extraction/resolver fill-loop. We never
    // re-route them here; the fill-loop repairs on extraction failure.
    case 'user':
    case 'location':
    case 'date':
    case 'number':
    default:
      return { accepted: false, defer: true, reason: 'needs_extraction' };
  }
}

/** Case-insensitive fuzzy match of an utterance to an enum option (value or label). */
function fuzzyMatchOption(utterance, options) {
  const u = utterance.trim().toLowerCase();
  if (!u) return null;
  // 1. exact value / label
  for (const o of options) {
    if (String(o.value).toLowerCase() === u || String(o.label || '').toLowerCase() === u) return o;
  }
  // 2. containment either direction on the label or the value's token
  for (const o of options) {
    const label = String(o.label || '').toLowerCase();
    const val = String(o.value).toLowerCase();
    const valTokens = val.split(/[_\-\s]+/).filter(Boolean);
    if (label && (label.includes(u) || u.includes(label))) return o;
    if (valTokens.some((t) => t.length > 2 && (u.includes(t) || t.includes(u)))) return o;
  }
  return null;
}

/**
 * Interpret the utterance against the open sequence.
 * @returns {{kind:string, ...}} one of:
 *   {kind:'UNIVERSAL_ACTION', action, slotId}
 *   {kind:'REPAIR_MARKER', slotId}
 *   {kind:'ANSWER', slotId, value}
 *   {kind:'ANSWER_DEFER', slotId}          — typed/pending: run the fill-loop
 *   {kind:'ANSWER_REJECT', slotId, reason} — enum miss: repair
 *   {kind:'FALLTHROUGH'}                    — no open sequence / defer to LLM router
 */
function interpret({ message, draft, snapshot }) {
  const top = draft && topSequence(draft);
  if (!top || top.type !== 'slot_question' || !top.slotId) return { kind: 'FALLTHROUGH' };

  const slotId = top.slotId;
  const slotDef = snapshot.slots.find((s) => s.slotId === slotId);
  if (!slotDef) return { kind: 'FALLTHROUGH' };

  // 2. universal action (ADCC-096) — highest deterministic priority after choice.
  const action = detectUniversalAction(message);
  if (action) return { kind: 'UNIVERSAL_ACTION', action, slotId };

  // 3. user-initiated repair marker (ADCC-087).
  if (detectRepairMarker(message)) return { kind: 'REPAIR_MARKER', slotId };

  // A directory-backed slot showing a provisional (pending) value keeps its
  // confirm-or-choose machinery — and typed slots keep the LLM router's ability
  // to tell an ANSWER from an INSERTION question (ADCC-083). Both FALL THROUGH so
  // the existing router + fill-loop handle "yes" / a name / "what's available?".
  // Answer-first (step 4) applies deterministically only to freetext and enum
  // slots, where re-routing is the failure mode we must prevent (ADCC-082).
  const res = tryAcceptAsAnswer(message, slotDef);
  if (res.accepted) return { kind: 'ANSWER', slotId, value: res.value };
  if (res.reason === 'no_match') return { kind: 'ANSWER_REJECT', slotId, reason: res.reason };
  return { kind: 'FALLTHROUGH' };
}

module.exports = { interpret, tryAcceptAsAnswer, fuzzyMatchOption };
