'use strict';

/**
 * HYB-003 — the turn a template writes, with no model call at all.
 *
 * The click has already been recorded by code; the field due now was chosen by
 * `form-policy`; the widget comes from `controls.buildControlFromSlot`. All that is
 * left on such a turn is one short sentence — an acknowledgement plus the field's
 * own `promptHint` — and that is what this module produces.
 *
 * It is the 81% case, measured: of 27 turns that completed a 29-field Altiora form,
 * 22 were a click and nothing else, and those 22 spent 72.8 of their 72.9 seconds
 * inside the model, phrasing questions `promptHint` already held.
 *
 * NO FORM LOGIC OF ITS OWN. The queue, the ordering, the required-now test and the
 * widget mapping all come from the modules both other interpreters use. This module
 * decides nothing about the form; it renders a decision already made.
 *
 * IT NEVER THROWS AND NEVER IMPROVISES. Anything it cannot render — no field due,
 * a field with no label, a directory field whose default would not resolve, an
 * unexpected error — returns `{ fallthrough: true }` and the turn goes to the model
 * instead. A template that guesses is worse than a slow answer, and a template that
 * throws loses the user's turn outright.
 *
 * @module instances/flowdesk/hybrid-interpreter/template-turn.service
 */

const ctrl = require('../interpreter/controls');
const policy = require('../interpreter/form-policy');
const { ui } = require('../interpreter/templates/ui-strings');
const { questionFor } = require('../interpreter/context-questions');
const { questionWithGuidance, guidanceFor } = require('../interpreter/field-guidance');

/** Nothing rendered — the model takes this turn. `why` is for telemetry only. */
const fallthrough = (why) => ({ fallthrough: true, why });

/**
 * The acknowledgement for the control the user just used.
 *
 * Keyed on what was SHOWN rather than on the field's type, because that is what
 * the user acted on: a date field rendered as a confirm ("is it still the 30th?")
 * deserves "Got it.", not "Recorded.".
 */
function ackFor(lang, controlType) {
  const acks = (ui(lang) && ui(lang).controlAck) || {};
  return acks[controlType] || acks.text || 'Got it.';
}

/**
 * A question, not a paragraph.
 *
 * `promptHint` is the Altiora field label, and some labels are whole clauses — the
 * confirmation checkbox on the extension form runs to 180 characters ("I confirm
 * that the information provided in this form is accurate and complete, that the
 * necessary approvals have been obtained, and that…"). Read out after "Skipped." it
 * is not a question anyone can answer.
 *
 * The first sentence is asked; the whole text stays on the control's own label, so
 * nothing is hidden — the user reads the full wording next to the box they tick.
 */
const MAX_QUESTION = 80;

function shortQuestion(hint) {
  const text = String(hint || '').trim();
  if (text.length <= MAX_QUESTION) return text;
  const first = text.match(/^[^.!?]+[.!?]/);
  if (first && first[0].trim().length <= 160) return first[0].trim();
  return `${text.slice(0, MAX_QUESTION - 1).trimEnd()}…`;
}

/**
 * @param {object} p
 * @param {object} p.draft                  the DraftSR, already carrying the answer
 * @param {object} p.snapshot               the effective SchemaSnapshot
 * @param {object} p.nextField              the slot due now (from form-policy)
 * @param {string} [p.lang]
 * @param {string} [p.lastControlType]      the control the user just answered
 * @param {boolean} [p.skipped]             this turn was a Skip, not an answer
 * @param {Function} [p.resolveDefault]     async (slotDef) => {defaultValue, alternatives}
 *   Directory-backed fields propose a value (the signed-in user, the recipient's
 *   manager, the profile duty station). Injected because resolving it means asking
 *   the directory, and this module must stay synchronous about everything else.
 * @returns {Promise<object|{fallthrough:true}>} a full turn response, or a pass
 */
