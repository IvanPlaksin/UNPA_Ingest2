'use strict';

/**
 * Recall diagnostics (ШАГ 4.5-D). For every verified scenario, run the agent's
 * real resolveSearch over the initialMessage and report the RANK of the ratified
 * expectedServiceCode — to separate a top-3 disambiguation CUTOFF problem from a
 * catalog COVERAGE problem. No LLM cost (Qdrant + TEI only).
 *
 *   node api/scripts/diagnose-recall.js
 *
 * @module scripts/diagnose-recall
 */

require('dotenv').config();
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');

async function main() {
  const rs = require('../src/instances/flowdesk/services/resolve-search.service').getResolveSearch();
  const { items } = await gym.listScenarios({ enabled: true, groundTruthVerified: true, limit: 1000 });

  const buckets = { top1: 0, top3: 0, top5: 0, top10: 0, notFound: 0, noExpected: 0 };
  const rows = [];

  for (const s of items) {
    if (!s.expectedServiceCode) { buckets.noExpected++; continue; }
    let hits = [];
    try {
      const out = await rs(s.initialMessage, {});
      hits = (out || []).filter((h) => h.type === 'SERVICE');
    } catch (e) {
      rows.push({ s, err: e.message });
      continue;
    }
    const pos = hits.findIndex((h) => (h.serviceId || h.service_code) === s.expectedServiceCode);
    const rank = pos < 0 ? null : pos + 1;
    const top1 = hits[0];
    const expected = pos >= 0 ? hits[pos] : null;
    const gapToTop1 = expected && top1 && typeof expected.score === 'number' && typeof top1.score === 'number'
      ? (top1.score - expected.score) : null;

    if (rank === null) buckets.notFound++;
    else { if (rank <= 1) buckets.top1++; if (rank <= 3) buckets.top3++; if (rank <= 5) buckets.top5++; if (rank <= 10) buckets.top10++; }

    rows.push({ s, hits, rank, gapToTop1 });

    console.log('═'.repeat(74));
    console.log(`Scenario: ${s.scenarioId}  [${s.category}/${s.domain}]`);
    console.log(`  initialMessage : "${s.initialMessage}"`);
    console.log(`  expected (ivan): ${s.expectedServiceCode}`);
    console.log('  resolveSearch SERVICE hits:');
    hits.slice(0, 10).forEach((h, i) => {
      const code = h.serviceId || h.service_code;
      const mark = code === s.expectedServiceCode ? '  ← EXPECTED' : '';
      console.log(`    #${i + 1}  ${String(code).padEnd(20)} score=${(h.score ?? 0).toFixed ? (h.score).toFixed(3) : h.score}  "${h.title || ''}"${mark}`);
    });
    if (rank === null) console.log('  → EXPECTED NOT IN RESULTS (coverage/semantic gap)');
    else console.log(`  → position ${rank}${rank > 3 ? '  (OUTSIDE top-3 cutoff)' : '  (in top-3)'}  gapToTop1=${gapToTop1 == null ? 'n/a' : gapToTop1.toFixed(3)}`);
  }

  console.log(`\n${'═'.repeat(74)}\n=== SUMMARY (${rows.length} verified scenarios with an expected code) ===`);
  console.log(`  in top-1  : ${buckets.top1}`);
  console.log(`  in top-3  : ${buckets.top3}   (current disambiguation cutoff)`);
  console.log(`  in top-5  : ${buckets.top5}`);
  console.log(`  in top-10 : ${buckets.top10}`);
  console.log(`  NOT found : ${buckets.notFound}   (coverage / semantic gap — cutoff won't help)`);
  const fixByTop5 = buckets.top5 - buckets.top3;
  console.log('\nRECOMMENDATION:');
  console.log(`  • Expanding disambiguation top-3 → top-5 would surface ${fixByTop5} more scenario(s).`);
  console.log(`  • ${buckets.notFound} scenario(s) need a scenario↔service re-mapping or a catalog coverage fix (enrichment/new service).`);
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[diagnose-recall] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
