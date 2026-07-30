'use strict';

/**
 * Add Russian translations to recorded arena runs (bilingual review).
 * Translates each turn's user + agent text to Russian (Haiku) and persists it on
 * ArenaTurn (userMessageRu / agentResponseRu). Idempotent — skips already-done
 * turns unless --force.
 *
 *   node api/scripts/translate-runs.js              # all runs, only untranslated turns
 *   node api/scripts/translate-runs.js --run=<runId>
 *   node api/scripts/translate-runs.js --force      # re-translate everything
 *
 * @module scripts/translate-runs
 */

require('dotenv').config();
const arena = require('../src/services/dialogue-gym/arena-runner.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));

async function main() {
  await arena.ensureIndexes();
  let runIds = [];
  if (args.run) runIds = [args.run];
  else { const { items } = await arena.listRuns({ limit: 1000 }); runIds = items.map((r) => r.runId); }

  console.log(`Translating ${runIds.length} run(s) → Russian${args.force ? ' (force)' : ''}\n`);
  let totalT = 0; let totalS = 0;
  for (const id of runIds) {
    process.stdout.write(`  ▶ ${id.slice(0, 8)} … `);
    const { translated, skipped } = await arena.translateRun(id, { force: !!args.force });
    totalT += translated; totalS += skipped;
    console.log(`translated=${translated} skipped=${skipped}`);
  }
  console.log(`\nDone. turns translated=${totalT}, skipped(already)=${totalS}`);
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[translate-runs] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
