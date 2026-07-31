'use strict';

/**
 * Agent loop (EXP-002) — the alternative interpreter.
 *
 * One turn = system prompt + full history + tools, iterated until the model
 * stops calling tools and writes a reply. Compare with the state machine, where
 * a turn is a route classification followed by template assembly: here every
 * user-visible sentence is written by the model, having seen what the user said
 * and what the tools returned.
 *
 * The output is the SAME turn-response object chat-v2.service builds, so the
 * frontend, the arena and the metrics cannot tell which interpreter produced a
 * turn except by looking at the text — which is exactly how the comparison is
 * meant to be judged.
 *
 * Two contracts inherited from the code it stands beside:
 *   - sendTurn NEVER throws. The arena terminates a run on {ok:false}; an
 *     exception escaping here would abort the whole experiment instead.
 *   - a turn is never empty. Out of iterations, out of tokens, provider down —
 *     the user gets a sentence saying so, because silence is the one response a
 *     person cannot act on.
 *
 * @module instances/flowdesk/agent-interpreter/agent-loop.service
 */

const { createAgentTools, createToolSession, TOOL_SCHEMAS } = require('./agent-tools');
const { ui } = require('../interpreter/templates/ui-strings');

const MAX_TOOL_ITERATIONS = 8;

/**
 * Tools that only tell the interface what to draw. Their result is an
 * acknowledgement, not information: nothing in it changes what the model would
 * say next. See the early-exit in runTurn.
 */
const PRESENTATION_TOOLS = new Set(['emit_control']);

/**
 * Affirmatives across the six supported languages, for the confirm gate.
 *
 * No \b: it is an ASCII word boundary in JavaScript, so it never matches after a
 * Cyrillic, Arabic or Han character — the same trap that silenced the Russian
 * rejection patterns in dialogue-metrics. Anchored on the start of the message
 * plus whitespace, end, or punctuation instead.
 */
