'use strict';

/**
 * SCH-004 — a dictionary value, displayed the way Altiora displays it.
 *
 * A dictionary-backed field STORES a key and SHOWS a label, and the label is not one
 * column: Altiora composes it from every display column of the row, each with its own
 * literal prefix and suffix, and each able to start a new line
 * (`formatLinkedDictionaryParts` + `resolveDictionaryFieldDisplayMeta`). A payee is
 * "10001103 — James NDEMEZO", not "10001103".
 *
 * We showed the stored value. On a field where value and label differ that is a
 * number where the user expects a name, and it appears in the confirmation summary —
 * the last thing read before a request is sent.
 *
 * THE COMPOSITION IS PORTED, NOT APPROXIMATED. Same order, same separator rules, same
 * treatment of an empty part (dropped, so no stray dash). What is deliberately NOT
 * ported is date and number re-formatting: those depend on masks the schema does not
 * carry today, and a wrong mask silently changes what a date MEANS. When the masks
 * arrive they belong here, next to this note.
 *
 * MEASURED BEFORE BUILDING: across all 76 live schemas there are 10 dictionary-backed
 * fields and NONE carries extra display columns or display metadata. So today this
 * composes a single part and the prefix/suffix/line-break paths are unexercised in
 * production — they exist because the schema may carry them tomorrow and a composition
 * that quietly ignored them would be the same class of silent divergence this module
 * was written to end.
 *
 * @module instances/flowdesk/interpreter/dictionary-display
 */

/**
 * Compose the display label of one dictionary row.
 *
 * @param {Object<string,string>} values   column id → raw cell value
 * @param {string[]} displayFieldIds       the columns, in display order
 * @param {Object<string,{prefix?:string,suffix?:string,lineBreakBefore?:boolean}>} [meta]
 * @returns {string}
 */
function composeDictionaryDisplay(values, displayFieldIds, meta = {}) {
  let result = '';
  for (const id of (displayFieldIds || [])) {
    const raw = (values && values[id] != null) ? String(values[id]) : '';
    const m = (meta && meta[id]) || {};
    const piece = `${m.prefix || ''}${raw}${m.suffix || ''}`;
    // An empty column contributes nothing — not an empty slot with its separator,
    // which is how "10001103 — " ends up on screen.
    if (!piece.trim()) continue;
    if (result === '') result = piece;
    else if (m.lineBreakBefore) result += `\n${piece}`;
    else result += ` ${piece}`;
  }
  return result;
}

/**
 * What to SHOW for a stored slot value.
 *
 * Order of preference, and each step exists for a case that was observed:
 *   1. a label captured when the value was resolved — the only source that knows
 *      what the dictionary actually said;
 *   2. the label of the matching option, for an enum whose values are codes;
 *   3. a directory user's own name;
 *   4. the value itself.
 *
 * @param {*} value       the stored value
 * @param {Object} [slotDef]    the slot definition (presentOptions, dictRef)
 * @param {Object} [slotState]  the draft's slot record (may carry `display`)
 * @returns {string}
 */
function displayForValue(value, slotDef, slotState) {
  if (slotState && slotState.display) return String(slotState.display);

  if (Array.isArray(value)) {
    return value.map((v) => displayForValue(v, slotDef)).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    // A directory user or location: its own display name, then the composed one.
    const own = value.name || value.label || value.display;
    if (own) return String(own);
    const parts = [value.firstName, value.lastName].filter(Boolean).join(' ').trim();
    if (parts) return parts;
    return value.id || value.userId || JSON.stringify(value);
  }
  if (value == null || value === '') return '';

  const opts = slotDef && Array.isArray(slotDef.presentOptions) ? slotDef.presentOptions : null;
  if (opts) {
    const hit = opts.find((o) => String(o.value) === String(value));
    if (hit && hit.label) return String(hit.label);
  }
  return String(value);
}

module.exports = { composeDictionaryDisplay, displayForValue };
