'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { getInvestigationMethodologyService } = require('../src/services/methodology/investigation-methodology.service');

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function main() {
  console.log('=== MTH-001: InvestigationMethodology metamodel test ===\n');

  const svc = getInvestigationMethodologyService();
  let id;

  // CREATE
  console.log('1. create()');
  try {
    const m = await svc.create({
      name:            'Test Research Methodology',
      userCase:        'Unit test verification',
      description:     'Created by test-mth001.js',
      parameterSchema: { serviceName: { type: 'string', required: true }, maxDepth: { type: 'number' } },
      qualityRubric:   { minEntityCount: 5, minProvenanceRatio: 0.3 },
      graphId:         null,
      version:         '0.1.0',
    });
    id = m.id;
    ok('create: returns id',            !!m.id);
    ok('create: name correct',          m.name === 'Test Research Methodology');
    ok('create: status = DRAFT',        m.status === 'DRAFT');
    ok('create: parameterSchema parsed', typeof m.parameterSchema === 'object' && !!m.parameterSchema.serviceName);
    ok('create: qualityRubric parsed',   typeof m.qualityRubric === 'object' && m.qualityRubric.minEntityCount === 5);
    ok('create: version',               m.version === '0.1.0');
  } catch (e) { ok('create: no crash', false, e.message); return; }

  // GET
  console.log('\n2. getById()');
  try {
    const m = await svc.getById(id);
    ok('getById: found',                 !!m);
    ok('getById: id matches',            m.id === id);
    ok('getById: parameterSchema',       typeof m.parameterSchema === 'object');
    ok('getById: qualityRubric',         typeof m.qualityRubric === 'object');
  } catch (e) { ok('getById: no crash', false, e.message); }

  // LIST
  console.log('\n3. list()');
  try {
    const all = await svc.list({ status: 'DRAFT' });
    ok('list: returns array',            Array.isArray(all));
    ok('list: contains created item',    all.some(m => m.id === id));
  } catch (e) { ok('list: no crash', false, e.message); }

  // UPDATE
  console.log('\n4. update()');
  try {
    const updated = await svc.update(id, { description: 'Updated by test', version: '0.2.0' });
    ok('update: description changed',   updated.description === 'Updated by test');
    ok('update: version changed',       updated.version === '0.2.0');
    ok('update: parameterSchema intact', typeof updated.parameterSchema === 'object');
  } catch (e) { ok('update: no crash', false, e.message); }

  // SET STATUS
  console.log('\n5. setStatus()');
  try {
    const a = await svc.setStatus(id, 'ACTIVE');
    ok('setStatus: ACTIVE',             a.status === 'ACTIVE');
    const d = await svc.setStatus(id, 'DEPRECATED');
    ok('setStatus: DEPRECATED',         d.status === 'DEPRECATED');
    try { await svc.setStatus(id, 'INVALID'); ok('setStatus: rejects invalid', false); }
    catch { ok('setStatus: rejects invalid', true); }
  } catch (e) { ok('setStatus: no crash', false, e.message); }

  // EVALUATE
  console.log('\n6. evaluateResult()');
  try {
    const fakeContent = {
      nodes: [
        { id: 'e1', label: 'SERVICE', name: 'iNeed', createdAt: '2024-01-01' },
        { id: 'e2', label: 'MANDATE', name: 'Resolution 71/1' },
        { id: 'e3', label: 'PROGRAMME', name: 'SDGs', createdAt: '2024-01-01' },
        { id: 'e4', label: 'ENTITY', name: 'UNDP', createdAt: '2024-01-01' },
        { id: 'e5', label: 'ENTITY', name: 'UN', createdAt: '2024-01-01' },
        { id: 'e6', label: 'ENTITY', name: 'GA', createdAt: '2024-01-01' },
      ],
      summary: { totalFound: 6 },
    };
    const ev = await svc.evaluateResult(fakeContent, id);
    ok('evaluate: returns passed/scores/violations', 'passed' in ev && 'scores' in ev && 'violations' in ev);
    ok('evaluate: entityCount score',  ev.scores.entityCount === 6);
    ok('evaluate: passed (6 >= 5)',    ev.passed === true);
    console.log('  Scores:', ev.scores, '| Violations:', ev.violations);
  } catch (e) { ok('evaluate: no crash', false, e.message); }

  // CLEANUP
  try {
    await require('../src/services/memgraph.service').runQuery(
      `MATCH (m:InvestigationMethodology {id: $id}) DETACH DELETE m`, { id }
    );
    console.log('\n  [cleanup] Deleted test node');
  } catch { }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('MTH-001 PASSED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
