'use strict';

/**
 * Manual (human) judgement of an ArenaRun — for Judge calibration (ШАГ 4.8).
 *
 *   node api/scripts/judge-manual.js --run=<runId> [--by=ivan]
 *   node api/scripts/judge-manual.js --pending [--by=ivan]   # walk runs with no human record
 *
 * Shows the scenario, persona, transcript and pre-computed deterministic metrics,
 * then asks the reviewer for grounding / tone / controls / helpfulness (0.0–1.0)
 * and a one-line summary. Saves as JudgeRecord judgeModel="human:<by>".
 *
 * @module scripts/judge-manual
 */

require('dotenv').config();
const readline = require('readline');
const arena = require('../src/services/dialogue-gym/arena-runner.service');
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');
const judge = require('../src/services/dialogue-gym/judge.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const BY = args.by || 'ivan';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
async function askScore(label) {
  while (true) {
    const v = (await ask(`    ${label} (0.0–1.0): `)).trim();
    const n = Number(v);
    if (v !== '' && n >= 0 && n <= 1) return n;
    console.log('      → enter a number between 0 and 1');
  }
}

async function judgeOne(runId) {
  const detail = await arena.getRun(runId);
  if (!detail) { console.log(`run ${runId} not found`); return false; }
  const { run, turns } = detail;
  const scenario = await gym.getScenario(run.scenarioId);
  const persona = await gym.getPersona(run.personaId);
  const det = judge.computeDeterministicMetrics(run, turns, scenario);

  console.log('═'.repeat(72));
  console.log(`RUN ${runId}`);
  console.log(`  scenario : ${scenario ? scenario.name : run.scenarioId}  (expected=${scenario && scenario.expectedServiceCode ? scenario.expectedServiceCode : 'null'}, verified=${scenario ? scenario.groundTruthVerified : '?'})`);
  console.log(`  persona  : ${persona ? persona.name : run.personaId}  (${persona ? persona.domainKnowledge + '/' + persona.cooperativeness : ''})`);
  console.log(`  terminal : ${run.terminalCondition}  turns=${run.turnsCount}`);
  console.log('  ── transcript ──');
  for (const t of turns) {
    console.log(`   #${t.turnIndex} 👤 EN: ${t.userMessage}`);
    if (t.userMessageRu) console.log(`   #${t.turnIndex} 👤 RU: ${t.userMessageRu}`);
    console.log(`   #${t.turnIndex} 🤖 EN: ${t.agentResponse}${t.route ? `  [${t.route}]` : ''}${t.identifiedService ? `  <svc:${t.identifiedService}>` : ''}`);
    if (t.agentResponseRu) console.log(`   #${t.turnIndex} 🤖 RU: ${t.agentResponseRu}`);
  }
  console.log('  ── deterministic (auto) ──');
  console.log(`   intentAccuracy=${det.intentAccuracy} (${det.intentAccuracyScore}) | turnsToIdentify=${det.turnsToIdentify} | clarificationEfficiency=${det.clarificationEfficiencyScore}`);
  console.log('  ── your rubric scores ──');

  const groundingScore = await askScore('grounding (facts from KB, no hallucination)');
  const toneScore = await askScore('tone (UN collegial, polite not robotic)');
  const controlsCorrectnessScore = await askScore('controlsCorrectness (right choices/forms, timing)');
  const helpfulnessScore = await askScore('helpfulness (moved user toward goal)');
  const summaryNotes = (await ask('    summary (1 line): ')).trim();

  const rec = await judge.recordHumanJudgement(runId, { groundingScore, toneScore, controlsCorrectnessScore, helpfulnessScore, summaryNotes, by: BY });
  console.log(`  ✓ saved human judgement — overall=${rec.overallScore.toFixed(3)} (${rec.overallVerdict})\n`);
  return true;
}

async function main() {
  await judge.ensureIndexes();
  let runIds = [];
  if (args.run) {
    runIds = [args.run];
  } else if (args.pending) {
    // Only surface runs that can actually calibrate the judge: an LLM judgement to
    // pair against, no human judgement yet, and not archived (superseded runs).
    // `--all-pending` relaxes the LLM-record requirement (label runs before judging).
    const { items } = await arena.listRuns({ limit: 1000 });
    let skippedArchived = 0; let skippedNoLlm = 0;
    for (const r of items) {
      if (r.archived) { skippedArchived += 1; continue; }
      const recs = await judge.getRecordsForRun(r.runId);
      const hasHuman = recs.some((x) => String(x.judgeModel).startsWith('human:'));
      const hasLlm = recs.some((x) => !String(x.judgeModel).startsWith('human:'));
      if (hasHuman) continue;
      if (!hasLlm && !args['all-pending']) { skippedNoLlm += 1; continue; }
      runIds.push(r.runId);
    }
    console.log(`${runIds.length} run(s) to label (pairable, un-archived).` +
      `${skippedArchived ? ` Skipped ${skippedArchived} archived.` : ''}` +
      `${skippedNoLlm ? ` Skipped ${skippedNoLlm} without an LLM judgement (run judge first, or use --all-pending).` : ''}\n`);
  } else {
    console.log('Usage: --run=<runId> | --pending'); return;
  }
  for (const id of runIds) {
    const cont = await judgeOne(id);
    if (cont && runIds.length > 1) {
      const a = (await ask('  next? [enter=continue / q=quit]: ')).trim().toLowerCase();
      if (a === 'q') break;
    }
  }
}

main()
  .then(async () => { rl.close(); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[judge-manual] FAILED:', err.message); rl.close(); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
