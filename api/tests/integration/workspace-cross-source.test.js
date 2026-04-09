/**
 * WorkSpace Cross-Source Analysis Tests (WS2-006)
 *
 * Run: node api/tests/integration/workspace-cross-source.test.js
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
  console.log('  WorkSpace Cross-Source Tests (WS2-006)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, cs, contra, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    cs = require('../../src/services/workspace/cross-source.service');
    contra = require('../../src/services/workspace/contradiction.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  const TEST_USER = 'test-cross-source-user';
  let workspace, sourceA, sourceB, sourceOrphan;
  let employeeA, employeeB, departmentA, leavePolicyA, leavePolicyB, isolatedX;

  console.log('1. Setup');

  await test('create workspace + 3 sources (1 orphan)', async () => {
    workspace = await ws.create({
      name: 'CrossSource Test WS',
      description: 'WS2-006',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    sourceA = await ws.addSource(workspace.id, {
      filename: 'HR_Policy_2024.pdf',
      mimeType: 'application/pdf',
      sourceType: 'FILE',
      sizeBytes: 1024
    });
    sourceB = await ws.addSource(workspace.id, {
      filename: 'HR_Update_2025.docx',
      mimeType: 'application/vnd.openxmlformats',
      sourceType: 'FILE',
      sizeBytes: 2048
    });
    sourceOrphan = await ws.addSource(workspace.id, {
      filename: 'OrphanDoc.pdf',
      mimeType: 'application/pdf',
      sourceType: 'FILE',
      sizeBytes: 512
    });
  });

  await test('seed drafts: shared Employee (A & B), shared LeavePolicy (A & B with conflict), unique Department (A), isolated X', async () => {
    employeeA = await drafts.create(workspace.id, {
      type: 'entity', name: 'Employee', description: 'Employee from policy',
      content: { fields: ['id', 'name'] }, sourceId: sourceA.id,
      confidence: 0.9, extractedBy: TEST_USER
    });
    employeeB = await drafts.create(workspace.id, {
      type: 'entity', name: 'Employee', description: 'Employee from update',
      content: { fields: ['id', 'name', 'email'] }, sourceId: sourceB.id,
      confidence: 0.85, extractedBy: TEST_USER
    });
    departmentA = await drafts.create(workspace.id, {
      type: 'entity', name: 'Department', description: 'Department',
      content: { name: 'IT' }, sourceId: sourceA.id,
      confidence: 0.95, extractedBy: TEST_USER
    });
    leavePolicyA = await drafts.create(workspace.id, {
      type: 'business_rule', name: 'Leave Policy', description: 'Original',
      content: { maxLeaveDays: 25, approval_required: true }, sourceId: sourceA.id,
      confidence: 0.9, extractedBy: TEST_USER
    });
    leavePolicyB = await drafts.create(workspace.id, {
      type: 'business_rule', name: 'Leave Policy', description: 'Updated',
      content: { maxLeaveDays: 20, approval_required: false }, sourceId: sourceB.id,
      confidence: 0.85, extractedBy: TEST_USER
    });
    isolatedX = await drafts.create(workspace.id, {
      type: 'entity', name: 'Lonely', description: 'No connections',
      content: { foo: 'bar' }, sourceId: sourceA.id,
      confidence: 0.7, extractedBy: TEST_USER
    });
  });

  await test('create one edge between Employee A and Department A', async () => {
    await drafts.createEdge(workspace.id, {
      sourceId: employeeA.id,
      targetId: departmentA.id,
      edgeType: 'BELONGS_TO',
      confidence: 0.9
    });
  });

  await test('detect contradictions to seed test data', async () => {
    const result = await contra.detectContradictions(workspace.id);
    assert(result.created.length >= 1, 'at least 1 contradiction created');
  });

  // ─── Coverage ─────────────────────────────────────────────────

  console.log('\n2. analyzeSourceCoverage');

  await test('coverage returns per-source stats', async () => {
    const result = await cs.analyzeSourceCoverage(workspace.id);
    assertEq(result.sources.length, 3, '3 sources');
    assertEq(result.summary.totalSources, 3, 'total');
    assertEq(result.summary.totalEntities, 6, '6 entities');
    assertEq(result.summary.orphanSources, 1, '1 orphan');
  });

  await test('coverage marks sourceA as having entities', async () => {
    const result = await cs.analyzeSourceCoverage(workspace.id);
    const a = result.sources.find(s => s.sourceId === sourceA.id);
    assert(a.entityCount >= 4, `sourceA has 4+ entities (got ${a.entityCount})`);
    assert(a.sharedEntityCount >= 2, `sourceA shares ≥ 2 (got ${a.sharedEntityCount})`);
  });

  await test('coverage detects orphan source (no entities)', async () => {
    const result = await cs.analyzeSourceCoverage(workspace.id);
    const orphan = result.sources.find(s => s.sourceId === sourceOrphan.id);
    assertEq(orphan.entityCount, 0, 'no entities');
    assertEq(orphan.coverage.extracted, 0, 'extracted=0');
  });

  // ─── Shared entities ──────────────────────────────────────────

  console.log('\n3. findSharedEntities');

  await test('shared entities returns Employee + Leave Policy', async () => {
    const result = await cs.findSharedEntities(workspace.id);
    assert(result.entities.length >= 2, `at least 2 shared (got ${result.entities.length})`);
    const employee = result.entities.find(e => e.name === 'Employee');
    assertNotNull(employee, 'Employee shared');
    assertEq(employee.sourceCount, 2, 'in 2 sources');
    assert(employee.sources.length === 2, 'two source refs');
  });

  await test('shared Leave Policy has hasContradiction=true', async () => {
    const result = await cs.findSharedEntities(workspace.id);
    const lp = result.entities.find(e => e.name === 'Leave Policy');
    assertNotNull(lp, 'Leave Policy shared');
    assertEq(lp.hasContradiction, true, 'flagged');
  });

  await test('Department is NOT in shared (only one source)', async () => {
    const result = await cs.findSharedEntities(workspace.id);
    assert(!result.entities.some(e => e.name === 'Department'), 'Department not shared');
  });

  // ─── Source relationships ─────────────────────────────────────

  console.log('\n4. inferSourceRelationships');

  await test('inferSourceRelationships detects CONTRADICTS pair', async () => {
    const result = await cs.inferSourceRelationships(workspace.id);
    const contradicts = result.relationships.find(r => r.type === 'CONTRADICTS');
    assertNotNull(contradicts, 'CONTRADICTS detected');
    const ids = [contradicts.sourceId, contradicts.targetId].sort();
    const expected = [sourceA.id, sourceB.id].sort();
    assertEq(ids[0], expected[0], 'pair[0]');
    assertEq(ids[1], expected[1], 'pair[1]');
  });

  await test('inferSourceRelationships does NOT include orphan source', async () => {
    const result = await cs.inferSourceRelationships(workspace.id);
    const involvesOrphan = result.relationships.some(r =>
      r.sourceId === sourceOrphan.id || r.targetId === sourceOrphan.id
    );
    assertEq(involvesOrphan, false, 'orphan absent');
  });

  // ─── Suggestions ──────────────────────────────────────────────

  console.log('\n5. suggestMissingLinks');

  await test('suggestions detect isolated entity (Lonely)', async () => {
    const result = await cs.suggestMissingLinks(workspace.id);
    const lonely = result.isolatedEntities.find(e => e.name === 'Lonely');
    assertNotNull(lonely, 'Lonely flagged');
  });

  await test('suggestions detect orphan source', async () => {
    const result = await cs.suggestMissingLinks(workspace.id);
    const orphan = result.orphanSources.find(s => s.id === sourceOrphan.id);
    assertNotNull(orphan, 'orphan flagged');
  });

  await test('suggestions find potentialLinks (Employee A ↔ B)', async () => {
    const result = await cs.suggestMissingLinks(workspace.id);
    assert(result.potentialLinks.length >= 1, 'at least 1 link');
    const empLink = result.potentialLinks.find(l =>
      (l.entity1.id === employeeA.id && l.entity2.id === employeeB.id) ||
      (l.entity1.id === employeeB.id && l.entity2.id === employeeA.id)
    );
    assertNotNull(empLink, 'Employee A↔B link');
    assert(empLink.similarity >= 0.85, 'high similarity');
  });

  // ─── Full report ──────────────────────────────────────────────

  console.log('\n6. generateAnalysisReport');

  await test('report combines everything + health score', async () => {
    const report = await cs.generateAnalysisReport(workspace.id);
    assertNotNull(report.workspace, 'workspace');
    assertNotNull(report.sources, 'sources');
    assertNotNull(report.entities, 'entities');
    assertNotNull(report.relationships, 'relationships');
    assertNotNull(report.contradictions, 'contradictions');
    assertNotNull(report.suggestions, 'suggestions');
    assertNotNull(report.health, 'health');
    assert(typeof report.health.score === 'number', 'score is number');
    assert(report.health.score >= 0 && report.health.score <= 100, 'score in [0..100]');
  });

  await test('health score deducts for orphan source + blocking contradictions', async () => {
    const report = await cs.generateAnalysisReport(workspace.id);
    // We have: 1/3 = 33% orphans (>20%) → -20
    // BLOCKING contradiction → -15
    // Possibly isolated entity ratio
    assert(report.health.score < 100, `expected < 100 (got ${report.health.score})`);
    assert(report.health.issues.length >= 1, 'has issues');
    assert(report.health.recommendations.length >= 1, 'has recommendations');
  });

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
