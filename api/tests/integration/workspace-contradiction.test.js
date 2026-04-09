/**
 * WorkSpace Contradiction Detection Tests (WS2-005)
 *
 * Validates:
 *   - Pure helpers (Levenshtein, classify, severity)
 *   - Detection groups by name similarity + different sources
 *   - Property conflicts → ContradictionNode created
 *   - Idempotent: re-running detection skips dupes
 *   - resolveContradiction transitions OPEN → RESOLVED
 *   - reopenContradiction reverses
 *   - getContradictions filters
 *   - getContradictionStats aggregates
 *
 * Run: node api/tests/integration/workspace-contradiction.test.js
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
  console.log('  WorkSpace Contradiction Tests (WS2-005)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, sources, cs, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    sources = require('../../src/services/workspace/source.service');
    cs = require('../../src/services/workspace/contradiction.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  // ─── 1. Pure helpers ───────────────────────────────────────────

  console.log('1. Pure helpers');

  await test('levenshtein equal strings = 0', () => {
    assertEq(cs.levenshtein('foo', 'foo'), 0, 'distance');
  });

  await test('levenshtein single substitution = 1', () => {
    assertEq(cs.levenshtein('foo', 'fop'), 1, 'distance');
  });

  await test('nameSimilarity identical = 1', () => {
    assertEq(cs.nameSimilarity('Customer', 'Customer'), 1, 'similarity');
  });

  await test('nameSimilarity case-insensitive', () => {
    assertEq(cs.nameSimilarity('Customer', 'CUSTOMER'), 1, 'similarity');
  });

  await test('nameSimilarity close strings > 0.75', () => {
    const sim = cs.nameSimilarity('Customer', 'Custmer');
    assert(sim > 0.75, `expected > 0.75, got ${sim}`);
  });

  await test('classifyConflict TEMPORAL on date field', () => {
    assertEq(cs.classifyConflict('createdDate', ['2024-01-01', '2025-01-01']), 'TEMPORAL', 'classified');
  });

  await test('classifyConflict LOGICAL on boolean opposites', () => {
    assertEq(cs.classifyConflict('approved', [true, false]), 'LOGICAL', 'classified');
  });

  await test('classifyConflict CARDINALITY on array vs scalar', () => {
    assertEq(cs.classifyConflict('roles', ['admin', ['admin', 'user']]), 'CARDINALITY', 'classified');
  });

  await test('classifyConflict FACTUAL fallback', () => {
    assertEq(cs.classifyConflict('maxDays', [25, 20]), 'FACTUAL', 'classified');
  });

  await test('determineSeverity BLOCKING for approval field', () => {
    assertEq(cs.determineSeverity('approval_required', 'FACTUAL'), 'BLOCKING', 'severity');
  });

  await test('determineSeverity WARNING for max field', () => {
    assertEq(cs.determineSeverity('maxLeaveDays', 'FACTUAL'), 'WARNING', 'severity');
  });

  await test('determineSeverity BLOCKING for LOGICAL type', () => {
    assertEq(cs.determineSeverity('flag', 'LOGICAL'), 'BLOCKING', 'severity');
  });

  // ─── 2. Persistence + Detection ────────────────────────────────

  console.log('\n2. Detection scenario');

  const TEST_USER = 'test-contradiction-user';
  let workspace = null;
  let sourceA = null;
  let sourceB = null;
  let draftA = null;
  let draftB = null;
  let draftC = null;

  await test('create workspace + two sources', async () => {
    workspace = await ws.create({
      name: 'Contradiction Test WS',
      description: 'WS2-005',
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
    assertNotNull(sourceA.id, 'sourceA.id');
    assertNotNull(sourceB.id, 'sourceB.id');
  });

  await test('create two drafts about same concept from different sources (CONFLICT)', async () => {
    draftA = await drafts.create(workspace.id, {
      type: 'business_rule',
      name: 'Annual Leave Policy',
      description: 'Max leave days per year',
      content: { maxLeaveDays: 25, approval_required: true },
      sourceId: sourceA.id,
      confidence: 0.9,
      extractedBy: TEST_USER
    });
    draftB = await drafts.create(workspace.id, {
      type: 'business_rule',
      name: 'Annual Leave Policy',  // same name
      description: 'Updated max leave days',
      content: { maxLeaveDays: 20, approval_required: false },
      sourceId: sourceB.id,
      confidence: 0.85,
      extractedBy: TEST_USER
    });
    assertNotNull(draftA.id, 'draftA.id');
    assertNotNull(draftB.id, 'draftB.id');
  });

  await test('create unrelated draft (no conflict)', async () => {
    draftC = await drafts.create(workspace.id, {
      type: 'entity',
      name: 'Department',
      description: 'A department',
      content: { name: 'Engineering' },
      sourceId: sourceA.id,
      confidence: 0.95,
      extractedBy: TEST_USER
    });
  });

  let firstRun = null;

  await test('detectContradictions creates contradictions for conflicting drafts', async () => {
    firstRun = await cs.detectContradictions(workspace.id);
    assert(firstRun.created.length >= 2, `expected ≥2 contradictions (got ${firstRun.created.length})`);
    // At least: maxLeaveDays + approval_required
    const fields = firstRun.created.map(c => c.field).sort();
    assert(fields.includes('maxLeaveDays'), 'maxLeaveDays detected');
    assert(fields.includes('approval_required'), 'approval_required detected');
  });

  await test('contradictions classify approval_required as LOGICAL/BLOCKING', async () => {
    const approval = firstRun.created.find(c => c.field === 'approval_required');
    assertEq(approval.type, 'LOGICAL', 'type');
    assertEq(approval.severity, 'BLOCKING', 'severity');
  });

  await test('contradictions classify maxLeaveDays as FACTUAL/WARNING (max keyword)', async () => {
    const maxd = firstRun.created.find(c => c.field === 'maxLeaveDays');
    assertEq(maxd.type, 'FACTUAL', 'type');
    assertEq(maxd.severity, 'WARNING', 'severity');
  });

  await test('contradictions reference both draft entityIds', async () => {
    const c = firstRun.created[0];
    assert(Array.isArray(c.entityIds), 'array');
    assertEq(c.entityIds.length, 2, 'two ids');
    assert(c.entityIds.includes(draftA.id) && c.entityIds.includes(draftB.id), 'contains both');
  });

  await test('detectContradictions is idempotent (no duplicates)', async () => {
    const second = await cs.detectContradictions(workspace.id);
    assertEq(second.created.length, 0, 'nothing new');
    assert(second.skipped >= 2, `at least 2 skipped (got ${second.skipped})`);
  });

  // ─── 3. CRUD ───────────────────────────────────────────────────

  console.log('\n3. Read + filter + stats');

  await test('getContradictions returns OPEN by default', async () => {
    const result = await cs.getContradictions(workspace.id, { status: 'OPEN' });
    assert(result.items.length >= 2, 'at least 2 OPEN');
  });

  await test('getContradictions filter by severity', async () => {
    const result = await cs.getContradictions(workspace.id, { severity: 'BLOCKING' });
    assert(result.items.length >= 1, 'at least 1 BLOCKING');
    assert(result.items.every(c => c.severity === 'BLOCKING'), 'all BLOCKING');
  });

  await test('getContradictionStats aggregates correctly', async () => {
    const stats = await cs.getContradictionStats(workspace.id);
    assert(stats.total >= 2, 'total ≥ 2');
    assert(stats.byStatus.OPEN >= 2, 'OPEN ≥ 2');
    assert(stats.bySeverity.BLOCKING >= 1, 'BLOCKING ≥ 1');
    assert(stats.bySeverity.WARNING >= 1, 'WARNING ≥ 1');
  });

  // ─── 4. Resolve + Reopen ───────────────────────────────────────

  console.log('\n4. Resolve / reopen');

  let resolveTarget = null;

  await test('resolveContradiction USE_FIRST', async () => {
    resolveTarget = firstRun.created.find(c => c.field === 'maxLeaveDays');
    const resolved = await cs.resolveContradiction(resolveTarget.id, {
      strategy: 'USE_FIRST',
      resolvedValue: 25,
      rationale: 'Newer policy supersedes',
      resolvedBy: TEST_USER
    });
    assertEq(resolved.status, 'RESOLVED', 'status');
    assertNotNull(resolved.resolution, 'resolution payload');
    assertEq(resolved.resolution.strategy, 'USE_FIRST', 'strategy');
    assertEq(resolved.resolution.resolvedValue, 25, 'resolvedValue');
  });

  await test('resolveContradiction rejects invalid strategy', async () => {
    let threw = false;
    try {
      await cs.resolveContradiction(resolveTarget.id, { strategy: 'WHATEVER' });
    } catch (e) {
      threw = e.message.includes('Invalid strategy');
    }
    assert(threw, 'should reject');
  });

  await test('reopenContradiction transitions back to OPEN', async () => {
    const reopened = await cs.reopenContradiction(resolveTarget.id);
    assertEq(reopened.status, 'OPEN', 'status');
    assert(!reopened.resolution, 'resolution cleared');
  });

  // ─── 5. Cleanup ────────────────────────────────────────────────

  console.log('\n5. Cleanup');

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
