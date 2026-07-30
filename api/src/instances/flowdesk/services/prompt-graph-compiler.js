'use strict';

/**
 * Prompt-graph compiler (ADMIN P6) — turns a graph of rule nodes (one rule = one
 * node) into the FlowDesk Chat system-prompt text. The analogue of the platform's
 * structural-to-jsonschema compiler: a declarative graph compiles to an artifact.
 *
 * A rule node's `data` shape (ReactFlow node.data):
 *   {
 *     kind: 'rule' | 'section',        // 'section' = a heading grouping node (layout)
 *     key: string,                     // stable slug, unique among rule nodes
 *     title: string,                   // short human label
 *     text: string,                    // the instruction sentence(s) — the actual prompt content
 *     category: 'identity'|'routing'|'tone'|'safety'|'domain'|'formatting'|'deflection'|'dialogue'|'custom',
 *     appliesTo: string[],             // subset of PROMPT_NODES (which chat LLM nodes it governs); [] or ['all'] = all
 *     enabled: boolean,                // disabled rules are dropped from the output
 *     priority: number,                // lower = earlier within its category (default 100)
 *   }
 * Edges express ordering/grouping between rules within a section; the compiler is
 * order-tolerant (falls back to category+priority) so a disconnected graph still
 * compiles.
 *
 * @module instances/flowdesk/services/prompt-graph-compiler
 */

/**
 * The chat LLM nodes a rule can be scoped to. This list is a PROMISE: every name
 * here must be read by interpreter-engine, or the editor accepts rules that
 * silently do nothing.
 *
 * It deliberately covers only the calls that generate PROSE for the user
 * (router classifies, but has carried operator guidance since ADMIN P5). The
 * engine's other LLM calls — intake decomposition, navigation targets, and the
 * request/task/mail filter extractors — are strict schema-bound extractors; prose
 * rules about tone or identity cannot help them and can corrupt their output
 * shape, which is why they are not offered as scopes.
 *
 * `slot_extract` and `my_requests` were listed here until TASK-FLOWDESK-BUG-001
 * and read by nothing; they were removed rather than wired, because both are
 * extraction calls (see above), not prose.
 */
const PROMPT_NODES = ['router', 'info_answer', 'question_planner', 'field_help'];

/** Categories in emission order, each a labelled section of the system prompt. */
const CATEGORY_ORDER = ['identity', 'domain', 'routing', 'dialogue', 'tone', 'safety', 'deflection', 'formatting', 'custom'];
const CATEGORY_HEADINGS = {
  identity: 'Identity & role',
  domain: 'Domain & scope',
  routing: 'Intent routing',
  dialogue: 'Dialogue conduct',
  tone: 'Tone & style',
  safety: 'Safety & boundaries',
  deflection: 'Out-of-scope handling',
  formatting: 'Answer formatting',
  custom: 'Additional guidance',
};

const isRule = (n) => n && n.data && (n.data.kind === 'rule' || n.data.kind === undefined) && n.data.kind !== 'section';
const slug = (s) => String(s || '').trim();

/**
 * Topologically order rule ids by the graph edges (Kahn); ids not covered by
 * edges keep their input order. Never throws on cycles — falls back to input
 * order for the cyclic remainder (the validator reports cycles separately).
 */
