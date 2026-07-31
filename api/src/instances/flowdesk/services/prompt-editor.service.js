'use strict';

/**
 * Prompt-editor service (ADMIN P6) — the query/action layer behind the
 * system-prompt graph editor. Graph persistence + versioning is delegated to the
 * platform graph-catalog; this service adds the prompt-specific actions: compile,
 * validate, sandbox-test, apply, and a starter graph.
 *
 * TWO GRAPHS, AND ONLY ONE OF THEM IS LIVE (HYB-011a).
 *
 * `CHAT_PROMPT` is the state machine's prompt: rule nodes with `data.text`,
 * compiled per chat node (router / question_planner / …) and materialised into an
 * active prompt record. `EVOLUTIO:PROMPT` is the AGENT's — typed nodes
 * (Narrative / Thesis / Persona / Constraint), compiled whole, read straight from
 * the catalog by `agent-prompt.service` through FLOWDESK_AGENT_PROMPT_ENTRY.
 *
 * The live chat is the agent. Until now this service spoke only CHAT_PROMPT, so
 * the editor — and the admin MCP tools — tuned a graph the running interpreter
 * never loads. Nothing failed: the rule was saved, a version appeared, `active`
 * reported the new text, and the conversation kept using the old wording. That
 * cost a full round of "why did my prompt change do nothing" before the diff of
 * the COMPILED prefix gave it away.
 *
 * So the graph is now chosen explicitly, per call, and the caller must say which:
 *   source 'agent' → EVOLUTIO:PROMPT, what the live chat compiles
 *   source 'fsm'   → CHAT_PROMPT, the state machine's
 * The default stays 'fsm' so no existing caller changes behaviour; the editor and
 * the MCP tools pass 'agent'.
 *
 * ONE ASYMMETRY IS REAL AND MUST NOT BE PAPERED OVER: `apply` materialises an
 * ACTIVE PROMPT RECORD, which only the state machine reads. The agent has no such
 * record — it compiles whatever version of its graph is current — so for the agent
 * "make this live" means PROMOTE A VERSION, not apply. The two verbs are kept
 * distinct for that reason.
 *
 * @module instances/flowdesk/services/prompt-editor.service
 */

// The agent graph's ontology. Read for the condition vocabulary (EC-009) so the
// editor cannot offer a value the compiler has never heard of.
const PROMPT_SCHEMA = require('../../../services/evolutio/contracts/evolutio-prompt.schema.json');
const { compilePromptGraph, PROMPT_NODES, CATEGORY_ORDER } = require('./prompt-graph-compiler');
const { validatePromptGraph } = require('./prompt-graph-validator');
const systemPrompt = require('./system-prompt.service');

const NAMESPACE = 'CHAT_PROMPT';

/** The agent's own prompt graph service (EVOLUTIO:PROMPT). */
function evolutio() { return require('../../../services/evolutio/evolutio-prompt.service'); }

/**
 * Which graph a call is about. 'agent' is the one the live chat compiles; 'fsm' is
 * the state machine's. Anything unrecognised is 'fsm', because that is what every
 * caller meant before this parameter existed.
 */
const isAgent = (source) => String(source || '').toLowerCase() === 'agent';

/** The entry the running agent actually reads, for the editor to open by default. */
const agentEntryId = () => process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;

function catalog() { return require('../../../services/graphCatalog.service').graphCatalogService; }

// ── graph-catalog CRUD (prompt-graphs only) ───────────────────────────────────

async function listGraphs(source) {
  if (isAgent(source)) {
    const items = await evolutio().listGraphs();
    // ПР-003: the STORED choice, not just the environment — otherwise the list would
    // mark the wrong graph as live for the whole life of a process whose `.env` still
    // names the previous one.
    const live = await require('./flowdesk-settings.service').getActivePromptEntry();
    // The one the runtime reads is marked and sorted first: an operator opening the
    // editor should not have to know an entry id to find the graph that matters.
    return (Array.isArray(items) ? items : [])
      .map((g) => ({ ...g, isLiveForAgent: (g.id || g.entryId) === live }))
      .sort((a, b) => Number(b.isLiveForAgent) - Number(a.isLiveForAgent));
  }
  const res = await catalog().listGraphs({ namespace: NAMESPACE, limit: 200 });
  const items = res.data || res.items || res.graphs || res || [];
  return Array.isArray(items) ? items : [];
}

