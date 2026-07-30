'use strict';

/**
 * HYB-002 — who writes this turn: a template, or the model.
 *
 * Measured on a live 27-turn session that completed a 29-field Altiora form:
 * 22 of the 27 turns (81%) were a click and nothing else, and those 22 turns cost
 * 72.9 seconds of which 72.8 was the model. On such a turn the model does exactly
 * one thing — phrase a question whose text `promptHint` already holds. The value
 * was written by code before the model ran, the next field came from
 * `form-policy.chooseNextSlot`, the widget from `controls.buildControlFromSlot`.
 *
 * So the hybrid mode answers a click from a template and calls the model only when
 * the turn needs judgement. This module is that decision and nothing else.
 *
 * PURE, AND DELIBERATELY IGNORANT OF FORMS. It reads a state the caller has
 * already computed and returns a verdict; it does not load a snapshot, walk a
 * queue or touch a draft. The hybrid mode owns no form logic of its own — that is
 * the whole reason it can exist beside the state machine and the agent without
 * becoming a third implementation of them.
 *
 * CONSERVATIVE BY CONSTRUCTION. Every condition is a reason to call the MODEL, and
 * anything the caller could not establish counts as a reason too. A turn wrongly
 * given to the model costs ~3 seconds; a turn wrongly given to a template says the
 * wrong thing to a person.
 *
 * Ratified 2026-07-30 (HYB-1 gate). Two decisions from that gate are visible here
 * and are not this module's to revisit:
 *   - The template path does NOT move the repair ladder, so condition 4 reads a
 *     state only model turns can have set.
 *   - A non-English session goes to the model, because `promptHint` is the Altiora
 *     field label — English — and "Понял. When do you need to travel?" is a worse
 *     answer than a slow one.
 *
 * @module instances/flowdesk/hybrid-interpreter/turn-router
 */

/**
 * The order is the contract.
 *
 * Several conditions can hold at once — a rejected click on a non-English session
 * with the ladder up — and the REASON is what the operator reads in telemetry to
 * understand why a turn cost what it did. So the first match wins, and the order
 * runs from "what the user just did" through "what the form is doing" to "what the
 * session is", because that is the order in which the answer is interesting.
 */
const REASONS = [
  'free_text',        // 1. the Composer, not a control
  'control_rejected', // 2. the click did not produce a value
  'cascade_reset',    // 3. answering cleared dependent fields
  'repair_active',    // 4. the repair ladder is up
  'not_fill_phase',   // 5. not walking the form (service choice, confirm, hand-off…)
  'no_prompt_hint',   // 6. nothing to ask, or nothing to ask it with
  'first_field',      // 7. the first field of a form deserves context
  'non_english',      // 9. the template speaks English only
  'large_form_offer', // 10. a big form must be offered as a choice, once, in words
];

/**
 * @param {{controlAction?: object|null}} input           what the user did
 * @param {{
 *   controlRejected?: boolean,      set when this turn's click produced no value
 *   slotsReset?: string[],          slots the write invalidated (stale cascade)
 *   repair?: {active?: boolean},    the ladder, as the draft records it
 *   inFillPhase?: boolean,          walking form fields, as opposed to any gate
 *   nextField?: {slotId: string, promptHint?: string}|null,
 *   fieldsAskedThisForm?: number,   how many fields this form has already asked
 *   lang?: string,                  the session's language
 *   largeFormOfferPending?: boolean a long form whose "fill it yourself?" offer has
 *                                   not been made yet
 * }} state                                              what the caller established
 * @returns {{needsModel: boolean, reason: string}}
 */
function turnNeedsModel(input, state) {
  // Nothing to reason from. Not an error — a caller mid-refactor, a turn shape we
  // have not met — and the safe answer is the expensive one.
  if (!input || !state) return { needsModel: true, reason: 'free_text' };

  // 1. Free text is a conversation, not a form entry: a question, a correction, a
  //    new intent, something the widget could not express.
  if (!input.controlAction) return { needsModel: true, reason: 'free_text' };

  // 2. The click did not become a value — an out-of-domain option, a date the
  //    picker should never have produced, Skip on a required field. The user is
  //    owed the reason, and a template cannot give one.
  if (state.controlRejected) return { needsModel: true, reason: 'control_rejected' };

  // 3. The answer invalidated other answers (the stale cascade in the reducer).
  //    Asking for them again without saying why reads as the assistant forgetting.
  if (Array.isArray(state.slotsReset) && state.slotsReset.length) {
    return { needsModel: true, reason: 'cascade_reset' };
  }

  // 4. The repair ladder is up: something has already gone wrong on this field or
  //    in this session, and the rung says to reformulate, offer options, offer to
  //    park, or hand over — every one of which is words, not a template.
  if (state.repair && state.repair.active) return { needsModel: true, reason: 'repair_active' };

  // 5. Anything that is not walking the form is a boundary — resolving a service,
  //    the confirm gate, the hand-off, an answer about the request as a whole. The
  //    boundaries are where this assistant earns its keep; the model owns them.
  if (!state.inFillPhase) return { needsModel: true, reason: 'not_fill_phase' };

  // 6. No field due, or a field with no label to ask by. Either way the template
  //    has nothing to say and must not improvise.
  if (!state.nextField || !state.nextField.promptHint) {
    return { needsModel: true, reason: 'no_prompt_hint' };
  }

  // 7. The first field of a form is where the user learns what they are in for
  //    ("this is about your travel dates, then the funding"). One model turn per
  //    form buys the context every later template turn borrows.
  if (!(state.fieldsAskedThisForm > 0)) return { needsModel: true, reason: 'first_field' };

  // 9. `promptHint` is the Altiora field label, and Altiora's labels are English.
  //    On a Russian session a template would answer "Понял. When do you need to
  //    travel?" — a language switch mid-sentence, which is worse than the 3 seconds
  //    it costs to have the model ask properly. (Condition 8 of the draft test —
  //    "the previous message was a question" — was dropped at the gate: a click and
  //    free text are mutually exclusive, so condition 1 already covers it.)
  if (String(state.lang || 'en').toLowerCase().split('-')[0] !== 'en') {
    return { needsModel: true, reason: 'non_english' };
  }

  // 10. A form of thirty fields should be offered as a choice — "you might find it
  //     quicker to fill this in the form itself" — and that offer is an explanation,
  //     not a question. It is made ONCE per form.
  //
  //     Deliberately keyed on "has the offer been made", not on "is this the first
  //     field" (which condition 7 already covers). Live, the offer used to ride the
  //     turn that confirmed the duty station; once a template took that turn the
  //     offer slipped to whatever model turn came next. The flag is what makes it
  //     land at the top of the form again, wherever the template happens to start.
  if (state.largeFormOfferPending) return { needsModel: true, reason: 'large_form_offer' };

  return { needsModel: false, reason: 'template' };
}

module.exports = { turnNeedsModel, REASONS };
