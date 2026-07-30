'use strict';

/**
 * EVOLUTIO:PROMPT validator (Suada Phase 1) — everything that must hold before a
 * prompt graph may be compiled or applied.
 *
 * Two layers, in order:
 *   1. Schema conformance (ajv, draft-07) against evolutio-prompt.schema.json.
 *   2. Graph-level rules the schema cannot express: acyclic REFINES, no live
 *      CONFLICTS_WITH pair, DEPENDS_ON closure, orphan exemplars, and nodes that
 *      can never reach an engine node.
 *
 * Returns the {ok, errors, warnings, stats} shape the FlowDesk prompt actions
 * already use, so the admin surfaces need no new vocabulary.
 *
 * Errors block compilation. Warnings do not: one misdirected rule must not make
 * the other twenty-one unapplicable — the operator has to SEE the problem, not
 * be stopped by it. The exception is CONFLICTS_WITH, which is an error by
 * ratified decision (see checkConflicts).
 *
 * @module services/evolutio/evolutio-prompt.validator
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMA = require('./contracts/evolutio-prompt.schema.json');
const { ENGINE_NODES } = require('./evolutio-prompt.constants');

let _validateSchema = null;
function schemaValidator() {
  if (!_validateSchema) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    try { addFormats(ajv); } catch { /* formats optional — date-time then goes unchecked */ }
    _validateSchema = ajv.compile(SCHEMA);
  }
  return _validateSchema;
}

const err = (code, message, nodeId) => ({ code, message, ...(nodeId ? { nodeId } : {}) });

/** Nodes a compilation could ever emit — DEPRECATED and CANDIDATE never reach the model. */
const isLive = (n) => n.status === 'ACTIVE';

/**
 * The engine nodes a node governs. Empty appliesToNodes means all of them; a list
 * naming only unknown names means NONE (never "all") — the inverted default that
 * turned a dead rule into a global one in TASK-FLOWDESK-BUG-001.
 */
function reachedEngineNodes(node) {
  const declared = Array.isArray(node.appliesToNodes) ? node.appliesToNodes : [];
  if (!declared.length) return [...ENGINE_NODES];
  return declared.filter((n) => ENGINE_NODES.includes(n));
}

// ── graph-level checks ────────────────────────────────────────────────────────

function checkIdentity(nodes, edges, errors) {
  const seen = new Set();
  for (const n of nodes) {
    if (seen.has(n.nodeId)) errors.push(err('DUP_NODE_ID', `duplicate nodeId "${n.nodeId}"`, n.nodeId));
    seen.add(n.nodeId);
  }
  const edgeIds = new Set();
  for (const e of edges) {
    if (edgeIds.has(e.edgeId)) errors.push(err('DUP_EDGE_ID', `duplicate edgeId "${e.edgeId}"`));
    edgeIds.add(e.edgeId);
    if (!seen.has(e.source)) errors.push(err('DANGLING_EDGE', `edge ${e.edgeId} source "${e.source}" does not exist`));
    if (!seen.has(e.target)) errors.push(err('DANGLING_EDGE', `edge ${e.edgeId} target "${e.target}" does not exist`));
    if (e.source === e.target) errors.push(err('SELF_EDGE', `edge ${e.edgeId} joins "${e.source}" to itself`, e.source));
  }
  return seen;
}

/**
 * REFINES must be acyclic: a cycle is a definitional error (A specialises B
 * specialises A says nothing), not a stylistic one. Kahn — anything left over
 * when the queue empties is in a cycle.
 */
function checkRefinesAcyclic(nodes, edges, errors) {
  const ids = nodes.map((n) => n.nodeId);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (e.type !== 'REFINES') continue;
    if (!adj.has(e.source) || !indeg.has(e.target)) continue;
    adj.get(e.source).push(e.target);
    indeg.set(e.target, indeg.get(e.target) + 1);
  }
  const queue = ids.filter((id) => indeg.get(id) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    for (const t of adj.get(id)) {
      indeg.set(t, indeg.get(t) - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  if (visited !== ids.length) {
    const inCycle = ids.filter((id) => indeg.get(id) > 0);
    errors.push(err('REFINES_CYCLE', `REFINES cycle among: ${inCycle.join(', ')}`));
  }
}

/** Do two condition sets have any context in common? Used to test conflict separation. */
function conditionsIntersect(a, b) {
  if (!a || !b) return true; // an unconditioned node applies everywhere
  const keys = ['language', 'engineNode', 'serviceId', 'activeRoute'];
  for (const k of keys) {
    if (Array.isArray(a[k]) && Array.isArray(b[k]) && !a[k].some((v) => b[k].includes(v))) return false;
  }
  if (a.channel && b.channel && a.channel !== b.channel) return false;
  return true;
}

/** All APPLIES_WHEN conditions on a node (ORed). Empty = applies unconditionally. */
function conditionsOf(nodeId, edges) {
  return edges.filter((e) => e.type === 'APPLIES_WHEN' && e.source === nodeId && e.condition).map((e) => e.condition);
}

/**
 * CONFLICTS_WITH between two live nodes is an ERROR, by ratified decision.
 * Contradictory instructions are the commonest cause of unstable model behaviour,
 * and they arrive exactly when an optimizer adds a thesis without knowing what is
 * already there. An override-with-justification was considered and rejected: the
 * justification can be written by anyone, and the conflict then becomes invisible
 * to the mutation operator.
 *
 * The sanctioned resolution is to separate the two via APPLIES_WHEN so they can
 * never be selected together. This function honours that: if every condition pair
 * is disjoint, the conflict cannot arise and is not reported.
 */
function checkConflicts(nodes, edges, errors) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const e of edges) {
    if (e.type !== 'CONFLICTS_WITH') continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b || !isLive(a) || !isLive(b)) continue;

    // Scope separation: no shared engine node means they never meet.
    const ra = reachedEngineNodes(a);
    const rb = reachedEngineNodes(b);
    if (!ra.some((x) => rb.includes(x))) continue;

    const ca = conditionsOf(a.nodeId, edges);
    const cb = conditionsOf(b.nodeId, edges);
    const separated = ca.length && cb.length && ca.every((x) => cb.every((y) => !conditionsIntersect(x, y)));
    if (separated) continue;

    errors.push(err(
      'ACTIVE_CONFLICT',
      `"${a.nodeId}" conflicts with "${b.nodeId}" and both are ACTIVE in the same context` +
      `${e.reason ? ` (${e.reason})` : ''}. Retire one, merge them, or separate them with mutually exclusive APPLIES_WHEN conditions.`,
      a.nodeId
    ));
  }
}

