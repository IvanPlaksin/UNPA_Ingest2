'use strict';

/**
 * HYB-004 — the third interpreter: a template for the middle of a form, the agent
 * for everything else.
 *
 * The state machine asks every question through the model (QUESTION_PLANNER); the
 * agent writes every turn with the model. Measured over a 27-turn session that
 * completed a 29-field Altiora form, 22 turns were a click and nothing else, and
 * those 22 spent 72.8 of their 72.9 seconds inside the model — phrasing questions
 * `promptHint` already held. This mode answers those turns in code.
 *
 * IT OWNS NO FORM LOGIC AND NO CONVERSATION LOGIC.
 *   - the queue, the ordering, the required-now test → interpreter/form-policy
 *   - the request overlay (recipient, duty station, requester) → form-overlay
 *   - the widget for a slot → interpreter/controls
 *   - writing what the user clicked → the agent tools' own recorders
 *   - a model turn → the EXISTING agent session, not a copy of it
 * What is here is the routing decision (turn-router) and the rendering of a turn
 * that needs no model (template-turn). Anything else that looked like it belonged
 * here was extracted into a shared module instead — that is why `askableQueue` and
 * `buildControlFromSlot` now live in form-policy and controls.
 *
 * THE TWO PATHS SHARE ONE SESSION. The template path and the model path write to
 * the same tool session and the same draft, so a Skip taken by a template turn is
 * invisible to nobody, and the model — when it is called — sees the template's
 * questions in the history it is given. A seam the user can hear is a risk we
 * accepted; a seam the SYSTEM can hear would be a bug.
 *
 * @module instances/flowdesk/hybrid-interpreter/hybrid-session.service
 */

const { createAgentSession } = require('../agent-interpreter/agent-session.service');
const { createToolSession } = require('../agent-interpreter/agent-tools');
const { turnNeedsModel } = require('./turn-router');
const { buildTemplateTurn } = require('./template-turn.service');
const policy = require('../interpreter/form-policy');
const ctrl = require('../interpreter/controls');
const { effectiveSnapshot } = require('../interpreter/form-overlay');
const { ui } = require('../interpreter/templates/ui-strings');

/** Controls that are the question of their own turn rather than a field of the form. */
// EC-002: one definition, imported. The prompt compiler scopes rules by the same
// phase this router decides turns with, so the two must not be able to disagree.
const { FORK_SLOTS, computePhase } = require('../interpreter/dialogue-phase');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a click the way the state machine does, before it becomes a value.
 *
 * The agent path trusts the widget because the widget was built by code. That is
 * true and still not enough: a date arriving in the wrong shape, or an option that
 * is not in the slot's domain, must be REFUSED with a reason rather than stored —
 * and the reason is the thing a template cannot write, so a refusal is what sends
 * the turn to the model (turn-router condition 2).
 *
 * @returns {{ok: true}|{ok: false, why: string, slotId?: string}}
 */
function validateClick(controlAction, snapshot, draft) {
  if (!controlAction || !controlAction.slotId) return { ok: true };
  const { slotId, action } = controlAction;

  if (action === 'date_select' && !ISO_DATE.test(String(controlAction.value || ''))) {
    return { ok: false, why: 'invalid_date', slotId };
  }

  if (action === 'multichoice_select') {
    const def = (snapshot && snapshot.slots || []).find((s) => s.slotId === slotId);
    const picked = Array.isArray(controlAction.values) ? controlAction.values
      : (Array.isArray(controlAction.value) ? controlAction.value : null);
    const allowed = ((def && def.presentOptions) || []).map((o) => o.value);
    if (!picked || !picked.length || picked.some((v) => !allowed.includes(v))) {
      return { ok: false, why: 'not_in_options', slotId };
    }
  }

  // Skip on a REQUIRED field. The request cannot be raised without it, so the
  // refusal has to be explained and the three ways out offered — a model turn.
  if (slotId === '__skip__') {
    const target = (snapshot && snapshot.slots || []).find((s) => s.slotId === controlAction.value);
    if (target && policy.isRequiredNow(target, policy.trefContext(draft, snapshot))) {
      return { ok: false, why: 'skip_required', slotId: target.slotId };
    }
  }

  return { ok: true };
}

/**
 * What to tell the model about a click that was refused.
 *
 * Written as an aside rather than as the user's words, in the same shape the agent
 * loop already uses for a refused Skip — the model reads it, explains it in its own
 * words, and asks again.
 */
function refusalNote(check, controlAction) {
  const value = controlAction && (controlAction.value !== undefined ? controlAction.value : controlAction.values);
  const shown = JSON.stringify(value);
  if (check.why === 'invalid_date') {
    return `[the date control returned ${shown} for "${check.slotId}", which is not a date this form can store. `
      + 'Ask for it again and let them pick from the calendar — nothing was saved.]';
  }
  if (check.why === 'not_in_options') {
    return `[${shown} is not among the options "${check.slotId}" defines, so nothing was saved. `
      + 'Ask again with the options the form gives.]';
  }
  return `[that answer could not be stored on "${check.slotId}". Ask again — nothing was saved.]`;
}

