/**
 * Rules-graph editor store (P6) — one rule = one node. Self-contained Zustand
 * store modeled on the platform's structuralEditorStore: nodes/edges + CRUD +
 * mutations-apply (from the AI assistant) + load/save + undo/redo.
 */
import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
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
  text: '', appliesTo: ['all'], enabled: true, priority: 100, ...over,
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
const CONTENT_FIELD = { Thesis: 'assertion', Narrative: 'narrative', Persona: 'persona', Constraint: 'rule' };

/** Which field holds this node's text, whatever type it claims to be. */
const contentFieldOf = (node) => CONTENT_FIELD[node && node.type]
  || ['assertion', 'narrative', 'persona', 'rule', 'text'].find((f) => node && node[f] != null)
  || 'assertion';

const isEvolutioNode = (n) => !!(n && n.nodeId && n.type && !n.data);

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
    status: d.enabled === false ? 'RETIRED' : (d.status || 'ACTIVE'),
    priority: d.priority ?? raw.priority ?? 100,
    position: node.position,
  };
}

export { fromEvolutio, toEvolutio, contentFieldOf };

export const useRulesStore = create((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,
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
  onConnect(params) { get()._push(); set({ edges: addEdge({ ...params, id: uid('e'), type: 'default' }, get().edges), dirty: true }); },
  setSelected(id) { set({ selectedId: id }); },

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
    set({
      nodes: nn, edges: edges || [], entryId: entryId ?? get().entryId,
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
      edges: (edges || []).map((e) => ({ ...(e.__raw || {}), edgeId: e.id, source: e.source, target: e.target, type: e.data?.edgeType || e.type || 'ORDER' })),
    };
  },
  setSaved({ entryId, version, name }) { set({ entryId: entryId ?? get().entryId, version: version ?? get().version, graphName: name || get().graphName, dirty: false }); },
  setName(name) { set({ graphName: name, dirty: true }); },
  reset() { set({ nodes: [], edges: [], selectedId: null, dirty: false, entryId: null, version: null, _history: [], _future: [] }); },
}));
