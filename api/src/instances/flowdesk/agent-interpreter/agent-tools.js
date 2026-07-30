'use strict';

/**
 * Agent tools (EXP-002) — the only things the agent interpreter can DO.
 *
 * Every tool is a thin wrapper over a service the state machine already uses, so
 * the two architectures reach the same catalogue, the same drafts and the same
 * Altiora. A difference in the arena must come from how the dialogue is
 * conducted, not from one side having better plumbing.
 *
 * GUARDRAILS ARE CODE, NOT PROMPT. The system prompt can ask the model to behave;
 * only a guardrail can guarantee it. Three are load-bearing:
 *
 *   1. draft_create rejects a serviceCode the model did not get from a
 *      catalog_search in THIS session. Without it the model can invent a
 *      plausible-looking code — the arena caught the state machine's LLM
 *      hallucinating "Payroll Banking Details Update", a service that does not
 *      exist, and promising to raise it.
 *   2. draft_submit rejects unless a confirm control was shown AND the user
 *      answered it affirmatively. Submitting creates a real ticket; a model that
 *      decides on its own that the user agreed is the one failure mode that
 *      cannot be undone by a better reply.
 *   3. escalation_create is the ONLY way to escalate, and it writes a node. The
 *      state machine's model announced hand-offs six times in the arena with no
 *      mechanism behind the words. Here the words cost a tool call or they are
 *      not true.
 *
 * Tools never throw at the model. A failure comes back as `{ok:false, error}`
 * with text the model can act on, because a thrown exception ends the turn while
 * a described failure lets it recover — which is the entire point of an agent.
 *
 * @module instances/flowdesk/agent-interpreter/agent-tools
 */

/** Slots whose confirm control defaults to the signed-in user ("is this for you?"). */
const SELF_DEFAULT_SLOTS = new Set(['beneficiary', 'author']);

/**
 * Names models invent for questions that ARE real fields.
 *
 * Session fdv2-039fd2b4: asked "is this extension request for yourself, or for
 * someone else?" and emitted its own `__recipient__` choice — a two-option menu
 * that fills nothing, so the answer had to be followed by another turn asking for
 * the person anyway. The recipient question is not the agent's own question: it
 * is the `beneficiary` field, and it renders as one click for yourself plus a
 * directory search for anyone else. Redirected rather than refused, because the
 * model's intent was right and only the name was its own.
 */
const SLOT_ALIASES = new Map([
  ['__recipient__', 'beneficiary'],
  ['__recipient_type__', 'beneficiary'],
  ['__beneficiary__', 'beneficiary'],
  ['__for_whom__', 'beneficiary'],
  ['__requestfor__', 'beneficiary'],
  ['__request_for__', 'beneficiary'],
  ['__location__', 'location'],
  ['__duty_station__', 'location'],
  ['__dutystation__', 'location'],
  ['__location_confirm__', 'location'],
]);
/**
 * Controls that ARE the question of their turn: choosing between services,
 * filling the form here or opening it, confirming before submit. The next field
 * must not be attached alongside one of these, or the user is asked two things
 * at once — live, the large-form offer arrived with a description box under it.
 */
const FORK_SLOTS = new Set(['__open_form__', '__confirm__', '__large_form__']);

/**
 * The fork that comes BEFORE the opening questions: which service is this even
 * about. Nothing may be asked alongside it — "who is this for?" next to "which of
 * these three services?" is two questions in one turn, and the second one cannot
 * be answered until the first is.
 */
const SERVICE_FORK = '__service__';

const canonicalSlotId = (slotId) => SLOT_ALIASES.get(String(slotId || '').toLowerCase()) || slotId;

const CONTROL_TYPES = ['choice', 'confirm', 'text', 'textarea', 'number', 'date', 'toggle', 'multichoice', 'autocomplete'];

const ctrl = require('../interpreter/controls');
const policy = require('../interpreter/form-policy');
const resolvers = require('../interpreter/resolvers');
const { draftToInitialFormData } = require('../interpreter/form-handoff');
const { effectiveSnapshot, CONTEXT_SLOTS } = require('../interpreter/form-overlay');
const { ui } = require('../interpreter/templates/ui-strings');

/**
 * How a completed request leaves the chat.
 *
 * 'form' (the default) — the intake form itself is the last thing the user sees:
 * everything collected is carried into it, they review it there and submit it
 * there. This is the state machine's terminal too (interpreter-engine: the turn
 * where the askable queue empties opens the hand-off gate), and it is the one
 * screen where the whole request is visible at once — a chat summary is a
 * paraphrase, the form is the thing being filed.
 *
 * 'submit' — the older behaviour: confirm in chat, file from chat. Kept because
 * a deployment without the form surface still needs a way to finish.
 */
// Read at the point of use, not at import: the deployment decides this, and a
// value frozen when the module loaded cannot be changed by a test or a restart-
// free config reload.
const finalGate = () => String(process.env.FLOWDESK_FINAL_GATE || 'form').toLowerCase();

/** The long-form question, in the user's language, with the field count filled in. */
function fmtLargeForm(S, count, title) {
  const tpl = S.largeForm || 'The “{title}” form has {count} fields. How would you like to proceed?';
  return String(tpl).replace('{count}', String(count)).replace('{title}', title || '');
}

/** Lazy: the telemetry module pulls in storage, and tools are constructed in tests. */
const telemetry = () => require('../services/chat-telemetry.service');

/**
 * The askable queue: every tref-active, unfilled, non-autoResolve slot the user
 * has not already skipped, in the order the state machine would ask them.
 *
 * This is the single place the agent decides what remains to be collected. The
 * naive version it replaces — `slots.filter(s => s.required)` — asked for fields
 * a condition had hidden, re-asked fields the user had skipped, and interrogated
 * the user for values the form autofills.
 */
const askableQueue = (draft, snapshot, session) => policy.askableQueue(draft, snapshot, session);

/** Is this slot required GIVEN the values collected so far (trefCondition + requiredWhen)? */
const requiredNow = (slotDef, draft, snapshot) =>
  policy.isRequiredNow(slotDef, policy.trefContext(draft, snapshot));

/** One field as the model sees it. `required` is the live answer, never the static flag. */
function describeField(s, draft, snapshot) {
  return {
    slotId: s.slotId,
    label: s.promptHint || s.slotId,
    type: s.type,
    required: requiredNow(s, draft, snapshot),
    section: s.sectionLabel || s.section || null,
    options: Array.isArray(s.presentOptions) ? s.presentOptions.map((o) => ({ value: o.value, label: o.label })) : undefined,
    help: s.helpText || undefined,
    dependsOn: (s.dependsOn && s.dependsOn.length) ? s.dependsOn : undefined,
  };
}

/**
 * The form as a SENTENCE, not as a schema.
 *
 * The model used to receive every askable field in full — slotId, type, options,
 * help, dependencies — on the turn the draft opened. Under the closed contract it
 * cannot act on any of that: it does not name the field it asks (`target:"field"`)
 * and it does not name the field it records (`value` alone). The only thing it
 * legitimately does with the list is the graph's own rule — "briefly list what
 * information will be needed" — and a label is enough to write that sentence.
 *
 * On a 30-field form the full list ran ~1,400 tokens per draft_create. The labels
 * run ~90, and the field due now still arrives whole.
 */
const overview = (fields) => (fields || []).map((f) => f.label);

/**
 * What to tell the model after any change to the draft: what is still required,
 * what is merely offered, and which single field to ask next.
 *
 * Recomputed from the draft every time rather than cached, because filling one
 * field can reveal or hide others — that is the whole point of trefCondition and
 * requiredWhen.
 */
function formState(draft, snapshot, session) {
  const queue = askableQueue(draft, snapshot, session);
  const next = policy.chooseNextSlot(queue, draft, snapshot);
  const required = queue.filter((s) => requiredNow(s, draft, snapshot));
  return {
    // Everything that may be asked, in the order it will be asked — so a model
    // reading the list and a model following nextField reach the same field.
    askable: policy.orderAskable(queue, snapshot).map((s) => describeField(s, draft, snapshot)),
    stillMissing: required.map((s) => describeField(s, draft, snapshot)),
    optionalRemaining: queue.filter((s) => !requiredNow(s, draft, snapshot)).map((s) => describeField(s, draft, snapshot)),
    nextField: next ? describeField(next, draft, snapshot) : null,
    complete: required.length === 0,
  };
}

/**
 * Build the control a slot deserves — now shared with the hybrid interpreter.
 *
 * The mapping (a date field gets a date picker, a directory-backed field gets an
 * autocomplete pointed at the RIGHT directory) lives in interpreter/controls.js so
 * that every interpreter builds the same widget from the same slot. It was moved
 * there the moment a second caller needed it: a copy is how two chats start
 * disagreeing about what a form looks like.
 */
const buildControlFromSlot = ctrl.buildControlFromSlot;

/**
 * The long-form fork, or nothing.
 *
 * Held back until the opening questions are answered: offering the form before
 * "who is this for?" and "which duty station?" jumps over the two fields that
 * decide whether the service is available at all (fdv2-111bd67f). Offered once —
 * a fork put twice reads as not having heard the first answer.
 */
