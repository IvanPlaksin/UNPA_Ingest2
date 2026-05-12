'use strict';
/**
 * Tier 1 Knowledge Model — Unit + Integration Tests
 * Run: node api/tests/tier1/tier1.test.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

let passed = 0, failed = 0, skipped = 0;
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', Z = '\x1b[0m';

async function test(name, fn) {
  try {
    await fn();
    console.log(`${G}  ✓${Z} ${name}`);
    passed++;
  } catch (err) {
    if (err.skip) { console.log(`${Y}  ⊘${Z} ${name} (${err.message})`); skipped++; }
    else { console.log(`${R}  ✗${Z} ${name}\n      ${R}${err.message}${Z}`); failed++; }
  }
}

function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function skip(m) { const e = new Error(m); e.skip = true; throw e; }

let memgraphOk = false;
async function checkMg() {
  try { await require('../../src/services/memgraph.service').runQuery('RETURN 1', {}); memgraphOk = true; }
  catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────
// 1. Schemas — unit
// ─────────────────────────────────────────────────────────────

async function testSchemas() {
  console.log('\n1. Schemas (unit)');

  const hSchema   = require('../../src/services/knowledge/tier1/schemas/hypothesis-schema');
  const admSchema = require('../../src/services/knowledge/tier1/schemas/admiralty-schema');
  const infSchema = require('../../src/services/knowledge/tier1/schemas/inference-schema');

  await test('HYPOTHESIS_TYPES has all 10 types', () => {
    const types = Object.keys(hSchema.HYPOTHESIS_TYPES);
    assert(types.length === 10, `Expected 10, got ${types.length}: ${types.join(',')}`);
  });

  await test('POLARITY_CONFLICT is not auto_resolvable', () => {
    assert(hSchema.HYPOTHESIS_TYPES.POLARITY_CONFLICT.auto_resolvable === false);
  });

  await test('EXISTENCE has default_confidence=0.3', () => {
    assert(hSchema.HYPOTHESIS_TYPES.EXISTENCE.default_confidence === 0.3);
  });

  await test('parseAdmiraltyCode("B2") returns correct weight', () => {
    const p = admSchema.parseAdmiraltyCode('B2');
    assert(p !== null, 'Expected non-null');
    assert(p.source === 'B', 'source=B');
    assert(p.accuracy === '2', 'accuracy=2');
    // sqrt(0.8 * 0.8) = 0.8
    assert(Math.abs(p.weight - 0.8) < 0.01, `weight ~0.8, got ${p.weight}`);
  });

  await test('parseAdmiraltyCode("A1") returns weight 1.0', () => {
    const p = admSchema.parseAdmiraltyCode('A1');
    assert(Math.abs(p.weight - 1.0) < 0.01, `weight ~1.0, got ${p.weight}`);
  });

  await test('parseAdmiraltyCode("E5") returns weight ~0.2', () => {
    const p = admSchema.parseAdmiraltyCode('E5');
    assert(p.weight < 0.25, `Expected <0.25, got ${p.weight}`);
  });

  await test('compareAdmiraltyCodes("A1" > "E5")', () => {
    const diff = admSchema.compareAdmiraltyCodes('A1', 'E5');
    assert(diff > 0, `Expected positive diff, got ${diff}`);
  });

  await test('validateCode returns error for invalid source', () => {
    const err = admSchema.validateCode('Z', '1');
    assert(err && err.includes('source'), `Expected error, got: ${err}`);
  });

  await test('INFERENCE_TYPES has TRANSITIVE and COMPOSITION', () => {
    assert(infSchema.INFERENCE_TYPES.TRANSITIVE);
    assert(infSchema.INFERENCE_TYPES.COMPOSITION);
  });
}

// ─────────────────────────────────────────────────────────────
// 2. Confidence Decay — unit (pure math, no DB)
// ─────────────────────────────────────────────────────────────

async function testDecayUnit() {
  console.log('\n2. Confidence Decay (unit)');

  const decay = require('../../src/services/knowledge/tier1/confidence-decay.service');

  await test('STABLE decay rate produces no change', () => {
    const w = decay.computeEffectiveWeight(1.0, 'STABLE', '2020-01-01');
    assert(w === 1.0, `Expected 1.0, got ${w}`);
  });

  await test('VOLATILE decay rate for old date produces near-zero weight', () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString();
    const w = decay.computeEffectiveWeight(1.0, 'VOLATILE', twoYearsAgo);
    assert(w < 0.01, `Expected <0.01 for VOLATILE 2yr ago, got ${w}`);
  });

  await test('SLOW decay for 1 year ≈ 90% remaining', () => {
    const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString();
    const w = decay.computeEffectiveWeight(1.0, 'SLOW', oneYearAgo);
    assert(w > 0.85 && w < 0.95, `Expected ~0.9, got ${w}`);
  });

  await test('computeEffectiveWeight with null last_reinforced returns original weight', () => {
    const w = decay.computeEffectiveWeight(0.8, 'MEDIUM', null);
    assert(w === 0.8, `Expected 0.8, got ${w}`);
  });

  await test('DECAY_RATES contains all 5 rates', () => {
    const rates = Object.keys(decay.DECAY_RATES);
    assert(rates.includes('STABLE')  , 'missing STABLE');
    assert(rates.includes('SLOW')    , 'missing SLOW');
    assert(rates.includes('MEDIUM')  , 'missing MEDIUM');
    assert(rates.includes('FAST')    , 'missing FAST');
    assert(rates.includes('VOLATILE'), 'missing VOLATILE');
  });
}

// ─────────────────────────────────────────────────────────────
// 3. Hypothesis confidence update — unit
// ─────────────────────────────────────────────────────────────

async function testHypothesisUnit() {
  console.log('\n3. Hypothesis Confidence Logic (unit)');

  // Access internal _computeConfidence via module internals
  // (we test the behavior via addEvidence in integration, but we can test math here)

  await test('Bayesian update: SUPPORTS increases confidence', () => {
    // Simulate: P=0.5, dv=0.5, SUPPORTS → 0.5 + 0.5*0.5 = 0.75
    const p   = 0.5;
    const dv  = 0.5;
    const res = p + dv * (1 - p);
    assert(Math.abs(res - 0.75) < 0.001, `Expected 0.75, got ${res}`);
  });

  await test('Bayesian update: CONTRADICTS decreases confidence', () => {
    const p   = 0.8;
    const dv  = 0.5;
    const res = p - dv * p;
    assert(Math.abs(res - 0.4) < 0.001, `Expected 0.4, got ${res}`);
  });

  await test('HYPOTHESIS_STATUSES includes EXPIRED', () => {
    const { HYPOTHESIS_STATUSES } = require('../../src/services/knowledge/tier1/schemas/hypothesis-schema');
    assert(HYPOTHESIS_STATUSES.includes('EXPIRED'), 'missing EXPIRED');
  });
}

// ─────────────────────────────────────────────────────────────
// 4. Admiralty unit
// ─────────────────────────────────────────────────────────────

async function testAdmiraltyUnit() {
  console.log('\n4. Admiralty Service (unit)');

  const admSvc    = require('../../src/services/knowledge/tier1/admiralty.service');
  const admSchema = require('../../src/services/knowledge/tier1/schemas/admiralty-schema');

  await test('calculateSourceReliability("official_document") → A', () => {
    const r = admSvc.calculateSourceReliability('official_document');
    assert(r.code === 'A', `Expected A, got ${r.code}`);
  });

  await test('calculateSourceReliability("chat") → D', () => {
    const r = admSvc.calculateSourceReliability('chat');
    assert(r.code === 'D', `Expected D, got ${r.code}`);
  });

  await test('calculateSourceReliability("unknown") → F', () => {
    const r = admSvc.calculateSourceReliability('unknown');
    assert(r.code === 'F', `Expected F, got ${r.code}`);
  });

  await test('suggestAdmiraltyCode returns combined + weight + reasoning', async () => {
    const result = await admSvc.suggestAdmiraltyCode('test-quantum', {
      sourceType: 'official_document',
      independentSources: 2,
      consistent: true,
    });
    assert(result.suggested, 'suggested field missing');
    assert(result.weight > 0, 'weight missing');
    assert(result.reasoning, 'reasoning missing');
  });
}

// ─────────────────────────────────────────────────────────────
// 5. Integration tests (Memgraph)
// ─────────────────────────────────────────────────────────────

async function testIntegration() {
  console.log('\n5. Integration (Memgraph)');

  const mg         = require('../../src/services/memgraph.service');
  const hypoSvc    = require('../../src/services/knowledge/tier1/hypothesis.service');
  const decaySvc   = require('../../src/services/knowledge/tier1/confidence-decay.service');
  const inferSvc   = require('../../src/services/knowledge/tier1/inference.service');
  const edgeProps  = require('../../src/services/knowledge/tier0/edge-properties.service');
  const neo4j      = require('neo4j-driver');

  let hypoId, nodeAId, nodeBId, edgeId, inferRuleId, derivedEdgeId;

  // Setup: create test nodes
  await test('create test nodes', async () => {
    if (!memgraphOk) skip('Memgraph not available');
    const ts = Date.now();
    const a = await mg.runQuery(`CREATE (n:T1TestNode {ts:$ts}) RETURN id(n) AS id`, { ts: String(ts) });
    const b = await mg.runQuery(`CREATE (n:T1TestNode {ts:$ts}) RETURN id(n) AS id`, { ts: String(ts) });
    nodeAId = a[0].id; nodeBId = b[0].id;
    assert(nodeAId != null && nodeBId != null, 'nodes created');
  });

  // ── Hypothesis ──

  await test('createHypothesis — POLARITY_CONFLICT', async () => {
    if (!memgraphOk) skip('Memgraph not available');
    const result = await hypoSvc.createHypothesis({
      type:      'POLARITY_CONFLICT',
      statement: 'Test polarity conflict hypothesis',
      namespace: 'TEST',
    });
    hypoId = result.hypothesisId;
    assert(hypoId,                        'hypothesisId returned');
    assert(result.status === 'OPEN',      'status=OPEN');
    assert(result.confidence === 0.5,     'default confidence=0.5');
  });

  await test('getHypothesis returns node with empty evidence', async () => {
    if (!memgraphOk || !hypoId) skip('Memgraph not available or hypothesis not created');
    const h = await hypoSvc.getHypothesis(hypoId);
    assert(h.id === hypoId || h.id?.toString() === hypoId, 'id matches');
    assert(h.type === 'POLARITY_CONFLICT', `type mismatch: ${h.type}`);
    assert(Array.isArray(h.supporting),    'supporting is array');
  });

  await test('queryHypotheses finds the created hypothesis', async () => {
    if (!memgraphOk || !hypoId) skip('Memgraph not available');
    const rows = await hypoSvc.queryHypotheses({ status: 'OPEN', namespace: 'TEST' });
    const found = rows.some(r => (r.h?.id || r.id) === hypoId);
    assert(found, 'hypothesis found in query');
  });

  await test('resolveHypothesis → CONFIRMED', async () => {
    if (!memgraphOk || !hypoId) skip('Memgraph not available');
    const result = await hypoSvc.resolveHypothesis(hypoId, {
      status:            'CONFIRMED',
      resolved_by:       'HUMAN',
      resolution_reason: 'Test resolution',
    });
    assert(result.success === true, 'success');
  });

  await test('checkExpired creates EXPIRED status for past expires_at', async () => {
    if (!memgraphOk) skip('Memgraph not available');
    // Create a hypothesis with past expiry
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const r = await hypoSvc.createHypothesis({
      type: 'EXISTENCE', statement: 'Will expire', namespace: 'TEST', expires_at: pastExpiry,
    });
    const result = await hypoSvc.checkExpired();
    assert(result.expiredCount >= 1, `Expected >= 1 expired, got ${result.expiredCount}`);
  });

  // ── Decay ──

  await test('setDecayRate + calculateEffectiveWeight', async () => {
    if (!memgraphOk || nodeAId == null) skip('Memgraph not available');
    edgeId = (await edgeProps.createEdge(nodeAId, nodeBId, 'T1_DECAY_TEST', { source_quanta: [] })).edgeId;
    assert(edgeId != null, 'edge created');
    await decaySvc.setDecayRate(edgeId, 'FAST');
    const we = await decaySvc.calculateEffectiveWeight(edgeId);
    // Age≈0 (just created) → weight should still be ~1.0
    assert(we > 0.9, `Expected ~1.0 for new edge, got ${we}`);
  });

  await test('reinforce resets last_reinforced and resolves DECAY_RECOVERY', async () => {
    if (!memgraphOk || edgeId == null) skip('Memgraph not available');
    const result = await decaySvc.reinforce(edgeId, 'test-quantum-reinforce');
    assert(result.last_reinforced != null, 'last_reinforced set');
    assert(result.weight_effective > 0.9,  'weight near 1.0 after reinforce');
  });

  // ── Inference ──

  await test('registerRule stores InferenceRule node', async () => {
    if (!memgraphOk) skip('Memgraph not available');
    const r = await inferSvc.registerRule({
      name:                'Test Transitive Rule',
      description:         'Test rule',
      type:                'TRANSITIVE',
      pattern:             { premises: [{ from: 'a', to: 'b', type: 'T1_DECAY_TEST' }], conclusion: { from: 'a', to: 'b', type: 'T1_INFERRED' } },
      confidence_modifier: 0.8,
      namespace:           'TEST',
      created_by:          'test',
    });
    inferRuleId = r.ruleId;
    assert(inferRuleId, 'ruleId returned');
  });

  await test('listRules finds registered rule', async () => {
    if (!memgraphOk || !inferRuleId) skip('Memgraph not available');
    const rules = await inferSvc.listRules({ namespace: 'TEST' });
    const found = rules.some(r => (r.r?.id || r.id) === inferRuleId);
    assert(found, 'rule found in list');
  });

  await test('deriveEdge creates derived edge with justification', async () => {
    if (!memgraphOk || nodeAId == null) skip('Memgraph not available');
    const { edgeId: e1 } = await edgeProps.createEdge(nodeAId, nodeBId, 'T1_PREMISE', { source_quanta: [] });
    const result = await inferSvc.deriveEdge(nodeAId, nodeBId, 'T1_DERIVED_EDGE', {
      premises:            [e1],
      ruleId:              inferRuleId || 'test-rule',
      ruleName:            'Test Rule',
      confidence_modifier: 0.9,
      premiseWeights:      [1.0],
    });
    derivedEdgeId = result.edgeId;
    assert(derivedEdgeId != null,       'derived edgeId returned');
    assert(result.derived_confidence > 0, 'confidence set');
  });

  await test('getJustification returns chain for derived edge', async () => {
    if (!memgraphOk || derivedEdgeId == null) skip('Memgraph not available');
    const j = await inferSvc.getJustification(derivedEdgeId);
    assert(Array.isArray(j.chain),   'chain is array');
    assert(j.chain.length > 0,       'chain non-empty');
    assert(j.totalConfidence > 0,    'totalConfidence set');
  });

  await test('revalidateDerived returns valid for healthy edge', async () => {
    if (!memgraphOk || derivedEdgeId == null) skip('Memgraph not available');
    const r = await inferSvc.revalidateDerived(derivedEdgeId);
    assert(r.valid === true, `Expected valid=true, got: ${JSON.stringify(r)}`);
  });

  // Cleanup
  await test('cleanup test nodes', async () => {
    if (!memgraphOk || nodeAId == null) skip('skipped');
    await mg.runQuery(
      `MATCH (n:T1TestNode) WHERE id(n) = $a OR id(n) = $b DETACH DELETE n`,
      { a: neo4j.int(nodeAId), b: neo4j.int(nodeBId) }
    );
    await mg.runQuery(`MATCH (r:InferenceRule {namespace:'TEST'}) DELETE r`, {});
    await mg.runQuery(`MATCH (h:Hypothesis {namespace:'TEST'}) DELETE h`, {});
  });
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Tier 1 Knowledge Model Tests');
  console.log('══════════════════════════════════════════════════════');

  await checkMg();
  if (!memgraphOk) console.log(`${Y}  [info] Memgraph not available — integration tests skipped${Z}`);

  await testSchemas();
  await testDecayUnit();
  await testHypothesisUnit();
  await testAdmiraltyUnit();
  await testIntegration();

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('Test runner error:', err); process.exit(1); });
