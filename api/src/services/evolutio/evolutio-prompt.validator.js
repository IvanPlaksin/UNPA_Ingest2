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

function checkIdentity(nodes, edges, errors, warnings) {
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
    // APPLIES_WHEN is an ANNOTATION, not a relation: the condition belongs to the
    // source node and `nodeApplies` never looks at the target. The schema still
    // requires one, so the convention is target === source — which the self-edge rule
    // rejected, making a declared edge type impossible to express. Exempted here, and
    // required to be a self-loop so it cannot be mistaken for a relation to another
    // node.
    if (e.type === 'APPLIES_WHEN') {
      // The TARGET is not read by anything: `nodeApplies` looks only at the source, so
      // the condition is an annotation on its own node. Both conventions exist in this
      // codebase — a self-loop and a pointer at some other node — and neither changes
      // what compiles. Saying so is better than silently blessing a line that reads
      // like a relationship and is not one.
      if (e.source !== e.target) {
        warnings.push(err(
          'APPLIES_WHEN_TARGET_IGNORED',
          `edge ${e.edgeId} is APPLIES_WHEN and points at "${e.target}", but the target of a `
          + 'condition is never read — it applies to its source. Point it at itself to say so.',
          e.source,
        ));
      }
    } else if (e.source === e.target) {
      errors.push(err('SELF_EDGE', `edge ${e.edgeId} joins "${e.source}" to itself`, e.source));
    }
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
  // EC-001: the agent's dimensions belong here too. Without `phase`, two rules kept
  // apart by phase would look simultaneous, and the CONFLICTS_WITH check would report
  // a contradiction that cannot happen — a false error on a correct graph.
  const keys = ['language', 'engineNode', 'serviceId', 'activeRoute', 'phase', 'serviceCategory', 'toolContext'];
  for (const k of keys) {
    if (Array.isArray(a[k]) && Array.isArray(b[k]) && !a[k].some((v) => b[k].includes(v))) return false;
  }
  if (a.channel && b.channel && a.channel !== b.channel) return false;
  return true;
}

/** Phases that only exist once a request is open — see dialogue-phase.computePhase. */
const PHASES_WITH_DRAFT = new Set(['fill', 'confirm']);
const ALL_PHASES = ['intent', 'service_choice', 'fill', 'confirm', 'reading', 'handed_off'];

/**
 * EC-006 — a condition that cannot hold, and one that always holds.
 *
 * Both are silent failures of the same family: the first removes a rule from every
 * prompt while looking deliberate, the second adds a line of ceremony that changes
 * nothing. Neither shows up as an error anywhere else, because a condition is only
 * ever evaluated — never questioned.
 */
