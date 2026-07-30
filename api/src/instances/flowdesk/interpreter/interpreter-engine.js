'use strict';

/**
 * Interpreter engine (C4.2–C4.4) — the universal flow-as-data turn executor.
 *
 * Each turn is a full re-execution of the meta-graph (interpreter-graph.js)
 * against the DraftSR (SessionEnvelope) and the service's SchemaSnapshot. No
 * state lives in the engine between turns (RULE-075): everything is loaded from
 * and written back to the DraftSR. LLM nodes go through the C0 LLMProvider; tool
 * and LLM-method use is whitelisted per node (Contract 4B).
 *
 * Deps (all injectable):
 *   llm            - LLMProvider {structuredOutput, completion, embedding}
 *   resolveSearch  - (query, ctx) => ResolveResult[]
 *   draftService   - {get, create, patch, submit, escalate}
 *   loadSnapshot   - (serviceId) => SchemaSnapshot
 *
 * @module instances/flowdesk/interpreter/interpreter-engine
 */

const { AsyncLocalStorage } = require('async_hooks');
const { assertToolAllowed, assertLLMMethodAllowed } = require('../contracts/interpreter-nodes');
const { runSlotExtract, runQuestionPlanner } = require('../contracts/llm-provider.stub');
const { evalTref, isRequiredNow, topSequence, completeness } = require('../contracts/draft-sr.reducer');
const { runResolverForSlot, SELF_HINT_RE } = require('./resolvers');
const {
  buildConfirmControl, buildChoiceControl, buildDateControl, buildMultichoiceControl,
  buildTextControl, buildTextareaControl, buildNumberControl, buildToggleControl,
  buildCascadeConfirmControl,
} = require('./controls');
const { resolveCascadeCluster, isAutofillCascadeSlot, filledDependentsOf, autofillHandledByForm } = require('./cascade-resolver');
const { draftToInitialFormData, postSubmitServices } = require('./form-handoff');
const { buildFormHydration } = require('./form-hydration');

/** Where a created request can be opened. Overridable per deployment. */
const PORTAL_REQUESTS_URL = process.env.FLOWDESK_PORTAL_REQUESTS_URL || 'https://localhost:3001/requests';

/**
 * P1-12: slots for which the user declined the dictionary's answer and chose to type it
 * themselves. Kept per session in memory (like the ACT gate): losing it on a restart
 * only means the offer is made once more, never a wrong value.
 */
const CASCADE_DECLINED = new Map();
const declinedSet = (sessionId) => {
  if (!CASCADE_DECLINED.has(sessionId)) CASCADE_DECLINED.set(sessionId, new Set());
  return CASCADE_DECLINED.get(sessionId);
};

/**
 * Optional slots the user chose to leave blank. The chat now offers EVERY field, so it
 * needs to remember a decline — otherwise the same optional question would come back on
 * the next turn forever. Required slots are never added here (they cannot be skipped).
 */
const SLOT_SKIPPED = new Map();
const skippedSet = (sessionId) => {
  if (!SLOT_SKIPPED.has(sessionId)) SLOT_SKIPPED.set(sessionId, new Set());
  return SLOT_SKIPPED.get(sessionId);
};

/**
 * CODE-004: disambiguation candidate sets already shown, per session.
 *
 * Disambiguation used to be stateless: every NEW_INTENT turn re-ran the search,
 * got the same hits, and re-emitted the same choice control. When the user
 * rejected the options, nothing recorded that — so the next turn offered them
 * again, verbatim. The arena transcripts showed this up to five times in one
 * dialogue, and DISAMBIGUATE alone accounted for 153 of 291 turns.
 *
 * Keyed by the candidate set, not by a plain counter: offering a DIFFERENT set of
 * services after the user rephrased is progress and must stay allowed. Only
 * re-offering the SAME set is the loop.
 *
 * In memory like the other session gates above — losing it on restart only means
 * the user is offered one more round, never a wrong answer.
 */
const DISAMBIG_SHOWN = new Map();
const disambigKey = (candidates) => (candidates || []).slice(0, 3).map((c) => c.serviceId).sort().join('|');
function disambigSeenCount(sessionId, key) {
  const m = DISAMBIG_SHOWN.get(sessionId);
  return m && m.key === key ? m.count : 0;
}
function noteDisambigShown(sessionId, key) {
  const prev = DISAMBIG_SHOWN.get(sessionId);
  DISAMBIG_SHOWN.set(sessionId, { key, count: prev && prev.key === key ? prev.count + 1 : 1 });
}
/** Called once a service is actually settled — the loop is over. */
const clearDisambig = (sessionId) => DISAMBIG_SHOWN.delete(sessionId);

/**
 * P1-13 rollout gate. The multi-select CAPTURE path is complete, but Altiora's
 * expected wire format for a checklist in FormDataJson is not confirmed, so emitting
 * a multi-select by default would let a user pick several values that submission
 * cannot yet represent. Off → multi slots fall back to single `choice` (today's
 * behaviour, no regression). Flip to 'true' once P1-13c pins the serialization.
 */
const MULTICHOICE_ENABLED = () => process.env.FLOWDESK_MULTICHOICE_ENABLED === 'true';

/** True for a strict ISO 8601 calendar date (YYYY-MM-DD) that is also a real date. */
function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && v === d.toISOString().slice(0, 10);
}
const { buildPreamble, validateGrounding } = require('./templates/echo');
const { ui: uiStrings, langInstruction } = require('./templates/ui-strings');
const { interpret: interpretPending } = require('./repair-router');
const { buildSources } = require('./sources');
const { getAllTargets, findNavigationTarget } = require('./navigation-targets');
const voiceFmt = require('./voice-formatters');
const { voiceStrings } = require('./templates/voice-strings');
const { actStrings } = require('./templates/act-strings');
const disambig = require('./disambiguation-utils');