function edgeOrder(nodeIds, edges) {
  const idSet = new Set(nodeIds);
  const indeg = new Map(nodeIds.map((id) => [id, 0]));
  const adj = new Map(nodeIds.map((id) => [id, []]));
  for (const e of edges || []) {
    const s = e.source ?? e.sourceNodeId;
    const t = e.target ?? e.targetNodeId;
    if (idSet.has(s) && idSet.has(t)) { adj.get(s).push(t); indeg.set(t, indeg.get(t) + 1); }
  }
  const pos = new Map(nodeIds.map((id, i) => [id, i]));
  const queue = nodeIds.filter((id) => indeg.get(id) === 0).sort((a, b) => pos.get(a) - pos.get(b));
  const out = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id); out.push(id);
    const next = adj.get(id).filter((t) => { indeg.set(t, indeg.get(t) - 1); return indeg.get(t) === 0; });
    next.sort((a, b) => pos.get(a) - pos.get(b)).forEach((t) => queue.push(t));
  }
  // Append any cyclic leftovers in input order (deterministic).
  for (const id of nodeIds) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * Compile a rules graph into the system-prompt text + a per-node scoped map.
 * @param {{nodes:Array, edges:Array}} graph
 * @param {{title?:string}} [opts]
 * @returns {{ text:string, byNode:Object<string,string>, ruleCount:number, sections:Array }}
 */
function compilePromptGraph(graph, opts = {}) {
  const nodes = (graph && graph.nodes) || [];
  const edges = (graph && graph.edges) || [];
  const rules = nodes.filter(isRule).map((n) => {
    const declared = Array.isArray(n.data.appliesTo) ? n.data.appliesTo : [];
    const appliesTo = declared.filter((x) => x === 'all' || PROMPT_NODES.includes(x));
    return {
      id: n.id,
      key: slug(n.data.key) || slug(n.data.title) || n.id,
      title: slug(n.data.title),
      text: slug(n.data.text),
      category: CATEGORY_ORDER.includes(n.data.category) ? n.data.category : 'custom',
      appliesTo,
      // A rule scoped ONLY to names this build no longer knows reaches no node.
      // Without this flag the filter above would empty appliesTo, and an empty
      // appliesTo means "every node" — so a rule aimed at one retired scope would
      // quietly start governing the whole chat. It must reach nothing instead.
      scopedToNothing: declared.length > 0 && appliesTo.length === 0,
      enabled: n.data.enabled !== false,
      priority: Number.isFinite(n.data.priority) ? n.data.priority : 100,
    };
  }).filter((r) => r.enabled && r.text);

  const ordered = edgeOrder(rules.map((r) => r.id), edges);
  const orderIdx = new Map(ordered.map((id, i) => [id, i]));

  // Group by category; within a category sort by (priority, graph order).
  const byCat = new Map(CATEGORY_ORDER.map((c) => [c, []]));
  for (const r of rules) byCat.get(r.category).push(r);
  for (const list of byCat.values()) {
    list.sort((a, b) => (a.priority - b.priority) || (orderIdx.get(a.id) - orderIdx.get(b.id)));
  }

  const sections = [];
  const lines = [];
  const header = opts.title || 'FlowDesk Chat — System Prompt';
  lines.push(`# ${header}`, '');
  for (const cat of CATEGORY_ORDER) {
    const list = byCat.get(cat);
    if (!list.length) continue;
    lines.push(`## ${CATEGORY_HEADINGS[cat]}`);
    for (const r of list) lines.push(`- ${r.text}`);
    lines.push('');
    sections.push({ category: cat, heading: CATEGORY_HEADINGS[cat], rules: list.map((r) => ({ key: r.key, title: r.title })) });
  }
  const text = lines.join('\n').trim();

  // Per-node scoped text: only rules that apply to a given chat LLM node.
  const byNode = {};
  for (const node of PROMPT_NODES) {
    const scoped = [];
    for (const cat of CATEGORY_ORDER) {
      for (const r of byCat.get(cat)) {
        if (r.scopedToNothing) continue;
        const applies = !r.appliesTo.length || r.appliesTo.includes('all') || r.appliesTo.includes(node);
        if (applies) scoped.push(`- ${r.text}`);
      }
    }
    byNode[node] = scoped.join('\n');
  }

  return { text, byNode, ruleCount: rules.length, sections };
}

module.exports = { compilePromptGraph, edgeOrder, PROMPT_NODES, CATEGORY_ORDER, CATEGORY_HEADINGS };
