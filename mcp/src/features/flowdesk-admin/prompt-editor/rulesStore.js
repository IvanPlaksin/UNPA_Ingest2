/**
 * Rules-graph editor store (P6) — one rule = one node. Self-contained Zustand
 * store modeled on the platform's structuralEditorStore: nodes/edges + CRUD +
 * mutations-apply (from the AI assistant) + load/save + undo/redo.
 */
import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { layoutByPriority } from './promptLayout';

let _seq = 1;
const uid = (p = 'rule') => `${p}-${Date.now().toString(36)}-${_seq++}`;

export const CATEGORIES = ['identity', 'domain', 'routing', 'dialogue', 'tone', 'safety', 'deflection', 'formatting', 'custom'];
// Must mirror PROMPT_NODES in api prompt-graph-compiler.js — offering a scope the
// engine does not read means the operator writes rules that quietly do nothing
// (TASK-FLOWDESK-BUG-001). The API serves the authoritative list at /prompt/meta.
export const APPLIES_TO = ['all', 'router', 'info_answer', 'question_planner', 'field_help'];
export const CATEGORY_COLOR = {
  identity: '#3b82f6', domain: '#0ea5e9', routing: '#8b5cf6', dialogue: '#06b6d4',
  tone: '#22c55e', safety: '#ef4444', deflection: '#f59e0b', formatting: '#64748b', custom: '#94a3b8',
};

const newRuleData = (over = {}) => ({
  kind: 'rule', key: uid('r'), title: 'New rule', category: 'custom',
  text: '', appliesTo: ['all'], enabled: true, priority: 100,
  // PE-002: WHY this rule exists. Required before a new rule can be saved.
  //
  // All 22 rules inherited from the migration carry `original intent undocumented`,
  // and that is exactly the state that makes every later edit a gamble: the next
  // person cannot tell whether a sentence is load-bearing or leftover. New rules do
  // not get to join them.
  rationale: '',
  isNew: true,
  ...over,
});

/**
 * HYB-011b — the editor now edits the graph the LIVE chat compiles, and that graph
 * has a different shape.
 *
 * `EVOLUTIO:PROMPT` nodes are typed (Narrative / Thesis / Persona / Constraint) and
 * each type keeps its text in its OWN field: a Thesis in `assertion`, a Narrative in
 * `narrative`, a Constraint in `rule`. The rule-node editor reads `data.text` and
 * knows nothing of that, so pointing it at this graph without translating would
 * show twenty-two nodes with empty boxes — and, worse, SAVE them empty.
 *
 * (This is the same trap that cost a round of "why did my prompt change do nothing":
 * a patch written to `text` on a Thesis saves, validates, and compiles the OLD
 * sentence, because the compiler reads `assertion`.)
 *
 * So the graph is translated in and out, and the original node is carried whole in
 * `_raw` — anything this editor does not understand (weight, origin, scopeRef,
 * appliesToNodes) survives a round trip untouched instead of being dropped.
 */
/**
 * THESE NAMES COME FROM THE COMPILER. Do not guess them from the type name.
 *
 * Two of the four were wrong here — Narrative was read as `narrative` and Persona as
 * `persona`, while the compiler reads `framing` and `register` (evolutio-prompt.compiler
 * `bodyOf`). The failure was silent in the worst way: those nodes showed EMPTY text in
 * the editor, and saving wrote the operator's words into a field nothing compiles. No
 * error, no diff, just a rule that would not change no matter how carefully it was
 * edited — the same trap as HYB-011a one level down.
 *
 * Caught by writing the attribution service against `bodyOf` and seeing every Narrative
 * come back blank on live data.
 */
const CONTENT_FIELD = {
  Thesis: 'assertion', Narrative: 'framing', Persona: 'register',
  Constraint: 'rule', ToolContract: 'usage',
};

/** Which field holds this node's text, whatever type it claims to be. */
const contentFieldOf = (node) => CONTENT_FIELD[node && node.type]
  || ['assertion', 'framing', 'register', 'rule', 'usage', 'text'].find((f) => node && node[f] != null)
  || 'assertion';

const isEvolutioNode = (n) => !!(n && n.nodeId && n.type && !n.data);