const AFFIRMATIVE = /^\s*(y|yes|yeah|yep|ok|okay|sure|confirm|confirmed|submit|go ahead|да|ага|подтверждаю|верно|oui|d'accord|sí|si|confirmo|نعم|موافق|是|好|确认)(\s|$|[.,!;。！，])/i;

/** A stored value as a person would read it — directory records are objects. */
function describeValue(v) {
  if (v && typeof v === 'object') return String(v.name || v.title || v.label || v.email || v.code || JSON.stringify(v));
  return String(v);
}

/**
 * Did the user choose to open the form itself?
 *
 * The large-form offer is a real fork in the conversation, and the answer is the
 * user's, not the model's. fdv2-2815b706 shows the cost of leaving it to the
 * model: the user picked "open the form" and the agent carried on asking fields
 * one at a time, as though nothing had been said.
 */
const WANTS_FORM = /^(open|form|wizard|yes|true)/i;
const WANTS_CHAT = /^(stay|assistant|continue|chat|no|false)/i;
function choseToOpenForm(controlAction) {
  if (!controlAction || controlAction.slotId !== '__open_form__') return false;
  const v = String(controlAction.value ?? '').trim();
  if (!v) return true;                       // a bare click on the offer's first option
  if (WANTS_CHAT.test(v)) return false;
  return WANTS_FORM.test(v) || v.includes(':'); // "wizard:SVC-1" style option values
}

const textOf = (content) => (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
const toolUsesOf = (content) => (content || []).filter((b) => b.type === 'tool_use');

/**
 * What the user actually did, as a sentence the model can read.
 *
 * When someone answers by clicking a control there is no typed message, and an
 * empty user turn is rejected outright by the Messages API ("user messages must
 * have non-empty content"). Worse than the error: even if it were accepted, the
 * model would see a blank turn and have no idea what was chosen.
 *
 * The label is resolved from the control that was actually shown, so the model
 * reads "Education Grant Claim(s) Queries" rather than an opaque service code.
 *
 * @param {string|null|undefined} message
 * @param {{slotId?, value?, action?}|null} controlAction
 * @param {Array} shownControls  controls emitted on the previous reply
 */
function describeUserTurn(message, controlAction, shownControls) {
  const typed = String(message ?? '').trim();
  if (typed) return typed;
  if (!controlAction) return '';

  const { slotId, value, action } = controlAction;
  if (action === 'skip' || slotId === '__skip__') return `[skipped ${value || slotId}]`;

  const control = (shownControls || []).find((c) => c && c.slotId === slotId);
  const option = control && Array.isArray(control.options)
    ? control.options.find((o) => String(o.value) === String(value))
    : null;
  const shown = option ? option.label : value;

  if (control && control.type === 'confirm') {
    return value === false || value === 'false' ? '[declined the confirmation]' : '[confirmed]';
  }
  if (shown === undefined || shown === null || shown === '') return `[answered ${slotId}]`;
  // The VALUE as well as the label, when they differ.
  //
  // A picked option was described by its label alone, and for the service choice
  // that is a title, not a code. Session fdv2-dacb3883: the user clicked
  // "Extension of Appointment & Assignment", the model was told only that, and
  // invented `EO-HR-EAA` for draft_create — the real code, EO-HR-SA-EXT, was in
  // the option it had just been handed. The refusal, re-search and retry cost two
  // extra model calls and 5.8 of that turn's 13.4 seconds.
  const picked = option ? String(option.value) : null;
  return (picked && picked !== String(shown))
    ? `[selected: ${shown} (${picked})]`
    : `[selected: ${shown}]`;
}

function createAgentLoop(deps = {}) {
  const llm = deps.llm;
  const tools = deps.tools || createAgentTools(deps);
  const promptService = deps.promptService || require('./agent-prompt.service');
  const model = deps.model || process.env.FLOWDESK_AGENT_MODEL || process.env.FLOWDESK_LLM_MODEL || 'claude-haiku-4-5-20251001';
  const maxIterations = deps.maxToolIterations || MAX_TOOL_ITERATIONS;
  const promptEntryId = deps.promptEntryId || process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;
  const promptVersion = deps.promptVersion ?? null;
  const promptGraph = deps.promptGraph || null;

  /**
   * Drive one turn.
   * @param {{sessionId, history:Array, userMessage:string, lang?:string, userId?, userContext?, controlAction?, session?}} p
   */
  async function runTurn(p) {
    const lang = p.lang || 'en';
    const session = p.session || createToolSession();
    // Keep what was shown last turn BEFORE clearing: a control answer is resolved
    // to its human label against those controls.
    const shownControls = session.controls || [];
    session.controls = []; // controls belong to THIS reply, not the session
    // A new turn: the form may have changed since the last one, so the per-turn
    // snapshot memo starts empty.
    const turnStamp = Date.now();
    if (typeof tools.beginTurn === 'function') tools.beginTurn(turnStamp);
    session.openForm = null; // ditto: a hand-off is one turn's event, not a state

    // The user's answer to a confirm control is what unlocks draft_submit. It is
    // read here, from the user's own words, and never inferred by the model.
    if (session.confirmShown && !session.confirmAccepted) {
      // Matched against the control that WAS shown, not against a fixed name.
      // The literal `__confirm__` test cost session fdv2-996e487d its ending: the
      // model named the gate `__submit__`, then `__confirm_submit__`, then
      // `__final_confirm__`, so four clicks registered as nothing and the submit
      // was refused five times.
      const gate = session.confirmSlotId || '__confirm__';
      const onGate = p.controlAction && p.controlAction.slotId === gate;
      const answered = onGate ? p.controlAction.value : null;
      const declined = onGate && (answered === false || answered === 'false');
      if (declined) session.confirmAccepted = false;
      else if (onGate && (answered === undefined || answered === null || answered === true || answered === 'true')) session.confirmAccepted = true;
      else if (typeof answered === 'string' && AFFIRMATIVE.test(answered)) session.confirmAccepted = true;
      else if (AFFIRMATIVE.test(String(p.userMessage || ''))) session.confirmAccepted = true;
    }

    const ctx = {
      sessionId: p.sessionId, userId: p.userId || null,
      userContext: p.userContext || {}, session, lang,
    };

    // Pressing Skip is the USER's decision, so it is recorded here rather than
    // left to the model to remember. A skipped optional field leaves the askable
    // queue for the rest of the session — re-offering it is how an intake turns
    // into an interrogation.
    //
    // A REQUIRED field is refused (ADCC-097). The refusal is handed to the model
    // as what the user did, so it explains and offers the way out the state
    // machine offers — provide it, park the request, or cancel — instead of
    // silently repeating the question or, worse, carrying on without the value.
    // A chosen service is remembered for the rest of the session: the brief names
    // it, so the code never has to be guessed from a title again.
    if (p.controlAction && p.controlAction.slotId === '__service__' && p.controlAction.value) {
      session.chosenServiceCode = String(p.controlAction.value);
    }

    let skipRefusal = null;
    if (p.controlAction && (p.controlAction.slotId === '__skip__' || p.controlAction.action === 'skip')) {
      const skippedId = p.controlAction.value || p.controlAction.slotId;
      if (skippedId && skippedId !== '__skip__' && typeof tools.recordSkip === 'function') {
        const res = await tools.recordSkip(ctx, skippedId);
        if (res && res.ok === false && res.label) skipRefusal = res;
      }
    }

    // What the user CLICKED is written to the draft here, by code — before the
    // model is asked anything. A click carries its value in the control that was
    // shown; leaving the model to re-derive it is how "Who is submitting this
    // request?" was answered three times and asked a fourth (fdv2-2815b706).
    // Pre-draft answers land on the session and draft_create carries them in.
    let recorded = null;
    if (p.controlAction && typeof tools.recordControlAnswer === 'function') {
      try {
        recorded = await tools.recordControlAnswer(ctx, p.controlAction, shownControls);
      } catch { /* the turn must survive a draft that would not take the value */ }
    }
    // And what the user TYPED into the box that was on screen, for the same
    // reason: the brief below is written before the model runs, so an answer the
    // model records later leaves the brief — and the control the code emits — one
    // field behind the sentence the model writes. See recordTypedAnswer.
    if (!recorded && !p.controlAction && typeof tools.recordTypedAnswer === 'function') {
      try {
        recorded = await tools.recordTypedAnswer(ctx, p.userMessage, shownControls);
      } catch { /* as above */ }
    }

    // Opening the form is an action, not a topic. Done here so the click cannot be
    // lost between the user and the model.
    let openedForm = false;
    if (choseToOpenForm(p.controlAction) && tools.TOOLS && tools.TOOLS.open_form) {
      const res = await tools.execute('open_form', {}, ctx);
      openedForm = res && res.ok !== false;
    }

    // EC-003: which rules apply depends on where the conversation stands. Computed
    // from the session and the draft by code — never by the model, whose behaviour
    // this prompt is about to configure.
    //
    // The draft is read best-effort: a store hiccup must cost a coarser prompt scope,
    // not the turn. The form snapshot is deliberately NOT fetched here — it would add
    // an Altiora round trip to every turn to sharpen a scope that is already right.
    let promptContext = null;
    try {
      const { compilationContext } = require('../interpreter/dialogue-phase');
      const draftNow = typeof tools.currentDraft === 'function' ? await tools.currentDraft(ctx) : null;
      promptContext = compilationContext({ session: ctx.session, draft: draftNow, controlAction: p.controlAction, lang });
    } catch { /* no context is the old behaviour: every rule applies */ }

    const built = await promptService.build({
      entryId: promptEntryId, version: promptVersion, graph: promptGraph,
      lang, toolSchemas: tools.TOOL_SCHEMAS || TOOL_SCHEMAS,
      context: promptContext,
    });

    // Never send an empty user turn: the Messages API rejects it outright, and a
    // blank turn would tell the model nothing about what the user clicked.
    const userTurnText = (skipRefusal
      ? `[tried to skip "${skipRefusal.label}" — that field is required and cannot be skipped. Explain why it is needed and ask for it, or offer to park the request for later or cancel it.]`
      // Say what was STORED, not that something was confirmed. "[confirmed]" told
      // the model nothing it could act on and nothing it could acknowledge.
      : (openedForm
        ? '[chose to fill the form directly — it is opening now, pre-filled with everything collected. Say so, say that assisted filling ends here, and do NOT ask for any more fields.]'
        : (recorded
          // A typed answer keeps the user's own words: they said more than the
          // value often enough that replacing them with a receipt loses the turn.
          ? `${recorded.typed ? `${String(p.userMessage || '').trim()}\n` : ''}`
            + `[answered "${recorded.label}" — recorded as ${describeValue(recorded.value)}. It is already saved; acknowledge it and move to the next field.]`
          : describeUserTurn(p.userMessage, p.controlAction, shownControls))))
      || '[the user responded without text]';

    // The form's state rides with the user's turn. It is written as an aside,
    // not as words the user said, and it is NOT kept in history: only what is
    // true NOW should steer the next question.
    const brief = typeof tools.turnBrief === 'function' ? await tools.turnBrief(ctx, p.userMessage) : null;
    const messages = [
      ...(p.history || []),
      { role: 'user', content: brief ? `${userTurnText}

${brief}` : userTurnText },
    ];

    // Stable part first, varying part second: the provider caches up to and
    // including the first block. Falls back to the whole text for a prompt
    // service that predates the split.
    const builtSystem = built.prefix
      ? [{ text: built.prefix }, ...(built.tail ? [{ text: built.tail }] : [])]
      : built.text;
    const toolCalls = [];
    let iterations = 0;
    let costUsd = 0;
    let tokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;
    let finalText = '';

    while (iterations < maxIterations) {
      iterations += 1;
      // Timed per ITERATION. A turn that called the model four times and a turn
      // that called it once are the same number in `llmLatencyMs`; only the
      // per-call spans show which one it was.
      const iterT0 = Date.now();
      const resp = await llm.messages({
        model,
        system: builtSystem,
        messages,
        tools: tools.TOOL_SCHEMAS || TOOL_SCHEMAS,
        maxTokens: 2048,
        // The system prompt and the tool schemas are identical on every call of
        // every turn of every session — 3,917 tokens re-read ~3.7 times a turn.
        cache: true,
      });
      cacheCreationTokens += resp.cacheCreationTokens || 0;
      cacheReadTokens += resp.cacheReadTokens || 0;

      // Keep what was sent and what came back, for an hour, so a slow or wrong
      // turn can be read rather than guessed at. The prompt is assembled from a
      // graph, a contract, tool schemas and a per-turn brief — there is no other
      // way to see the thing the model actually received.
      let callKey = null;
      try {
        callKey = await require('../services/llm-call-store.service').recordCall({
          sessionId: p.sessionId,
          seq: `${turnStamp}-${iterations}`,
          model,
          system: builtSystem,
          messages,
          tools: tools.TOOL_SCHEMAS || TOOL_SCHEMAS,
          response: resp.content,
          durationMs: Date.now() - iterT0,
          cacheReadTokens: resp.cacheReadTokens || 0,
          cacheCreationTokens: resp.cacheCreationTokens || 0,
        });
      } catch { /* never at the cost of the turn */ }

      try {
        require('../services/chat-telemetry.service').recordSpan({
          kind: 'llm', name: `${model} #${iterations}`, durationMs: Date.now() - iterT0, status: 'success',
          // The span carries the key, so the panel can fetch this exact call.
          ...(callKey ? { callKey } : {}),
          // What the cache did for THIS call: `read` is the prefix served from
          // cache, `creation` the cost of writing it. A turn whose first call
          // creates and whose rest read is the shape we are aiming for.
          cacheReadTokens: resp.cacheReadTokens || 0,
          cacheCreationTokens: resp.cacheCreationTokens || 0,
        });
      } catch { /* telemetry never costs a turn */ }
      costUsd += resp.cost || 0;
      tokens += resp.tokens || 0;

      const uses = toolUsesOf(resp.content);
      if (!uses.length) {
        // Only replace the running text when there IS a final message. A model
        // that wrote prose alongside its last tool call and then returned nothing
        // has still said something to the user; discarding it would degrade a
        // turn that was fine.
        const t = textOf(resp.content);
        if (t) finalText = t;
        break;
      }

      // Keep any prose the model wrote alongside its tool call; it is often the
      // acknowledgement that makes the next reply read as a continuation.
      const interim = textOf(resp.content);
      if (interim) finalText = interim;

      messages.push({ role: 'assistant', content: resp.content });
      const results = [];
      let allOk = true;
      for (const use of uses) {
        const result = await tools.execute(use.name, use.input, ctx);
        if (result.ok === false) allOk = false;
        // P-4: WHY it failed, not just that it did.
        //
        // A failed tool call was recorded as `{name, ok:false}` and the reason was
        // told to the model and then thrown away. Live, draft_create failed twice in
        // one dialogue — two wasted turns and a question asked into nothing — and the
        // replay could only say "draft_create: error". The operator this admin exists
        // for has no process logs, so the turn record has to carry the sentence.
        //
        // Capped: these are written for a person to read, but a tool that returns a
        // provider's stack trace must not push a turn record to a megabyte.
        toolCalls.push({
          name: use.name, ok: result.ok !== false, ms: result.ms ?? null,
          ...(result.ok === false ? { error: String(result.error || 'failed').slice(0, 500) } : {}),
        });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
          ...(result.ok === false ? { is_error: true } : {}),
        });
      }

      // THE TURN IS ALREADY FINISHED — stop instead of asking the model again.
      //
      // A presentation tool tells the interface what to render; it returns
      // nothing the model has to reason about. When the round was only those,
      // they all succeeded, and the model already wrote its sentence alongside
      // them, going back for another response buys nothing.
      //
      // Measured, not assumed: in session fdv2-1c4e8d00 the last call of SIX of
      // nine turns came back with neither text nor a tool call — 8.3 seconds of a
      // 47-second session spent on replies that contained nothing. The user's
      // reply had already been written one call earlier.
      //
      // A refusal breaks the rule deliberately: the model has to see it and fix
      // the control, which is exactly the round this shortcut must not skip.
      if (allOk && finalText && uses.every((u) => PRESENTATION_TOOLS.has(u.name))) break;

      messages.push({ role: 'user', content: results });
    }

    const degraded = !finalText;
    if (degraded) {
      // Out of iterations or an empty final message. Say something true rather
      // than nothing — see the header.
      finalText = ui(lang).internalError;
    }

    // A prompt can ask the model to attach a control; only code can guarantee it.
    // Asked in prose for a form field the user could have clicked, the reply is
    // strictly worse than the state machine's — and unusable by voice. So when a
    // turn ends with an open draft, missing required fields and no control, the
    // control is attached here, built from the schema.
    // Asked on EVERY turn, not only on turns that emitted nothing. A model that
    // attaches a control of its own invention (fdv2-039fd2b4 shipped a two-option
    // "for me / for someone else" menu that filled no field) looks, to a test for
    // emptiness, exactly like a model that got it right.
    if (typeof tools.autoControlFor === 'function') {
      try {
        const auto = await tools.autoControlFor(ctx, finalText, session.controls);
        // An optional field comes back as [field, skip]: the way out ships with
        // the question or the field reads as mandatory.
        const list = auto ? (Array.isArray(auto) ? auto : [auto]) : [];
        // A control marked `replaces` is the question of the turn and stands
        // alone — the long-form fork must not arrive beside the field question it
        // exists to spare the user.
        const takeover = list.find((c) => c && c.replaces);
        if (takeover) {
          session.controls = list.map(({ replaces, question, ...c }) => c);
          // The question comes with the control it belongs to. Leaving the
          // model's sentence in place put a question about one thing above
          // buttons about another (fdv2-e1791ec1).
          if (takeover.question) finalText = takeover.question;
        } else {
          session.controls.push(...list);
        }
      } catch { /* best-effort: a missing control must not cost the user the turn */ }
    }

    // The form is opening: assisted filling is over, so nothing on this turn may
    // still ask for a field. Live, the model acknowledged the hand-off and put a
    // "describe your request" box underneath it.
    if (session.openForm) session.controls = [];

    return {
      response: finalText,
      controls: session.controls.length ? session.controls : null,
      // Rides the turn exactly as the state machine's does; the host opens the
      // real form with the draft pre-filled.
      ...(session.openForm ? { openForm: session.openForm } : {}),
      session,
      meta: {
        iterations, toolCalls, costUsd, tokens, degraded,
        cacheCreationTokens, cacheReadTokens,
        // What the model was actually sent (rules + contract + padding + language).
        promptTextHash: built.textHash || null,
        // The compiled RULES alone — the only one comparable to a rebuilt version of
        // the graph. See the two-hash note in agent-prompt.service.
        promptGraphTextHash: built.manifest ? built.manifest.textHash : null,
        promptGraphEntryId: built.manifest ? built.manifest.graphEntryId : null,
        promptGraphVersion: built.manifest ? built.manifest.graphVersion : null,
        // EC-004: WHICH rules applied now follows from (version, context), so the
        // context has to be recorded too — otherwise attribution can name the version
        // and still not explain what the model was given.
        promptContext,
      },
      // History for the next turn: the user's message and the final reply only.
      // Tool traffic stays out — replaying it would grow the context without
      // telling the model anything the reply does not already say.
      history: [
        ...(p.history || []),
        { role: 'user', content: userTurnText },
        { role: 'assistant', content: finalText },
      ],
    };
  }

  return { runTurn, MAX_TOOL_ITERATIONS: maxIterations };
}

module.exports = { createAgentLoop, MAX_TOOL_ITERATIONS, AFFIRMATIVE, describeUserTurn, describeValue };
