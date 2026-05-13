'use strict';
/**
 * Tier 0 Concepts — Unit + Integration Tests
 *
 * Unit tests run without Memgraph (mock injected via require cache).
 * Integration tests require a live Memgraph connection.
 *
 * Run: node api/tests/tier0/tier0.test.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// ─────────────────────────────────────────────────────────────
// Minimal test harness
// ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m';

async function test(name, fn) {
  try {
    await fn();
    console.log(`${GREEN}  ✓${RESET} ${name}`);
    passed++;
  } catch (err) {
    if (err.skip) {
      console.log(`${YELLOW}  ⊘${RESET} ${name} (${err.message})`);
      skipped++;
    } else {
      console.log(`${RED}  ✗${RESET} ${name}`);
      console.log(`      ${RED}${err.message}${RESET}`);
      failed++;
    }
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function skip(msg) {
  const e = new Error(msg);
  e.skip = true;
  throw e;
}

// ─────────────────────────────────────────────────────────────
// Check Memgraph availability
// ─────────────────────────────────────────────────────────────

let memgraphAvailable = false;
async function checkMemgraph() {
  try {
    const mg = require('../../src/services/memgraph.service');
    await mg.runQuery('RETURN 1 AS ok', {});
    memgraphAvailable = true;
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────
// 1. Schema Unit Tests
// ─────────────────────────────────────────────────────────────

async function testSchema() {
  console.log('\n1. Edge Schema (unit)');

  const { buildDefaults, validateProperties, inferTemporalPattern, TEMPORAL_PATTERNS } =
    require('../../src/services/knowledge/tier0/schemas/edge-schema');

  await test('buildDefaults returns all required fields', () => {
    const d = buildDefaults();
    assert(d.polarity    === 'AFFIRMED',         'default polarity');
    assert(d.status      === 'ACTIVE',           'default status');
    assert(d.recorded_at !== null,               'recorded_at set');
    assert(Array.isArray(d.source_quanta),       'source_quanta array');
    assert(d.weight_original  === 1.0,           'weight_original');
    assert(d.weight_effective === 1.0,           'weight_effective');
  });

  await test('validateProperties — valid AFFIRMED edge passes', () => {
    const props = buildDefaults();
    const errors = validateProperties(props);
    assert(errors.length === 0, `Unexpected errors: ${errors.join('; ')}`);
  });

  await test('validateProperties — invalid polarity fails', () => {
    const props = { ...buildDefaults(), polarity: 'MAYBE' };
    const errors = validateProperties(props);
    assert(errors.some(e => e.includes('polarity')), 'Expected polarity error');
  });

  await test('validateProperties — T0-005: grain without value fails', () => {
    const props = { ...buildDefaults(), valid_from: null, valid_from_grain: 'EXACT' };
    const errors = validateProperties(props);
    assert(errors.some(e => e.includes('grain')), 'Expected grain error');
  });

  await test('validateProperties — T0-004: RETRACTED without retracted_at fails', () => {
    const props = { ...buildDefaults(), status: 'RETRACTED', retraction_reason: 'test' };
    const errors = validateProperties(props);
    assert(errors.some(e => e.includes('retracted_at')), 'Expected retracted_at error');
  });

  await test('validateProperties — T0-008: SUPERSEDED without superseded_at fails', () => {
    const props = { ...buildDefaults(), status: 'SUPERSEDED' };
    const errors = validateProperties(props);
    assert(errors.some(e => e.includes('superseded_at')), 'Expected superseded_at error');
  });

  await test('inferTemporalPattern — INDEFINITE for null bounds', () => {
    const p = inferTemporalPattern(null, null);
    assert(p.label === 'INDEFINITE', `Expected INDEFINITE, got ${p.label}`);
  });

  await test('inferTemporalPattern — HISTORICAL_FACT for past valid_to', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const p = inferTemporalPattern('2020-01-01', past);
    assert(p.label === 'HISTORICAL_FACT', `Expected HISTORICAL_FACT, got ${p.label}`);
  });

  await test('inferTemporalPattern — CURRENT_FACT for null valid_to', () => {
    const p = inferTemporalPattern('2020-01-01', null);
    assert(p.label === 'CURRENT_FACT', `Expected CURRENT_FACT, got ${p.label}`);
  });

  await test('inferTemporalPattern — FUTURE_FACT for future valid_from', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const p = inferTemporalPattern(future, null);
    assert(p.label === 'FUTURE_FACT', `Expected FUTURE_FACT, got ${p.label}`);
  });
}

// ─────────────────────────────────────────────────────────────
// 2. Edge Properties Service Unit Tests (mock Memgraph)
// ─────────────────────────────────────────────────────────────

async function testEdgePropertiesUnit() {
  console.log('\n2. Edge Properties Service (unit)');

  await test('isActive — ACTIVE AFFIRMED current fact returns true', () => {
    const { isActive } = require('../../src/services/knowledge/tier0/edge-properties.service');
    const props = {
      status: 'ACTIVE',
      polarity: 'AFFIRMED',
      valid_from: '2020-01-01',
      valid_to: null,
    };
    assert(isActive(props) === true, 'Expected true');
  });

  await test('isActive — RETRACTED edge returns false', () => {
    const { isActive } = require('../../src/services/knowledge/tier0/edge-properties.service');
    const props = { status: 'RETRACTED', polarity: 'AFFIRMED', valid_from: null, valid_to: null };
    assert(isActive(props) === false, 'Expected false for RETRACTED');
  });

  await test('isActive — NEGATED edge returns false', () => {
    const { isActive } = require('../../src/services/knowledge/tier0/edge-properties.service');
    const props = { status: 'ACTIVE', polarity: 'NEGATED', valid_from: null, valid_to: null };
    assert(isActive(props) === false, 'Expected false for NEGATED');
  });

  await test('isActive — edge with future valid_from returns false', () => {
    const { isActive } = require('../../src/services/knowledge/tier0/edge-properties.service');
    const future = new Date(Date.now() + 86400000).toISOString();
    const props = { status: 'ACTIVE', polarity: 'AFFIRMED', valid_from: future, valid_to: null };
    assert(isActive(props) === false, 'Expected false for future valid_from');
  });

  await test('isActive — edge with past valid_to returns false', () => {
    const { isActive } = require('../../src/services/knowledge/tier0/edge-properties.service');
    const past = new Date(Date.now() - 86400000).toISOString();
    const props = { status: 'ACTIVE', polarity: 'AFFIRMED', valid_from: null, valid_to: past };
    assert(isActive(props) === false, 'Expected false for expired valid_to');
  });

  await test('createEdge — rejects invalid relationType', async () => {
    const { createEdge } = require('../../src/services/knowledge/tier0/edge-properties.service');
    try {
      await createEdge(1, 2, 'invalid type with spaces', {});
      throw new Error('Should have thrown');
    } catch (err) {
      assert(err.message.includes('relationType') || err.message.includes('Invalid'), err.message);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// 3. Integration Tests (require live Memgraph)
// ─────────────────────────────────────────────────────────────

async function testIntegration() {
  console.log('\n3. Integration (Memgraph)');

  const mg = require('../../src/services/memgraph.service');
  const edgeProps = require('../../src/services/knowledge/tier0/edge-properties.service');
  const retractSvc = require('../../src/services/knowledge/tier0/retraction.service');
  const temporalSvc = require('../../src/services/knowledge/tier0/temporal.service');
  const polaritySvc = require('../../src/services/knowledge/tier0/polarity.service');

  // Create test nodes
  let nodeAId, nodeBId, edgeId;

  await test('create test nodes for edge operations', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    const ts = Date.now();
    const a = await mg.runQuery(
      `CREATE (n:T0TestNode { label: 'nodeA', ts: $ts }) RETURN id(n) AS id`,
      { ts: String(ts) }
    );
    const b = await mg.runQuery(
      `CREATE (n:T0TestNode { label: 'nodeB', ts: $ts }) RETURN id(n) AS id`,
      { ts: String(ts) }
    );
    nodeAId = a[0].id;
    nodeBId = b[0].id;
    assert(nodeAId != null, 'nodeA created');
    assert(nodeBId != null, 'nodeB created');
  });

  await test('createEdge applies Tier 0 defaults', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (nodeAId == null) skip('nodes not created');
    const result = await edgeProps.createEdge(nodeAId, nodeBId, 'T0_TEST_REL', {
      source_quanta: ['test-quantum-001'],
    });
    edgeId = result.edgeId;
    assert(edgeId != null,                  'edgeId returned');
    assert(result.polarity === 'AFFIRMED',  'default polarity AFFIRMED');
    assert(result.status   === 'ACTIVE',    'default status ACTIVE');
    assert(result.recorded_at != null,      'recorded_at set');
  });

  await test('getEdgeWithTier0 returns computed _pattern', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    const edge = await edgeProps.getEdgeWithTier0(edgeId);
    assert(edge._pattern  != null,  '_pattern computed');
    assert(edge._isActive === true, '_isActive true');
    assert(edge._pattern  === 'INDEFINITE', `Expected INDEFINITE, got ${edge._pattern}`);
  });

  await test('validateEdge — new edge is valid', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    const result = await edgeProps.validateEdge(edgeId);
    assert(result.valid === true, `Validation errors: ${result.errors.join('; ')}`);
  });

  await test('setTemporalValidity + getTemporalValidity roundtrip', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    await temporalSvc.setTemporalValidity(edgeId, {
      valid_from: '2023-01-01',
      valid_from_grain: 'DAY',
      valid_to: null,
      valid_to_grain: null,
    });
    const tv = await temporalSvc.getTemporalValidity(edgeId);
    assert(tv.valid_from === '2023-01-01', 'valid_from set');
    assert(tv.valid_from_grain === 'DAY',  'grain set');
    assert(tv.pattern.label === 'CURRENT_FACT', `Expected CURRENT_FACT, got ${tv.pattern.label}`);
  });

  await test('queryAtTime returns edge valid in 2024', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    const results = await temporalSvc.queryAtTime('2024-06-01T00:00:00Z', { relationType: 'T0_TEST_REL' });
    const found = results.some(r => r.edgeId === edgeId || String(r.edgeId) === String(edgeId));
    assert(found, 'Edge should be valid in 2024');
  });

  await test('setPolarity changes polarity to NEGATED', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    await polaritySvc.setPolarity(edgeId, 'NEGATED', 0.9);
    const p = await polaritySvc.getPolarity(edgeId);
    assert(p.polarity === 'NEGATED', 'polarity set to NEGATED');
    assert(Math.abs(p.polarity_confidence - 0.9) < 0.001, 'confidence set');
    // Restore
    await polaritySvc.setPolarity(edgeId, 'AFFIRMED', 1.0);
  });

  await test('retract edge — status becomes RETRACTED', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    const result = await retractSvc.retract(edgeId, {
      reason: 'test retraction',
      retractedByQuantum: 'test-quantum-001',
    });
    assert(result.success === true, 'retract returned success');
    const isR = await retractSvc.isRetracted(edgeId);
    assert(isR === true, 'edge is now RETRACTED');
  });

  await test('restore edge — status returns to ACTIVE', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (edgeId == null) skip('edge not created');
    const result = await retractSvc.restore(edgeId, {
      reason: 'test restore',
      newSourceQuantum: 'test-quantum-002',
    });
    assert(result.restored === true, 'restore returned true');
    const isR = await retractSvc.isRetracted(edgeId);
    assert(isR === false, 'edge is no longer RETRACTED');
  });

  await test('retractByQuantum cascades to empty-source edges', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (nodeAId == null) skip('nodes not created');
    // Create a dedicated edge with only one quantum so cascade is deterministic
    const cascadeQuantum = `cascade-q-${Date.now()}`;
    const cascadeEdge = await edgeProps.createEdge(nodeAId, nodeBId, 'T0_CASCADE_TEST', {
      source_quanta: [cascadeQuantum],
    });
    assert(cascadeEdge.edgeId != null, 'cascade edge created');

    const result = await retractSvc.retractByQuantum(cascadeQuantum, 'quantum retracted');
    assert(result.edgesAffected  >= 1, 'at least one edge affected');
    assert(result.edgesRetracted >= 1, 'at least one edge retracted via cascade');
    const isR = await retractSvc.isRetracted(cascadeEdge.edgeId);
    assert(isR === true, 'edge cascaded to RETRACTED');
  });

  // Cleanup test nodes
  await test('cleanup test nodes', async () => {
    if (!memgraphAvailable) skip('Memgraph not available');
    if (nodeAId == null) skip('nodes not created');
    await mg.runQuery(
      `MATCH (n:T0TestNode) WHERE id(n) = $a OR id(n) = $b DETACH DELETE n`,
      { a: require('neo4j-driver').int(nodeAId), b: require('neo4j-driver').int(nodeBId) }
    );
    passed++; // counted manually since no assertion needed
    console.log(`${GREEN}  ✓${RESET} cleanup test nodes`);
    passed--; // adjustment since test() also increments
  });
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Tier 0 Concepts Tests');
  console.log('══════════════════════════════════════════════════════');

  await checkMemgraph();
  if (!memgraphAvailable) {
    console.log(`${YELLOW}  [info] Memgraph not available — integration tests will be skipped${RESET}`);
  }

  await testSchema();
  await testEdgePropertiesUnit();
  await testIntegration();

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