/**
 * EC-008 — the edge vocabulary, and why 'ORDER' is not in it.
 *
 * In the FlowDesk graph an edge only orders nodes. Here it carries meaning, and the
 * schema enumerates exactly five types. The editor was writing `type: 'ORDER'` for
 * anything dragged on the canvas — a value the ontology does not have — so the first
 * connection an operator drew made the WHOLE GRAPH unsaveable, with a SCHEMA error
 * pointing at the edge rather than at the drag that created it. Nobody hit it only
 * because the live graph has no edges yet; EC-008 is the release that changes that.
 *
 * APPLIES_WHEN is deliberately absent from this list. It is a condition, not a
 * relation — see CONDITION_EDGE below.
 */
export const EDGE_TYPES = ['REFINES', 'DEPENDS_ON', 'CONFLICTS_WITH', 'ILLUSTRATES'];

/**
 * How each relation reads from both ends. The panel shows ONE list, because "this
 * rule refines X" and "this rule is refined by Y" are the same fact read from two
 * directions, and two lists would make the operator remember which one he is in.
 */
export const EDGE_LABEL = {
  REFINES: { out: 'refines', in: 'refined by', symmetric: false },
  DEPENDS_ON: { out: 'depends on', in: 'required by', symmetric: false },
  CONFLICTS_WITH: { out: 'conflicts with', in: 'conflicts with', symmetric: true },
  ILLUSTRATES: { out: 'illustrates', in: 'illustrated by', symmetric: false },
};

export const EDGE_COLOR = {
  REFINES: '#3b82f6', DEPENDS_ON: '#8b5cf6', CONFLICTS_WITH: '#ef4444', ILLUSTRATES: '#22c55e',
};

/** The one edge type that is NOT a connection between rules. */
const CONDITION_EDGE = 'APPLIES_WHEN';

/** A condition rides as a self-loop; anything else with source === target is a mistake. */
const isConditionEdge = (e) => (e && (e.type === CONDITION_EDGE || e.data?.edgeType === CONDITION_EDGE));

/** EVOLUTIO edge → the ReactFlow edge this canvas can actually render. */
function fromEvolutioEdge(e) {
  const type = e.type || 'REFINES';
  return {
    // Without an `id` ReactFlow drops the edge silently and `toGraph` writes
    // `edgeId: undefined` back — a round trip through the editor would have deleted
    // every edge the graph had.
    id: e.edgeId || uid('e'),
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    animated: type === 'CONFLICTS_WITH',
    label: EDGE_LABEL[type]?.out || type,
    style: { stroke: EDGE_COLOR[type] || '#64748b', strokeWidth: 1.5 },
    data: { edgeType: type, reason: e.reason || '', condition: e.condition || null },
    _raw: e,
  };
}

/** …and back, in the exact shape the schema allows — it forbids extra properties. */
function toEvolutioEdge(e) {
  const type = e.data?.edgeType || (EDGE_TYPES.includes(e.type) ? e.type : 'REFINES');
  const out = { edgeId: e.id, type, source: e.source, target: e.target };
  // `reason` is REQUIRED on a conflict: the validator refuses an unexplained one
  // (ACTIVE_CONFLICT), and rightly — a conflict nobody described cannot be resolved
  // by whoever meets it next.
  if (e.data?.reason) out.reason = e.data.reason;
  if (e.data?.condition) out.condition = e.data.condition;
  return out;
}

/**
 * Would recording a conflict between these two make the graph unsaveable?
 *
 * CONFLICTS_WITH is not a note. The validator treats it as a claim the graph has to
 * satisfy and refuses it outright (ACTIVE_CONFLICT) when both ends are live and can
 * meet. So the operator has to be told at the moment of drawing, not by a save that
 * fails ten minutes later with a message about a node id.
 *
 * It mirrors the validator's THREE conditions, not one: both live, scopes that
 * overlap, and no pair of mutually exclusive conditions separating them. Warning on
 * "both enabled" alone would fire on rules scoped to different engine nodes, which
 * save perfectly well — and a warning that cries wolf is worse than none, because the
 * next real one is ignored too.
 */
