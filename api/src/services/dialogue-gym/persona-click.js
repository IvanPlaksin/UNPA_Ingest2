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
 * A DIRECTORY FIELD IS SEARCHED, NOT INVENTED — and that distinction took a
 * deadlock to get right.
 *
 * The first version refused directory fields outright, reasoning that a pick is a
 * real record and making one up fabricates data. The reasoning was sound; the
 * consequence was not. Every Altiora form opens with two directory fields (the
 * recipient and the duty station), so a persona that cannot pick can never reach
 * field three. Watched live: the assistant asked for the duty station five times,
 * the persona answered "New York" five times and then gave up — sixteen turns, no
 * form, and a transcript that reads like an interpreter defect when it was a harness
 * one.
 *
 * The distinction that resolves it: SEARCHING is what a person does, INVENTING is
 * what must not happen. So a directory field takes the persona's own words as a
 * QUERY against the real directory and commits whichever record comes back — the
 * same act, and the same data, as a user typing and clicking. When the search
 * returns nothing the original refusal stands, and says so
 * (`why: 'directory_no_match'`), because at that point there is genuinely no record
 * to pick.
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

/** The query a persona's sentence makes: its longest proper-noun-ish phrase, else all of it. */
function queryFrom(text) {
  const said = String(text || '').trim();
  // "New York is my duty station" → "New York". Capitalised runs are what a person
  // types into a directory box; failing that, the whole sentence is a fair query.
  const proper = said.match(/\b([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)*)/g);
  if (proper && proper.length) return proper.sort((a, b) => b.length - a.length)[0];
  return said.slice(0, 60);
}

/**
 * Search the directory the control names, with the persona's own words.
 *
 * Which directory comes from the control itself (`source.directory`, or the
 * autocomplete child a confirm carries) — never guessed from the slot name, because
 * a people search for a duty station is exactly the confusion the typed controls
 * exist to prevent.
 */
async function pickFromDirectory(control, said, opts) {
  if (typeof opts.resolveDirectory !== 'function') return null;
  const child = (control.children || []).find((x) => x && x.type === 'autocomplete');
  const kind = (control.source && control.source.directory)
    || (child && child.source && child.source.directory)
    || null;
  if (!kind) return null;
  try {
    return await opts.resolveDirectory(kind, queryFrom(said));
  } catch {
    return null; // the directory being down is not the persona's problem to solve
  }
}

/**
 * @param {Array} controls        `turn.controls` from the previous agent turn
 * @param {string} text           what the persona wrote
 * @param {{resolveDirectory?: Function}} [opts]  async (kind, query) => record|null,
 *   injected by the runner and bound to the REAL directory (see the header).
 * @returns {Promise<{controlAction: object, userMessage: string}|{controlAction: null, why: string}>}
 */
async function clickFor(controls, text, opts = {}) {
  const c = fieldControl(controls);
  if (!c) return { controlAction: null, why: 'no_field_control' };
  const said = String(text || '').trim();
  if (!said) return { controlAction: null, why: 'nothing_said' };

  const slotId = c.slotId;

  switch (c.type) {
    case 'confirm': {
      // A confirm proposes a value and offers a search underneath it. Agreement is a
      // click. Disagreement is what a person does next: they search for the right
      // record — so that is what happens here too, against the real directory.
      if (AFFIRMATIVE.test(said)) return { controlAction: { slotId, value: true }, userMessage: said };
      if (NEGATIVE.test(said) || !AFFIRMATIVE.test(said)) {
        const picked = await pickFromDirectory(c, said, opts);
        if (picked) return { controlAction: { slotId, value: picked }, userMessage: said };
        return { controlAction: null, why: NEGATIVE.test(said) ? 'directory_no_match' : 'unclear_confirm' };
      }
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

    case 'autocomplete': {
      const picked = await pickFromDirectory(c, said, opts);
      return picked
        ? { controlAction: { slotId, value: picked }, userMessage: said }
        : { controlAction: null, why: 'directory_no_match' };
    }

    default:
      return { controlAction: null, why: `unsupported_control:${c.type}` };
  }
}

module.exports = { clickFor, fieldControl, dateFrom, numberFrom, optionsFrom, queryFrom, NEGATIVE };
