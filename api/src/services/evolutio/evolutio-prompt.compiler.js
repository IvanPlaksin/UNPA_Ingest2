'use strict';

/**
 * EVOLUTIO:PROMPT compiler (Suada Phase 1) — a graph plus a context becomes
 * prompt text plus a manifest.
 *
 * Pure and deterministic: the same (graph, context) yields byte-identical text.
 * That is not a nicety — ChatTurn.promptTextHash (SUADA-PREREQ-001) is only a
 * join key if the same graph cannot produce two different prompts.
 *
 * Three behaviours differ deliberately from the FlowDesk compiler it supersedes:
 *
 *   1. Blocking Constraints are emitted TWICE, at the start and the end
 *      (SUADA-COMPILE-001). Attention degrades in the middle of a long context,
 *      and the instructions that must not be missed are exactly the ones that
 *      must not sit there. This costs tokens and is a MEASURABLE decision: if an
 *      arena comparison shows no behavioural difference, remove the repeat.
 *
 *   2. Over budget, compilation FAILS rather than truncating (SUADA-COMPILE-002).
 *      The old compiler sliced the text at MAX_TEXT and shipped it; a prompt that
 *      silently lost its safety rule is worse than a prompt that would not build.
 *
 *   3. Everything dropped is NAMED in the manifest (SUADA-COMPILE-003). A prompt
 *      that quietly lost a rule looks identical to one that never had it, and an
 *      attribution layer would credit the absence to the wrong node.
 *
 * @module services/evolutio/evolutio-prompt.compiler
 */

const crypto = require('crypto');

const {
  SCHEMA_VERSION, ENGINE_NODES, CATEGORY_ORDER, CATEGORY_HEADINGS,
} = require('./evolutio-prompt.constants');
const { reachedEngineNodes, isLive } = require('./evolutio-prompt.validator');

/**
 * Token estimate. Deliberately crude and deliberately LOCAL: a real tokenizer
 * would tie compilation to one model's vocabulary, and compilation must stay
 * pure and offline. ~4 chars per token is close enough for budgeting, and the
 * manifest records the estimate so a discrepancy is visible rather than assumed.
 */
const estimateTokens = (s) => Math.ceil(String(s || '').length / 4);

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

class CompileError extends Error {
  constructor(message, diagnostics) {
    super(message);
    this.name = 'CompileError';
    this.status = 400;
    this.diagnostics = diagnostics;
  }
}

// ── condition evaluation ──────────────────────────────────────────────────────

/**
 * Does one APPLIES_WHEN condition hold in this context? Keys are ANDed. A key the
 * context does not mention is NOT satisfied: a rule that asked to apply only for
 * French must not slip through when the language is unknown.
 */
function conditionHolds(cond, ctx) {
  if (!cond) return true;
  if (cond.language && !(ctx.language && cond.language.includes(ctx.language))) return false;
  if (cond.channel && cond.channel !== ctx.channel) return false;
  if (cond.engineNode && !(ctx.engineNode && cond.engineNode.includes(ctx.engineNode))) return false;
  if (cond.serviceId && !(ctx.serviceId && cond.serviceId.includes(ctx.serviceId))) return false;
  if (cond.activeRoute && !(ctx.activeRoute && cond.activeRoute.includes(ctx.activeRoute))) return false;
  return true;
}

/** Conditions on a node are ORed; a node with none applies unconditionally. */
function nodeApplies(nodeId, edges, ctx) {
  const conds = edges.filter((e) => e.type === 'APPLIES_WHEN' && e.source === nodeId).map((e) => e.condition);
  if (!conds.length) return true;
  return conds.some((c) => conditionHolds(c, ctx));
}

// ── selection ─────────────────────────────────────────────────────────────────

