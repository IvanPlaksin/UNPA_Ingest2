'use strict';

/**
 * Run the Dialogue Gym golden set: every verified scenario × N personas through
 * the arena, then (optionally) judge each run. Emits a JSON summary of runIds.
 *
 *   node api/scripts/run-golden-set.js                 # verified scenarios × up to 3 personas, then judge
 *   node api/scripts/run-golden-set.js --personas=2 --no-judge
 *   node api/scripts/run-golden-set.js --all-scenarios --max-turns=6
 *   node api/scripts/run-golden-set.js --out=golden-runs.json
 *
 * Pairing: prefers each scenario's SUITABLE_FOR personas; falls back to any
 * enabled persona. Sequential (LLM-rate friendly). Costs real LLM tokens.
 *
 * @module scripts/run-golden-set
 */

require('dotenv').config();
const fs = require('fs');
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');
const arena = require('../src/services/dialogue-gym/arena-runner.service');
const judge = require('../src/services/dialogue-gym/judge.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const PERSONAS_PER = parseInt(args.personas, 10) || 3;
const DO_JUDGE = !args['no-judge'];
const MAX_TURNS = args['max-turns'] ? parseInt(args['max-turns'], 10) : 8;
const ALTIORA_TOKEN = args.token || process.env.DIALOGUE_GYM_ALTIORA_TOKEN || undefined;

async function main() {
  await arena.ensureIndexes();
  await judge.ensureIndexes();

  // Preflight: the user/employee directory MUST be reachable, else every run
  // would hit "directory unavailable" and produce misleading transcripts. Abort
  // the whole batch if it is down (Ivan's requirement).
  const dirCheck = await arena.checkDirectory({ token: ALTIORA_TOKEN });
  console.log(`Directory preflight: resolveUser=${JSON.stringify(dirCheck.resolveUser)}${dirCheck.getCurrentUser ? ' getCurrentUser=' + JSON.stringify(dirCheck.getCurrentUser) : ''}`);
  if (!dirCheck.ok) {
    console.error('ABORT: user/employee directory is unavailable — refusing to run (results would not reflect real dialogues). Start Altiora and ensure the directory API responds.');
    process.exit(2);
  }
  if (ALTIORA_TOKEN && dirCheck.getCurrentUser && !dirCheck.getCurrentUser.ok) {
    console.error('ABORT: current-user could not be resolved from the token (getCurrentUser failed) — runs would misreport the directory as unavailable.');
    process.exit(2);
  }

  const filter = args['all-scenarios'] ? { enabled: true } : { enabled: true, groundTruthVerified: true };
  const { items: scenarios } = await gym.listScenarios({ ...filter, limit: 1000 });
  const { items: allPersonas } = await gym.listPersonas({ enabled: true, limit: 1000 });
  console.log(`Golden set: ${scenarios.length} scenario(s), up to ${PERSONAS_PER} persona(s) each. judge=${DO_JUDGE}\n`);

  const runs = [];
  for (const s of scenarios) {
    let personas = (await gym.getPersonasForScenario(s.scenarioId)).filter((p) => p.enabled);
    if (!personas.length) personas = allPersonas;
    personas = personas.slice(0, PERSONAS_PER);
    for (const p of personas) {
      process.stdout.write(`  ▶ ${s.scenarioId} × ${p.personaId} … `);
      try {
        const { run, metrics } = await arena.runArena(p.personaId, s.scenarioId, { maxTurns: MAX_TURNS, promptLabel: 'golden', altioraUserToken: ALTIORA_TOKEN });
        let verdict = '—';
        if (DO_JUDGE) { const rec = await judge.judgeRun(run.runId); verdict = `${rec.overallVerdict} (${rec.overallScore.toFixed(2)})`; }
        runs.push({ runId: run.runId, scenarioId: s.scenarioId, personaId: p.personaId, terminal: metrics.terminalCondition, serviceIdentified: metrics.serviceIdentified });
        console.log(`${metrics.terminalCondition} | svcId=${metrics.serviceIdentified} | judge=${verdict}`);
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
      }
    }
  }

  const out = args.out || 'golden-runs.json';
  fs.writeFileSync(out, JSON.stringify({ generatedFrom: 'run-golden-set', count: runs.length, runs }, null, 2));
  console.log(`\nDone. ${runs.length} runs. runIds written to ${out}`);
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[run-golden-set] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