async function buildTemplateTurn(p = {}) {
  try {
    const { draft, snapshot, nextField, lastControlType, skipped } = p;
    const lang = p.lang || 'en';
    if (!draft || !snapshot || !nextField || !nextField.slotId) return fallthrough('no_field');

    // The slot as the FORM defines it. `nextField` may be the model-facing
    // description (label/type/required) rather than the slot itself, and the widget
    // must be built from the real definition — options, dictRef and all.
    const slotDef = (snapshot.slots || []).find((s) => s.slotId === nextField.slotId);
    if (!slotDef) return fallthrough('slot_not_in_snapshot');

    // The same question the model would be given. Both paths ask the SAME sentence,
    // or a conversation reads differently depending on which of them answered — and
    // the duty-station question is exactly where they would have diverged.
    const question = questionFor(slotDef, draft) || nextField.promptHint;
    if (!question) return fallthrough('no_prompt_hint');

    const S = ui(lang);
    const optional = !policy.isRequiredNow(slotDef, policy.trefContext(draft, snapshot));

    // A person or a duty station is PICKED, and the confirm button has to have
    // something to confirm. Without a default it renders a "Yes" that agrees to
    // nothing, so the turn goes to the model rather than showing that.
    let resolved = { defaultValue: undefined, alternatives: [] };
    if (ctrl.directoryOf(slotDef)) {
      if (typeof p.resolveDefault !== 'function') return fallthrough('no_resolver');
      resolved = (await p.resolveDefault(slotDef)) || resolved;
      if (resolved.defaultValue === undefined || resolved.defaultValue === null) {
        return fallthrough('directory_without_default');
      }
    }

    const g = guidanceFor(slotDef);
    const help = g ? ` — ${g.full}` : '';
    const control = ctrl.buildControlFromSlot(slotDef, {
      label: `${question}${help}${optional ? ` ${S.optionalMark}` : ''}`,
      defaultValue: resolved.defaultValue,
      alternatives: resolved.alternatives,
    });
    // An enum with no options, a type no widget covers — the same refusal the agent
    // path makes, for the same reason.
    if (!control) return fallthrough('no_control_for_type');

    control.id = `ctrl-${slotDef.slotId}-tpl`;
    const controls = [control];
    // `required: false` means OFFERED. A template that asks an optional field
    // without a way past it turns an intake into an interrogation.
    if (optional) {
      controls.push({
        id: `ctrl-${slotDef.slotId}-skip`,
        type: 'choice',
        slotId: '__skip__',
        options: [{ value: slotDef.slotId, label: S.skipLabel }],
      });
    }

    const ack = ackFor(lang, skipped ? 'skip' : (lastControlType || 'text'));

    return {
      // The label carries the FULL wording; the sentence carries enough of it to be
      // answerable. "Got it. Amendment Type" was a label read out as a question —
      // the guidance existed and sat only on the control, where it is rendered small
      // or not at all.
      response: `${ack} ${questionWithGuidance(shortQuestion(question), slotDef)}`,
      preamble: null,
      choices: null,
      responseType: 'agent_with_controls',
      resolveChoices: null,
      controls,
      askingSlot: slotDef.slotId,
      state: {
        serviceId: draft.serviceId || null,
        status: draft.status || null,
        route: 'TEMPLATE_FILL',
        srNumber: draft.srNumber || null,
      },
      currentNode: 'TEMPLATE_FILL',
      // The honest trace of this turn: one deterministic step, no tools, no model.
      executionLog: [{ node: 'TEMPLATE_FILL', status: 'COMPLETED' }],
      spawnResult: null,
      isComplete: false,
      engineStatus: 'WAITING_FOR_INPUT',
      version: 'v2',
    };
  } catch (err) {
    // Never the reason a user loses their turn.
    return fallthrough(`error:${(err && err.message) || 'unknown'}`);
  }
}

module.exports = { buildTemplateTurn, ackFor, shortQuestion };
