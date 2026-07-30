'use strict';

/**
 * Parity harness: EVOLUTIO:PROMPT vs the live CHAT_PROMPT graph (Suada Phase 1).
 *
 *   node api/scripts/parity-evolutio-vs-chatprompt.js --entry=<evolutioEntryId>
 *   node api/scripts/parity-evolutio-vs-chatprompt.js            # migrate in memory, then compare
 *
 * The gate before the Suada graph may replace the FlowDesk one. It answers one
 * question per engine node: does every instruction that governed that node still
 * govern it, and has anything new appeared?
 *
 * Deliberately NOT a text diff. The two compilers arrange text differently by
 * design — bands, headings, and the repeated blocking constraints
 * (SUADA-COMPILE-001) — so byte equality would fail for reasons that are the
 * point of the new compiler rather than defects. What must hold is that the SET
 * of instructions reaching each engine node is unchanged. A divergence is either
 * a migration error or an intended improvement, and each one must be named and
 * accepted on its own — never accepted in bulk.
 *
 * @module scripts/parity-evolutio-vs-chatprompt
 */

require('dotenv').config();

const { ENGINE_NODES } = require('../src/services/evolutio/evolutio-prompt.constants');
const { compile } = require('../src/services/evolutio/evolutio-prompt.compiler');
const evolutio = require('../src/services/evolutio/evolutio-prompt.service');
const { compilePromptGraph } = require('../src/instances/flowdesk/services/prompt-graph-compiler');
const { migrate } = require('./migrate-prompt-to-evolutio');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const SOURCE_ENTRY = args.source || 'afa606a3-bb5b-469f-8a0b-2ee78db35dbb';
const SOURCE_VERSION = args.version ? Number(args.version) : 3;

/**
 * Reduce an instruction to what it says, so formatting differences between the
 * two compilers do not read as behavioural ones: strip the bullet, collapse
 * whitespace, drop trailing punctuation, lowercase.
 */
const normalise = (line) => String(line)
  .replace(/^\s*[-*]\s*/, '')
  .replace(/\s+/g, ' ')
  .replace(/[.;:]+$/, '')
  .trim()
  .toLowerCase();

/** The set of instruction lines in a compiled block, ignoring headings and blanks. */
function instructionSet(text) {
  return new Set(
    String(text || '')
      .split('\n')
      .filter((l) => l.trim().startsWith('-'))
      .map(normalise)
      .filter(Boolean)
  );
}

async function main() {
  const catalog = require('../src/services/graphCatalog.service').graphCatalogService;

  const source = await catalog.getVersion(SOURCE_ENTRY, SOURCE_VERSION);
  if (!source) throw new Error(`CHAT_PROMPT ${SOURCE_ENTRY}@v${SOURCE_VERSION} not found`);
  const legacy = compilePromptGraph({ nodes: source.nodes || [], edges: source.edges || [] });

  let evoGraph;
  if (args.entry) {
    const loaded = await evolutio.getGraph(args.entry, args.evoVersion ? Number(args.evoVersion) : undefined);
    if (!loaded) throw new Error(`EVOLUTIO:PROMPT entry ${args.entry} not found`);
    evoGraph = loaded.graph;
  } else {
    evoGraph = migrate(source.nodes || []);
  }

  console.log('='.repeat(70));
  console.log('PARITY: EVOLUTIO:PROMPT vs CHAT_PROMPT');
  console.log(`  legacy source : ${SOURCE_ENTRY}@v${SOURCE_VERSION} (${legacy.ruleCount} rules)`);
  console.log(`  evolutio graph: ${args.entry ? args.entry : '(migrated in memory)'} (${evoGraph.nodes.length} nodes)`);
  console.log('='.repeat(70));

  let divergences = 0;
  for (const engineNode of ENGINE_NODES) {
    const before = instructionSet(legacy.byNode[engineNode]);
    const after = instructionSet(compile(evoGraph, { engineNode }).text);

    const missing = [...before].filter((x) => !after.has(x));
    const added = [...after].filter((x) => !before.has(x));

    const verdict = missing.length === 0 && added.length === 0 ? 'IDENTICAL' : 'DIVERGES';
    console.log(`\n${engineNode}: ${verdict}  (before ${before.size} / after ${after.size})`);
    for (const m of missing) { divergences += 1; console.log(`  - LOST  : ${m.slice(0, 110)}`); }
    for (const a of added) { divergences += 1; console.log(`  + GAINED: ${a.slice(0, 110)}`); }
  }

  console.log('\n' + '='.repeat(70));
  if (divergences === 0) {
    console.log('PARITY HELD — every engine node receives the same set of instructions.');
  } else {
    console.log(`${divergences} divergence(s). Each must be named and accepted individually before switching.`);
    console.log('A LOST line is a migration error. A GAINED line is an improvement only if someone says so.');
  }
  console.log('='.repeat(70));
  process.exitCode = divergences === 0 ? 0 : 1;
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(process.exitCode || 0); })
  .catch(async (err) => {
    console.error('\n[parity] FAILED:', err.message);
    try { await require('../src/services/memgraph.service').close(); } catch {}
    process.exit(2);
  });
