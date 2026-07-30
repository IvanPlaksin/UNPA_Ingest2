'use strict';

/**
 * Compute Cohen's κ between the human judge and the LLM judge over runs that both
 * have scored — the Judge calibration gate (ШАГ 4.8). κ ≥ 0.6 = usable.
 *
 *   node api/scripts/compute-kappa.js [--model=claude-sonnet-4-6]
 *
 * For each run with both a human:* record and an LLM record, criterion scores are
 * binned into low(<0.4)/mid(0.4–0.7)/high(≥0.7) and κ is computed per criterion,
 * plus κ over the 5-way overallVerdict. Continuous agreement (mean |Δ|) is also
 * reported.
 *
 * @module scripts/compute-kappa
 */

require('dotenv').config();
const arena = require('../src/services/dialogue-gym/arena-runner.service');
const judge = require('../src/services/dialogue-gym/judge.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));

const band = (v) => (v == null ? null : (v < 0.4 ? 'low' : (v < 0.7 ? 'mid' : 'high')));

/** Cohen's κ for two aligned arrays of categorical labels. */
function cohensKappa(a, b) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null);
  const n = pairs.length;
  if (n === 0) return { kappa: null, n: 0 };
  const cats = [...new Set(pairs.flat())];
  let po = 0;
  const rowT = {}; const colT = {};
  for (const c of cats) { rowT[c] = 0; colT[c] = 0; }
  for (const [x, y] of pairs) { if (x === y) po += 1; rowT[x] += 1; colT[y] += 1; }
  po /= n;
  let pe = 0;
  for (const c of cats) pe += (rowT[c] / n) * (colT[c] / n);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  return { kappa, n, po, pe };
}

const CRITERIA = ['groundingScore', 'toneScore', 'controlsCorrectnessScore', 'helpfulnessScore'];

async function main() {
  const { items: runs } = await arena.listRuns({ limit: 1000 });
  const paired = [];
  for (const r of runs) {
    const recs = await judge.getRecordsForRun(r.runId);
    const human = recs.find((x) => String(x.judgeModel).startsWith('human:'));
    const llm = recs.filter((x) => !String(x.judgeModel).startsWith('human:') && x.judgeModel !== 'deterministic-only')
      .filter((x) => !args.model || String(x.judgeModel).includes(args.model))
      .sort((a, b) => String(b.judgedAt).localeCompare(String(a.judgedAt)))[0];
    if (human && llm) paired.push({ runId: r.runId, human, llm });
  }

  console.log(`Paired (human + LLM) runs: ${paired.length}`);
  if (!paired.length) { console.log('Nothing to compare. Run judge (LLM) + judge-manual (human) on the same runs first.'); return; }

  console.log('\nCohen’s κ per criterion (binned low/mid/high):');
  for (const c of CRITERIA) {
    const h = paired.map((p) => band(p.human[c]));
    const l = paired.map((p) => band(p.llm[c]));
    const { kappa, n } = cohensKappa(h, l);
    const deltas = paired.map((p) => (p.human[c] != null && p.llm[c] != null ? Math.abs(p.human[c] - p.llm[c]) : null)).filter((x) => x != null);
    const mad = deltas.length ? (deltas.reduce((s, x) => s + x, 0) / deltas.length) : null;
    console.log(`  ${c.padEnd(26)} κ=${kappa == null ? 'n/a' : kappa.toFixed(3)}  (n=${n}, mean|Δ|=${mad == null ? 'n/a' : mad.toFixed(3)})`);
  }

  const kv = cohensKappa(paired.map((p) => p.human.overallVerdict), paired.map((p) => p.llm.overallVerdict));
  console.log(`\noverallVerdict (5-way)      κ=${kv.kappa == null ? 'n/a' : kv.kappa.toFixed(3)}  (n=${kv.n})`);

  const overallDeltas = paired.map((p) => Math.abs((p.human.overallScore || 0) - (p.llm.overallScore || 0)));
  const mad = overallDeltas.reduce((s, x) => s + x, 0) / overallDeltas.length;
  console.log(`overallScore mean|Δ|        ${mad.toFixed(3)}`);
  console.log(`\nGate: κ ≥ 0.60 on overallVerdict = Judge usable. ${kv.kappa != null && kv.kappa >= 0.6 ? 'PASS ✓' : 'BELOW THRESHOLD — refine rubric & re-judge'}`);
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[compute-kappa] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
