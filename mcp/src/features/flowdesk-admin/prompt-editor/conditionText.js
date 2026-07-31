/**
 * EC-009 — a condition in words, and the two ways of writing one that does nothing.
 *
 * The summary matters more than the controls. An operator opening a rule almost
 * always wants to know WHEN IT SPEAKS, not to re-choose it; four dropdowns answer
 * that question only after he has read and combined them himself. So the sentence is
 * the primary reading and the fields are the way to change it.
 *
 * The diagnosis mirrors `evolutio-prompt.validator.checkConditionsSane` — the same
 * two findings, said before the save rather than after. Mirrors, not re-decides: the
 * validator remains the authority and runs again on save. What this adds is only the
 * moment. A condition that can never hold is worth catching at the click that creates
 * it, because its symptom otherwise is silence — a rule that is present, correct,
 * enabled, and never once in a prompt.
 */

/** The four the editor offers, in the order the summary reads them. */
export const CONDITION_KEYS = ['phase', 'toolContext', 'serviceCategory', 'language'];

/** Phases that cannot occur without an open request — mirrors PHASES_WITH_DRAFT. */
const PHASES_WITH_DRAFT = ['fill', 'confirm', 'handed_off'];
const ALL_PHASES = ['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off'];

const PHASE_WORD = {
  intent: 'the user is saying what they need',
  service_choice: 'a service is being chosen',
  fill: 'the form is being filled',
  confirm: 'the request is being confirmed',
  reading: 'the knowledge base is being read',
  handed_off: 'the form has been handed over',
};
const TOOL_WORD = {
  has_draft: 'a request is open',
  no_draft: 'no request is open',
  searching_catalog: 'the catalogue is being searched',
  searching_kb: 'the knowledge base is being searched',
};

const list = (xs, join = 'or') => {
  const a = xs.filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  return `${a.slice(0, -1).join(', ')} ${join} ${a[a.length - 1]}`;
};

/**
 * The condition as an English sentence.
 * @param {object|null} condition
 * @returns {string}
 */
export function summarise(condition) {
  const c = condition || {};
  const parts = [];
  if (Array.isArray(c.phase) && c.phase.length) {
    parts.push(list(c.phase.map((p) => PHASE_WORD[p] || p)));
  }
  if (Array.isArray(c.toolContext) && c.toolContext.length) {
    parts.push(list(c.toolContext.map((t) => TOOL_WORD[t] || t)));
  }
  if (Array.isArray(c.serviceCategory) && c.serviceCategory.length) {
    parts.push(`the service is ${list(c.serviceCategory)}`);
  }
  if (Array.isArray(c.language) && c.language.length) {
    parts.push(`the language is ${list(c.language)}`);
  }
  if (!parts.length) return 'Always — this rule is in every prompt.';
  // ANDed, and the word has to be there: "while filling, no request open" would read
  // as two alternatives when it means both at once.
  return `Only when ${parts.join(' and ')}.`;
}

/**
 * The condition in the few characters a canvas node can spare (EC-010).
 *
 * Deliberately the raw vocabulary rather than the prose of `summarise` — on a node
 * the reader wants a recognisable token to scan for, and a sentence would wrap to
 * three lines and push the rule's own text out of view.
 *
 * @param {object|null} condition
 * @returns {string} '' when the rule is unconditional
 */
export function shortCondition(condition) {
  const c = condition || {};
  const parts = CONDITION_KEYS
    .filter((k) => Array.isArray(c[k]) && c[k].length)
    .map((k) => c[k].join(', '));
  if (!parts.length) return '';
  const s = parts.join(' · ');
  return s.length > 34 ? `${s.slice(0, 33)}…` : s;
}

/**
 * The two conditions that are valid, saveable, and pointless.
 * @param {object|null} condition
 * @returns {{error?:string, warning?:string}}
 */
export function diagnoseCondition(condition) {
  const c = condition || {};
  const phase = Array.isArray(c.phase) ? c.phase : null;
  const tool = Array.isArray(c.toolContext) ? c.toolContext : null;

  if (phase && phase.length && tool && tool.length === 1 && tool[0] === 'no_draft'
    && phase.every((p) => PHASES_WITH_DRAFT.includes(p))) {
    return {
      error: `${list(phase.map((p) => PHASE_WORD[p] || p))} only happens with a request open, `
        + 'so "no request is open" can never hold at the same time. This rule would never apply.',
    };
  }

  const keys = Object.keys(c).filter((k) => Array.isArray(c[k]) && c[k].length);
  if (keys.length === 1 && keys[0] === 'phase' && ALL_PHASES.every((p) => phase.includes(p))) {
    return { warning: 'Every phase is selected, so this condition has no effect. Consider removing it.' };
  }
  if (keys.length === 1 && keys[0] === 'toolContext'
    && tool.includes('has_draft') && tool.includes('no_draft')) {
    // Not in the validator, and it is the same shape of mistake: the two exhaust the
    // possibilities, so the pair constrains nothing.
    return { warning: 'A request is either open or it is not, so this condition has no effect.' };
  }
  return {};
}