function conflictWouldBlock(nodes, edges, aId, bId) {
  const find = (id) => (nodes || []).find((n) => n.id === id);
  const a = find(aId); const b = find(bId);
  if (!a || !b) return false;
  if (a.data?.enabled === false || b.data?.enabled === false) return false;

  const scope = (n) => (Array.isArray(n.data?.appliesTo) && n.data.appliesTo.length ? n.data.appliesTo : ['all']);
  const sa = scope(a); const sb = scope(b);
  const overlap = sa.includes('all') || sb.includes('all') || sa.some((x) => sb.includes(x));
  if (!overlap) return false;

  // Conditions can separate them — but working out WHETHER two conditions are
  // mutually exclusive is the validator's job, and duplicating it here would be a
  // second implementation to drift out of step. Both conditional means "cannot say",
  // and we stay quiet rather than guess.
  const condsOf = (id) => (edges || []).filter((e) => isConditionEdge(e) && e.source === id);
  if (condsOf(aId).length && condsOf(bId).length) return false;

  return true;
}

/**
 * The connections of one node, read from both ends, with APPLIES_WHEN filtered out.
 *
 * That filter is the point of the function. A condition is stored as a self-loop, so
 * without it the operator sees "this rule refines itself", tries to tidy it away, and
 * silently deletes the condition that decides when the rule applies — an edit whose
 * effect is invisible until a live conversation takes the wrong branch.
 */
function connectionsOf(edges, nodeId) {
  return (edges || [])
    .filter((e) => !isConditionEdge(e))
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .map((e) => {
      const outgoing = e.source === nodeId;
      const type = e.data?.edgeType || e.type;
      const label = EDGE_LABEL[type] || { out: type, in: type, symmetric: false };
      return {
        id: e.id,
        type,
        outgoing,
        other: outgoing ? e.target : e.source,
        verb: outgoing ? label.out : label.in,
        marker: label.symmetric ? '↔' : (outgoing ? '→' : '←'),
        reason: e.data?.reason || '',
      };
    });
}

/** EVOLUTIO node → the {id, type:'ruleNode', data} this editor renders. */
function fromEvolutio(n) {
  const field = contentFieldOf(n);
  return {
    id: n.nodeId,
    type: 'ruleNode',
    position: n.position || { x: 120, y: 100 },
    data: {
      kind: 'rule',
      key: n.nodeId,
      title: n.title || n.nodeId,
      text: n[field] || '',
      // The node's TYPE is what this graph groups and colours by; `category` is
      // reused as the carrier so the existing canvas and panel keep working.
      category: n.category || 'custom',
      nodeType: n.type,
      contentField: field,
      appliesTo: Array.isArray(n.appliesToNodes) && n.appliesToNodes.length ? n.appliesToNodes : ['all'],
      enabled: String(n.status || 'ACTIVE').toUpperCase() === 'ACTIVE',
      status: n.status || 'ACTIVE',
      immutable: !!n.immutable,
      priority: n.priority ?? 100,
      // Why the rule exists, as recorded on the node. The migrated 22 carry the
      // honest admission that nobody wrote it down.
      rationale: (n.origin && n.origin.rationale) || '',
      isNew: false,
      _raw: n,
    },
  };
}

/** …and back, writing the text to the field this node's type actually compiles. */
function toEvolutio(node) {
  const d = node.data || {};
  const raw = d._raw || { nodeId: d.key || node.id, type: d.nodeType || 'Thesis' };
  const field = d.contentField || contentFieldOf(raw);
  return {
    ...raw,
    nodeId: d.key || node.id,
    type: d.nodeType || raw.type || 'Thesis',
    title: d.title,
    [field]: d.text,
    // `text` is carried in step for the legacy editor that still reads it; the
    // compiler reads the field above.
    text: d.text,
    // DEPRECATED, not "RETIRED" — the ontology allows exactly CANDIDATE | ACTIVE |
    // DEPRECATED, and the editor was writing a fourth value that does not exist.
    // `saveGraph` validates before it writes, so turning a rule OFF and saving failed
    // outright: the toggle rendered, moved, and made the graph unsaveable.
    //
    // DEPRECATED is the right one by the schema's own definition — "retired but
    // retained; deleting a node would orphan every JudgeRecord attributed to it" —
    // which is exactly what a disabled rule is here.
    // `enabled` is a BOOLEAN projection of a three-valued status, so writing it back
    // naively loses information. Two things went wrong here:
    //
    //   1. disabling wrote "RETIRED", which the ontology does not have at all
    //      (CANDIDATE | ACTIVE | DEPRECATED). `saveGraph` validates first, so the
    //      toggle rendered, moved, and made the whole graph unsaveable;
    //   2. mapping every off state to DEPRECATED would DEMOTE a CANDIDATE — a rule
    //      GEPA proposed and no human accepted reads as off, and merely opening the
    //      editor and saving would have rewritten it as "retired", destroying the
    //      distinction between "not accepted yet" and "deliberately withdrawn".
    //
    // So off keeps whatever non-active state it already had, and only an ACTIVE rule
    // becomes DEPRECATED. On always means ACTIVE — that is what the operator just said.
    status: d.enabled === false
      ? (d.status && d.status !== 'ACTIVE' ? d.status : 'DEPRECATED')
      : 'ACTIVE',
    priority: d.priority ?? raw.priority ?? 100,
    // PE-002: the rationale rides on `origin`, which already means "where this node
    // came from and why it is as it is". A new field would have cost an ontology
    // change for something the compiler never reads.
    origin: {
      ...(raw.origin || {}),
      ...(d.isNew ? { kind: 'authored' } : {}),
      ...(d.rationale ? { rationale: d.rationale } : {}),
    },
    position: node.position,
  };
}

