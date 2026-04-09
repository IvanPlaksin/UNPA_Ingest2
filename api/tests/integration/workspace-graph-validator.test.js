/**
 * WorkSpace Graph Validator Tests (WS2-007)
 *
 * Run: node api/tests/integration/workspace-graph-validator.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    errors.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}
function assert(c, m) { if (!c) throw new Error(`Assertion failed: ${m}`); }
function assertEq(a, b, l) { if (a !== b) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertNotNull(v, l) { if (v === null || v === undefined) throw new Error(`${l}: expected non-null`); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  WorkSpace Graph Validator Tests (WS2-007)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, contra, validator, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    contra = require('../../src/services/workspace/contradiction.service');
    validator = require('../../src/services/workspace/graph-validator.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  // ─── 1. Pure helpers ───────────────────────────────────────────

  console.log('1. Pure helpers');

  await test('detectCycles finds simple cycle', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' }
    ];
    const cycles = validator.detectCycles(nodes, edges);
    assert(cycles.length >= 1, 'at least one cycle');
  });

  await test('detectCycles returns empty for DAG', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' }
    ];
    const cycles = validator.detectCycles(nodes, edges);
    assertEq(cycles.length, 0, 'no cycles');
  });

  await test('getRules returns 10 rules', () => {
    const rules = validator.getRules();
    assertEq(rules.length, 10, 'rule count');
  });

  await test('getRules filters by graphType', () => {
    const rules = validator.getRules({ graphType: 'STRUCTURAL' });
    assert(rules.some(r => r.id === 'STRUCTURAL_IS_DAG'), 'STRUCTURAL rule present');
    assert(!rules.some(r => r.id === 'EXECUTABLE_HAS_ENTRY_EXIT'), 'EXECUTABLE rule excluded');
  });

  // ─── 2. Persistence + validation ───────────────────────────────

  console.log('\n2. Validation scenario');

  const TEST_USER = 'test-validator-user';
  let workspace, sourceA, sourceB;
  let draftA, draftB, draftConflictA, draftConflictB, draftLowConf, draftEmpty;

  await test('create workspace + 2 sources', async () => {
    workspace = await ws.create({
      name: 'Validator Test WS',
      description: 'WS2-007',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    sourceA = await ws.addSource(workspace.id, {
      filename: 'src_a.pdf', mimeType: 'application/pdf', sourceType: 'FILE', sizeBytes: 100
    });
    sourceB = await ws.addSource(workspace.id, {
      filename: 'src_b.pdf', mimeType: 'application/pdf', sourceType: 'FILE', sizeBytes: 100
    });
  });

  await test('seed: connected good drafts + low confidence + empty + conflict pair', async () => {
    draftA = await drafts.create(workspace.id, {
      type: 'entity', name: 'Customer', description: 'Customer entity',
      content: { fields: ['id'] }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
    draftB = await drafts.create(workspace.id, {
      type: 'entity', name: 'Order', description: 'Order entity',
      content: { fields: ['id'] }, sourceId: sourceA.id, confidence: 0.85, extractedBy: TEST_USER
    });
    draftLowConf = await drafts.create(workspace.id, {
      type: 'entity', name: 'LowConfidence', description: 'low conf',
      content: { x: 1 }, sourceId: sourceA.id, confidence: 0.3, extractedBy: TEST_USER
    });
    draftEmpty = await drafts.create(workspace.id, {
      type: 'entity', name: 'EmptyOne', description: '',
      content: {}, sourceId: sourceA.id, confidence: 0.8, extractedBy: TEST_USER
    });
    draftConflictA = await drafts.create(workspace.id, {
      type: 'business_rule', name: 'Approval Policy', description: 'A',
      content: { approval_required: true }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
    draftConflictB = await drafts.create(workspace.id, {
      type: 'business_rule', name: 'Approval Policy', description: 'B',
      content: { approval_required: false }, sourceId: sourceB.id, confidence: 0.85, extractedBy: TEST_USER
    });
  });

  await test('connect Customer-Order edge', async () => {
    await drafts.createEdge(workspace.id, {
      sourceId: draftA.id, targetId: draftB.id, edgeType: 'RELATES_TO', confidence: 0.9
    });
  });

  await test('detect contradictions (sets up BLOCKING)', async () => {
    const result = await contra.detectContradictions(workspace.id);
    assert(result.created.length >= 1, 'contradiction created');
  });

  // ─── 3. validateGraph ──────────────────────────────────────────

  console.log('\n3. validateGraph');

  let result;

  await test('validateGraph returns full ValidationResult', async () => {
    result = await validator.validateGraph(workspace.id);
    assertNotNull(result.summary, 'summary');
    assertNotNull(result.results, 'results');
    assertNotNull(result.metadata, 'metadata');
    assert(Array.isArray(result.results), 'results array');
  });

  await test('REQUIRED_PROPERTIES passes (all have name+type)', () => {
    const r = result.results.find(x => x.ruleId === 'REQUIRED_PROPERTIES');
    assertEq(r.status, 'PASS', 'PASS');
  });

  await test('NO_ORPHAN_NODES warns (we have orphans)', () => {
    const r = result.results.find(x => x.ruleId === 'NO_ORPHAN_NODES');
    assertEq(r.status, 'WARN', 'WARN');
    assert(r.affectedNodes.length >= 3, 'multiple orphans');
  });

  await test('MIN_CONFIDENCE warns (LowConfidence draft)', () => {
    const r = result.results.find(x => x.ruleId === 'MIN_CONFIDENCE');
    assertEq(r.status, 'WARN', 'WARN');
    assert(r.affectedNodes.some(n => n.name === 'LowConfidence'), 'LowConfidence flagged');
  });

  await test('NO_EMPTY_CONTENT warns (EmptyOne)', () => {
    const r = result.results.find(x => x.ruleId === 'NO_EMPTY_CONTENT');
    assertEq(r.status, 'WARN', 'WARN');
    assert(r.affectedNodes.some(n => n.name === 'EmptyOne'), 'EmptyOne flagged');
  });

  await test('NO_BLOCKING_CONTRADICTIONS FAILS (BLOCKING contradiction unresolved)', () => {
    const r = result.results.find(x => x.ruleId === 'NO_BLOCKING_CONTRADICTIONS');
    assertEq(r.status, 'FAIL', 'FAIL');
    assertEq(r.severity, 'BLOCKING', 'BLOCKING severity');
    assert(r.affectedNodes.length >= 1, 'has affected');
  });

  await test('summary and aggregations correct', () => {
    assert(result.summary.warnings >= 3, 'at least 3 warnings');
    assert(result.summary.blocking >= 1, 'at least 1 blocking');
    assertEq(result.canPromote, false, 'cannot promote due to BLOCKING');
    assertEq(result.valid, false, 'invalid');
    assert(result.blockers.length >= 1, 'has blockers');
  });

  // ─── 4. canPromote ─────────────────────────────────────────────

  console.log('\n4. canPromote');

  await test('canPromote returns allowed=false when blockers exist', async () => {
    const r = await validator.canPromote(workspace.id);
    assertEq(r.allowed, false, 'not allowed');
    assert(r.blockers.length >= 1, 'has blockers');
  });

  await test('after resolving contradiction, canPromote returns true', async () => {
    const open = await contra.getContradictions(workspace.id, { status: 'OPEN' });
    for (const c of open.items) {
      await contra.resolveContradiction(c.id, { strategy: 'USE_FIRST', rationale: 'test resolve' });
    }
    const r = await validator.canPromote(workspace.id);
    assertEq(r.allowed, true, 'now allowed');
    assertEq(r.blockers.length, 0, 'no blockers');
  });

  // ─── 5. validateNode ───────────────────────────────────────────

  console.log('\n5. validateNode');

  await test('validateNode returns valid for good draft', async () => {
    const r = await validator.validateNode(workspace.id, draftA.id);
    assertEq(r.valid, true, 'valid');
    assertEq(r.issues.length, 0, 'no issues');
  });

  await test('validateNode flags low confidence', async () => {
    const r = await validator.validateNode(workspace.id, draftLowConf.id);
    assertEq(r.valid, false, 'invalid');
    assert(r.issues.some(i => i.includes('confidence')), 'confidence issue');
  });

  await test('validateNode flags empty content', async () => {
    const r = await validator.validateNode(workspace.id, draftEmpty.id);
    assertEq(r.valid, false, 'invalid');
    assert(r.issues.some(i => i.includes('empty')), 'empty issue');
  });

  // ─── 6. Filtered runs ──────────────────────────────────────────

  console.log('\n6. Filtered runs');

  await test('validateGraph with specific rules subset', async () => {
    const r = await validator.validateGraph(workspace.id, {
      rules: ['REQUIRED_PROPERTIES', 'NO_ORPHAN_NODES']
    });
    assertEq(r.results.length, 2, 'two rules');
    assert(r.results.every(x => ['REQUIRED_PROPERTIES', 'NO_ORPHAN_NODES'].includes(x.ruleId)), 'correct rules');
  });

  await test('validateGraph with graphType filters appliesTo rules', async () => {
    const r = await validator.validateGraph(workspace.id, { graphType: 'STRUCTURAL' });
    // Should run STRUCTURAL_IS_DAG, skip EXECUTABLE_HAS_ENTRY_EXIT and CONSTRAINT_HAS_TARGET
    assert(r.results.some(x => x.ruleId === 'STRUCTURAL_IS_DAG'), 'STRUCTURAL rule ran');
    assert(!r.results.some(x => x.ruleId === 'EXECUTABLE_HAS_ENTRY_EXIT'), 'EXECUTABLE excluded');
    assert(!r.results.some(x => x.ruleId === 'CONSTRAINT_HAS_TARGET'), 'CONSTRAINT excluded');
  });

  // ─── 7. Cleanup ────────────────────────────────────────────────

  console.log('\n7. Cleanup');

  await test('clean up test data', async () => {
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:CONTAINS_DRAFT]->(d)
       OPTIONAL MATCH (d)-[:HAS_CONTRADICTION]->(c)
       OPTIONAL MATCH (w)-[:HAS_SOURCE]->(s)
       DETACH DELETE w, d, c, s`,
      { id: workspace.id }
    );
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Errors:');
    for (const e of errors) console.log(`  - ${e.name}: ${e.error}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
