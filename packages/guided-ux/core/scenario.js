/**
 * The scenario model, and the validator that refuses to ship a broken one.
 *
 * A scenario is authored somewhere else — a JSON file, a graph database, a model that
 * generated it — and every one of those sources can produce something that looks fine
 * and dead-ends at step four. So everything entering the runner passes through here
 * first, and the failures are named rather than discovered live in front of a user.
 *
 * ONE RULE HERE IS NOT ABOUT CORRECTNESS BUT ABOUT BEING BEARABLE.
 *
 * Narration length is capped. Measured against Azure Speech in swedencentral, a
 * 68-character sentence takes 3,988 ms to speak — about 17 characters per second. The
 * research put the attention limit for a single spoken step at 10–15 seconds, which
 * lands at roughly 170–250 characters. A step written past that is not a style problem;
 * it is a step nobody listens to the end of. The validator warns at 250 and errors at
 * 500, so an author finds out while writing rather than from a bored user.
 *
 * @module @guided-ux/tour/core/scenario
 */

/**
 * @typedef {object} TourStep
 * @property {string} id
 * @property {string} [anchorId]      Omitted for a narration step (title card, summary).
 * @property {{title?:object|string, text:object|string}} content  Per-language, or a bare string.
 * @property {string|Array<{to:string, when?:object}>} [next]
 * @property {boolean} [optional]     Missing anchor → skip aloud instead of blocking.
 * @property {'left'|'right'|'top'|'bottom'|'auto'} [placement]
 * @property {object} [meta]
 */

/**
 * @typedef {object} TourScenario
 * @property {string} id
 * @property {string|object} name
 * @property {string} [entry]         Defaults to the first step.
 * @property {TourStep[]} steps
 * @property {string[]} [languages]
 */

/** Speaking rate measured on Azure Speech (swedencentral): 68 chars → 3,988 ms. */
const CHARS_PER_SECOND_SPOKEN = 17;
const SPOKEN_SOFT_LIMIT = 250;   // ~15s — the attention limit from the research
const SPOKEN_HARD_LIMIT = 500;   // ~30s — nobody is listening by here

/** Every string of a per-language field, for length checks and coverage. */
function stringsOf(field) {
  if (typeof field === 'string') return [field];
  if (field && typeof field === 'object') return Object.values(field).filter((v) => typeof v === 'string');
  return [];
}

const spokenSeconds = (text) => Math.round((String(text || '').length / CHARS_PER_SECOND_SPOKEN) * 10) / 10;

/**
 * Check a scenario. Errors block the run; warnings are for the author.
 * @param {TourScenario} scenario
 * @returns {{errors:Array<{code:string,message:string,stepId?:string}>,
 *            warnings:Array<{code:string,message:string,stepId?:string}>}}
 */
function validateScenario(scenario) {
  const errors = [];
  const warnings = [];
  const err = (code, message, stepId) => errors.push({ code, message, ...(stepId ? { stepId } : {}) });
  const warn = (code, message, stepId) => warnings.push({ code, message, ...(stepId ? { stepId } : {}) });

  if (!scenario || typeof scenario !== 'object') {
    err('NOT_AN_OBJECT', 'scenario must be an object');
    return { errors, warnings };
  }
  if (!scenario.id) err('NO_ID', 'scenario needs an id');
  if (!Array.isArray(scenario.steps) || !scenario.steps.length) {
    err('NO_STEPS', 'scenario needs at least one step');
    return { errors, warnings };
  }

  const ids = new Set();
  for (const s of scenario.steps) {
    if (!s || !s.id) { err('STEP_NO_ID', 'every step needs an id'); continue; }
    if (ids.has(s.id)) err('DUPLICATE_STEP', `two steps share the id "${s.id}"`, s.id);
    ids.add(s.id);

    const texts = stringsOf(s.content && s.content.text);
    if (!texts.length) err('STEP_NO_TEXT', `step "${s.id}" has nothing to say`, s.id);

    for (const t of texts) {
      if (t.length > SPOKEN_HARD_LIMIT) {
        err('NARRATION_TOO_LONG',
          `step "${s.id}" narrates ${t.length} characters (~${spokenSeconds(t)}s spoken). `
          + `Split it: past ${SPOKEN_HARD_LIMIT} characters a spoken step is not heard out.`, s.id);
      } else if (t.length > SPOKEN_SOFT_LIMIT) {
        warn('NARRATION_LONG',
          `step "${s.id}" narrates ${t.length} characters (~${spokenSeconds(t)}s spoken). `
          + `Attention drops after about 15s (${SPOKEN_SOFT_LIMIT} characters).`, s.id);
      }
    }
  }

  if (scenario.entry && !ids.has(scenario.entry)) {
    err('BAD_ENTRY', `entry "${scenario.entry}" is not one of the steps`);
  }

  // Dangling successors — the failure that shows up as a tour stopping for no reason.
  for (const s of scenario.steps) {
    if (!s || !s.next) continue;
    const targets = typeof s.next === 'string'
      ? [s.next]
      : (Array.isArray(s.next) ? s.next.map((b) => b && b.to).filter(Boolean) : []);
    for (const t of targets) {
      if (!ids.has(t)) err('DANGLING_NEXT', `step "${s.id}" points at "${t}", which does not exist`, s.id);
    }
    if (Array.isArray(s.next) && s.next.length && !s.next.some((b) => b && !b.when)) {
      // Every branch guarded means the tour can fall off the end when none match.
      warn('NO_DEFAULT_BRANCH',
        `step "${s.id}" has only conditional successors — if none match, the tour ends here.`, s.id);
    }
  }

  // Unreachable steps: authored, never shown, and silently so.
  const entry = scenario.entry || scenario.steps[0].id;
  const reached = new Set();
  const walk = (id) => {
    if (!id || reached.has(id)) return;
    reached.add(id);
    const s = scenario.steps.find((x) => x && x.id === id);
    if (!s || !s.next) return;
    if (typeof s.next === 'string') walk(s.next);
    else if (Array.isArray(s.next)) s.next.forEach((b) => b && walk(b.to));
  };
  walk(entry);
  for (const s of scenario.steps) {
    if (s && s.id && !reached.has(s.id)) {
      warn('UNREACHABLE', `step "${s.id}" cannot be reached from the entry step`, s.id);
    }
  }

  return { errors, warnings };
}

/** Anchor ids a scenario depends on — what a host must declare for it to run whole. */
function anchorsOf(scenario) {
  return [...new Set(((scenario && scenario.steps) || []).map((s) => s && s.anchorId).filter(Boolean))];
}

/**
 * Which of a scenario's anchors the host has actually declared. Meant to be run in a
 * test or a health check: it turns "the tour will break for someone, someday" into a
 * list of ids, today.
 */
function coverage(scenario, registry) {
  const needed = anchorsOf(scenario);
  const missing = needed.filter((id) => !registry.has(id));
  return { needed, missing, ok: missing.length === 0 };
}

export { validateScenario, anchorsOf, coverage, spokenSeconds, CHARS_PER_SECOND_SPOKEN, SPOKEN_SOFT_LIMIT, SPOKEN_HARD_LIMIT };
