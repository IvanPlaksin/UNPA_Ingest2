'use strict';

/**
 * ПР-006 — a new prompt graph, built to the standards this editor now enforces,
 * that behaves EXACTLY like the one in production.
 *
 * "Behaves exactly" is not a hope here, it is the acceptance test: the compiled text
 * must hash identically to the current graph's in every one of the nine reachable
 * contexts. Prompt order is what the model reads and what the provider caches, so a
 * rule moved is a prompt changed even when every sentence is the same.
 *
 * WHAT THE STANDARDS ADD, AND WHY MOST OF IT IS FREE
 *
 *   · a rationale on every node. The 22 inherited rules all carry "original intent
 *     undocumented", which is precisely the state that makes every later edit a
 *     gamble — the next person cannot tell whether a sentence is load-bearing or
 *     leftover. `origin.rationale` is metadata the compiler never reads, so this
 *     costs nothing in behaviour;
 *   · relations between rules. These are NOT free: REFINES is a sort key in the
 *     compiler's thesis band, so a refinement moves BEHIND what it refines. Every
 *     candidate edge is therefore compiled and compared, and only the ones that
 *     leave the text byte-identical are kept.
 *
 * Conditions are deliberately absent. A condition removes a rule from some context
 * by design — that is the opposite of idempotent, and it is the next graph's work.
 *
 * Usage:  node scripts/build-structured-prompt-graph.js [--write]
 *         Without --write it reports and changes nothing.
 */

require('dotenv').config();

const CONTEXTS = require('../src/services/evolutio/evolutio-prompt.coverage').REACHABLE_CONTEXTS;
const { compile } = require('../src/services/evolutio/evolutio-prompt.compiler');

/**
 * The relations that are TRUE of these rules, authored by reading them.
 *
 * Truth is the only criterion for this list. Whether each survives is decided by the
 * compiler below, not by trimming the list to what will pass — a relation dropped for
 * being inconvenient would be a graph that documents less than it knows.
 */
const CANDIDATE_EDGES = [
  // The opening sequence is one master rule and six steps that spell it out.
  ['opening-intent-first', 'REFINES', 'opening-sequence-master'],
  ['opening-resolve-service', 'REFINES', 'opening-sequence-master'],
  ['opening-announce-and-recipient', 'REFINES', 'opening-sequence-master'],
  ['opening-location-after-recipient', 'REFINES', 'opening-sequence-master'],
  ['opening-availability-check', 'REFINES', 'opening-sequence-master'],
  ['opening-offer-to-fill', 'REFINES', 'opening-sequence-master'],

  // A step that only exists inside another step.
  ['opening-recipient-other-autocomplete', 'REFINES', 'opening-announce-and-recipient'],
  ['dialogue-name-service-candidates', 'REFINES', 'opening-resolve-service'],

  // Each of these is meaningless without the step it follows: asking about
  // availability at a location nobody established is not a question.
  ['opening-location-after-recipient', 'DEPENDS_ON', 'opening-announce-and-recipient'],
  ['opening-availability-check', 'DEPENDS_ON', 'opening-location-after-recipient'],
  ['opening-offer-to-fill', 'DEPENDS_ON', 'opening-availability-check'],
  ['opening-recipient-other-autocomplete', 'DEPENDS_ON', 'opening-announce-and-recipient'],
  ['dialogue-name-service-candidates', 'DEPENDS_ON', 'opening-resolve-service'],

  // The mission is what the role is FOR.
  ['identity-mission', 'REFINES', 'identity-role'],

  // "When unsure, prefer to answer" is a qualification of "decline off-topic".
  ['routing-prefer-info', 'REFINES', 'deflection-redirect'],

  // Acknowledging what you understood is how you mirror the subject back.
  ['dialogue-ground', 'REFINES', 'dialogue-mirror-subject'],
];

/** WHY each rule exists. Written from what the rule does and what breaks without it. */
const RATIONALES = {
  'identity-role': 'Without a stated role the model answers as a general assistant and offers help the service desk cannot give.',
  'identity-mission': 'Names the four things a turn is FOR, so the model does not stop at understanding without resolving a service.',
  'opening-sequence-master': 'The opening was arrived at in a fixed order or not at all: without it the model asked for a location before knowing the service, and for a recipient before knowing the intent.',
  'opening-intent-first': 'Asking anything before the intent is known makes the user answer questions about a service they have not chosen.',
  'opening-resolve-service': 'A request that never resolves to ONE catalog service cannot become a ticket; the form is keyed by it.',
  'opening-announce-and-recipient': 'Announcing the service and asking the recipient in one turn is what keeps the opening to five turns rather than ten.',
  'opening-recipient-other-autocomplete': 'A free-text name cannot be turned into an Altiora user id; the autocomplete is the only path that produces a submittable value.',
  'opening-location-after-recipient': 'The location proposed from the recipient profile is right most of the time, and asking it cold makes the user look it up.',
  'opening-availability-check': 'A service unavailable at that duty station is a request that will be rejected after the user has filled the whole form.',
  'opening-offer-to-fill': 'Without an explicit offer the model drifted into asking form fields the user had not agreed to start.',
  'dialogue-one-question': 'Batched questions were answered partially and the unanswered halves were recorded as refusals.',
  'dialogue-mirror-subject': 'Mirroring the subject catches a misheard intent before the user has answered ten questions about the wrong service.',
  'dialogue-ground': 'A turn that jumps straight to the next question reads as not having listened to the previous answer.',
  'dialogue-name-service-candidates': 'A reply offering "several services" with the names only in the controls is unreadable aloud and unusable in voice.',
  'domain-scope': 'Bounds what the assistant claims to handle, so it refers rather than improvises outside HR and Finance.',
  'routing-new-vs-fill': 'Every message being treated as a new intent restarted the form; this keeps a mid-form answer an answer.',
  'routing-prefer-info': 'Declining a domain question the knowledge base could answer is the failure users complain about; the KB is the arbiter.',
  'deflection-redirect': 'Off-topic chat is answered briefly and turned back, rather than either refused coldly or indulged.',
  'formatting-brief': 'Long answers bury the next step; the assistant is a form-filler, not an essayist.',
  'tone-language': 'The language of one message is not the language the user chose; switching per message reads as the assistant losing track.',
  'tone-professional': 'Sets the register: warm enough to be human, plain enough to be understood by someone outside the department.',
  'safety-no-invent': 'An invented option or policy is a request built on a value that does not exist, discovered only at submission.',
  'safety-no-pii-leak': "Other people's personal data has no business in a request the user is raising for themselves.",
};

