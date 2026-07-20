'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('../src/services/memgraph.service'); // init Memgraph

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else       { console.log(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

async function main() {
  console.log('=== MTH-002: Investigation AOPEG plugin test ===\n');

  // Load plugin
  const { investigationPlugin } = require('../src/core/aopeg/plugins/investigation');

  // 1. Plugin metadata
  console.log('1. Plugin metadata');
  const meta = investigationPlugin.getMetadata();
  ok('name = investigation',  meta.name === 'investigation');
  ok('domain = investigation', meta.domain === 'investigation');
  ok('11 executors',          investigationPlugin.executors.length === 11, `count=${investigationPlugin.executors.length}`);

  // 2. Executor types
  console.log('\n2. Executor types');
  const expectedTypes = [
    'investigation.locate', 'investigation.expand', 'investigation.connect',
    'investigation.profile', 'investigation.structure', 'investigation.impact',
    'investigation.resolve', 'investigation.matrix', 'investigation.timeline',
    'investigation.text', 'investigation.synthesize',
  ];
  const actualTypes = investigationPlugin.executors.map(e => e.type).sort();
  for (const t of expectedTypes) {
    ok(`has ${t}`, actualTypes.includes(t));
  }

  // 3. Executor parameterSchema shapes
  console.log('\n3. parameterSchema');
  const locate = investigationPlugin.executors.find(e => e.type === 'investigation.locate');
  ok('locate has parameterSchema', locate?.parameterSchema?.type === 'object');
  ok('locate has query property',  !!locate?.parameterSchema?.properties?.query);
  ok('locate query required',      locate?.parameterSchema?.required?.includes('query'));

  const matrix = investigationPlugin.executors.find(e => e.type === 'investigation.matrix');
  ok('matrix has rowEntityIds required', matrix?.parameterSchema?.required?.includes('rowEntityIds'));

  // 4. Execute LOCATE via AOPEG executor
  console.log('\n4. LOCATE executor smoke test');
  try {
    const result = await locate.execute({ query: 'United Nations', limit: 3 }, {});
    ok('execute: success', result.success === true);
    ok('execute: output.content is CGE', Array.isArray(result.output?.content?.nodes));
    ok('execute: primitiveType in metadata', result.metadata?.primitiveType === 'LOCATE');
  } catch (e) { ok('LOCATE execute: no crash', false, e.message); }

  // 5. Execute TEXT via AOPEG executor (no services needed)
  console.log('\n5. TEXT executor smoke test');
  const textExec = investigationPlugin.executors.find(e => e.type === 'investigation.text');
  try {
    const result = await textExec.execute({ title: 'MTH-002 Test Note', body: 'Hello from the investigation plugin.', evidencedBy: [] }, {});
    ok('TEXT execute: success',         result.success === true);
    ok('TEXT execute: summary.title',   result.output?.content?.summary?.title === 'MTH-002 Test Note');
    ok('TEXT execute: kind = text',     result.output?.content?.projection?.kind === 'text');
  } catch (e) { ok('TEXT execute: no crash', false, e.message); }

  // 6. Execute SYNTHESIZE (no anthropicClient → fallback)
  console.log('\n6. SYNTHESIZE executor smoke test (no-evidence path)');
  const synthExec = investigationPlugin.executors.find(e => e.type === 'investigation.synthesize');
  try {
    const result = await synthExec.execute({ focus: 'test', format: 'summary' }, { variables: {} });
    ok('SYNTHESIZE execute: success',       result.success === true);
    ok('SYNTHESIZE execute: CGE envelope',  Array.isArray(result.output?.content?.nodes));
    ok('SYNTHESIZE execute: kind = text',   result.output?.content?.projection?.kind === 'text');
  } catch (e) { ok('SYNTHESIZE execute: no crash', false, e.message); }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail === 0) console.log('MTH-002 PASSED');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
