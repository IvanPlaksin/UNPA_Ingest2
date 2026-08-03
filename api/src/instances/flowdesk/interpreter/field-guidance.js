'use strict';

/**
 * What a field MEANS, said in the question rather than beside it.
 *
 * The template asked "Got it. Amendment Type" — a label, not a question. The guidance
 * existed the whole time and went onto the CONTROL'S label, where it is rendered small
 * or not at all; the sentence the person reads carried none of it. Someone who does
 * not know what an amendment type is was given the words they did not understand,
 * twice.
 *
 * TWO SOURCES, AND THEY ARE NOT EQUAL. Measured across the live catalogue:
 *
 *   · 269 of 465 slots (58%) carry `helpText` — Altiora's own `description` and
 *     `placeholder`, written by whoever owns the service. It is authoritative and it
 *     sometimes carries RULES rather than description ("if you do not know the Umoja
 *     document number, enter -1");
 *   · all 73 schemas carry AI field meanings from the P7 enrichment, covering every
 *     field including the 42% Altiora left bare.
 *
 * So the answer to "which template" is neither one alone and NOT both together: the
 * human text wins where it exists, the generated text fills the gap, and they are
 * never concatenated. They say the same thing in different words, and a chat turn
 * that repeats itself in two registers is longer and less trusted, not clearer. In
 * voice it would be read aloud twice.
 *
 * LENGTH IS THE OTHER HALF. Some descriptions are a paragraph. A question with a
 * paragraph attached is not a question anyone answers, so guidance is cut to one
 * sentence for the message while the control keeps the whole of it — the reader who
 * wants the detail is looking at the field.
 *
 * @module instances/flowdesk/interpreter/field-guidance
 */

/** Roughly the length at which a spoken or read question stops being one. */
const MAX_INLINE = 160;

/**
 * The first sentence, or a clean truncation. Never a mid-word cut: "enter the Busine…"
 * reads as a rendering fault rather than as an abbreviation.
 */
function oneSentence(text, max = MAX_INLINE) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // The FIRST sentence, not as much as fits. Taking the last boundary under the limit
  // returned two sentences whenever two happened to fit, which is the paragraph
  // problem again one size down.
  const end = s.search(/[.!?](\s|$)/);
  if (end > 0 && end + 1 <= max) return s.slice(0, end + 1).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${s.slice(0, space > 40 ? space : max).trim()}…`;
}

/**
 * The guidance for one slot.
 *
 * @param {object} slotDef
 * @returns {{full:string, inline:string}|null} `full` for the control, `inline` for
 *   the sentence — or null when the field explains itself.
 */
function guidanceFor(slotDef) {
  if (!slotDef) return null;
  // `helpText` is where the materializer already puts Altiora's own description and
  // placeholder, machine artefacts filtered out ("Auto-generated field for …").
  // `fieldMeaning` is the generated fallback, merged in at materialization so the
  // template path needs no lookup — it answers in 683 ms and a round trip here would
  // be paid on every field of every form.
  const full = String(slotDef.helpText || slotDef.fieldMeaning || '').trim();
  if (!full) return null;
  const inline = oneSentence(full);
  // Guidance that merely restates the label teaches nothing and costs a line.
  const label = String(slotDef.promptHint || '').trim().toLowerCase();
  if (inline.toLowerCase() === label) return null;
  return { full, inline };
}

/**
 * The question a person is actually asked: the field, then what it is for.
 *
 * `{label}: {guidance}` — a colon rather than a dash, because the second half is an
 * explanation of the first and not an aside. When there is no guidance the question
 * is unchanged, which is most of what makes this safe to apply everywhere.
 */
function questionWithGuidance(question, slotDef) {
  const g = guidanceFor(slotDef);
  if (!g) return question;
  const q = String(question || '').trim();
  // A question that already contains its own explanation (some Altiora labels are
  // whole clauses) is left alone rather than given a second one.
  if (q.length > 90 || q.toLowerCase().includes(g.inline.slice(0, 30).toLowerCase())) return q;
  return `${q.replace(/[?:]\s*$/, '')}: ${g.inline}`;
}

module.exports = { guidanceFor, questionWithGuidance, oneSentence, MAX_INLINE };