function selectNodes(graph, ctx, manifest) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));

  const kept = new Map();
  for (const n of nodes) {
    if (!isLive(n)) { continue; }
    if (ctx.engineNode && !reachedEngineNodes(n).includes(ctx.engineNode)) continue;
    if (!nodeApplies(n.nodeId, edges, ctx)) continue;
    kept.set(n.nodeId, n);
  }

  // DEPENDS_ON closure: a survivor drags in what it needs, even if that
  // prerequisite's own conditions did not select it. Emitting a sentence whose
  // premise is missing is worse than emitting one extra sentence.
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of edges) {
      if (e.type !== 'DEPENDS_ON') continue;
      if (!kept.has(e.source) || kept.has(e.target)) continue;
      const dep = byId.get(e.target);
      if (dep && isLive(dep)) {
        kept.set(dep.nodeId, dep);
        manifest.pulledInByDependency.push(dep.nodeId);
        grew = true;
      }
    }
  }

  // CONFLICTS_WITH among survivors is an error: two contradictory instructions in
  // one prompt is the commonest cause of unstable behaviour, and here we know for
  // a fact that both were selected for the same context.
  for (const e of edges) {
    if (e.type !== 'CONFLICTS_WITH') continue;
    if (kept.has(e.source) && kept.has(e.target)) {
      throw new CompileError(
        `conflicting nodes both selected: "${e.source}" and "${e.target}"${e.reason ? ` (${e.reason})` : ''}`,
        { code: 'ACTIVE_CONFLICT', source: e.source, target: e.target, context: ctx }
      );
    }
    manifest.conflictsChecked += 1;
  }

  return [...kept.values()];
}

// ── banding and ordering ──────────────────────────────────────────────────────

const isBlocking = (n) => n.type === 'Constraint' && n.severity === 'blocking';

/** REFINES depth: a refinement reads as a qualification, so it follows its parent. */
function refinesDepth(nodeId, edges, seen = new Set()) {
  if (seen.has(nodeId)) return 0; // cycles are a validator error; do not hang here
  seen.add(nodeId);
  const parents = edges.filter((e) => e.type === 'REFINES' && e.source === nodeId);
  if (!parents.length) return 0;
  return 1 + Math.max(...parents.map((e) => refinesDepth(e.target, edges, seen)));
}

function bandOf(node) {
  switch (node.type) {
    case 'Narrative': return 'narrative';
    case 'Constraint': return isBlocking(node) ? 'constraint_blocking' : 'thesis';
    case 'Persona': return 'persona';
    case 'ToolContract': return 'tool_contract';
    case 'Exemplar': return 'exemplar';
    default: return 'thesis';
  }
}

const bodyOf = (n) => {
  switch (n.type) {
    case 'Thesis': return n.assertion;
    case 'Narrative': return n.framing;
    case 'Constraint': return n.rule;
    case 'Persona': return n.register;
    case 'ToolContract': return n.escalation ? `${n.usage} If it fails: ${n.escalation}` : n.usage;
    case 'Exemplar': return n.polarity === 'negative'
      ? `Never answer "${n.input}" with "${n.output}".`
      : `For "${n.input}" answer "${n.output}".`;
    default: return '';
  }
};

function orderWithin(band, list, edges) {
  const copy = [...list];
  if (band === 'thesis') {
    const catIdx = (n) => {
      const c = n.type === 'Constraint' ? 'safety' : n.category;
      const i = CATEGORY_ORDER.indexOf(c);
      return i === -1 ? CATEGORY_ORDER.indexOf('custom') : i;
    };
    copy.sort((a, b) =>
      catIdx(a) - catIdx(b)
      || refinesDepth(a.nodeId, edges) - refinesDepth(b.nodeId, edges)
      || (a.priority ?? 100) - (b.priority ?? 100)
      || a.nodeId.localeCompare(b.nodeId));
    return copy;
  }
  if (band === 'exemplar') {
    // Group under what they illustrate so a reader (and the model) sees the rule
    // and its demonstration together.
    const target = (n) => {
      const e = edges.find((x) => x.type === 'ILLUSTRATES' && x.source === n.nodeId);
      return e ? e.target : '~orphan';
    };
    copy.sort((a, b) => target(a).localeCompare(target(b))
      || (a.priority ?? 100) - (b.priority ?? 100)
      || a.nodeId.localeCompare(b.nodeId));
    return copy;
  }
  copy.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.nodeId.localeCompare(b.nodeId));
  return copy;
}

// ── budget ────────────────────────────────────────────────────────────────────

/**
 * Prune to fit, in a fixed order: lowest-weight Exemplars first (keeping at least
 * one per illustrated node), then low-weight `custom` Theses, then Narrative
 * detail. Constraints and DEPENDS_ON prerequisites of survivors are never
 * dropped — if the budget cannot be met without them, compilation fails.
 */
