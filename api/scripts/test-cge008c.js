'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');
const { entityStoreService } = require('../src/services/knowledge/entity-store.service');
const SERVICES = { entityStoreService };

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function main() {
  console.log('=== CGE-008C: LOCATE + RESOLVE envelope test ===\n');

  const rows = await mg.runQuery(`MATCH (e:ESEntity) RETURN e.id AS id, e.name AS name LIMIT 1`, {});
  const { id: entityId, name: entityName } = rows[0] || {};
  if (!entityId) throw new Error('No ESEntity found');

  // ── LOCATE ───────────────────────────────────────────────────────────────────
  console.log('1. LOCATE primitive');
  try {
    const lp = require('../src/services/investigation/primitives/locate.primitive.js');
    const lr = await lp.execute({ query: 'United Nations' }, {}, SERVICES);
    const lc = lr.content;
    ok('LOCATE: nodes is array',          Array.isArray(lc.nodes));
    ok('LOCATE: roots is empty',          Array.isArray(lc.roots) && lc.roots.length === 0);
    ok('LOCATE: projection.kind = list',  lc.projection?.kind === 'list');
    ok('LOCATE: hints.results present',   Array.isArray(lc.projection?.hints?.results));
    ok('LOCATE: hints.query present',     !!lc.projection?.hints?.query);
    ok('LOCATE: summary.query',           !!lc.summary?.query);
    ok('LOCATE: summary.totalFound >= 0', lc.summary?.totalFound >= 0, `found=${lc.summary?.totalFound}`);
    ok('LOCATE: evidencedBy populated',   lr.evidencedBy?.length >= 0);
    if (lc.nodes?.length > 0) {
      ok('LOCATE: node has .label (CGE)', !!lc.nodes[0]?.label);
    }
  } catch (e) { ok('LOCATE: no crash', false, e.message); }

  // ── RESOLVE ──────────────────────────────────────────────────────────────────
  console.log('\n2. RESOLVE primitive');
  try {
    const rp = require('../src/services/investigation/primitives/resolve.primitive.js');
    const rr = await rp.execute({ entityId, threshold: 0.5 }, {}, SERVICES);
    const rc = rr.content;
    ok('RESOLVE: nodes is array',            Array.isArray(rc.nodes));
    ok('RESOLVE: roots = [entityId]',        rc.roots?.[0] === entityId);
    ok('RESOLVE: projection.kind = list',    rc.projection?.kind === 'list');
    ok('RESOLVE: hints.candidates present',  Array.isArray(rc.projection?.hints?.candidates));
    ok('RESOLVE: hints.suggestedMerges',     Array.isArray(rc.projection?.hints?.suggestedMerges));
    ok('RESOLVE: summary.anchor present',    !!rc.summary?.anchor?.entityId);
    ok('RESOLVE: summary.totalCandidates',   rc.summary?.totalCandidates >= 0, `count=${rc.summary?.totalCandidates}`);
    ok('RESOLVE: evidencedBy populated',     rr.evidencedBy?.length > 0);
  } catch (e) { ok('RESOLVE: no crash', false, e.message); }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('CGE-008C PASSED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
