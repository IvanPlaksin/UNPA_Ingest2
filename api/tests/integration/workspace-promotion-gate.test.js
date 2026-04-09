/**
 * WorkSpace Promotion Validation Gate Tests (WS3-003)
 *
 * Validates the integration between graph-validator.canPromote() and the
 * promotion flow. The frontend wizard surfaces the same validation result
 * via /workspaces/:id/validate, so testing canPromote() behaviour ensures
 * the wizard's gate logic is consistent with the backend's enforcement.
 *
 * Run: node api/tests/integration/workspace-promotion-gate.test.js
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
  console.log('  Promotion Validation Gate Tests (WS3-003)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, drafts, contradictions, validator, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    drafts = require('../../src/services/workspace/draft.service');
    contradictions = require('../../src/services/workspace/contradiction.service');
    validator = require('../../src/services/workspace/graph-validator.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  const TEST_USER = 'test-promotion-gate-user';
  let workspace, sourceA, sourceB;

  console.log('1. Setup');

  await test('create empty workspace', async () => {
    workspace = await ws.create({
      name: 'Promotion Gate Test WS',
      description: 'WS3-003',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    assertNotNull(workspace.id, 'workspace.id');
  });

  console.log('\n2. Empty workspace — gate allows');

  await test('canPromote allows for empty workspace', async () => {
    const result = await validator.canPromote(workspace.id);
    assertEq(result.allowed, true, 'allowed');
    assertEq(result.blockers.length, 0, 'no blockers');
  });

  console.log('\n3. Add conflicting drafts → BLOCKING contradiction');

  await test('add 2 sources + 2 conflicting drafts', async () => {
    sourceA = await ws.addSource(workspace.id, {
      filename: 'a.pdf', mimeType: 'application/pdf', sourceType: 'FILE', sizeBytes: 100
    });
    sourceB = await ws.addSource(workspace.id, {
      filename: 'b.pdf', mimeType: 'application/pdf', sourceType: 'FILE', sizeBytes: 100
    });
    await drafts.create(workspace.id, {
      type: 'business_rule', name: 'Approval Policy', description: 'A',
      content: { approval_required: true }, sourceId: sourceA.id, confidence: 0.9, extractedBy: TEST_USER
    });
    await drafts.create(workspace.id, {
      type: 'business_rule', name: 'Approval Policy', description: 'B',
      content: { approval_required: false }, sourceId: sourceB.id, confidence: 0.85, extractedBy: TEST_USER
    });
  });

  await test('detectContradictions creates BLOCKING', async () => {
    const result = await contradictions.detectContradictions(workspace.id);
    assert(result.created.length >= 1, 'at least 1 contradiction');
  });

  await test('canPromote blocks when BLOCKING contradictions exist', async () => {
    const result = await validator.canPromote(workspace.id);
    assertEq(result.allowed, false, 'NOT allowed');
    assert(result.blockers.length >= 1, 'has blockers');
    const blocker = result.blockers[0];
    assertEq(blocker.severity, 'BLOCKING', 'BLOCKING severity');
    assertEq(blocker.status, 'FAIL', 'FAIL status');
  });

  console.log('\n4. Validation step result shape (matches frontend ValidationStep contract)');

  let fullResult = null;

  await test('validateGraph returns full structure', async () => {
    fullResult = await validator.validateGraph(workspace.id);
    assertNotNull(fullResult.summary, 'summary');
    assertNotNull(fullResult.results, 'results');
    assertNotNull(fullResult.blockers, 'blockers');
    assertNotNull(fullResult.errors, 'errors');
    assertNotNull(fullResult.warnings, 'warnings');
    assertNotNull(fullResult.metadata, 'metadata');
    assertEq(typeof fullResult.canPromote, 'boolean', 'canPromote is bool');
    assertEq(typeof fullResult.valid, 'boolean', 'valid is bool');
  });

  await test('summary fields match expected counts', () => {
    assert(fullResult.summary.total === fullResult.results.length, 'total=results.length');
    assert(fullResult.summary.blocking >= 1, 'has blocking');
    assertEq(fullResult.canPromote, false, 'canPromote=false');
  });

  await test('each result has ruleId/ruleName/severity/status/message/affectedNodes', () => {
    for (const r of fullResult.results) {
      assertNotNull(r.ruleId, `${r.ruleId}.ruleId`);
      assertNotNull(r.ruleName, `${r.ruleId}.ruleName`);
      assertNotNull(r.severity, `${r.ruleId}.severity`);
      assertNotNull(r.status, `${r.ruleId}.status`);
      assertNotNull(r.message, `${r.ruleId}.message`);
      assert(Array.isArray(r.affectedNodes), `${r.ruleId}.affectedNodes is array`);
    }
  });

  console.log('\n5. Resolve contradiction → gate opens');

  await test('after resolve, canPromote returns true', async () => {
    const open = await contradictions.getContradictions(workspace.id, { status: 'OPEN' });
    for (const c of open.items) {
      await contradictions.resolveContradiction(c.id, {
        strategy: 'USE_FIRST',
        rationale: 'test resolve'
      });
    }
    const result = await validator.canPromote(workspace.id);
    assertEq(result.allowed, true, 'now allowed');
  });

  console.log('\n6. Cleanup');

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
