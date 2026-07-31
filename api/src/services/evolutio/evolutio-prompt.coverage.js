'use strict';

/**
 * EC-013 — what the graph looks like across every context it can actually be in.
 *
 * Conditions turn one prompt into several, and each of them is a prompt nobody has
 * read. A rule can now be perfectly valid, perfectly saved, and reach no user ever;
 * a whole branch of the dialogue can lose its safety rules without a single check
 * failing. Neither shows up in a compile, because a compile only ever looks at ONE
 * context.
 *
 * REACHABLE, NOT COMBINATORIAL. The product of every dimension is mostly nonsense —
 * `fill` cannot co-occur with `no_draft`, and we now refuse that pairing outright. The
 * nine combinations below are derived from `dialogue-phase.computePhase` itself, so
 * this file describes the conversations the system can really have rather than the
 * ones a Cartesian product would invent. If `computePhase` gains a state, this list is
 * where it has to appear too — and the test that keeps them in step is the point.
 *
 * Language is deliberately not multiplied in: it changes the tail, not the selection,
 * except where a rule says so explicitly — and those show up as their own finding.
 *
 * @module services/evolutio/evolutio-prompt.coverage
 */

const { compile } = require('./evolutio-prompt.compiler');

/**
 * The contexts an agent conversation can be in. Each is a real turn shape.
 * @see instances/flowdesk/interpreter/dialogue-phase.computePhase
 */
const REACHABLE_CONTEXTS = [
  { name: 'intent', phase: 'intent', toolContext: ['no_draft'] },
  { name: 'intent · searching the catalogue', phase: 'intent', toolContext: ['no_draft', 'searching_catalog'] },
  { name: 'choosing a service', phase: 'service_choice', toolContext: ['no_draft'] },
  { name: 'choosing · searching the catalogue', phase: 'service_choice', toolContext: ['no_draft', 'searching_catalog'] },
  { name: 'filling the form', phase: 'fill', toolContext: ['has_draft'] },
  { name: 'filling · looking something up', phase: 'fill', toolContext: ['has_draft', 'searching_kb'] },
  { name: 'confirming', phase: 'confirm', toolContext: ['has_draft'] },
  { name: 'reading the knowledge base', phase: 'reading', toolContext: ['no_draft', 'searching_kb'] },
  { name: 'handed over to the form', phase: 'handed_off', toolContext: ['has_draft'] },
];

/** Categories a prompt should never be without, whatever branch it is in. */
const ESSENTIAL_CATEGORIES = ['safety', 'identity'];

const isEssential = (n) => (n.type === 'Constraint')
  || ESSENTIAL_CATEGORIES.includes(n.category)
  || n.type === 'Narrative';

/**
 * Compile the graph in every reachable context and report what that reveals.
 *
 * @param {object} graph
 * @param {{language?:string, catalogCategories?:string[]}} [opts]
 *   `catalogCategories` — the service families that really exist, so a condition
 *   pinned to a category nobody offers can be named as the typo it is.
 * @returns {{contexts:Array, dead:Array, gaps:Array, unknownCategories:Array, matrix:object}}
 */
function coverage(graph, opts = {}) {
  const language = opts.language || 'en';
  const nodes = (graph && graph.nodes) || [];
  const edges = (graph && graph.edges) || [];

  const results = [];
  for (const ctx of REACHABLE_CONTEXTS) {
    let included = [];
    let excluded = [];
    let error = null;
    try {
      const out = compile(graph, {
        language, phase: ctx.phase, toolContext: ctx.toolContext, channel: 'text',
      }, { title: 'coverage' });
      included = (out.manifest.nodes || []).map((n) => n.nodeId);
      excluded = out.manifest.excluded || [];
    } catch (e) {
      // A context in which the graph will not compile is the most serious finding
      // here: it means a live turn in that branch would fail outright.
      error = e.message;
    }
    results.push({ ...ctx, included, excluded, error });
  }

  const appearsIn = new Map();
  for (const r of results) {
    for (const id of r.included) appearsIn.set(id, (appearsIn.get(id) || 0) + 1);
  }

  // Dead weight: authored, valid, and reaching nobody.
  const dead = nodes
    .filter((n) => !appearsIn.has(n.nodeId))
    .map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      // Why it never applies: usually a condition, sometimes a status.
      reason: (results[0].excluded.find((x) => x.nodeId === n.nodeId) || {}).reason || 'unknown',
    }));

  // A branch of the dialogue with no safety and no identity is a branch where the
  // assistant is, for those turns, a different assistant.
  const gaps = results
    .filter((r) => !r.error)
    .map((r) => {
      const byId = new Map(nodes.map((n) => [n.nodeId, n]));
      const essentials = r.included.map((id) => byId.get(id)).filter(Boolean).filter(isEssential);
      return { context: r.name, essentials: essentials.length };
    })
    .filter((r) => r.essentials === 0);

  // A condition pinned to a service family the catalogue does not have can never
  // hold — and nothing else in the system would ever say so.
  const known = new Set(opts.catalogCategories || []);
  const unknownCategories = [];
  if (known.size) {
    for (const e of edges) {
      if (e.type !== 'APPLIES_WHEN' || !e.condition || !Array.isArray(e.condition.serviceCategory)) continue;
      for (const c of e.condition.serviceCategory) {
        if (!known.has(c)) unknownCategories.push({ nodeId: e.source, category: c });
      }
    }
  }

  return {
    contexts: results.map((r) => ({
      name: r.name, phase: r.phase, toolContext: r.toolContext,
      included: r.included.length, excluded: r.excluded.length, error: r.error,
    })),
    dead,
    gaps,
    unknownCategories,
    // node → the contexts it appears in, for the matrix view in the editor.
    matrix: Object.fromEntries(nodes.map((n) => [
      n.nodeId,
      results.map((r) => r.included.includes(n.nodeId)),
    ])),
  };
}

module.exports = { coverage, REACHABLE_CONTEXTS, ESSENTIAL_CATEGORIES };