/**
 * DEPENDS_ON: a node is only meaningful when its prerequisite is present. A live
 * node depending on one that can never be emitted is broken — it will compile
 * into a sentence whose premise is missing.
 */
function checkDependencies(nodes, edges, errors, warnings) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const e of edges) {
    if (e.type !== 'DEPENDS_ON') continue;
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to || !isLive(from)) continue;
    if (!isLive(to)) {
      errors.push(err('DEAD_DEPENDENCY',
        `"${from.nodeId}" depends on "${to.nodeId}", which is ${to.status} and will never be emitted`, from.nodeId));
      continue;
    }
    const rFrom = reachedEngineNodes(from);
    const rTo = reachedEngineNodes(to);
    const uncovered = rFrom.filter((x) => !rTo.includes(x));
    if (uncovered.length) {
      warnings.push(err('DEPENDENCY_NARROWER',
        `"${from.nodeId}" reaches ${uncovered.join(', ')} where its prerequisite "${to.nodeId}" does not`, from.nodeId));
    }
  }
}

function checkExemplars(nodes, edges, warnings) {
  const illustrated = new Set(edges.filter((e) => e.type === 'ILLUSTRATES').map((e) => e.source));
  for (const n of nodes) {
    if (n.type !== 'Exemplar' || !isLive(n)) continue;
    if (!illustrated.has(n.nodeId)) {
      // Usually a missing thesis: the example teaches something no rule states.
      warnings.push(err('ORPHAN_EXEMPLAR',
        `exemplar "${n.nodeId}" illustrates nothing — it teaches behaviour no Thesis or Constraint states`, n.nodeId));
    }
  }
  for (const e of edges) {
    if (e.type !== 'ILLUSTRATES') continue;
    const src = nodes.find((n) => n.nodeId === e.source);
    if (src && src.type !== 'Exemplar') {
      warnings.push(err('ILLUSTRATES_FROM_NON_EXEMPLAR',
        `ILLUSTRATES should start at an Exemplar; "${e.source}" is a ${src.type}`, e.source));
    }
  }
}

function checkReachability(nodes, warnings) {
  for (const n of nodes) {
    if (!isLive(n)) continue;
    const declared = Array.isArray(n.appliesToNodes) ? n.appliesToNodes : [];
    if (declared.length && !reachedEngineNodes(n).length) {
      warnings.push(err('NODE_REACHES_NO_ENGINE_NODE',
        `"${n.nodeId}" applies only to unknown engine nodes (${declared.join(', ')}) — it will govern nothing. ` +
        `Known: ${ENGINE_NODES.join(', ')}, or leave the list empty for all.`, n.nodeId));
    }
  }
}

function checkConstraints(nodes, warnings) {
  const live = nodes.filter(isLive);
  if (live.length && !live.some((n) => n.type === 'Constraint')) {
    warnings.push(err('NO_CONSTRAINT', 'the graph states no Constraint — the assistant has no hard limit'));
  }
  if (live.length && !live.some((n) => n.type === 'Narrative' || (n.type === 'Thesis' && n.category === 'identity'))) {
    warnings.push(err('NO_IDENTITY', 'no Narrative and no identity Thesis — the assistant has no stated identity'));
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

/**
 * @param {{schemaVersion:string, nodes:Array, edges:Array}} graph
 * @returns {{ok:boolean, errors:Array, warnings:Array, stats:object}}
 */
function validateGraph(graph) {
  const errors = [];
  const warnings = [];
  const g = graph || {};

  const validate = schemaValidator();
  if (!validate(g)) {
    for (const e of validate.errors || []) {
      errors.push(err('SCHEMA', `${e.instancePath || '(root)'} ${e.message}`));
    }
    // Graph-level checks assume a well-formed shape; running them on a malformed
    // graph would bury the real cause under derived noise.
    return { ok: false, errors, warnings, stats: { nodes: 0, edges: 0, live: 0 } };
  }

  const nodes = g.nodes || [];
  const edges = g.edges || [];

  checkIdentity(nodes, edges, errors);
  checkRefinesAcyclic(nodes, edges, errors);
  checkConflicts(nodes, edges, errors);
  checkDependencies(nodes, edges, errors, warnings);
  checkExemplars(nodes, edges, warnings);
  checkReachability(nodes, warnings);
  checkConstraints(nodes, warnings);

  const live = nodes.filter(isLive);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      live: live.length,
      byType: live.reduce((a, n) => ({ ...a, [n.type]: (a[n.type] || 0) + 1 }), {}),
      immutableConstraints: live.filter((n) => n.type === 'Constraint' && n.immutable).length,
    },
  };
}

module.exports = {
  validateGraph,
  reachedEngineNodes,
  conditionsIntersect,
  conditionsOf,
  isLive,
};
