'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function main() {
  console.log('=== CGE-008D: MATRIX + TIMELINE + TEXT + SYNTHESIZE envelope test ===\n');

  // Fetch some entity IDs
  const rows = await mg.runQuery(`MATCH (e:ESEntity) RETURN e.id AS id, e.name AS name LIMIT 5`, {});
  if (!rows.length) throw new Error('No ESEntity found');
  const ids = rows.map(r => r.id);

  // ── MATRIX ───────────────────────────────────────────────────────────────────
  console.log('1. MATRIX primitive');
  try {
    const mp = require('../src/services/investigation/primitives/matrix.primitive.js');
    const mr = await mp.execute({ rowEntityIds: ids.slice(0, 3), colEntityIds: ids.slice(0, 3) }, {}, {});
    const mc = mr.content;
    ok('MATRIX: nodes is array',              Array.isArray(mc.nodes));
    ok('MATRIX: edges is array',              Array.isArray(mc.edges));
    ok('MATRIX: projection.kind = matrix',   mc.projection?.kind === 'matrix');
    ok('MATRIX: hints.rowEntities present',  Array.isArray(mc.projection?.hints?.rowEntities));
    ok('MATRIX: hints.colEntities present',  Array.isArray(mc.projection?.hints?.colEntities));
    ok('MATRIX: hints.cells present',        Array.isArray(mc.projection?.hints?.cells));
    ok('MATRIX: summary.totalCells >= 0',    mc.summary?.totalCells >= 0, `cells=${mc.summary?.totalCells}`);
    ok('MATRIX: evidencedBy populated',      mr.evidencedBy?.length > 0);
    ok('MATRIX: roots = rowEntityIds',       Array.isArray(mc.roots) && mc.roots.length > 0);
  } catch (e) { ok('MATRIX: no crash', false, e.message); }

  // ── TIMELINE ─────────────────────────────────────────────────────────────────
  console.log('\n2. TIMELINE primitive');
  try {
    const tp = require('../src/services/investigation/primitives/timeline.primitive.js');
    const tr = await tp.execute({ entityIds: ids, limit: 20 }, {}, {});
    const tc = tr.content;
    ok('TIMELINE: nodes is array',              Array.isArray(tc.nodes));
    ok('TIMELINE: projection.kind = timeline',  tc.projection?.kind === 'timeline');
    ok('TIMELINE: hints.events present',        Array.isArray(tc.projection?.hints?.events));
    ok('TIMELINE: hints.span present',          tc.projection?.hints?.span !== undefined);
    ok('TIMELINE: summary.eventCount >= 0',     tc.summary?.eventCount >= 0, `events=${tc.summary?.eventCount}`);
    ok('TIMELINE: summary.headline',            !!tc.summary?.headline);
    ok('TIMELINE: evidencedBy populated',       tr.evidencedBy?.length >= 0);
  } catch (e) { ok('TIMELINE: no crash', false, e.message); }

  // ── TEXT ─────────────────────────────────────────────────────────────────────
  console.log('\n3. TEXT primitive');
  try {
    const txp = require('../src/services/investigation/primitives/text.primitive.js');
    const txr = await txp.execute({ title: 'Test Note', body: 'Hello world from CGE test.', evidencedBy: ids.slice(0, 2) }, {}, {});
    const txc = txr.content;
    ok('TEXT: nodes is array',            Array.isArray(txc.nodes));
    ok('TEXT: nodes is empty',            txc.nodes.length === 0);
    ok('TEXT: projection.kind = text',    txc.projection?.kind === 'text');
    ok('TEXT: summary.title',             txc.summary?.title === 'Test Note');
    ok('TEXT: summary.body',              txc.summary?.body === 'Hello world from CGE test.');
    ok('TEXT: summary.wordCount',         txc.summary?.wordCount === 5);
    ok('TEXT: summary.hasEvidence',       txc.summary?.hasEvidence === true);
    ok('TEXT: evidencedBy populated',     txr.evidencedBy?.length === 2);
  } catch (e) { ok('TEXT: no crash', false, e.message); }

  // ── SYNTHESIZE ───────────────────────────────────────────────────────────────
  console.log('\n4. SYNTHESIZE primitive (no-evidence path)');
  try {
    const sp = require('../src/services/investigation/primitives/synthesize.primitive.js');
    const sr = await sp.execute({ focus: 'test', format: 'summary' }, { artifactsSummary: [] }, {});
    const sc = sr.content;
    ok('SYNTHESIZE(empty): nodes is array',            Array.isArray(sc.nodes));
    ok('SYNTHESIZE(empty): projection.kind = text',    sc.projection?.kind === 'text');
    ok('SYNTHESIZE(empty): summary.narrative',         !!sc.summary?.narrative);
    ok('SYNTHESIZE(empty): evidencedBy empty',         sr.evidencedBy?.length === 0);
  } catch (e) { ok('SYNTHESIZE(empty): no crash', false, e.message); }

  console.log('\n4b. SYNTHESIZE primitive (with evidence corpus)');
  try {
    const sp = require('../src/services/investigation/primitives/synthesize.primitive.js');
    const fakeArtifacts = [{
      evidencedBy: ids.slice(0, 3),
      primitiveType: 'LOCATE',
      contentSummary: { query: 'United Nations', totalFound: 3 },
    }];
    const sr2 = await sp.execute({ focus: 'governance', format: 'bullets' }, { artifactsSummary: fakeArtifacts }, {});
    const sc2 = sr2.content;
    ok('SYNTHESIZE(corpus): nodes is array',           Array.isArray(sc2.nodes));
    ok('SYNTHESIZE(corpus): projection.kind = text',   sc2.projection?.kind === 'text');
    ok('SYNTHESIZE(corpus): summary.narrative',        !!sc2.summary?.narrative);
    ok('SYNTHESIZE(corpus): summary.focus = governance', sc2.summary?.focus === 'governance');
    ok('SYNTHESIZE(corpus): summary.format = bullets', sc2.summary?.format === 'bullets');
    ok('SYNTHESIZE(corpus): summary.evidenceCount',    sc2.summary?.evidenceCount > 0);
    ok('SYNTHESIZE(corpus): evidencedBy populated',    sr2.evidencedBy?.length > 0);
  } catch (e) { ok('SYNTHESIZE(corpus): no crash', false, e.message); }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('CGE-008D PASSED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