function largeFormOffer(snapshot, state, session) {
  if (!policy.isLargeForm(snapshot) || session.largeFormOffered) return undefined;
  const due = state && state.nextField && state.nextField.slotId;
  if (CONTEXT_SLOTS.some((c) => c.slotId === due)) return undefined;
  // Deliberately does NOT mark the offer as made. `largeFormOffered` is set when
  // the control is actually on screen — by the model, or by the guarantee in
  // autoControlFor. Session fdv2-996e487d walked a 29-field form one question at
  // a time for twenty turns and 189 seconds because this payload reached the
  // model, which mentioned "the full form" in prose and never rendered the
  // choice. A fork the user cannot click is not a fork.
  return {
    fieldCount: (snapshot.slots || []).length,
    tellUser: 'This form is long. Offer the user a choice — open the form itself (call open_form if they accept) or carry on here question by question — with emit_control({type:"choice", slotId:"__open_form__"}). Do not start asking fields until they answer.',
  };
}

/** Anthropic tool definitions. Shape is the model's contract; keep names stable. */
const TOOL_SCHEMAS = [
  {
    name: 'catalog_search',
    description: 'Search the service catalogue. Returns real services only. You MUST call this before creating a draft, and you may only create a draft for a serviceCode this returned.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What the user needs, in their own words or a refined phrasing.' } },
      required: ['query'],
    },
  },
  {
    name: 'kb_search',
    description: 'Search the knowledge base for policy and how-to answers. Use for questions, not for raising a request.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'draft_create',
    description: 'Start a service request for a serviceCode returned by catalog_search in this conversation. Returns the form fields to collect.',
    input_schema: {
      type: 'object',
      properties: {
        serviceCode: { type: 'string' },
        fields: { type: 'object', description: 'Any values already known from the conversation. Optional.' },
      },
      required: ['serviceCode'],
    },
  },
  {
    name: 'draft_update',
    description: 'Record what the user told you. Pass `value` alone to record the answer to the field you just asked — you do not have to name it. Use `fields` only for something they volunteered out of order.',
    input_schema: {
      type: 'object',
      properties: {
        value: { description: 'The answer to the field due now. The usual case.' },
        fields: { type: 'object', description: 'slotId → value, for answers that are not about the field due now.' },
      },
    },
  },
  {
    name: 'draft_submit',
    description: 'Submit the completed request. Only allowed after you have shown a confirm control AND the user has agreed to it.',
    input_schema: { type: 'object', properties: {}, },
  },
  {
    name: 'escalation_create',
    description: 'Register a request for a human colleague to take over. Call this BEFORE telling the user you are escalating — saying it without calling this makes the statement untrue.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        summary: { type: 'string', description: 'What the user needs and what has been tried, for the person picking this up.' },
      },
      required: ['reason', 'summary'],
    },
  },
  {
    name: 'open_form',
    description: 'Hand the user the full intake form, pre-filled with everything collected so far. Use when the form is long and the user chose to fill it themselves. Assisted filling ends here — do not say you are opening the form without calling this.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'emit_control',
    description: 'REQUIRED whenever your reply asks the user to pick, confirm, or supply a value: attaches the interactive control they click. A question that lists options only as prose cannot be clicked and is unusable on the voice channel. Call this in the SAME turn as the sentence that explains the choice. Use target:"field" for a form field — the field due now is chosen for you and you never name it.',
    input_schema: {
      type: 'object',
      properties: {
        // A CLOSED LIST, so there is nothing to invent.
        //
        // Names were being made up faster than they could be aliased:
        // `extensionReason` for a field, `__submit__`, `__confirm_submit__` and
        // `__final_confirm__` for the submit gate, `__recipient__` for the
        // recipient question. Aliases treated each one after it had already cost
        // a turn. A closed enum makes them unsayable.
        //
        // `field` carries no name at all: since the code chooses which field is
        // due, naming one was only ever a chance to name the wrong one. Per-service
        // field lists must NEVER become an enum here — tool schemas sit inside the
        // cached prompt prefix, and a dynamic enum would split the cache across 84
        // services (CACHE-005).
        target: {
          type: 'string',
          enum: ['field', '__service__', '__confirm__', '__open_form__', '__skip__'],
          description: '"field" = the form field due now (you do not name it). The rest are your own controls: choosing a service, confirming, offering the form, skipping.',
        },
        type: { type: 'string', enum: CONTROL_TYPES },
        slotId: { type: 'string', description: 'Deprecated — use `target`. Ignored for form fields.' },
        label: { type: 'string' },
        searchHint: { type: 'string', description: 'For a directory field: what the user said about the person or place. It opens the search pre-typed. It is a QUERY, never a value — the user still picks the record.' },
        options: {
          type: 'array',
          items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } }, required: ['value', 'label'] },
        },
      },
      required: ['type', 'slotId'],
    },
  },
];

const err = (message, extra = {}) => ({ ok: false, error: message, ...extra });

/**
 * Per-session state the guardrails depend on. Kept by the caller (the agent loop)
 * so a session's history and its permissions travel together.
 */
function createToolSession() {
  return {
    offeredServiceCodes: new Set(), // what catalog_search actually returned
    draftServiceCode: null,
    confirmShown: false,
    confirmAccepted: false,
    confirmSlotId: null,             // which control IS the submit gate this turn
    controls: [],                    // emit_control output for this turn
    escalationId: null,
    chosenServiceCode: null,         // the code behind the service the user picked
    // Optional fields the user has waved away. Asking again after someone has
    // pressed Skip is the behaviour that turns an intake into an interrogation.
    skippedSlotIds: new Set(),
    // Answers given BEFORE the draft existed (the recipient, the duty station).
    // draft_create applies them, so a click made at the opening of the
    // conversation is not thrown away when the form finally opens.
    pendingContext: {},
    largeFormOffered: false,         // the wizard choice is offered once, not every turn
    finalGateShown: false,           // the form hand-off that ends a completed request
    openForm: null,                  // set by open_form; rides the turn like the FSM's
    // HYB-1: the two facts the hybrid interpreter cannot derive from the draft.
    // How many fields THIS form has already asked — the first one gets a model turn
    // for context, every later one may be a template (turn-router condition 7).
    fieldsAskedThisForm: 0,
    // What the user last acted on, which decides the acknowledgement: a date field
    // shown as a confirm deserves "Got it.", not "Recorded.".
    lastControlType: null,
    // The controls the LAST reply carried. The agent path reads them from the loop;
    // the template path has no loop, so the session remembers them — a click is
    // resolved against the control that was actually shown.
    lastControls: [],
  };
}

