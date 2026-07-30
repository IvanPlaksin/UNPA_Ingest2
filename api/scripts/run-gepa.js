'use strict';

/**
 * Run a GEPA prompt-optimization cycle (ШАГ 7B) from the CLI.
 *
 *   node api/scripts/run-gepa.js --name="Router fix" --max-iterations=3 --token=<jwt>
 *   node api/scripts/run-gepa.js --dry-run            # show plan, don't run
 *
 * Runs work without a token (directory + default acting user via the service
 * account). Supply --token / DIALOGUE_GYM_ALTIORA_TOKEN only to act as a specific
 * real user (their scoped LOV / MY_REQUESTS). Optimizes the live CHAT_PROMPT.
 *
 * @module scripts/run-gepa
 */

require('dotenv').config();
const gepa = require('../src/services/dialogue-gym/gepa-orchestrator');
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');
const promptLoader = require('../src/services/dialogue-gym/prompt-loader');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));

async function main() {
  const cfg = {
    name: args.name || undefined,
    maxIterations: args['max-iterations'] ? parseInt(args['max-iterations'], 10) : undefined,
    candidatesPerIteration: args.candidates ? parseInt(args.candidates, 10) : undefined,
    maxTurns: args['max-turns'] ? parseInt(args['max-turns'], 10) : undefined,
    altioraUserToken: args.token || process.env.DIALOGUE_GYM_ALTIORA_TOKEN || undefined,
    onProgress: (ev) => console.log(`  [${ev.phase}]`, JSON.stringify({ ...ev, phase: undefined, optimizationId: undefined, at: undefined })),
  };

  const prod = await promptLoader.loadProduction();
  const { items: scenarios } = await gym.listScenarios({ enabled: true, groundTruthVerified: true, limit: 1000 });
  const { items: personas } = await gym.listPersonas({ enabled: true, limit: 1000 });

  console.log('═'.repeat(60));
  console.log('GEPA optimization plan');
  console.log(`  production prompt : ${prod && prod.metadata ? `${prod.metadata.entryId || 'inline'}@v${prod.metadata.versionNumber ?? '?'} (${(prod.nodes || []).length} rules)` : '(none)'}`);
  console.log(`  scenarios (verified GT): ${scenarios.length}`);
  console.log(`  personas          : ${personas.length}`);
  console.log(`  maxIterations     : ${cfg.maxIterations ?? gepa.DEFAULT_CONFIG.maxIterations}`);
  console.log(`  token supplied    : ${cfg.altioraUserToken ? 'yes (acts as the token user)' : 'no (default acting user via service account)'}`);
  console.log('═'.repeat(60));

  if (args['dry-run']) { console.log('\n(dry run — not executing)'); return; }
  if (!prod || !(prod.nodes || []).length) { console.error('No production prompt graph — apply a CHAT_PROMPT graph first.'); process.exit(2); }
  if (!cfg.altioraUserToken) console.log('\nℹ No token — running as the default acting user (directory via service account).\n');

  // Every backend the agent calls degrades silently to an empty result, so a dead
  // catalog or embedder yields runs that score as prompt failures. Gate the run:
  // an hour of arena time against a broken dependency is worse than not running.
  if (!args['skip-preflight']) {
    const preflight = require('../src/services/dialogue-gym/preflight.service');
    const result = await preflight.runPreflight();
    console.log(preflight.formatReport(result));
    if (!result.ok) {
      console.error('\nAborting: these runs would produce failures indistinguishable from prompt defects.');
      console.error('Fix the dependency, or pass --skip-preflight if you know why it is down and want to run anyway.');
      process.exit(3);
    }
  }

  const t0 = Date.now();
  const result = await gepa.runOptimization(cfg);
  console.log('\n' + '═'.repeat(60));
  console.log('RESULT');
  console.log(`  optimizationId    : ${result.optimizationId}`);
  console.log(`  iterations        : ${result.iterations}`);
  console.log(`  baseline → final  : ${result.baselineScore?.toFixed(3)} → ${result.finalScore?.toFixed(3)}`);
  console.log(`  improvement       : ${result.improvementPercent == null ? '—' : result.improvementPercent.toFixed(1) + '%'}`);
  console.log(`  recommended cand. : ${result.recommendedCandidateId?.slice(0, 8)}`);
  console.log(`  wall time         : ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(result.approvalRequest ? '  → governance approval request created (review + approve to SAVE as a new version)' : '  (no improvement over baseline — nothing to approve)');
  console.log('═'.repeat(60));
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[run-gepa] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