function checkConditionsSane(nodes, edges, errors, warnings) {
  for (const e of edges) {
    if (e.type !== 'APPLIES_WHEN' || !e.condition) continue;
    const c = e.condition;

    // Filling and confirming both require an open request, so pairing either with
    // "no draft" describes a turn that cannot occur.
    if (Array.isArray(c.phase) && Array.isArray(c.toolContext)
      && c.phase.every((p) => PHASES_WITH_DRAFT.has(p))
      && c.toolContext.length === 1 && c.toolContext[0] === 'no_draft') {
      errors.push(err(
        'CONDITION_UNSATISFIABLE',
        `edge ${e.edgeId}: phase ${c.phase.join('/')} only happens with a request open, so `
        + '"no_draft" can never hold at the same time — this rule would never apply',
        e.source,
      ));
    }

    // A key that lists every possible value constrains nothing.
    if (Array.isArray(c.phase) && ALL_PHASES.every((p) => c.phase.includes(p)) && Object.keys(c).length === 1) {
      warnings.push(err(
        'CONDITION_ALWAYS_TRUE',
        `edge ${e.edgeId} lists every phase, which is the same as having no condition — remove it`,
        e.source,
      ));
    }

    // The same mistake in the other dimension: a request is either open or it is not,
    // so requiring both exhausts the possibilities and constrains nothing. Added when
    // the editor's live diagnosis (EC-009) caught it and this did not — one of the two
    // had to become the authority, and it is this one.
    if (Array.isArray(c.toolContext) && Object.keys(c).length === 1
      && c.toolContext.includes('has_draft') && c.toolContext.includes('no_draft')) {
      warnings.push(err(
        'CONDITION_ALWAYS_TRUE',
        `edge ${e.edgeId} requires a request to be either open or not, which is always true — remove it`,
        e.source,
      ));
    }
  }
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

/**
 * EC-006 — safety is not contextual.
 *
 * `SUADA-COMPILE-001` requires every immutable Constraint to reach the compiled text,
 * and compilation FAILS when one does not. A condition on such a node would therefore
 * not fail at save time, when someone is looking: it would fail in whichever branch of
 * the conversation the condition excluded — in front of a user, on a live turn.
 *
 * That is the whole meaning of the word: an immutable constraint applies everywhere or
 * it is not immutable.
 */
function checkImmutableUnconditional(nodes, edges, errors) {
  const immutable = new Set(
    nodes.filter((n) => n.type === 'Constraint' && n.immutable).map((n) => n.nodeId),
  );
  if (!immutable.size) return;
  for (const e of edges) {
    if (e.type !== 'APPLIES_WHEN' || !immutable.has(e.source)) continue;
    errors.push(err(
      'IMMUTABLE_CONDITIONAL',
      `"${e.source}" is an immutable Constraint and cannot carry APPLIES_WHEN: it would `
      + 'be excluded in some contexts, and the compile checks that every immutable '
      + 'constraint reached the prompt — so this fails on a live turn, not on save',
    ));
  }
}

/**
 * EC-005 — which kinds of rule may be contextual at all.
 *
 * The prompt compiles in two layers: an unconditional core that is byte-identical for
 * everyone (and therefore cacheable) and a conditional block after it. What goes where
 * is decided by whether a node carries a condition — so the question "may this type be
 * conditional?" is really "may this type leave the cached core?".
 *
 *   Narrative  — no. It states who the assistant IS, and an identity that changes with
 *                the phase of a conversation is not an identity.
 *   Persona    — only by `channel`. The register is genuinely different spoken aloud;
 *                that is the case `channel` exists for. Scoping it by phase would give
 *                the assistant a different manner in every part of one conversation.
 *   Constraint — immutable never (checked separately: safety is not contextual);
 *                an ordinary one may be, it is a strong rule rather than an absolute.
 *   Thesis / Exemplar / ToolContract — yes. These are instructions, and instructions
 *                are what a branch of the dialogue legitimately changes.
 */
function checkConditionableTypes(nodes, edges, errors) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const e of edges) {
    if (e.type !== 'APPLIES_WHEN' || !e.condition) continue;
    const n = byId.get(e.source);
    if (!n) continue;

    if (n.type === 'Narrative') {
      errors.push(err(
        'NARRATIVE_CONDITIONAL',
        `"${n.nodeId}" is a Narrative and cannot be conditional: it states who the assistant is, `
        + 'and an identity that changes with the phase of a conversation is not an identity',
        n.nodeId,
      ));
      continue;
    }
    if (n.type === 'Persona') {
      const keys = Object.keys(e.condition);
      const offending = keys.filter((k) => k !== 'channel');
      if (offending.length) {
        errors.push(err(
          'PERSONA_CONDITION_NOT_CHANNEL',
          `"${n.nodeId}" is a Persona: it may be scoped by channel — the spoken register really `
          + `does differ — but not by ${offending.join(', ')}, which would give the assistant a `
          + 'different manner in different parts of one conversation',
          n.nodeId,
        ));
      }
    }
  }
}

/**
 * EC-005 — a dependency must not cross from the core into the conditional layer.
 *
 * The core is emitted first and the conditional block after it, so an unconditional
 * node that DEPENDS_ON a conditional one is read BEFORE its own premise — when the
 * premise is present at all. The compiler's DEPENDS_ON closure would drag the
 * prerequisite in, but it cannot reorder the layers, and a sentence whose premise
 * follows it is worse than one whose premise is missing.
 *
 * The other direction is fine: a conditional node depending on an unconditional one
 * reads after a premise that is always there.
 */
function checkLayerDependencies(nodes, edges, errors) {
  const conditional = new Set(
    edges.filter((e) => e.type === 'APPLIES_WHEN' && e.condition).map((e) => e.source),
  );
  if (!conditional.size) return;
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const e of edges) {
    if (e.type !== 'DEPENDS_ON') continue;
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (!conditional.has(e.source) && conditional.has(e.target)) {
      errors.push(err(
        'DEPENDENCY_CROSSES_LAYERS',
        `"${e.source}" is unconditional but depends on "${e.target}", which is conditional: the `
        + 'unconditional core is emitted before the conditional block, so this rule would be read '
        + 'before its own premise',
        e.source,
      ));
    }
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

  checkIdentity(nodes, edges, errors, warnings);
  checkRefinesAcyclic(nodes, edges, errors);
  checkConflicts(nodes, edges, errors);
  checkDependencies(nodes, edges, errors, warnings);
  checkExemplars(nodes, edges, warnings);
  checkReachability(nodes, warnings);
  checkConstraints(nodes, warnings);
  checkImmutableUnconditional(nodes, edges, errors);
  checkConditionsSane(nodes, edges, errors, warnings);
  checkConditionableTypes(nodes, edges, errors);
  checkLayerDependencies(nodes, edges, errors);

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
