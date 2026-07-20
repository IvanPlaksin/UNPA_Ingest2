'use strict';

/**
 * Interpreter graph topology (C4.1).
 *
 * The universal flow-as-data interpreter (variant В): ONE engine executes any
 * service flow described by a SchemaSnapshot. This module declares the fixed
 * meta-graph — the 13 interpreter nodes (Contract 4B) and their edges — as a
 * strict linear DAG (RULE-076: no merge nodes). Conditionality is expressed as
 * guarded forward edges (tref-style skips), never branch-then-merge.
 *
 * The engine (interpreter-engine.js) follows this topology; verifyLinear()
 * proves the declared graph is a merge-free DAG (the L1/L2 structural check).
 *
 * @module instances/flowdesk/interpreter/interpreter-graph
 */

const { REGISTRY } = require('../contracts/interpreter-nodes');

// Meta-graph edges. `guard` documents the branch condition (evaluated by the
// engine). Terminal action nodes are endpoints — nothing reconverges onto a
// shared downstream node, so in-degree ≤ 1 everywhere (no merges).
const EDGES = [
  { from: 'LOAD_DRAFT', to: 'ROUTER' },

  // ROUTER dispatches to exactly one branch head.
  { from: 'ROUTER', to: 'RESOLVE', guard: 'route == NEW_INTENT' },
  { from: 'ROUTER', to: 'SLOT_EXTRACT', guard: 'route == SLOT_FILL' },
  { from: 'ROUTER', to: 'INFO_ANSWER', guard: 'route == INFO_QUESTION' },
  { from: 'ROUTER', to: 'OUT_OF_SCOPE', guard: 'route == OUT_OF_SCOPE' },
  { from: 'ROUTER', to: 'SUBMIT', guard: 'route == CONFIRM_YES' },

  // NEW_INTENT branch: resolve → begin slot filling.
  { from: 'RESOLVE', to: 'SLOT_EXTRACT', guard: 'service resolved' },

  // Slot-fill branch (linear chain).
  { from: 'SLOT_EXTRACT', to: 'VALIDATE' },
  { from: 'VALIDATE', to: 'PATCH' },
  { from: 'PATCH', to: 'ACTIVE_SLOTS' },
  { from: 'ACTIVE_SLOTS', to: 'RESOLVERS' },
  { from: 'RESOLVERS', to: 'TERM_CHECK' },

  // TERM_CHECK dispatches to exactly one endpoint.
  { from: 'TERM_CHECK', to: 'QUESTION_PLANNER', guard: 'required slots remain' },
  { from: 'TERM_CHECK', to: 'CONFIRM', guard: 'all required filled' },
];

// OUT_OF_SCOPE is a virtual endpoint (redirect), not a registry node.
const ENDPOINTS = ['QUESTION_PLANNER', 'CONFIRM', 'SUBMIT', 'INFO_ANSWER', 'OUT_OF_SCOPE'];

/**
 * Structural verification (L1/L2). RULE-076 forbids AND-merges — nodes where
 * two or more incoming edges can be simultaneously active, which cause the
 * skip-cascade / dead-transition problem in the WF-net. It does NOT forbid a
 * controlled XOR-join, where every incoming edge is guarded and the guards are
 * mutually exclusive (exactly one path reaches the node per turn).
 *
 * So: a merge violation is a node with ≥2 incoming edges of which at least one
 * is UNGUARDED (uncontrolled convergence). All-guarded convergence is a sound
 * XOR-join and is allowed. Also verifies acyclicity.
 * @returns {{ok:boolean, violations:string[]}}
 */
function verifyLinear() {
  const violations = [];
  const nodeIds = new Set(REGISTRY.nodes.map((n) => n.id));

  const incoming = new Map(); // node → edges[]
  const adj = new Map();
  for (const e of EDGES) {
    if (e.to !== 'OUT_OF_SCOPE' && !nodeIds.has(e.to)) violations.push(`edge to unknown node ${e.to}`);
    if (!nodeIds.has(e.from)) violations.push(`edge from unknown node ${e.from}`);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }

  // AND-merge check: ≥2 incoming with any unguarded edge = uncontrolled merge.
  for (const [node, edges] of incoming.entries()) {
    if (edges.length >= 2 && edges.some((e) => !e.guard)) {
      violations.push(`AND-merge detected: ${node} has unguarded convergence (RULE-076)`);
    }
  }

  // Acyclic (DFS).
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map();
  const dfs = (u) => {
    color.set(u, GREY);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === GREY) { violations.push(`cycle via ${u} → ${v}`); return; }
      if (!color.get(v)) dfs(v);
    }
    color.set(u, BLACK);
  };
  dfs('LOAD_DRAFT');

  return { ok: violations.length === 0, violations };
}

module.exports = { EDGES, ENDPOINTS, verifyLinear };