async function getGraph(entryId, version, source) {
  if (isAgent(source)) {
    const loaded = await evolutio().getGraph(entryId || agentEntryId(), version != null ? Number(version) : undefined);
    if (!loaded) return null;
    // Flattened the way the editor consumes a graph, with the provenance it needs
    // to say WHICH graph is on screen.
    return {
      id: entryId || agentEntryId(),
      entryId: entryId || agentEntryId(),
      name: (loaded.meta && loaded.meta.name) || 'Agent prompt (EVOLUTIO)',
      namespace: evolutio().NAMESPACE,
      nodes: loaded.graph.nodes || [],
      edges: loaded.graph.edges || [],
      currentVersion: (loaded.meta && loaded.meta.versionNumber) || null,
      versionNumber: (loaded.meta && loaded.meta.versionNumber) || null,
      source: 'agent',
      isLiveForAgent: (entryId || agentEntryId()) === agentEntryId(),
    };
  }
  if (version != null) return catalog().getVersion(entryId, Number(version));
  return catalog().getGraphById(entryId, false);
}

/**
 * ПР-004 — save a version, or create a NEW graph when `asNew` says so.
 *
 * The `asNew` flag is not decoration. This function used to substitute the LIVE entry
 * whenever `entryId` was absent:
 *
 *     entryId: entryId || agentEntryId()
 *
 * which made a new graph impossible to create and — worse — turned any attempt at one
 * into a new version OF THE RUNNING PROMPT. Nothing would have failed: a version
 * appears, the editor reports success, and the live assistant quietly starts using
 * whatever was on screen. An absent id now means what the caller says it means, and
 * the fallback only applies when they are editing.
 */
async function saveGraph({ entryId, name, description, nodes, edges, changelog, createdBy, source, asNew }) {
  if (isAgent(source)) {
    if (asNew && entryId) {
      throw Object.assign(
        new Error('asNew and entryId are contradictory: pass entryId to add a version, asNew to create a graph.'),
        { status: 400 },
      );
    }
    if (!asNew && !entryId && !agentEntryId()) {
      throw Object.assign(
        new Error('No entryId given and no live graph is set — pass asNew:true to create one.'),
        { status: 400 },
      );
    }
    // The agent's graph has its own writer: it validates against the EVOLUTIO
    // ontology (typed nodes, immutable constraints) before it saves, and that
    // validation is the whole reason not to write the catalog directly from here.
    const { saved, validation } = await evolutio().saveGraph({
      entryId: asNew ? undefined : (entryId || agentEntryId()),
      name: name || undefined,
      description: description || undefined,
      graph: { nodes: nodes || [], edges: edges || [] },
      changelog: changelog || 'prompt graph update (editor)',
      createdBy,
    });
    return { ...saved, validation, source: 'agent' };
  }
  const payload = { nodes: nodes || [], edges: edges || [], requiredParams: [] };
  if (entryId) {
    // New version (bumps currentVersion + SUPERSEDES).
    return catalog().createVersion(entryId, payload, changelog || 'Prompt graph update', { createdBy });
  }
  return catalog().createGraph({
    name: name || 'Chat System Prompt', namespace: NAMESPACE, type: 'template',
    description: description || 'FlowDesk Chat system-prompt rules graph',
    tags: ['chat-prompt', 'system-prompt'], isPublic: true,
    nodes: payload.nodes, edges: payload.edges, requiredParams: [], createdBy,
  });
}

async function getVersions(entryId, source) {
  if (isAgent(source)) return evolutio().getVersions(entryId || agentEntryId());
  return catalog().getVersions(entryId);
}
async function promoteVersion(entryId, version, source) {
  // For the AGENT this is what "make it live" means — there is no materialised
  // active-prompt record on that path (see the header).
  if (isAgent(source)) return evolutio().promoteVersion(entryId || agentEntryId(), Number(version));
  return catalog().promoteVersion(entryId, Number(version));
}