function createAgentTools(deps = {}) {
  const resolveSearch = deps.resolveSearch
    || require('../services/resolve-search.service').getResolveSearch();
  const draftService = deps.draftService
    || require('../services/draft-sr.service').getDraftSRService();
  // Same loader the sandbox and the state machine use, so both architectures see
  // identical forms (schema-orchestrator exposes a factory, not a bare function).
  let _loader = null;
  const rawLoadSnapshot = deps.loadSnapshot || ((serviceId) => {
    if (!_loader) _loader = require('../services/schema-orchestrator').createSchemaLoader();
    return _loader.loadSnapshot(serviceId);
  });
  /**
   * The form, overlaid — and loaded ONCE per turn.
   *
   * Every form the agent walks carries the same request-level overlay the state
   * machine applies: who it is for, which duty station, who is raising it, a
   * free-text summary. Without it the mandatory location question had no field to
   * attach to (fdv2-111bd67f).
   *
   * The memo is what makes it affordable. Twelve places in this file need the
   * form — draft_update, emit_control, the turn brief, the auto-control, the
   * submit gate — and each call went all the way to Altiora: `loadSnapshot` runs
   * detectProviders + getSchemaVersion every time, even when the materialised
   * schema is already in the registry. Session gate-1785326429 shows the cost:
   * six POST/GET pairs on one turn, the first taking 4.7 seconds of a 21.6-second
   * turn.
   *
   * Keyed on (serviceId, locationPath) because the duty station is what decides
   * WHICH provider — and therefore which schema — serves the request. Cleared
   * every turn: within a turn the answer cannot change, between turns it can, and
   * a stale form is worse than a slow one.
   */
  const snapshots = new Map(); // `${serviceId}|${locationPath}` -> snapshot
  let memoTurn = null;

  const locationPathOf = deps.locationPathOf
    || (() => { try { return require('../services/schema-orchestrator').defaultLocationPathOf(); } catch { return null; } });

  /** Called by the loop at the start of every turn. */
  function beginTurn(turnId) {
    if (turnId !== memoTurn) { snapshots.clear(); memoTurn = turnId; }
  }

  const loadSnapshot = async (serviceId) => {
    const key = `${serviceId}|${locationPathOf() || ''}`;
    if (snapshots.has(key)) return snapshots.get(key);
    const snap = effectiveSnapshot(await rawLoadSnapshot(serviceId));
    // Only a real form is remembered: caching a miss would pin the failure for
    // the rest of the turn.
    if (snap) snapshots.set(key, snap);
    return snap;
  };
  const kbTools = deps.tools || null; // lazily resolved so tests need not stub it
  // Lazy so unit tests need not stub a directory they do not exercise.
  const directory = deps.directory
    ? () => deps.directory
    : () => { try { return require('../services/directory'); } catch { return null; } };

  function kb() {
    if (kbTools) return kbTools;
    return require('../services/altiora-tools.adapter').getAltioraTools();
  }

  // ── tools ──────────────────────────────────────────────────────────────────

  async function catalog_search({ query }, ctx) {
    if (!query || !String(query).trim()) return err('query is required');
    let hits = [];
    try {
      hits = await telemetry().timed('search', 'catalog_search', () => resolveSearch(String(query), ctx.userContext || {}));
    } catch (e) {
      return err(`the catalogue search failed: ${e.message}. Tell the user plainly rather than guessing a service.`);
    }
    const services = (hits || []).filter((h) => h.type === 'SERVICE' || h.serviceId);
    for (const s of services) ctx.session.offeredServiceCodes.add(s.serviceId);
    return {
      ok: true,
      count: services.length,
      services: services.slice(0, 8).map((s) => ({
        serviceCode: s.serviceId, title: s.title, domain: s.domain || null, score: s.score ?? null,
      })),
      // An empty result is a fact the model must convey, not a prompt to invent.
      note: services.length ? undefined : 'No service matched. Do not invent one — say so and offer to describe alternatives or register an escalation.',
    };
  }

  async function kb_search({ query }) {
    if (!query || !String(query).trim()) return err('query is required');
    try {
      const articles = await telemetry().timed('search', 'kb_search', () => kb().searchArticles(String(query), {}));
      const list = Array.isArray(articles) ? articles : [];
      return {
        ok: true,
        count: list.length,
        articles: list.slice(0, 5).map((a) => ({ title: a.title || null, snippet: a.answerSnippet || a.summary || null })),
        note: list.length ? undefined : 'Nothing in the knowledge base covers this. Say so rather than answering from memory.',
      };
    } catch (e) {
      return err(`the knowledge base is unavailable: ${e.message}`);
    }
  }

  async function draft_create({ serviceCode, fields }, ctx) {
    if (!serviceCode) return err('serviceCode is required');
    // GUARDRAIL 1 — see the module header.
    if (!ctx.session.offeredServiceCodes.has(serviceCode)) {
      // Naming what IS available saves a wasted round trip: live, the model
      // guessed a code, was refused, re-ran the same search and got the same
      // results — three tool calls to learn what this message can just say.
      const offered = [...ctx.session.offeredServiceCodes];
      return err(
        `"${serviceCode}" was not among the services catalog_search returned in this conversation. ` +
        (offered.length
          ? `Use one of these instead: ${offered.slice(0, 8).join(', ')}.`
          : 'Call catalog_search first and choose from its results.') +
        ' Do not use a code you have not seen.'
      );
    }
    let snapshot;
    try {
      snapshot = await loadSnapshot(serviceCode);
    } catch (e) {
      return err(`the intake form for ${serviceCode} could not be loaded: ${e.message}`);
    }
    if (!snapshot) return err(`${serviceCode} has no intake form available yet. Tell the user, do not pretend to raise it.`);

    // GUARDRAIL 4 — creating is IDEMPOTENT.
    //
    // Live, the model called draft_create on almost every turn: it had no memory
    // that a draft was already open, and each call started a fresh one. Every
    // answer the user had given was silently discarded, so the same fields came
    // round again and the request never completed. Re-creating is now a no-op
    // that reports the state instead of destroying it.
    const open = await draftService.get(ctx.sessionId).catch(() => null);
    if (open && open.serviceId === serviceCode && open.status !== 'submitted') {
      ctx.session.draftServiceCode = serviceCode;
      const state = formState(open, snapshot, ctx.session);
      const carriedOpen = { ...(fields || {}), ...(ctx.session.pendingContext || {}) };
      const trustedOpen = new Set(Object.keys(ctx.session.pendingContext || {}));
      const applied = Object.keys(carriedOpen).length
        ? await draft_update({ fields: carriedOpen }, ctx, { trustedSlots: trustedOpen })
        : null;
      const after = applied ? await draftService.get(ctx.sessionId) : open;
      return {
        ok: true,
        alreadyOpen: true,
        serviceCode,
        title: (snapshot.metadata && snapshot.metadata.title) || serviceCode,
        ...(applied ? formState(after, snapshot, ctx.session) : state),
        fields: undefined,
        largeForm: largeFormOffer(snapshot, applied ? formState(after, snapshot, ctx.session) : state, ctx.session),
        note: 'This draft is already open and nothing was reset. Record what the user told you with draft_update — draft_create does not save answers.',
      };
    }

    try {
      await draftService.create(ctx.sessionId, serviceCode, snapshot.version, null, ctx.userId || null);
      ctx.session.draftServiceCode = serviceCode;
      // Reopening intake invalidates any confirmation already given.
      ctx.session.confirmShown = false;
      ctx.session.confirmAccepted = false;
      ctx.session.confirmSlotId = null;
    } catch (e) {
      return err(`the draft could not be started: ${e.message}`);
    }

    // Anything answered before the form opened goes in first — the recipient the
    // user picked at the very start belongs to this request as much as any field
    // the model collects later.
    // The requester is filled here, silently, from the signed-in identity — it is
    // never asked (see form-overlay). Without it the field simply stayed empty.
    const me = (snapshot.slots || []).some((sl) => sl.slotId === 'author')
      ? await selfValue(ctx)
      : undefined;
    // What the USER picked outranks what the model typed. Held answers come LAST
    // so they win the merge: with the model's `fields` last, a trusted slot kept
    // its trust while its value was quietly replaced by prose — which is how
    // "Ivan Plaksin" reached the beneficiary slot even after the reference rule
    // was in place.
    const carried = {
      ...(fields || {}),
      ...(me ? { author: me } : {}),
      ...(ctx.session.pendingContext || {}),
    };
    // Only the held answers and the silent requester are trusted here; whatever the
    // MODEL passed in `fields` is held to the same rule as any other write.
    const trustedSlots = new Set([...Object.keys(ctx.session.pendingContext || {}), ...(me ? ['author'] : [])]);
    const applied = Object.keys(carried).length ? await draft_update({ fields: carried }, ctx, { trustedSlots }) : { ok: true, set: [] };
    ctx.session.pendingContext = {};
    const draft = await draftService.get(ctx.sessionId);
    const state = formState(draft, snapshot, ctx.session);

    // A form this size is faster in the form itself than one question at a time.
    // Offered once, and only as a CHOICE — the user may well prefer the chat.

    return {
      ok: true,
      serviceCode,
      title: (snapshot.metadata && snapshot.metadata.title) || serviceCode,
      // Only what may actually be ASKED, and only as labels: fields hidden by a
      // condition, resolved automatically, or autofilled by the form are not the
      // user's problem and must never be turned into questions.
      willAsk: overview(state.askable),
      requiredCount: state.stillMissing.length,
      optionalCount: state.optionalRemaining.length,
      nextField: state.nextField,
      prefilled: applied.set || [],
      fieldCount: (snapshot.slots || []).length,
      largeForm: largeFormOffer(snapshot, state, ctx.session),
      note: 'Ask ONE field per turn: emit_control({target:"field"}) asks whatever is due — `willAsk` is for telling the user what is coming, not for choosing.',
    };
  }

  /**
   * Record values on the draft.
   *
   * `trustedSlots` names the slots whose values came from a CONTROL — a directory
   * record the user picked, or the signed-in identity — rather than from the
   * model. Only those bypass the reference rule below; a resolved record is
   * exactly what that rule exists to produce.
   *
   * It is a SET, not a flag. A blanket flag was the first version, and it left a
   * hole a live run walked straight through: draft_create carries the held answers
   * in, and trusting the whole call also trusted the fields the MODEL had put in
   * the same object — so "Ivan Plaksin" reached the beneficiary slot as prose
   * after all.
   */
  async function draft_update(input, ctx, { trustedSlots = null } = {}) {
    let { fields } = input || {};
    // The short form: `{value}` records the answer to the field that was ASKED.
    // Naming the field was the common case and the one that went wrong most —
    // `extensionReason` for `description` cost two model calls and 4.5 seconds.
    if ((!fields || !Object.keys(fields).length) && input && input.value !== undefined) {
      const d0 = await draftService.get(ctx.sessionId).catch(() => null);
      const s0 = d0 && d0.serviceId ? await loadSnapshot(d0.serviceId).catch(() => null) : null;
      const due = s0 ? formState(d0, s0, ctx.session).nextField : null;
      if (!due) return err('there is no field waiting for a value — name the field with `fields` instead.');
      fields = { [due.slotId]: input.value };
    }
    if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) return err('fields must be a non-empty object');
    const draft = await draftService.get(ctx.sessionId);
    if (!draft) return err('there is no draft yet — call draft_create first');
    const snapshot = await loadSnapshot(draft.serviceId);
    const byId = new Map((snapshot && snapshot.slots ? snapshot.slots : []).map((s) => [s.slotId, s]));

    const patches = []; const rejected = []; const refused = [];
    for (const [slotId, value] of Object.entries(fields)) {
      const def = byId.get(slotId);
      if (!def) { rejected.push(slotId); continue; }
      // A DIRECTORY-backed field takes the record the user picked, never prose.
      // The state machine keeps a typed mention as a hint and promotes it only
      // once it resolves; the agent has no resolver of its own, so the control —
      // which returns the real record — is the single way in. Without this the
      // draft ends up holding "Ivan Plaksin" where the form expects a person.
      const trusted = trustedSlots ? trustedSlots.has(slotId) : false;
      if (!trusted && ctrl.directoryOf(def)) { refused.push(def); continue; }
      patches.push({ op: 'set', slotId, value, provenance: trusted ? 'resolved' : 'user', pending: false });
    }

    if (refused.length && !patches.length) {
      const f = refused[0];
      return err(
        `"${f.slotId}" is chosen from the ${ctrl.directoryOf(f) === 'location' ? 'duty-station' : 'people'} directory, not typed. ` +
        'Call emit_control for it — pass what the user said as `searchHint` and the search opens on it — and the pick is recorded for you.'
      );
    }

    // Nothing recognised at all — say that, before reporting on values.
    if (!patches.length && !refused.length) {
      return err(`none of those fields exist on this form. Unknown: ${rejected.join(', ')}. Use the slotIds from draft_create.`);
    }

    // Type and domain, exactly as the state machine validates them: an enum value
    // must be one of the form's own options, a multi enum is normalised to an
    // array and every element checked, a number must be a number.
    const { good, rejected: invalid } = policy.validatePatches(patches, snapshot);
    if (!good.length) {
      const first = invalid[0];
      const def = first && byId.get(first.slotId);
      const allowed = def && Array.isArray(def.presentOptions) ? def.presentOptions.map((o) => o.value) : null;
      return err(
        `"${first ? first.slotId : ''}" did not accept that value (${first ? first.reason : 'invalid'})`
        + (allowed ? `. It must be one of: ${allowed.join(', ')}.` : '.')
      );
    }
    patches.length = 0;
    patches.push(...good);

    if (!patches.length) {
      return err(`none of those fields exist on this form. Unknown: ${rejected.join(', ')}. Use the slotIds from draft_create.`);
    }
    try {
      await draftService.patch(ctx.sessionId, patches);
    } catch (e) {
      return err(`the values were not accepted: ${e.message}`);
    }
    // Any change to the request invalidates a confirmation of the earlier version.
    if (ctx.session.confirmAccepted) {
      ctx.session.confirmShown = false; ctx.session.confirmAccepted = false; ctx.session.confirmSlotId = null;
    }

    // Recomputed AFTER the patch: a value just set can reveal fields that were
    // hidden and retire fields that are no longer required (trefCondition,
    // requiredWhen). A list computed before the patch would be stale by one turn.
    const after = await draftService.get(ctx.sessionId);
    return {
      ok: true,
      set: patches.map((p) => p.slotId),
      rejected,
      ...(refused.length ? { refused: refused.map((f) => f.slotId), note: `${refused.map((f) => `"${f.slotId}"`).join(', ')} must be picked from the directory — emit its control with a searchHint instead.` } : {}),
      ...(invalid.length ? { invalid: invalid.map((p) => ({ slotId: p.slotId, reason: p.reason })) } : {}),
      ...formState(after, snapshot, ctx.session),
    };
  }

  async function draft_submit(_input, ctx) {
    const draft = await draftService.get(ctx.sessionId);
    if (!draft) return err('there is no draft to submit');
    if (finalGate() === 'form') {
      return err(
        'this request is filed from the form, not from the chat. Once every field is collected the form '
        + 'opens with everything carried into it, and the user reviews and submits it there. Do not submit from here.'
      );
    }
    // GUARDRAIL 5 — the mandatory fields are not negotiable. Defence in depth:
    // the confirm control is already refused while any remain, but a confirm
    // shown earlier must not survive a change that reopened a required field.
    const missing = await missingRequired(ctx);
    if (missing.length) {
      return err(`this request is incomplete: ${missing.map((f) => `"${f.label}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} required and still empty. Collect ${missing.length === 1 ? 'it' : 'them'} before submitting.`);
    }
    // GUARDRAIL 2 — see the module header.
    if (!ctx.session.confirmShown) {
      return err('you have not shown the user a confirm control yet. Show the collected values with emit_control({type:"confirm"}) and wait for their answer.');
    }
    if (!ctx.session.confirmAccepted) {
      return err('the user has not agreed yet. Wait for their answer to the confirm control before submitting.');
    }
    try {
      const res = await draftService.submit(ctx.sessionId);
      return { ok: true, srNumber: res.srNumber || res.reference || null, ticketId: res.ticketId ?? null };
    } catch (e) {
      return err(`the request could not be submitted: ${e.message}. Tell the user honestly; do not claim it succeeded.`);
    }
  }

  async function escalation_create({ reason, summary }, ctx) {
    if (!reason || !summary) return err('both reason and summary are required — the person picking this up needs the context');
    try {
      // GUARDRAIL 3 — the words cost a tool call or they are not true.
      const res = await draftService.escalate(ctx.sessionId, reason, null, { conversationSummary: summary, stub: true });
      ctx.session.escalationId = res.escalationId;
      return {
        ok: true,
        escalationId: res.escalationId,
        // The model must not over-promise: nothing connects a human yet.
        stub: true,
        tellUser: 'The request to involve a colleague is registered. Say that it is registered and give the reference; do NOT say they are being transferred now or that someone is waiting.',
      };
    } catch (e) {
      return err(`the escalation could not be registered: ${e.message}. Do not tell the user it was.`);
    }
  }

  /**
   * The control type is derived from the FORM SCHEMA, not taken from the model.
   *
   * A model asked for a location and emitted `autocomplete` with no `source`; the
   * client, having no directory to search, fell back to the people directory and
   * offered a person picker for "which duty station?". The model cannot be
   * expected to know that an autocomplete needs a `source.directory` and which
   * endpoint backs it — that is schema knowledge, and the state machine has
   * always taken it from the slot definition.
   *
   * So: the model says WHICH slot it is asking about; the code decides how that
   * slot is rendered. Its `type` is honoured only for slots outside the form
   * (`__confirm__`, `__service__`), where there is no schema to consult.
   */
  async function emit_control(input, ctx) {
    const { type, label, options, searchHint, target } = input || {};
    if (!input || (!input.target && !input.slotId)) return err('target is required');

    // `target:"field"` means the field due now — resolved here, never named by the
    // model. Everything else is one of the model's own controls, and the schema
    // limits those to a closed list.
    let slotId;
    if (target === 'field' || (!target && input.slotId && !String(input.slotId).startsWith('__'))) {
      const draft0 = await draftService.get(ctx.sessionId).catch(() => null);
      const snap0 = draft0 && draft0.serviceId ? await loadSnapshot(draft0.serviceId).catch(() => null) : null;
      const st0 = snap0 ? formState(draft0, snap0, ctx.session) : preFormState(ctx);
      if (!st0 || !st0.nextField) return err('there is no field waiting to be asked right now.');
      slotId = st0.nextField.slotId;
    } else {
      slotId = canonicalSlotId(target || input.slotId);
    }

    const slotDef = await slotDefinitionFor(ctx, slotId);

    if (slotDef) {
      const draft = await draftService.get(ctx.sessionId);
      const snapshot = draft ? await loadSnapshot(draft.serviceId) : null;
      const S = ui(ctx.lang || 'en');
      // An optional field says so and carries a way out. Without the Skip control
      // an offered field is indistinguishable from a demanded one, and the user
      // has to argue with the assistant to move on.
      // THE FIELD IS CHOSEN BY CODE, NOT BY THE MODEL (architect decision, variant B).
      //
      // The state machine hands its question planner ONE slot and asks only for
      // the wording, which is why it cannot forget a field or ask the wrong one.
      // The agent chose for itself and drifted: live, it wrote a sentence asking
      // for the duty station while attaching the subject control, and the
      // mandatory field was never collected. The model still writes every word —
      // it no longer decides which field the words are about.
      // Before the form exists the opening queue still decides the order.
      const state = snapshot ? formState(draft, snapshot, ctx.session) : preFormState(ctx);
      if (state && state.nextField && state.nextField.slotId !== slotId) {
        return err(
          `"${slotId}" is not the field due now. Ask for "${state.nextField.label}" (slotId ${state.nextField.slotId}) — ` +
          'emit its control and write your question about it. ' +
          'If the user gave you a value for another field, record it with draft_update instead; that works for any field, in any order.'
        );
      }

      const optional = snapshot ? !requiredNow(slotDef, draft, snapshot) : false;
      const help = slotDef.helpText ? ` — ${slotDef.helpText}` : '';
      const baseLabel = label || slotDef.promptHint || slotDef.slotId;

      const resolved = await resolveForControl(slotDef, ctx, draft);
      const built = buildControlFromSlot(slotDef, {
        label: `${baseLabel}${help}${optional ? ` ${S.optionalMark}` : ''}`,
        options,
        searchHint,
        // "Is this for you?" — one click accepts the signed-in user; for the
        // approver, the recipient's manager.
        defaultValue: resolved.defaultValue,
        alternatives: resolved.alternatives,
      });
      if (!built) {
        return err(`"${slotId}" is a ${slotDef.type} field and no control fits it — ask for it in plain text instead.`);
      }
      built.id = `ctrl-${slotId}-${ctx.session.controls.length}`;
      // One control per field per turn. A model that calls emit_control twice for
      // the same field — seen live — would otherwise put two identical boxes in
      // front of the user, and only one of them can be the one they answer.
      const already = ctx.session.controls.findIndex((c) => c && c.slotId === slotId);
      if (already >= 0) ctx.session.controls.splice(already, 1, built);
      else ctx.session.controls.push(built);
      // NOT the submit gate. A directory field is confirmed with a `confirm`
      // control too — "is this for you?" — and marking the gate shown there let a
      // later "yes" about something else stand in for agreeing to file the
      // request. The gate is only the confirm that belongs to no field.
      if (optional && !ctx.session.controls.some((c) => c && c.slotId === '__skip__'
          && (c.options || []).some((o) => o.value === slotId))) {
        ctx.session.controls.push({
          id: `ctrl-${slotId}-skip`, type: 'choice', slotId: '__skip__',
          options: [{ value: slotId, label: S.skipLabel }],
        });
      }
      return {
        ok: true,
        control: built,
        optional: optional || undefined,
        nextField: state ? state.nextField : undefined,
        note: built.type !== type && type
          ? `rendered as "${built.type}" because the form defines ${slotId} as ${slotDef.type}`
          : (optional ? 'this field is optional, so a Skip option was added alongside it' : undefined),
      };
    }

    // A form is open and this is not one of its fields, nor one of the model's
    // own `__`-prefixed controls. Live, the model emitted slotId "subject" for a
    // form whose field is "subjectTile": the control rendered, the user typed
    // into it, and the answer belonged to no field at all. Silently accepting an
    // invented slotId loses data as surely as never asking.
    if (!slotId.startsWith('__')) {
      const draft = await draftService.get(ctx.sessionId).catch(() => null);
      const snapshot = draft && draft.serviceId ? await loadSnapshot(draft.serviceId).catch(() => null) : null;
      if (snapshot) {
        const st = formState(draft, snapshot, ctx.session);
        return err(
          `"${slotId}" is not a field on this form, so anything the user typed into it would be lost. ` +
          (st.nextField ? `Use "${st.nextField.slotId}" (${st.nextField.label}) — that is the field due next.` : 'There is nothing left to ask.')
        );
      }
    }

    // Not a form field — the model's own control (service choice, confirmation).
    if (!CONTROL_TYPES.includes(type)) return err(`type must be one of: ${CONTROL_TYPES.join(', ')}`);

    // GUARDRAIL 5 — the terminal gate, ported from the state machine.
    //
    // There, a turn can only reach the confirmation when the askable queue is
    // empty (interpreter-engine: `if (remaining.length === 0)`), so a mandatory
    // field cannot be walked past. The agent had no such gate: live, it asked
    // for the duty station, drifted, and carried on as though the answer had been
    // given. A confirmation offered over an incomplete request is the moment the
    // omission becomes invisible, so that is where the gate belongs.
    if (type === 'confirm') {
      const missing = await missingRequired(ctx);
      if (missing.length) {
        return err(
          `you cannot confirm yet — ${missing.map((f) => `"${f.label}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} required and still empty. ` +
          `Ask for "${missing[0].label}" now, with its control.`
        );
      }
    }
    if ((type === 'choice' || type === 'multichoice') && (!Array.isArray(options) || !options.length)) {
      return err(`a ${type} control needs a non-empty options array`);
    }
    if (type === 'autocomplete') {
      // Live, the model chose a service, skipped draft_create, then asked for the
      // duty station: the slot was unknown, this refusal told it nothing it could
      // act on, and it spent three turns apologising to the user for a "technical
      // issue". A refusal has to name the way forward or the conversation dies here.
      const noDraft = !(await draftService.get(ctx.sessionId).catch(() => null));
      const offered = [...ctx.session.offeredServiceCodes];
      const howToFix = noDraft
        ? ` There is no request open yet — call draft_create(${offered.length === 1 ? `{serviceCode: "${offered[0]}"}` : 'for the service the user chose'}) first, and this field will come with the right control.`
        : ' Use a "choice" control with explicit options, or ask in plain text.';
      return err(`"${slotId}" is not a field on the current form, so there is no directory to search.${howToFix}`);
    }
    const control = {
      id: `ctrl-${slotId}-${ctx.session.controls.length}`,
      type, slotId,
      ...(label ? { label } : {}),
      ...(Array.isArray(options) && options.length ? { options } : {}),
    };
    ctx.session.controls.push(control);
    if (slotId === '__open_form__') ctx.session.largeFormOffered = true; // the model rendered it itself
    if (type === 'confirm') {
      ctx.session.confirmShown = true;
      // REMEMBER WHICH CONTROL IS THE GATE, by id, not by name.
      //
      // The loop used to accept the agreement only when the click carried the
      // literal slotId `__confirm__`. Session fdv2-996e487d ended in a loop
      // because the model called it `__submit__`, then `__confirm_submit__`, then
      // `__final_confirm__`: the user clicked four times, the agreement was never
      // registered, and draft_submit was refused five times in a row. Whatever the
      // model chooses to call it, THIS is the control the answer belongs to.
      ctx.session.confirmSlotId = slotId;
    }
    return { ok: true, control };
  }

  /**
   * The control a turn SHOULD have carried, when the model forgot to attach one.
   *
   * Called by the loop after the model has finished. It fires only when there is
   * an open draft with required fields still empty — i.e. the conversation is
   * mid-form and the reply is almost certainly asking for one of them. The slot
   * is chosen by matching the reply text against the fields' own prompts, so the
   * control lines up with the question actually asked; failing that, the next
   * missing required field, which is the order the state machine uses anyway.
   *
   * Returns null when nothing is pending — a turn that is not collecting data
   * (an answer, a refusal, a farewell) must not sprout a control.
   */
  async function autoControlFor(ctx, replyText, emitted = []) {
    const covers = (slotId) => (emitted || []).some((c) => c && c.slotId === slotId);

    // A fork in the conversation is a question in its own right: which service,
    // fill the form or carry on here, submit or not. Adding the next FIELD to
    // such a turn puts two questions in front of the user at once — live, the
    // large-form offer arrived with a description box under it. `__skip__` is not
    // a fork; it belongs to the field question it accompanies.
    // Only the KNOWN forks suppress it. An unrecognised `__x__` is more likely a
    // field question the model named for itself — the failure in fdv2-039fd2b4 —
    // and there the guarantee is exactly what must still fire.
    //
    // The opening questions outrank a fork, though: who the request is for and
    // where they are based decide whether the service is even available, so they
    // are not something to be jumped over by offering the form.
    // Which service is still open → nothing else is asked this turn.
    if ((emitted || []).some((c) => c && c.slotId === SERVICE_FORK)) return null;



    const asksAFork = (emitted || []).some((c) => c && FORK_SLOTS.has(c.slotId));
    const draft = await draftService.get(ctx.sessionId);

    // BEFORE the form exists, the opening order still applies: once a service has
    // been found, the next thing established is who the request is for. Session
    // fdv2-2161acf8 asked exactly that question and shipped no controls, because
    // the code only ever looked inside a draft that had not been created. The
    // field due here is not a guess — it is the first field of the overlay every
    // form carries.
    if (!draft || !draft.serviceId) {
      // SETTLED, not merely mentioned. The catalogue is searched in code on every
      // pre-draft turn, so "something was offered" is true of any message that
      // resembles a service — including a question about one. Live, "what is the
      // status of the request we were just filling?" was answered correctly and
      // then handed a "who is this request for?" control, for a request nobody had
      // started. The graph's own order says the same thing: resolve to ONE service
      // first, and only then ask who it is for.
      const settled = ctx.session.chosenServiceCode || ctx.session.offeredServiceCodes.size === 1;
      if (!settled) return null;
      const pre = preFormState(ctx);
      // Note the check is on the FIELD, not on "did the model emit anything".
      // fdv2-039fd2b4 emitted a control — its own two-option menu — so a test for
      // emptiness would have passed while the question still collected nothing.
      if (!pre.nextField || covers(pre.nextField.slotId)) return null;
      // (a fork does NOT suppress the opening questions — see above)
      const def = pre.nextField;
      const built = buildControlFromSlot(def, {
        label: def.promptHint,
        defaultValue: await controlDefaultFor(def.slotId, ctx), // pre-draft: no form to resolve against
      });
      if (!built) return null;
      built.id = `ctrl-${def.slotId}-auto`;
      return [built];
    }

    const snapshot = await loadSnapshot(draft.serviceId);
    if (!snapshot) return null;

    // The same queue and the same order the state machine would use: nothing
    // hidden, nothing auto-resolved, nothing already skipped.
    const queue = askableQueue(draft, snapshot, ctx.session);

    // The queue head, always — the same authority emit_control now enforces.
    // Matching the reply text against field prompts was a way of following the
    // model's drift; under variant B there is nothing to follow.
    // THE FINAL GATE.
    //
    // Nothing is left to ask, so the request goes to the form — always, not when
    // the model remembers to. Reaching the end of the questions is exactly the
    // moment a chat is least able to show what is about to be filed: it can
    // paraphrase, the form can show it.
    if (finalGate() === 'form' && !ctx.session.finalGateShown && !covers('__open_form__')) {
      const stillMissing = formState(draft, snapshot, ctx.session).stillMissing;
      if (!stillMissing.length && !queue.length) {
        ctx.session.finalGateShown = true;
        const S = ui(ctx.lang || 'en');
        return [{
          replaces: true,
          question: `${S.fillingComplete} ${S.proceedToForm}`,
          id: 'ctrl-final-gate', type: 'choice', slotId: '__open_form__',
          options: [
            { value: 'open', label: S.openFormLabel },
            { value: 'stay', label: S.stayHereLabel },
          ],
        }];
      }
    }

    const target = policy.chooseNextSlot(queue, draft, snapshot);
    if (!target) return null; // nothing to ask and no gate outstanding
    // A fork stands only once the opening questions are behind us.
    if (asksAFork && !CONTEXT_SLOTS.some((c) => c.slotId === target.slotId)) return null;

    // THE LONG-FORM FORK, GUARANTEED.
    //
    // Decided here rather than in draft_create, because draft_create runs once
    // and the moment to ask arrives later — after the opening questions, which
    // are answered by clicking controls, not by calling tools. In fdv2-996e487d
    // the offer was computed while the recipient was still pending, was held back
    // correctly, and then never reconsidered: twenty questions followed.
    if (!ctx.session.largeFormOffered
        && policy.isLargeForm(snapshot)
        && !CONTEXT_SLOTS.some((c) => c.slotId === target.slotId)
        && !covers('__open_form__')) {
      ctx.session.largeFormOffered = true;
      const S = ui(ctx.lang || 'en');
      // `replaces` drops whatever field question the model had already put on
      // screen, and `question` replaces the sentence with it.
      //
      // Swapping only the control was half a fix, and the half that was missing
      // is the one the user reads. Session fdv2-e1791ec1: the reply said "would
      // you like to add any notes?" while the buttons underneath said "Fill in
      // the form" / "Continue with the assistant". They clicked the one that
      // matched the sentence — continue — and then answered twenty more questions
      // by hand. A code-owned fork has to own its wording too.
      return [{
        replaces: true,
        question: fmtLargeForm(S, (snapshot.slots || []).length, snapshot.metadata && snapshot.metadata.title),
        id: 'ctrl-open-form-auto', type: 'choice', slotId: '__open_form__',
        options: [
          { value: 'open', label: S.largeFormWizard || S.openFormLabel },
          { value: 'stay', label: S.largeFormAssistant || S.stayHereLabel },
        ],
      }];
    }

    if (covers(target.slotId)) return null; // the model already asked this field

    const S = ui(ctx.lang || 'en');
    const optional = !requiredNow(target, draft, snapshot);
    const help = target.helpText ? ` — ${target.helpText}` : '';
    const built = buildControlFromSlot(target, {
      label: `${target.promptHint || target.slotId}${help}${optional ? ` ${S.optionalMark}` : ''}`,
      ...(await resolveForControl(target, ctx, draft)),
    });
    if (!built) return null;
    built.id = `ctrl-${target.slotId}-auto`;
    return optional
      ? [built, { id: `ctrl-${target.slotId}-skip`, type: 'choice', slotId: '__skip__', options: [{ value: target.slotId, label: S.skipLabel }] }]
      : [built];
  }

  /**
   * Hand the whole form to the user (rule 9's other half).
   *
   * The state machine emits `openForm` on the turn and the host opens Altiora's
   * own form with the draft pre-filled. Without this tool the large-form offer
   * would be prose the agent cannot honour — the model would promise to open a
   * form and then keep asking questions, which is precisely the class of empty
   * promise the escalation guardrail exists to prevent.
   */
  async function open_form(_input, ctx) {
    const draft = await draftService.get(ctx.sessionId);
    if (!draft || !draft.serviceId) return err('there is no draft to open — call draft_create first');
    const snapshot = await loadSnapshot(draft.serviceId);
    if (!snapshot) return err('the form for this request could not be loaded');
    ctx.session.openForm = {
      serviceId: snapshot.serviceId,
      ousId: snapshot.metadata && snapshot.metadata.altioraOusId,
      prefill: draftToInitialFormData(draft, snapshot),
    };
    return {
      ok: true,
      tellUser: 'The form is opening with everything collected so far filled in. '
        + 'This turn ENDS the conversation: say what was handed over, say that assisted filling ends here, and STOP. '
        + 'Do not ask a question, offer a field, or invite a reply — there is no one left to answer to.',
    };
  }

  /**
   * The state of the form, restated on every turn.
   *
   * The state machine never forgets which field it is on, because the field is
   * chosen by code each turn. The agent had this only in tool results, so a turn
   * that called no tool ran blind: live, it asked for the duty station three
   * turns running while the queue was on the subject, and recorded none of the
   * answers. Restating the queue every turn keeps the model on the same field the
   * control is built from.
   *
   * @returns {Promise<string|null>} a one-line brief, or null when no form is open
   */
  /**
   * Search the catalogue for what the user just said — in CODE, every turn, for
   * as long as there is no request open.
   *
   * The state machine does exactly this: while `!draft`, the turn runs
   * resolve.search on the message before anything else decides what to say
   * (interpreter-engine:2589). The agent left the decision to the model, and
   * fdv2-cd0ab081 is what that costs: "I need a Extension" → "appoiment" →
   * "I need a Extension of appoiment", three turns, zero tool calls, and a
   * catalogue that was never consulted while the model reasoned about what the
   * English might mean. The catalogue is not the model's to skip.
   */
  async function prefetchCatalog(ctx, userText) {
    const q = String(userText || '').trim();
    if (q.length < 3 || q.startsWith('[')) return null; // a control click, not a request
    let hits = [];
    try {
      // Timed like any tool call: this search happens in code, so without a span
      // of its own it was simply missing from the session's timings.
      hits = await telemetry().timed('search', 'catalog_search (auto)', () => resolveSearch(q, ctx.userContext || {}));
    } catch {
      return null; // the catalogue being down is the model's problem to describe, not a crash
    }
    const services = (hits || []).filter((h) => h.type === 'SERVICE' || h.serviceId);
    for (const svc of services) ctx.session.offeredServiceCodes.add(svc.serviceId);
    return services.slice(0, 6).map((svc) => ({ serviceCode: svc.serviceId, title: svc.title }));
  }

  async function turnBrief(ctx, userText) {
    try {
      const draft = await draftService.get(ctx.sessionId);

      // No request open yet. The opening questions can be answered before the form
      // exists — their answers are held — but they are not a place to live: with
      // nothing telling the model the draft is still missing, the recipient and the
      // duty station were collected and then simply sat there, turn after turn.
      if (!draft || !draft.serviceId) {
        // Run the search first, so the brief speaks from the catalogue rather than
        // from whatever the model decided to look up.
        const found = await prefetchCatalog(ctx, userText);
        if (found && found.length) {
          return `[catalogue for "${String(userText).trim().slice(0, 60)}" — ${found.map((f) => `${f.serviceCode} (${f.title})`).join('; ')}. `
            + 'These are real services. Offer the ones that fit and call draft_create for the one the user picks. '
            + 'Do not ask what they mean when the catalogue already answers it.]';
        }
        if (found && !found.length) {
          return `[catalogue for "${String(userText).trim().slice(0, 60)}" — NOTHING matched. Say so plainly and say what you can do instead; do not keep asking them to rephrase.]`;
        }
        const offered = [...ctx.session.offeredServiceCodes];
        if (!offered.length) return null;
        const held = Object.keys(ctx.session.pendingContext || {});
        const pre = preFormState(ctx);
        // The service the user actually picked, when they picked one — the code,
        // not the title. Without it the model reconstructs a plausible-looking
        // code from the name and is refused (fdv2-dacb3883).
        const chosen = ctx.session.chosenServiceCode;
        return `[no request is open yet — call draft_create(${chosen ? `{serviceCode: "${chosen}"}` : (offered.length === 1 ? `{serviceCode: "${offered[0]}"}` : 'for the service the user chose')}) now. `
          + `${held.length ? `Answers held so far (${held.join(', ')}) are carried in automatically. ` : ''}`
          + `${pre.nextField ? `Then ask "${pre.nextField.label}".` : 'The opening questions are answered.'}]`;
      }
      const snapshot = await loadSnapshot(draft.serviceId);
      if (!snapshot) return null;
      const st = formState(draft, snapshot, ctx.session);
      const collected = Object.entries(draft.slots || {})
        .filter(([, v]) => v && v.value !== null && v.value !== undefined && v.value !== '' && !v.stale)
        .map(([k]) => k);
      // WHICH request is open, named every turn.
      //
      // History deliberately carries no tool traffic, so the serviceCode the
      // model was given by catalog_search does not survive the turn it was
      // returned in. Live, the model reconstructed a plausible-looking code on
      // almost every turn, was refused by the first guardrail, re-ran the same
      // search and got the same answer — three tool calls to recover a fact the
      // session already knew.
      const open = `[request open: ${(snapshot.metadata && snapshot.metadata.title) || draft.serviceId} `
        + `(serviceCode ${draft.serviceId}) — it is already created, do NOT call draft_create again.]`;

      // The form was replaced because the duty station changed, and some answers
      // went with it (schema-context, reducer.reconcileToSchema). The next field is
      // chosen by code either way — but the user is owed the reason for being asked
      // something they already answered, and only the model can say it.
      const switched = draft.schemaSwitch && draft.schemaSwitch.dropped && draft.schemaSwitch.dropped.length
        ? `\n[the duty station changed, so this service is now served by a different office with its own form. `
          + `These answers do not exist on it and are gone: ${draft.schemaSwitch.dropped.join(', ')}. `
          + `Say so once, briefly, before your next question — do not apologise at length and do not list the fields again.]`
        : '';

      if (!st.nextField) {
        return `${open}${switched}\n[form: everything askable is collected (${collected.join(', ') || 'none'}). Summarise the request and show a confirm control.]`;
      }
      // The field due comes FIRST and alone.
      //
      // An earlier version led with "still REQUIRED: <list>" and then named a
      // different field to ask. Both Haiku and Sonnet resolved that contradiction
      // the same way — they asked for the required field and ignored the order —
      // so the prose and the control disagreed on every turn. The order is not
      // negotiable, so the brief must not read as though it were.
      const rest = st.askable.length - 1;
      return `${open}${switched}
[form — ask ONLY this now: "${st.nextField.label}" (slotId ${st.nextField.slotId})`
        + `${st.nextField.required ? ', required' : ', optional — offer a way to skip it'}. `
        + `A control for any other field is refused. `
        + `Record anything the user has already told you with draft_update FIRST — nothing else saves it. `
        + `Collected so far: ${collected.join(', ') || 'nothing'}. `
        + `${rest > 0 ? `${rest} more field${rest === 1 ? '' : 's'} after this (${st.stillMissing.length} required in total) — do not ask about them yet.` : 'This is the last one.'}]`;
    } catch {
      return null; // the brief is an aid, never a reason to lose the turn
    }
  }

  /**
   * A field that was ASKED with a plain text box and answered by typing.
   *
   * A click is written by code (recordControlAnswer above); a typed answer used
   * to be left to the model, and that is a turn out of step. The brief is built
   * BEFORE the model runs, so it still named the field that was just answered;
   * the model recorded the answer, saw the next field in the tool result, and
   * wrote its sentence — but the control it emitted came from the code's view of
   * "due now", which had by then moved on. Live: the reply asked for the type of
   * extension while the box under it was Comments.
   *
   * Recording it here closes the gap: by the time the brief is written the answer
   * is in the draft, so the field the code will ask and the field the model writes
   * about are the same one. It also saves the draft_update round trip.
   *
   * DELIBERATELY NARROW. Only the field whose own text control was on screen, only
   * text-like controls (a person or a place is picked, never typed — that rule is
   * the whole reason directory slots exist), and not when the message reads as a
   * question or a command. Anything else stays the model's to interpret.
   */
  const TYPED_CONTROL_TYPES = new Set(['text', 'textarea', 'number']);
  const NOT_AN_ANSWER = /^\s*(what|why|how|who|when|where|which|can|could|would|should|do|does|is|are|help|skip|cancel|stop|park|back|no thanks)\b|\?\s*$/i;

  async function recordTypedAnswer(ctx, message, shownControls) {
    const text = String(message || '').trim();
    if (!text || text.length > 400 || NOT_AN_ANSWER.test(text)) return null;

    const shown = (shownControls || []).find((c) => c && c.slotId && !String(c.slotId).startsWith('__')
      && TYPED_CONTROL_TYPES.has(c.type));
    if (!shown) return null;

    const draft = await draftService.get(ctx.sessionId).catch(() => null);
    if (!draft || !draft.serviceId) return null;
    const snapshot = await loadSnapshot(draft.serviceId).catch(() => null);
    const def = (snapshot && snapshot.slots ? snapshot.slots : []).find((sl) => sl.slotId === shown.slotId);
    if (!def || policy.isReferenceSlot(def) || ctrl.directoryOf(def)) return null;
    // Already answered — the user is talking about something else.
    if (policy.isFilled(draft.slots && draft.slots[def.slotId])) return null;

    let value = text;
    if (def.type === 'number') {
      const n = Number(text.replace(/[\s,]/g, ''));
      if (!Number.isFinite(n)) return null;
      value = n;
    }
    try {
      await draftService.patch(ctx.sessionId, [{ op: 'set', slotId: def.slotId, value, provenance: 'user', pending: false }]);
    } catch {
      return null;
    }
    if (ctx.session.confirmAccepted) { ctx.session.confirmShown = false; ctx.session.confirmAccepted = false; }
    return { slotId: def.slotId, value, label: def.promptHint || def.slotId, typed: true };
  }

  /**
   * An answer to a context question asked before the form existed.
   *
   * "Yes" on the recipient control means the signed-in user, so `true` is
   * resolved to that person here rather than stored as a boolean the form could
   * never use. Kept on the session until draft_create carries it into the draft.
   *
   * @returns {Promise<boolean>} whether the answer was taken
   */
  async function recordPreDraftAnswer(ctx, slotId, value) {
    if (!CONTEXT_SLOTS.some((s) => s.slotId === slotId)) return false;
    const draft = await draftService.get(ctx.sessionId).catch(() => null);
    if (draft && draft.serviceId) return false; // the draft owns it now
    const resolved = (value === true || value === 'true')
      ? (SELF_DEFAULT_SLOTS.has(slotId) ? await selfValue(ctx) : undefined)
      : value;
    if (resolved === undefined || resolved === null || resolved === '') return false;
    ctx.session.pendingContext = { ...(ctx.session.pendingContext || {}), [slotId]: resolved };
    // The duty station is confirmed BEFORE the form exists — which is exactly when
    // the form is chosen. Without this, a location answered in the same turn as
    // draft_create would be recorded and then ignored by the provider lookup that
    // followed it. (After the draft exists, draft-sr.service.patch does this.)
    if (slotId === 'location' || slotId === 'beneficiary') {
      try {
        const { updateSchemaContext, schemaContextFrom } = require('../services/schema-context');
        updateSchemaContext(schemaContextFrom(null, ctx.session.pendingContext));
      } catch { /* outside a turn — nothing to revise */ }
    }
    return true;
  }

  /**
   * WRITE what the user clicked into the draft. Code, not the model.
   *
   * Session fdv2-2815b706: the user pressed the confirm on "Who is submitting
   * this request?" three times and was asked a fourth. The click reached the loop
   * as `{action:'confirm', slotId:'author'}` and was handed to the model as the
   * bare string "[confirmed]" — no slot, no value. The model could not record
   * what it had not been told, so nothing was patched and the question came round
   * again. The state machine never had this failure because it applies a control
   * answer itself and only then advances.
   *
   * The value is taken from the control that was SHOWN: a confirm agrees to its
   * defaultValue, a choice to the option that was picked, a text/date control to
   * what was typed. Nothing here consults the model.
   *
   * @returns {Promise<{slotId, value, label}|null>} what was recorded, or null
   */
  async function recordControlAnswer(ctx, controlAction, shownControls) {
    if (!controlAction || !controlAction.slotId) return null;
    const slotId = canonicalSlotId(controlAction.slotId);
    // Handled by their own paths: the skip ladder, the submit gate, the form hand-off.
    if (slotId === '__skip__' || slotId === '__confirm__' || slotId.startsWith('__')) return null;

    const shown = (shownControls || []).find((c) => c && canonicalSlotId(c.slotId) === slotId);
    const raw = controlAction.value;
    const declined = raw === false || raw === 'false';
    if (declined) return null; // "no, someone else" — the next turn asks; nothing to store

    let value;
    if (raw !== undefined && raw !== null && raw !== '' && raw !== true && raw !== 'true') {
      // An option was picked: keep the option's own value, not its label.
      const opt = shown && Array.isArray(shown.options)
        ? shown.options.find((o) => String(o.value) === String(raw))
        : null;
      value = opt ? opt.value : raw;
    } else if (shown && shown.defaultValue !== undefined) {
      value = shown.defaultValue; // a plain "yes" agrees to what was offered
    } else if (SELF_DEFAULT_SLOTS.has(slotId)) {
      value = await selfValue(ctx); // …and if the control is gone, to the signed-in user
    }
    if (value === undefined || value === null || value === '') return null;

    const draft = await draftService.get(ctx.sessionId).catch(() => null);
    if (!draft || !draft.serviceId) {
      const ok = await recordPreDraftAnswer(ctx, slotId, value);
      return ok ? { slotId, value, label: (shown && shown.label) || slotId } : null;
    }

    const snapshot = await loadSnapshot(draft.serviceId).catch(() => null);
    const def = (snapshot && snapshot.slots ? snapshot.slots : []).find((sl) => sl.slotId === slotId);
    if (!def) return null; // not a field of this form — the model's own control
    try {
      await draftService.patch(ctx.sessionId, [{ op: 'set', slotId, value, provenance: 'resolved', pending: false }]);
    } catch {
      return null; // the draft refused it; the model still gets the plain description
    }
    // Any change invalidates a confirmation given for the earlier version.
    if (ctx.session.confirmAccepted) { ctx.session.confirmShown = false; ctx.session.confirmAccepted = false; }
    return { slotId, value, label: def.promptHint || slotId };
  }

  /** Required fields still empty on the current draft, or [] when there is no draft. */
  async function missingRequired(ctx) {
    try {
      const draft = await draftService.get(ctx.sessionId);
      if (!draft || !draft.serviceId) return [];
      const snapshot = await loadSnapshot(draft.serviceId);
      if (!snapshot) return [];
      return formState(draft, snapshot, ctx.session).stillMissing;
    } catch {
      return []; // a form we cannot read must not block the conversation
    }
  }

  /**
   * ADCC-097 — a REQUIRED field cannot be skipped.
   *
   * The state machine refuses the skip, explains why, and offers to provide the
   * value, park the request or cancel it. The agent's Skip control was accepting
   * any slot, so a required field could leave the queue and never come back —
   * the request then reached the end silently incomplete. Called by the loop
   * when the user presses Skip; the refusal is handed to the model as the user
   * turn so it explains rather than silently re-asking.
   *
   * @returns {Promise<{ok:boolean, label?:string, choices?:string[]}>}
   */
  async function recordSkip(ctx, slotId) {
    if (!slotId) return { ok: false };
    try {
      const draft = await draftService.get(ctx.sessionId);
      const snapshot = draft && draft.serviceId ? await loadSnapshot(draft.serviceId) : null;
      const slotDef = snapshot && (snapshot.slots || []).find((s) => s.slotId === slotId);
      if (slotDef && requiredNow(slotDef, draft, snapshot)) {
        return { ok: false, label: slotDef.promptHint || slotId, choices: ['provide', 'park', 'cancel'] };
      }
    } catch { /* unreadable form → treat as optional rather than trap the user */ }
    ctx.session.skippedSlotIds.add(slotId);
    return { ok: true };
  }

  /**
   * The slot definition for a slotId — from the open form, or from the overlay
   * when no form is open yet.
   *
   * The recipient question comes BEFORE the draft: the opening order is intent →
   * service → recipient → location, and only then the form. Session
   * fdv2-2161acf8 shows what happened without this fallback — the agent asked
   * "is this extension for yourself, or for someone else?" with no controls at
   * all, because `beneficiary` belonged to a draft that did not exist yet. The
   * overlay slots are universal, so they need no form to be defined.
   */
  async function slotDefinitionFor(ctx, slotId) {
    try {
      const draft = await draftService.get(ctx.sessionId);
      if (draft && draft.serviceId) {
        const snapshot = await loadSnapshot(draft.serviceId);
        const hit = (snapshot && snapshot.slots ? snapshot.slots : []).find((s) => s.slotId === slotId);
        if (hit) return hit;
      }
    } catch { /* form unavailable — the overlay still stands */ }
    return CONTEXT_SLOTS.find((s) => s.slotId === slotId) || null;
  }

  /**
   * The queue for the phase BEFORE the form exists.
   *
   * The opening order — who it is for, then where they are based — is a queue
   * like any other, so it runs through the same policy over the overlay's own
   * slots, with what has been answered so far standing in for the draft.
   * Session fdv2-111bd67f is what its absence looked like: the recipient was
   * confirmed, the assistant asked for the duty station in prose, and no control
   * appeared, because the only field guaranteed before the draft was the
   * recipient.
   */
  const PRE_FORM_SNAPSHOT = { serviceId: null, metadata: {}, phases: ['context'], slots: CONTEXT_SLOTS };
  function preFormState(ctx) {
    const answered = ctx.session.pendingContext || {};
    const draft = { slots: Object.fromEntries(Object.entries(answered).map(([k, v]) => [k, { value: v }])) };
    const skipped = ctx.session.skippedSlotIds || new Set();
    const queue = policy.activeAskableSlots(draft, PRE_FORM_SNAPSHOT).filter((sl) => !skipped.has(sl.slotId));
    return { draft, queue, nextField: policy.chooseNextSlot(queue, draft, PRE_FORM_SNAPSHOT) };
  }

  /**
   * What a control should already hold when it is shown.
   *
   * The duty station is proposed from the profile — the beneficiary's if it
   * carries one, otherwise the signed-in user's — exactly as the state machine's
   * resolver proposes it. The user confirms it in one click or searches for
   * another; being asked to type an office name they have never typed before is
   * the version of this question nobody wants.
   */
  async function controlDefaultFor(slotId, ctx) {
    if (SELF_DEFAULT_SLOTS.has(slotId)) return selfValue(ctx);
    if (slotId === 'location') {
      const chosen = (ctx.session.pendingContext || {}).beneficiary;
      const from = (chosen && typeof chosen === 'object' && chosen.location) ? chosen : await selfValue(ctx);
      return (from && from.location) || undefined;
    }
    return undefined;
  }

  /**
   * What a directory question proposes, and what else it offers.
   *
   * The two cheap cases stay cheap: "is this for you?" is the signed-in user, and
   * the duty station is the recipient's own — neither needs to leave the process.
   * Everything else that declares a `resolverRef` is handed to the state machine's
   * OWN resolvers rather than re-implemented here.
   *
   * The approver is why this exists. It is a people-directory field like the
   * recipient, but its default is not the user — it is the RECIPIENT'S MANAGER
   * (resolvers.resolveApproverFor), with the other managers as alternatives. Left
   * to the generic path it rendered a confirm with no default: a "Yes" agreeing to
   * nothing, and a people search the user had to know the answer to. Resolving it
   * is one directory call, made only on the turn the field is actually asked.
   */
  async function resolveForControl(slotDef, ctx, draft) {
    const slotId = slotDef && slotDef.slotId;
    const cheap = await controlDefaultFor(slotId, ctx);
    if (cheap !== undefined) return { defaultValue: cheap, alternatives: [] };
    if (!slotDef || !slotDef.resolverRef || !draft || !draft.slots) return { defaultValue: undefined, alternatives: [] };
    try {
      const r = await resolvers.runResolverForSlot(slotDef, draft, directory());
      if (!r) return { defaultValue: undefined, alternatives: [] };
      return { defaultValue: r.defaultValue || undefined, alternatives: r.alternatives || [] };
    } catch {
      // The directory is not always reachable, and a question with no default is
      // still a question. Never let resolution cost the user their turn.
      return { defaultValue: undefined, alternatives: [] };
    }
  }

  /**
   * The value the recipient question's "Yes" agrees to: the signed-in user.
   * Resolved from the directory with the acting user's context, as the state
   * machine's resolvers do, so "for me" means the real person and not a name the
   * model typed.
   */
  async function selfValue(ctx) {
    try {
      const dir = directory();
      if (dir && typeof dir.getCurrentUser === 'function') {
        const me = await dir.getCurrentUser(ctx.userContext || undefined);
        if (me) return me;
      }
    } catch { /* directory down or unauthenticated — the turn still has to work */ }
    // The directory cannot always answer: without an acting-user token it returns
    // nothing, and a confirm with no default renders a "Yes" that agrees to
    // nothing. What the turn already knows about the caller is better than that.
    const uc = ctx.userContext || {};
    const name = uc.name || uc.displayName || uc.fullName;
    const email = uc.email || uc.upn;
    if (name || email || uc.userId || ctx.userId) {
      // The caller's own profile location, when the proxy passes one, is what the
      // duty-station question proposes — otherwise the user is asked to type an
      // office name the system already knows.
      const loc = uc.location || uc.dutyStation || uc.locationPath;
      return {
        ...(uc.userId || ctx.userId ? { userId: uc.userId || ctx.userId } : {}),
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(loc ? { location: typeof loc === 'string' ? { name: loc } : loc } : {}),
      };
    }
    return undefined;
  }

  const TOOLS = { catalog_search, kb_search, draft_create, draft_update, draft_submit, escalation_create, emit_control, open_form };

  /**
   * Execute one tool call. Never throws — an unexpected failure comes back as a
   * tool error so the loop can continue and the model can react.
   */
  async function execute(name, input, ctx) {
    const fn = TOOLS[name];
    if (!fn) return err(`unknown tool "${name}"`);
    const t0 = Date.now();
    try {
      const result = await fn(input || {}, ctx);
      return { ...result, ms: Date.now() - t0 };
    } catch (e) {
      return { ...err(`${name} failed unexpectedly: ${e.message}`), ms: Date.now() - t0 };
    }
  }

  return { execute, TOOLS, TOOL_SCHEMAS, createToolSession, CONTROL_TYPES, autoControlFor, recordSkip, missingRequired, turnBrief, recordPreDraftAnswer, recordControlAnswer, recordTypedAnswer, resolveForControl, prefetchCatalog, loadSnapshot,
    beginTurn };
}

module.exports = { createAgentTools, createToolSession, TOOL_SCHEMAS, CONTROL_TYPES };
