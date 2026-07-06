'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../src/instances/.env') });

const edgeWeightService = require('../src/services/knowledge/edge-weight.service');

async function main() {
  console.log('[seed-rel-type-weights] Starting...');

  try {
    const seedLog = await edgeWeightService.seedRelTypeWeights();
    console.log(`[seed-rel-type-weights] Weight entries (${seedLog.length}):`);
    for (const e of seedLog) console.log(`  ${e.action.padEnd(8)} ${e.relType}`);

    console.log('[seed-rel-type-weights] Materializing edge costs...');
    const stats = await edgeWeightService.recalculateAllEdgeCosts();
    console.log('[seed-rel-type-weights] Done:');
    console.log(`  Edges updated : ${stats.updated}`);
    console.log(`  Cost min      : ${stats.min.toFixed(4)}`);
    console.log(`  Cost max      : ${stats.max.toFixed(4)}`);
    console.log(`  Cost avg      : ${stats.avg.toFixed(4)}`);

    process.exit(0);
  } catch (err) {
    console.error('[seed-rel-type-weights] Error:', err.message);
    process.exit(1);
  }
}

main();