function pruneToBudget(selected, edges, budget, manifest) {
  const tokensOf = (n) => estimateTokens(bodyOf(n)) + 2; // + bullet and newline
  let total = selected.reduce((a, n) => a + tokensOf(n), 0);
  if (!budget || total <= budget) return selected;

  const needed = new Set();
  for (const e of edges) if (e.type === 'DEPENDS_ON') needed.add(e.target);

  let kept = [...selected];
  const illustratedCount = new Map();
  for (const n of kept) {
    if (n.type !== 'Exemplar') continue;
    const e = edges.find((x) => x.type === 'ILLUSTRATES' && x.source === n.nodeId);
    const key = e ? e.target : '~orphan';
    illustratedCount.set(key, (illustratedCount.get(key) || 0) + 1);
  }

  const droppable = (stage) => kept
    .filter((n) => {
      if (n.type === 'Constraint' || needed.has(n.nodeId)) return false;
      if (stage === 1) {
        if (n.type !== 'Exemplar') return false;
        const e = edges.find((x) => x.type === 'ILLUSTRATES' && x.source === n.nodeId);
        const key = e ? e.target : '~orphan';
        return (illustratedCount.get(key) || 0) > 1 || key === '~orphan';
      }
      if (stage === 2) return n.type === 'Thesis' && n.category === 'custom';
      return n.type === 'Narrative';
    })
    .sort((a, b) => (a.weight ?? 0.5) - (b.weight ?? 0.5) || a.nodeId.localeCompare(b.nodeId));

  for (const stage of [1, 2, 3]) {
    while (total > budget) {
      const candidates = droppable(stage);
      if (!candidates.length) break;
      const victim = candidates[0];
      kept = kept.filter((n) => n.nodeId !== victim.nodeId);
      total -= tokensOf(victim);
      manifest.droppedForBudget.push({ nodeId: victim.nodeId, type: victim.type, stage });
      if (victim.type === 'Exemplar') {
        const e = edges.find((x) => x.type === 'ILLUSTRATES' && x.source === victim.nodeId);
        const key = e ? e.target : '~orphan';
        illustratedCount.set(key, (illustratedCount.get(key) || 1) - 1);
      }
    }
    if (total <= budget) break;
  }

  if (total > budget) {
    throw new CompileError(
      `cannot fit ${total} estimated tokens into a budget of ${budget} without dropping Constraint nodes`,
      { code: 'BUDGET_UNMEETABLE', estimatedTokens: total, budget, droppedSoFar: manifest.droppedForBudget }
    );
  }
  return kept;
}

// ── emission ──────────────────────────────────────────────────────────────────

function emit(bands, title) {
  const lines = [`# ${title}`, ''];
  const positions = [];
  const push = (node, band) => {
    const body = String(bodyOf(node) || '').trim();
    if (!body) return;
    positions.push({ nodeId: node.nodeId, type: node.type, band, position: lines.length, tokens: estimateTokens(body) });
    lines.push(`- ${body}`);
  };

  if (bands.narrative.length) {
    lines.push('## Context'); bands.narrative.forEach((n) => push(n, 'narrative')); lines.push('');
  }
  if (bands.constraint_blocking.length) {
    lines.push('## Absolute limits (these override everything below)');
    bands.constraint_blocking.forEach((n) => push(n, 'constraint_blocking'));
    lines.push('');
  }
  if (bands.persona.length) {
    lines.push('## Voice'); bands.persona.forEach((n) => push(n, 'persona')); lines.push('');
  }
  if (bands.thesis.length) {
    let currentCat = null;
    for (const n of bands.thesis) {
      const cat = n.type === 'Constraint' ? 'safety' : (CATEGORY_ORDER.includes(n.category) ? n.category : 'custom');
      if (cat !== currentCat) { if (currentCat) lines.push(''); lines.push(`## ${CATEGORY_HEADINGS[cat]}`); currentCat = cat; }
      push(n, 'thesis');
    }
    lines.push('');
  }
  if (bands.tool_contract.length) {
    lines.push('## Tools'); bands.tool_contract.forEach((n) => push(n, 'tool_contract')); lines.push('');
  }
  if (bands.exemplar.length) {
    lines.push('## Examples'); bands.exemplar.forEach((n) => push(n, 'exemplar')); lines.push('');
  }
  // SUADA-COMPILE-001 — the repeat. Same nodes, second position.
  if (bands.constraint_blocking.length) {
    lines.push('## Absolute limits (restated — these are not negotiable)');
    bands.constraint_blocking.forEach((n) => push(n, 'constraint_blocking_repeat'));
  }

  return { text: lines.join('\n').trim(), positions };
}