// ── prompt actions ────────────────────────────────────────────────────────────

function compile(graph, opts = {}) {
  // Two ontologies, two compilers. Compiling an EVOLUTIO graph with the rule-node
  // compiler yields an empty prompt and no error at all — the fields it reads
  // (`data.text`) simply are not there — so the source has to decide.
  if (isAgent(opts.source)) {
    const { compile: compileEvolutio } = require('../../../services/evolutio/evolutio-prompt.compiler');
    // EC-011: the CONTEXT has to travel. Until conditions existed this only ever
    // passed the language, which was harmless — every compile was the same compile.
    // With APPLIES_WHEN it is not: dropping the context here would make every preview
    // show the unconditional prompt and quietly report that no rule was excluded,
    // which is the most convincing possible way to be wrong.
    return compileEvolutio(graph, {
      language: opts.language || 'en',
      channel: opts.channel || 'text',
      ...(opts.phase ? { phase: opts.phase } : {}),
      ...(opts.toolContext ? { toolContext: opts.toolContext } : {}),
      ...(opts.serviceCategory ? { serviceCategory: opts.serviceCategory } : {}),
      ...(opts.serviceId ? { serviceId: opts.serviceId } : {}),
    }, {
      graphEntryId: opts.entryId || null,
      graphVersion: opts.version ?? null,
      title: opts.title || 'FlowDesk Assistant',
    });
  }
  return compilePromptGraph(graph, opts);
}

function validate(graph, opts = {}) {
  if (isAgent(opts.source)) {
    return require('../../../services/evolutio/evolutio-prompt.validator').validateGraph(graph);
  }
  return validatePromptGraph(graph);
}

// ── mutation-based editing (used by the AI assistant to edit graphs directly) ──

let _mseq = 0;
const _uid = (p = 'r') => `${p}-${Date.now().toString(36)}-${_mseq++}`;
const RULE_DEFAULT = () => ({ kind: 'rule', key: _uid('r'), title: 'New rule', category: 'custom', text: '', appliesTo: ['all'], enabled: true, priority: 100 });

/**
 * Apply add/update/remove ops to a rules graph (pure). Mirrors the editor store's
 * applyMutations so the assistant can edit a graph the same way a human does.
 * @returns {{ graph:{nodes,edges}, result:{added,updated,removed} }}
 */
function applyMutations(graph, ops) {
  const nodes = ((graph && graph.nodes) || []).map((n) => ({ ...n, data: { ...n.data } }));
  const edges = ((graph && graph.edges) || []).slice();
  const result = { added: 0, updated: 0, removed: 0 };
  if (!Array.isArray(ops)) return { graph: { nodes, edges }, result };
  const byKey = (k) => nodes.find((n) => n.data?.key === k || n.id === k || n.id === `rule-${k}`);
  let y = 100 + nodes.length * 20;
  let out = nodes;
  for (const op of ops) {
    if (op.op === 'add' && op.node) {
      const data = { ...RULE_DEFAULT(), ...op.node };
      out.push({ id: `rule-${data.key}`, type: 'ruleNode', position: { x: 420, y: (y += 90) }, data });
      result.added += 1;
    } else if (op.op === 'update' && op.key) {
      const n = byKey(op.key);
      if (n) { n.data = { ...n.data, ...(op.patch || {}) }; result.updated += 1; }
    } else if (op.op === 'remove' && op.key) {
      const n = byKey(op.key);
      if (n) { out = out.filter((x) => x.id !== n.id); result.removed += 1; }
    }
  }
  return { graph: { nodes: out, edges }, result };
}

/**
 * The assistant's direct-edit primitive: load a graph (inline or from the catalog),
 * apply mutations, validate, and OPTIONALLY persist as a new version. Returns the
 * resulting graph so the caller/editor can reflect it.
 * @param {object} p {graph?, entryId?, version?, mutations, save?, name?, createdBy?}
 */
