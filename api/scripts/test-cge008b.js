'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');
const { entityStoreService } = require('../src/services/knowledge/entity-store.service');
const { impactAnalysisService } = require('../src/services/knowledge/impact-analysis.service');
const SERVICES = { entityStoreService, impactAnalysisService };

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function main() {
  console.log('=== CGE-008B: STRUCTURE + IMPACT envelope test ===\n');

  const rows = await mg.runQuery(`MATCH (e:ESEntity) RETURN e.id AS id LIMIT 1`, {});
  const entityId = rows[0]?.id;
  if (!entityId) throw new Error('No ESEntity found');

  // ── STRUCTURE ────────────────────────────────────────────────────────────────
  console.log('1. STRUCTURE primitive');
  try {
    const sp = require('../src/services/investigation/primitives/structure.primitive.js');
    const sr = await sp.execute({ entityIds: [entityId], depth: 1 }, {}, SERVICES);
    const sc = sr.content;
    ok('STRUCTURE: nodes is array',          Array.isArray(sc.nodes),          `len=${sc.nodes?.length}`);
    ok('STRUCTURE: edges is array',          Array.isArray(sc.edges));
    ok('STRUCTURE: projection.kind = graph', sc.projection?.kind === 'graph');
    ok('STRUCTURE: hints.metrics present',   Array.isArray(sc.projection?.hints?.metrics));
    ok('STRUCTURE: hints.bridges present',   Array.isArray(sc.projection?.hints?.bridges));
    ok('STRUCTURE: summary.nodeCount',       sc.summary?.nodeCount >= 0);
  } catch (e) { ok('STRUCTURE: no crash', false, e.message); }

  // ── IMPACT ───────────────────────────────────────────────────────────────────
  console.log('\n2. IMPACT primitive');
  try {
    const ip = require('../src/services/investigation/primitives/impact.primitive.js');
    const ir = await ip.execute({ entityId, maxDepth: 2, includeStructural: false }, {}, SERVICES);
    const ic = ir.content;
    ok('IMPACT: nodes is array',             Array.isArray(ic.nodes),          `len=${ic.nodes?.length}`);
    ok('IMPACT: edges is array',             Array.isArray(ic.edges));
    ok('IMPACT: roots = [entityId]',         ic.roots?.[0] === entityId);
    ok('IMPACT: projection.kind = tree',     ic.projection?.kind === 'tree');
    ok('IMPACT: hints.directDependents',     Array.isArray(ic.projection?.hints?.directDependents));
    ok('IMPACT: hints.recs present',         Array.isArray(ic.projection?.hints?.recommendations));
    ok('IMPACT: summary.riskAssessment',     !!ic.summary?.riskAssessment?.riskLevel, ic.summary?.riskAssessment?.riskLevel);
    ok('IMPACT: summary.headline',           !!ic.summary?.headline);
    ok('IMPACT: evidencedBy populated',      ir.evidencedBy?.length > 0);
  } catch (e) { ok('IMPACT: no crash', false, e.message); }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('CGE-008B PASSED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
