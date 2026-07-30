'use strict';

/**
 * Interactive ground-truth ratification for Dialogue Gym scenarios (ШАГ 3.6).
 *
 * For each scenario that is not yet groundTruthVerified, shows the scenario and
 * the live Qdrant top-5 service candidates for its initialMessage, and lets the
 * reviewer confirm the correct expectedServiceCode (or mark "no single service").
 * Writes groundTruthVerified=true + audit fields via gym.verifyGroundTruth.
 *
 *   node api/scripts/verify-ground-truth.js            # only unverified
 *   node api/scripts/verify-ground-truth.js --all      # re-review everything
 *   node api/scripts/verify-ground-truth.js --by=ivan  # stamp verifiedBy
 *
 * Per scenario, enter one of:
 *   1-5   pick that Qdrant candidate as expectedServiceCode
 *   s     type a service_code manually
 *   n     no single correct service (expectedServiceCode = null, still verified)
 *   k     keep the current expectedServiceCode as-is (but mark verified)
 *   skip  leave unverified, move on
 *   q     quit
 *
 * @module scripts/verify-ground-truth
 */

require('dotenv').config();
const readline = require('readline');
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const REVIEW_ALL = !!args.all;
const VERIFIED_BY = args.by || 'cli';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function topCandidates(message) {
  try {
    const rs = require('../src/instances/flowdesk/services/resolve-search.service').getResolveSearch();
    const hits = await rs(message, {});
    return (hits || []).filter((h) => h.type === 'SERVICE').slice(0, 5);
  } catch (e) {
    console.log(`  (Qdrant lookup failed: ${e.message})`);
    return [];
  }
}

async function main() {
  const { items } = await gym.listScenarios({ enabled: true, limit: 1000 });
  const todo = REVIEW_ALL ? items : items.filter((s) => !s.groundTruthVerified);
  console.log(`\n${todo.length} scenario(s) to review${REVIEW_ALL ? ' (--all)' : ' (unverified)'}.\n`);

  let done = 0;
  for (const s of todo) {
    console.log('═'.repeat(72));
    console.log(`SCENARIO  ${s.scenarioId}`);
    console.log(`  name       : ${s.name}  [${s.category}/${s.domain}/${s.difficulty}]`);
    console.log(`  userGoal   : ${s.userGoal}`);
    console.log(`  initialMsg : "${s.initialMessage}"`);
    console.log(`  current expectedServiceCode: ${s.expectedServiceCode || '(none)'}  ${s.groundTruthVerified ? '[verified]' : '[UNVERIFIED]'}`);

    const cands = await topCandidates(s.initialMessage);
    if (cands.length) {
      console.log('  Qdrant top candidates:');
      cands.forEach((c, i) => console.log(`    ${i + 1}. ${c.serviceId}  —  ${c.title}  (${(c.score ?? 0).toFixed?.(3) ?? c.score}, ${c.domain || ''})`));
    } else {
      console.log('  Qdrant top candidates: (none)');
    }

    const ans = (await ask('  choose [1-5 / s=manual / n=none / k=keep / skip / q=quit]: ')).trim().toLowerCase();
    if (ans === 'q') break;
    if (ans === 'skip' || ans === '') { console.log('  → skipped\n'); continue; }

    let expectedServiceCode; let notes = null;
    if (/^[1-5]$/.test(ans) && cands[Number(ans) - 1]) {
      expectedServiceCode = cands[Number(ans) - 1].serviceId;
    } else if (ans === 's') {
      expectedServiceCode = (await ask('    service_code: ')).trim() || null;
    } else if (ans === 'n') {
      expectedServiceCode = null; notes = 'no single correct service (deflection/disambiguation expected)';
    } else if (ans === 'k') {
      expectedServiceCode = s.expectedServiceCode || null;
    } else {
      console.log('  → unrecognized, skipped\n'); continue;
    }

    const extraNote = (await ask('    note (optional): ')).trim();
    const updated = await gym.verifyGroundTruth(s.scenarioId, {
      expectedServiceCode,
      groundTruthNotes: extraNote || notes,
      verifiedBy: VERIFIED_BY,
    });
    console.log(`  ✓ verified → expectedServiceCode=${updated.expectedServiceCode || '(null)'}  by=${updated.verifiedBy}\n`);
    done++;
  }

  const { total } = await gym.listScenarios({ groundTruthVerified: true, limit: 1000 });
  console.log('═'.repeat(72));
  console.log(`Done. Verified this session: ${done}. Total verified scenarios: ${total}.`);
}

main()
  .then(async () => { rl.close(); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[verify-ground-truth] FAILED:', err.message); rl.close(); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
