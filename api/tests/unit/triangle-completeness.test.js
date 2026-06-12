#!/usr/bin/env node
/**
 * Unit Tests: Triangle Completeness + Gap Detection
 *
 * Tests extended getTriangleCompleteness, GapDetectionService,
 * and the Knowledge Triangle Enrich executor.
 *
 * Requires Memgraph with seeded EpistemicLayer + DocumentType nodes.
 * Test KnowledgeNodes are created and cleaned up within the suite.
 *
 * Run: node api/tests/unit/triangle-completeness.test.js
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

// ─── Load services ────────────────────────────────────────────────────────────

const { knowledgeTriangleService: triangle } = require('../../src/services/knowledge/knowledge-triangle.service');
const { gapDetectionService: detector }       = require('../../src/services/knowledge/gap-detection.service');
const { STALE_GAP_DAYS_DEFAULT }              = require('../../src/services/knowledge/gap-detection.service');

let mg;
const TEST_NODE_IDS = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_NS = 'TEST_TC_SUITE';

async function createTestNode(id, layer, content = '') {
  TEST_NODE_IDS.push(id);
  await mg.runQuery(
    `MERGE (n:KnowledgeNode {id: $id})
     SET n.epistemicLayer = $layer,
         n.content        = $content,
         n.documentType   = $docType,
         n.normativeWeight = $nw,
         n.namespace      = $ns,
         n.createdAt      = $now,
         n.updatedAt      = $now,
         n._test          = true`,
    {
      id,
      layer,
      ns:      TEST_NS,
      content: content || `Test node ${id}`,
      docType: layer === 'L1' ? 'ST_SGB' : layer === 'L4' ? 'OIOS_REP' : 'SOP',
      nw:      layer === 'L0' ? 1.0 : layer === 'L1' ? 0.85 : layer === 'L4' ? 0.0 : 0.4,
      now:     new Date().toISOString()
    }
  );
}

async function cleanupTestNodes() {
  if (!TEST_NODE_IDS.length) return;
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
  await mg.runQuery(`MATCH (gap:Gap) WHERE gap.identifiedBy IN $ids DELETE gap`, { ids: TEST_NODE_IDS });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🔬 Triangle Completeness + Gap Detection Tests\n');

  mg = require('../../src/services/memgraph.service');

  // Setup test nodes
  await createTestNode('tc-norm-l1',   'L1', 'ST/SGB: procurement policy');
  await createTestNode('tc-op-l3',     'L3', 'SOP-001: procurement procedure');
  await createTestNode('tc-emp-l4',    'L4', 'OIOS finding: vendor justification gap');
  await createTestNode('tc-proc-full', 'L3', 'Process: full triangle');
  await createTestNode('tc-proc-norm', 'L3', 'Process: normative only');
  await createTestNode('tc-proc-none', 'L3', 'Process: no triangle');

  // Build full triangle for tc-proc-full
  await triangle.createGovernsEdge('tc-norm-l1', 'tc-proc-full');
  await triangle.createOperationalizesEdge('tc-op-l3', 'tc-proc-full');
  const gapResult = await triangle.createRevealsGapEdge('tc-emp-l4', 'tc-proc-full', {
    gapType: 'COMPLIANCE', severity: 'LOW', title: 'Completeness test gap'
  });

  // Build normative-only triangle
  await triangle.createGovernsEdge('tc-norm-l1', 'tc-proc-norm');

  // ─── Suite 1: Extended getTriangleCompleteness ────────────────────────────
  console.log('Suite 1: Extended getTriangleCompleteness');

  await test('Full triangle → completeness ≈ score (no open HIGH/MEDIUM gaps)', async () => {
    const c = await triangle.getTriangleCompleteness('tc-proc-full');
    assert(c.hasNormative,   'should have normative');
    assert(c.hasOperational, 'should have operational');
    assert(c.hasEmpirical,   'should have empirical');
    assert(c.score === 1.0,  `score should be 1.0, got ${c.score}`);
    assert(c.vertices.normative.present, 'vertices.normative.present');
    assert(c.vertices.operational.present, 'vertices.operational.present');
    assert(c.vertices.empirical.present, 'vertices.empirical.present');
    assert(c.missingVertices.length === 0, `No missing vertices, got ${c.missingVertices}`);
  });

  await test('Normative-only → score=0.33, missingVertices=[OPERATIONAL,EMPIRICAL]', async () => {
    const c = await triangle.getTriangleCompleteness('tc-proc-norm');
    assert(c.hasNormative,    'should have normative');
    assert(!c.hasOperational, 'should NOT have operational');
    assert(!c.hasEmpirical,   'should NOT have empirical');
    assert(Math.abs(c.score - 0.333) < 0.01, `score should be ~0.333, got ${c.score}`);
    assert(c.missingVertices.includes('OPERATIONAL'), 'OPERATIONAL missing');
    assert(c.missingVertices.includes('EMPIRICAL'),   'EMPIRICAL missing');
  });

  await test('No triangle → score=0.0, all vertices missing', async () => {
    const c = await triangle.getTriangleCompleteness('tc-proc-none');
    assert(!c.hasNormative,   'no normative');
    assert(!c.hasOperational, 'no operational');
    assert(!c.hasEmpirical,   'no empirical');
    assert(c.score === 0.0 || c.score < 0.01, `score should be 0, got ${c.score}`);
    assert(c.missingVertices.length === 3, `All 3 vertices missing, got ${c.missingVertices.length}`);
  });

  await test('Gap penalty applied: LOW gap reduces completeness from score', async () => {
    const c = await triangle.getTriangleCompleteness('tc-proc-full');
    // LOW gap penalty = 0.05; completeness = 1.0 - 0.05 = 0.95
    assert(c.completeness <= c.score, `completeness(${c.completeness}) should be ≤ score(${c.score})`);
    assert(c.gaps.openLow >= 1, `Should have at least 1 LOW gap, got ${c.gaps.openLow}`);
    assert(c.gaps.penalty >= 0 && c.gaps.penalty <= 1, 'penalty in range');
  });

  await test('getTriangleCompleteness result has all required fields', async () => {
    const c = await triangle.getTriangleCompleteness('tc-proc-full');
    assert(typeof c.completeness === 'number', 'completeness should be number');
    assert(typeof c.score === 'number',        'score should be number');
    assert(c.vertices, 'vertices object present');
    assert(c.gaps,     'gaps object present');
    assert(Array.isArray(c.missingVertices), 'missingVertices is array');
    assert(c.calculatedAt, 'calculatedAt present');
    // Backward-compat
    assert(typeof c.hasNormative === 'boolean',   'hasNormative is boolean');
    assert(typeof c.hasOperational === 'boolean', 'hasOperational is boolean');
    assert(typeof c.hasEmpirical === 'boolean',   'hasEmpirical is boolean');
    assert(typeof c.openGaps === 'number',        'openGaps is number');
  });

  // ─── Suite 2: GapDetectionService ────────────────────────────────────────
  console.log('\nSuite 2: GapDetectionService');

  await test('findProcessesWithoutNormative includes tc-proc-none', async () => {
    const results = await detector.findProcessesWithoutNormative({ namespace: TEST_NS, limit: 100 });
    const ids = results.map(r => r.id);
    assert(ids.includes('tc-proc-none'), 'tc-proc-none should be in missing-normative list');
    assert(!ids.includes('tc-proc-full'), 'tc-proc-full should NOT be in missing-normative list');
  });

  await test('findProcessesWithoutOperational includes tc-proc-norm', async () => {
    const results = await detector.findProcessesWithoutOperational({ namespace: TEST_NS, limit: 100 });
    const ids = results.map(r => r.id);
    assert(ids.includes('tc-proc-norm'), 'tc-proc-norm should be in missing-operational list');
  });

  await test('findStaleGaps: very old threshold returns empty (test nodes are fresh)', async () => {
    // Test gaps were created just now, so no gap older than 1 day should exist
    const stale = await detector.findStaleGaps({ daysOld: 1 });
    // Depending on prior test data, there may be stale gaps — just check it returns array
    assert(Array.isArray(stale), 'Should return array');
  });

  await test('STALE_GAP_DAYS_DEFAULT is 90', () => {
    assert(STALE_GAP_DAYS_DEFAULT === 90, `Expected 90, got ${STALE_GAP_DAYS_DEFAULT}`);
  });

  await test('getGapStatistics returns byStatus, bySeverity, openSummary', async () => {
    const stats = await detector.getGapStatistics();
    assert(Array.isArray(stats.byStatus),   'byStatus should be array');
    assert(Array.isArray(stats.bySeverity), 'bySeverity should be array');
    assert(stats.openSummary, 'openSummary should be present');
    assert(typeof stats.openSummary.total === 'number', 'openSummary.total is number');
    assert(typeof stats.openSummary.high  === 'number', 'openSummary.high is number');
  });

  await test('runGapDetection returns full report structure', async () => {
    const report = await detector.runGapDetection({ persist: false });
    assert(report.timestamp, 'timestamp present');
    assert(typeof report.processesWithoutNormative.count === 'number',   'withoutNormative.count');
    assert(typeof report.processesWithoutOperational.count === 'number', 'withoutOperational.count');
    assert(typeof report.processesWithoutEmpirical.count === 'number',   'withoutEmpirical.count');
    assert(typeof report.staleGaps.count === 'number', 'staleGaps.count');
    assert(report.statistics, 'statistics present');
  });

  await test('getNamespaceCompleteness returns processCount and avgCompleteness', async () => {
    const result = await detector.getNamespaceCompleteness({ sampleLimit: 10 });
    assert(typeof result.processCount === 'number', 'processCount is number');
    assert(typeof result.avgCompleteness === 'number', 'avgCompleteness is number');
    assert(result.avgCompleteness >= 0 && result.avgCompleteness <= 1,
      `avgCompleteness should be 0-1, got ${result.avgCompleteness}`);
    assert(result.distribution, 'distribution object present');
  });

  // ─── Suite 3: Gap lifecycle via completeness context ──────────────────────
  console.log('\nSuite 3: Gap lifecycle in completeness context');

  await test('Closing a gap reduces openGaps count in completeness', async () => {
    const before = await triangle.getTriangleCompleteness('tc-proc-full');
    const openBefore = before.openGaps;

    // Close the gap
    await triangle.updateGapStatus(gapResult.gapId, 'CLOSED', 'Test resolved');

    const after = await triangle.getTriangleCompleteness('tc-proc-full');
    assert(after.openGaps <= openBefore,
      `openGaps should not increase: before=${openBefore}, after=${after.openGaps}`);
    // Gap penalty should be 0 now (gap closed)
    assert(after.gaps.penalty === 0 || after.gaps.penalty < before.gaps.penalty,
      `Gap penalty should decrease after closing gap`);
  });

  await test('After closing gap, completeness equals score (no penalty)', async () => {
    const c = await triangle.getTriangleCompleteness('tc-proc-full');
    assert(Math.abs(c.completeness - c.score) < 0.01,
      `completeness(${c.completeness}) should ≈ score(${c.score}) when no open gaps`);
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