async function mutateGraph(p) {
  // The agent's graph has its own mutator, its own ontology and its own validator —
  // and this is the entry point an AI assistant uses to edit a prompt, so getting it
  // wrong is silent and expensive: mutations applied with the rule-node ops would
  // write `text` on a Thesis, save cleanly, and compile the OLD sentence. That is
  // exactly the mistake this parameter exists to prevent (see the header).
  if (isAgent(p.source)) {
    return evolutio().mutateGraph({
      entryId: p.entryId || agentEntryId(),
      graph: p.graph,
      version: p.version,
      mutations: p.mutations,
      save: p.save,
      changelog: p.changelog,
      createdBy: p.createdBy,
    });
  }
  let base = p.graph;
  let entryId = p.entryId || null;
  let name = p.name;
  if (!base && entryId) {
    const loaded = await getGraph(entryId, p.version);
    if (!loaded) throw Object.assign(new Error('graph not found'), { status: 404 });
    base = { nodes: loaded.nodes || [], edges: loaded.edges || [] };
    name = name || loaded.name;
  }
  if (!base) throw Object.assign(new Error('graph or entryId is required'), { status: 400 });
  const { graph, result } = applyMutations(base, p.mutations);
  const validation = validatePromptGraph(graph);
  let saved = null;
  if (p.save) {
    saved = await saveGraph({ entryId, name: name || 'Chat System Prompt', nodes: graph.nodes, edges: graph.edges, changelog: `AI edit: +${result.added} ~${result.updated} -${result.removed}`, createdBy: p.createdBy });
  }
  return { graph, result, validation, saved };
}

async function sandbox(body) {
  const { runSandbox } = require('./prompt-sandbox.service');
  return runSandbox(body);
}

/**
 * Apply a prompt graph as the active system prompt. Accepts either an inline
 * graph (from the editor) or a catalog {entryId, version}. When a catalog entry
 * is given, also promotes that version (marks it production).
 */
async function apply({ graph, entryId, version, label, updatedBy }) {
  let g = graph;
  let meta = { label, updatedBy };
  if (!g && entryId) {
    const loaded = await getGraph(entryId, version);
    if (!loaded) throw Object.assign(new Error('graph version not found'), { status: 404 });
    g = { nodes: loaded.nodes || [], edges: loaded.edges || [] };
    meta.graphEntryId = entryId;
    meta.graphVersion = loaded.versionNumber || version || loaded.currentVersion;
    meta.title = loaded.name;
    // Mark this the production version in the catalog too (best-effort).
    if (meta.graphVersion != null) { try { await promoteVersion(entryId, meta.graphVersion); } catch { /* non-fatal */ } }
  } else if (g && entryId) {
    meta.graphEntryId = entryId;
    meta.graphVersion = version;
  }
  if (!g) throw Object.assign(new Error('graph or entryId is required'), { status: 400 });
  return systemPrompt.applyFromGraph(g, meta);
}

const getActive = () => systemPrompt.getActivePrompt();
const listApplied = (opts) => systemPrompt.listApplied(opts);
const clearActive = () => systemPrompt.clearActivePrompt();

// ── starter graph ─────────────────────────────────────────────────────────────

/**
 * A sensible default rules graph for a fresh editor — encodes the current chat's
 * de-facto identity/domain/routing/tone/safety as discrete rule nodes (one rule =
 * one node), including the ADCC dialogue-conduct principles that today never reach
 * the LLM. The operator edits from here.
 */
