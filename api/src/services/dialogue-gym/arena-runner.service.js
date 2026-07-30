'use strict';

/**
 * ArenaRunner — orchestrates one simulated dialogue between a Persona (LLM) and
 * the target chat agent, records the full trace, and derives a deterministic
 * outcome.
 *
 * It does NOT reimplement the chat engine: it drives the FlowDesk agent through
 * the sandbox's interactive session (createSandboxSession) — zero side effects,
 * a persistent engine/session so slots survive across turns, and the candidate
 * system prompt injected via the same seam production uses. The persona side is
 * the PersonaSimulator (Haiku). Persistence goes through ArenaStore.
 *
 * All collaborators are injectable (deps) so the loop is unit-testable with no
 * live LLM or database. The default wiring binds the real FlowDesk sandbox,
 * simulator, gym service and Memgraph store.
 *
 * NOTE on namespace: Dialogue Gym is a CORE (platform) subsystem; the FlowDesk
 * sandbox is the single injectable "target agent adapter" seam. Swapping the
 * default `sandboxFactory` retargets the arena at any other agent.
 *
 * @module services/dialogue-gym/arena-runner.service
 */

const crypto = require('crypto');
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const TERMINAL = ['goal_achieved', 'gave_up', 'max_turns', 'agent_error', 'service_matched', 'directory_unavailable'];

const DEFAULT_OPTIONS = {
  maxTurns: 20,
  debug: false,
  // Which CHAT_PROMPT to test (ШАГ 5). promptSource selects the resolution:
  //   'production'  → the live active prompt (loaded from the editor)
  //   'version'     → a specific catalog version (promptEntryId + promptVersionNumber)
  //   'custom_text' → raw systemPromptText (A/B)
  //   'custom_graph'→ inline promptGraph {nodes,edges} (not saved to the catalog)
  // Default: inferred — promptGraph→custom_graph, systemPromptText→custom_text, else production.
  promptSource: null,
  promptEntryId: null,      // for 'version'
  promptVersionNumber: null, // for 'version' (null = latest)
  promptGraph: null,        // for 'custom_graph'
  systemPromptText: null,   // for 'custom_text'
  promptLabel: 'production',
  stopOnServiceMatch: true,
  vary: false,              // vary the opening message in the persona's voice
  // Catalog realism: the arena drives the agent's REAL resolveSearch (live Qdrant
  // flowdesk_services), so intent→service resolution reflects production. Set false
  // for a pure-isolation baseline where the agent has no catalog (resolveSearch → []).
  useRealCatalog: true,
  // EXP-002: which interpreter drives the dialogue. 'fsm' is the state machine
  // (default, unchanged); 'agent' swaps in the agent interpreter through the
  // sandboxFactory seam this runner already documents. No branch below depends
  // on it — the two runs differ in the factory and nothing else.
  interpreterMode: 'fsm',
};

/** Read the agent-side internals from a runTurn() result. */
function extractAgentInternals(turn) {
  if (!turn) return { route: null, identifiedService: null, askingSlot: null, slots: [], controls: [], isComplete: false };
  const draft = turn.draft || {};
  const identifiedService = draft.serviceId || null;
  // slots may be a map {slotId: value} or an array of {slotId}
  let slots = [];
  const s = draft.slots;
  if (Array.isArray(s)) slots = s.map((x) => x && (x.slotId || x.id)).filter(Boolean);
  else if (s && typeof s === 'object') slots = Object.keys(s).filter((k) => s[k] != null && s[k] !== '');
  const controls = Array.isArray(turn.controls) ? turn.controls.map((c) => c && (c.id || c.slotId)).filter(Boolean) : [];
  // Flatten selectable options from `choice` controls so the persona can pick one
  // and the arena can reply with a controlAction (disambiguation / catalog / choice).
  const choiceOptions = [];
  if (Array.isArray(turn.controls)) {
    for (const c of turn.controls) {
      if (c && c.type === 'choice' && Array.isArray(c.options)) {
        for (const o of c.options) {
          if (o && o.value != null) choiceOptions.push({ slotId: c.slotId, value: o.value, label: o.label || String(o.value), description: o.description || null });
        }
      }
    }
  }
  return {
    route: turn.route || null,
    identifiedService,
    askingSlot: turn.askingSlot || null,
    slots,
    controls,
    choiceOptions,
    slotsSnapshot: (s && typeof s === 'object') ? s : null,
    controlsRaw: Array.isArray(turn.controls) ? turn.controls : null,
    isComplete: !!turn.isComplete,
  };
}

