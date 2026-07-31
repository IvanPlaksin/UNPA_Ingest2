'use strict';

/**
 * Add one rule to the LIVE agent prompt: when several services could match, name them.
 *
 * Found by comparing two real sessions:
 *
 *   fdv2-797fde5b… (good)  "Based on what I found, here are the services that may fit:
 *                           - Amendment to the Contribution Agreement — for changes to
 *                             an existing contribution agreement
 *                           - Review of Grants Agreement — for reviewing a grants
 *                             agreement …  Which of these best describes what you need?"
 *
 *   fdv2-182a16be… (bad)   "I found several services for managing positions. Which one
 *                           do you need?"
 *
 * Same situation, same tools, two different answers. In the second the candidates exist
 * only inside the control: a reader has to look at the chips to learn what the options
 * are, and on the voice channel — where controls cannot be used at all — the reply says
 * nothing usable. The AGENT_CONTRACT already shows this in an example; an example is not
 * a rule, and the model followed it only sometimes.
 *
 * Writes to EVOLUTIO:PROMPT — the graph the live chat compiles — and promotes the new
 * version, because on the agent path "make it live" means promote, not apply.
 *
 *   node api/scripts/add-rule-name-service-candidates.js          # save + promote
 *   node api/scripts/add-rule-name-service-candidates.js --dry    # show, change nothing
 *
 * @module scripts/add-rule-name-service-candidates
 */

require('dotenv').config();

const editor = require('../src/instances/flowdesk/services/prompt-editor.service');
// The RAW graph, not the editor's flattened view: the EVOLUTIO schema is strict
// (`additionalProperties: false`), so `id`, `name`, `namespace` and friends — added by
// the editor for its own use — make validation fail before it looks at the rule.
const evolutio = require('../src/services/evolutio/evolutio-prompt.service');

const ENTRY = process.env.FLOWDESK_AGENT_PROMPT_ENTRY;
const NODE_ID = 'dialogue-name-service-candidates';

const NODE = {
  nodeId: NODE_ID,
  type: 'Thesis',
  title: 'Name every service candidate in the reply',
  // A Thesis compiles `assertion`. Writing this into `text` would save cleanly,
  // validate cleanly, and change nothing at all.
  assertion: [
    'When you offer a choice between catalog services, name EVERY service you are',
    'offering in the reply itself and say in a few words what each one is for, then ask',
    'which one fits. Never refer to them collectively ("I found several services"), and',
    'never leave the candidates to the buttons alone: the control can be missed, and on',
    'the voice channel it cannot be used at all, so a reply that does not name the',
    'options is unusable without it. The list you write and the options you offer must',
    'match exactly — do not mention a service the user cannot pick, and do not offer one',
    'you did not describe.',
  ].join(' '),
  category: 'formatting',
  // Beside the service-resolution rules it governs, rather than in the trailing
  // general-formatting band where it would read out of context.
  priority: 2,
  status: 'ACTIVE',
  origin: {
    // `human`: a direct decision, taken after reading the two sessions. Not `incident`
    // — that means a session TRIAGED with a root cause, and these were not; claiming
    // otherwise would be exactly the invented provenance this field exists to prevent.
    kind: 'human',
    ref: 'fdv2-182a16be-edc7-4ada-9962-e7b03fe33f77',
    rationale: 'Two live sessions answered the same situation differently: fdv2-797fde5b named and '
      + 'explained each candidate, fdv2-182a16be said "several services" and left them to the controls. '
      + 'The second is unreadable without looking at the chips and unusable by voice.',
    introducedBy: 'claude-code',
    introducedAt: new Date().toISOString(),
  },
};

async function main() {
  const dry = process.argv.includes('--dry');
  if (!ENTRY) throw new Error('FLOWDESK_AGENT_PROMPT_ENTRY is not set');

  const loaded = await evolutio.getGraph(ENTRY);
  if (!loaded) throw new Error(`no graph at ${ENTRY}`);
  const graph = loaded.graph;
  const version = loaded.meta.versionNumber;
  const nodes = graph.nodes || [];
  const existing = nodes.findIndex((n) => n.nodeId === NODE_ID);

  console.log('='.repeat(74));
  console.log(`LIVE AGENT PROMPT  entry=${ENTRY}  version=${version}  nodes=${nodes.length}`);
  console.log('='.repeat(74));
  console.log(existing >= 0 ? `Rule "${NODE_ID}" already present — it will be REPLACED.` : `Adding "${NODE_ID}".`);
  console.log(`\n  ${NODE.assertion}\n`);

  const next = existing >= 0
    ? nodes.map((n, i) => (i === existing ? { ...n, ...NODE } : n))
    : [...nodes, NODE];

  // Validate against the EVOLUTIO ontology BEFORE saving: a rule that cannot compile
  // is worse than no rule, and SUADA-COMPILE-001 also re-checks the immutable
  // constraints survived.
  const v = editor.validate({ ...graph, nodes: next }, { source: 'agent' });
  const errors = (v && (v.errors || [])) || [];
  const warnings = (v && (v.warnings || [])) || [];
  warnings.forEach((w) => console.log(`  warn  ${w.code || ''} ${w.message || JSON.stringify(w)}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`  ERROR ${e.code || ''} ${e.message || JSON.stringify(e)}`));
    process.exit(1);
  }

  // Compile and prove the new sentence actually reaches the model — the whole point.
  const compiled = editor.compile({ ...graph, nodes: next }, { source: 'agent', language: 'en', entryId: ENTRY });
  const reached = String(compiled.text || '').includes('match exactly');
  console.log(`compiled: ${compiled.text.length} chars, ${(compiled.manifest.nodes || []).length} nodes`);
  console.log(`the new rule is in the compiled prompt: ${reached ? 'YES' : 'NO'}`);
  if (!reached) { console.error('The rule did not reach the compiled text — refusing to save.'); process.exit(1); }

  if (dry) { console.log('\n--dry: nothing written.'); return; }

  const saved = await editor.saveGraph({
    entryId: ENTRY,
    nodes: next,
    edges: graph.edges || [],
    changelog: 'Name every service candidate in the reply (from sessions fdv2-797fde5b vs fdv2-182a16be)',
    createdBy: 'claude-code',
    source: 'agent',
  });
  const newVersion = saved.versionNumber ?? saved.currentVersion;
  console.log(`\nsaved version ${newVersion}`);

  // On the agent path this is what "make it live" means: there is no active-prompt
  // record to materialise — the agent compiles whatever version is current.
  await editor.promoteVersion(ENTRY, newVersion, 'agent');
  console.log(`promoted ${newVersion} — the chat compiles it on the next turn.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[add-rule] FAILED:', e.message); process.exit(1); });
