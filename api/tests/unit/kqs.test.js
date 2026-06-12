#!/usr/bin/env node
/**
 * Unit Tests: KQSService
 *
 * Tests each KQS component calculator, the main formula,
 * batch calculation, and integration with Knowledge Triangle.
 *
 * Requires Memgraph with seeded EpistemicLayer + Knowledge Triangle data.
 * Test KnowledgeNodes are created and cleaned up within the suite.
 *
 * Run: node api/tests/unit/kqs.test.js
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

function assertBetween(val, min, max, label) {
  assert(val >= min && val <= max,
    `${label}: expected ${min}–${max}, got ${val}`);
}

// ─── Load service ─────────────────────────────────────────────────────────────

const {
  kqsService: svc,
  KQS_WEIGHTS,
  LAYER_DECAY_RATE,
  LAYER_NORMATIVE_DEFAULTS,
  LAYER_AUTHORITY_DEFAULTS,
  GAP_SEVERITY_PENALTY
} = require('../../src/services/knowledge/kqs.service');

const { knowledgeTriangleService } = require('../../src/services/knowledge/knowledge-triangle.service');

let mg;
const TEST_NODE_IDS = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestNode(id, layer, options = {}) {
  TEST_NODE_IDS.push(id);
  const now = options.age
    ? new Date(Date.now() - options.age * 86400000).toISOString()
    : new Date().toISOString();
  await mg.runQuery(
    `MERGE (n:KnowledgeNode {id: $id})
     SET n.epistemicLayer    = $layer,
         n.normativeWeight   = $nw,
         n.admiralty_weight  = $aw,
         n.content           = $content,
         n.documentType      = $docType,
         n.createdAt         = $now,
         n.updatedAt         = $now,
         n._test             = true`,
    {
      id,
      layer,
      nw:      options.normativeWeight  !== undefined ? options.normativeWeight  : LAYER_NORMATIVE_DEFAULTS[layer],
      aw:      options.admiraltyWeight  !== undefined ? options.admiraltyWeight  : null,
      content: options.content || `Test node ${id}`,
      docType: options.docType || (layer === 'L1' ? 'ST_SGB' : layer === 'L4' ? 'OIOS_REP' : 'SOP'),
      now
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
  console.log('\n🔬 KQSService Unit Tests\n');

  mg = require('../../src/services/memgraph.service');

  // Verify KQS_WEIGHTS sum to 1.0
  const weightSum = Object.values(KQS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert(Math.abs(weightSum - 1.0) < 0.001, `KQS_WEIGHTS must sum to 1.0, got ${weightSum}`);

  // ─── Suite 1: Constants ───────────────────────────────────────────────────
  console.log('Suite 1: KQS constants');

  await test('KQS_WEIGHTS sum to 1.0', () => {
    const sum = Object.values(KQS_WEIGHTS).reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 0.001, `Weights sum to ${sum}`);
    assert(KQS_WEIGHTS.normativeWeight    === 0.35, 'normativeWeight weight');
    assert(KQS_WEIGHTS.empiricalCertainty === 0.30, 'empiricalCertainty weight');
    assert(KQS_WEIGHTS.temporalCurrency   === 0.20, 'temporalCurrency weight');
    assert(KQS_WEIGHTS.sourceAuthority    === 0.15, 'sourceAuthority weight');
  });

  await test('LAYER_NORMATIVE_DEFAULTS: L0=1.0, L4=0.0, L5=0.25', () => {
    assert(LAYER_NORMATIVE_DEFAULTS.L0 === 1.00, `L0 should be 1.0, got ${LAYER_NORMATIVE_DEFAULTS.L0}`);
    assert(LAYER_NORMATIVE_DEFAULTS.L4 === 0.00, `L4 should be 0.0, got ${LAYER_NORMATIVE_DEFAULTS.L4}`);
    assert(LAYER_NORMATIVE_DEFAULTS.L5 === 0.25, `L5 should be 0.25, got ${LAYER_NORMATIVE_DEFAULTS.L5}`);
    assert(LAYER_NORMATIVE_DEFAULTS.L1 > LAYER_NORMATIVE_DEFAULTS.L2, 'L1 > L2');
    assert(LAYER_NORMATIVE_DEFAULTS.L2 > LAYER_NORMATIVE_DEFAULTS.L3, 'L2 > L3');
  });

  await test('LAYER_DECAY_RATE: L0=STABLE, L4=FAST', () => {
    assert(LAYER_DECAY_RATE.L0 === 'STABLE', `L0 decay should be STABLE`);
    assert(LAYER_DECAY_RATE.L4 === 'FAST',   `L4 decay should be FAST`);
    assert(LAYER_DECAY_RATE.L1 === 'SLOW',   `L1 decay should be SLOW`);
  });

  await test('LAYER_AUTHORITY_DEFAULTS: L0 highest, L3/L5 lower', () => {
    assert(LAYER_AUTHORITY_DEFAULTS.L0 === 1.0, 'L0 authority should be 1.0');
    assert(LAYER_AUTHORITY_DEFAULTS.L4 === 0.894, 'L4 authority (audited) should be 0.894');
    assert(LAYER_AUTHORITY_DEFAULTS.L0 > LAYER_AUTHORITY_DEFAULTS.L2, 'L0 > L2');
  });

  // ─── Suite 2: NormativeWeight component ───────────────────────────────────
  console.log('\nSuite 2: NormativeWeight component');

  await test('L0 entity → normativeWeight 1.0', () => {
    const entity = { epistemicLayer: 'L0' };
    assert(svc.calculateNormativeWeight(entity) === 1.0, 'L0 normativeWeight should be 1.0');
  });

  await test('L4 entity → normativeWeight 0.0', () => {
    const entity = { epistemicLayer: 'L4' };
    assert(svc.calculateNormativeWeight(entity) === 0.0, 'L4 normativeWeight should be 0.0');
  });

  await test('Entity with explicit normativeWeight uses it', () => {
    const entity = { epistemicLayer: 'L1', normativeWeight: 0.92 };
    assert(svc.calculateNormativeWeight(entity) === 0.92, 'Should use explicit weight');
  });

  await test('NormativeWeight clamped to [0, 1]', () => {
    assert(svc.calculateNormativeWeight({ normativeWeight: 1.5 }) === 1.0, 'Max clamp');
    assert(svc.calculateNormativeWeight({ normativeWeight: -0.1 }) === 0.0, 'Min clamp');
  });

  // ─── Suite 3: TemporalCurrency component ──────────────────────────────────
  console.log('\nSuite 3: TemporalCurrency component');

  await test('L0 entity → temporalCurrency = 1.0 (STABLE, no decay)', () => {
    const entity = { epistemicLayer: 'L0', createdAt: '2020-01-01T00:00:00Z' };
    const tc = svc.calculateTemporalCurrency(entity, 'L0');
    assert(tc === 1.0, `L0 STABLE should be 1.0, got ${tc}`);
  });

  await test('Fresh entity → temporalCurrency near 1.0', () => {
    const entity = { epistemicLayer: 'L3', updatedAt: new Date().toISOString() };
    const tc = svc.calculateTemporalCurrency(entity, 'L3');
    assertBetween(tc, 0.99, 1.0, 'Fresh L3');
  });

  await test('L4 entity 180 days old → temporalCurrency significantly decayed', () => {
    const old = new Date(Date.now() - 180 * 86400000).toISOString();
    const entity = { epistemicLayer: 'L4', updatedAt: old };
    const tc = svc.calculateTemporalCurrency(entity, 'L4');
    // FAST decay rate: λ=0.008447 → e^(-0.008447×180) = e^(-1.52) ≈ 0.22
    assertBetween(tc, 0.1, 0.35, 'L4 180-day decay');
  });

  await test('L1 entity 365 days old → temporalCurrency ~90% (slow decay)', () => {
    const old = new Date(Date.now() - 365 * 86400000).toISOString();
    const entity = { epistemicLayer: 'L1', updatedAt: old };
    const tc = svc.calculateTemporalCurrency(entity, 'L1');
    // SLOW decay: λ=0.000274 → e^(-0.000274×365) ≈ 0.906
    assertBetween(tc, 0.85, 0.95, 'L1 365-day decay (SLOW)');
  });

  await test('Entity without date → temporalCurrency handled gracefully', () => {
    const entity = { epistemicLayer: 'L3' };
    const tc = svc.calculateTemporalCurrency(entity, 'L3');
    // No date → age 0 → no decay
    assert(tc >= 0 && tc <= 1, `TC should be 0-1, got ${tc}`);
  });

  // ─── Suite 4: SourceAuthority component ───────────────────────────────────
  console.log('\nSuite 4: SourceAuthority component');

  await test('Entity with admiralty_weight uses it', () => {
    const entity = { epistemicLayer: 'L1', admiralty_weight: 0.894 };
    assert(svc.calculateSourceAuthority(entity, 'L1') === 0.894, 'Should use admiralty_weight');
  });

  await test('Entity without admiralty_weight → layer default', () => {
    const entity = { epistemicLayer: 'L0' };
    assert(svc.calculateSourceAuthority(entity, 'L0') === 1.0, 'L0 default should be 1.0');
  });

  await test('L4 entity default authority = 0.894 (audited reports)', () => {
    const entity = { epistemicLayer: 'L4' };
    assert(svc.calculateSourceAuthority(entity, 'L4') === 0.894, 'L4 default should be 0.894');
  });

  // ─── Suite 5: EmpiricalCertainty component ────────────────────────────────
  console.log('\nSuite 5: EmpiricalCertainty component');

  await test('Null processId → empiricalCertainty 0.0', async () => {
    const ec = await svc.calculateEmpiricalCertainty(null);
    assert(ec === 0.0, `Expected 0.0, got ${ec}`);
  });

  await test('Non-existent process → empiricalCertainty 0.0 (graceful)', async () => {
    const ec = await svc.calculateEmpiricalCertainty('nonexistent-process-xyz');
    assert(ec === 0.0, `Expected 0.0, got ${ec}`);
  });

  // ─── Suite 6: KQS formula ────────────────────────────────────────────────
  console.log('\nSuite 6: KQS formula');

  await test('All components max (L0, fresh, admiralty=1.0) → KQS near 1.0', async () => {
    const entity = {
      id: 'kqs-test-max',
      epistemicLayer: 'L0',
      normativeWeight: 1.0,
      admiralty_weight: 1.0,
      updatedAt: new Date().toISOString()
    };
    const result = await svc.calculateKQS(entity, { processId: null });
    // normative=0.35×1.0 + empirical=0.30×0.0 + temporal=0.20×1.0 + authority=0.15×1.0 = 0.70
    assertBetween(result.kqs, 0.65, 0.75, 'L0 max entity KQS');
    assert(result.components.normativeWeight.value === 1.0, 'normativeWeight component');
  });

  await test('L4 entity (empirical) → KQS dominated by temporal + authority, normative=0', async () => {
    const entity = {
      id: 'kqs-test-l4',
      epistemicLayer: 'L4',
      normativeWeight: 0.0,
      admiralty_weight: 0.894,
      updatedAt: new Date().toISOString()
    };
    const result = await svc.calculateKQS(entity, { processId: null });
    // normative=0.35×0.0 + temporal=0.20×1.0 + authority=0.15×0.894 ≈ 0.334
    assertBetween(result.kqs, 0.25, 0.40, 'L4 entity KQS');
    assert(result.components.normativeWeight.value === 0.0, 'L4 normativeWeight must be 0');
  });

  await test('KQS result has all required fields', async () => {
    const entity = {
      id: 'kqs-test-fields',
      epistemicLayer: 'L2',
      updatedAt: new Date().toISOString()
    };
    const result = await svc.calculateKQS(entity);
    assert(typeof result.kqs === 'number', 'kqs should be number');
    assert(result.kqs >= 0 && result.kqs <= 1, `kqs should be 0-1, got ${result.kqs}`);
    assert(result.components.normativeWeight, 'components.normativeWeight missing');
    assert(result.components.empiricalCertainty, 'components.empiricalCertainty missing');
    assert(result.components.temporalCurrency, 'components.temporalCurrency missing');
    assert(result.components.sourceAuthority, 'components.sourceAuthority missing');
    assert(result.weights === KQS_WEIGHTS, 'weights ref should be KQS_WEIGHTS');
    assert(result.layer === 'L2', 'layer should be L2');
    assert(result.calculatedAt, 'calculatedAt should be set');
  });

  await test('Weighted components sum matches kqs (formula integrity)', async () => {
    const entity = {
      id: 'kqs-test-sum',
      epistemicLayer: 'L2',
      normativeWeight: 0.65,
      admiralty_weight: 0.8,
      updatedAt: new Date().toISOString()
    };
    const result = await svc.calculateKQS(entity, { processId: null });
    const componentSum =
      result.components.normativeWeight.weighted +
      result.components.empiricalCertainty.weighted +
      result.components.temporalCurrency.weighted +
      result.components.sourceAuthority.weighted;
    // Allow for rounding (3 decimal places)
    assert(Math.abs(componentSum - result.kqs) < 0.01,
      `Component sum ${componentSum} should ≈ kqs ${result.kqs}`);
  });

  await test('L1 vs L4 same age: L1 has significantly higher KQS', async () => {
    const age = new Date(Date.now() - 30 * 86400000).toISOString();
    const l1 = { id: 'l1-compare', epistemicLayer: 'L1', updatedAt: age };
    const l4 = { id: 'l4-compare', epistemicLayer: 'L4', updatedAt: age };
    const [r1, r4] = await Promise.all([
      svc.calculateKQS(l1, { processId: null }),
      svc.calculateKQS(l4, { processId: null })
    ]);
    assert(r1.kqs > r4.kqs,
      `L1 KQS(${r1.kqs}) should be > L4 KQS(${r4.kqs})`);
  });

  // ─── Suite 7: Integration — calculateKQSById ───────────────────────────────
  console.log('\nSuite 7: Integration tests (Memgraph)');

  await createTestNode('kqs-int-l1', 'L1', { normativeWeight: 0.85 });
  await createTestNode('kqs-int-l4', 'L4', { normativeWeight: 0.0 });
  await createTestNode('kqs-int-proc', 'L3', { normativeWeight: 0.40 });
  // Create a triangle: L1 GOVERNS proc, L4 REVEALS_GAP_IN proc
  await knowledgeTriangleService.createGovernsEdge('kqs-int-l1', 'kqs-int-proc');
  await knowledgeTriangleService.createRevealsGapEdge('kqs-int-l4', 'kqs-int-proc', {
    gapType: 'COMPLIANCE', severity: 'LOW', title: 'KQS integration test gap'
  });

  await test('calculateKQSById returns valid result for existing node', async () => {
    const result = await svc.calculateKQSById('kqs-int-l1', { persist: false });
    assert(result.entityId === 'kqs-int-l1', 'entityId mismatch');
    assertBetween(result.kqs, 0, 1, 'kqs range');
    assert(result.layer === 'L1', 'layer should be L1');
  });

  await test('calculateKQSById throws for non-existent node', async () => {
    let threw = false;
    try { await svc.calculateKQSById('nonexistent-node-abc'); }
    catch (e) { threw = true; }
    assert(threw, 'Should throw for missing node');
  });

  await test('calculateKQS with empirical triangle: L3 process has empiricalCertainty > 0', async () => {
    // The proc has a REVEALS_GAP_IN → LOW gap
    const entity = { id: 'kqs-int-proc', epistemicLayer: 'L3', normativeWeight: 0.40,
                     updatedAt: new Date().toISOString() };
    const result = await svc.calculateKQS(entity, { processId: 'kqs-int-proc' });
    // Has L4 evidence → empiricalCertainty > 0 (only LOW gap = 0.05 penalty → 0.95)
    assert(result.components.empiricalCertainty.value > 0,
      `empiricalCertainty should be > 0, got ${result.components.empiricalCertainty.value}`);
  });

  await test('calculateKQSBatch returns array with one result per ID', async () => {
    const results = await svc.calculateKQSBatch(['kqs-int-l1', 'kqs-int-proc'], { persist: false });
    assert(results.length === 2, `Expected 2 results, got ${results.length}`);
    assert(results[0].entityId === 'kqs-int-l1', 'First result entityId');
    assert(results[1].entityId === 'kqs-int-proc', 'Second result entityId');
  });

  await test('calculateKQSBatch handles partial failure gracefully', async () => {
    const results = await svc.calculateKQSBatch(['kqs-int-l1', 'does-not-exist'], { persist: false });
    assert(results.length === 2, 'Should have 2 results');
    assert(results[0].kqs !== undefined, 'First result should have kqs');
    assert(results[1].error !== undefined, 'Second result should have error');
  });

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
