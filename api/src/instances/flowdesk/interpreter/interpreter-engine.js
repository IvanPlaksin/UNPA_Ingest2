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
const { buildConfirmControl, buildChoiceControl } = require('./controls');
const { buildPreamble, validateGrounding } = require('./templates/echo');
const { ui: uiStrings, langInstruction } = require('./templates/ui-strings');
const { interpret: interpretPending } = require('./repair-router');

const ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['route'],
  properties: {
    route: { enum: ['NEW_INTENT', 'SLOT_FILL', 'INFO_QUESTION', 'OUT_OF_SCOPE', 'CONFIRM_YES', 'CONFIRM_EDIT', 'MY_REQUESTS', 'CATALOG_BROWSE', 'FIELD_HELP'] },
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
const CONTEXT_SLOTS = [
  { slotId: 'beneficiary', type: 'user', required: true, phase: 'context', resolverRef: 'resolve.user', promptHint: 'Who is this request for?' },
  { slotId: 'location', type: 'location', required: true, phase: 'context', resolverRef: 'resolve.location', dependsOn: ['beneficiary'], promptHint: 'Which location or duty station?' },
];

function effectiveSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.slots)) return snapshot;
  const present = new Set(snapshot.slots.map((s) => s.slotId));
  const inject = CONTEXT_SLOTS.filter((s) => !present.has(s.slotId));
  if (!inject.length) return snapshot; // schema already carries them → no overlay
  const phases = (snapshot.phases || []).includes('context')
    ? snapshot.phases
    : ['context', ...(snapshot.phases || [])];
  return { ...snapshot, phases, slots: [...inject, ...snapshot.slots] };
}

function trefContext(draft, snapshot) {
  const slots = {};
  for (const [id, sv] of Object.entries(draft.slots || {})) slots[id] = sv.value;
  return { service: { approvalRequired: !!snapshot.metadata.approvalRequired }, slots };
}

/** Active required slots: required && tref-active && (unfilled || stale). */
function activeRequiredSlots(draft, snapshot) {
  const ctx = trefContext(draft, snapshot);
  return snapshot.slots.filter((s) => {
    if (!isRequiredNow(s, ctx)) return false; // honours trefCondition + requiredWhen (I-4)
    const sv = draft.slots[s.slotId];
    return !sv || sv.value === undefined || sv.value === null || sv.value === '' || sv.stale || sv.pending;
  });
}

/** All tref-active slots (required or not) still worth extracting into. */
function activeSlotIds(draft, snapshot) {
  const ctx = trefContext(draft, snapshot);
  return snapshot.slots.filter((s) => evalTref(s.trefCondition, ctx)).map((s) => s.slotId);
}

/**
 * Choose the single next slot to ask (F9.1a: one question per turn).
 * Order: phase (context → routing → detail), then topological — only slots whose
 * dependsOn are all satisfied are eligible — then schema order. This yields the
 * ratified sequence: beneficiary → location → detail → approver-last.
 */
function chooseNextSlot(remaining, draft, snapshot) {
  if (!remaining.length) return null;
  const phaseIdx = (p) => snapshot.phases.indexOf(p);
  const orderOf = new Map(snapshot.slots.map((s, i) => [s.slotId, i]));
  const isFilled = (id) => {
    const sv = draft.slots[id];
    return sv && sv.value !== undefined && sv.value !== null && sv.value !== '' && !sv.stale;
  };
  // Eligible = every dependency already filled; fall back to all if none eligible.
  const eligible = remaining.filter((s) => (s.dependsOn || []).every(isFilled));
  const pool = eligible.length ? eligible : remaining;
  return pool.slice().sort((a, b) =>
    (phaseIdx(a.phase) - phaseIdx(b.phase)) || (orderOf.get(a.slotId) - orderOf.get(b.slotId))
  )[0];
}

/** VALIDATE node: drop patches whose value violates the slot type/enum. */
function validatePatches(patches, snapshot) {
  const byId = new Map(snapshot.slots.map((s) => [s.slotId, s]));
  const good = [];
  const rejected = [];
  for (const p of patches) {
    const slot = byId.get(p.slotId);
    if (!slot) { rejected.push({ ...p, reason: 'unknown slot' }); continue; }
    const v = p.value;
    if (slot.type === 'enum') {
      const allowed = (slot.presentOptions || []).map((o) => o.value);
      if (!allowed.includes(v)) { rejected.push({ ...p, reason: 'not in enum' }); continue; }
    } else if (slot.type === 'number' && typeof v !== 'number') {
      rejected.push({ ...p, reason: 'not a number' }); continue;
    }
    good.push(p);
  }
  return { good, rejected };
}

