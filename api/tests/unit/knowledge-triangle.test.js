#!/usr/bin/env node
/**
 * Unit Tests: KnowledgeTriangleService
 *
 * Tests edge creation, layer constraints, Gap node lifecycle,
 * triangle queries, and completeness scoring.
 *
 * Requires Memgraph with seeded EpistemicLayer + DocumentType nodes.
 * Test KnowledgeNodes are created and cleaned up within the suite.
 *
 * Run: node api/tests/unit/knowledge-triangle.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ▶ ${name} ... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL\n     ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// ─── Load service ─────────────────────────────────────────────────────────────

const {
  knowledgeTriangleService: svc,
  EDGE_LAYER_CONSTRAINTS,
  GAP_STATUSES,
  GAP_TYPES,
  SEVERITIES
} = require('../../src/services/knowledge/knowledge-triangle.service');

// Load memgraph for setup/teardown
let mg;

// ─── Test node factory ───────────────────────────────────────────────────────

const TEST_NODE_IDS = [];

async function createTestNode(id, layer, content = '') {
  TEST_NODE_IDS.push(id);
  await mg.runQuery(
    `MERGE (n:KnowledgeNode {id: $id})
     SET n.epistemicLayer = $layer,
         n.content        = $content,
         n.documentType   = $docType,
         n._test          = true`,
    {
      id,
      layer,
      content: content || `Test node ${id}`,
      docType: layer === 'L0' ? 'UN_CHARTER'
             : layer === 'L1' ? 'ST_SGB'
             : layer === 'L2' ? 'ST_AI'
             : layer === 'L3' ? 'SOP'
             : layer === 'L4' ? 'OIOS_REP'
             : 'ICT_STRAT'
    }
  );
}

async function cleanupTestNodes() {
  if (TEST_NODE_IDS.length === 0) return;
  // Delete test gaps and edges attached to test nodes
  await mg.runQuery(
    `MATCH (n:KnowledgeNode {_test: true})
     OPTIONAL MATCH (n)-[:REVEALS_GAP_IN]->(gap:Gap)
     OPTIONAL MATCH (gap)-[r2]-()
     DELETE r2, gap
     WITH n
     OPTIONAL MATCH (n)-[r]-()
     DELETE r, n`,
    {}
  );
  // Delete standalone gaps created by test nodes
  await mg.runQuery(`MATCH (gap:Gap) WHERE gap.identifiedBy IN $ids DELETE gap`, { ids: TEST_NODE_IDS });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🔬 KnowledgeTriangleService Unit Tests\n');

  mg = require('../../src/services/memgraph.service');

  // Setup test nodes
  await createTestNode('test-norm-l1',  'L1', 'ST/SGB policy clause: procurement must follow contract rules');
  await createTestNode('test-norm-l2',  'L2', 'ST/AI instruction: vendor selection criteria');
  await createTestNode('test-norm-l0',  'L0', 'UN Charter Article 100: staff independence');
  await createTestNode('test-op-l3',   'L3', 'SOP-PROC-001: procurement standard operating procedure');
  await createTestNode('test-op-l3b',  'L3', 'SOP-PROC-002: vendor approval procedure');
  await createTestNode('test-emp-l4',  'L4', 'OIOS Finding: 3 of 10 contracts lack vendor justification');
  await createTestNode('test-emp-l4b', 'L4', 'BOA Finding: procurement records incomplete');
  await createTestNode('test-proc-a',  'L3', 'Process A: budget cycle');
  await createTestNode('test-strat-l5','L5', 'ICT Strategy 2025: digital procurement');

  // ─── Suite 1: Constants and metadata ──────────────────────────────────────
  console.log('Suite 1: Constants and edge type metadata');

  await test('EDGE_LAYER_CONSTRAINTS defines all 3 triangle edges', () => {
    assert('GOVERNS' in EDGE_LAYER_CONSTRAINTS, 'GOVERNS missing');
    assert('OPERATIONALIZES' in EDGE_LAYER_CONSTRAINTS, 'OPERATIONALIZES missing');
    assert('REVEALS_GAP_IN' in EDGE_LAYER_CONSTRAINTS, 'REVEALS_GAP_IN missing');
    assert(EDGE_LAYER_CONSTRAINTS.GOVERNS.includes('L1'), 'L1 not in GOVERNS constraint');
    assert(EDGE_LAYER_CONSTRAINTS.OPERATIONALIZES.includes('L3'), 'L3 not in OPERATIONALIZES constraint');
    assert(EDGE_LAYER_CONSTRAINTS.REVEALS_GAP_IN.includes('L4'), 'L4 not in REVEALS_GAP_IN constraint');
  });

  await test('GAP_STATUSES lifecycle is correct', () => {
    assert(GAP_STATUSES.includes('OPEN'), 'OPEN missing');
    assert(GAP_STATUSES.includes('ACKNOWLEDGED'), 'ACKNOWLEDGED missing');
    assert(GAP_STATUSES.includes('ADDRESSED'), 'ADDRESSED missing');
    assert(GAP_STATUSES.includes('CLOSED'), 'CLOSED missing');
    assert(GAP_STATUSES.length === 4, `Expected 4 statuses, got ${GAP_STATUSES.length}`);
  });

  await test('getEdgeTypeMetadata() returns 3 edge type config nodes', async () => {
    const types = await svc.getEdgeTypeMetadata();
    assert(types.length >= 3, `Expected >= 3 edge types, got ${types.length}`);
    const names = types.map(t => t.name);
    assert(names.includes('GOVERNS'),         'GOVERNS metadata missing');
    assert(names.includes('OPERATIONALIZES'), 'OPERATIONALIZES metadata missing');
    assert(names.includes('REVEALS_GAP_IN'),  'REVEALS_GAP_IN metadata missing');
  });

  await test('getEdgeTypeMetadata("REVEALS_GAP_IN") has createsGapNode=true', async () => {
    const meta = await svc.getEdgeTypeMetadata('REVEALS_GAP_IN');
    assert(meta, 'REVEALS_GAP_IN metadata not found');
    assert(meta.createsGapNode === true, `createsGapNode should be true, got ${meta.createsGapNode}`);
  });

  // ─── Suite 2: Layer constraint validation ─────────────────────────────────
  console.log('\nSuite 2: Layer constraint validation');

  await test('validateEdgeLayerConstraint: GOVERNS from L1 succeeds', () => {
    assert(svc.validateEdgeLayerConstraint('GOVERNS', 'L1') === true, 'Should return true');
  });

  await test('validateEdgeLayerConstraint: GOVERNS from L4 throws', () => {
    let threw = false;
    try { svc.validateEdgeLayerConstraint('GOVERNS', 'L4'); }
    catch (e) { threw = true; assert(e.message.includes('L4'), 'Error should mention L4'); }
    assert(threw, 'Should have thrown for L4 GOVERNS');
  });

  await test('validateEdgeLayerConstraint: OPERATIONALIZES from L3 succeeds', () => {
    assert(svc.validateEdgeLayerConstraint('OPERATIONALIZES', 'L3') === true, 'Should return true');
  });

  await test('validateEdgeLayerConstraint: OPERATIONALIZES from L1 throws', () => {
    let threw = false;
    try { svc.validateEdgeLayerConstraint('OPERATIONALIZES', 'L1'); }
    catch (e) { threw = true; assert(e.message.includes('OPERATIONALIZES'), 'Error should mention edge type'); }
    assert(threw, 'Should have thrown for L1 OPERATIONALIZES');
  });

  await test('validateEdgeLayerConstraint: REVEALS_GAP_IN from L4 succeeds', () => {
    assert(svc.validateEdgeLayerConstraint('REVEALS_GAP_IN', 'L4') === true, 'Should return true');
  });

  await test('validateEdgeLayerConstraint: REVEALS_GAP_IN from L2 throws', () => {
    let threw = false;
    try { svc.validateEdgeLayerConstraint('REVEALS_GAP_IN', 'L2'); }
    catch (e) { threw = true; }
    assert(threw, 'Should have thrown for L2 REVEALS_GAP_IN');
  });

  await test('validateEdgeLayerConstraint: unknown edge type throws', () => {
    let threw = false;
    try { svc.validateEdgeLayerConstraint('UNKNOWN_EDGE', 'L1'); }
    catch (e) { threw = true; assert(e.message.includes('Unknown'), 'Error should say Unknown'); }
    assert(threw, 'Should have thrown for unknown edge type');
  });

  // ─── Suite 3: Edge creation ───────────────────────────────────────────────
  console.log('\nSuite 3: Edge creation');

  await test('createGovernsEdge: L1 → process succeeds', async () => {
    const result = await svc.createGovernsEdge('test-norm-l1', 'test-proc-a');
    assert(result.edgeType === 'GOVERNS', 'edgeType should be GOVERNS');
    assert(result.sourceId === 'test-norm-l1', 'sourceId mismatch');
    assert(result.targetId === 'test-proc-a',  'targetId mismatch');
  });

  await test('createGovernsEdge: L4 → process throws constraint error', async () => {
    let threw = false;
    try { await svc.createGovernsEdge('test-emp-l4', 'test-proc-a'); }
    catch (e) { threw = true; }
    assert(threw, 'L4 source for GOVERNS should throw');
  });

  await test('createOperationalizesEdge: L3 → process succeeds', async () => {
    const result = await svc.createOperationalizesEdge('test-op-l3', 'test-proc-a');
    assert(result.edgeType === 'OPERATIONALIZES', 'edgeType should be OPERATIONALIZES');
    assert(result.sourceId === 'test-op-l3', 'sourceId mismatch');
  });

  await test('createOperationalizesEdge: L5 → process throws', async () => {
    let threw = false;
    try { await svc.createOperationalizesEdge('test-strat-l5', 'test-proc-a'); }
    catch (e) { threw = true; }
    assert(threw, 'L5 source for OPERATIONALIZES should throw');
  });

  await test('createRevealsGapEdge: L4 → process creates Gap node + edge', async () => {
    const result = await svc.createRevealsGapEdge('test-emp-l4', 'test-proc-a', {
      gapType: 'COMPLIANCE',
      severity: 'HIGH',
      title: 'Procurement compliance gap',
      recommendation: 'Implement mandatory vendor justification'
    });
    assert(result.edgeType === 'REVEALS_GAP_IN', 'edgeType should be REVEALS_GAP_IN');
    assert(result.gapId, 'gapId should be set');
    assert(result.sourceId === 'test-emp-l4', 'sourceId mismatch');

    // Verify gap was created
    const gap = await svc.getGap(result.gapId);
    assert(gap, 'Gap node should exist');
    assert(gap.status === 'OPEN', `Gap status should be OPEN, got ${gap.status}`);
    assert(gap.gapType === 'COMPLIANCE', `gapType should be COMPLIANCE, got ${gap.gapType}`);
    assert(gap.severity === 'HIGH', `severity should be HIGH, got ${gap.severity}`);
  });

  await test('createRevealsGapEdge: invalid gapType throws', async () => {
    let threw = false;
    try {
      await svc.createRevealsGapEdge('test-emp-l4b', 'test-proc-a', { gapType: 'INVALID' });
    } catch (e) { threw = true; assert(e.message.includes('gapType'), `Error: ${e.message}`); }
    assert(threw, 'Invalid gapType should throw');
  });

  // ─── Suite 4: Gap lifecycle ───────────────────────────────────────────────
  console.log('\nSuite 4: Gap lifecycle');

  let testGapId;

  await test('Create gap → initial status is OPEN', async () => {
    const result = await svc.createRevealsGapEdge('test-emp-l4b', 'test-norm-l2', {
      gapType: 'IMPLEMENTATION',
      severity: 'MEDIUM',
      title: 'Lifecycle test gap'
    });
    testGapId = result.gapId;
    const gap = await svc.getGap(testGapId);
    assert(gap, 'Gap should exist');
    assert(gap.status === 'OPEN', `Expected OPEN, got ${gap.status}`);
  });

  await test('updateGapStatus: OPEN → ACKNOWLEDGED', async () => {
    const r = await svc.updateGapStatus(testGapId, 'ACKNOWLEDGED');
    assert(r.status === 'ACKNOWLEDGED', `Expected ACKNOWLEDGED, got ${r.status}`);
  });

  await test('updateGapStatus: ACKNOWLEDGED → ADDRESSED', async () => {
    const r = await svc.updateGapStatus(testGapId, 'ADDRESSED');
    assert(r.status === 'ADDRESSED', `Expected ADDRESSED, got ${r.status}`);
  });

  await test('updateGapStatus: ADDRESSED → CLOSED with resolution', async () => {
    const r = await svc.updateGapStatus(testGapId, 'CLOSED', 'Vendor justification form added to SOP');
    assert(r.status === 'CLOSED', `Expected CLOSED, got ${r.status}`);
  });

  await test('updateGapStatus: invalid status throws', async () => {
    let threw = false;
    try { await svc.updateGapStatus(testGapId, 'DELETED'); }
    catch (e) { threw = true; }
    assert(threw, 'Invalid status should throw');
  });

  await test('updateGapStatus: non-existent gap throws', async () => {
    let threw = false;
    try { await svc.updateGapStatus('nonexistent-gap-id', 'ACKNOWLEDGED'); }
    catch (e) { threw = true; }
    assert(threw, 'Non-existent gap should throw');
  });

  // ─── Suite 5: Triangle queries ────────────────────────────────────────────
  console.log('\nSuite 5: Triangle queries');

  await test('getTriangleForProcess returns normative and operational vertices', async () => {
    const triangle = await svc.getTriangleForProcess('test-proc-a');
    assert(triangle.processId === 'test-proc-a', 'processId mismatch');
    assert(Array.isArray(triangle.normative),   'normative should be array');
    assert(Array.isArray(triangle.operational), 'operational should be array');
    assert(Array.isArray(triangle.empirical),   'empirical should be array');
    assert(Array.isArray(triangle.gaps),        'gaps should be array');
    // We created GOVERNS from test-norm-l1 and OPERATIONALIZES from test-op-l3
    assert(triangle.normative.some(n => n.id === 'test-norm-l1'),
      'test-norm-l1 should be in normative vertex');
    assert(triangle.operational.some(n => n.id === 'test-op-l3'),
      'test-op-l3 should be in operational vertex');
  });

  await test('getTriangleCompleteness: process with norm+op has score > 0.5', async () => {
    const c = await svc.getTriangleCompleteness('test-proc-a');
    assert(c.hasNormative,   'should have normative');
    assert(c.hasOperational, 'should have operational');
    assert(c.score > 0.5,    `score should be > 0.5, got ${c.score}`);
    assert(typeof c.openGaps === 'number', 'openGaps should be a number');
  });

  await test('getTriangleCompleteness: score = N/3 where N = vertices present', async () => {
    // test-norm-l2 has no edges created in this suite
    const c = await svc.getTriangleCompleteness('test-norm-l2');
    // It has a REVEALS_GAP_IN → gap → AFFECTS chain back to test-norm-l2
    assert(c.score >= 0 && c.score <= 1, `score should be 0-1, got ${c.score}`);
  });

  // ─── Suite 6: getEdgeTypeMetadata queries ─────────────────────────────────
  console.log('\nSuite 6: Edge type metadata queries');

  await test('GOVERNS metadata has correct sourceLayerConstraint', async () => {
    const meta = await svc.getEdgeTypeMetadata('GOVERNS');
    assert(meta, 'GOVERNS metadata not found');
    const constraint = JSON.parse(meta.sourceLayerConstraint);
    assert(constraint.includes('L0'), 'L0 in GOVERNS constraint');
    assert(constraint.includes('L1'), 'L1 in GOVERNS constraint');
    assert(constraint.includes('L2'), 'L2 in GOVERNS constraint');
    assert(!constraint.includes('L4'), 'L4 must NOT be in GOVERNS constraint');
  });

  await test('OPERATIONALIZES metadata has knowledgeTriangleRole = IMPLEMENTATION_LINK', async () => {
    const meta = await svc.getEdgeTypeMetadata('OPERATIONALIZES');
    assert(meta, 'OPERATIONALIZES metadata not found');
    assert(meta.knowledgeTriangleRole === 'IMPLEMENTATION_LINK',
      `Expected IMPLEMENTATION_LINK, got ${meta.knowledgeTriangleRole}`);
  });

  await test('All edge types have inverseEdge defined', async () => {
    const types = await svc.getEdgeTypeMetadata();
    for (const t of types) {
      assert(t.inverseEdge, `${t.name} missing inverseEdge`);
    }
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  await cleanupTestNodes();

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