/**
 * PE-002 — new rules that would be saved without a reason for existing.
 *
 * Only NEW ones: Ivan's decision was that the 22 inherited rules stay undocumented
 * rather than block anyone's work. So this is a gate on adding to the debt, not on
 * touching it.
 *
 * @returns {Array<{id:string, title:string}>}
 */
function rulesMissingRationale(nodes) {
  return (nodes || [])
    .filter((n) => n.data && n.data.isNew && !String(n.data.rationale || '').trim())
    .map((n) => ({ id: n.id, title: (n.data && (n.data.title || n.data.key)) || n.id }));
}

export {
  fromEvolutio, toEvolutio, contentFieldOf, rulesMissingRationale,
  fromEvolutioEdge, toEvolutioEdge, connectionsOf, isConditionEdge, conflictWouldBlock,
};

/**
 * EC-010 — what the canvas draws.
 *
 * Clean is the default and draws NO edges. That is not timidity: the bands are the
 * order the compiler emits in, which is the order that decides what the model reads,
 * and twenty-three nodes wired together produce a web that hides it. Relations are
 * something you go looking for, so they get their own modes.
 */
export const CANVAS_MODES = ['clean', 'structure', 'conflicts', 'coverage'];
const MODE_EDGES = {
  clean: [],
  structure: ['REFINES', 'DEPENDS_ON', 'ILLUSTRATES'],
  conflicts: ['CONFLICTS_WITH'],
  coverage: [],
};
const MODE_KEY = 'promptEditor.canvasMode';

const storedMode = () => {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return CANVAS_MODES.includes(v) ? v : 'clean';
  } catch { return 'clean'; }
};

/** The edges this mode shows. Conditions are never among them — they are node state. */
function edgesForMode(edges, mode) {
  const allowed = MODE_EDGES[mode] || [];
  if (!allowed.length) return [];
  return (edges || []).filter((e) => allowed.includes(e.data?.edgeType || e.type));
}

