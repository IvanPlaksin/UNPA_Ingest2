/**
 * Unit test — TASK-P3-002: IR-preservation (read-path parsing).
 *
 * _formatCatalogEntry must parse the persisted processIR JSON back into an object
 * (and expose irVersion), and default to null for legacy graphs without an IR.
 * Pure — no DB round-trip (that is covered separately by a live integration check).
 *
 * Run: node api/tests/unit/ir-preservation.test.js
 */

'use strict';

const assert = require('assert');
const { graphCatalogService } = require('../../src/services/graphCatalog.service');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

const entry = { entryId: 'e1', name: 'g', type: 'atomic', namespace: 'TEST', createdAt: 't', updatedAt: 't' };

console.log('TASK-P3-002 — IR-preservation (read path)\n');

test('_formatCatalogEntry parses persisted processIR JSON + irVersion', () => {
  const ir = { type: 'sequence', id: 'seq_1', steps: [{ id: 's1', _type: 'TaskStep' }], _type: 'ProcessRepresentation' };
  const def = { nodes: '[]', edges: '[]', requiredParams: '{}', processIR: JSON.stringify(ir), irVersion: '1.0' };
  const out = graphCatalogService._formatCatalogEntry(entry, def);
  assert.deepStrictEqual(out.processIR, ir, 'processIR must round-trip through JSON');
  assert.strictEqual(out.irVersion, '1.0');
});

test('_formatCatalogEntry returns null processIR for legacy graphs', () => {
  const def = { nodes: '[]', edges: '[]', requiredParams: '{}' }; // no processIR
  const out = graphCatalogService._formatCatalogEntry(entry, def);
  assert.strictEqual(out.processIR, null);
  assert.strictEqual(out.irVersion, null);
});

test('_formatCatalogEntry tolerates missing definition', () => {
  const out = graphCatalogService._formatCatalogEntry(entry, null);
  assert.strictEqual(out.processIR, null);
});

// ── P3-002+: task-planner builders lift a flat TaskPlan into a process tree ──
const { createTaskPlanner } = require('../../src/services/graph/task-planner');

test('_buildSequenceFromDependencies → ProcessRepresentation sequence tree', () => {
  const planner = createTaskPlanner();
  const steps = [
    { id: 's1', intent: 'fetch', capability: 'DATA_FETCH', inputs: ['START'], outputs: ['x'], _type: 'TaskStep' },
    { id: 's2', intent: 'transform', capability: 'DATA_TRANSFORM', inputs: ['x'], outputs: ['y'], _type: 'TaskStep' },
  ];
  const deps = [{ from: 's1', to: 's2' }];
  const tree = planner._buildSequenceFromDependencies(steps, deps);
  assert.strictEqual(tree._type, 'ProcessRepresentation');
  assert.strictEqual(tree.type, 'sequence');
  assert.strictEqual(tree.steps.length, 2);
});

test('_buildWithParallelGroups → tree containing a parallel operator', () => {
  const planner = createTaskPlanner();
  const steps = [
    { id: 's1', intent: 'a', capability: 'DATA_FETCH', inputs: ['START'], outputs: ['x'], _type: 'TaskStep' },
    { id: 's2', intent: 'b', capability: 'ANALYSIS', inputs: ['x'], outputs: ['y'], _type: 'TaskStep' },
    { id: 's3', intent: 'c', capability: 'ANALYSIS', inputs: ['x'], outputs: ['z'], _type: 'TaskStep' },
  ];
  const deps = [{ from: 's1', to: 's2' }, { from: 's1', to: 's3' }];
  const tree = planner._buildWithParallelGroups(steps, deps, [['s2', 's3']]);
  assert.strictEqual(tree._type, 'ProcessRepresentation');
  const hasParallel = JSON.stringify(tree).includes('"parallel"');
  assert.ok(hasParallel, 'tree must contain a parallel subtree');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