const ctxOpts = (c) => ({ language: 'en', channel: 'text', phase: c.phase, toolContext: c.toolContext });

/** The compiled text of a graph in every reachable context, as hashes. */
function fingerprint(graph) {
  return CONTEXTS.map((c) => {
    try {
      return compile(graph, ctxOpts(c), { title: 'System Prompt' }).manifest.textHash;
    } catch (e) {
      return `ERROR:${e.message}`;
    }
  });
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  const write = process.argv.includes('--write');
  const ev = require('../src/services/evolutio/evolutio-prompt.service');
  const entryId = process.env.FLOWDESK_AGENT_PROMPT_ENTRY;
  const loaded = await ev.getGraph(entryId);
  const current = loaded.graph;

  const baseline = fingerprint(current);
  console.log(`current graph: v${loaded.meta.versionNumber}, ${current.nodes.length} nodes, ${(current.edges || []).length} edges`);
  console.log('');

  // 1. Rationale on every node — metadata, and verified not to move a single byte.
  const nodes = current.nodes.map((n) => ({
    ...n,
    origin: {
      ...(n.origin || {}),
      ...(RATIONALES[n.nodeId] ? { rationale: RATIONALES[n.nodeId] } : {}),
    },
  }));
  const documented = nodes.filter((n) => RATIONALES[n.nodeId]).length;
  const withRationale = { ...current, nodes, edges: [] };
  const afterRationale = fingerprint(withRationale);
  console.log(`rationale written on ${documented}/${nodes.length} rules — prompt unchanged: ${same(baseline, afterRationale)}`);
  if (!same(baseline, afterRationale)) {
    console.error('ABORT: documenting a rule changed the prompt. That should be impossible.');
    process.exit(1);
  }

  // 2. Relations, one at a time, kept only when the prompt does not move.
  const kept = [];
  const rejected = [];
  let seq = 0;
  for (const [source, type, target] of CANDIDATE_EDGES) {
    seq += 1;
    const edge = { edgeId: `e${String(seq).padStart(2, '0')}-${type.toLowerCase()}`, type, source, target };
    const trial = { ...withRationale, edges: [...kept, edge] };
    if (same(baseline, fingerprint(trial))) kept.push(edge);
    else rejected.push(edge);
  }

  console.log('');
  console.log(`relations that are true AND leave the prompt identical: ${kept.length}`);
  for (const e of kept) console.log(`   ${e.source} —${e.type}→ ${e.target}`);
  console.log('');
  console.log(`relations that are true but MOVE the prompt: ${rejected.length}`);
  for (const e of rejected) console.log(`   ${e.source} —${e.type}→ ${e.target}`);

  const final = { ...withRationale, edges: kept };
  const finalPrint = fingerprint(final);
  console.log('');
  console.log(`FINAL: identical in all ${CONTEXTS.length} contexts: ${same(baseline, finalPrint)}`);

  const { validateGraph } = require('../src/services/evolutio/evolutio-prompt.validator');
  const v = validateGraph(final);
  console.log(`validates: ${(v.errors || []).length ? (v.errors || []).map((e) => e.code).join(',') : 'clean'}`
    + ` | warnings: ${(v.warnings || []).map((w) => w.code).join(',') || 'none'}`);

  if (!write) {
    console.log('');
    console.log('(dry run — pass --write to create the graph)');
    return;
  }
  if (!same(baseline, finalPrint) || (v.errors || []).length) {
    console.error('ABORT: not identical, or not valid. Nothing written.');
    process.exit(1);
  }

  const { saved } = await ev.saveGraph({
    name: 'Assistant prompt — structured (ПР-006)',
    description: 'Same behaviour as the live graph, documented and related. Byte-identical compiled text in all nine reachable contexts.',
    graph: final,
    changelog: 'ПР-006: rationale on every rule + behaviour-neutral relations. Verified byte-identical.',
    createdBy: 'pr-006',
  });
  console.log('');
  console.log(`written: entryId ${saved.entryId || saved.id} — NOT live. Make it live from the editor.`);
}

main()
  // The graph-catalog driver keeps handles open; without this the script prints
  // everything and then hangs, which reads as a script that never ran.
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
