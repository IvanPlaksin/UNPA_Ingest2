'use strict';

/**
 * HYB-006 — a simulated user that CLICKS, not only types.
 *
 * The arena was blind to most of what the chat does. It flattened only `choice`
 * controls into options the persona could pick; every other widget — a confirm, a
 * date picker, a number box, a toggle, a text box — was invisible as a control, so
 * the persona answered it in prose and the answer reached the interpreter as free
 * text. The real client never does that: it renders the widget and sends back a
 * `controlAction`.
 *
 * That gap made run C meaningless. The hybrid interpreter answers CLICKS from a
 * template, and in 20 arena turns it received exactly zero: `free_text:17`,
 * `not_fill_phase:3`. It also means runs A and B have been measuring the state
 * machine and the agent on an input distribution they never see in production.
 *
 * So this module turns what the persona SAID into what a person would have DONE
 * with the widget in front of them.
 *
 * WHAT IT DELIBERATELY WILL NOT SIMULATE. A directory autocomplete — a person, a
 * duty station — is a record PICKED from a live search, and inventing a pick would
 * fabricate data the directory never returned. Those turns stay free text, and say
 * so (`why: 'directory_needs_a_real_pick'`), so the arena's remaining blind spot is
 * recorded rather than hidden.
 *
 * @module services/dialogue-gym/persona-click
 */

// The same test the interpreters use for "yes". A second definition of agreement,
// in a second language set, is how an arena starts disagreeing with the thing it
// measures.
const { AFFIRMATIVE } = require('../../instances/flowdesk/agent-interpreter/agent-loop.service');

const NEGATIVE = /^\s*(n|no|nope|not|никак|нет|не|non|no gracias|لا|不|否)(\s|$|[.,!;。！，])/i;

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** 30/09/2026, 30.09.2026, 30-09-2026 — what a person types when not given a picker. */
const LOOSE_DATE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/;

const pad = (n) => String(n).padStart(2, '0');

/** An ISO date out of whatever the persona wrote, or null. */
function dateFrom(text) {
  const iso = ISO_DATE.exec(text);
  if (iso) return iso[0];
  const loose = LOOSE_DATE.exec(text);
  // Day-first, because every persona in this arena writes European or UN style.
  if (loose) return `${loose[3]}-${pad(loose[2])}-${pad(loose[1])}`;
  return null;
}

/** The first number in the text, or null — "about 12 months" → 12. */
function numberFrom(text) {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(text).replace(/\s/g, ''));
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Options the persona's words match, by value or by label. */
function optionsFrom(text, options) {
  const said = String(text).toLowerCase();
  return (options || [])
    .filter((o) => o && o.value != null)
    .filter((o) => said.includes(String(o.value).toLowerCase())
      || (o.label && said.includes(String(o.label).toLowerCase())))
    .map((o) => o.value);
}

/**
 * The control the persona is answering: the first FIELD control on screen.
 *
 * A field control is one whose slotId is a real field — the `__`-prefixed ones are
 * the turn's own questions (which service, confirm, skip, open the form) and are
 * already handled as choices by the runner.
 */
function fieldControl(controls) {
  return (controls || []).find((c) => c && c.slotId && !String(c.slotId).startsWith('__'));
}

/**
 * @param {Array} controls        `turn.controls` from the previous agent turn
 * @param {string} text           what the persona wrote
 * @returns {{controlAction: object, userMessage: string}|{controlAction: null, why: string}}
 */
function clickFor(controls, text) {
  const c = fieldControl(controls);
  if (!c) return { controlAction: null, why: 'no_field_control' };
  const said = String(text || '').trim();
  if (!said) return { controlAction: null, why: 'nothing_said' };

  const slotId = c.slotId;

  switch (c.type) {
    case 'confirm': {
      // A confirm proposes a value and offers a search for anything else. Agreement
      // is a click; disagreement means the person would search the directory, which
      // is the one thing that cannot be faked (see the header).
      if (AFFIRMATIVE.test(said)) return { controlAction: { slotId, value: true }, userMessage: said };
      if (NEGATIVE.test(said)) return { controlAction: null, why: 'declined_needs_a_real_pick' };
      return { controlAction: null, why: 'unclear_confirm' };
    }

    case 'date': {
      const iso = dateFrom(said);
      return iso
        ? { controlAction: { action: 'date_select', slotId, value: iso }, userMessage: said }
        : { controlAction: null, why: 'no_date_in_answer' };
    }

    case 'number': {
      const n = numberFrom(said);
      return n === null
        ? { controlAction: null, why: 'no_number_in_answer' }
        : { controlAction: { slotId, value: n }, userMessage: said };
    }

    case 'toggle': {
      if (AFFIRMATIVE.test(said)) return { controlAction: { slotId, value: true }, userMessage: said };
      if (NEGATIVE.test(said)) return { controlAction: { slotId, value: false }, userMessage: said };
      return { controlAction: null, why: 'unclear_toggle' };
    }

    case 'multichoice': {
      const picked = optionsFrom(said, c.options);
      return picked.length
        ? { controlAction: { action: 'multichoice_select', slotId, values: picked }, userMessage: said }
        : { controlAction: null, why: 'no_option_matched' };
    }

    case 'text':
    case 'textarea':
      // The box takes prose, so what the persona wrote IS the answer — and it now
      // arrives as the field's value rather than as a message about it.
      return { controlAction: { slotId, value: said }, userMessage: said };

    case 'autocomplete':
      return { controlAction: null, why: 'directory_needs_a_real_pick' };

    default:
      return { controlAction: null, why: `unsupported_control:${c.type}` };
  }
}

module.exports = { clickFor, fieldControl, dateFrom, numberFrom, optionsFrom, NEGATIVE };
