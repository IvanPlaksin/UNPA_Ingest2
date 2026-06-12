#!/usr/bin/env node
/**
 * PetriClient Integration Tests
 *
 * Verifies that:
 *   - gnn-service /petri/health returns pm4py version
 *   - /petri/validate correctly identifies sound graphs
 *   - /petri/validate correctly detects unsound graphs (skip-cascade pattern)
 *
 * Requirements: gnn-service running with pm4py installed
 * Run: node api/tests/integration/petri-client.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { PetriClient } = require('../../src/services/petri/petri-client');

const GNN_URL = process.env.GNN_SERVICE_URL || 'http://localhost:5001';

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function skip(reason) {
  console.log(`  ⏭  SKIP: ${reason}`);
  skipped++;
}

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

// ─── Test data ───────────────────────────────────────────────────────────────

// Sound graph: workflow.start → extract → store → workflow.end
const SOUND_GRAPH = {
  nodes: [
    { id: 'n_start', type: 'start',  data: { label: 'workflow.start', tool: 'workflow.start' } },
    { id: 'n_extract', type: 'action', data: { label: 'Extract',       tool: 'extract_entities' } },
    { id: 'n_store',   type: 'action', data: { label: 'Store',          tool: 'write_graph' } },
    { id: 'n_end',     type: 'output', data: { label: 'workflow.end',   tool: 'workflow.end' } }
  ],
  edges: [
    { id: 'e1', source: 'n_start',   target: 'n_extract' },
    { id: 'e2', source: 'n_extract', target: 'n_store' },
    { id: 'e3', source: 'n_store',   target: 'n_end' }
  ]
};

// Skip-cascade pattern: condition node has one branch that never reaches end
// n_start → n_condition → n_branch_a → n_end
//                       → n_branch_b          ← dead end (no path to n_end)
const SKIP_CASCADE_GRAPH = {
  nodes: [
    { id: 'n_start',     type: 'start',     data: { label: 'workflow.start' } },
    { id: 'n_condition', type: 'condition', data: { label: 'Check status' } },
    { id: 'n_branch_a',  type: 'action',    data: { label: 'Handle success' } },
    { id: 'n_branch_b',  type: 'action',    data: { label: 'Handle failure' } },
    { id: 'n_end',       type: 'output',    data: { label: 'workflow.end' } }
  ],
  edges: [
    { id: 'e1', source: 'n_start',     target: 'n_condition', label: '' },
    { id: 'e2', source: 'n_condition', target: 'n_branch_a',  label: 'true' },
    { id: 'e3', source: 'n_condition', target: 'n_branch_b',  label: 'false' },
    { id: 'e4', source: 'n_branch_a',  target: 'n_end',        label: '' }
    // n_branch_b has no outgoing edge → dead end → skip-cascade pattern
  ]
};

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  const client = new PetriClient({ baseUrl: GNN_URL, timeoutMs: 5000 });

  console.log(`\n🔬 PetriClient Integration Tests`);
  console.log(`   Target: ${GNN_URL}\n`);

  // Check service availability
  const available = await client.isAvailable();
  if (!available) {
    skip(`gnn-service not available at ${GNN_URL} — start the service to run these tests`);
    return summary();
  }

  // Suite 1: Health
  console.log('Suite 1: Health');

  await test('GET /petri/health returns status ok', async () => {
    const res = await client.health();
    assert(res.status === 'ok', `Expected status=ok, got ${res.status}`);
  });

  await test('GET /petri/health returns pm4py_version >= 2.7.0', async () => {
    const res = await client.health();
    assert(res.pm4py_version, 'pm4py_version missing from response');
    const major = parseInt(res.pm4py_version.split('.')[0]);
    const minor = parseInt(res.pm4py_version.split('.')[1]);
    assert(major > 2 || (major === 2 && minor >= 7), `pm4py version too old: ${res.pm4py_version}`);
  });

  // Suite 2: Sound graph
  console.log('\nSuite 2: Sound graph validation');

  await test('Linear DAG (start→extract→store→end) is detected as sound', async () => {
    const res = await client.validateGraph(SOUND_GRAPH.nodes, SOUND_GRAPH.edges, 'test-sound');
    assert(res.sound === true, `Expected sound=true, errors: ${res.errors.join('; ')}`);
    assert(Array.isArray(res.checks), 'checks must be array');
    assert(res.metrics.transitions === 4, `Expected 4 transitions, got ${res.metrics.transitions}`);
  });

  await test('Sound graph has no errors', async () => {
    const res = await client.validateGraph(SOUND_GRAPH.nodes, SOUND_GRAPH.edges);
    assert(res.errors.length === 0, `Unexpected errors: ${res.errors.join('; ')}`);
  });

  // Suite 3: Unsound graph (skip-cascade)
  console.log('\nSuite 3: Skip-cascade detection');

  await test('Skip-cascade graph is detected as NOT sound', async () => {
    const res = await client.validateGraph(SKIP_CASCADE_GRAPH.nodes, SKIP_CASCADE_GRAPH.edges, 'test-skip-cascade');
    assert(res.sound === false, 'Expected sound=false for skip-cascade graph');
    assert(res.errors.length > 0, 'Expected at least one error for unsound graph');
  });

  await test('Skip-cascade graph warnings mention dead transition', async () => {
    const res = await client.validateGraph(SKIP_CASCADE_GRAPH.nodes, SKIP_CASCADE_GRAPH.edges);
    const hasDeadWarning = res.warnings.some(w => w.toLowerCase().includes('dead') || w.toLowerCase().includes('skip'));
    assert(hasDeadWarning, `Expected dead transition warning, got: ${res.warnings.join('; ')}`);
  });

  // Suite 4: Edge cases
  console.log('\nSuite 4: Edge cases');

  await test('Empty graph returns sound=false', async () => {
    const res = await client.validateGraph([], [], 'test-empty');
    assert(res.sound === false, 'Empty graph should not be sound');
  });

  // Suite 5: WAIT_FOR_INPUT handling
  console.log('\nSuite 5: WAIT_FOR_INPUT handling');

  // Linear WAIT graph: workflow.start → wait_input → workflow.end
  const WAIT_LINEAR_GRAPH = {
    nodes: [
      { id: 'n_start', type: 'start',  data: { label: 'workflow.start',  tool: 'workflow.start' } },
      { id: 'n_wait',  type: 'action', data: { label: 'Ask Location',    tool: 'workflow.wait_input' } },
      { id: 'n_end',   type: 'output', data: { label: 'workflow.end',    tool: 'workflow.end' } }
    ],
    edges: [
      { id: 'e1', source: 'n_start', target: 'n_wait' },
      { id: 'e2', source: 'n_wait',  target: 'n_end' }
    ]
  };

  // WAIT with dead branch: condition → [wait_branch (no exit), other → end]
  const WAIT_DEAD_BRANCH_GRAPH = {
    nodes: [
      { id: 'n_start',     type: 'start',     data: { label: 'workflow.start', tool: 'workflow.start' } },
      { id: 'n_condition', type: 'condition', data: { label: 'Check status' } },
      { id: 'n_wait',      type: 'action',    data: { label: 'Ask Details',    tool: 'workflow.wait_input' } },
      { id: 'n_other',     type: 'action',    data: { label: 'Auto-process' } },
      { id: 'n_end',       type: 'output',    data: { label: 'workflow.end',   tool: 'workflow.end' } }
    ],
    edges: [
      { id: 'e1', source: 'n_start',     target: 'n_condition' },
      { id: 'e2', source: 'n_condition', target: 'n_wait',  label: 'needs_input' },
      { id: 'e3', source: 'n_condition', target: 'n_other', label: 'auto' },
      { id: 'e4', source: 'n_other',     target: 'n_end' }
      // n_wait has no outgoing edge → dead WAIT transition
    ]
  };

  await test('WAIT node in linear path is sound (no false positive)', async () => {
    const res = await client.validateGraph(WAIT_LINEAR_GRAPH.nodes, WAIT_LINEAR_GRAPH.edges, 'test-wait-linear');
    assert(res.sound === true, `Expected sound=true for WAIT linear graph, errors: ${res.errors.join('; ')}`);
    assert(res.errors.length === 0, `Unexpected errors: ${res.errors.join('; ')}`);
  });

  await test('WAIT node in linear path has wait_nodes metric > 0', async () => {
    const res = await client.validateGraph(WAIT_LINEAR_GRAPH.nodes, WAIT_LINEAR_GRAPH.edges, 'test-wait-metric');
    assert(res.metrics.wait_nodes >= 1, `Expected wait_nodes >= 1, got ${res.metrics.wait_nodes}`);
  });

  await test('WAIT node informational warning is present for sound graph', async () => {
    const res = await client.validateGraph(WAIT_LINEAR_GRAPH.nodes, WAIT_LINEAR_GRAPH.edges, 'test-wait-warning');
    const hasWaitWarning = res.warnings.some(w => w.toLowerCase().includes('wait'));
    assert(hasWaitWarning, `Expected WAIT informational warning, got: ${res.warnings.join('; ')}`);
  });

  await test('Dead WAIT branch (no path to end) is detected as unsound', async () => {
    const res = await client.validateGraph(WAIT_DEAD_BRANCH_GRAPH.nodes, WAIT_DEAD_BRANCH_GRAPH.edges, 'test-wait-dead');
    assert(res.sound === false, 'Dead WAIT branch should be unsound');
    assert(res.errors.length > 0, 'Expected errors for dead WAIT branch');
  });

  return summary();
}

function summary() {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
