'use strict';

/**
 * Prompt-graph validator (ADMIN P6) — checks a rules graph BEFORE it can be
 * compiled/applied. Reuses the platform's generic GraphValidator for structural
 * integrity (unique ids, dangling edges, cycles via Kahn), then adds rules-domain
 * checks. Returns the same {ok, errors, warnings} shape the admin actions use.
 *
 * @module instances/flowdesk/services/prompt-graph-validator
 */

const { PROMPT_NODES, CATEGORY_ORDER } = require('./prompt-graph-compiler');

let _GraphValidator = null;
function structuralValidate(graph) {
  try {
    if (!_GraphValidator) _GraphValidator = require('../../../services/graph/graph-validator').GraphValidator;
    const v = new _GraphValidator({ allowCycles: false, requireEntryExit: false, requireConnected: false });
    return v.validate({ nodes: graph.nodes || [], edges: graph.edges || [] });
  } catch (e) {
    // The generic validator assumes executor/tool nodes for some checks; if it
    // errors on a rules graph, fall back to our own structural pass below.
    return null;
  }
}

const isRule = (n) => n && n.data && n.data.kind !== 'section';

/** @returns {{ok:boolean, errors:Array<{code,message,nodeId?}>, warnings:Array, stats:object}} */
function validatePromptGraph(graph) {
  const nodes = (graph && graph.nodes) || [];
  const edges = (graph && graph.edges) || [];
  const errors = [];
  const warnings = [];

  // ── structural (generic validator, best-effort) ──
  const struct = structuralValidate({ nodes, edges });
  if (struct && Array.isArray(struct.errors)) {
    for (const e of struct.errors) {
      const msg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
      // Cycle / duplicate-id / dangling-edge are meaningful for a rules graph too.
      if (/cycle|duplicate|dangling|missing (source|target)|not found/i.test(msg)) {
        errors.push({ code: 'STRUCTURE', message: msg, nodeId: e.nodeId });
      }
    }
  }
  // Always run our own id/edge integrity (independent of the generic validator).
  const ids = new Set();
  for (const n of nodes) {
    if (!n.id) { errors.push({ code: 'NODE_NO_ID', message: 'a node has no id' }); continue; }
    if (ids.has(n.id)) errors.push({ code: 'DUP_ID', message: `duplicate node id ${n.id}`, nodeId: n.id });
    ids.add(n.id);
  }
  for (const e of edges) {
    const s = e.source ?? e.sourceNodeId; const t = e.target ?? e.targetNodeId;
    if (!ids.has(s)) errors.push({ code: 'DANGLING_EDGE', message: `edge source ${s} not found` });
    if (!ids.has(t)) errors.push({ code: 'DANGLING_EDGE', message: `edge target ${t} not found` });
    if (s === t) warnings.push({ code: 'SELF_LOOP', message: `rule ${s} links to itself`, nodeId: s });
  }

  // ── rules-domain checks ──
  const rules = nodes.filter(isRule);
  const keys = new Map();
  let enabledCount = 0;
  let identityCount = 0;
  for (const n of rules) {
    const d = n.data || {};
    const key = String(d.key || d.title || n.id).trim();
    if (!String(d.text || '').trim()) {
      if (d.enabled !== false) errors.push({ code: 'EMPTY_RULE', message: `rule "${key}" has empty text`, nodeId: n.id });
    }
    if (d.category && !CATEGORY_ORDER.includes(d.category)) {
      warnings.push({ code: 'UNKNOWN_CATEGORY', message: `rule "${key}" has unknown category "${d.category}" (→ custom)`, nodeId: n.id });
    }
    if (Array.isArray(d.appliesTo)) {
      for (const a of d.appliesTo) {
        if (a !== 'all' && !PROMPT_NODES.includes(a)) {
          warnings.push({ code: 'UNKNOWN_APPLIESTO', message: `rule "${key}" appliesTo "${a}" is not a known chat node`, nodeId: n.id });
        }
      }
    }
    if (keys.has(key)) errors.push({ code: 'DUP_RULE_KEY', message: `duplicate rule key "${key}"`, nodeId: n.id });
    keys.set(key, n.id);
    if (d.enabled !== false) enabledCount += 1;
    if (d.category === 'identity' && d.enabled !== false && String(d.text || '').trim()) identityCount += 1;
  }

  if (!rules.length) errors.push({ code: 'NO_RULES', message: 'the graph has no rule nodes' });
  else if (!enabledCount) errors.push({ code: 'NO_ENABLED_RULES', message: 'no enabled rule with text — the prompt would be empty' });
  if (rules.length && !identityCount) warnings.push({ code: 'NO_IDENTITY', message: 'no identity/role rule — the assistant has no stated identity' });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { nodes: nodes.length, rules: rules.length, enabled: enabledCount, edges: edges.length, identity: identityCount },
  };
}

module.exports = { validatePromptGraph };
