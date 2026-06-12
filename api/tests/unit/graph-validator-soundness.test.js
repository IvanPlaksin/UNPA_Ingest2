#!/usr/bin/env node
/**
 * Unit Tests: GraphValidator.validateSoundness() + formatSoundnessError()
 *
 * Tests feature flag, graceful degradation, and error formatting.
 * PetriClient is mocked — no gnn-service required.
 *
 * Run: node api/tests/unit/graph-validator-soundness.test.js
 */

'use strict';

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

// ─── Mock PetriClient ────────────────────────────────────────────────────────

let mockAvailable = true;
let mockSoundResult = { sound: true, errors: [], warnings: [], metrics: {} };

// Patch require to intercept PetriClient
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.includes('petri-client') || request.includes('petri/petri-client')) {
    return {
      PetriClient: class MockPetriClient {
        async isAvailable() { return mockAvailable; }
        async validateGraph() { return mockSoundResult; }
      }
    };
  }
  return originalLoad.apply(this, arguments);
};

// Load GraphValidator after mock is in place
const { GraphValidator } = require('../../src/services/graph/graph-validator');

// ─── Test data ───────────────────────────────────────────────────────────────

const NODES = [
  { id: 'n1', data: { label: 'Start' } },
  { id: 'n2', data: { label: 'Process' } },
  { id: 'n3', data: { label: 'End' } }
];
const EDGES = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' }
];

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🔬 GraphValidator.validateSoundness() Unit Tests\n');

  const v = new GraphValidator();

  // ── Suite 1: Feature flag ──────────────────────────────────────────────────
  console.log('Suite 1: Feature flag behaviour');

  await test('Feature flag OFF → returns skipped=true, valid=true', async () => {
    delete process.env.PETRI_VALIDATION_ENABLED;
    const r = await v.validateSoundness(NODES, EDGES);
    assert(r.skipped === true, `Expected skipped=true, got ${r.skipped}`);
    assert(r.valid === true, `Expected valid=true, got ${r.valid}`);
    assert(r.reason === 'PETRI_VALIDATION_DISABLED', `Unexpected reason: ${r.reason}`);
  });

  await test('Feature flag OFF → does not call PetriClient', async () => {
    delete process.env.PETRI_VALIDATION_ENABLED;
    mockAvailable = false; // would throw if called
    const r = await v.validateSoundness(NODES, EDGES);
    assert(r.skipped === true, 'Should skip without calling client');
    mockAvailable = true;
  });

  // ── Suite 2: Graceful degradation ─────────────────────────────────────────
  console.log('\nSuite 2: Graceful degradation');

  await test('Service unavailable → returns skipped=true, valid=true', async () => {
    process.env.PETRI_VALIDATION_ENABLED = 'true';
    mockAvailable = false;
    const r = await v.validateSoundness(NODES, EDGES);
    assert(r.skipped === true, `Expected skipped=true`);
    assert(r.valid === true, `Expected valid=true`);
    assert(r.reason === 'PETRI_SERVICE_UNAVAILABLE', `Unexpected reason: ${r.reason}`);
    mockAvailable = true;
  });

  // ── Suite 3: Sound graph ──────────────────────────────────────────────────
  console.log('\nSuite 3: Sound graph');

  await test('Sound graph → valid=true, skipped=false', async () => {
    process.env.PETRI_VALIDATION_ENABLED = 'true';
    mockAvailable = true;
    mockSoundResult = { sound: true, errors: [], warnings: [], metrics: { transitions: 3 } };
    const r = await v.validateSoundness(NODES, EDGES, 'test-graph');
    assert(r.valid === true, `Expected valid=true`);
    assert(r.skipped === false, `Expected skipped=false`);
    assert(r.issues.length === 0, `Expected no issues`);
  });

  // ── Suite 4: Unsound graph ────────────────────────────────────────────────
  console.log('\nSuite 4: Unsound graph (skip-cascade)');

  await test('Dead transition → valid=false with issues', async () => {
    process.env.PETRI_VALIDATION_ENABLED = 'true';
    mockAvailable = true;
    mockSoundResult = {
      sound: false,
      errors: ['Potential dead transitions (skip-cascade risk): [Handle failure]'],
      warnings: ['Woflan: graph is NOT sound'],
      metrics: {}
    };
    const r = await v.validateSoundness(NODES, EDGES);
    assert(r.valid === false, `Expected valid=false`);
    assert(r.skipped === false, `Expected skipped=false`);
    assert(r.issues.length > 0, `Expected issues array to be non-empty`);
  });

  // ── Suite 5: formatSoundnessError ────────────────────────────────────────
  console.log('\nSuite 5: formatSoundnessError()');

  await test('Sound result → returns null', () => {
    const err = v.formatSoundnessError({ valid: true, skipped: false, issues: [], warnings: [] });
    assert(err === null, `Expected null for sound result, got ${JSON.stringify(err)}`);
  });

  await test('Skipped result → returns null', () => {
    const err = v.formatSoundnessError({ valid: true, skipped: true, reason: 'PETRI_VALIDATION_DISABLED', issues: [], warnings: [] });
    assert(err === null, `Expected null for skipped result`);
  });

  await test('Unsound result → returns error with code GRAPH_SOUNDNESS_ERROR', () => {
    const err = v.formatSoundnessError({
      valid: false,
      skipped: false,
      issues: ['Potential dead transitions (skip-cascade risk): [NodeX]'],
      warnings: []
    }, NODES);
    assert(err !== null, 'Expected non-null error');
    assert(err.code === 'GRAPH_SOUNDNESS_ERROR', `Expected GRAPH_SOUNDNESS_ERROR, got ${err.code}`);
    assert(err.issues.length > 0, 'Expected at least one issue');
    assert(err.issues[0].suggestion, 'Expected suggestion in issue');
  });

  await test('Unsound result issues contain type and suggestion', () => {
    const err = v.formatSoundnessError({
      valid: false,
      skipped: false,
      issues: ['Potential dead transitions (skip-cascade risk): [NodeA]'],
      warnings: ['Woflan check skipped']
    }, NODES);
    assert(err.issues[0].type === 'dead_transition', `Expected dead_transition type, got ${err.issues[0].type}`);
    assert(err.issues[0].message.includes('dead'), 'Message should mention dead');
    assert(typeof err.issues[0].suggestion === 'string', 'Suggestion should be string');
  });

  // ── Suite 6: WAIT_FOR_INPUT nodes ─────────────────────────────────────────
  console.log('\nSuite 6: WAIT_FOR_INPUT nodes');

  await test('WAIT node in linear path → sound (no false positive)', async () => {
    process.env.PETRI_VALIDATION_ENABLED = 'true';
    mockAvailable = true;
    // workflow.start → wait_input → workflow.end  — sound graph with a WAIT node
    mockSoundResult = {
      sound: true,
      errors: [],
      warnings: ['Graph contains 1 WAIT_FOR_INPUT node(s): [Ask Location]. These require user interaction at runtime (open world assumption applied).'],
      metrics: { transitions: 3, wait_nodes: 1 }
    };
    const waitNodes = [
      { id: 'n_start', data: { label: 'workflow.start', tool: 'workflow.start' } },
      { id: 'n_wait',  data: { label: 'Ask Location',  tool: 'workflow.wait_input' } },
      { id: 'n_end',   data: { label: 'workflow.end',  tool: 'workflow.end' } }
    ];
    const waitEdges = [
      { id: 'e1', source: 'n_start', target: 'n_wait' },
      { id: 'e2', source: 'n_wait',  target: 'n_end' }
    ];
    const r = await v.validateSoundness(waitNodes, waitEdges, 'wait-linear');
    assert(r.valid === true,  `WAIT linear path should be sound, got valid=${r.valid}`);
    assert(r.skipped === false, `Expected skipped=false`);
    assert(r.issues.length === 0, `Expected no issues for sound WAIT graph`);
  });

  await test('WAIT node in condition branch (all paths reach end) → sound', async () => {
    process.env.PETRI_VALIDATION_ENABLED = 'true';
    mockAvailable = true;
    // condition → [wait_branch → end, other_branch → end]  — all paths sound
    mockSoundResult = {
      sound: true,
      errors: [],
      warnings: ['Graph contains 1 WAIT_FOR_INPUT node(s): [Ask Beneficiary]. These require user interaction at runtime (open world assumption applied).'],
      metrics: { transitions: 5, wait_nodes: 1 }
    };
    const r = await v.validateSoundness(NODES, EDGES, 'wait-branch-sound');
    assert(r.valid === true,  `WAIT branch with exit path should be sound`);
    assert(r.issues.length === 0, `Expected no issues`);
  });

  await test('WAIT node as dead branch (no path to end) → unsound (correctly detected)', async () => {
    process.env.PETRI_VALIDATION_ENABLED = 'true';
    mockAvailable = true;
    // condition → [wait_branch (no outgoing edge), other_branch → end] — dead transition
    mockSoundResult = {
      sound: false,
      errors: ['Potential dead transitions (skip-cascade risk): [Ask Location]'],
      warnings: ['Graph contains 1 WAIT_FOR_INPUT node(s): [Ask Location].'],
      metrics: { transitions: 4, wait_nodes: 1 }
    };
    const r = await v.validateSoundness(NODES, EDGES, 'wait-dead-branch');
    assert(r.valid === false, `Dead WAIT branch should be detected as unsound`);
    assert(r.issues.length > 0, `Expected issues for dead WAIT branch`);
  });

  await test('WAIT soundness warning does not block save (formatSoundnessError returns null for sound+WAIT)', () => {
    // When graph is sound but has WAIT warning, formatSoundnessError must return null
    const soundWithWaitWarning = {
      valid: true,
      skipped: false,
      issues: [],
      warnings: ['Graph contains 1 WAIT_FOR_INPUT node(s): [Ask Location]. These require user interaction at runtime.']
    };
    const err = v.formatSoundnessError(soundWithWaitWarning, NODES);
    assert(err === null, `Sound graph with WAIT warning must not block save (got ${JSON.stringify(err)})`);
  });

  // Cleanup
  delete process.env.PETRI_VALIDATION_ENABLED;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