const uniq = (arr) => [...new Set(arr)];

/**
 * Derive the acting user's identity from their JWT claims so the chat's
 * `getCurrentUser` has a real current-user (oid/upn/name) — without it the
 * directory raises "no current-user identity" and the agent wrongly reports the
 * employee directory as unavailable.
 */
function identityFromToken(token) {
  try {
    const seg = String(token).split('.')[1];
    const json = Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const p = JSON.parse(json);
    const oid = p.oid || p.sub || null;
    const email = p.upn || p.unique_name || p.email || p.preferred_username || null;
    const name = p.name || [p.given_name, p.family_name].filter(Boolean).join(' ') || null;
    return { userId: oid, id: oid, email, displayName: name };
  } catch { return {}; }
}

// A default acting identity, resolved once from the directory (service account),
// used when a run starts WITHOUT a bearer token / explicit identity. It lets the
// arena exercise a WORKING directory without a per-run token: the chat's
// getCurrentUser resolves this user, and user-scoped Altiora calls fall back to
// the service account. Override with DIALOGUE_GYM_DEFAULT_USER (a JSON identity)
// or DIALOGUE_GYM_DEFAULT_USER_EMAIL (resolved via the directory). Returns null
// only when the directory is genuinely unreachable — then the run correctly
// aborts on the halt-guard.
let _defaultActingUser;
let _defaultActingTried = false;
async function getDefaultActingUser() {
  if (_defaultActingTried) return _defaultActingUser;
  _defaultActingTried = true;
  const envJson = process.env.DIALOGUE_GYM_DEFAULT_USER;
  if (envJson) { try { _defaultActingUser = JSON.parse(envJson); return _defaultActingUser; } catch { /* fall through to directory */ } }
  try {
    const dir = require('../../instances/flowdesk/services/directory');
    const email = process.env.DIALOGUE_GYM_DEFAULT_USER_EMAIL || null;
    const results = await dir.resolveUser(email || 'a');
    const list = Array.isArray(results) ? results : [];
    const u = (email ? list.find((r) => String(r.email || '').toLowerCase() === email.toLowerCase()) : null) || list[0];
    if (u && (u.userId || u.email)) {
      _defaultActingUser = {
        userId: u.userId || undefined,
        id: u.userId || undefined,
        email: u.email || undefined,
        displayName: u.name || undefined,
        orgUnit: (u.orgUnitId || u.department || u.orgUnitPath) ? { id: u.orgUnitId, name: u.department, path: u.orgUnitPath } : undefined,
        location: u.location || undefined,
      };
    } else {
      _defaultActingUser = null;
    }
  } catch { _defaultActingUser = null; }
  return _defaultActingUser;
}

/** Test seam: reset the cached default acting user. */
function _resetDefaultActingUser() { _defaultActingUser = undefined; _defaultActingTried = false; }

/** A turn where the agent reports the user/employee directory is unavailable. */
function isDirectoryUnavailableTurn(turn) {
  if (!turn) return false;
  if (turn.responseType === 'directory_unavailable') return true;
  return /employee directory is temporarily unavailable|directory source unavailable/i.test(String(turn.response || ''));
}

const { clickFor } = require('./persona-click');