function draftSummary(draft, snapshot) {
  const lines = [];
  for (const s of snapshot.slots) {
    const sv = draft.slots[s.slotId];
    if (sv && sv.value !== undefined) {
      const val = typeof sv.value === 'object' ? (sv.value.name || sv.value.id || JSON.stringify(sv.value)) : sv.value;
      lines.push(`• ${s.promptHint ? s.slotId : s.slotId}: ${val}${sv.stale ? ' (needs re-confirmation)' : ''}`);
    }
  }
  return lines.join('\n');
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
  // Service catalog listing for the 'capabilities' universal action (best-effort).
  const listServices = deps.listServices || (async () => {
    try { return await require('../services/altiora-tools.adapter').getAltioraTools().searchServices('', {}); }
    catch { return []; }
  });

  // ADMIN P5 prompt overlays: operator guidance applied from the Chat Admin
  // session-analysis agent. Optional + best-effort by contract — absence or
  // failure yields empty guidance and the engine behaves exactly as before.
  const getPromptGuidance = deps.getPromptGuidance || null;
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
      `- MY_REQUESTS: the user asks about THEIR OWN existing requests/tickets/cases — "show my requests", ` +
      `"what's the status of my tickets", "my pending cases", "my completed requests from last month".\n` +
      `- CATALOG_BROWSE: the user wants to BROWSE the services/categories on offer — "what services do you offer", ` +
      `"show me the categories", "what can you help with", "show the HR services", "go back to categories".\n` +
      `- FIELD_HELP: the user asks what a FIELD/QUESTION in the current form means or what to put in it — ` +
      `"what does subject mean", "explain this field", "what should I enter here". (Only meaningful with an active request.)\n\n` +
      `Examples: "how do I record my marriage?" → NEW_INTENT. "what documents do I need to initiate separation?" ` +
      `→ INFO_QUESTION. "how do I request advance home leave?" → INFO_QUESTION. "show my open requests" → MY_REQUESTS. ` +
      `"what services can I request?" → CATALOG_BROWSE. "what does this field mean?" → FIELD_HELP. ` +
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

  async function infoAnswer(message, draft, snapshot, trace, lang = 'en') {
    assertToolAllowed('INFO_ANSWER', 'resolve.search');
    assertLLMMethodAllowed('INFO_ANSWER', 'completion');
    const hits = await resolveSearch(message, {});
    const articles = hits.filter((h) => h.type === 'ARTICLE');
    const snippets = articles.map((a) => `- ${a.title}: ${a.answerSnippet || a.summary || ''}`).join('\n');
    const bridge = draft && snapshot
      ? `\nThen continue with the current ${snapshot.metadata.title} request.`
      : '';
    // ADMIN P5: global operator guidance applies to KB answers too. P6 system prompt leads.
    const sys = await fetchSystemPrompt('info_answer');
    const g = await fetchGuidance(draft ? draft.serviceId : null);
    const guided = g.global ? `\nOperator guidance:\n${g.global}` : '';
    const prompt = withSystem(sys, `Answer the user's question using ONLY this knowledge:\n${snippets || '(no articles found)'}\nQuestion: "${message}".${bridge}${langInstruction(lang)}${guided}`);
    const { text } = await llm.completion(prompt);
    trace.push('INFO_ANSWER');
    return { response: text, waiting: true, route: 'INFO_QUESTION' };
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

  /** MY_REQUESTS — list the user's Altiora tickets (acting-user scoped), filters from the message. */
  async function handleMyRequests(message, trace, lang = 'en') {
    trace.push('MY_REQUESTS');
    const A = uiStrings(lang).agent;
    const t = tools();
    if (!t) return { response: A.ticketsError, waiting: true, route: 'MY_REQUESTS', trace };
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
      return { response: A.ticketsNone, responseType: 'ticket_list', tickets: [], totalCount: 0, filters, waiting: true, isComplete: false, route: 'MY_REQUESTS', trace };
    }
    const lines = tickets.map((k) => `• **${k.ticketNumber}** — ${k.title || k.service || ''} _(${k.status})_`).join('\n');
    const more = totalCount > tickets.length ? `\n\n${totalCount > tickets.length ? `${tickets.length} / ${totalCount}` : ''}` : '';
    return { response: `${A.ticketsHeader}\n\n${lines}${more}`, responseType: 'ticket_list', tickets, totalCount, filters, waiting: true, isComplete: false, route: 'MY_REQUESTS', trace };
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
    return {
      response: parentId ? A.catalogCategory : A.catalogRoot,
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
    const fieldInfo = slot
      ? `Field label: "${slot.promptHint || slot.slotId}"; type: ${slot.type}${slot.required ? ' (required)' : ''}` +
        (slot.presentOptions ? `; options: ${slot.presentOptions.map((o) => o.label).join(', ')}` : '')
      : '(no specific form field is active)';
    const prompt = `A UN staff member asks what a service-request form field is for. Explain its purpose briefly and ` +
      `practically, using the field definition and any knowledge below. If helpful, suggest what to enter.\n` +
      `${fieldInfo}\nKnowledge base:\n${snips || '(none)'}\nUser question: "${message}"${langInstruction(lang)}`;
    const { text } = await llm.completion(prompt);
    return { response: text, responseType: 'field_help', ...(slot ? { slotId: slot.slotId } : {}), waiting: true, isComplete: false, route: 'FIELD_HELP', trace };
  }

  // ── confirm-or-choose helpers (F9.1d) ──────────────────────────────────────
  function describeUser(u) {
    if (!u) return 'получатель';
    if (u.mode === 'self') return 'для вас';
    return `${u.name}${u.email ? ` (${u.email})` : ''}${u.location ? `, ${u.location.name}` : ''}`;
  }
  function describeLoc(l) { return l ? (l.name || l.code) : 'локация'; }

  const USER_SLOTS = new Set(['beneficiary', 'author', 'approver']);
  function confirmOrChoose(slotDef, defaultValue, alternatives, draft, routeLabel, lang = 'ru') {
    const S = uiStrings(lang);
    const isUser = USER_SLOTS.has(slotDef.slotId) || slotDef.type === 'user';
    const label = isUser ? describeUser(defaultValue) : describeLoc(defaultValue);
    const prefix = S[slotDef.slotId] || (isUser ? S.user : S.location);
    const response = `${prefix}: ${label}. ${S.correct}`;
    return {
      response,
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

  /** Emit a `choice` control over the top service candidates (dual-emit legacy choices). */
  function buildDisambiguation(candidates, trace, lang = 'en') {
    const A = uiStrings(lang).agent;
    const top3 = candidates.slice(0, 3);
    return {
      response: A.disambiguate,
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
   * Apply a `controlAction` (I-3) — the controls[] reply. Same deterministic path as
   * a legacy `choice`; the two contracts converge here so behavior can't diverge.
   * `submit` (an autocomplete pick) is a `select`; confirm/select/search pass through.
   */
  async function handleControlAction(sessionId, draft, snapshot, controlAction, emit, lang = 'ru') {
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
  async function resolvePendingAction(sessionId, draft, snapshot, message, emit, lang, trace) {
    const S = uiStrings(lang);
    const pa = draft.pendingAction;
    trace.push(`PENDING:${pa.type}`);
    const yes = isAffirmative(message);
    const no = isNegative(message);
    const m = String(message || '').toLowerCase();

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
    const remaining = activeRequiredSlots(draft, snapshot);
    trace.push('ACTIVE_SLOTS', 'RESOLVERS', 'TERM_CHECK');
    emit('node:done', { node: 'ACTIVE_SLOTS', status: 'success' });
    emit('node:done', { node: 'TERM_CHECK', status: 'success' });

    if (remaining.length === 0) {
      assertToolAllowed('CONFIRM', 'draft.get');
      trace.push('CONFIRM');
      emit('node:done', { node: 'CONFIRM', status: 'success' });
      // No slot question is open now — only the submit-confirm. Close the stack
      // so the next "yes" isn't mistaken for an answer to the last slot (F10b).
      await draftService.clearSequences?.(sessionId);
      const S = uiStrings(lang);
      const summary = draftSummary(draft, snapshot);
      return { response: `${S.review.replace('{title}', snapshot.metadata.title)}\n${summary}\n\n${S.submitPrompt}`, waiting: true, isComplete: false, draft, route: routeLabel };
    }

    const nextSlot = chooseNextSlot(remaining, draft, snapshot);
    const sv = draft.slots[nextSlot.slotId];

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
      return { response: question, waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: nextSlot.slotId };
    }

    // Plain slot → single question (F9.1a).
    const gPlain = [await fetchSystemPrompt('question_planner'), joinGuidance(await fetchGuidance(snapshot.serviceId))].filter(Boolean).join('\n') || undefined;
    const { question } = await runNode(emit, 'QUESTION_PLANNER', () => runQuestionPlanner(llm, { snapshot, unfilledSlotIds: [nextSlot.slotId], lang, guidance: gPlain }));
    trace.push('QUESTION_PLANNER');
    const isEnum = nextSlot.type === 'enum';
    const choices = isEnum ? (nextSlot.presentOptions || []).map((o) => o.label) : undefined;
    // Dual-emit: legacy `choices` (labels) + the controls[] `choice` control (I-3).
    const controls = isEnum ? buildChoiceControl(nextSlot, nextSlot.presentOptions || [], { label: question }) : undefined;
    return { response: question, choices, controls, waiting: true, isComplete: false, draft, route: routeLabel, askingSlot: nextSlot.slotId };
  }

  async function fillLoop(sessionId, message, draft, snapshot, trace, routeLabel, emit = () => {}, lang = 'ru') {
    const resolverSlotIds = new Set(snapshot.slots.filter((s) => s.resolverRef).map((s) => s.slotId));

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
    const { patches } = await runNode(emit, 'SLOT_EXTRACT', () =>
      runSlotExtract(llm, { snapshot, activeSlotIds: active, userText: message, lang }));
    trace.push('SLOT_EXTRACT');
    const { good } = validatePatches(patches, snapshot);
    trace.push('VALIDATE');
    emit('node:done', { node: 'VALIDATE', status: 'success' });
    const allPatches = good.map((p) => {
      if (!resolverSlotIds.has(p.slotId)) return p;
      const existing = draft.slots[p.slotId];
      // Persist directory mentions as a hint (resolved later, in slot order) while
      // the slot is still unconfirmed — including a provisional self-default the
      // user is now overriding by naming someone. A CONFIRMED value is left alone.
      if (!existing?.value || existing?.pending) {
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

    const r = await advance(sessionId, draft, snapshot, trace, routeLabel, emit, lang);
    return preamble ? { ...r, preamble } : r;
  }

  /**
   * Execute one dialogue turn.
   * @returns {Promise<{response, choices?, route, draft?, srNumber?, isComplete, waiting, trace}>}
   */
  async function runTurn({ sessionId, userId, message, userContext, beneficiary, choice, controlAction, lang = 'ru' }) {
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
        _runTurnBody({ sessionId, userId, message, userContext, beneficiary, choice, controlAction, lang, trace, emit }));
      await syncStack(sessionId, result);
      return result;
    } catch (err) {
      // ADCC-085 (no dead ends): any internal failure is handled gracefully — the
      // session and its draft survive; the user is invited to continue.
      emit('node:done', { node: 'ERROR', status: 'error' });
      trace.push('ERROR');
      return { response: uiStrings(lang).internalError, waiting: true, isComplete: false, route: 'ERROR', error: err.code || err.name || 'ERROR', trace };
    } finally {
      emit('turn:done', {});
    }
  }

  async function _runTurnBody({ sessionId, userId, message, userContext, beneficiary, choice, controlAction, lang, trace, emit }) {
    // LOAD_DRAFT
    assertToolAllowed('LOAD_DRAFT', 'draft.get');
    let draft = await runNode(emit, 'LOAD_DRAFT', () => draftService.get(sessionId));
    trace.push('LOAD_DRAFT');
    let snapshot = draft ? await loadEffective(draft.serviceId) : null;

    // I-2c: reply to a service-disambiguation — the user picked one of the offered
    // services. It carries the chosen serviceId (not a DraftSR slot), so it is
    // handled here, before the normal draft/router flow, by starting that service.
    if (controlAction && controlAction.slotId === SERVICE_SLOT && controlAction.value) {
      const chosenId = controlAction.value;
      const snap = await loadEffective(chosenId);
      if (!snap) {
        return { response: `I found a matching service but its intake form is not available yet.`, waiting: true, isComplete: false, route: 'DISAMBIGUATE', trace };
      }
      const d = await draftService.create(sessionId, chosenId, snap.version, beneficiary, userId);
      const r = await fillLoop(sessionId, message || '', d, snap, trace, 'NEW_INTENT', emit, lang);
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
        const d = await draftService.create(sessionId, code, snap.version, beneficiary, userId);
        const r = await fillLoop(sessionId, '', d, snap, trace, 'NEW_INTENT', emit, lang);
        return { ...r, trace };
      }
      const r = await handleCatalogBrowse(v === '__root__' ? null : v, trace, lang);
      return { ...r, trace };
    }

    // ADCC-098: a parked draft re-entering the session → offer to resume it before
    // anything else. The choice (resume / new) is resolved via pendingAction.
    if (draft && snapshot && draft.status === 'parked' && !choice && !controlAction && !draft.pendingAction) {
      await draftService.setPendingAction(sessionId, { type: 'offer_resume', slotId: (topSequence(draft) || {}).slotId });
      const S = uiStrings(lang);
      return { response: fmt(S.resumeOffer, { title: snapshot.metadata.title }), responseType: 'offer_resume', choices: ['resume', 'new'], waiting: true, isComplete: false, draft, route: 'offer_resume', trace };
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

    // Chat-agent read intents (do not touch the draft; the flow can always resume).
    if (route === 'MY_REQUESTS') {
      const r = await runNode(emit, 'MY_REQUESTS', () => handleMyRequests(message, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'CATALOG_BROWSE') {
      const r = await runNode(emit, 'CATALOG_BROWSE', () => handleCatalogBrowse(null, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }
    if (route === 'FIELD_HELP') {
      const r = await runNode(emit, 'FIELD_HELP', () => handleFieldHelp(message, draft, snapshot, trace, lang));
      return { ...r, draft: draft || undefined, trace };
    }

    if (route === 'CONFIRM_YES' && draft && snapshot) {
      assertToolAllowed('SUBMIT', 'draft.submit');
      trace.push('SUBMIT');
      const res = await runNode(emit, 'SUBMIT', () => draftService.submit(sessionId));
      if (res.error) {
        return { response: `I can't submit yet — still missing: ${(res.error.missing || []).join(', ')}.`, waiting: true, isComplete: false, route, trace };
      }
      // ADCC-091: explicit sequence closure — the final outcome stated verbatim.
      // ticketId rides along when the submit created a real Altiora ticket (I-7),
      // so telemetry can join session → ITSM ticket (ADMIN P0).
      return { response: fmt(uiStrings(lang).submitted, { ref: res.srNumber }), srNumber: res.srNumber, ticketId: res.ticketId || null, closer: res.srNumber, isComplete: true, waiting: false, route, trace };
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
      // RESOLVE
      assertToolAllowed('RESOLVE', 'resolve.search');
      trace.push('RESOLVE');
      const hits = await runNode(emit, 'RESOLVE', () => resolveSearch(message, userContext || {}));
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
        return buildDisambiguation(serviceHits, trace, lang);
      }
      snapshot = await loadEffective(service.serviceId);
      if (!snapshot) {
        return { response: `I found a matching service (${service.title}) but its intake form is not available yet.`, waiting: true, isComplete: false, route, trace };
      }
      draft = await draftService.create(sessionId, service.serviceId, service.schemaRef?.version || snapshot.version, beneficiary, userId);
      const r = await fillLoop(sessionId, message, draft, snapshot, trace, 'NEW_INTENT', emit, lang);
      return { ...r, trace };
    }

    // SLOT_FILL or CONFIRM_EDIT → extraction loop
    const r = await fillLoop(sessionId, message, draft, snapshot, trace, route, emit, lang);
    return { ...r, trace };
  }

  return { runTurn };
}

module.exports = { createEngine, activeRequiredSlots, activeSlotIds, validatePatches, chooseNextSlot, ROUTER_SCHEMA };