// ── entry point ───────────────────────────────────────────────────────────────

/**
 * @param {object} graph  EVOLUTIO:PROMPT graph
 * @param {object} context {engineNode?, language?, channel?, serviceId?, activeRoute?, tokenBudget?}
 * @param {object} [meta] {graphEntryId?, graphVersion?, title?}
 * @returns {{text:string, byNode:Object, manifest:object, diagnostics:Array}}
 */
function compile(graph, context = {}, meta = {}) {
  const ctx = {
    engineNode: context.engineNode || null,
    language: context.language || null,
    channel: context.channel || 'text',
    serviceId: context.serviceId || null,
    activeRoute: context.activeRoute || null,
    tokenBudget: context.tokenBudget || null,
  };
  const edges = graph.edges || [];
  const diagnostics = [];

  const manifest = {
    schemaVersion: graph.schemaVersion || SCHEMA_VERSION,
    graphEntryId: meta.graphEntryId || null,
    graphVersion: meta.graphVersion ?? null,
    context: ctx,
    nodes: [],
    droppedForBudget: [],
    pulledInByDependency: [],
    conflictsChecked: 0,
    constraintsPresent: [],
    estimatedTokens: 0,
    textHash: null,
  };

  let selected = selectNodes(graph, ctx, manifest);
  selected = pruneToBudget(selected, edges, ctx.tokenBudget, manifest);

  const bands = { narrative: [], constraint_blocking: [], persona: [], thesis: [], tool_contract: [], exemplar: [] };
  for (const n of selected) bands[bandOf(n)].push(n);
  for (const band of Object.keys(bands)) bands[band] = orderWithin(band, bands[band], edges);

  const { text, positions } = emit(bands, meta.title || 'System Prompt');

  manifest.nodes = positions;
  manifest.estimatedTokens = positions.reduce((a, p) => a + p.tokens, 0);
  manifest.textHash = sha256(text);
  // Post-compilation safety re-check: which immutable constraints actually made
  // it into the text. A budget bug that dropped one would show up here.
  manifest.constraintsPresent = selected
    .filter((n) => n.type === 'Constraint' && n.immutable)
    .map((n) => n.nodeId);

  const missingImmutable = (graph.nodes || [])
    .filter((n) => n.type === 'Constraint' && n.immutable && isLive(n))
    .filter((n) => !ctx.engineNode || reachedEngineNodes(n).includes(ctx.engineNode))
    .filter((n) => !manifest.constraintsPresent.includes(n.nodeId));
  if (missingImmutable.length) {
    throw new CompileError(
      `immutable constraints absent from the compiled prompt: ${missingImmutable.map((n) => n.nodeId).join(', ')}`,
      { code: 'IMMUTABLE_CONSTRAINT_MISSING', nodeIds: missingImmutable.map((n) => n.nodeId), context: ctx }
    );
  }

  if (manifest.droppedForBudget.length) {
    diagnostics.push({
      code: 'DROPPED_FOR_BUDGET',
      message: `${manifest.droppedForBudget.length} node(s) dropped to fit the token budget`,
      nodeIds: manifest.droppedForBudget.map((d) => d.nodeId),
    });
  }

  // Per-engine-node text, the shape system-prompt.service already consumes.
  const byNode = {};
  for (const engineNode of ENGINE_NODES) {
    if (ctx.engineNode && engineNode !== ctx.engineNode) continue;
    byNode[engineNode] = ctx.engineNode
      ? text
      : compile(graph, { ...context, engineNode }, meta).text;
  }

  return { text, byNode, manifest, diagnostics };
}

module.exports = { compile, CompileError, estimateTokens, conditionHolds, nodeApplies, bodyOf, bandOf };
