'use strict';

/**
 * EXP-002 — run the same scenarios through both interpreters and compare.
 *
 *   node api/scripts/run-exp002-comparison.js --pairs=4 --max-turns=6
 *   node api/scripts/run-exp002-comparison.js --modes=fsm,agent --model=claude-haiku-4-5-20251001
 *
 * Identical scenarios, identical personas, identical catalogue and forms; the
 * only difference is which interpreter holds the conversation. Metrics come from
 * dialogue-metrics (counted from transcripts, no judge, no sampling noise) —
 * at these sample sizes the judge's scores cannot separate anything, so the
 * comparison rests on what is countable.
 *
 * @module scripts/run-exp002-comparison
 */

require('dotenv').config();

const arena = require('../src/services/dialogue-gym/arena-runner.service');
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');
const preflight = require('../src/services/dialogue-gym/preflight.service');
const { runMetrics } = require('../src/services/dialogue-gym/dialogue-metrics.service');
const metricsSvc = require('../src/services/dialogue-gym/dialogue-metrics.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const MODES = String(args.modes || 'fsm,agent').split(',').map((s) => s.trim()).filter(Boolean);
const PAIRS = args.pairs ? parseInt(args.pairs, 10) : 4;
const MAX_TURNS = args['max-turns'] ? parseInt(args['max-turns'], 10) : 6;
const PROMPT_ENTRY = args['prompt-entry'] || process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;
// HYB-006: by default a run ENDS the moment the expected service is identified —
// which happens on turn 2 or 3, before a single field is asked. That is the right
// terminal for measuring intent resolution and the wrong one for measuring form
// filling: it is why the arena could not see the hybrid's template path even after
// the persona learned to click. --walk-form keeps the dialogue going into the form.
const WALK_FORM = !!args['walk-form'];

const pct = (v) => (v == null ? 'n/a' : `${(100 * v).toFixed(1)}%`);

async function main() {
  if (!args['skip-preflight']) {
    const pf = await preflight.runPreflight();
    if (!pf.ok) {
      console.log(preflight.formatReport(pf));
      console.error('\nAborting: the runs would fail for infrastructure reasons, not architectural ones.');
      process.exit(3);
    }
    console.log(`preflight OK (${pf.durationMs}ms)`);
  }

  const { items: scenarios } = await gym.listScenarios({ enabled: true, limit: 100 });
  const { items: personas } = await gym.listPersonas({ enabled: true, limit: 100 });
  if (!scenarios.length || !personas.length) throw new Error('no enabled scenarios/personas');

  // Deterministic pairing so both modes face exactly the same dialogues.
  //
  // HYB-007 added the targeted form: --persona / --scenario pin ONE pair, because a
  // question like "what does a long form cost per turn in each interpreter" is
  // answered by one dialogue walked to the end, not by three sampled openings.
  const pairs = [];
  if (args.persona || args.scenario) {
    const pick = (list, id, key, what) => {
      if (!id) return list[0];
      const found = list.find((x) => x[key] === id || x.name === id);
      if (!found) throw new Error(`no enabled ${what} matching "${id}"`);
      return found;
    };
    pairs.push({
      scenario: pick(scenarios, args.scenario, 'scenarioId', 'scenario'),
      persona: pick(personas, args.persona, 'personaId', 'persona'),
    });
  } else {
    for (let i = 0; i < PAIRS; i += 1) {
      pairs.push({ scenario: scenarios[i % scenarios.length], persona: personas[i % personas.length] });
    }
  }

  console.log('='.repeat(72));
  console.log('EXP-002 COMPARISON');
  console.log(`  modes     : ${MODES.join(' vs ')}`);
  console.log(`  pairs     : ${pairs.length} (identical across modes)`);
  console.log(`  maxTurns  : ${MAX_TURNS}`);
  console.log(`  agent graph: ${PROMPT_ENTRY || '(none — agent uses contract + tools only)'}`);
  for (const p of pairs) console.log(`    · ${p.scenario.name} × ${p.persona.name}`);
  console.log('='.repeat(72));

  const byMode = {};
  for (const mode of MODES) {
    const turnsAll = [];
    const runs = [];
    let failed = 0;
    for (const { scenario, persona } of pairs) {
      process.stdout.write(`  [${mode}] ${scenario.name} × ${persona.name} ... `);
      const t0 = Date.now();
      try {
        const { run } = await arena.runArena(persona.personaId, scenario.scenarioId, {
          maxTurns: MAX_TURNS,
          interpreterMode: mode,
          ...(WALK_FORM ? { stopOnServiceMatch: false } : {}),
          ...(mode === 'agent' && PROMPT_ENTRY ? { agentPromptEntryId: PROMPT_ENTRY } : {}),
          ...(args.model ? { agentModel: args.model } : {}),
        });
        // Read the stored ArenaTurns, NOT the returned transcript. The transcript
        // is chat history ([{role,content}]), and re-mapping it produced empty
        // fields that scored as 100% generated for both modes — a measurement
        // artefact, not a result. The store holds userMessage/agentResponse and
        // is the same source the baseline was computed from.
        const turns = await metricsSvc.turnsForRun(run.runId);
        turnsAll.push(...turns);
        runs.push({ run, turns: turns.length, terminal: run.terminalCondition, correct: !!run.serviceIdentified, turnNodes: turns });
        console.log(`${run.terminalCondition} (${turns.length} turns, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } catch (e) {
        failed += 1;
        console.log(`FAILED: ${e.message}`);
      }
    }
    byMode[mode] = { metrics: runMetrics(turnsAll), runs, failed, totalTurns: turnsAll.length };
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('RESULTS');
  console.log('='.repeat(72));
  const rows = [
    ['turns recorded', (m) => String(m.totalTurns)],
    ['empty replies', (m) => String(m.metrics.emptyTurns ?? 0)],
    ['generationRate', (m) => pct(m.metrics.generationRate)],
    ['templateRate', (m) => pct(m.metrics.templateRate)],
    ['templateRepeatRate', (m) => pct(m.metrics.templateRepeatRate)],
    ['user rejections', (m) => String(m.metrics.rejects)],
    ['explainAfterRejectRate', (m) => pct(m.metrics.explainAfterRejectRate)],
    ['maxConsecutiveTemplate', (m) => String(m.metrics.maxConsecutiveTemplate)],
    ['service identified', (m) => `${m.runs.filter((r) => r.correct).length}/${m.runs.length}`],
    ['runs failed', (m) => String(m.failed)],
    // HYB-1: what the hybrid was built to move. Null on fsm/agent turns, which is
    // why these read as 0%/n-a there rather than as a comparison.
    ['template turns', (m) => shareOf(m, (t) => t.turnAuthor === 'template')],
    ['model calls / turn', (m) => avgOf(m, (t) => t.modelCalls)],
    ['avg agent latency', (m) => `${avgOf(m, (t) => t.agentLatencyMs)} ms`],
    ['router reasons', (m) => reasonsOf(m)],
  ];
  // Small helpers for the HYB-1 rows. All three read the turns the store recorded,
  // so they measure what happened rather than what the code intended.
  function allTurns(m) { return (m.runs || []).flatMap((r) => r.turnNodes || []); }
  function shareOf(m, pred) {
    const t = allTurns(m);
    if (!t.length) return 'n/a';
    return `${Math.round((100 * t.filter(pred).length) / t.length)}%`;
  }
  function avgOf(m, pick) {
    // Memgraph hands integers back as {low, high} through the driver often enough
    // that reading them as numbers only would silently report "n/a" for a metric
    // that was recorded perfectly well.
    const num = (v) => (v && typeof v === 'object' && 'low' in v ? v.low : v);
    const vals = allTurns(m).map((t) => num(pick(t))).filter((v) => typeof v === 'number');
    if (!vals.length) return 'n/a';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg >= 10 ? String(Math.round(avg)) : avg.toFixed(2);
  }
  function reasonsOf(m) {
    const counts = {};
    for (const t of allTurns(m)) if (t.routerReason) counts[t.routerReason] = (counts[t.routerReason] || 0) + 1;
    const pairs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return pairs.length ? pairs.map(([k, n]) => `${k}:${n}`).join(' ') : 'n/a';
  }

  const w = Math.max(...rows.map((r) => r[0].length)) + 2;
  console.log(`${'metric'.padEnd(w)}${MODES.map((x) => x.padEnd(14)).join('')}`);
  for (const [label, fn] of rows) {
    console.log(`${label.padEnd(w)}${MODES.map((mo) => String(fn(byMode[mo])).padEnd(14)).join('')}`);
  }
  console.log('='.repeat(72));
  console.log('Metrics are counted from transcripts — no judge, no sampling noise.');
  console.log('Service-identification counts ARE small-sample; read them as direction, not proof.');
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch { /* ignore */ } process.exit(0); })
  .catch(async (e) => {
    console.error('\n[exp002] FAILED:', e.message);
    try { await require('../src/services/memgraph.service').close(); } catch { /* ignore */ }
    process.exit(1);
  });