export const useRulesStore = create((set, get) => ({
  nodes: [],
  edges: [],
  // Kept across sessions: an operator working through conflicts comes back to the
  // same job, and resetting to Clean would throw away where he was.
  canvasMode: storedMode(),
  coverageByNode: null,   // nodeId → contexts reached, for the coverage mode
  selectedId: null,
  selectedEdgeId: null,
  // Which relation a drag on the canvas creates. The operator picks it in the
  // toolbar BEFORE drawing, the way every graph editor does it — otherwise every
  // connection lands as REFINES and has to be re-typed one at a time afterwards.
  connectType: 'REFINES',
  dirty: false,
  entryId: null,       // graph-catalog entry id (null = unsaved)
  graphName: 'Chat System Prompt',
  version: null,
  graphNamespace: null,   // which graph is open — EVOLUTIO:PROMPT or CHAT_PROMPT
  isEvolutio: false,      // …and therefore which shape toGraph() must produce
  isLiveForAgent: false,  // this entry is the one FLOWDESK_AGENT_PROMPT_ENTRY names
  _history: [],
  _future: [],

  _snapshot() {
    const { nodes, edges } = get();
    return { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
  },
  _push() {
    const h = get()._history.slice(-40);
    h.push(get()._snapshot());
    set({ _history: h, _future: [] });
  },
  undo() {
    const h = get()._history;
    if (!h.length) return;
    const prev = h[h.length - 1];
    set({ nodes: prev.nodes, edges: prev.edges, _history: h.slice(0, -1), _future: [get()._snapshot(), ...get()._future].slice(0, 40), dirty: true });
  },
  redo() {
    const f = get()._future;
    if (!f.length) return;
    const next = f[0];
    set({ nodes: next.nodes, edges: next.edges, _future: f.slice(1), _history: [...get()._history, get()._snapshot()].slice(-40), dirty: true });
  },

  onNodesChange(changes) { set({ nodes: applyNodeChanges(changes, get().nodes) }); },
  onEdgesChange(changes) { set({ edges: applyEdgeChanges(changes, get().edges) }); },
  /**
   * A connection dragged on the canvas. Defaults to REFINES rather than the old
   * 'default'/'ORDER', which the ontology has no value for and which made the graph
   * unsaveable the moment anyone drew one.
   */
  onConnect(params) {
    // The validator refuses a self-loop on every type but APPLIES_WHEN, and a
    // condition is not something you draw — so a drag onto its own node is dropped
    // here rather than saved and rejected later with a message about SELF_EDGE.
    if (params.source === params.target) return;
    // NOT ReactFlow's `addEdge`: it treats a connection as a duplicate by source and
    // target alone, so a second relation of a DIFFERENT type between the same two
    // rules — which the schema allows and the panel offers — was silently dropped.
    // `addConnection` dedupes by (source, target, TYPE), which is the real rule.
    // `addConnection` also selects it and reveals it — Clean mode draws no edges and
    // is the default, so a connection made there used to vanish at the moment of
    // creation: created, saved, invisible, with nothing on screen to say it worked.
    get().addConnection({
      source: params.source, target: params.target, type: get().connectType || 'REFINES',
    });
  },
  /** Add a connection from the properties panel, where the type is chosen up front. */
  addConnection({ source, target, type = 'REFINES', reason = '' }) {
    if (!source || !target || source === target) return null;
    const dup = get().edges.find((e) => e.source === source && e.target === target
      && (e.data?.edgeType || e.type) === type);
    if (dup) return dup.id;
    get()._push();
    const edge = fromEvolutioEdge({ edgeId: uid('e'), source, target, type, reason });
    set({ edges: [...get().edges, edge], dirty: true, selectedEdgeId: edge.id });
    get()._revealEdge(edge);
    return edge.id;
  },
  /**
   * Switch the canvas to a mode that DRAWS this edge.
   *
   * Making a connection and not seeing it is indistinguishable from the connection
   * having failed. The mode is the operator's, so it is only changed when the current
   * one would hide what they just made.
   */
  _revealEdge(edge) {
    const type = edge.data?.edgeType || edge.type;
    const mode = get().canvasMode;
    if ((MODE_EDGES[mode] || []).includes(type)) return;
    get().setCanvasMode(type === 'CONFLICTS_WITH' ? 'conflicts' : 'structure');
  },
  setConnectType(type) { if (EDGE_TYPES.includes(type)) set({ connectType: type }); },
  setSelectedEdge(id) { set({ selectedEdgeId: id, selectedId: id ? null : get().selectedId }); },
  /** How many edges each mode would draw — so a mode chip can say it has nothing. */
  edgeCounts() {
    const edges = get().edges;
    const out = {};
    for (const m of CANVAS_MODES) out[m] = edgesForMode(edges, m).length;
    return out;
  },
  updateConnection(id, patch) {
    set({
      edges: get().edges.map((e) => {
        if (e.id !== id) return e;
        const data = { ...e.data, ...patch };
        // The canvas has to follow the type, or a conflict re-typed to an example
        // keeps reading "conflicts with" in red while the panel says otherwise.
        const t = data.edgeType;
        return {
          ...e, data, label: EDGE_LABEL[t]?.out || t,
          animated: t === 'CONFLICTS_WITH',
          style: { stroke: EDGE_COLOR[t] || '#64748b', strokeWidth: 1.5 },
        };
      }),
      dirty: true,
    });
  },
  removeConnection(id) {
    get()._push();
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
      dirty: true,
    });
  },
  /** The selected connection, as the panel needs it. */
  selectedEdge() {
    const e = get().edges.find((x) => x.id === get().selectedEdgeId);
    if (!e) return null;
    const type = e.data?.edgeType || e.type;
    const title = (id) => {
      const n = get().nodes.find((x) => x.id === id);
      return (n && n.data && (n.data.title || n.data.key)) || id;
    };
    return {
      id: e.id, type, source: e.source, target: e.target,
      sourceTitle: title(e.source), targetTitle: title(e.target),
      reason: e.data?.reason || '',
    };
  },
  /** Reverse a connection — drawn the wrong way round is the commonest mistake. */
  flipConnection(id) {
    get()._push();
    set({
      edges: get().edges.map((e) => (e.id === id ? { ...e, source: e.target, target: e.source } : e)),
      dirty: true,
    });
  },
  /** The selected node's connections, both directions, conditions filtered out. */
  connections(nodeId) { return connectionsOf(get().edges, nodeId); },

  /**
   * EC-009 — the node's condition, or null.
   *
   * The schema ORs multiple APPLIES_WHEN edges on one node, and the editor offers a
   * single group (see ConditionSection). A graph authored elsewhere may still carry
   * two, so the FIRST is read and the rest are left alone rather than silently
   * merged: showing one of two as if it were the whole scope would misstate when the
   * rule applies, and quietly dropping the other would change behaviour on save.
   */
  conditionOf(nodeId) {
    const e = get().edges.find((x) => isConditionEdge(x) && x.source === nodeId);
    return (e && e.data && e.data.condition) || null;
  },
  /** How many conditions this node really has — more than one is not editable here. */
  conditionCount(nodeId) {
    return get().edges.filter((x) => isConditionEdge(x) && x.source === nodeId).length;
  },
  setCondition(nodeId, condition) {
    get()._push();
    const edges = get().edges;
    const existing = edges.find((x) => isConditionEdge(x) && x.source === nodeId);
    if (!condition) {
      // "Always" has to mean always. Removing only the first of several would leave
      // the rule still conditional while the panel reported the opposite — the exact
      // shape of lie this whole section exists to avoid.
      set({ edges: edges.filter((x) => !(isConditionEdge(x) && x.source === nodeId)), dirty: true });
      return;
    }
    if (existing) {
      set({
        edges: edges.map((x) => (x === existing
          ? { ...x, data: { ...x.data, condition } }
          : x)),
        dirty: true,
      });
      return;
    }
    // A self-loop. The operator is never shown it, and `connectionsOf` filters it out
    // of the relations list precisely so it cannot be deleted by someone tidying up.
    set({
      edges: [...edges, fromEvolutioEdge({
        edgeId: uid('c'), source: nodeId, target: nodeId, type: CONDITION_EDGE, condition,
      })],
      dirty: true,
    });
  },
  setSelected(id) { set({ selectedId: id, selectedEdgeId: null }); },

  setCanvasMode(mode) {
    if (!CANVAS_MODES.includes(mode)) return;
    try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* private mode */ }
    set({ canvasMode: mode });
  },
  /** The edges to draw right now. */
  visibleEdges() { return edgesForMode(get().edges, get().canvasMode); },
  /**
   * EC-010a — how many of the nine contexts each rule reaches, so a dead rule is
   * visible ON THE CANVAS rather than only in a report someone has to open.
   * @param {object|null} coverageResult the `matrix` from POST /prompt/coverage
   */
  setCoverage(coverageResult) {
    const m = coverageResult && coverageResult.matrix;
    if (!m) { set({ coverageByNode: null }); return; }
    const byNode = {};
    for (const [nodeId, cells] of Object.entries(m)) {
      byNode[nodeId] = { reached: cells.filter(Boolean).length, total: cells.length };
    }
    set({ coverageByNode: byNode });
  },

  addRule(over = {}, position) {
    get()._push();
    const data = newRuleData(over);
    const node = {
      id: `rule-${data.key}`, type: 'ruleNode',
      position: position || { x: 120 + Math.random() * 160, y: 100 + Math.random() * 200 },
      data,
    };
    set({ nodes: [...get().nodes, node], selectedId: node.id, dirty: true });
    return node.id;
  },
  updateRule(id, patch) {
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      dirty: true,
    });
  },
  commitHistory() { get()._push(); },
  removeRule(id) {
    get()._push();
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
      dirty: true,
    });
  },

  /** Apply AI-assistant mutations [{op:'add'|'update'|'remove', ...}] to the graph. */
  applyMutations(ops) {
    if (!Array.isArray(ops) || !ops.length) return { added: 0, updated: 0, removed: 0 };
    get()._push();
    let nodes = [...get().nodes];
    const byKey = (k) => nodes.find((n) => (n.data?.key === k) || n.id === k || n.id === `rule-${k}`);
    const res = { added: 0, updated: 0, removed: 0 };
    let y = 100 + nodes.length * 20;
    for (const op of ops) {
      if (op.op === 'add' && op.node) {
        const data = newRuleData(op.node);
        nodes.push({ id: `rule-${data.key}`, type: 'ruleNode', position: { x: 420, y: (y += 90) }, data });
        res.added++;
      } else if (op.op === 'update' && op.key) {
        const n = byKey(op.key);
        if (n) { n.data = { ...n.data, ...(op.patch || {}) }; res.updated++; }
      } else if (op.op === 'remove' && op.key) {
        const n = byKey(op.key);
        if (n) { nodes = nodes.filter((x) => x.id !== n.id); res.removed++; }
      }
    }
    set({ nodes, dirty: true });
    return res;
  },

  loadGraph({ nodes, edges, entryId, name, version, namespace, isLiveForAgent }) {
    const list = nodes || [];
    // An EVOLUTIO graph arrives as typed nodes with no `data`; a legacy CHAT_PROMPT
    // graph arrives as ReactFlow nodes. Both are accepted — the editor should not
    // break because it was pointed at the other one.
    const evolutio = list.some(isEvolutioNode);
    // The EVOLUTIO graph has no edges and its stored positions are a migration
    // artefact (a single column of 22), so it is laid out by what it actually has:
    // node type and priority (promptLayout). A legacy rule graph keeps the positions
    // its author arranged.
    const nn = evolutio
      ? layoutByPriority(list.map((n) => (isEvolutioNode(n) ? fromEvolutio(n) : n)))
      : list.map((n) => ({
        ...n,
        type: n.type === 'ruleNode' || (n.data && n.data.kind !== 'section') ? 'ruleNode' : (n.type || 'ruleNode'),
        data: { ...newRuleData(), ...(n.data || {}) },
      }));
    // EVOLUTIO edges are `{edgeId, type, source, target}` — no `id`, and a `type` that
    // names a RELATION rather than a ReactFlow renderer. Handed to the canvas raw they
    // would not draw at all, and would come back out of `toGraph` with `edgeId:
    // undefined`: opening the editor and pressing Save would have wiped the graph's
    // edges. Harmless while the live graph has none, which is exactly why it had to be
    // fixed before this release gives operators a way to make some.
    const ee = evolutio ? (edges || []).map(fromEvolutioEdge) : (edges || []);
    set({
      nodes: nn, edges: ee, entryId: entryId ?? get().entryId,
      graphName: name || get().graphName, version: version ?? null,
      // Which graph is on screen. Shown in the toolbar, because an editor that does
      // not say what it is editing is how the wrong graph gets tuned for a week.
      graphNamespace: namespace || (evolutio ? 'EVOLUTIO:PROMPT' : 'CHAT_PROMPT'),
      isEvolutio: evolutio,
      isLiveForAgent: !!isLiveForAgent,
      selectedId: null, dirty: false, _history: [], _future: [],
    });
  },
  /** The graph in the shape its own backend expects. */
  /** Re-arrange by type and priority — the only structure this graph has. */
  relayout() {
    if (!get().isEvolutio) return;
    get()._push();
    set({ nodes: layoutByPriority(get().nodes), dirty: true });
  },
  toGraph() {
    const { nodes, edges, isEvolutio } = get();
    if (!isEvolutio) return { nodes, edges };
    return {
      nodes: nodes.map(toEvolutio),
      edges: (edges || []).map(toEvolutioEdge),
    };
  },
  /** New rules still missing the reason they exist (PE-002). Empty = safe to save. */
  missingRationale() { return rulesMissingRationale(get().nodes); },
  setSaved({ entryId, version, name }) {
    set({
      entryId: entryId ?? get().entryId, version: version ?? get().version,
      graphName: name || get().graphName, dirty: false,
      // Once persisted a rule is no longer new: its rationale is on the node, and
      // later edits are governed by the change reason on the version instead.
      nodes: get().nodes.map((n) => (n.data && n.data.isNew ? { ...n, data: { ...n.data, isNew: false } } : n)),
    });
  },
  setName(name) { set({ graphName: name, dirty: true }); },
  reset() { set({ nodes: [], edges: [], selectedId: null, dirty: false, entryId: null, version: null, _history: [], _future: [] }); },
}));
