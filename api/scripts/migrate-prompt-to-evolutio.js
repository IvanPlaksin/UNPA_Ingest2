'use strict';

/**
 * Migrate a FlowDesk CHAT_PROMPT rules graph into the EVOLUTIO:PROMPT ontology
 * (Suada Phase 1, TASK-SUADA-PHASE1-IMPL).
 *
 *   node api/scripts/migrate-prompt-to-evolutio.js --dry-run
 *   node api/scripts/migrate-prompt-to-evolutio.js --entry=<catalogEntryId> --version=3 --save
 *
 * The Suada graph is built BESIDE the live one, never over it: nothing here
 * writes to CHAT_PROMPT, and the running chat keeps reading the FlowDesk graph
 * until a human accepts the parity report. Run the parity harness afterwards:
 *   node api/scripts/parity-evolutio-vs-chatprompt.js
 *
 * Mapping is deterministic — the same source graph always produces the same
 * ontology — with a small table of per-rule human decisions for the cases where
 * a category alone does not settle the type. Those are listed explicitly rather
 * than inferred, because a migration that guesses is a migration nobody can review.
 *
 * @module scripts/migrate-prompt-to-evolutio
 */

require('dotenv').config();

const { SCHEMA_VERSION, ENGINE_NODES } = require('../src/services/evolutio/evolutio-prompt.constants');
const evolutio = require('../src/services/evolutio/evolutio-prompt.service');
const { validateGraph } = require('../src/services/evolutio/evolutio-prompt.validator');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const SOURCE_ENTRY = args.entry || 'afa606a3-bb5b-469f-8a0b-2ee78db35dbb';
const SOURCE_VERSION = args.version ? Number(args.version) : 3;

/**
 * Per-rule decisions that a category cannot make on its own.
 *
 *  - identity rules split: one FRAMES the assistant (Narrative — it prescribes
 *    nothing and cannot be violated), the other PRESCRIBES a job (Thesis).
 *  - safety rules become Constraints. Both are marked immutable: an optimizer
 *    that may delete "never invent values" or "do not expose personal data"
 *    will eventually delete them, because doing so raises the task-success score.
 *  - one tone rule describes REGISTER (Persona); the other prescribes a
 *    behaviour (answer in the user's language) and stays a Thesis.
 *
 * Everything not listed here follows the default: Thesis, category preserved.
 */
const DECISIONS = {
  'identity-role': { type: 'Narrative' },
  'identity-mission': { type: 'Thesis' },
  'tone-professional': { type: 'Persona' },
  'safety-no-invent': { type: 'Constraint', kind: 'safety', severity: 'blocking', immutable: true },
  'safety-no-pii-leak': { type: 'Constraint', kind: 'privacy', severity: 'blocking', immutable: true },
};

const nowIso = () => new Date().toISOString();

/** Keep only scopes this build actually reads (TASK-FLOWDESK-BUG-001). */
function migrateScopes(appliesTo) {
  const declared = Array.isArray(appliesTo) ? appliesTo : [];
  if (!declared.length || declared.includes('all')) return [];
  const kept = declared.filter((s) => ENGINE_NODES.includes(s));
  return kept;
}

function toOntologyNode(rule, index) {
  const d = rule.data || {};
  const key = d.key || rule.id;
  const decision = DECISIONS[key] || {};
  const type = decision.type || 'Thesis';
  const text = String(d.text || '').trim();

  const base = {
    nodeId: key,
    type,
    title: d.title || key,
    status: d.enabled === false ? 'DEPRECATED' : 'ACTIVE',
    appliesToNodes: migrateScopes(d.appliesTo),
    priority: Number.isFinite(d.priority) ? d.priority : 100,
    weight: type === 'Constraint' ? 1 : 0.5,
    origin: {
      kind: 'legacy',
      ref: `${SOURCE_ENTRY}@v${SOURCE_VERSION}`,
      // SUADA-PROVENANCE-001: say the intent is unrecorded rather than invent a
      // plausible one. The field's whole value is that it is true.
      rationale: 'migrated from the FlowDesk prompt-editor; original intent undocumented',
      introducedBy: 'migrate-prompt-to-evolutio',
      introducedAt: nowIso(),
    },
    position: { x: 120, y: 80 + index * 90 },
  };

  switch (type) {
    case 'Narrative':
      return { ...base, framing: text, audience: null };
    case 'Persona':
      return { ...base, register: text, language: 'all', channel: 'all' };
    case 'Constraint':
      return { ...base, rule: text, kind: decision.kind, severity: decision.severity, immutable: !!decision.immutable };
    default:
      return { ...base, assertion: text, category: d.category || 'custom', scope: 'global', scopeRef: null };
  }
}

