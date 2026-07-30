/**
 * Rules-graph editor store (P6) — one rule = one node. Self-contained Zustand
 * store modeled on the platform's structuralEditorStore: nodes/edges + CRUD +
 * mutations-apply (from the AI assistant) + load/save + undo/redo.
 */
import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';

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

export const useRulesStore = create((set, get) => ({
  nodes: [],
  edges: [],
  selectedId: null,
  dirty: false,
  entryId: null,       // graph-catalog entry id (null = unsaved)
  graphName: 'Chat System Prompt',
  version: null,
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

  loadGraph({ nodes, edges, entryId, name, version }) {
    // Normalise: ensure every rule node has type 'ruleNode' + a data.kind.
    const nn = (nodes || []).map((n) => ({
      ...n,
      type: n.type === 'ruleNode' || (n.data && n.data.kind !== 'section') ? 'ruleNode' : (n.type || 'ruleNode'),
      data: { ...newRuleData(), ...(n.data || {}) },
    }));
    set({
      nodes: nn, edges: edges || [], entryId: entryId ?? get().entryId,
      graphName: name || get().graphName, version: version ?? null,
      selectedId: null, dirty: false, _history: [], _future: [],
    });
  },
  toGraph() { const { nodes, edges } = get(); return { nodes, edges }; },
  setSaved({ entryId, version, name }) { set({ entryId: entryId ?? get().entryId, version: version ?? get().version, graphName: name || get().graphName, dirty: false }); },
  setName(name) { set({ graphName: name, dirty: true }); },
  reset() { set({ nodes: [], edges: [], selectedId: null, dirty: false, entryId: null, version: null, _history: [], _future: [] }); },
}));
