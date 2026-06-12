#!/usr/bin/env node
/**
 * Unit Tests: EpistemicLayerService
 *
 * Tests layer nodes, precedence logic, relationships, and query helpers.
 * Requires Memgraph with seeded layers + document types.
 *
 * Run: node api/tests/unit/epistemic-layer.test.js
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

const { epistemicLayerService: svc, LAYER_ORDER, LAYER_ROLES } = require('../../src/services/knowledge/epistemic-layer.service');

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🔬 EpistemicLayerService Unit Tests\n');

  // Suite 1: Layers in Memgraph
  console.log('Suite 1: EpistemicLayer nodes');

  await test('getLayers() returns all 6 layers', async () => {
    const layers = await svc.getLayers();
    assert(layers.length === 6, `Expected 6 layers, got ${layers.length}`);
    const ids = layers.map(l => l.id);
    ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'].forEach(id => {
      assert(ids.includes(id), `Missing layer ${id}`);
    });
  });

  await test('layers are ordered by precedenceOrder ascending', async () => {
    const layers = await svc.getLayers();
    for (let i = 1; i < layers.length; i++) {
      assert(layers[i].precedenceOrder > layers[i - 1].precedenceOrder,
        `Layer order not ascending: ${layers[i - 1].id}(${layers[i - 1].precedenceOrder}) → ${layers[i].id}(${layers[i].precedenceOrder})`);
    }
  });

  await test('L0 is Constitutional with NORMATIVE_SOURCE role', async () => {
    const layers = await svc.getLayers();
    const l0 = layers.find(l => l.id === 'L0');
    assert(l0, 'L0 not found');
    assert(l0.name === 'Constitutional', `Expected Constitutional, got ${l0.name}`);
    assert(l0.knowledgeTriangleRole === 'NORMATIVE_SOURCE', `L0 role: ${l0.knowledgeTriangleRole}`);
    assert(l0.normativeWeightRange[0] >= 0.95, `L0 min weight should be >=0.95`);
  });

  await test('L4 is Empirical with EMPIRICAL_EVIDENCE role and zero weight', async () => {
    const layers = await svc.getLayers();
    const l4 = layers.find(l => l.id === 'L4');
    assert(l4, 'L4 not found');
    assert(l4.knowledgeTriangleRole === 'EMPIRICAL_EVIDENCE', `L4 role: ${l4.knowledgeTriangleRole}`);
    assert(l4.normativeWeightRange[0] === 0 && l4.normativeWeightRange[1] === 0, 'L4 weight range should be [0, 0]');
    assert(l4.edgeTypesProduced.includes('REVEALS_GAP_IN'), 'L4 should produce REVEALS_GAP_IN');
  });

  await test('L3 is OPERATIONAL_BRIDGE producing OPERATIONALIZES', async () => {
    const layers = await svc.getLayers();
    const l3 = layers.find(l => l.id === 'L3');
    assert(l3.knowledgeTriangleRole === 'OPERATIONAL_BRIDGE', `L3 role: ${l3.knowledgeTriangleRole}`);
    assert(l3.edgeTypesProduced.includes('OPERATIONALIZES'), 'L3 should produce OPERATIONALIZES');
  });

  // Suite 2: DocumentType → Layer relationships
  console.log('\nSuite 2: DocumentType → EpistemicLayer relationships');

  await test('getDocumentTypesByLayer(L0) returns UN_CHARTER and GA_RES', async () => {
    const types = await svc.getDocumentTypesByLayer('L0');
    const ids = types.map(t => t.id);
    assert(ids.includes('UN_CHARTER'), 'Missing UN_CHARTER in L0');
    assert(ids.includes('GA_RES'), 'Missing GA_RES in L0');
  });

  await test('getDocumentTypesByLayer(L4) returns 3 empirical types with weight=0', async () => {
    const types = await svc.getDocumentTypesByLayer('L4');
    assert(types.length >= 3, `Expected >= 3 L4 types, got ${types.length}`);
    const ids = types.map(t => t.id);
    assert(ids.includes('OIOS_REP'), 'Missing OIOS_REP');
    assert(ids.includes('JIU_REP'), 'Missing JIU_REP');
    assert(ids.includes('BOA_REP'), 'Missing BOA_REP');
    for (const t of types) {
      assert(t.normativeWeight === 0, `${t.id} should have weight=0, got ${t.normativeWeight}`);
    }
  });

  await test('getNormativeSources() returns only L0-L2 types', async () => {
    const sources = await svc.getNormativeSources();
    assert(sources.length >= 5, `Expected >= 5 normative sources, got ${sources.length}`);
    for (const s of sources) {
      assert(['L0', 'L1', 'L2'].includes(s.layer), `${s.id} has non-normative layer ${s.layer}`);
      assert(s.normativeWeight > 0, `Normative source ${s.id} should have weight > 0`);
    }
  });

  await test('getLayerSummary() shows 12 document types distributed across 6 layers', async () => {
    const summary = await svc.getLayerSummary();
    assert(summary.length === 6, `Expected 6 layers in summary, got ${summary.length}`);
    const total = summary.reduce((sum, l) => sum + (l.docTypeCount || 0), 0);
    assert(total === 12, `Expected 12 total document types, got ${total}`);
  });

  // Suite 3: Precedence logic (synchronous)
  console.log('\nSuite 3: Precedence logic');

  await test('getLayerPrecedence(L0, L1) is negative (L0 wins)', () => {
    assert(svc.getLayerPrecedence('L0', 'L1') < 0, 'L0 should have precedence over L1');
  });

  await test('getLayerPrecedence(L4, L1) is positive (L1 wins)', () => {
    assert(svc.getLayerPrecedence('L4', 'L1') > 0, 'L1 should have precedence over L4');
  });

  await test('getLayerPrecedence(L2, L2) is 0 (equal)', () => {
    assert(svc.getLayerPrecedence('L2', 'L2') === 0, 'Same layer should have zero difference');
  });

  await test('resolveConflict(L4, L1) returns L1 (L4 never wins normative conflict)', () => {
    assert(svc.resolveConflict('L4', 'L1') === 'L1', 'L4 should not win against L1');
    assert(svc.resolveConflict('L1', 'L4') === 'L1', 'L1 should win regardless of order');
  });

  await test('resolveConflict(L0, L5) returns L0', () => {
    assert(svc.resolveConflict('L0', 'L5') === 'L0', 'L0 should beat L5');
  });

  await test('isNormative() correctly identifies L0-L2 as normative', () => {
    assert(svc.isNormative('L0') === true, 'L0 should be normative');
    assert(svc.isNormative('L1') === true, 'L1 should be normative');
    assert(svc.isNormative('L2') === true, 'L2 should be normative');
    assert(svc.isNormative('L3') === false, 'L3 should not be normative');
    assert(svc.isNormative('L4') === false, 'L4 should not be normative');
    assert(svc.isNormative('L5') === false, 'L5 should not be normative');
  });

  // Suite 4: Edge type mapping
  console.log('\nSuite 4: Knowledge Triangle edge type mapping');

  await test('getEdgeTypeForLayer maps all layers to correct edge types', () => {
    assert(svc.getEdgeTypeForLayer('L0') === 'GOVERNS', 'L0 → GOVERNS');
    assert(svc.getEdgeTypeForLayer('L1') === 'GOVERNS', 'L1 → GOVERNS');
    assert(svc.getEdgeTypeForLayer('L2') === 'GOVERNS', 'L2 → GOVERNS');
    assert(svc.getEdgeTypeForLayer('L3') === 'OPERATIONALIZES', 'L3 → OPERATIONALIZES');
    assert(svc.getEdgeTypeForLayer('L4') === 'REVEALS_GAP_IN', 'L4 → REVEALS_GAP_IN');
    assert(svc.getEdgeTypeForLayer('L5') === 'INFORMS', 'L5 → INFORMS');
  });

  await test('LAYER_ORDER constants are correct', () => {
    assert(LAYER_ORDER.L0 === 0, 'L0 order=0');
    assert(LAYER_ORDER.L4 === 4, 'L4 order=4');
    assert(LAYER_ORDER.L5 === 5, 'L5 order=5');
  });

  await test('LAYER_ROLES constants are correct', () => {
    assert(LAYER_ROLES.L0 === 'NORMATIVE_SOURCE', 'L0 role');
    assert(LAYER_ROLES.L3 === 'OPERATIONAL_BRIDGE', 'L3 role');
    assert(LAYER_ROLES.L4 === 'EMPIRICAL_EVIDENCE', 'L4 role');
    assert(LAYER_ROLES.L5 === 'STRATEGIC_GUIDANCE', 'L5 role');
  });

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
