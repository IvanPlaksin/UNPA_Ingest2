'use strict';

/**
 * Where the conversation stands — ONE computation, two consumers.
 *
 * The hybrid router already worked this out every turn to decide whether a template
 * could answer a click. The prompt compiler now needs the same fact to decide which
 * rules apply (EC-001). Writing it twice would give us two functions that agree today
 * and disagree after the first edit to either — and then the prompt would be scoped to
 * a phase the router does not believe we are in, with nothing failing anywhere.
 *
 * This project has paid for that lesson repeatedly, which is why `form-policy`,
 * `form-overlay` and `controls` are shared rather than copied.
 *
 * COMPUTED BY CODE, NEVER BY THE MODEL. The prompt configures the model; if the model
 * decided the phase, the prompt would depend on its own output and no compilation
 * could be reproduced from (graph version, context).
 *
 * DEGRADES RATHER THAN FETCHES. The form snapshot sharpens `fill` but costs an Altiora
 * round trip, so it is used when the caller already has it and never fetched here. The
 * phase is a scope for prompt rules, not a control decision; being one turn coarse is
 * cheaper than making every turn slower.
 *
 * @module instances/flowdesk/interpreter/dialogue-phase
 */

/** The vocabulary, in the order a conversation normally moves through it. */
const PHASES = ['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off'];

/** Facts about the last action, for scopes the phase cannot express. */
const TOOL_CONTEXTS = ['has_draft', 'no_draft', 'searching_catalog', 'searching_kb'];

/**
 * Controls that are the TURN's own question rather than a field of the form — picking
 * a service, a confirm gate, opening the form. Clicking one is not "filling".
 * This module OWNS the list; the hybrid session imports it. Two copies had already
 * started to drift while this file was being written — one had three entries, the
 * other four — which is the duplication argument making itself again in miniature.
 */
const FORK_SLOTS = new Set(['__service__', '__confirm__', '__open_form__', '__large_form__']);

/**
 * @param {{session?:object, draft?:object, snapshot?:object, controlAction?:object}} p
 *   `session` is the agent tool session; `draft` the DraftSR; `snapshot` the form, when
 *   the caller already holds it.
 * @returns {{phase:string, toolContext:string[], serviceCategory:string|null, why:string}}
 */
function computePhase(p = {}) {
  const session = p.session || {};
  const draft = p.draft || null;
  const snapshot = p.snapshot || null;
  const onFork = !!(p.controlAction && FORK_SLOTS.has(p.controlAction.slotId));

  const serviceId = (draft && draft.serviceId) || session.draftServiceCode || session.chosenServiceCode || null;

  const phase = (() => {
    // The hand-off ends assisted composition; nothing after it is intake.
    if (session.openForm || session.finalGateShown) return { phase: 'handed_off', why: 'the form has been handed over' };
    // An open submit gate is about the request as a whole, not about a field.
    if (session.confirmShown && !session.confirmAccepted) return { phase: 'confirm', why: 'a confirm gate is open' };
    // Filling means walking the form's fields. A fork control is the turn's own
    // question and belongs to the model, so it is not filling.
    if (draft && draft.serviceId && !onFork) {
      return snapshot
        ? { phase: 'fill', why: 'a draft and its form are open' }
        : { phase: 'fill', why: 'a draft is open (form not loaded here)' };
    }
    // More than one candidate offered and nothing chosen yet.
    const offered = session.offeredServiceCodes;
    const offeredCount = offered ? (offered.size ?? (Array.isArray(offered) ? offered.length : 0)) : 0;
    if (!draft && offeredCount > 1 && !session.chosenServiceCode) {
      return { phase: 'service_choice', why: `${offeredCount} services offered, none chosen` };
    }
    // Reading: the last thing done was a knowledge-base lookup and no request is open.
    if (!draft && session.lastTool === 'kb_search') return { phase: 'reading', why: 'answering from the knowledge base' };
    return { phase: 'intent', why: 'no service resolved yet' };
  })();

  const toolContext = [];
  toolContext.push(draft && draft.serviceId ? 'has_draft' : 'no_draft');
  if (session.lastTool === 'catalog_search') toolContext.push('searching_catalog');
  if (session.lastTool === 'kb_search') toolContext.push('searching_kb');

  return {
    phase: phase.phase,
    why: phase.why,
    toolContext,
    // The family, not the service: `EO-HR-BE-EG-EGC` → `EO-HR`. A rule pinned to one
    // service is nearly always a field hint in disguise and belongs on the form.
    serviceCategory: serviceId ? String(serviceId).split('-').slice(0, 2).join('-') : null,
  };
}

/**
 * The compilation context the prompt compiler evaluates conditions against.
 * Separated from `computePhase` so the caller can add what only it knows (language,
 * channel) without this module reaching for request state.
 */
function compilationContext(p = {}) {
  const { phase, toolContext, serviceCategory } = computePhase(p);
  return {
    phase,
    toolContext,
    serviceCategory,
    serviceId: (p.draft && p.draft.serviceId) || (p.session && p.session.draftServiceCode) || null,
    language: p.lang || 'en',
    channel: p.channel || 'text',
  };
}

module.exports = { computePhase, compilationContext, PHASES, TOOL_CONTEXTS, FORK_SLOTS };
