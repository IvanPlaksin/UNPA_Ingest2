'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../src/instances/.env') });

const edgeWeightService = require('../src/services/knowledge/edge-weight.service');

const NEW_WEIGHTS = [
  { relType: 'MANDATES',        strength: 0.95, description: 'Formal mandate/authorization' },
  { relType: 'OVERSEES',        strength: 0.90, description: 'Supervisory/oversight relationship' },
  { relType: 'ESTABLISHED_BY',  strength: 0.85, description: 'Institutional creation/founding' },
  { relType: 'ESTABLISHES',     strength: 0.85, description: 'Institutional creation (active)' },
  { relType: 'REPORTS_TO',      strength: 0.80, description: 'Reporting/accountability chain' },
  { relType: 'CHAIRED_BY',      strength: 0.75, description: 'Leadership/chairmanship' },
  { relType: 'PART_OF',         strength: 0.75, description: 'Structural containment/membership' },
  { relType: 'AUTHORED_BY',     strength: 0.70, description: 'Authorship/creation attribution' },
  { relType: 'FUNDED_BY',       strength: 0.65, description: 'Financial dependency' },
  { relType: 'COOPERATES_WITH', strength: 0.50, description: 'Collaborative relationship' },
];

async function main() {
  console.log('[seed-unknown-rel-weights] Starting...');
  for (const w of NEW_WEIGHTS) {
    await edgeWeightService.updateWeight(w.relType, w.strength, w.description);
    console.log(`  ✓ ${w.relType.padEnd(22)} strength=${w.strength}`);
  }
  console.log('\n[seed-unknown-rel-weights] Recalculating all edge costs with degree penalty...');
  const stats = await edgeWeightService.recalculateAllEdgeCosts(true);
  console.log(`  Updated : ${stats.updated} edges`);
  console.log(`  Cost min: ${stats.min.toFixed(4)}`);
  console.log(`  Cost max: ${stats.max.toFixed(4)}`);
  console.log(`  Cost avg: ${stats.avg.toFixed(4)}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