function defaultGraph() {
  const R = [
    ['identity-role', 'Identity', 'identity', 'You are FlowDesk, the AI intake assistant for a UN Executive Office service desk handling Human Resources and Finance requests.', ['all']],
    ['identity-mission', 'Mission', 'identity', 'Your job is to understand what the user needs, resolve the right service, collect the required information one question at a time, and raise an accurate service request.', ['all']],
    ['domain-scope', 'In-scope domains', 'domain', 'Handle HR and Finance service requests: separation, position management, dependency and personal-data changes, home leave and travel entitlements, recruitment, payroll and grants.', ['router', 'info_answer']],
    ['routing-prefer-info', 'Prefer INFO over OUT_OF_SCOPE', 'routing', 'When unsure between answering a domain question and declining, prefer to answer — the knowledge base decides if it can help.', ['router']],
    ['routing-new-vs-fill', 'New intent vs answering', 'routing', 'Treat a message as answering the current request unless it clearly raises a different service.', ['router']],
    ['dialogue-one-question', 'One question per turn', 'dialogue', 'Ask exactly one question per turn; never batch multiple questions together.', ['question_planner']],
    ['dialogue-ground', 'Ground before asking', 'dialogue', 'Briefly acknowledge what you understood from the user before asking the next question.', ['question_planner']],
    ['dialogue-mirror-subject', 'Confirm the subject', 'dialogue', 'When the user first states their need, mirror the subject back for confirmation before diving into detail fields.', ['question_planner']],
    ['tone-professional', 'Tone', 'tone', 'Be concise, professional and warm. Use plain language; avoid internal jargon and system field codes.', ['all']],
    ['tone-language', 'Respond in the user language', 'tone', 'Always respond in the language the user is using.', ['all']],
    ['safety-no-invent', 'No invented data', 'safety', 'Never invent values, options or policy. If something is unknown, ask or say you do not know.', ['slot_extract', 'info_answer', 'field_help']],
    ['safety-no-pii-leak', 'Protect personal data', 'safety', 'Do not expose other people\'s personal data; only handle the current user\'s or an explicitly named beneficiary\'s request.', ['all']],
    ['deflection-redirect', 'Out-of-scope redirect', 'deflection', 'For clearly non-workplace topics (weather, jokes, world facts), briefly decline and steer back to service requests.', ['router']],
    ['formatting-brief', 'Brief answers', 'formatting', 'Keep answers short and actionable; prefer a direct answer plus, if useful, one next step.', ['info_answer', 'field_help']],
  ];
  const nodes = R.map(([key, title, category, text, appliesTo], i) => ({
    id: `rule-${key}`,
    type: 'ruleNode',
    position: { x: 80 + (CATEGORY_ORDER.indexOf(category) * 40), y: 80 + i * 90 },
    data: { kind: 'rule', key, title, category, text, appliesTo, enabled: true, priority: 100 },
  }));
  // Light chaining within each category for readable ordering (optional edges).
  const edges = [];
  const byCat = {};
  for (const n of nodes) (byCat[n.data.category] ||= []).push(n);
  for (const list of Object.values(byCat)) {
    for (let i = 1; i < list.length; i++) {
      edges.push({ id: `e-${list[i - 1].id}-${list[i].id}`, source: list[i - 1].id, target: list[i].id, type: 'default' });
    }
  }
  return { nodes, edges };
}

/**
 * EC-009 — the vocabulary a condition may be written in, READ FROM THE SCHEMA.
 *
 * Not restated here, and not restated in the editor. A dropdown offering a value the
 * compiler does not understand is the same failure as `appliesTo` once was: the
 * operator picks it, it saves, it validates, and the rule silently never applies. The
 * schema is the only place that decides, so the list is derived from it — adding a
 * phase there makes it appear in the editor with no second edit, and REMOVING one
 * makes it disappear rather than linger as a dead option.
 *
 * `serviceCategory` has no enum by design (the catalogue supplies it), so it is
 * reported as free text and the editor must not pretend otherwise.
 */
function conditionVocabulary() {
  const defs = (PROMPT_SCHEMA && PROMPT_SCHEMA.definitions) || {};
  const props = (defs.condition && defs.condition.properties) || {};
  const enumOf = (name) => (defs[name] && Array.isArray(defs[name].enum) ? defs[name].enum : []);
  const describe = (key) => (props[key] && props[key].description) || '';
  return {
    // The four the editor offers. `engineNode`, `activeRoute` and `serviceId`
    // describe the STATE MACHINE or a single form — deliberately not surfaced on the
    // agent's graph, where they would be scope nothing reads.
    phase: { values: enumOf('phase'), description: describe('phase') },
    toolContext: { values: enumOf('toolContext'), description: describe('toolContext') },
    language: { values: enumOf('language'), description: describe('language') },
    serviceCategory: { values: null, free: true, description: describe('serviceCategory') },
    // Carried, not offered: a condition loaded with these keys must survive an edit.
    passthroughKeys: Object.keys(props).filter(
      (k) => !['phase', 'toolContext', 'language', 'serviceCategory'].includes(k)
    ),
  };
}