/**
 * Ordering edges from the source graph are NOT carried over: they encoded canvas
 * layout, not meaning, and REFINES/DEPENDS_ON are claims about content that a
 * human has to make deliberately. Migrating them would manufacture semantics
 * nobody asserted.
 */
function migrate(sourceNodes) {
  const nodes = sourceNodes
    .filter((n) => (n.data || {}).kind !== 'section')
    .filter((n) => String((n.data || {}).text || '').trim())
    .map(toOntologyNode);
  return { schemaVersion: SCHEMA_VERSION, nodes, edges: [] };
}

async function main() {
  const catalog = require('../src/services/graphCatalog.service').graphCatalogService;
  const source = await catalog.getVersion(SOURCE_ENTRY, SOURCE_VERSION);
  if (!source) throw new Error(`source graph ${SOURCE_ENTRY}@v${SOURCE_VERSION} not found`);

  const graph = migrate(source.nodes || []);
  const validation = validateGraph(graph);

  const byType = graph.nodes.reduce((a, n) => ({ ...a, [n.type]: (a[n.type] || 0) + 1 }), {});
  console.log('='.repeat(64));
  console.log('MIGRATION: CHAT_PROMPT -> EVOLUTIO:PROMPT');
  console.log(`  source            : ${SOURCE_ENTRY}@v${SOURCE_VERSION} (${(source.nodes || []).length} rules)`);
  console.log(`  migrated nodes    : ${graph.nodes.length}`);
  console.log(`  by type           : ${JSON.stringify(byType)}`);
  console.log(`  immutable constr. : ${graph.nodes.filter((n) => n.type === 'Constraint' && n.immutable).map((n) => n.nodeId).join(', ') || '(none)'}`);
  console.log(`  validation        : ${validation.ok ? 'OK' : 'FAILED'}`);
  for (const e of validation.errors) console.log(`    ERROR   ${e.code}: ${e.message}`);
  for (const w of validation.warnings) console.log(`    warning ${w.code}: ${w.message}`);

  const rescoped = graph.nodes.filter((n) => {
    const src = (source.nodes || []).find((s) => (s.data || {}).key === n.nodeId);
    const before = ((src && src.data && src.data.appliesTo) || []).filter((x) => x !== 'all');
    return before.length && before.join(',') !== n.appliesToNodes.join(',');
  });
  if (rescoped.length) {
    console.log('  scope changes (retired engine nodes dropped):');
    for (const n of rescoped) console.log(`    ${n.nodeId} -> [${n.appliesToNodes.join(', ') || 'all'}]`);
  }
  console.log('='.repeat(64));

  if (!validation.ok) { console.error('\nnot saving: the migrated graph does not validate'); process.exit(2); }
  if (!args.save) { console.log('\n(dry run — pass --save to write a new EVOLUTIO:PROMPT catalog entry)'); return; }

  const { saved } = await evolutio.saveGraph({
    name: args.name || 'Suada Prompt Ontology (migrated from FlowDesk)',
    description: `Migrated from ${SOURCE_ENTRY}@v${SOURCE_VERSION}`,
    graph,
    createdBy: 'migrate-prompt-to-evolutio',
  });
  console.log(`\nsaved: entryId=${saved.entryId || saved.id || '(see catalog)'}`);
  console.log('next: node api/scripts/parity-evolutio-vs-chatprompt.js --entry=<newEntryId>');
}

// Only when run directly: the parity harness imports `migrate` from here, and an
// import that runs a CLI (and then exits the process) would take its caller with it.
if (require.main === module) {
  main()
    .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
    .catch(async (err) => {
      console.error('\n[migrate] FAILED:', err.message);
      try { await require('../src/services/memgraph.service').close(); } catch {}
      process.exit(1);
    });
}

module.exports = { migrate, toOntologyNode, migrateScopes, DECISIONS };