const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['route'],
  properties: {
    route: { enum: ['NEW_INTENT', 'SLOT_FILL', 'INFO_QUESTION', 'OUT_OF_SCOPE', 'CONFIRM_YES', 'CONFIRM_EDIT', 'MY_REQUESTS', 'QUERY_TASKS', 'QUERY_MAIL', 'ACT_APPROVE', 'ACT_REJECT', 'CATALOG_BROWSE', 'CATALOG_SEARCH', 'FIELD_HELP', 'SITE_NAVIGATE', 'SERVICE_HELP'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

// ── Universal platform context slots (NOT part of any service schema) ──────────
// beneficiary ("for whom") and location ("where the service is provided") belong
// to the SYSTEM-PROMPT / platform layer, not to a service's form schema — the
// schema is a *continuation* of this opening. They are collected right after the
// service is determined and BEFORE the schema fields, for EVERY service, using the
// existing resolver + directory-autocomplete machinery. `effectiveSnapshot`
// overlays them onto the working snapshot INSIDE the interpreter per turn; the
// persisted SchemaSnapshot (DB/catalog) is never modified. Idempotent: a schema
// that already declares these slots (golden fixtures) is left untouched.
// CONTEXT_SLOTS and effectiveSnapshot now live in form-overlay, because the agent
// interpreter walks the SAME forms and was walking them without the overlay: the
// mandatory location question had no field to attach to, so it was never collected.
const { effectiveSnapshot } = require('./form-overlay');

// trefContext / activeRequiredSlots / activeAskableSlots / activeSlotIds /
// chooseNextSlot now live in form-policy, so the agent interpreter walks forms by
// exactly the same rules. Extracted, not copied — two copies would drift.
const {
  trefContext, activeRequiredSlots, activeAskableSlots, activeSlotIds, chooseNextSlot, validatePatches,
} = require('./form-policy');

function draftSummary(draft, snapshot) {
  const lines = [];
  for (const s of snapshot.slots) {
    const sv = draft.slots[s.slotId];
    if (sv && sv.value !== undefined) {
      // P1-13: a multi-select value is an array — read it back as a list, not as JSON.
      const val = Array.isArray(sv.value)
        ? sv.value.join(', ')
        : (typeof sv.value === 'object' ? (sv.value.name || sv.value.id || JSON.stringify(sv.value)) : sv.value);
      lines.push(`• ${s.promptHint ? s.slotId : s.slotId}: ${val}${sv.stale ? ' (needs re-confirmation)' : ''}`);
    }
  }
  return lines.join('\n');
}

/** A slot whose valid value comes from a directory / cascade dictionary / LOV
 *  lookup rather than free text (mirrors the extraction guard). Such a value is
 *  chosen from a reference and is not edited directly in the review. */
function isReferenceDerived(slot) {
  return !!(slot && (slot.resolverRef || slot.dictRef || (slot.lov && slot.type !== 'enum')));
}

/** A form SECTION slug (camelCase / snake / kebab) → a Title Case heading. */
function humanizeSection(slug) {
  if (!slug) return 'Details';
  return String(slug)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable display of a stored slot value (array / directory object / scalar). */
function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return value.name || value.id || JSON.stringify(value);
  return value == null ? '' : String(value);
}

/**
 * Structured, grouped review of the filled slots, for the confirm-form step.
 * Grouped by the slot's Altiora form `section` (order preserved); each row carries
 * the English field label (promptHint, as named in the Altiora form) and a display
 * value. `editable` is false for reference-derived values (directory/dictionary/LOV)
 * — those are changed by editing their source field, not directly.
 * @returns {{title:string, groups:Array<{section,label,rows:Array}>}}
 */
function buildReview(draft, snapshot) {
  const order = [];
  const bySection = new Map();
  for (const s of snapshot.slots) {
    const sv = draft.slots[s.slotId];
    if (!sv || sv.value === undefined || sv.value === null || sv.value === '') continue;
    const section = s.section || '__general__';
    if (!bySection.has(section)) { bySection.set(section, []); order.push(section); }
    bySection.get(section).push({
      slotId: s.slotId,
      label: s.promptHint || s.slotId,
      value: sv.value,
      display: displayValue(sv.value),
      editable: !isReferenceDerived(s),
      stale: !!sv.stale,
    });
  }
  return {
    title: snapshot.metadata.title,
    groups: order.map((section) => ({
      section,
      label: section === '__general__' ? 'Details' : humanizeSection(section),
      rows: bySection.get(section),
    })),
  };
}

/** Loose value equality (handles directory-slot objects and multi-select arrays). */
function valueEq(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * Detect an edit that OVERWRITES an already-filled slot which has FILLED dependents
 * — a cascade source whose change must be confirmed (the dependents will reset).
 * Hints / carry-over / no-op re-sets are ignored (value null or unchanged).
 * @returns {{slotId:string, value:*, dependents:Array}|null}
 */
function detectCascadeEdit(patches, draft, snapshot) {
  for (const p of patches || []) {
    if (p.op !== 'set') continue;
    if (p.value === null || p.value === undefined || p.value === '') continue; // hint / carry-over
    const existing = draft.slots[p.slotId];
    if (!existing || existing.value === undefined || existing.value === null || existing.value === '' || existing.pending) continue;
    if (valueEq(existing.value, p.value)) continue; // no real change
    const dependents = filledDependentsOf(snapshot, draft, p.slotId);
    if (dependents.length) return { slotId: p.slotId, value: p.value, dependents };
  }
  return null;
}

function createEngine(deps) {
  const { llm, resolveSearch, draftService, loadSnapshot, emitProgress } = deps;
  // The engine always works on the EFFECTIVE snapshot = the service schema plus the
  // universal platform context slots (beneficiary/location). The injected
  // loadSnapshot stays pure (used by the draft service / registry); the engine
  // wraps it so "for whom" and "location" are asked for every service, before the
  // schema fields, independent of the schema-provider mode.
  // Unit tests of bare engine mechanics inject minimal single-slot snapshots and
  // opt out via injectContext:false; production (and fixture-backed tests) keep it on.
  const injectContext = deps.injectContext !== false;
  const loadEffective = injectContext
    ? async (serviceId) => effectiveSnapshot(await loadSnapshot(serviceId))
    : loadSnapshot;
  // Directory (mock or the Altiora provider) for RESOLVERS. Lazy default so tests
  // that don't need it aren't forced to inject.
  const rawDirectory = deps.directory || (() => { try { return require('../services/directory'); } catch { return null; } })();
  // F11d: the acting user's identity arrives per-turn (Altiora proxy headers →
  // userContext). We inject it into getCurrentUser via an AsyncLocalStorage store
  // so no-arg getCurrentUser() calls anywhere in the turn (engine + resolvers)
  // resolve the real logged-in user — without threading context through every
  // call site, and concurrency-safe across simultaneous sessions.
  const authStore = new AsyncLocalStorage();
  const directory = rawDirectory
    ? Object.assign(Object.create(rawDirectory), {
        getCurrentUser: (ctx) => rawDirectory.getCurrentUser(ctx || authStore.getStore() || undefined),
      })
    : rawDirectory;
  // P1-12: the FormLookup channel the cascade resolver queries. Lazy + best-effort, so
  // engine unit tests need not inject it; without it a cascade slot simply stays manual.
  const fetchLovValues = deps.fetchLovValues || (async (req) => {
    const { getAltioraSchemaClient } = require('../services/altiora-schema-client');
    return getAltioraSchemaClient().getLovValues(req);
  });

  // Service catalog listing for the 'capabilities' universal action (best-effort).
  const listServices = deps.listServices || (async () => {
    try { return await require('../services/altiora-tools.adapter').getAltioraTools().searchServices('', {}); }
    catch { return []; }
  });

  // ADMIN P5 prompt overlays: operator guidance applied from the Chat Admin
  // session-analysis agent. Optional + best-effort by contract — absence or
  // failure yields empty guidance and the engine behaves exactly as before.
  const getPromptGuidance = deps.getPromptGuidance || null;
  // Phase 8: resolve the KB curated for a UI anchor via its graph EXPLAINS edges.
  // (anchorId) => Promise<Array<{articleId, title, snippet?, collection?}>>. When
  // absent or it returns [], anchorExplain falls back to semantic-by-title search.
  const getAnchorKB = deps.getAnchorKB || null;
  // Phase 9 (Layer 4 audit): record a chat-initiated ACT to the ChatActionLog.
  // No-op by default so unit tests don't touch Memgraph; chat-v2.service wires the
  // real recordAction. Best-effort — never allowed to break a turn.
  const logAction = deps.logAction || (async () => {});
  async function fetchGuidance(serviceId) {
    if (!getPromptGuidance) return { global: null, service: null };
    try { return (await getPromptGuidance(serviceId)) || { global: null, service: null }; }
    catch { return { global: null, service: null }; }
  }
  const joinGuidance = (g) => [g.global, g.service].filter(Boolean).join('\n') || undefined;

  // ADMIN P6 graph-generated SYSTEM PROMPT: the authoritative leading block,
  // materialized from the active prompt-graph version. Optional + best-effort —
  // absence or failure yields empty (chat falls back to base prompts + P5
  // overlays). Injected as a leading `System guidance` block, ABOVE the base
  // node prompt, so it frames behavior without replacing the node mechanics.
  const getSystemPrompt = deps.getSystemPrompt || null;
  async function fetchSystemPrompt(node) {
    if (!getSystemPrompt) return null;
    try { return (await getSystemPrompt(node)) || null; }
    catch { return null; }
  }
  const withSystem = (sys, prompt) => (sys ? `System guidance (authoritative — follow first):\n${sys}\n\n${prompt}` : prompt);

  // Progress emission is optional (no-op when emitProgress is absent, e.g. tests).
  // Node instrumentation wraps an async node body with node:start / node:done.
  function makeEmit(sessionId) {
    return (type, payload) => { try { emitProgress?.(sessionId, { type, ...payload, ts: Date.now() }); } catch { /* progress is best-effort */ } };
  }
  async function runNode(emit, node, fn) {
    emit('node:start', { node });
    const t0 = Date.now();
    try {
      const out = await fn();
      emit('node:done', { node, status: 'success', duration: Date.now() - t0 });
      return out;
    } catch (e) {
      emit('node:done', { node, status: 'error', duration: Date.now() - t0 });
      throw e;
    }
  }

  async function router(message, draft, snapshot) {
    assertLLMMethodAllowed('ROUTER', 'structuredOutput');
    const allFilled = draft && snapshot ? activeRequiredSlots(draft, snapshot).length === 0 : false;
    const prompt =
      `You are the intake assistant for a UN Executive Office service desk handling Human Resources and ` +
      `Finance requests (e.g. separation, position management, dependency and personal-data changes, home ` +
      `leave and travel entitlements, recruitment, payroll and grants). Classify the user's latest message.\n` +
      `Has active draft: ${!!draft}. All required slots filled: ${allFilled}.\n` +
      `Message: "${message}"\n\n` +
      `Routes:\n` +
      `- NEW_INTENT: the user wants to raise a new service request.\n` +
      `- SLOT_FILL: the user is answering a question for the current request.\n` +
      `- INFO_QUESTION: any question about the service desk's domains — HR entitlements, personal and ` +
      `household data, separation and recruitment, home leave and travel, payroll and grants — including how ` +
      `to request something, what options exist, or the status of a request. When in doubt between INFO_QUESTION ` +
      `and OUT_OF_SCOPE, prefer INFO_QUESTION (the knowledge base decides if it can answer).\n` +
      `- OUT_OF_SCOPE: only messages clearly unrelated to any workplace service — the current time or date, ` +
      `weather, math, world facts, sports, or personal small talk. If it is plainly not a workplace HR or ` +
      `Finance matter, choose OUT_OF_SCOPE (do NOT try to answer it).\n` +
      `- CONFIRM_YES: confirming submission.\n` +
      `- CONFIRM_EDIT: correcting a value.\n` +
      `- MY_REQUESTS: the user asks about THEIR OWN existing service requests/tickets/cases — "show my requests", ` +
      `"what's the status of my tickets", "my pending cases", "my completed requests from last month", or a SPECIFIC ` +
      `request by number ("what's the status of SR-45678", "tell me about request 12345").\n` +
      `- QUERY_TASKS: the user asks about THEIR OWN tasks / to-dos / assigned work items — "what are my tasks", ` +
      `"show my open tasks", "my high-priority tasks", "any tasks due this week", "tell me about the first task".\n` +
      `- QUERY_MAIL: the user asks about THEIR OWN mailbox / messages / notifications — "do I have any mail", ` +
      `"how many unread messages", "check my inbox", "read the message from Alice", "what's in my sent folder".\n` +
      `- ACT_APPROVE: the user wants to APPROVE a request/authorization awaiting their decision — "approve SR-45678", ` +
      `"approve this request", "approve my pending approvals", "yes approve it". (An APPROVAL decision, not raising a new request.)\n` +
      `- ACT_REJECT: the user wants to REJECT / decline / deny an approval awaiting their decision — "reject SR-45678", ` +
      `"decline this request", "deny it because the budget isn't available".\n` +
      `- CATALOG_BROWSE: the user wants to BROWSE the WHOLE catalog / its categories, with NO specific topic — ` +
      `"what services do you offer", "show me the categories", "what can you help with", "go back to categories".\n` +
      `- CATALOG_SEARCH: the user wants to FIND/SEE services matching a TOPIC or keyword — they name WHAT the services ` +
      `are about but not a single exact service. "find appointment services", "show me travel-related services", ` +
      `"what appointment services are there", "search for grant services", "which dependency services exist". ` +
      `Distinguish from CATALOG_BROWSE (no topic — the whole catalog), from NEW_INTENT (RAISE one request now — "I need to…"), ` +
      `and from SERVICE_HELP (a reference on ONE named service — "what is the Advance Home Leave request").\n` +
      `- FIELD_HELP: the user asks what a FIELD/QUESTION in the current form means or what to put in it — ` +
      `"what does subject mean", "explain this field", "what should I enter here". (Only meaningful with an active request.)\n` +
      `- SITE_NAVIGATE: the user wants to GO TO / be TAKEN TO a page or section of the portal — ` +
      `"take me to my requests", "open the service catalog", "where do I go to see my approvals", ` +
      `"navigate to the mail page". This is about MOVING to a page, not listing data in the chat ` +
      `(contrast MY_REQUESTS, which lists tickets here in the conversation).\n` +
      `- SERVICE_HELP: the user asks WHAT a SPECIFIC catalog service/request IS, what it is FOR, or what ` +
      `information/fields it needs — a REFERENCE about a named service, not how-to advice and not starting one. ` +
      `"what is the Advance Home Leave request", "tell me about the education grant service", "what does the ` +
      `separation request need", "what fields are in the dependency change request", "explain the recruitment service". ` +
      `Distinguish from NEW_INTENT (the user wants to RAISE/START a request now — "I need to…", "I want to record…"), ` +
      `from INFO_QUESTION (a knowledge/how-to question — "how do I…", "what documents do I need…"), and from ` +
      `CATALOG_BROWSE (browse the WHOLE catalog, not one named service).\n\n` +
      `Examples: "how do I record my marriage?" → NEW_INTENT. "what documents do I need to initiate separation?" ` +
      `→ INFO_QUESTION. "how do I request advance home leave?" → INFO_QUESTION. "show my open requests" → MY_REQUESTS. ` +
      `"status of SR-45678" → MY_REQUESTS. "what are my tasks?" → QUERY_TASKS. "how many unread emails?" → QUERY_MAIL. ` +
      `"approve SR-45678" → ACT_APPROVE. "reject this request, no budget" → ACT_REJECT. ` +
      `"take me to my requests page" → SITE_NAVIGATE. "open the service catalog" → SITE_NAVIGATE. ` +
      `"what services can I request?" → CATALOG_BROWSE. "find appointment services" → CATALOG_SEARCH. ` +
      `"show me travel-related services" → CATALOG_SEARCH. "what does this field mean?" → FIELD_HELP. ` +
      `"what is the advance home leave request?" → SERVICE_HELP. "tell me about the education grant service" → SERVICE_HELP. ` +
      `"what fields does the separation request need?" → SERVICE_HELP. ` +
      `"what time is it?" → OUT_OF_SCOPE. "what's the weather?" → OUT_OF_SCOPE. "tell me a joke" → OUT_OF_SCOPE.`;
    // ADMIN P6: graph-generated system prompt (authoritative leading block).
    const sys = await fetchSystemPrompt('router');
    // ADMIN P5: global operator guidance (prompt overlays) rides along so routing
    // behavior can be tuned from the Chat Admin without a deploy.
    const g = await fetchGuidance(draft ? draft.serviceId : null);
    const guided = g.global ? `${prompt}\n\nOperator guidance (apply when classifying):\n${g.global}` : prompt;
    const { data } = await llm.structuredOutput(withSystem(sys, guided), ROUTER_SCHEMA);
    return data.route;
  }

  /**
   * INTAKE_DECOMPOSE — split a first message that mixes a service request with
   * inline form data into its meaning-bearing parts. Users often type both at
   * once ("I need to update my dependency info — spouse: Jane, effective date =
   * 2026-02-01"); passing that whole string to the service search dilutes the
   * intent signal. We isolate:
   *   - serviceIntent: the phrase expressing WHAT service they want (drives the
   *     KB service search), and
   *   - pairs: the explicit name/value data they volunteered (any separator).
   * Best-effort: on any failure we return empty parts and the caller falls back
   * to the raw message. Never invents values.
   */
  async function decomposeIntake(message) {
    assertLLMMethodAllowed('INTAKE_DECOMPOSE', 'structuredOutput');
    const schema = {
      type: 'object', additionalProperties: false, required: ['serviceIntent', 'pairs', 'intent'],
      properties: {
        serviceIntent: { type: 'string', description: 'The part of the message expressing WHICH service/request the user wants, as a concise phrase for catalogue search. Empty string if the message is only data with no request.' },
        pairs: {
          type: 'array',
          description: 'Explicit field name/value pairs the user stated, with ANY separator (colon, equals, dash, "is", newline, comma). Empty array if none. Do not invent.',
          items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'string' } } },
        },
        intent: {
          enum: ['fill', 'info', 'unclear'],
          description: 'The user\'s ACTION intent toward the service: "fill" = they want to raise/submit the request now (an action verb like request/raise/file/submit/apply, or they gave field data); "info" = they only want to learn what the service/form is or which fields it asks; "unclear" = they merely named a service/topic with no clear signal of whether they want to fill it or just learn about it.',
        },
      },
    };
    const prompt = `Decompose the user's message into (1) the service-request intent phrase, (2) any explicit field name/value pairs they already provided, and (3) their ACTION intent (fill / info / unclear). Do NOT invent values; copy them verbatim.\nMessage: "${message}"`;
    try {
      const { data } = await llm.structuredOutput(prompt, schema);
      // Default to 'fill' when the model is silent/invalid — the ask (Addition 1)
      // only fires on an EXPLICIT 'unclear'/'info', so a missing signal proceeds
      // to intake exactly as before.
      const intent = ['fill', 'info', 'unclear'].includes(data && data.intent) ? data.intent : 'fill';
      return {
        serviceIntent: (data && typeof data.serviceIntent === 'string' ? data.serviceIntent : '') || '',
        pairs: Array.isArray(data && data.pairs) ? data.pairs : [],
        intent,
      };
    } catch {
      return { serviceIntent: '', pairs: [], intent: 'fill' };
    }
  }

  async function infoAnswer(message, draft, snapshot, trace, lang = 'en') {
    assertToolAllowed('INFO_ANSWER', 'resolve.search');
    assertLLMMethodAllowed('INFO_ANSWER', 'completion');
    const hits = await resolveSearch(message, {});
    const articles = hits.filter((h) => h.type === 'ARTICLE');
    // FIX-D3-001: deterministic refusal on zero retrieval. With no grounding
    // articles we do NOT call the LLM (which would answer from parametric memory —
    // a hallucination risk); we return a fixed, localized "not in the KB" message.
    // responseType 'kb_no_answer' distinguishes this from router OUT_OF_SCOPE in telemetry.
    if (articles.length === 0) {
      trace.push('INFO_ANSWER');
      return { response: uiStrings(lang).agent.kbNoAnswer, responseType: 'kb_no_answer', sources: [], waiting: true, route: 'INFO_QUESTION' };
    }
    const snippets = articles.map((a) => `- ${a.title}: ${a.answerSnippet || a.summary || ''}`).join('\n');
    const bridge = draft && snapshot
      ? `\nThen continue with the current ${snapshot.metadata.title} request.`
      : '';
    // ADMIN P5: global operator guidance applies to KB answers too. P6 system prompt leads.
    const sys = await fetchSystemPrompt('info_answer');
    const g = await fetchGuidance(draft ? draft.serviceId : null);
    const guided = g.global ? `\nOperator guidance:\n${g.global}` : '';
    const prompt = withSystem(sys, `Answer the user's question using ONLY this knowledge:\n${snippets}\nQuestion: "${message}".${bridge}${langInstruction(lang)}${guided}`);
    // FIX-D3-002: pin low temperature on KB answer generation (parity with the
    // router's structuredOutput). Effective on API providers; the claude-code CLI
    // provider ignores it (known limitation, P1-10).
    const { text } = await llm.completion(prompt, { temperature: 0.1 });
    trace.push('INFO_ANSWER');
    // Phase 1 ("Show sources"): surface the KB origins of this answer. Light
    // fields only (id/title/collection/relevance/snippet) — the chat KB has no UN
    // provenance yet (PHASE0 F3). Emitted for INFO_QUESTION only in Phase 1;
    // FIELD_HELP / CATALOG_BROWSE are Phase 1.1 candidates once validated.
    return { response: text, sources: buildSources(articles), waiting: true, route: 'INFO_QUESTION' };
  }

  /**
   * ANCHOR_EXPLAIN (Phase 4) — zero-query contextual explain. The user clicked a
   * UI anchor ("Explain this"); there is no typed message. We search the KB by the
   * anchor's human label (or its id) and explain the element from those articles,
   * reusing the Phase-1 sources contract. No draft mutation: any in-progress
   * request survives so the user can continue after the explanation.
   */
  async function anchorExplain(anchor, draft, snapshot, trace, lang = 'en') {
    assertToolAllowed('INFO_ANSWER', 'resolve.search');
    assertLLMMethodAllowed('INFO_ANSWER', 'completion');
    const label = (anchor && (anchor.title || anchor.id)) || '';
    trace.push('ANCHOR_EXPLAIN');

    // Phase 8: GRAPH-DRIVEN first — explain from the KB curated on this anchor's
    // EXPLAINS edges (the graph is the source of truth for "what explains this").
    // Curated hits are authoritative (relevance 1.0). Only when the anchor has no
    // edges do we fall back to semantic-by-title search (Phase 4 behaviour).
    let articles = [];
    if (getAnchorKB && anchor && anchor.id) {
      try {
        const linked = await getAnchorKB(anchor.id);
        if (Array.isArray(linked) && linked.length) {
          articles = linked.map((k) => ({
            type: 'ARTICLE', articleId: k.articleId, title: k.title,
            answerSnippet: k.snippet, sourceCollection: k.collection || 'altiora_knowledge', score: 1,
          }));
        }
      } catch { /* fall back to semantic search */ }
    }
    if (articles.length === 0) {
      // Prefer an explicit initialQuery when the host provided one, else the label.
      const query = (anchor && anchor.initialQuery) || label;
      const hits = query ? await resolveSearch(query, {}) : [];
      articles = hits.filter((h) => h.type === 'ARTICLE');
    }

    // Graceful fallback (ADCC-085 no dead ends): no KB match → invite a follow-up,
    // never an error. Empty sources so the FE shows no "Show sources" icon.
    if (articles.length === 0) {
      return { response: fmt(uiStrings(lang).agent.anchorNoInfo, { title: label }), sources: [], waiting: true, route: 'ANCHOR_EXPLAIN' };
    }
    const snippets = articles.map((a) => `- ${a.title}: ${a.answerSnippet || a.summary || ''}`).join('\n');
    const bridge = draft && snapshot
      ? `\nAfterwards, offer to continue the current ${snapshot.metadata.title} request.`
      : '';
    const sys = await fetchSystemPrompt('info_answer');
    const g = await fetchGuidance(draft ? draft.serviceId : null);
    const guided = g.global ? `\nOperator guidance:\n${g.global}` : '';
    const prompt = withSystem(sys,
      `The user clicked a UI element to understand it. Explain "${label}" — what it is, what it is for, ` +
      `and the key steps or information they need — using ONLY this knowledge:\n${snippets}\n` +
      `Be concise, clear and friendly.${bridge}${langInstruction(lang)}${guided}`);
    // FIX-D3-002: pin low temperature (see infoAnswer). anchorExplain already
    // refuses deterministically above (anchorNoInfo) when no article is found.
    const { text } = await llm.completion(prompt, { temperature: 0.1 });
    return { response: text, sources: buildSources(articles), waiting: true, route: 'ANCHOR_EXPLAIN' };
  }

  /**
   * SITE_NAVIGATE (Phase 5) — the user wants to be taken to a portal page. The LLM
   * only picks a KEY from the whitelist (never a free-form path); the server maps
   * it to a route + optional highlight anchor. Unknown/NONE → helpful text, no
   * `navigate` field (graceful degradation). Read-only: the draft is untouched.
   */
  async function siteNavigate(message, draft, trace, lang = 'en') {
    trace.push('SITE_NAVIGATE');
    const targets = getAllTargets();
    const NAV_SCHEMA = {
      type: 'object', additionalProperties: false, required: ['target'],
      properties: { target: { enum: [...targets.map((t) => t.key), 'NONE'] } },
    };
    const prompt =
      `The user wants to navigate the portal. Choose the ONE best destination key for their message, ` +
      `or "NONE" if none clearly fits.\nDestinations:\n` +
      targets.map((t) => `- ${t.key}: ${t.title} (${t.keywords.join(', ')})`).join('\n') +
      `\nMessage: "${message}"`;
    let key = 'NONE';
    try { const { data } = await llm.structuredOutput(prompt, NAV_SCHEMA); key = data && data.target; } catch { key = 'NONE'; }
    const target = findNavigationTarget(key);
    if (!target) {
      return { response: uiStrings(lang).agent.navNotFound, waiting: true, route: 'SITE_NAVIGATE' };
    }
    return {
      response: fmt(uiStrings(lang).agent.navFound, { title: target.title }),
      navigate: { path: target.path, ...(target.highlight ? { highlight: target.highlight } : {}) },
      waiting: true, route: 'SITE_NAVIGATE',
    };
  }

  // ── chat-agent read intents (tickets / catalog / field help) ───────────────
  const CATALOG_SLOT = '__catalog_browse__';
  function tools() {
    if (deps.tools) return deps.tools;
    try { return require('../services/altiora-tools.adapter').getAltioraTools(); } catch { return null; }
  }

  const FILTER_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: {
      status: { type: ['string', 'null'] }, fromDate: { type: ['string', 'null'] },
      toDate: { type: ['string', 'null'] }, service: { type: ['string', 'null'] }, search: { type: ['string', 'null'] },
    },
  };

  /** MY_REQUESTS — list the user's Altiora tickets, OR detail one by number / prior-list reference. */
  async function handleMyRequests(message, sessionId, trace, lang = 'en') {
    trace.push('MY_REQUESTS');
    const A = uiStrings(lang).agent; const vs = voiceStrings(lang);
    const t = tools();
    if (!t) return { response: A.ticketsError, speech: A.ticketsError, waiting: true, route: 'MY_REQUESTS', trace };

    // Detail: an explicit request number, or a reference into the last shown list.
    const ref = resolveSectionRef(sessionId, message, 'requests');
    const reqNum = (ref && ref.ref) || extractRequestNumber(message);
    if (reqNum) {
      try {
        const req = await t.getMyRequest(reqNum);
        if (req && (req.ticketNumber || req.title)) {
          const speech = voiceFmt.formatRequestDetail(req, vs);
          const lines = `**${req.ticketNumber || reqNum}** — ${req.title || ''} _(${req.status || ''})_` +
            `${req.service ? `\n${req.service}` : ''}${req.assignedTo ? `\nAssigned to ${req.assignedTo}` : ''}`;
          return { response: `${A.ticketsHeader}\n\n${lines}`, speech, responseType: 'ticket_detail', ticket: req, waiting: true, isComplete: false, route: 'MY_REQUESTS', trace };
        }
      } catch { /* fall through to list */ }
    }

    let filters = {};
    try {
      const today = new Date().toISOString().slice(0, 10);
      const prompt = `Extract service-request list filters from the user's message. Return JSON only.\n` +
        `Message: "${message}"\nToday: ${today}\nFields: status ("all"|"ongoing"|"completed"|"pending"|"rejected"|null), ` +
        `fromDate/toDate ("YYYY-MM-DD"|null, dates filter creation date; "last month"→first..last of previous month, "this year"→Jan 1..today), ` +
        `service (name/keyword|null), search (keyword|null). Unspecified → null.`;
      const { data } = await llm.structuredOutput(prompt, FILTER_SCHEMA);
      filters = Object.fromEntries(Object.entries(data || {}).filter(([, v]) => v != null && v !== ''));
    } catch { /* default: no filters */ }
    let result;
    try { result = await t.listMyTickets(filters); }
    catch (err) { return { response: A.ticketsError, waiting: true, route: 'MY_REQUESTS', trace }; }
    const { tickets = [], totalCount = 0 } = result || {};
    if (!tickets.length) {
      const none = voiceFmt.formatRequestList({ tickets: [] }, vs);
      return { response: A.ticketsNone, speech: none, responseType: 'ticket_list', tickets: [], totalCount: 0, filters, waiting: true, isComplete: false, route: 'MY_REQUESTS', trace };
    }
    rememberSection(sessionId, 'requests', tickets.map((k) => ({ id: k.ticketNumber, ticketNumber: k.ticketNumber, title: k.title || k.service })));
    const lines = tickets.map((k) => `• **${k.ticketNumber}** — ${k.title || k.service || ''} _(${k.status})_`).join('\n');
    const more = totalCount > tickets.length ? `\n\n${tickets.length} / ${totalCount}` : '';
    const speech = voiceFmt.formatRequestList({ tickets, totalCount }, vs);
    return { response: `${A.ticketsHeader}\n\n${lines}${more}`, speech, responseType: 'ticket_list', tickets, totalCount, filters, waiting: true, isComplete: false, route: 'MY_REQUESTS', trace };
  }

  /** CATALOG_BROWSE — hierarchical drill-down; parentId from a controlAction, else root. */
  async function handleCatalogBrowse(parentId, trace, lang = 'en') {
    trace.push('CATALOG_BROWSE');
    const A = uiStrings(lang).agent;
    const t = tools();
    if (!t) return { response: A.catalogError, waiting: true, route: 'CATALOG_BROWSE', trace };
    let nodes;
    try { nodes = await t.browseCatalog(parentId || null); }
    catch { return { response: A.catalogError, waiting: true, route: 'CATALOG_BROWSE', trace }; }
    const options = (nodes || []).map((n) => ({
      // A requestable leaf starts that service (svc:CODE); a category drills in (its GUID).
      value: n.isRequestable && !n.hasChildren ? `svc:${n.serviceCode}` : n.serviceId,
      label: n.displayName,
      ...(n.hasChildren ? { description: `${n.childCount}` }
        : (n.briefDescription ? { description: String(n.briefDescription).slice(0, 80) } : {})),
    }));
    if (parentId) options.push({ value: '__root__', label: A.catalogBack });
    if (!options.length) return { response: A.catalogEmpty, waiting: true, route: 'CATALOG_BROWSE', trace };
    // VF-2: voice must READ OUT the categories/services, not just the header. Enumerate
    // the real options (excluding the "back" nav item), capped, with a localized "N more".
    const g = disambiguationGuidance(lang);
    const spokenLabels = options.filter((o) => o.value !== '__root__').map((o) => o.label);
    const CAP = 8;
    const shown = spokenLabels.slice(0, CAP);
    const moreN = spokenLabels.length - shown.length;
    const header = parentId ? A.catalogCategory : A.catalogRoot;
    const speech = `${header} ${shown.join(', ')}.`
      + (moreN > 0 ? ` ${g.more.replace('{remaining}', voiceFmt.numberToWords(moreN, voiceStrings(lang).numberWords))}` : '')
      + ` ${g.ask}`;
    return {
      response: parentId ? A.catalogCategory : A.catalogRoot,
      speech,
      responseType: 'catalog_browse',
      controls: [{ id: 'ctrl-catalog-browse', type: 'choice', slotId: CATALOG_SLOT, label: A.catalogPick, options }],
      choices: options.map((o) => o.label),
      waiting: true, isComplete: false, route: 'CATALOG_BROWSE', trace,
    };
  }

  /** FIELD_HELP — explain a form field/slot using its definition + KB (Altiora namespace). */
  async function handleFieldHelp(message, draft, snapshot, trace, lang = 'en') {
    trace.push('FIELD_HELP');
    let slot = null;
    if (snapshot) {
      const m = String(message).toLowerCase();
      slot = snapshot.slots.find((s) => s.promptHint && m.includes(String(s.promptHint).toLowerCase()))
        || activeRequiredSlots(draft, snapshot)[0] || null; // fallback: the field being gathered
    }
    let kb = [];
    try { const t = tools(); if (t) kb = await t.searchArticles(slot ? slot.promptHint : message, {}); } catch { /* KB optional */ }
    const snips = (Array.isArray(kb) ? kb : []).slice(0, 3).map((a) => `- ${a.title || ''}: ${a.answerSnippet || a.summary || ''}`).join('\n');
    // TASK-PROMPT-005: helpText is the form author's own guidance for this field —
    // the most authoritative grounding available, ahead of the KB snippets below.
    const fieldInfo = slot
      ? `Field label: "${slot.promptHint || slot.slotId}"; type: ${slot.type}${slot.required ? ' (required)' : ''}` +
        (slot.presentOptions ? `; options: ${slot.presentOptions.map((o) => o.label).join(', ')}` : '') +
        (slot.helpText ? `\nField guidance (authoritative): ${slot.helpText}` : '')
      : '(no specific form field is active)';
    const prompt = `A UN staff member asks what a service-request form field is for. Explain its purpose briefly and ` +
      `practically, using the field definition and any knowledge below. If helpful, suggest what to enter.\n` +
      `${fieldInfo}\nKnowledge base:\n${snips || '(none)'}\nUser question: "${message}"${langInstruction(lang)}`;
    // ADMIN P6: field help writes prose to the user, so the operator's tone,
    // safety and formatting rules govern it exactly as they govern info_answer.
    // Until now this scope was offered in the editor but never read here.
    const sys = await fetchSystemPrompt('field_help');
    // FIX-D3-002: pin low temperature. NB field help is field-DEFINITION-grounded
    // (fieldInfo), not KB-only — a zero-KB answer is valid, so no refusal branch here.
    const { text } = await llm.completion(withSystem(sys, prompt), { temperature: 0.1 });
    return { response: text, responseType: 'field_help', ...(slot ? { slotId: slot.slotId } : {}), waiting: true, isComplete: false, route: 'FIELD_HELP', trace };
  }

  // ── V3: section queries over /tasks, /requests, /mail ──────────────────────
  // These are read-only, acting-user-scoped, and voice-first: every result carries
  // a `speech` field (voice-friendly sentence via voice-formatters, localized) that
  // the voice orchestrator prefers for TTS, while `response` (+ structured arrays)
  // drives the text UI. Lists are brief; detail is on request. A per-session memory
  // of the last shown list lets "the first one" / "the VPN one" resolve to a detail.

  const SECTION_CTX = new Map(); // sessionId -> { section, items:[{index,id,ref,title}] }
  const SECTION_CTX_MAX = 500;
  function rememberSection(sessionId, section, items) {
    if (!sessionId) return;
    if (SECTION_CTX.size >= SECTION_CTX_MAX && !SECTION_CTX.has(sessionId)) {
      SECTION_CTX.delete(SECTION_CTX.keys().next().value); // bounded LRU-ish
    }
    SECTION_CTX.set(sessionId, {
      section,
      items: (items || []).slice(0, 5).map((it, i) => ({
        index: i + 1, id: it.id || it.ticketNumber || it.messageId,
        ref: it.ref || it.ticketNumber, title: it.title || it.subject,
      })),
    });
  }

  // Ordinal words 1–5 across the 6 UN languages (voice references are small lists).
  const ORDINAL_WORDS = [
    /\b(?:1st|first)\b|перв|premi[eè]r|primer|الأول|第一/i,
    /\b(?:2nd|second)\b|втор|deuxi[eè]m|segund|الثان|第二/i,
    /\b(?:3rd|third)\b|трет|troisi[eè]m|tercer|الثالث|第三/i,
    /\b(?:4th|fourth)\b|четверт|quatri[eè]m|cuart|الرابع|第四/i,
    /\b(?:5th|fifth)\b|пят|cinqui[eè]m|quint|الخامس|第五/i,
  ];
  const LAST_RE = /\blast\b|последн|derni[eè]r|[uú]ltim|الأخير|最后/i;
  function parseOrdinal(message) {
    const m = String(message || '');
    const digit = m.match(/(?:number|no\.?|#|№)\s*([1-5])\b/i) || m.match(/\b([1-5])\b/);
    if (digit) return Number(digit[1]);
    for (let i = 0; i < ORDINAL_WORDS.length; i += 1) if (ORDINAL_WORDS[i].test(m)) return i + 1;
    return null;
  }
  /** Resolve a follow-up reference ("the first one", "the VPN one") to a remembered item. */
  function resolveSectionRef(sessionId, message, section) {
    const ctx = sessionId && SECTION_CTX.get(sessionId);
    if (!ctx || ctx.section !== section || !ctx.items.length) return null;
    const m = String(message || '').toLowerCase();
    const ord = parseOrdinal(message);
    if (ord && ctx.items[ord - 1]) return ctx.items[ord - 1];
    if (LAST_RE.test(message)) return ctx.items[ctx.items.length - 1];
    // Title/subject contains — match on the first meaningful words of a shown item.
    const byTitle = ctx.items.find((it) => {
      const key = String(it.title || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2).slice(0, 3).join(' ');
      return key && m.includes(key);
    });
    return byTitle || null;
  }
  // A human request number typed directly. Strict, to avoid matching a bare year:
  // either an SR-style token (letters-dash-digits) or a digit run preceded by a
  // request/ticket keyword.
  function extractRequestNumber(message) {
    const m = String(message || '');
    const sr = m.match(/\b([A-Za-z]{2,4}-\d{3,})\b/);
    if (sr) return sr[1].toUpperCase();
    const kw = m.match(/(?:request|ticket|case|заявк\w*|обращени\w*|demande|solicitud|طلب|请求|номер|no\.?|#|№)\s*[:#]?\s*([A-Za-z]{0,4}-?\d{3,})/i);
    return kw ? kw[1].toUpperCase() : null;
  }

  const TASK_FILTER_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: {
      status: { type: ['string', 'null'] }, priority: { type: ['string', 'null'] },
      category: { type: ['string', 'null'] }, service: { type: ['string', 'null'] },
      dueBefore: { type: ['string', 'null'] }, search: { type: ['string', 'null'] },
    },
  };
  const MAIL_FILTER_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: {
      folder: { type: ['string', 'null'] }, unreadOnly: { type: ['boolean', 'null'] },
      from: { type: ['string', 'null'] }, search: { type: ['string', 'null'] },
    },
  };
  const compact = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ''));

  /** QUERY_TASKS — list the user's tasks (filters from the message) or detail one referenced item. */
  async function handleQueryTasks(message, sessionId, trace, lang = 'en') {
    trace.push('QUERY_TASKS');
    const A = uiStrings(lang).agent; const vs = voiceStrings(lang);
    const t = tools();
    if (!t) return { response: A.ticketsError, speech: A.ticketsError, waiting: true, route: 'QUERY_TASKS', trace };

    // Detail: a reference into the last shown task list ("the first one", "the VPN task").
    const ref = resolveSectionRef(sessionId, message, 'tasks');
    if (ref && ref.id) {
      try {
        const task = await t.getMyTask(ref.id);
        const speech = voiceFmt.formatTaskDetail(task, vs);
        return { response: speech, speech, responseType: 'task_detail', task, waiting: true, isComplete: false, route: 'QUERY_TASKS', trace };
      } catch { /* fall through to list */ }
    }

    let filters = {};
    try {
      const today = new Date().toISOString().slice(0, 10);
      const prompt = `Extract task-list filters from the user's message. JSON only.\nMessage: "${message}"\nToday: ${today}\n` +
        `Fields: status ("open"|"in progress"|"completed"|"all"|null), priority ("low"|"medium"|"high"|"critical"|null), ` +
        `category (keyword|null), service (name/keyword|null), dueBefore ("YYYY-MM-DD"|null; "this week"→the coming Sunday, "today"→today), ` +
        `search (free keyword|null). Unspecified → null.`;
      const { data } = await llm.structuredOutput(prompt, TASK_FILTER_SCHEMA);
      filters = compact(data);
    } catch { /* default: no filters */ }

    let result;
    try { result = await t.listMyTasks(filters); }
    catch { return { response: A.ticketsError, speech: A.ticketsError, waiting: true, route: 'QUERY_TASKS', trace }; }
    const { tasks = [], totalCount = 0 } = result || {};
    rememberSection(sessionId, 'tasks', tasks);
    const speech = voiceFmt.formatTaskList({ tasks, totalCount }, vs);
    return { response: speech, speech, responseType: 'task_list', tasks, totalCount, filters, waiting: true, isComplete: false, route: 'QUERY_TASKS', trace };
  }

  /** QUERY_MAIL — unread summary, mailbox listing (filters), or read one referenced message. */
  async function handleQueryMail(message, sessionId, trace, lang = 'en') {
    trace.push('QUERY_MAIL');
    const A = uiStrings(lang).agent; const vs = voiceStrings(lang);
    const t = tools();
    if (!t) return { response: A.ticketsError, speech: A.ticketsError, waiting: true, route: 'QUERY_MAIL', trace };

    // Detail: read a referenced message from the last shown list.
    const ref = resolveSectionRef(sessionId, message, 'mail');
    if (ref && ref.id) {
      try {
        const msg = await t.getMyMail(ref.id);
        const speech = voiceFmt.formatMailDetail(msg, vs);
        return { response: speech, speech, responseType: 'mail_detail', message: msg, waiting: true, isComplete: false, route: 'QUERY_MAIL', trace };
      } catch { /* fall through */ }
    }

    // Counts: "how many unread", "do I have any mail" — a summary, not a listing.
    const wantsCount = /how many|count|\bunread\b|any (new )?(mail|messages?|email)|сколько|непрочит|combien|cu[aá]nt|كم\b|多少|未读/i.test(message)
      && !/\bshow\b|\blist\b|\bread\b|\bopen\b|показать|списо|lire|montr|mostrar|leer|اقرأ|阅读|打开/i.test(message);
    if (wantsCount) {
      try {
        const c = await t.mailCounts();
        const speech = voiceFmt.formatMailCounts(c, vs);
        return { response: speech, speech, responseType: 'mail_counts', counts: c, waiting: true, isComplete: false, route: 'QUERY_MAIL', trace };
      } catch { /* fall through to list */ }
    }

    let filters = {};
    try {
      const prompt = `Extract mailbox-list filters from the user's message. JSON only.\nMessage: "${message}"\n` +
        `Fields: folder ("inbox"|"sent"|"drafts"|"trash"|"archived"|null), unreadOnly (true|false|null), ` +
        `from (sender name/keyword|null), search (free keyword|null). Unspecified → null.`;
      const { data } = await llm.structuredOutput(prompt, MAIL_FILTER_SCHEMA);
      filters = compact(data);
    } catch { /* default: inbox */ }

    let result;
    try { result = await t.listMyMail(filters); }
    catch { return { response: A.ticketsError, speech: A.ticketsError, waiting: true, route: 'QUERY_MAIL', trace }; }
    const messages = (result && result.messages) || [];
    const folder = (result && result.folder) || filters.folder || 'inbox';
    rememberSection(sessionId, 'mail', messages);
    const speech = voiceFmt.formatMailList({ messages, folder }, vs);
    return { response: speech, speech, responseType: 'mail_list', messages, folder, filters, waiting: true, isComplete: false, route: 'QUERY_MAIL', trace };
  }

  // ── V3/P9: ACT approve/reject (governed, draft-less) ───────────────────────
  // Approving/rejecting an Altiora authorization is a REAL side-effecting write —
  // ALWAYS ACT-gated (checkAct + a live acting token; never the service account) and
  // audited to the ChatActionLog. Unlike the draft's confirm_submit gate, this flow
  // has NO DraftSR, so its confirm state lives in a session-keyed engine map and is
  // resolved deterministically (yes/no) BEFORE the LLM router — governance never
  // depends on classification.
  const checkActGate = deps.checkAct || ((...a) => require('../services/act-authorization').checkAct(...a));
  const actingCtx = () => deps.actingContext || require('../services/acting-user.context');
  function approvalService() {
    if (deps.approvalService) return deps.approvalService;
    try { return require('../services/altiora-approval.service').getAltioraApprovalService(); } catch { return null; }
  }
  const ACT_PENDING = new Map(); // sessionId -> { type, authorizationId, ticketNumber, title, justification? }
  const auditAct = (sessionId, decision, status, extra = {}) => logAction(Object.assign({
    sessionId, actionType: decision === 'reject' ? 'REJECT_ITEM' : 'APPROVE_ITEM',
    confirmationShown: true, confirmationAccepted: status === 'EXECUTED',
    motivation: decision === 'reject'
      ? 'User confirmed rejection of a pending approval item.'
      : 'User confirmed approval of a pending item.',
  }, extra, { status })).catch(() => {});

  const actGateUser = () => { const c = actingCtx(); return checkActGate(c.getActingUser(), c.getActingToken()); };
  function actConfirmControl(kind, item) {
    return [{ id: `ctrl-act-${kind}`, type: 'confirm', slotId: '__act_confirm__',
      label: kind === 'reject' ? `Reject ${item.ticketNumber || ''}` : `Approve ${item.ticketNumber || ''}`, options: [] }];
  }
  // An explicit reason in the utterance ("reject SR-9 because X" / "reason: X").
  function extractReason(message) {
    const m = String(message || '').match(/(?:because|since|reason[:\s]|as it|as the|потому что|причина[:\s]|parce que|motif[:\s]|porque|motivo[:\s])\s*(.+)$/i);
    const r = m && m[1] ? m[1].trim() : null;
    return r && r.length >= 2 ? r : null;
  }
  const CANCELISH = /\bcancel\b|\bnever ?mind\b|отмена|отмени|annul|cancelar|إلغاء|取消/i;

  /** ACT_APPROVE / ACT_REJECT — gate, resolve the target authorization, then arm a deterministic confirm. */
  async function handleActDecision(message, decision, sessionId, trace, lang = 'en') {
    trace.push(decision === 'reject' ? 'ACT_REJECT' : 'ACT_APPROVE');
    const S = actStrings(lang); const A = uiStrings(lang).agent;
    const gate = actGateUser();
    if (!gate.ok) { await auditAct(sessionId, decision, 'DENIED', { error: gate.code }); return { response: A.actNotAuthorized, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace }; }
    const svc = approvalService();
    if (!svc) return { response: S.error, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };

    // Identify the target: an explicit request number, else a reference into a shown queue.
    let auth = null;
    try {
      const reqNum = extractRequestNumber(message);
      if (reqNum) auth = await svc.findByTicket(reqNum);
      if (!auth) { const ref = resolveSectionRef(sessionId, message, 'approvals'); if (ref && ref.id != null) auth = { authorizationId: ref.id, ticketNumber: ref.ref, title: ref.title }; }
    } catch { return { response: S.error, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace }; }

    if (!auth) {
      // No specific target → present the queue to pick from (if any).
      let queue = [];
      try { queue = await svc.getPendingAuthorizations(); } catch { return { response: S.error, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace }; }
      if (!queue.length) return { response: S.queueEmpty, speech: S.queueEmpty, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
      rememberSection(sessionId, 'approvals', queue.map((q) => ({ id: q.authorizationId, ref: q.ticketNumber, title: q.title })));
      const summary = queue.slice(0, 5).map((q, i) => `${i + 1}. ${q.ticketNumber}${q.title ? ` — ${q.title}` : ''}`).join('\n');
      return { response: S.queueList(queue.length, summary), speech: S.queueSpeech(queue.length), responseType: 'approval_queue', authorizations: queue, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
    }

    if (decision === 'reject') {
      const reason = extractReason(message);
      if (!reason) {
        ACT_PENDING.set(sessionId, { type: 'reject_reason', authorizationId: auth.authorizationId, ticketNumber: auth.ticketNumber, title: auth.title });
        return { response: S.rejectReasonPrompt(auth), speech: S.rejectReasonPrompt(auth), waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
      }
      ACT_PENDING.set(sessionId, { type: 'confirm_reject', authorizationId: auth.authorizationId, ticketNumber: auth.ticketNumber, title: auth.title, justification: reason });
      const t = { ...auth, justification: reason };
      return { response: S.rejectConfirm(t), speech: S.rejectConfirm(t), responseType: 'confirm_act', controls: actConfirmControl('reject', auth), waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
    }
    ACT_PENDING.set(sessionId, { type: 'confirm_approve', authorizationId: auth.authorizationId, ticketNumber: auth.ticketNumber, title: auth.title });
    return { response: S.approveConfirm(auth), speech: S.approveConfirm(auth), responseType: 'confirm_act', controls: actConfirmControl('approve', auth), waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
  }

  /** Execute a confirmed approve/reject: re-gate, POST the decision, audit, map errors → friendly text. */
  async function executeActDecision(sessionId, pending, lang, trace) {
    const S = actStrings(lang); const A = uiStrings(lang).agent;
    const decision = pending.type === 'confirm_reject' ? 'reject' : 'approve';
    const gate = actGateUser(); // re-check: the acting token may have expired between turns.
    if (!gate.ok) { await auditAct(sessionId, decision, 'DENIED', { targetId: pending.ticketNumber, error: gate.code }); return { response: A.actNotAuthorized, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace }; }
    const svc = approvalService();
    try {
      await svc.submitDecision(pending.authorizationId, decision, pending.justification || null);
      await auditAct(sessionId, decision, 'EXECUTED', { targetLabel: 'Authorization', targetId: pending.ticketNumber, actionParams: { authorizationId: pending.authorizationId, decision } });
      const done = decision === 'reject' ? S.rejectDone(pending) : S.approveDone(pending);
      return { response: done, speech: done, closer: pending.ticketNumber, isComplete: true, waiting: false, route: 'ACT_APPROVE', trace };
    } catch (err) {
      const code = err && err.code;
      const msg = code === 'NOT_APPROVER' ? S.notApprover(pending)
        : code === 'ALREADY_PROCESSED' ? S.alreadyProcessed(pending)
          : code === 'JUSTIFICATION_REQUIRED' ? S.rejectReasonPrompt(pending) : S.error;
      await auditAct(sessionId, decision, 'DENIED', { targetId: pending.ticketNumber, error: code || (err && err.message) });
      return { response: msg, speech: msg, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
    }
  }

  /**
   * Deterministic resolution of an armed ACT gate (draft-less). reject_reason
   * collects a free-text reason (any non-cancel message) then arms confirm_reject;
   * confirm_approve/confirm_reject resolve on yes/no. Returns a result, or null to
   * fall through (no gate armed / unclear reply clears the gate — never a trap).
   */
  async function resolveActPending(sessionId, message, lang, trace, controlAction) {
    const pending = ACT_PENDING.get(sessionId);
    if (!pending) return null;
    const S = actStrings(lang);
    trace.push(`ACT_PENDING:${pending.type}`);
    // P9-010: a confirm-CONTROL click (text UI) resolves the SAME gate as a
    // typed/spoken yes/no. null = no control click; true = confirm; false = cancel.
    let ctrl = null;
    if (controlAction && controlAction.slotId === '__act_confirm__') {
      const a = controlAction.action; const v = controlAction.value;
      ctrl = a === 'confirm' || a === 'yes' || a === 'select' || v === 'confirm' || v === 'yes';
    }
    if (pending.type === 'reject_reason') {
      if (ctrl === false || isNegative(message) || CANCELISH.test(message)) { ACT_PENDING.delete(sessionId); return { response: S.cancelled, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace }; }
      const reason = String(message || '').trim();
      if (!reason) return { response: S.rejectReasonPrompt(pending), waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
      const next = { ...pending, type: 'confirm_reject', justification: reason };
      ACT_PENDING.set(sessionId, next);
      return { response: S.rejectConfirm(next), speech: S.rejectConfirm(next), responseType: 'confirm_act', controls: actConfirmControl('reject', next), waiting: true, isComplete: false, route: 'ACT_APPROVE', trace };
    }
    // confirm_approve / confirm_reject
    if (ctrl === true || isAffirmative(message)) { ACT_PENDING.delete(sessionId); return executeActDecision(sessionId, pending, lang, trace); }
    if (ctrl === false || isNegative(message) || CANCELISH.test(message)) { ACT_PENDING.delete(sessionId); return { response: S.cancelled, waiting: true, isComplete: false, route: 'ACT_APPROVE', trace }; }
    ACT_PENDING.delete(sessionId); // unclear → clear the gate, let the message route normally (no trap)
    return null;
  }

  // ── confirm-or-choose helpers (F9.1d) ──────────────────────────────────────
  // BUG-DIAL-001/002: these three labels were the ONLY strings in the engine that
  // never went through uiStrings(lang) — they returned hardcoded Russian. In an
  // English dialogue the confirm control rendered "Request for: для вас. Correct?",
  // which the transcript analysis found in 15 of 41 runs and which blocked the
  // conversation outright: the user cannot answer a question they cannot read.
  function describeUser(u, lang) {
    const S = uiStrings(lang);
    if (!u) return S.recipientFallback;
    if (u.mode === 'self') return S.self;
    return `${u.name}${u.email ? ` (${u.email})` : ''}${u.location ? `, ${u.location.name}` : ''}`;
  }
  function describeLoc(l, lang) { return l ? (l.name || l.code) : uiStrings(lang).locationFallback; }

  const USER_SLOTS = new Set(['beneficiary', 'author', 'approver', 'manualApprover']);
  // Default 'en', not 'ru': ui-strings documents English as the fallback, and a
  // Russian default silently mislabels every call that omits the argument.
  function confirmOrChoose(slotDef, defaultValue, alternatives, draft, routeLabel, lang = 'en') {
    const S = uiStrings(lang);
    const isUser = USER_SLOTS.has(slotDef.slotId) || slotDef.type === 'user';
    const label = isUser ? describeUser(defaultValue, lang) : describeLoc(defaultValue, lang);
    const prefix = S[slotDef.slotId] || (isUser ? S.user : S.location);
    const response = `${prefix}: ${label}. ${S.correct}`;
    // VF-3: voice — for a directory/LOV slot, speak the search outcome; when there
    // are alternatives, enumerate ALL candidates with their DISTINGUISHING attributes
    // so the user can identify the right record. Single hit → confirm it.
    const flatten = isUser ? disambig.flatUser : disambig.flatLocation;
    const candFields = isUser ? disambig.USER_CANDIDATE_FIELDS : disambig.LOCATION_CANDIDATE_FIELDS;
    const g = disambiguationGuidance(lang);
    const all = [defaultValue, ...(alternatives || [])].filter(Boolean).map(flatten);
    let speech;
    if (all.length <= 1) {
      const one = disambig.formatOption(all[0] || {}, disambig.selectVoiceFields([], { fallback: candFields }), g.fieldFormatters);
      speech = `${prefix}: ${one || label}. ${S.correct}`;
    } else {
      const fields = disambig.selectVoiceFields(disambig.computeDistinguishingFields(all, candFields), { fallback: ['name'] });
      speech = disambig.buildDisambiguationSpeech(all, fields, g, { numberWords: voiceStrings(lang).numberWords });
    }
    return {
      response,
      speech,
      responseType: 'confirm_or_choose',
      // Legacy contract (deprecated over v2.1→v2.2) + the new controls[] (I-3),
      // dual-emitted from the SAME decision so they can't disagree.
      resolveChoices: { slotId: slotDef.slotId, default: defaultValue, alternatives: alternatives || [], allowSearch: isUser },
      controls: buildConfirmControl(slotDef, defaultValue, alternatives, { label: response, allowSearch: isUser }),
      waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: slotDef.slotId,
    };
  }

  // ── low-confidence service disambiguation (I-2c) ───────────────────────────
  // Reserved slotId carrying a service-catalog pick (not a DraftSR slot); the
  // controlAction reply to a disambiguation names the chosen serviceId here.
  const SERVICE_SLOT = '__service__';
  // SERVICE_HELP branch: the user picks a service to get a REFERENCE on (not to
  // start filling), and a start-request button on the help card.
  const SERVICE_HELP_SLOT = '__service_help__';
  const SERVICE_HELP_START_SLOT = '__service_help_start__';
  // Action-intent clarification (fill vs learn) and the large-form pre-check.
  const INTENT_CHOICE_SLOT = '__intent_choice__';
  const LARGE_FORM_SLOT = '__large_form__';
  // Above this many actual form fields (excluding the platform context slots the
  // engine injects), a service is "large" and the user is offered the wizard.
  const LARGE_FORM_THRESHOLD = 14;
  const INJECTED_CONTEXT_IDS = new Set(['beneficiary', 'location', 'author', 'description']);
  /** Count the service's OWN form fields (excludes injected beneficiary/location/author/description). */
  function formFieldCount(snapshot) {
    return (snapshot.slots || []).filter((s) => !INJECTED_CONTEXT_IDS.has(s.slotId)).length;
  }

  /**
   * Addition 1 — the action intent is unclear: the user named a service but did not
   * signal whether they want to raise it now or just learn about it. Offer both.
   */
  function buildIntentAsk(serviceId, title, trace, lang) {
    const S = uiStrings(lang);
    return {
      response: fmt(S.intentAsk, { title }),
      responseType: 'intent_choice',
      controls: [{
        id: 'ctrl-intent-choice', type: 'choice', slotId: INTENT_CHOICE_SLOT,
        options: [
          { value: `fill:${serviceId}`, label: S.intentFill },
          { value: `info:${serviceId}`, label: S.intentInfo },
        ],
      }],
      serviceId, waiting: true, isComplete: false, route: 'intent_choice', trace,
    };
  }

  /**
   * Addition 2 — a large form (> threshold fields) with intent to fill: warn that
   * the form is long and offer the wizard, the assistant, or a field reference.
   */
  function buildLargeFormAsk(serviceId, snapshot, count, trace, lang) {
    const S = uiStrings(lang);
    return {
      response: fmt(S.largeForm, { title: snapshot.metadata.title, count: String(count) }),
      responseType: 'large_form_choice',
      controls: [{
        id: 'ctrl-large-form', type: 'choice', slotId: LARGE_FORM_SLOT,
        options: [
          { value: `wizard:${serviceId}`, label: S.largeFormWizard },
          { value: `assistant:${serviceId}`, label: S.largeFormAssistant },
          { value: `info:${serviceId}`, label: S.largeFormInfo },
        ],
      }],
      serviceId, waiting: true, isComplete: false, route: 'large_form_choice', trace,
    };
  }

  /**
   * Start a service's intake in chat. When `gate` is set and the form is large,
   * the user is first offered the wizard (Addition 2) instead of being walked
   * through 20+ questions. Otherwise a draft is created and the fill loop runs.
   */
  async function startService(sessionId, serviceId, snap, { message = '', beneficiary, userId, intake = true, gate = false }, trace, emit, lang) {
    if (gate && formFieldCount(snap) > LARGE_FORM_THRESHOLD) {
      return buildLargeFormAsk(serviceId, snap, formFieldCount(snap), trace, lang);
    }
    const d = await draftService.create(sessionId, serviceId, snap.version, beneficiary, userId);
    return fillLoop(sessionId, message, d, snap, trace, 'NEW_INTENT', emit, lang, intake);
  }

  /**
   * Decide whether a resolved intent is too ambiguous to auto-pick. Casual
   * phrasings land in tight sibling clusters (marriage/divorce/dependency) that the
   * embedding model conflates (I-2b finding): the right service is usually a
   * near-tie ALTERNATIVE, so guessing the top is often wrong. Instead we disambiguate.
   * Confident = the same medium/high bands semantic-search uses; anything resolvable
   * but below that, with a rival within reach, is disambiguated.
   */
  function shouldDisambiguate(serviceHits) {
    if (!serviceHits || serviceHits.length < 2) return false;
    const top = serviceHits[0];
    const s = typeof top.score === 'number' ? top.score : null;
    if (s == null || s < 0.55) return false; // unresolved / no score → leave to normal flow
    const second = serviceHits[1];
    const gap = typeof second.score === 'number' ? s - second.score : null;
    const confident = (s >= 0.85 && gap != null && gap >= 0.15) || (s >= 0.70 && gap != null && gap >= 0.10);
    return !confident; // resolvable but not confident, with a rival → ask which one
  }

  // VF2-003: the disambiguation/resolver phrasing set — overridable from the Prompt
  // Editor graph (deps.disambiguationGuidance), else the localized defaults. Kept a
  // seam so the enumeration CONTENT stays deterministic (interpreter code) while its
  // WORDING is tunable per PO's "author these rules via /flowdesk-admin/prompt".
  function disambiguationGuidance(lang) {
    try { const g = deps.disambiguationGuidance && deps.disambiguationGuidance(lang); if (g) return g; }
    catch { /* fall back to defaults */ }
    return disambig.defaultGuidance(lang);
  }

  /** Emit a `choice` control over the top service candidates (dual-emit legacy choices). */
  function buildDisambiguation(candidates, trace, lang = 'en') {
    const A = uiStrings(lang).agent;
    const top3 = candidates.slice(0, 3);
    // VF-2: enumerated voice speech — announce the count, then read each candidate
    // with only its distinguishing attributes so a voice user can pick.
    const opts = top3.map(disambig.flatService);
    const fields = disambig.selectVoiceFields(
      disambig.computeDistinguishingFields(opts, disambig.SERVICE_CANDIDATE_FIELDS), { fallback: ['name'] });
    const speech = disambig.buildDisambiguationSpeech(
      opts, fields, disambiguationGuidance(lang), { numberWords: voiceStrings(lang).numberWords });
    return {
      response: A.disambiguate,
      speech,
      responseType: 'disambiguation',
      controls: [{
        id: 'ctrl-serviceDisambiguation',
        type: 'choice',
        slotId: SERVICE_SLOT,
        label: A.pickService,
        options: top3.map((c) => ({ value: c.serviceId, label: c.title, ...(c.domain ? { description: c.domain } : {}) })),
      }],
      choices: top3.map((c) => c.title),
      waiting: true, isComplete: false, route: 'DISAMBIGUATE', trace,
    };
  }

  /**
   * CODE-004 exit: the same candidates were already rejected once. Say so, and
   * offer the two routes that actually exist — browse the catalogue, or rephrase.
   *
   * Deliberately does NOT offer to hand over to a human: there is no ESCALATE
   * route in ROUTER_SCHEMA and draftService.escalate() requires a draft that does
   * not exist yet at this point, so the offer could not be honoured. Promising an
   * escalation the system cannot perform is the CODE-003 defect found in the
   * transcripts, and repeating it here would trade one broken promise for another.
   */
  function buildDisambiguationExhausted(candidates, trace, lang = 'en') {
    const A = uiStrings(lang).agent;
    const top3 = (candidates || []).slice(0, 3);
    return {
      response: A.disambiguateExhausted,
      speech: A.disambiguateExhausted,
      responseType: 'disambiguation_exhausted',
      // The candidates stay selectable — the user may still recognise one — but
      // they are no longer the whole answer.
      controls: [{
        id: 'ctrl-serviceDisambiguationRetry',
        type: 'choice',
        slotId: SERVICE_SLOT,
        label: A.pickService,
        options: top3.map((c) => ({ value: c.serviceId, label: c.title, ...(c.domain ? { description: c.domain } : {}) })),
      }],
      choices: top3.map((c) => c.title),
      waiting: true, isComplete: false, route: 'DISAMBIGUATE', trace,
    };
  }

  // ── SERVICE_HELP: catalog reference for a service ──────────────────────────
  // A new text branch: answer "what is the X service / what does it ask?" with a
  // formatted reference (description + field list grouped by section) and a button
  // to start raising the request in chat. Service resolution reuses RESOLVE +
  // the disambiguation choice control (SERVICE_HELP_SLOT), so picking-or-confirming
  // uses the SAME mechanism as intake.

  /** Formatted, user-facing reference for a service: intro + fields grouped by section. */
  function buildServiceHelpText(snapshot, lang) {
    const S = uiStrings(lang);
    const H = S.serviceHelp;
    const lines = [fmt(H.intro, { title: snapshot.metadata.title }), '', `**${H.fields}:**`];
    const order = [];
    const bySection = new Map();
    for (const s of snapshot.slots || []) {
      const section = s.section || '__general__';
      if (!bySection.has(section)) {
        bySection.set(section, { label: s.sectionLabel || (section === '__general__' ? null : humanizeSection(section)), rows: [] });
        order.push(section);
      }
      bySection.get(section).rows.push(s);
    }
    for (const section of order) {
      const g = bySection.get(section);
      if (g.label) lines.push('', `_${g.label}_`);
      for (const s of g.rows) {
        const optional = s.required ? '' : ` ${S.optionalMark}`;
        const help = s.helpText ? ` — ${String(s.helpText).trim()}` : '';
        const opts = Array.isArray(s.presentOptions) && s.presentOptions.length
          ? ` (${s.presentOptions.slice(0, 10).map((o) => o.label).filter(Boolean).join(', ')})`
          : '';
        lines.push(`• ${s.promptHint || s.slotId}${optional}${help}${opts}`);
      }
    }
    return lines.join('\n');
  }

  /** The help card for one service + a "raise this request" start button. */
  async function buildServiceHelpTurn(serviceId, title, trace, lang) {
    const snapshot = await loadEffective(serviceId);
    const S = uiStrings(lang);
    if (!snapshot) {
      return { response: `I found a matching service (${title || serviceId}) but its details are not available yet.`, waiting: true, isComplete: false, route: 'SERVICE_HELP', trace };
    }
    const body = buildServiceHelpText(snapshot, lang);
    return {
      response: `${body}\n\n${S.serviceHelp.startPrompt}`,
      responseType: 'service_help',
      controls: [{
        id: 'ctrl-serviceHelpStart',
        type: 'choice',
        slotId: SERVICE_HELP_START_SLOT,
        label: S.serviceHelp.start,
        options: [{ value: serviceId, label: S.serviceHelp.start }],
      }],
      choices: [S.serviceHelp.start],
      serviceId,
      waiting: true, isComplete: false, route: 'SERVICE_HELP', trace,
    };
  }

  /** Confirm-or-choose the service to give a reference on (reuses the choice control). */
  function buildServiceHelpPick(candidates, trace, lang) {
    const S = uiStrings(lang);
    const top3 = candidates.slice(0, 3);
    const single = top3.length === 1;
    return {
      response: single ? fmt(S.serviceHelp.confirm, { title: top3[0].title }) : S.serviceHelp.pick,
      responseType: 'service_help_pick',
      controls: [{
        id: 'ctrl-serviceHelpPick',
        type: 'choice',
        slotId: SERVICE_HELP_SLOT,
        label: S.serviceHelp.pick,
        options: top3.map((c) => ({ value: c.serviceId, label: c.title, ...(c.domain ? { description: c.domain } : {}) })),
      }],
      choices: top3.map((c) => c.title),
      waiting: true, isComplete: false, route: 'SERVICE_HELP', trace,
    };
  }

  /**
   * CATALOG_SEARCH results: the services a topical query matched. Presents up to 6 as
   * a choice control; picking one reuses SERVICE_HELP_SLOT → buildIntentAsk (the user
   * then chooses to raise the request or get a reference).
   */
  function buildServiceSearchResults(candidates, trace, lang) {
    const S = uiStrings(lang);
    const top = candidates.slice(0, 6);
    return {
      response: S.catalogSearch.results,
      responseType: 'catalog_search',
      controls: [{
        id: 'ctrl-catalog-search',
        type: 'choice',
        slotId: SERVICE_HELP_SLOT,
        label: S.catalogSearch.pick,
        options: top.map((c) => ({ value: c.serviceId, label: c.title, ...(c.domain ? { description: c.domain } : {}) })),
      }],
      choices: top.map((c) => c.title),
      waiting: true, isComplete: false, route: 'CATALOG_SEARCH', trace,
    };
  }

  // Lookahead boundary (\b is ASCII-only → fails after Cyrillic "да").
  const AFFIRM_RE = /^(да|ага|верно|yes|yep|yeah|ок|окей|подтверждаю|правильно|confirm|correct|oui|sí|si|نعم|是)(?=$|[\s.,!?])/i;
  const isAffirmative = (m) => AFFIRM_RE.test(String(m || '').trim());
  const NEGATE_RE = /(?<![\p{L}])(нет|не|no|nope|nah|non|لا|不|否)(?![\p{L}])/iu;
  const isNegative = (m) => NEGATE_RE.test(String(m || '').trim());
  const fmt = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  const resumeRef = (draft) => draft.srNumber || `DRAFT-${String(draft.sessionId).slice(0, 8)}`;

  /** Apply a structured choice (F9.1d). Returns {draft} or {reask}. */
  async function handleChoice(sessionId, draft, snapshot, choice, emit, lang = 'ru') {
    const { slotId, action, value } = choice;
    const slotDef = snapshot.slots.find((s) => s.slotId === slotId);
    if (!slotDef) return { draft };

    if (action === 'confirm') {
      const v = value !== undefined && value !== null ? value : draft.slots[slotId]?.value;
      return { draft: await runNode(emit, 'PATCH', () => draftService.patch(sessionId, [{ op: 'set', slotId, value: v, provenance: 'resolved', pending: false }])) };
    }
    if (action === 'select') {
      return { draft: await draftService.patch(sessionId, [{ op: 'set', slotId, value, provenance: 'user_edited', pending: false }]) };
    }
    if (action === 'search') {
      const resolveDraft = { slots: { ...draft.slots, [slotId]: { ...(draft.slots[slotId] || {}), hint: { query: value } } } };
      const resolved = await runNode(emit, 'RESOLVERS', () => runResolverForSlot(slotDef, resolveDraft, directory));
      if (resolved && resolved.defaultValue) {
        const d = await draftService.patch(sessionId, [{ op: 'set', slotId, value: resolved.defaultValue, provenance: 'resolved', pending: true }]);
        return { reask: confirmOrChoose(slotDef, resolved.defaultValue, resolved.alternatives, d, 'SLOT_FILL', lang) };
      }
      return { reask: { response: `Не нашёл «${value}». Уточните имя или email.`, waiting: true, isComplete: false, draft, route: 'SLOT_FILL', askingSlot: slotId } };
    }
    return { draft };
  }

  /**
   * Hand control to Altiora's form: carry everything gathered across as prefill and
   * stop. `openForm` rides the turn like `navigate` does — the host decides how to
   * present it (the wizard opens as a modal). The draft is deliberately left intact:
   * if the user cancels in the form, the conversation still has its state.
   */
  /**
   * The form reported a created request. Assisted filling is over: the draft is
   * discarded (it would otherwise be resumed as unfinished work), the user is pointed
   * at the request, and the assistant offers what it can do next.
   *
   * The request number is deliberately not quoted — the host does not surface it and
   * inventing or re-querying one would risk showing the wrong request.
   */
  async function requestCreatedTurn(sessionId, lang, userContext) {
    const S = uiStrings(lang);
    try { await draftService.discard?.(sessionId); } catch { /* the draft is moot either way */ }
    let canApprove = false;
    const actCheck = deps.isActAuthorized || ((u) => require('../services/act-authorization').isActAuthorized(u));
    try { canApprove = await actCheck(userContext); } catch { /* fail closed: no approvals offered */ }
    const text = `${S.requestCreated.replace('{link}', PORTAL_REQUESTS_URL)}\n\n${S.anythingElse}`;
    return {
      response: text,
      speech: `${S.requestCreated.replace('{link}', '')} ${S.anythingElse}`,
      responseType: 'request_created',
      controls: postSubmitServices(S, canApprove),
      waiting: true, isComplete: true, route: 'REQUEST_CREATED',
    };
  }

  async function openFormTurn(draft, snapshot, lang, routeLabel) {
    const S = uiStrings(lang);
    // Dictionary rows the form would otherwise fetch on mount. Best-effort and budgeted:
    // it must never delay the hand-off, and its absence just restores today's behaviour.
    let hydration = null;
    try {
      hydration = await buildFormHydration(draft, snapshot, { fetchLovValues });
    } catch (err) {
      console.warn(`[chat-v2] form hydration skipped: ${err && err.message}`);
    }
    const openForm = {
      serviceId: snapshot.serviceId,
      ousId: snapshot.metadata && snapshot.metadata.altioraOusId,
      prefill: draftToInitialFormData(draft, snapshot),
    };
    if (hydration) openForm.hydration = hydration;
    return {
      response: S.fillingComplete,
      speech: S.fillingComplete,
      responseType: 'open_form',
      openForm,
      waiting: true, isComplete: false, draft, route: routeLabel,
    };
  }

  /**
   * P1-12 — resolve the cascade cluster that the just-filled slot unlocked, and offer
   * the whole set as ONE review. Returns a turn result, or null to fall through to the
   * ordinary question (nothing resolved / lookup unavailable / user declined earlier).
   *
   * Ambiguity and emptiness deliberately do NOT block: a slot the dictionary cannot pin
   * down is simply asked for by hand, which is what Altiora's manual-search fallback
   * amounts to.
   */
  async function cascadeOffer(sessionId, draft, snapshot, routeLabel, lang) {
    const declined = declinedSet(sessionId);
    const cluster = (await resolveCascadeCluster(snapshot, draft, { fetchLovValues }))
      .filter(({ slot }) => !declined.has(slot.slotId));
    const resolved = cluster.filter(({ result }) => result.status === 'resolved');
    if (!resolved.length) return null;

    const S = uiStrings(lang);
    const fields = resolved.map(({ slot, result }) => ({
      slotId: slot.slotId,
      label: slot.promptHint || slot.slotId,
      display: result.display,
    }));
    const lines = fields.map((f) => `• ${f.label}: ${f.display}`).join('\n');
    const response = `${S.cascadeReview}\n${lines}\n${S.cascadeAsk}`;
    return {
      response,
      responseType: 'cascade_confirm',
      // No label: `response` already opens with the same review line.
      controls: buildCascadeConfirmControl(fields),
      waiting: true,
      isComplete: false,
      draft,
      route: routeLabel,
      askingSlot: fields[0].slotId,
    };
  }

  /**
   * Accept a cascade cluster: RE-RESOLVE from the dictionary and patch. The values the
   * client echoed back are never trusted — they are display data, and a form value that
   * decides someone's grade or duty station must come from the dictionary itself.
   */
  async function acceptCascade(sessionId, draft, snapshot, emit, lang) {
    const declined = declinedSet(sessionId);
    const cluster = (await resolveCascadeCluster(snapshot, draft, { fetchLovValues }))
      .filter(({ slot }) => !declined.has(slot.slotId));
    const patches = cluster
      .filter(({ result }) => result.status === 'resolved')
      .map(({ slot, result }) => ({ op: 'set', slotId: slot.slotId, value: result.value, provenance: 'resolved', pending: false }));
    if (!patches.length) return { draft };
    assertToolAllowed('PATCH', 'draft.patch');
    return { draft: await runNode(emit, 'PATCH', () => draftService.patch(sessionId, patches)) };
  }

  /**
   * Apply a `controlAction` (I-3) — the controls[] reply. Same deterministic path as
   * a legacy `choice`; the two contracts converge here so behavior can't diverge.
   * `submit` (an autocomplete pick) is a `select`; confirm/select/search pass through.
   */
  async function handleControlAction(sessionId, draft, snapshot, controlAction, emit, lang = 'ru') {
    // date_select (TASK-PROMPT-001): a date-picker commit. Validate the ISO value on the
    // server BEFORE it reaches the draft — an invalid/absent date re-asks the slot rather
    // than persisting garbage, so the picker (not the LLM) remains the source of truth.
    if (controlAction.action === 'date_select') {
      if (!isIsoDate(controlAction.value)) {
        const S = uiStrings(lang);
        return { reask: { response: S.dateInvalid || S.didntCatch, waiting: true, isComplete: false, draft, route: 'SLOT_FILL', askingSlot: controlAction.slotId } };
      }
      return handleChoice(sessionId, draft, snapshot, { slotId: controlAction.slotId, action: 'select', value: controlAction.value }, emit, lang);
    }
    // multichoice_select (P1-13): the chosen SET for a multi enum. Validated against
    // the slot's option domain here — the same fail-closed treatment a single choice
    // gets — then stored as an array via the ordinary select path.
    if (controlAction.action === 'multichoice_select') {
      const slotDef = snapshot.slots.find((s) => s.slotId === controlAction.slotId);
      const picked = Array.isArray(controlAction.values) ? controlAction.values
        : (Array.isArray(controlAction.value) ? controlAction.value : null);
      const allowed = ((slotDef && slotDef.presentOptions) || []).map((o) => o.value);
      const invalid = picked ? picked.filter((x) => !allowed.includes(x)) : null;
      if (!picked || picked.length === 0 || (invalid && invalid.length)) {
        const S = uiStrings(lang);
        return { reask: { response: S.didntCatch, waiting: true, isComplete: false, draft, route: 'SLOT_FILL', askingSlot: controlAction.slotId } };
      }
      return handleChoice(sessionId, draft, snapshot, { slotId: controlAction.slotId, action: 'select', value: picked }, emit, lang);
    }
    // Hand-off gate clicked. `open` is the same decision as a spoken "yes"; `stay`
    // leaves the draft alone and simply continues the conversation.
    if (controlAction.slotId === '__open_form__') {
      await draftService.clearPendingAction?.(sessionId);
      const S = uiStrings(lang);
      return controlAction.value === 'open'
        ? { reask: await openFormTurn(draft, snapshot, lang, 'confirm_form') }
        : { reask: { response: S.stayInChat, speech: S.stayInChat, waiting: true, isComplete: false, draft, route: 'confirm_form' } };
    }

    // "Skip" on an optional field. Required fields are never skippable — the request
    // cannot be raised without them — so the request is refused with the reason.
    if (controlAction.slotId === '__skip__') {
      const target = (snapshot.slots || []).find((s) => s.slotId === controlAction.value);
      const S = uiStrings(lang);
      if (target && isRequiredNow(target, trefContext(draft, snapshot))) {
        return { reask: { response: S.skipRequired, waiting: true, isComplete: false, draft, route: 'SLOT_FILL', askingSlot: target.slotId } };
      }
      if (target) skippedSet(sessionId).add(target.slotId);
      // Skipping abandons whatever ask was open (e.g. the sharedWith share_collect gate),
      // so clear any pending action to avoid it firing on the next message.
      const cleared = await draftService.clearPendingAction?.(sessionId);
      return { draft: cleared || draft };
    }

    // P1-12 cascade review. Accept → re-resolve server-side and patch the cluster.
    // Edit → remember the refusal for this session so the same offer is not repeated,
    // and let the ordinary questions run.
    if (controlAction.action === 'cascade_accept') {
      return acceptCascade(sessionId, draft, snapshot, emit, lang);
    }
    if (controlAction.action === 'cascade_edit') {
      const declined = declinedSet(sessionId);
      for (const s of snapshot.slots || []) if (s.dictRef) declined.add(s.slotId);
      return { draft };
    }

    // Review edit button (final confirm-form): the user clicked ✎ on a field. Steer
    // the next turn onto that slot and ask what to set it to; the new value replaces
    // it, and the existing cascade-edit gate warns if it has filled dependents.
    // Reference-derived values (directory/dictionary/LOV) are not edited directly.
    if (controlAction.action === 'edit' && controlAction.slotId) {
      const S = uiStrings(lang);
      const slot = (snapshot.slots || []).find((s) => s.slotId === controlAction.slotId);
      if (!slot) {
        return { reask: { response: S.didntCatch, waiting: true, isComplete: false, draft, route: 'CONFIRM_EDIT' } };
      }
      if (isReferenceDerived(slot)) {
        return { reask: { response: fmt(S.editNotDirect, { field: slot.promptHint || slot.slotId }), responseType: 'edit_which_value', waiting: true, isComplete: false, draft, route: 'CONFIRM_EDIT' } };
      }
      const deps = filledDependentsOf(snapshot, draft, slot.slotId);
      const note = deps.length ? `${fmt(S.cascadeEditNote, { deps: deps.map((d) => d.promptHint || d.slotId).join(', ') })} ` : '';
      const qtext = `${note}${fmt(S.editWhichValue, { field: slot.promptHint || slot.slotId })}`;
      await draftService.syncTopSequence?.(sessionId, slot.slotId);
      await draftService.clearPendingAction?.(sessionId);
      await draftService.setLastQuestion?.(sessionId, qtext);
      return { reask: { response: qtext, responseType: 'edit_which_value', waiting: true, isComplete: false, draft, route: 'CONFIRM_EDIT', askingSlot: slot.slotId } };
    }

    // Free-input commits (TASK-003/004). They carry a raw value, so each is coerced to
    // the slot's type and sanity-checked here — the client is never trusted — then
    // stored through the ordinary select path.
    if (controlAction.action === 'text_input' || controlAction.action === 'number_input' || controlAction.action === 'toggle_input') {
      const S = uiStrings(lang);
      const reask = () => ({ reask: { response: S.didntCatch, waiting: true, isComplete: false, draft, route: 'SLOT_FILL', askingSlot: controlAction.slotId } });
      let v = controlAction.value;
      if (controlAction.action === 'number_input') {
        const n = typeof v === 'number' ? v : Number(String(v).trim());
        if (!Number.isFinite(n)) return reask();
        v = n;
      } else if (controlAction.action === 'toggle_input') {
        v = v === true || v === 'true' || v === 1 || v === '1';
      } else {
        if (typeof v !== 'string' || !v.trim()) return reask();
        v = v.trim();
      }
      return handleChoice(sessionId, draft, snapshot, { slotId: controlAction.slotId, action: 'select', value: v }, emit, lang);
    }
    const act = controlAction.action === 'submit' ? 'select' : controlAction.action;
    return handleChoice(sessionId, draft, snapshot, { slotId: controlAction.slotId, action: act, value: controlAction.value }, emit, lang);
  }

  // ── REPAIR_ROUTER application (F10b) ───────────────────────────────────────
  // Turn a deterministic interpretation (repair-router.interpret) into a turn
  // result, WITHOUT ever re-routing to a new intent. Returns a result object, or
  // null to fall through to the LLM router.
  async function applyRepairDecision(sessionId, draft, snapshot, decision, emit, lang, message, trace) {
    const S = uiStrings(lang);
    const { kind, slotId } = decision;

    if (kind === 'UNIVERSAL_ACTION') {
      return applyUniversalAction(sessionId, draft, snapshot, decision.action, slotId, emit, lang, trace);
    }

    if (kind === 'ANSWER') {
      assertToolAllowed('PATCH', 'draft.patch');
      trace.push('PATCH');
      const patched = await runNode(emit, 'PATCH', () =>
        draftService.patch(sessionId, [{ op: 'set', slotId, value: decision.value, provenance: 'user_edited', pending: false }]));
      // Successful understanding → clear this slot's repair counter (ADCC-086).
      await draftService.resetSlotRepair?.(sessionId, slotId);
      return advance(sessionId, patched, snapshot, trace, 'SLOT_FILL', emit, lang);
    }

    if (kind === 'ANSWER_REJECT') {
      // Enum miss (ADCC-082/085/086): climb the repair ladder, never re-route.
      trace.push('REPAIR_LADDER');
      const rr = await draftService.recordRepair(sessionId, slotId);
      const cur = rr.draft || draft;
      // Ladder rung 4 — session threshold crossed → offer a human (ADCC-086).
      if (rr.step >= 4) {
        await draftService.setPendingAction(sessionId, { type: 'offer_handoff', slotId });
        return { response: S.handoffOffer, responseType: 'offer_handoff', waiting: true, isComplete: false, draft: cur, route: 'SLOT_FILL', askingSlot: slotId };
      }
      const r = await advance(sessionId, cur, snapshot, trace, 'SLOT_FILL', emit, lang);
      const parts = [S.didntCatch];
      if (rr.perSlot >= 2) parts.push(S.optionsHint); // rung 2 — present options (advance supplies choices)
      let out = { ...r, response: `${parts.join(' ')}\n\n${r.response}` };
      if (rr.perSlot >= 3) { // rung 3 — offer skip / park (informational; explicit "skip" blocks)
        out = { ...out, response: `${out.response}\n\n${S.skipOffer}`, ladder: 'OFFER_SKIP_OR_PARK' };
      }
      return out;
    }

    if (kind === 'REPAIR_MARKER') {
      // Corrections run the normal extraction fill-loop (re-extraction), bypassing
      // the LLM router.
      return fillLoop(sessionId, message, draft, snapshot, trace, 'CONFIRM_EDIT', emit, lang);
    }

    return null;
  }

  // ── Universal actions (F10c / ADCC-096, ADCC-097, ADCC-098) ────────────────
  async function applyUniversalAction(sessionId, draft, snapshot, action, slotId, emit, lang, trace) {
    const S = uiStrings(lang);
    trace.push(`UNIVERSAL:${action}`);

    if (action === 'repeat') {
      // Re-issue the last question VERBATIM (ADCC-096).
      if (draft.lastAgentQuestion) {
        return { response: draft.lastAgentQuestion, waiting: true, isComplete: false, draft, route: 'UNIVERSAL_ACTION', askingSlot: slotId, universalAction: 'repeat' };
      }
      const r = await advance(sessionId, draft, snapshot, trace, 'UNIVERSAL_ACTION', emit, lang);
      return { ...r, universalAction: 'repeat' };
    }

    if (action === 'rephrase') {
      // Re-plan the pending question → fresh phrasing from the LLM (ADCC-096).
      const r = await advance(sessionId, draft, snapshot, trace, 'UNIVERSAL_ACTION', emit, lang);
      return { ...r, universalAction: 'rephrase' };
    }

    if (action === 'capabilities') {
      // List the services the user can request (ADCC-096), then bridge back.
      let services = [];
      try { services = await listServices(); } catch { /* best-effort */ }
      const titles = (services || []).map((s) => `• ${s.title || s.serviceId}`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 12);
      const list = titles.length ? `${S.capabilitiesList}\n${titles.join('\n')}` : S.capabilities;
      const r = await advance(sessionId, draft, snapshot, trace, 'UNIVERSAL_ACTION', emit, lang);
      return { ...r, response: `${list}\n\n${r.response}`, universalAction: 'capabilities' };
    }

    if (action === 'skip') {
      // ADCC-097. Skip on a REQUIRED slot → explain + offer park/cancel/provide.
      const slotDef = snapshot.slots.find((s) => s.slotId === slotId);
      const ctx = trefContext(draft, snapshot);
      const requiredNow = slotDef && slotDef.required && evalTref(slotDef.trefCondition, ctx);
      if (requiredNow) {
        await draftService.setPendingAction(sessionId, { type: 'skip_offer', slotId });
        return { response: S.skipOffer, responseType: 'explain_then_offer', choices: ['provide', 'park', 'cancel'],
          waiting: true, isComplete: false, draft, route: 'UNIVERSAL_ACTION', askingSlot: slotId, universalAction: 'skip' };
      }
      // Optional slot → skip it (record provenance) and move on.
      const patched = await draftService.patch(sessionId, [{ op: 'set', slotId, value: null, provenance: 'context' }]);
      await draftService.closeSequence?.(sessionId);
      return advance(sessionId, patched, snapshot, trace, 'UNIVERSAL_ACTION', emit, lang);
    }

    if (action === 'cancel') {
      // ADCC-098: confirm before cancelling; the draft is parked, never destroyed.
      await draftService.setPendingAction(sessionId, { type: 'confirm_cancel', slotId });
      return { response: S.cancelConfirm, responseType: 'confirm_cancel', waiting: true, isComplete: false, draft, route: 'UNIVERSAL_ACTION', askingSlot: slotId, universalAction: 'cancel' };
    }

    if (action === 'restart') {
      await draftService.setPendingAction(sessionId, { type: 'confirm_restart', slotId });
      return { response: S.restartConfirm, responseType: 'confirm_restart', waiting: true, isComplete: false, draft, route: 'UNIVERSAL_ACTION', askingSlot: slotId, universalAction: 'restart' };
    }

    return advance(sessionId, draft, snapshot, trace, 'UNIVERSAL_ACTION', emit, lang);
  }

  // ── Pending-action resolution (F10c) — yes/no over cancel/restart/skip/handoff ─
  /**
   * Execute the SUBMIT action (P9-002). Shared by the deterministic
   * `confirm_submit` gate and the legacy CONFIRM_YES route. The submit itself is
   * idempotent (P9-001 double-submit guard in draft-sr.submit).
   */
  async function runSubmit(sessionId, lang, emit, trace, routeLabel) {
    assertToolAllowed('SUBMIT', 'draft.submit');
    trace.push('SUBMIT');
    const res = await runNode(emit, 'SUBMIT', () => draftService.submit(sessionId));
    const audit = (status, extra) => logAction(Object.assign({
      sessionId, actionType: 'SUBMIT_SR', confirmationShown: true, confirmationAccepted: true,
      motivation: 'User confirmed submission of the assembled service request.',
    }, extra, { status })).catch(() => {});
    if (res.error) {
      // P9-005 (Layer 2): a real Altiora write was refused by ACT authorization.
      if (res.error.code === 'ACT_DENIED') {
        await audit('DENIED', { error: res.error.reason });
        return { response: uiStrings(lang).agent.actNotAuthorized, waiting: true, isComplete: false, route: routeLabel, trace };
      }
      return { response: `I can't submit yet — still missing: ${(res.error.missing || []).join(', ')}.`, waiting: true, isComplete: false, route: routeLabel, trace };
    }
    await audit('EXECUTED', { srNumber: res.srNumber, ticketId: res.ticketId || null, targetLabel: 'ServiceRequest', targetId: res.srNumber, actionParams: { altiora: !!res.altiora } });
    // ADCC-091: explicit sequence closure — the final outcome stated verbatim.
    // ticketId rides along when the submit created a real Altiora ticket (I-7).
    return { response: fmt(uiStrings(lang).submitted, { ref: res.srNumber }), srNumber: res.srNumber, ticketId: res.ticketId || null, closer: res.srNumber, isComplete: true, waiting: false, route: routeLabel, trace };
  }

  async function resolvePendingAction(sessionId, draft, snapshot, message, emit, lang, trace) {
    const S = uiStrings(lang);
    const pa = draft.pendingAction;
    trace.push(`PENDING:${pa.type}`);
    const yes = isAffirmative(message);
    const no = isNegative(message);
    const m = String(message || '').toLowerCase();

    // P9-002: deterministic submit gate. The submit confirmation is resolved by
    // the multilingual affirm/negate matchers BEFORE the LLM router — governance
    // actions must never depend on LLM classification. Unclear reply → clear the
    // gate and let the message route normally (return null falls through).
    if (pa.type === 'confirm_submit') {
      if (yes) {
        await draftService.clearPendingAction(sessionId);
        return runSubmit(sessionId, lang, emit, trace, 'CONFIRM_YES');
      }
      if (no) {
        const d2 = await draftService.clearPendingAction(sessionId);
        return { response: S.submitCancelled, waiting: true, isComplete: false, draft: d2, route: 'confirm_submit' };
      }
      await draftService.clearPendingAction(sessionId);
      return null;
    }

    // The hand-off gate. "Yes" gives the form everything gathered so far and ends
    // assisted filling; "no" costs nothing — the draft is untouched and the user simply
    // keeps talking, and can ask for the form again whenever they are ready.
    if (pa.type === 'confirm_form') {
      if (yes) {
        const d = await draftService.clearPendingAction(sessionId);
        return await openFormTurn(d || draft, snapshot, lang, 'confirm_form');
      }
      if (no) {
        const d2 = await draftService.clearPendingAction(sessionId);
        return { response: S.stayInChat, speech: S.stayInChat, waiting: true, isComplete: false, draft: d2, route: 'confirm_form' };
      }
      await draftService.clearPendingAction(sessionId);
      return null;
    }

    if (pa.type === 'confirm_cancel' || pa.type === 'confirm_restart') {
      if (yes) {
        const parked = await draftService.park(sessionId);
        // restart parks the current draft too; a fresh request starts on the next message.
        return { response: fmt(S.parked, { ref: resumeRef(parked) }), responseType: 'parked', parked: true, closer: 'PARKED',
          waiting: true, isComplete: false, draft: parked, route: pa.type };
      }
      if (no) {
        const d2 = await draftService.clearPendingAction(sessionId);
        const r = await advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
        return { ...r, response: `${S.resumed}\n\n${r.response}` };
      }
      return { response: pa.type === 'confirm_restart' ? S.restartConfirm : S.cancelConfirm, responseType: pa.type, waiting: true, isComplete: false, draft, route: pa.type };
    }

    // Cascade-edit confirmation: "yes" applies the new value AND resets the filled
    // dependents (dictRef autofills re-resolve when `advance` reaches them); "no"
    // leaves the source unchanged. Unclear reply clears the gate and routes normally.
    if (pa.type === 'confirm_cascade_edit') {
      if (yes) {
        const patches = [{ op: 'set', slotId: pa.slotId, value: pa.newValue, provenance: 'user_edited', pending: false }];
        for (const depId of pa.dependents || []) patches.push({ op: 'clear', slotId: depId, provenance: 'user_edited' });
        await draftService.patch(sessionId, patches);
        const d = await draftService.clearPendingAction(sessionId);
        return advance(sessionId, d, snapshot, trace, 'CONFIRM_EDIT', emit, lang);
      }
      if (no) {
        const target = snapshot.slots.find((s) => s.slotId === pa.slotId);
        const d2 = await draftService.clearPendingAction(sessionId);
        return { response: fmt(S.cascadeCancelled, { field: (target && (target.promptHint || target.slotId)) || pa.slotId }), responseType: 'confirm_cascade_edit', waiting: true, isComplete: false, draft: d2, route: 'confirm_cascade_edit' };
      }
      await draftService.clearPendingAction(sessionId);
      return null;
    }

    if (pa.type === 'offer_handoff') {
      if (yes) {
        const res = await draftService.escalate(sessionId, 'repair-threshold', null);
        return { response: fmt(S.handoffDone, { ref: res.escalationId }), escalationId: res.escalationId, closer: res.escalationId, isComplete: true, waiting: false, route: 'HANDOFF' };
      }
      if (no) {
        const d2 = await draftService.clearPendingAction(sessionId);
        return advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
      }
      return { response: S.handoffOffer, responseType: 'offer_handoff', waiting: true, isComplete: false, draft, route: 'offer_handoff' };
    }

    if (pa.type === 'skip_offer') {
      const wantsPark = /park|отлож|attente|aparcar|إيقاف|暂存/.test(m);
      const wantsCancel = /cancel|отмен|annuler|cancelar|إلغاء|取消/.test(m) || no;
      if (wantsPark || wantsCancel) {
        const parked = await draftService.park(sessionId);
        return { response: fmt(S.parked, { ref: resumeRef(parked) }), responseType: 'parked', parked: true, waiting: true, isComplete: false, draft: parked, route: 'skip_offer' };
      }
      // "provide" / anything else → clear the offer and treat the message as the answer.
      const d2 = await draftService.clearPendingAction(sessionId);
      return fillLoop(sessionId, message, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
    }

    // ADCC-084: mid-flow intent switch — user confirms swapping the request.
    if (pa.type === 'confirm_switch') {
      const wantsContinue = /continue|продолж|continuer|continuar|متابعة|继续/.test(m) || no;
      const wantsSwitch = (/switch|переключ|changer|cambiar|تبديل|切换/.test(m) || yes) && !wantsContinue;
      if (wantsSwitch) {
        // Park the current draft (archived for resume), then start the new one and
        // replay the utterance that proposed the switch.
        await draftService.parkArchive(sessionId);
        const newSnap = await loadEffective(pa.serviceId);
        const created = await draftService.create(sessionId, pa.serviceId, newSnap ? newSnap.version : 1, undefined, draft.userId);
        const r = await fillLoop(sessionId, pa.message || '', created, newSnap, trace, 'NEW_INTENT', emit, lang);
        return { ...r, switched: true };
      }
      // continue the current request
      const d2 = await draftService.clearPendingAction(sessionId);
      return advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
    }

    // F11f: directory temporarily unavailable → retry or accept manual entry.
    if (pa.type === 'directory_unavailable') {
      const wantsRetry = /retry|повтор|снова|réessay|reintent|إعادة|重试/.test(m) || yes;
      if (wantsRetry) {
        const d2 = await draftService.clearPendingAction(sessionId);
        return advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang); // re-resolve
      }
      // Manual entry: take the typed text as the slot value (mode:'manual'), so a
      // directory outage never blocks the request (ADCC-085).
      await draftService.patch(sessionId, [{ op: 'set', slotId: pa.slotId, value: { name: String(message || '').trim(), mode: 'manual' }, provenance: 'user_edited', pending: false }]);
      const d2 = await draftService.clearPendingAction(sessionId);
      const r = await advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
      return { ...r, manualEntry: true };
    }

    // ADCC-098: resume a parked draft on re-entry.
    if (pa.type === 'offer_resume') {
      const wantsNew = /new|нов|nouvelle|nueva|جديد|新建/.test(m) || no;
      const wantsResume = (/resume|продолж|continue|reprendre|retomar|متابعة|继续/.test(m) || yes) && !wantsNew;
      if (wantsResume) {
        const resumed = await draftService.unpark(sessionId);
        const r = await advance(sessionId, resumed, snapshot, trace, 'SLOT_FILL', emit, lang);
        return { ...r, response: `${S.resumed}\n\n${r.response}`, resumed: true };
      }
      // start fresh — discard the parked draft, next message is a new intent.
      await draftService.discard(sessionId);
      return { response: S.capabilities, waiting: true, isComplete: false, route: 'offer_resume' };
    }

    // sharedWith collection: the user has named colleagues to give read-only access.
    // Resolve each against the directory and store the set as the slot's array value.
    // A negative / "skip" / "no one" reply leaves it empty and moves on.
    if (pa.type === 'share_collect') {
      const skipish = no || /skip|пропуст|passer|omit|тхат|none|no one|nobody|никого|никто|personne|nadie|لا أحد|没有|无/i.test(m);
      if (skipish) {
        skippedSet(sessionId).add('sharedWith');
        const d2 = await draftService.clearPendingAction(sessionId);
        return advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
      }
      const names = String(message || '')
        .split(/,|;|\/|&|\bи\b|\band\b|\bet\b|\by\b/i)
        .map((x) => x.trim()).filter(Boolean);
      const resolved = [];
      for (const nm of names) {
        try {
          const matches = directory && directory.resolveUser ? await directory.resolveUser(nm) : [];
          if (matches && matches[0]) resolved.push(matches[0]);
        } catch { /* directory hiccup on one name → just skip that name */ }
      }
      if (!resolved.length) {
        // Nothing matched: re-ask, keeping the gate open, with a Skip out.
        return {
          response: S.shareNotFound, responseType: 'share_collect',
          controls: [{ id: 'ctrl-sharedWith-skip', type: 'choice', slotId: '__skip__', options: [{ value: 'sharedWith', label: S.skipLabel }] }],
          waiting: true, isComplete: false, draft, route: 'SLOT_FILL', askingSlot: 'sharedWith',
        };
      }
      await draftService.patch(sessionId, [{ op: 'set', slotId: 'sharedWith', value: resolved, provenance: 'resolved', pending: false }]);
      const d2 = await draftService.clearPendingAction(sessionId);
      return advance(sessionId, d2, snapshot, trace, 'SLOT_FILL', emit, lang);
    }

    return null;
  }

  // Keep the open-sequence stack in step with the produced result (F10b), and
  // store the last question verbatim for the 'repeat' action (F10c).
  async function syncStack(sessionId, result) {
    try {
      if (!result) return result;
      if (result.isComplete) { await draftService.clearSequences?.(sessionId); return result; }
      if (result.askingSlot) {
        await draftService.syncTopSequence?.(sessionId, result.askingSlot);
        if (result.response && !result.universalAction) await draftService.setLastQuestion?.(sessionId, result.response);
      }
    } catch { /* stack maintenance is best-effort */ }
    return result;
  }

  /** ADVANCE: choose next slot, resolve/confirm directory slots, or CONFIRM. */
  async function advance(sessionId, draft, snapshot, trace, routeLabel, emit, lang = 'ru') {
    // Carry-over: apply any values the user volunteered up front for PLAIN slots
    // that have since become tref-active. They were parked as a hint (value null)
    // by fillLoop. Reference-backed slots (directory / cascade dictionary / LOV) are
    // NOT applied here — their hint must be resolved against the reference below, so
    // a non-matching mention never becomes an unvalidated value; the slot is asked.
    const carryActive = new Set(activeSlotIds(draft, snapshot));
    const carrySets = [];
    for (const s of snapshot.slots) {
      if (s.resolverRef || s.dictRef || (s.lov && s.type !== 'enum') || !carryActive.has(s.slotId)) continue;
      const sv = draft.slots[s.slotId];
      const empty = !sv || sv.value === undefined || sv.value === null || sv.value === '';
      if (sv && empty && sv.hint != null && !sv.pending) {
        carrySets.push({ op: 'set', slotId: s.slotId, value: sv.hint, provenance: 'extracted' });
      }
    }
    if (carrySets.length) {
      const { good: carryGood } = validatePatches(carrySets, snapshot);
      if (carryGood.length) {
        assertToolAllowed('PATCH', 'draft.patch');
        draft = await draftService.patch(sessionId, carryGood);
        trace.push('CARRY_APPLY');
      }
    }

    // Every field is offered now, optional ones included, in the source form's order —
    // minus the optional ones the user has already declined this session.
    const skipped = skippedSet(sessionId);
    const remaining = activeAskableSlots(draft, snapshot).filter((s) => !skipped.has(s.slotId));
    trace.push('ACTIVE_SLOTS', 'RESOLVERS', 'TERM_CHECK');
    emit('node:done', { node: 'ACTIVE_SLOTS', status: 'success' });
    emit('node:done', { node: 'TERM_CHECK', status: 'success' });

    if (remaining.length === 0) {
      assertToolAllowed('CONFIRM', 'draft.get');
      trace.push('CONFIRM');
      emit('node:done', { node: 'CONFIRM', status: 'success' });
      // No slot question is open now — only the hand-off gate. Close the stack so the
      // next "yes" isn't mistaken for an answer to the last slot (F10b).
      await draftService.clearSequences?.(sessionId);
      // The gate no longer confirms SUBMISSION — it confirms handing control to
      // Altiora's form, which is a one-way door: the form is a modal whose only exits
      // are submit and cancel, so assisted filling genuinely ends there. Deterministic
      // (yes/no resolved without the LLM router), as the submit gate was.
      await draftService.setPendingAction?.(sessionId, { type: 'confirm_form' });
      const S = uiStrings(lang);
      const summary = draftSummary(draft, snapshot);
      // Structured, grouped review (labels + values + per-field editability) for a
      // tabular render; the prose summary is kept for voice and non-review clients.
      const review = buildReview(draft, snapshot);
      return {
        response: `${S.fillingComplete}\n${S.review.replace('{title}', snapshot.metadata.title)}\n${summary}\n\n${S.proceedToForm}`,
        // Voice has no form on screen, so it hears the same decision spoken.
        speech: `${S.fillingComplete} ${S.proceedToForm}`,
        responseType: 'confirm_form',
        review,
        controls: [{
          id: 'ctrl-open-form', type: 'choice', slotId: '__open_form__',
          options: [{ value: 'open', label: S.openFormLabel }, { value: 'stay', label: S.stayHereLabel }],
        }],
        waiting: true, isComplete: false, draft, route: routeLabel,
      };
    }

    const nextSlot = chooseNextSlot(remaining, draft, snapshot);
    const sv = draft.slots[nextSlot.slotId];

    // sharedWith is a MULTI-user field (an array of colleagues), so it cannot go through
    // the single-value confirm-or-choose path. Ask once, optionally, then resolve every
    // name the user gives in a dedicated `share_collect` turn. Optional → a Skip control.
    if (nextSlot.slotId === 'sharedWith') {
      const S0 = uiStrings(lang);
      await draftService.setPendingAction?.(sessionId, { type: 'share_collect' });
      trace.push('SHARE_COLLECT');
      return {
        response: S0.shareWith,
        speech: S0.shareWith,
        responseType: 'share_collect',
        controls: [{ id: 'ctrl-sharedWith-skip', type: 'choice', slotId: '__skip__', options: [{ value: 'sharedWith', label: S0.skipLabel }] }],
        waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: 'sharedWith',
      };
    }

    // Directory-backed slot → resolve + confirm-or-choose.
    if (nextSlot.resolverRef && directory) {
      if (sv && sv.pending && sv.value) {
        return confirmOrChoose(nextSlot, sv.value, sv.alternatives || [], draft, routeLabel, lang);
      }
      // Hint was persisted on the slot when the user first mentioned it.
      let resolved;
      try {
        resolved = await runNode(emit, 'RESOLVERS', () => runResolverForSlot({ ...nextSlot }, draft, directory));
      } catch (err) {
        // F11f / ADCC-085: directory backend down → no dead end. Offer retry or
        // manual entry; the draft is untouched and the flow can always proceed.
        if (err && err.code === 'DIRECTORY_UNAVAILABLE') {
          await draftService.setPendingAction?.(sessionId, { type: 'directory_unavailable', slotId: nextSlot.slotId });
          const S = uiStrings(lang);
          trace.push('DIRECTORY_UNAVAILABLE');
          return { response: S.directoryUnavailable, responseType: 'directory_unavailable', choices: ['retry', 'manual'],
            waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: nextSlot.slotId };
        }
        throw err;
      }
      if (resolved && resolved.defaultValue) {
        draft = await draftService.patch(sessionId, [{ op: 'set', slotId: nextSlot.slotId, value: resolved.defaultValue, provenance: 'resolved', pending: true }]);
        return confirmOrChoose(nextSlot, resolved.defaultValue, resolved.alternatives, draft, routeLabel, lang);
      }
      // No hint / no match → ask a plain question for this slot.
      // ADMIN P6 system prompt (question_planner scope) leads, then P5 overlays.
      const gDir = [await fetchSystemPrompt('question_planner'), joinGuidance(await fetchGuidance(snapshot.serviceId))].filter(Boolean).join('\n') || undefined;
      const { question } = await runNode(emit, 'QUESTION_PLANNER', () => runQuestionPlanner(llm, { snapshot, unfilledSlotIds: [nextSlot.slotId], lang, guidance: gDir }));
      trace.push('QUESTION_PLANNER');
      // An optional directory slot with no auto-default (e.g. manualApprover when no
      // manager resolves) must still be skippable — otherwise it reads as required.
      const S0d = uiStrings(lang);
      const optionalDir = !isRequiredNow(nextSlot, trefContext(draft, snapshot));
      return {
        response: optionalDir ? `${question} ${S0d.optionalMark}` : question,
        controls: optionalDir ? [{ id: `ctrl-${nextSlot.slotId}-skip`, type: 'choice', slotId: '__skip__', options: [{ value: nextSlot.slotId, label: S0d.skipLabel }] }] : undefined,
        waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: nextSlot.slotId,
      };
    }

    // P1-12: before asking for a cascade-dictionary slot, look it up. Altiora autofills
    // these from a dictionary, so interrogating the user for facts HR already holds is
    // both slower and less accurate than resolving and confirming.
    if (nextSlot.dictRef && !declinedSet(sessionId).has(nextSlot.slotId)) {
      const offered = await cascadeOffer(sessionId, draft, snapshot, routeLabel, lang);
      if (offered) return offered;
    }

    // Plain slot → single question (F9.1a).
    const gPlain = [await fetchSystemPrompt('question_planner'), joinGuidance(await fetchGuidance(snapshot.serviceId))].filter(Boolean).join('\n') || undefined;
    const { question } = await runNode(emit, 'QUESTION_PLANNER', () => runQuestionPlanner(llm, { snapshot, unfilledSlotIds: [nextSlot.slotId], lang, guidance: gPlain }));
    trace.push('QUESTION_PLANNER');
    // An optional field is offered like any other, but says so plainly and carries a
    // way out — otherwise "answer everything" turns into an interrogation.
    const S0 = uiStrings(lang);
    const isOptional = !isRequiredNow(nextSlot, trefContext(draft, snapshot));
    const askText = isOptional ? `${question} ${S0.optionalMark}` : question;
    const skipControl = isOptional
      ? [{ id: `ctrl-${nextSlot.slotId}-skip`, type: 'choice', slotId: '__skip__', options: [{ value: nextSlot.slotId, label: S0.skipLabel }] }]
      : [];

    const isEnum = nextSlot.type === 'enum';
    const isDate = nextSlot.type === 'date';
    // P1-13: a multi enum emits `multichoice` — but only behind the rollout gate;
    // otherwise it degrades to the single `choice` it is today.
    const isMulti = isEnum && nextSlot.multi === true && MULTICHOICE_ENABLED();
    const choices = isEnum ? (nextSlot.presentOptions || []).map((o) => o.label) : undefined;
    // Enum → dual-emit legacy `choices` + the `choice` control (I-3).
    // Date → the typed `date` control (TASK-PROMPT-001); additive, no legacy fallback —
    // a client without the renderer degrades to the plain text question (SLOT_EXTRACT).
    // TASK-003/004: every remaining scalar type gets its own input affordance. No
    // validation attached (Altiora authors none) — the win is the right widget and a
    // value that never has to be parsed out of prose. helpText seeds the placeholder.
    const freeInput = { string: buildTextControl, text: buildTextareaControl, number: buildNumberControl, boolean: buildToggleControl }[nextSlot.type];
    // NB no `label`: the question is already the turn's `response`, and the client
    // renders both — passing it here too printed every question twice.
    const controls = isMulti
      ? buildMultichoiceControl(nextSlot, nextSlot.presentOptions || [])
      : isEnum
        ? buildChoiceControl(nextSlot, nextSlot.presentOptions || [])
        : isDate
          ? buildDateControl(nextSlot)
          : freeInput
            ? freeInput(nextSlot, { placeholder: nextSlot.helpText })
            : undefined;
    return {
      response: askText, choices,
      controls: [...(controls || []), ...skipControl].length ? [...(controls || []), ...skipControl] : undefined,
      waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: nextSlot.slotId,
    };
  }

  async function fillLoop(sessionId, message, draft, snapshot, trace, routeLabel, emit = () => {}, lang = 'ru', intake = false) {
    const resolverSlotIds = new Set(snapshot.slots.filter((s) => s.resolverRef).map((s) => s.slotId));
    // Reference-backed slots draw their VALID values from a directory (resolverRef),
    // a cascade dictionary (dictRef) or a list-of-values lookup (lov). A raw
    // extracted mention must NOT be stored as the value — it is kept as a hint and
    // only becomes a value once it resolves against that reference (else the slot
    // stays unfilled and is asked). Prevents unvalidated free text (e.g. a grade or
    // duty station that is not a real dictionary entry) filling the slot.
    // A baked LOV is already type='enum' with presentOptions (validated by the enum
    // path), so only an UNBAKED lov (still type=string) needs reference resolution.
    const referenceSlotIds = new Set(snapshot.slots.filter((s) => s.resolverRef || s.dictRef || (s.lov && s.type !== 'enum')).map((s) => s.slotId));

    // Text confirm of a pending directory slot ("да" without clicking).
    const pendingSlot = snapshot.slots.find((s) => draft.slots[s.slotId]?.pending);
    if (pendingSlot && isAffirmative(message)) {
      draft = await runNode(emit, 'PATCH', () => draftService.patch(sessionId, [{ op: 'set', slotId: pendingSlot.slotId, value: draft.slots[pendingSlot.slotId].value, provenance: 'resolved', pending: false }]));
      trace.push('PATCH');
      return advance(sessionId, draft, snapshot, trace, routeLabel, emit, lang);
    }

    // SLOT_EXTRACT → VALIDATE → PATCH. Non-resolver mentions set the value;
    // resolver mentions are PERSISTED as slot.hint (value null) so they survive
    // until that slot is reached in order (F9.2c fix).
    const active = activeSlotIds(draft, snapshot);
    const activeSet = new Set(active);
    // On intake (a first message that may bundle the request WITH form data),
    // extract against the FULL schema so values for not-yet-active conditional
    // slots are captured too; those are parked as carry-over (below) and applied
    // by `advance` once their slot opens. Later turns extract active slots only.
    const extractScope = intake ? snapshot.slots.map((s) => s.slotId) : active;
    const { patches } = await runNode(emit, 'SLOT_EXTRACT', () =>
      runSlotExtract(llm, { snapshot, activeSlotIds: extractScope, userText: message, lang }));
    trace.push('SLOT_EXTRACT');
    const { good } = validatePatches(patches, snapshot);
    trace.push('VALIDATE');
    emit('node:done', { node: 'VALIDATE', status: 'success' });
    const allPatches = good.map((p) => {
      if (referenceSlotIds.has(p.slotId)) {
        const existing = draft.slots[p.slotId];
        // Persist directory/dictionary/LOV mentions as a hint (resolved later, in slot
        // order) while the slot is still unconfirmed — including a provisional
        // self-default the user is now overriding by naming someone. A CONFIRMED value
        // is left alone. The value is set only after the reference resolves the mention.
        if (!existing?.value || existing?.pending) {
          return { op: 'set', slotId: p.slotId, value: null, hint: p.value, provenance: 'extracted', pending: false };
        }
        return p;
      }
      // Carry-over: a value the user volunteered for a plain slot that is not
      // tref-active yet is parked as a hint (value null); `advance` applies it once
      // the slot becomes active. Preserves data the user gave up front.
      if (!activeSet.has(p.slotId)) {
        return { op: 'set', slotId: p.slotId, value: null, hint: p.value, provenance: 'extracted', pending: false };
      }
      return p;
    });

    // R6/F9.3a: if the user named a beneficiary other than themselves, they are
    // filing on someone's behalf → set the author silently to the current user
    // (no confirm) and skip the author question, so the flow reacts to the
    // beneficiary the user actually mentioned. Location later defaults from the
    // beneficiary's own location.
    const beneHint = good.find((p) => p.slotId === 'beneficiary')?.value;
    const hasAuthorSlot = snapshot.slots.some((s) => s.slotId === 'author');
    if (beneHint && hasAuthorSlot && !draft.slots.author?.value && directory) {
      const isSelf = typeof beneHint === 'object' ? beneHint.mode === 'self' : SELF_HINT_RE.test(String(beneHint));
      if (!isSelf) {
        const me = await directory.getCurrentUser();
        allPatches.push({ op: 'set', slotId: 'author', value: me, provenance: 'context', pending: false });
      }
    }
    // Altiora requests carry a universal author (= requester) context slot. The requester
    // is ALWAYS the current user (Altiora stamps it on every submit), so resolve it once,
    // silently, up front — regardless of who the beneficiary is — so beneficiary self/other
    // is judged against a real requester and the requester is explicit in the draft. Scoped
    // to Altiora snapshots (altioraOusId) so the on-behalf block above still governs fixtures.
    const fromAltiora = !!(snapshot.metadata && snapshot.metadata.altioraOusId);
    if (fromAltiora && hasAuthorSlot && !draft.slots.author?.value && directory) {
      let me = null;
      try { me = await directory.getCurrentUser(); } catch { me = null; }
      if (me) allPatches.push({ op: 'set', slotId: 'author', value: me, provenance: 'context', pending: false });
    }

    // Cascade-edit gate: overwriting an already-filled slot that has FILLED
    // dependents must be confirmed first — on confirm the dependents reset (and
    // dictRef autofills re-resolve). Never fires on intake (a first message cannot
    // be editing filled slots) or on hint/carry-over patches (value null).
    if (!intake) {
      const ce = detectCascadeEdit(allPatches, draft, snapshot);
      if (ce) {
        const S = uiStrings(lang);
        const target = snapshot.slots.find((s) => s.slotId === ce.slotId);
        const depLabels = ce.dependents.map((d) => d.promptHint || d.slotId).join(', ');
        await draftService.setPendingAction(sessionId, {
          type: 'confirm_cascade_edit', slotId: ce.slotId, newValue: ce.value,
          dependents: ce.dependents.map((d) => d.slotId),
        });
        trace.push('CASCADE_WARN');
        return {
          response: fmt(S.cascadeWarn, { field: (target && (target.promptHint || target.slotId)) || ce.slotId, deps: depLabels }),
          responseType: 'confirm_cascade_edit', waiting: true, isComplete: false, draft, route: routeLabel,
        };
      }
    }

    if (allPatches.length) {
      assertToolAllowed('PATCH', 'draft.patch');
      draft = await runNode(emit, 'PATCH', () => draftService.patch(sessionId, allPatches));
      trace.push('PATCH');
    }

    // R7/F9.3b + ADCC-089: echo EVERYTHING understood this turn, before the
    // question. Grounding is mandatory — if anything was extracted, the preamble
    // must be non-empty (validateGrounding enforces it).
    const extracted = { other: [] };
    const extractedIds = [];
    for (const p of good) {
      extractedIds.push(p.slotId);
      if (p.slotId === 'assetType') extracted.assetType = p.value;
      else if (p.slotId === 'beneficiary') extracted.beneficiaryName = typeof p.value === 'string' ? p.value : (p.value && p.value.name) || null;
      else if (p.slotId === 'location') extracted.location = typeof p.value === 'string' ? p.value : (p.value && p.value.name) || null;
      else extracted.other.push(typeof p.value === 'string' ? p.value : (p.value && (p.value.name || p.value.id)) || null);
    }
    if (extractedIds.length) extracted.hasAny = true;
    const preamble = buildPreamble(extracted, lang);
    validateGrounding(extractedIds, preamble); // ADCC-089

    // KB-assisted slot resolution fallback: the user referenced a field but the
    // extractor set nothing (an oblique edit — "I need to change the duty station").
    // Find the target slot via the per-slot knowledge base and ask what to set it to,
    // steering the next turn onto that slot. Conservative: a confident match to a
    // FILLED slot only; best-effort so a KB outage never breaks the turn.
    if (!intake && !allPatches.length && deps.resolveSlot) {
      try {
        const cands = await deps.resolveSlot(snapshot.serviceId, message);
        const topC = cands && cands[0];
        if (topC && topC.score >= 0.8) {
          const sv = draft.slots[topC.slotId];
          const filled = sv && sv.value !== undefined && sv.value !== null && sv.value !== '' && !sv.pending;
          if (filled) {
            const S = uiStrings(lang);
            const qtext = fmt(S.editWhichValue, { field: topC.promptHint || topC.slotId });
            await draftService.syncTopSequence?.(sessionId, topC.slotId);
            await draftService.setLastQuestion?.(sessionId, qtext);
            trace.push('KB_SLOT_RESOLVE');
            return { response: qtext, responseType: 'edit_which_value', waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: topC.slotId };
          }
        }
      } catch { /* best-effort: KB slot resolution never breaks the turn */ }
    }

    const r = await advance(sessionId, draft, snapshot, trace, routeLabel, emit, lang);
    return preamble ? { ...r, preamble } : r;
  }

  /**
   * Execute one dialogue turn.
   * @returns {Promise<{response, choices?, route, draft?, srNumber?, isComplete, waiting, trace}>}
   */
  // lang defaults to 'en': ui-strings documents English as the fallback and every
  // internal handler here already declares `lang = 'en'`. The entry point was the
  // last place still defaulting to Russian, which silently mislabelled any turn
  // whose caller omitted the argument (ratified 2026-07-28).
  async function runTurn({ sessionId, userId, message, userContext, beneficiary, choice, controlAction, anchor, formEvent, lang = 'en' }) {
    const trace = [];
    const emit = makeEmit(sessionId);
    // F11d: the acting identity for this turn — the Altiora proxy-injected user
    // (userContext), or an explicit userId. Published to the AsyncLocalStorage the
    // getCurrentUser wrapper reads, so every no-arg getCurrentUser() in this turn
    // resolves the real logged-in user.
    const authCtx = (userContext && (userContext.userId || userContext.id))
      ? { sessionUser: userContext, userId: userContext.userId || userContext.id }
      : (userId ? { userId } : null);
    emit('turn:start', {});
    try {
      const result = await authStore.run(authCtx || {}, () =>
        _runTurnBody({ sessionId, userId, message, userContext, beneficiary, choice, controlAction, anchor, formEvent, lang, trace, emit }));
      await syncStack(sessionId, result);
      return result;
    } catch (err) {
      // ADCC-085 (no dead ends): any internal failure is handled gracefully — the
      // session and its draft survive; the user is invited to continue.
      // Log it: swallowing the stack made real defects invisible in production, so the
      // graceful reply is kept but the cause is no longer lost.
      // eslint-disable-next-line no-console
      console.error(`[chat-v2] turn failed (session ${sessionId}, route trace ${trace.join('>')}):`, err && err.stack ? err.stack : err);
      emit('node:done', { node: 'ERROR', status: 'error' });
      trace.push('ERROR');
      return { response: uiStrings(lang).internalError, waiting: true, isComplete: false, route: 'ERROR', error: err.code || err.name || 'ERROR', trace };
    } finally {
      emit('turn:done', {});
    }
  }

  async function _runTurnBody({ sessionId, userId, message, userContext, beneficiary, choice, controlAction, anchor, formEvent, lang, trace, emit }) {
    // LOAD_DRAFT
    assertToolAllowed('LOAD_DRAFT', 'draft.get');
    let draft = await runNode(emit, 'LOAD_DRAFT', () => draftService.get(sessionId));
    trace.push('LOAD_DRAFT');
    let snapshot = draft ? await loadEffective(draft.serviceId) : null;

    // ANCHOR_EXPLAIN (Phase 4): a UI-anchor click carries `anchor` and (usually) no
    // message. Explain the element directly from the KB, skipping the ROUTER. Does
    // not touch the draft, so an in-progress request is preserved for continuation.
    if (anchor && anchor.id) {
      const r = await runNode(emit, 'ANCHOR_EXPLAIN', () => anchorExplain(anchor, draft, snapshot, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }

    // I-2c: reply to a service-disambiguation — the user picked one of the offered
    // services. It carries the chosen serviceId (not a DraftSR slot), so it is
    // handled here, before the normal draft/router flow, by starting that service.
    if (controlAction && controlAction.slotId === SERVICE_SLOT && controlAction.value) {
      const chosenId = controlAction.value;
      const snap = await loadEffective(chosenId);
      if (!snap) {
        return { response: `I found a matching service but its intake form is not available yet.`, waiting: true, isComplete: false, route: 'DISAMBIGUATE', trace };
      }
      // A single service is now settled + intent to fill → large-form gate applies.
      const r = await startService(sessionId, chosenId, snap, { message: message || '', beneficiary, userId, gate: true }, trace, emit, lang);
      return { ...r, trace };
    }

    // SERVICE_HELP reply: the user picked/confirmed a service → ask WHAT they want to
    // do next (raise the request vs get a reference), reusing the existing action
    // intent choice (Addition 1). Its `info` branch shows the help card; its `fill`
    // branch starts intake WITH the large-form field-count gate (Addition 2).
    if (controlAction && controlAction.slotId === SERVICE_HELP_SLOT && controlAction.value) {
      const chosenId = controlAction.value;
      const snap = await loadEffective(chosenId);
      if (!snap) {
        return { response: `I found a matching service but its intake form is not available yet.`, waiting: true, isComplete: false, route: 'SERVICE_HELP', trace };
      }
      const r = buildIntentAsk(chosenId, snap.metadata.title, trace, lang);
      return { ...r, draft: draft || undefined, trace };
    }

    // SERVICE_HELP start button: the user chose to raise the request from the help
    // card → start that service's intake. They have already seen the field list, so
    // the large-form gate is NOT shown again.
    if (controlAction && controlAction.slotId === SERVICE_HELP_START_SLOT && controlAction.value) {
      const chosenId = controlAction.value;
      const snap = await loadEffective(chosenId);
      if (!snap) {
        return { response: `I found a matching service but its intake form is not available yet.`, waiting: true, isComplete: false, route: 'SERVICE_HELP', trace };
      }
      const r = await startService(sessionId, chosenId, snap, { message: message || '', beneficiary, userId, gate: false }, trace, emit, lang);
      return { ...r, trace };
    }

    // Addition 1 — action-intent clarification reply (fill vs info) on a resolved service.
    if (controlAction && controlAction.slotId === INTENT_CHOICE_SLOT && controlAction.value) {
      const v = String(controlAction.value);
      const action = v.slice(0, v.indexOf(':'));
      const chosenId = v.slice(v.indexOf(':') + 1);
      const snap = await loadEffective(chosenId);
      if (!snap) {
        return { response: `I found a matching service but its intake form is not available yet.`, waiting: true, isComplete: false, route: 'intent_choice', trace };
      }
      if (action === 'info') {
        const r = await buildServiceHelpTurn(chosenId, snap.metadata.title, trace, lang);
        return { ...r, trace };
      }
      // fill → start with the large-form gate (Addition 2).
      const r = await startService(sessionId, chosenId, snap, { message: '', beneficiary, userId, gate: true }, trace, emit, lang);
      return { ...r, trace };
    }

    // Addition 2 — large-form choice reply (wizard / assistant / info).
    if (controlAction && controlAction.slotId === LARGE_FORM_SLOT && controlAction.value) {
      const v = String(controlAction.value);
      const action = v.slice(0, v.indexOf(':'));
      const chosenId = v.slice(v.indexOf(':') + 1);
      const snap = await loadEffective(chosenId);
      if (!snap) {
        return { response: `I found a matching service but its intake form is not available yet.`, waiting: true, isComplete: false, route: 'large_form_choice', trace };
      }
      if (action === 'info') {
        const r = await buildServiceHelpTurn(chosenId, snap.metadata.title, trace, lang);
        return { ...r, trace };
      }
      if (action === 'wizard') {
        // Hand off to the Altiora form; assisted filling ends here (Addition 2/4).
        const d = await draftService.create(sessionId, chosenId, snap.version, beneficiary, userId);
        return { ...(await openFormTurn(d, snap, lang, 'large_form_choice')), trace };
      }
      // assistant → continue in chat; the user chose it over the wizard, so no gate.
      const r = await startService(sessionId, chosenId, snap, { message: '', beneficiary, userId, gate: false }, trace, emit, lang);
      return { ...r, trace };
    }

    // Catalog-browse reply: drill into a category, go back to root, or — for a
    // requestable leaf (svc:CODE) — start that service. Stateless: the picked id is
    // the cursor, so no session state is kept between turns (RULE-075).
    if (controlAction && controlAction.slotId === CATALOG_SLOT && controlAction.value) {
      const v = String(controlAction.value);
      if (v.startsWith('svc:')) {
        const code = v.slice(4);
        const snap = await loadEffective(code);
        if (!snap) return { response: 'That service is not available to request yet.', waiting: true, isComplete: false, route: 'CATALOG_BROWSE', trace };
        // Picking a service to raise is intent to fill → large-form gate applies.
        const r = await startService(sessionId, code, snap, { message: '', beneficiary, userId, intake: false, gate: true }, trace, emit, lang);
        return { ...r, trace };
      }
      const r = await handleCatalogBrowse(v === '__root__' ? null : v, trace, lang);
      return { ...r, trace };
    }

    // P9-007/010: draft-less ACT confirm gate (approve/reject). Resolved BEFORE the
    // draft-scoped controlAction/pending handlers and the LLM router, so governance
    // is deterministic and works with or without a DraftSR. Accepts a typed/spoken
    // yes/no OR a click on the `__act_confirm__` control; any OTHER controlAction
    // (catalog/service/slot) falls through to its normal handler below.
    {
      const isActCtrl = controlAction && controlAction.slotId === '__act_confirm__';
      if (!choice && (isActCtrl || !controlAction) && ACT_PENDING.has(sessionId)) {
        const handledAct = await resolveActPending(sessionId, message, lang, trace, controlAction);
        if (handledAct) return { ...handledAct, trace };
      }
    }

    // ADCC-098: a parked draft re-entering the session → offer to resume it before
    // anything else. The choice (resume / new) is resolved via pendingAction.
    if (draft && snapshot && draft.status === 'parked' && !choice && !controlAction && !draft.pendingAction) {
      await draftService.setPendingAction(sessionId, { type: 'offer_resume', slotId: (topSequence(draft) || {}).slotId });
      const S = uiStrings(lang);
      return { response: fmt(S.resumeOffer, { title: snapshot.metadata.title }), responseType: 'offer_resume', choices: ['resume', 'new'], waiting: true, isComplete: false, draft, route: 'offer_resume', trace };
    }

    // The host reports that the form created a request. Deterministic and pre-router:
    // this is a system signal, not something to classify.
    if (formEvent === 'request_created') {
      const r = await requestCreatedTurn(sessionId, lang, userContext);
      return { ...r, trace };
    }

    // Structured controlAction (I-3) — the controls[] reply. Takes precedence over
    // the legacy `choice` and, like it, bypasses ROUTER/SLOT_EXTRACT.
    if (controlAction && draft && snapshot) {
      const res = await handleControlAction(sessionId, draft, snapshot, controlAction, emit, lang);
      if (res.reask) return { ...res.reask, trace };
      const r = await advance(sessionId, res.draft, snapshot, trace, 'SLOT_FILL', emit, lang);
      return { ...r, trace };
    }

    // Structured choice (F9.1d) — bypasses ROUTER/SLOT_EXTRACT (deterministic).
    if (choice && draft && snapshot) {
      const res = await handleChoice(sessionId, draft, snapshot, choice, emit, lang);
      if (res.reask) return { ...res.reask, trace };
      const r = await advance(sessionId, res.draft, snapshot, trace, 'SLOT_FILL', emit, lang);
      return { ...r, trace };
    }

    // Pending-action resolution (F10c): a yes/no the agent is awaiting
    // (cancel / restart / skip-offer / handoff) is resolved deterministically
    // before anything else.
    if (draft && snapshot && !choice && draft.pendingAction) {
      const handled = await resolvePendingAction(sessionId, draft, snapshot, message, emit, lang, trace);
      if (handled) return { ...handled, trace };
    }

    // REPAIR_ROUTER (F10b / ADCC-081): with a sequence open, interpret the
    // utterance deterministically BEFORE the LLM router. This is the answer-first
    // machinery that stops "I need big screen" (an answer to the open freetext
    // question) being re-classified as a new intent.
    if (draft && snapshot && !choice) {
      const top = topSequence(draft);
      if (top && top.type === 'slot_question' && top.slotId) {
        const decision = interpretPending({ message, draft, snapshot });
        if (decision.kind !== 'FALLTHROUGH') {
          trace.push('REPAIR_ROUTER');
          emit('node:done', { node: 'REPAIR_ROUTER', status: 'success' });
          const handled = await applyRepairDecision(sessionId, draft, snapshot, decision, emit, lang, message, trace);
          if (handled) return { ...handled, trace };
        }
      }
    }

    // ROUTER
    const route = await runNode(emit, 'ROUTER', () => router(message, draft, snapshot));
    trace.push('ROUTER');

    if (route === 'OUT_OF_SCOPE') {
      trace.push('OUT_OF_SCOPE');
      emit('node:done', { node: 'OUT_OF_SCOPE', status: 'success' });
      return { response: uiStrings(lang).agent.outOfScope, waiting: true, isComplete: false, route, trace };
    }

    if (route === 'INFO_QUESTION') {
      const r = await runNode(emit, 'INFO_ANSWER', () => infoAnswer(message, draft, snapshot, trace, lang));
      return { ...r, trace };
    }

    // SERVICE_HELP: reference on a specific catalog service. Resolve the service the
    // same way intake does, then confirm/choose it via the disambiguation control;
    // the pick reply renders the help card (handled pre-router above). Never touches
    // the draft, so a flow in progress can resume afterwards.
    if (route === 'SERVICE_HELP') {
      const decomposed = await runNode(emit, 'INTAKE_DECOMPOSE', () => decomposeIntake(message));
      const intent = (decomposed.serviceIntent || '').trim();
      const searchQuery = intent.length >= 3 ? intent : message;
      assertToolAllowed('RESOLVE', 'resolve.search');
      trace.push('RESOLVE');
      const hits = await runNode(emit, 'RESOLVE', () => resolveSearch(searchQuery, userContext || {}));
      const serviceHits = hits.filter((h) => h.type === 'SERVICE');
      if (!serviceHits.length) {
        // No catalog match → fall back to the knowledge-base answer.
        const r = await runNode(emit, 'INFO_ANSWER', () => infoAnswer(message, draft, snapshot, trace, lang));
        return { ...r, draft: draft || undefined, trace };
      }
      const r = buildServiceHelpPick(serviceHits, trace, lang);
      return { ...r, draft: draft || undefined, trace };
    }

    // Chat-agent read intents (do not touch the draft; the flow can always resume).
    if (route === 'MY_REQUESTS') {
      const r = await runNode(emit, 'MY_REQUESTS', () => handleMyRequests(message, sessionId, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'QUERY_TASKS') {
      const r = await runNode(emit, 'QUERY_TASKS', () => handleQueryTasks(message, sessionId, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'QUERY_MAIL') {
      const r = await runNode(emit, 'QUERY_MAIL', () => handleQueryMail(message, sessionId, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    // P9-007: governed approve/reject (arms a deterministic confirm; does NOT touch the draft).
    if (route === 'ACT_APPROVE' || route === 'ACT_REJECT') {
      const decision = route === 'ACT_REJECT' ? 'reject' : 'approve';
      const r = await runNode(emit, route, () => handleActDecision(message, decision, sessionId, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'CATALOG_BROWSE') {
      const r = await runNode(emit, 'CATALOG_BROWSE', () => handleCatalogBrowse(null, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }

    // CATALOG_SEARCH: find services by TOPIC. LLM extracts the service meaning
    // (INTAKE_DECOMPOSE), then a hybrid vector+graph search over the knowledge base
    // (resolveSearch → hybridSearchServices) yields candidates. 0 → fall back to the
    // catalog root; 1 → straight to the action choice; N → offer the matches to pick.
    if (route === 'CATALOG_SEARCH') {
      const decomposed = await runNode(emit, 'INTAKE_DECOMPOSE', () => decomposeIntake(message));
      const intent = (decomposed.serviceIntent || '').trim();
      const searchQuery = intent.length >= 3 ? intent : message;
      assertToolAllowed('RESOLVE', 'resolve.search');
      trace.push('RESOLVE');
      const hits = await runNode(emit, 'RESOLVE', () => resolveSearch(searchQuery, userContext || {}));
      const serviceHits = hits.filter((h) => h.type === 'SERVICE');
      if (!serviceHits.length) {
        const r = await handleCatalogBrowse(null, trace, lang); // no match → browse the catalog
        return { ...r, draft: draft || undefined, trace };
      }
      if (serviceHits.length === 1) {
        const chosen = serviceHits[0];
        const snap = await loadEffective(chosen.serviceId);
        if (!snap) {
          return { response: `I found a matching service (${chosen.title}) but its details are not available yet.`, waiting: true, isComplete: false, route: 'CATALOG_SEARCH', draft: draft || undefined, trace };
        }
        const r = buildIntentAsk(chosen.serviceId, snap.metadata.title, trace, lang);
        return { ...r, draft: draft || undefined, trace };
      }
      const r = buildServiceSearchResults(serviceHits, trace, lang);
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'FIELD_HELP') {
      const r = await runNode(emit, 'FIELD_HELP', () => handleFieldHelp(message, draft, snapshot, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'SITE_NAVIGATE') {
      const r = await runNode(emit, 'SITE_NAVIGATE', () => siteNavigate(message, draft, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }

    if (route === 'CONFIRM_YES' && draft && snapshot) {
      // Legacy/fallback path: the deterministic confirm_submit gate (P9-002)
      // normally handles the affirmation first; this remains for turns where no
      // pending gate is armed. Idempotent via the P9-001 double-submit guard.
      if (draft.pendingAction && draft.pendingAction.type === 'confirm_submit') {
        await draftService.clearPendingAction(sessionId);
      }
      return runSubmit(sessionId, lang, emit, trace, route);
    }

    // ADCC-084: NEW_INTENT while a non-empty draft is in progress → never switch
    // silently. If a genuinely different service matches with confidence above the
    // completeness-scaled threshold, confirm the switch; otherwise treat the
    // utterance as an answer to the current request.
    if (route === 'NEW_INTENT' && draft && snapshot && completeness(draft, snapshot) > 0) {
      assertToolAllowed('RESOLVE', 'resolve.search');
      trace.push('RESOLVE');
      const hits = await runNode(emit, 'RESOLVE', () => resolveSearch(message, userContext || {}));
      const svc = hits.find((h) => h.type === 'SERVICE');
      if (svc && svc.serviceId !== draft.serviceId) {
        const comp = completeness(draft, snapshot);
        const conf = typeof svc.score === 'number' ? svc.score : (svc.confidence === 'high' ? 0.9 : svc.confidence === 'medium' ? 0.6 : 0.5);
        const threshold = 0.5 + comp * 0.3; // asymmetric: fuller draft ⇒ higher bar
        if (conf >= threshold) {
          const newSnap = await loadEffective(svc.serviceId);
          const nextTitle = (newSnap && newSnap.metadata.title) || svc.title;
          await draftService.setPendingAction(sessionId, { type: 'confirm_switch', serviceId: svc.serviceId, serviceTitle: nextTitle, message });
          const S = uiStrings(lang);
          return { response: fmt(S.switchConfirm, { current: snapshot.metadata.title, next: nextTitle }), responseType: 'confirm_switch', choices: ['switch', 'continue'], waiting: true, isComplete: false, draft, route: 'confirm_switch', trace };
        }
      }
      // Same service or low confidence → treat as an answer to the current request.
      const r = await fillLoop(sessionId, message, draft, snapshot, trace, 'SLOT_FILL', emit, lang);
      return { ...r, trace };
    }

    if (route === 'NEW_INTENT' || !draft) {
      // INTAKE_DECOMPOSE: a first message may bundle the request with inline form
      // data. Search the catalogue by the isolated service-intent phrase (falling
      // back to the whole message) so volunteered data does not skew the match.
      const decomposed = await runNode(emit, 'INTAKE_DECOMPOSE', () => decomposeIntake(message));
      const intent = (decomposed.serviceIntent || '').trim();
      const searchQuery = intent.length >= 3 ? intent : message;
      // RESOLVE
      assertToolAllowed('RESOLVE', 'resolve.search');
      trace.push('RESOLVE');
      const hits = await runNode(emit, 'RESOLVE', () => resolveSearch(searchQuery, userContext || {}));
      const serviceHits = hits.filter((h) => h.type === 'SERVICE');
      const service = serviceHits[0];
      if (!service) {
        // Gap — treat as info/out-of-scope deflection.
        const r = await runNode(emit, 'INFO_ANSWER', () => infoAnswer(message, null, null, trace));
        return { ...r, route: 'INFO_QUESTION', trace };
      }
      // I-2c: too ambiguous to auto-pick (tight sibling cluster) → ask which one,
      // rather than proceeding with a likely-wrong sibling.
      if (shouldDisambiguate(serviceHits)) {
        // CODE-004: but never offer the SAME candidates twice. The user already
        // saw them and did not pick — repeating the list cannot inform them, and
        // in the transcripts it simply consumed the conversation until they gave up.
        const key = disambigKey(serviceHits);
        if (disambigSeenCount(sessionId, key) >= 1) {
          trace.push('DISAMBIGUATE_EXHAUSTED');
          return buildDisambiguationExhausted(serviceHits, trace, lang);
        }
        noteDisambigShown(sessionId, key);
        return buildDisambiguation(serviceHits, trace, lang);
      }
      clearDisambig(sessionId); // a service resolved — the loop is over
      snapshot = await loadEffective(service.serviceId);
      if (!snapshot) {
        return { response: `I found a matching service (${service.title}) but its intake form is not available yet.`, waiting: true, isComplete: false, route, trace };
      }
      const hasPairs = Array.isArray(decomposed.pairs) && decomposed.pairs.length > 0;
      // Addition 1: the user only named a service ("info"), or gave no signal of
      // whether they want to fill or just learn ("unclear", no data) → ask, don't assume.
      if (decomposed.intent === 'info') {
        const r = await buildServiceHelpTurn(service.serviceId, snapshot.metadata.title, trace, lang);
        return { ...r, trace };
      }
      if (decomposed.intent === 'unclear' && !hasPairs) {
        return { ...buildIntentAsk(service.serviceId, snapshot.metadata.title, trace, lang), trace };
      }
      // Intent to fill → start (Addition 2 large-form gate, unless data was volunteered:
      // then the user has clearly committed to filling in chat, so proceed directly).
      const r = await startService(sessionId, service.serviceId, snapshot, { message, beneficiary, userId, intake: true, gate: !hasPairs }, trace, emit, lang);
      return { ...r, trace };
    }

    // SLOT_FILL or CONFIRM_EDIT → extraction loop
    const r = await fillLoop(sessionId, message, draft, snapshot, trace, route, emit, lang);
    return { ...r, trace };
  }

  return { runTurn };
}

module.exports = { createEngine, activeRequiredSlots, activeSlotIds, validatePatches, chooseNextSlot, detectCascadeEdit, effectiveSnapshot, buildReview, isReferenceDerived, ROUTER_SCHEMA };