/**
 * EC-011 — the prompt as it will be in one context, and what fell out of it.
 *
 * One or two contexts, chosen from the nine REACHABLE ones rather than assembled from
 * four independent dropdowns. That is not a simplification: four dropdowns let the
 * operator build `fill + no_draft`, a turn that cannot happen, and then spend an
 * afternoon tuning a prompt for it. The list comes from the coverage module, so the
 * preview and the coverage report can never disagree about what a context is.
 *
 * @param {object} graph
 * @param {{contexts?:string[], language?:string}} opts
 * @returns {{contexts:Array, rules:Array}}
 */
function previewContexts(graph, opts = {}) {
  const { REACHABLE_CONTEXTS } = require('../../../services/evolutio/evolutio-prompt.coverage');
  const wanted = Array.isArray(opts.contexts) && opts.contexts.length
    ? REACHABLE_CONTEXTS.filter((c) => opts.contexts.includes(c.name))
    : REACHABLE_CONTEXTS.slice(0, 1);

  const compiled = wanted.map((ctx) => {
    try {
      const out = compile(graph, {
        source: 'agent', language: opts.language || 'en',
        phase: ctx.phase, toolContext: ctx.toolContext,
      });
      const m = out.manifest || {};
      return {
        name: ctx.name,
        phase: ctx.phase,
        toolContext: ctx.toolContext,
        text: out.text,
        layers: m.layers || null,
        included: (m.nodes || []).map((n) => n.nodeId),
        excluded: m.excluded || [],
        error: null,
      };
    } catch (e) {
      // A context the graph will not compile in is the finding, not an empty panel.
      return { name: ctx.name, phase: ctx.phase, toolContext: ctx.toolContext, error: e.message };
    }
  });

  // One row per rule, so "what is different between these two" is answered by
  // reading across rather than by holding two prompts in your head.
  const byId = new Map(((graph && graph.nodes) || []).map((n) => [n.nodeId, n]));
  const ids = [...new Set(compiled.flatMap((c) => [
    ...(c.included || []),
    ...(c.excluded || []).map((x) => x.nodeId),
  ]))];
  const rules = ids.map((nodeId) => {
    const n = byId.get(nodeId) || {};
    return {
      nodeId,
      title: n.title || nodeId,
      type: n.type || null,
      cells: compiled.map((c) => {
        if (c.error) return { state: 'unknown' };
        if ((c.included || []).includes(nodeId)) return { state: 'in' };
        const x = (c.excluded || []).find((e) => e.nodeId === nodeId);
        return { state: 'out', reason: (x && x.reason) || 'unknown' };
      }),
    };
  }).sort((a, b) => {
    // The rules that DIFFER between the contexts first — they are the reason anyone
    // opened this panel.
    const differs = (r) => (new Set(r.cells.map((c) => c.state)).size > 1 ? 0 : 1);
    return differs(a) - differs(b) || String(a.title).localeCompare(String(b.title));
  });

  // The full list travels with the answer so the panel does not need a second
  // endpoint to know what it may ask for — and cannot offer a context that no longer
  // exists.
  return { contexts: compiled, rules, allContexts: REACHABLE_CONTEXTS.map((c) => c.name) };
}

function meta() {
  return {
    promptNodes: PROMPT_NODES,
    categories: CATEGORY_ORDER,
    namespace: NAMESPACE,
    conditions: conditionVocabulary(),
  };
}

module.exports = {
  listGraphs, getGraph, saveGraph, getVersions, promoteVersion,
  compile, validate, sandbox, apply, getActive, listApplied, clearActive,
  applyMutations, mutateGraph,
  defaultGraph, meta, conditionVocabulary, previewContexts, NAMESPACE,
};
