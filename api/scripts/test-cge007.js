'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');
const primitive = require('../src/services/investigation/primitives/profile.primitive.js');
const { entityStoreService } = require('../src/services/knowledge/entity-store.service');
const { impactAnalysisService } = require('../src/services/knowledge/impact-analysis.service');

async function main() {
  console.log('=== CGE-007: profile.primitive CGE envelope test ===\n');

  const rows = await mg.runQuery('MATCH (e:ESEntity) RETURN e.id AS id LIMIT 1', {});
  const id = rows[0]?.id;
  if (!id) throw new Error('No ESEntity found');

  const result = await primitive.execute({ entityId: id }, {}, { entityStoreService, impactAnalysisService });
  const c = result.content;

  let pass = 0, fail = 0;
  function ok(label, cond, detail = '') {
    if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
    else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
  }

  ok('content.nodes is array',           Array.isArray(c.nodes),          `len=${c.nodes?.length}`);
  ok('content.edges is array',           Array.isArray(c.edges),          `len=${c.edges?.length}`);
  ok('content.roots includes entityId',  c.roots?.includes(id),           c.roots);
  ok('projection.kind = dossier',        c.projection?.kind === 'dossier');
  ok('summary.headline set',             !!c.summary?.headline,           c.summary?.headline);
  ok('summary.entity present',           !!c.summary?.entity?.id);
  ok('hints.relationships present',      typeof c.projection?.hints?.relationships === 'object');
  ok('evidencedBy = [entityId]',         result.evidencedBy?.[0] === id,  result.evidencedBy);

  if (c.nodes?.length > 0) {
    const root = c.nodes.find(n => n.id === id);
    ok('root node in nodes',             !!root,                          root?.name);
    ok('root node has label',            !!root?.label);
  }
  if (c.edges?.length > 0) {
    ok('edge has relType',               !!c.edges[0]?.relType,           c.edges[0]?.relType);
    ok('edge has source/target',         !!c.edges[0]?.source && !!c.edges[0]?.target);
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('CGE-007 PASSED — profile.primitive returns CGE envelope.');
  else            console.log('CGE-007 FAILED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