/** Which slots the write invalidated — the stale cascade, seen from outside. */
function resetSlots(before, after) {
  const wasStale = (d, id) => !!(d && d.slots && d.slots[id] && d.slots[id].stale);
  const ids = new Set(Object.keys((after && after.slots) || {}));
  return [...ids].filter((id) => wasStale(after, id) && !wasStale(before, id));
}

/**
 * @param {object} p    same shape the other two session factories take
 * @param {object} deps {llm, resolveSearch, loadSnapshot, draftService, promptService, …}
 */
function createHybridSession(p = {}, deps = {}) {
  // One tool session, shared with the agent below. Created here so the template
  // path can read and write the same skips, offers and gates the model path does.
  const toolSession = deps.toolSession || createToolSession();
  const agent = createAgentSession(p, { ...deps, toolSession });

  const { tools, draftService, sessionId } = agent;
  const defaultLang = p.lang || 'en';

  /**
   * The effective form for the draft — through the TOOLS' loader, not the raw one.
   *
   * That loader carries the request overlay and, more importantly, a per-turn memo:
   * loading a form means detect + getSchemaVersion against Altiora, and this path
   * needs the form three or four times a turn (before the write, after it, to build
   * the control). Measured live before this was wired: a template turn that called
   * no model at all still took 5.8 seconds, all of it Altiora round trips. The memo
   * is armed by beginTurn() at the top of every turn, exactly as the agent loop
   * arms it.
   */
  async function snapshotFor(draft) {
    if (!draft || !draft.serviceId) return null;
    try {
      return typeof tools.loadSnapshot === 'function'
        ? await tools.loadSnapshot(draft.serviceId)
        : effectiveSnapshot(await agent.loadSnapshot(draft.serviceId));
    } catch { return null; }
  }

  /**
   * What the router needs, and nothing more. Every field is derived here rather
   * than stored, except the two the gate agreed cannot be:
   * `fieldsAskedThisForm` and `lastControlType`, which live on the tool session.
   */
  function computeState({ draft, snapshot, controlAction, rejected, slotsReset, lang }) {
    const queue = snapshot ? policy.askableQueue(draft, snapshot, toolSession) : [];
    const nextField = snapshot ? policy.chooseNextSlot(queue, draft, snapshot) : null;
    // FILL means walking the form's fields. A fork control is the turn's own
    // question (which service, confirm, open the form) and belongs to the model;
    // an open submit gate does too, because the next thing said is about the
    // request as a whole. Skip IS filling — it is how an optional field is answered.
    // EC-002: the phase comes from the shared computation, so the rules the prompt
    // compiler selects and the turns this router hands to a template are decided by
    // one fact. `fill` requires the snapshot here because a template cannot render a
    // question without the form — the phase itself is deliberately coarser.
    const phase = computePhase({ session: toolSession, draft, snapshot, controlAction });
    const inFillPhase = phase.phase === 'fill' && !!snapshot;
    return {
      draft,
      snapshot,
      nextField,
      controlRejected: !!rejected,
      slotsReset: slotsReset || [],
      // The ladder is only ever moved by model turns (ratified at the HYB-1 gate),
      // so this reads a state the template path cannot have created.
      repair: { active: !!(draft && draft.repair && (draft.repair.session > 0
        || Object.values(draft.repair.perSlot || {}).some((n) => n > 0))) },
      inFillPhase,
      // Carried so the turn can record the scope it ran under (EC-004).
      phase: phase.phase,
      phaseWhy: phase.why,
      fieldsAskedThisForm: toolSession.fieldsAskedThisForm || 0,
      lang,
      // The long-form fork is offered once per form, by the model, in words. The
      // flag is the agent tools' own (`largeFormOffered`), so the two paths cannot
      // disagree about whether the user has already been asked.
      largeFormOfferPending: !!(snapshot && policy.isLargeForm(snapshot) && !toolSession.largeFormOffered),
    };
  }

  /** The default a directory-backed field proposes, via the agent tools' resolver. */
  const resolveDefault = typeof tools.resolveForControl === 'function'
    ? (slotDef) => tools.resolveForControl(slotDef, { sessionId, session: toolSession, userContext: p.userContext, lang: defaultLang }, null)
    : null;

  /**
   * One turn. Never throws — same contract as the other two factories, so the
   * arena can end a run cleanly.
   */
  async function sendTurn(message, opts = {}) {
    const t0 = Date.now();
    const lang = opts.lang || defaultLang;
    const controlAction = opts.controlAction || opts.choice || null;
    const telemetry = (() => { try { return require('../services/chat-telemetry.service'); } catch { return null; } })();

    try {
      // A new turn: the form may have changed since the last one, so the per-turn
      // snapshot memo starts empty and is then shared by everything below —
      // including the agent loop, if this turn ends up there.
      if (typeof tools.beginTurn === 'function') tools.beginTurn(t0);

      const before = await draftService.get(sessionId).catch(() => null);
      const snapBefore = await snapshotFor(before);

      // 1. VALIDATE, then WRITE — both in code, before anything decides who speaks.
      const check = validateClick(controlAction, snapBefore, before);
      let rejected = !check.ok;
      let skippedThisTurn = false;

      if (check.ok && controlAction) {
        if (controlAction.slotId === '__skip__' || controlAction.action === 'skip') {
          const target = controlAction.value || controlAction.slotId;
          if (target && target !== '__skip__' && typeof tools.recordSkip === 'function') {
            const res = await tools.recordSkip({ sessionId, session: toolSession, userContext: p.userContext, lang }, target);
            if (res && res.ok === false) rejected = true; else skippedThisTurn = true;
          }
        } else if (typeof tools.recordControlAnswer === 'function') {
          await tools.recordControlAnswer(
            { sessionId, session: toolSession, userContext: p.userContext, lang },
            controlAction, toolSession.lastControls || [],
          ).catch(() => null);
        }
      }

      const after = await draftService.get(sessionId).catch(() => null);
      const snapshot = await snapshotFor(after) || snapBefore;

      // 2. DECIDE.
      const state = computeState({
        draft: after, snapshot, controlAction, rejected,
        slotsReset: resetSlots(before, after), lang,
      });
      const routed = turnNeedsModel({ controlAction }, state);

      // 3a. TEMPLATE — no model call at all.
      if (!routed.needsModel) {
        const built = await buildTemplateTurn({
          draft: after, snapshot, nextField: state.nextField, lang,
          lastControlType: toolSession.lastControlType, skipped: skippedThisTurn,
          resolveDefault,
        });
        if (!built.fallthrough) {
          toolSession.fieldsAskedThisForm = (toolSession.fieldsAskedThisForm || 0) + 1;
          toolSession.lastControlType = (built.controls[0] && built.controls[0].type) || null;
          toolSession.lastControls = built.controls;
          if (telemetry) {
            telemetry.recordSpan?.({ kind: 'template', name: `TEMPLATE_FILL ${state.nextField.slotId}`, durationMs: Date.now() - t0, status: 'success' });
          }
          return {
            ok: true,
            ms: Date.now() - t0,
            turn: {
              ...built,
              route: 'TEMPLATE_FILL',
              waiting: true,
              ...(after ? { draft: after } : {}),
              trace: ['TEMPLATE_FILL'],
              // Read by the admin Timeline and by the arena comparison: who wrote
              // this turn, and which condition decided it.
              turnAuthor: 'template',
              routerReason: routed.reason,
            },
          };
        }
        // The template could not render this honestly — the model takes it, and the
        // reason it stepped aside is what telemetry records.
        routed.reason = `fallthrough:${built.why}`;
      }

      // 3b. MODEL — the existing agent session, on the shared tool session.
      //
      // A REFUSED click must not be handed on as a click. The agent loop records a
      // control answer itself (that is how it guarantees a click is never lost), so
      // forwarding a click this path has just refused would have the model quietly
      // store the value the validation rejected — the refusal would be words with
      // nothing behind them. Live in the test: "next Tuesday" landed on a date field
      // one line after being refused for not being a date.
      //
      // So a refusal travels as a DESCRIPTION instead. The exception is Skip on a
      // required field: the agent has its own refusal for that, with the three ways
      // out the state machine offers, and it is better than anything written here.
      const forward = rejected && check.why !== 'skip_required'
        ? { ...opts, lang, controlAction: null, choice: null }
        : { ...opts, lang };
      const text = rejected && check.why !== 'skip_required'
        ? refusalNote(check, controlAction)
        : message;
      const out = await agent.sendTurn(text, forward);
      if (out && out.ok && out.turn) {
        out.turn.turnAuthor = 'model';
        out.turn.routerReason = routed.reason;
        // The model asked something too: the counter is about the FORM, not about
        // who phrased the question, or condition 7 would fire on every model turn.
        if (state.inFillPhase && state.nextField) {
          toolSession.fieldsAskedThisForm = (toolSession.fieldsAskedThisForm || 0) + 1;
        }
        toolSession.lastControls = out.turn.controls || [];
        toolSession.lastControlType = (out.turn.controls && out.turn.controls[0] && out.turn.controls[0].type) || null;
      }
      return out;
    } catch (err) {
      return { ok: false, error: err.message, ms: Date.now() - t0 };
    }
  }

  return {
    sendTurn,
    sessionId,
    systemPromptText: null,
    // The delegate, named. The hybrid IS a wrapper around the agent, and every turn
    // it does not answer itself is this object's. Exposing it lets a test assert what
    // the wrapper does with the delegate's verdict instead of reconstructing a whole
    // tool-call flow to provoke one.
    agent,
    sideEffects: agent.sideEffects,
    sandboxed: agent.sandboxed,
    interpreterMode: 'hybrid',
    // Same seams the agent exposes, so a caller can drive either identically.
    tools, toolSession, draftService, loadSnapshot: agent.loadSnapshot,
  };
}

module.exports = { createHybridSession, validateClick, resetSlots, FORK_SLOTS };