function createArenaRunner(deps = {}) {
  const gym = deps.gym || require('./dialogue-gym.service');
  const simulator = deps.simulator || require('./persona-simulator');
  const store = deps.store || require('./arena-store').memgraphArenaStore();
  // target-agent adapter seam: builds an interactive session with sendTurn()
  const sandboxFactory = deps.sandboxFactory || ((p, d) => {
    if (p && p.interpreterMode === 'hybrid') {
      return require('../../instances/flowdesk/hybrid-interpreter/hybrid-session.service').createHybridSession(p, d);
    }
    if (p && p.interpreterMode === 'agent') {
      return require('../../instances/flowdesk/agent-interpreter/agent-session.service').createAgentSession(p, d);
    }
    return require('../../instances/flowdesk/services/prompt-sandbox.service').createSandboxSession(p, d);
  });
  const promptLoader = deps.promptLoader || require('./prompt-loader');

  /**
   * Resolve which CHAT_PROMPT to test into {promptGraph|systemPromptText} + a
   * provenance record, based on opts.promptSource (see DEFAULT_OPTIONS).
   */
  async function resolvePrompt(opts) {
    let promptGraph = opts.promptGraph || null;
    let systemPromptText = opts.systemPromptText || null;
    const source = opts.promptSource || (promptGraph ? 'custom_graph' : (systemPromptText ? 'custom_text' : 'production'));
    const prov = { promptSource: source, promptEntryId: null, promptVersionNumber: null };

    if (source === 'version') {
      const loaded = await promptLoader.loadVersion(opts.promptEntryId, opts.promptVersionNumber);
      promptGraph = { nodes: loaded.nodes, edges: loaded.edges };
      systemPromptText = null;
      prov.promptEntryId = loaded.metadata.entryId;
      prov.promptVersionNumber = loaded.metadata.versionNumber;
    } else if (source === 'production') {
      const prod = await promptLoader.loadProduction();
      if (prod) {
        if (prod.nodes) { promptGraph = { nodes: prod.nodes, edges: prod.edges }; systemPromptText = null; }
        else if (prod.systemPromptText) { systemPromptText = prod.systemPromptText; promptGraph = null; }
        prov.promptEntryId = prod.metadata.entryId;
        prov.promptVersionNumber = prod.metadata.versionNumber;
      } // no active prompt → both null → engine base prompt (documented)
    }
    return { promptGraph, systemPromptText, prov };
  }

  /**
   * Run one arena dialogue.
   * @returns {Promise<{run, transcript, metrics}>}
   */
  async function runArena(personaId, scenarioId, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const persona = await gym.getPersona(personaId);
    const scenario = await gym.getScenario(scenarioId);
    if (!persona) throw Object.assign(new Error(`persona ${personaId} not found`), { status: 404 });
    if (!scenario) throw Object.assign(new Error(`scenario ${scenarioId} not found`), { status: 404 });

    const maxTurns = Math.max(1, parseInt(opts.maxTurns, 10) || scenario.maxTurns || 20);
    const runId = uuid();
    const expected = scenario.expectedServiceCode || null;

    // Resolve which CHAT_PROMPT to test (production / version / custom) + provenance.
    const { promptGraph, systemPromptText, prov } = await resolvePrompt(opts);

    const runNode = {
      runId,
      personaId,
      scenarioId,
      promptVersionId: opts.promptVersionId || null,
      promptLabel: opts.promptLabel || 'production',
      promptSource: prov.promptSource,
      promptEntryId: prov.promptEntryId,
      promptVersionNumber: prov.promptVersionNumber,
      // EXP-002: which interpreter produced this run. Without it a later reader
      // cannot tell run A from run B in the store, and the comparison is lost.
      interpreterMode: opts.interpreterMode || 'fsm',
      agentModel: opts.agentModel || null,
      startedAt: nowIso(),
      status: 'running',
      turnsCount: 0,
      expectedServiceCode: expected,
      namespace: 'CORE',
    };
    Object.keys(runNode).forEach((k) => runNode[k] == null && k !== 'expectedServiceCode' && delete runNode[k]);
    await store.createRun(runNode);

    // Build the isolated target-agent session ONCE (persistent slots across turns).
    // useRealCatalog=false → inject an empty resolveSearch for a no-catalog baseline.
    const sbxDeps = opts.useRealCatalog === false ? { resolveSearch: async () => [] } : {};
    // Acting identity for the chat's getCurrentUser + Altiora auth. Precedence:
    //   token JWT claims → explicit opts.altioraUser/userContext → a DEFAULT acting
    //   user resolved from the directory (service account).
    // The default matters: WITHOUT any identity, getCurrentUser throws and the run
    // aborts as "directory unavailable" — even though the employee directory
    // search itself works under the service account. With a default identity the
    // arena runs against a working directory WITHOUT a per-run bearer token (user-
    // scoped data then uses the service account; supply a token only when you need
    // the real user's scoped view).
    let userContext = opts.altioraUserToken
      ? { token: opts.altioraUserToken, ...identityFromToken(opts.altioraUserToken), ...(opts.altioraUser || {}) }
      : ({ ...(opts.userContext || {}), ...(opts.altioraUser || {}) });
    if (!userContext.userId && !userContext.id && !userContext.email) {
      const def = await getDefaultActingUser();
      if (def) userContext = { ...userContext, ...def };
    }
    if (!userContext.userId && !userContext.id && !userContext.email && !userContext.token) userContext = undefined;
    const session = sandboxFactory({
      graph: promptGraph || undefined,
      systemPromptText: systemPromptText || undefined,
      serviceId: scenario.expectedServiceCode || undefined,
      lang: persona.language || 'en',
      userContext,
      interpreterMode: opts.interpreterMode || 'fsm',
      // The agent compiles its system prompt from the EVOLUTIO:PROMPT graph, so
      // it needs the catalog coordinates rather than a pre-compiled string.
      promptEntryId: opts.agentPromptEntryId || undefined,
      promptVersion: opts.agentPromptVersion ?? undefined,
      model: opts.agentModel || undefined,
    }, sbxDeps);

    const history = [];
    let terminalCondition = null;
    let turnIndex = 0;
    let lastIdentified = null;
    let errorMessage = null;
    const allSlots = [];
    const allControls = [];
    let personaTokens = 0;
    let personaCostUsd = 0;

    // Opening user message.
    const opening = await simulator.generateInitialMessage(persona, scenario, { vary: opts.vary, debug: opts.debug });
    let userMessage = opening.userMessage;
    let pendingControlAction = null; // set when the persona picks an offered choice
    // Why a turn could NOT be delivered as a click, when it could not (HYB-006):
    // a directory pick that cannot be faked, an unparseable date, an unclear yes.
    // Kept so the arena's remaining blind spots are reported rather than assumed away.
    let lastNoClick = null;
    const noClickReasons = {};
    personaTokens += (opening.tokens?.input || 0) + (opening.tokens?.output || 0);
    personaCostUsd += opening.tokens?.costUsd || 0;

    while (turnIndex < maxTurns && !terminalCondition) {
      // 1. Agent turn (forward a controlAction when the persona picked a choice)
      const r = await session.sendTurn(userMessage, { lang: persona.language || 'en', controlAction: pendingControlAction || undefined });
      history.push({ role: 'user', content: userMessage });

      if (!r.ok) {
        errorMessage = r.error;
        terminalCondition = 'agent_error';
        await store.appendTurn({
          turnId: uuid(), runId, turnIndex,
          userMessage, agentResponse: '', route: null, identifiedService: lastIdentified,
          askingSlot: null, isComplete: false, personaSignal: null,
          startedAt: nowIso(), agentLatencyMs: r.ms || 0, personaLatencyMs: 0,
          agentTokens: 0, personaTokens: 0,
        });
        turnIndex++;
        break;
      }

      const turn = r.turn;
      const agentResponse = turn.response || '';
      const internals = extractAgentInternals(turn);
      history.push({ role: 'assistant', content: agentResponse });
      if (internals.identifiedService) lastIdentified = internals.identifiedService;
      allSlots.push(...internals.slots);
      allControls.push(...internals.controls);

      // GUARD: the user/employee directory is unavailable. A real user always has
      // a working directory, so a run that hits this cannot reflect a real dialogue
      // — abort instead of recording a misleading result (Ivan's requirement).
      if (isDirectoryUnavailableTurn(turn)) {
        await store.appendTurn({
          turnId: uuid(), runId, turnIndex,
          userMessage, agentResponse, route: internals.route, identifiedService: internals.identifiedService,
          askingSlot: internals.askingSlot, isComplete: false, personaSignal: null,
          startedAt: nowIso(), agentLatencyMs: r.ms || 0, personaLatencyMs: 0, agentTokens: 0, personaTokens: 0,
        });
        errorMessage = 'user directory unavailable — run aborted (would not reflect a real dialogue)';
        terminalCondition = 'directory_unavailable';
        turnIndex++;
        break;
      }

      // 2. Deterministic terminal: agent resolved the expected service
      if (opts.stopOnServiceMatch && expected && internals.identifiedService === expected) {
        terminalCondition = 'service_matched';
      }

      // 3. Persona turn (only if not already terminal) — show it any offered choices
      let personaResult = null;
      if (!terminalCondition) {
        personaResult = await simulator.generateNextMessage(persona, scenario, history, { debug: opts.debug, choices: internals.choiceOptions });
        personaTokens += (personaResult.tokens?.input || 0) + (personaResult.tokens?.output || 0);
        personaCostUsd += personaResult.tokens?.costUsd || 0;
        if (personaResult.signal === 'goal_achieved') terminalCondition = 'goal_achieved';
        else if (personaResult.signal === 'gave_up') terminalCondition = 'gave_up';
      }

      // 4. Record the turn
      await store.appendTurn({
        turnId: uuid(), runId, turnIndex,
        userMessage,
        agentResponse,
        route: internals.route,
        identifiedService: internals.identifiedService,
        askingSlot: internals.askingSlot,
        slotsFilledJson: internals.slotsSnapshot ? JSON.stringify(internals.slotsSnapshot) : null,
        controlsJson: internals.controlsRaw ? JSON.stringify(internals.controlsRaw) : null,
        isComplete: internals.isComplete,
        personaReasoning: opts.debug ? (personaResult?.reasoning || null) : null,
        personaSignal: personaResult?.signal || null,
        personaPatience: personaResult?.patience ?? null,
        startedAt: nowIso(),
        agentLatencyMs: r.ms || 0,
        personaLatencyMs: personaResult?.latencyMs || 0,
        agentTokens: 0, // sandbox bypasses usage metering; agent-side cost not measured in P1
        personaTokens: (personaResult?.tokens?.input || 0) + (personaResult?.tokens?.output || 0),
        // HYB-1: who wrote this turn and which condition decided it. Present only in
        // hybrid mode; null elsewhere, which is how a reader tells the modes apart —
        // and without it run C could not be measured at all.
        turnAuthor: turn.turnAuthor || null,
        routerReason: turn.routerReason || null,
        modelCalls: (turn.agentMeta && turn.agentMeta.iterations) || (turn.turnAuthor === 'template' ? 0 : null),
      });

      // 5. Decide the next user input: what a person would have DONE with the widget
      //    in front of them, and only free text when no widget could carry it.
      //
      //    A picked option first — that is an explicit choice. Otherwise the answer
      //    is applied to the FIELD control on screen (HYB-006): a date box takes a
      //    date, a number box a number, a text box the prose itself, a confirm a
      //    yes. Before this, only `choice` controls were clickable and every other
      //    widget was answered in prose, so the arena measured an input distribution
      //    the real client never produces — and could not see the hybrid's template
      //    path at all.
      pendingControlAction = null;
      if (personaResult) {
        const idx = personaResult.choiceIndex;
        const opt = idx >= 1 ? internals.choiceOptions[idx - 1] : null;
        if (opt) {
          pendingControlAction = { slotId: opt.slotId, value: opt.value };
          userMessage = opt.label; // human-readable message for transcript
        } else {
          userMessage = personaResult.userMessage;
          const clicked = clickFor(internals.controlsRaw, userMessage);
          if (clicked.controlAction) pendingControlAction = clicked.controlAction;
          else {
          lastNoClick = clicked.why; // recorded, so the blind spots stay visible
          noClickReasons[clicked.why] = (noClickReasons[clicked.why] || 0) + 1;
        }
        }
      }
      turnIndex++;
    }

    if (!terminalCondition && turnIndex >= maxTurns) terminalCondition = 'max_turns';

    const serviceIdentified = expected ? (lastIdentified === expected) : null;
    const status = terminalCondition === 'agent_error' ? 'failed'
      : terminalCondition === 'directory_unavailable' ? 'aborted'
        : 'completed';
    const patch = {
      status,
      completedAt: nowIso(),
      terminalCondition,
      turnsCount: turnIndex,
      identifiedServiceCode: lastIdentified,
      slotsCollected: uniq(allSlots),
      controlsShown: uniq(allControls),
      // HYB-006: how often a turn had to stay free text, and why.
      noClickReasonsJson: Object.keys(noClickReasons).length ? JSON.stringify(noClickReasons) : null,
      totalTokens: personaTokens,
      llmCostUsd: personaCostUsd,
    };
    if (serviceIdentified != null) patch.serviceIdentified = serviceIdentified;
    if (errorMessage) patch.errorMessage = errorMessage;
    await store.finalizeRun(runId, patch);

    const run = { ...runNode, ...patch };
    return {
      run,
      transcript: history,
      metrics: {
        runId,
        turnsCount: turnIndex,
        terminalCondition,
        serviceIdentified,
        identifiedServiceCode: lastIdentified,
        expectedServiceCode: expected,
        slotsCollected: patch.slotsCollected,
        personaTokens,
        personaCostUsd,
      },
    };
  }

  /**
   * Run a batch of pairs. Sequential by default (LLM rate friendliness);
   * pass a `concurrency` to fan out. Errors are captured per-pair, never abort.
   * @param {Array<{personaId,scenarioId}>} pairs
   */
  async function runArenaBatch(pairs, options = {}) {
    const { onProgress } = options;
    const results = [];
    for (let i = 0; i < pairs.length; i++) {
      const { personaId, scenarioId } = pairs[i];
      try {
        const res = await runArena(personaId, scenarioId, options);
        results.push({ ok: true, ...res });
      } catch (e) {
        results.push({ ok: false, personaId, scenarioId, error: e.message });
      }
      if (onProgress) onProgress({ index: i, total: pairs.length, last: results[results.length - 1] });
    }
    return results;
  }

  /**
   * Verify the user/employee directory is reachable for the chat path (the same
   * facade AltioraChat and the voice assistant use). Tests: (1) directory search
   * (resolveUser — service-account backed), and (2) current-user resolution given
   * an identity (from a token or explicit identity). Returns per-check results.
   * @param {object} [opts] { token, identity }
   */
  async function checkDirectory(opts = {}) {
    const dir = require('../../instances/flowdesk/services/directory');
    const out = { resolveUser: null, getCurrentUser: null };
    try { const u = await dir.resolveUser('a'); out.resolveUser = { ok: true, count: (u || []).length }; }
    catch (e) { out.resolveUser = { ok: false, error: e.message }; }
    // Identity precedence mirrors runArena: token claims → explicit → default
    // acting user (from the directory / service account). The default is what lets
    // a tokenless run resolve a current-user and NOT misreport the directory.
    let identity = opts.token ? identityFromToken(opts.token) : (opts.identity || {});
    if (!identity.userId && !identity.id && !identity.email) {
      const def = await getDefaultActingUser();
      if (def) identity = { ...identity, ...def };
    }
    if (identity.userId || identity.id || identity.email || opts.token) {
      try {
        const { runWithActingUser } = require('../../instances/flowdesk/services/acting-user.context');
        const me = await runWithActingUser({ token: opts.token, ...identity }, () => dir.getCurrentUser({ sessionUser: identity, userId: identity.userId }));
        out.getCurrentUser = { ok: !!me, name: me && me.name, email: me && me.email };
      } catch (e) { out.getCurrentUser = { ok: false, error: e.message }; }
    }
    out.ok = !!(out.resolveUser && out.resolveUser.ok); // backend availability is the core signal
    return out;
  }

  // read helpers (used by routes)
  const { runFromNode, turnFromNode } = require('./arena-store');
  async function getRun(runId) {
    const run = runFromNode(await store.getRun(runId));
    if (!run) return null;
    const turns = (await store.getTurns(runId)).map(turnFromNode);
    return { run, turns };
  }
  async function listRuns(filters = {}) {
    let items = (await store.listRuns()).map(runFromNode).filter(Boolean);
    if (filters.status) items = items.filter((r) => r.status === filters.status);
    if (filters.scenarioId) items = items.filter((r) => r.scenarioId === filters.scenarioId);
    if (filters.personaId) items = items.filter((r) => r.personaId === filters.personaId);
    if (filters.terminalCondition) items = items.filter((r) => r.terminalCondition === filters.terminalCondition);
    items.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    const total = items.length;
    const limit = Math.max(1, parseInt(filters.limit, 10) || 50);
    const offset = Math.max(0, parseInt(filters.offset, 10) || 0);
    return { items: items.slice(offset, offset + limit), total };
  }
  async function getTurns(runId) {
    return (await store.getTurns(runId)).map(turnFromNode);
  }

  /**
   * Add Russian translations alongside the English text of each turn in a run.
   * Idempotent (skips already-translated turns unless opts.force). Persists
   * userMessageRu / agentResponseRu on ArenaTurn.
   */
  async function translateRun(runId, opts = {}) {
    const translator = deps.translator || require('./translator');
    const turns = await getTurns(runId);
    if (!turns.length) return { runId, translated: 0, skipped: 0 };
    const results = await translator.translateTurns(turns, opts);
    let translated = 0; let skipped = 0;
    for (const r of results) {
      if (r.skipped) { skipped++; continue; }
      await store.setTurnTranslation(r.turnId, { userMessageRu: r.userMessageRu, agentResponseRu: r.agentResponseRu });
      translated++;
    }
    return { runId, translated, skipped };
  }

  return {
    runArena,
    runArenaBatch,
    getRun,
    listRuns,
    getTurns,
    translateRun,
    checkDirectory,
    ensureIndexes: () => store.ensureIndexes(),
    extractAgentInternals,
    TERMINAL,
  };
}

const singleton = createArenaRunner();
module.exports = singleton;
module.exports.createArenaRunner = createArenaRunner;
module.exports.extractAgentInternals = extractAgentInternals;
module.exports.identityFromToken = identityFromToken;
module.exports.getDefaultActingUser = getDefaultActingUser;
module.exports._resetDefaultActingUser = _resetDefaultActingUser;
module.exports.isDirectoryUnavailableTurn = isDirectoryUnavailableTurn;
module.exports.TERMINAL = TERMINAL;
