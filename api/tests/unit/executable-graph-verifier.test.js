/**
 * Unit test — TASK-P1-003: ExecutableGraphVerifier (Level 1 + Level 2).
 *
 * Uses a fake pluginRegistry (no AOPEG init) + the real GraphValidator.
 *
 * Run: node api/tests/unit/executable-graph-verifier.test.js
 */

'use strict';

const assert = require('assert');
const { ExecutableGraphVerifier } = require('../../src/services/verification/executable-graph-verifier.service');
const { GraphValidator } = require('../../src/services/graph/graph-validator');

// Fake registry: only these executor types are "registered".
const KNOWN = new Set(['workflow.start', 'workflow.end', 'common.transform', 'workflow.condition']);
const fakeRegistry = {
  validateGraphExecutors: (types) => ({ missingExecutors: types.filter(t => !KNOWN.has(t)) }),
};

function makeVerifier() {
  return new ExecutableGraphVerifier({ pluginRegistry: fakeRegistry, GraphValidator });
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validGraph = {
  nodes: [
    { id: 'n1', executorType: 'workflow.start' },
    { id: 'n2', executorType: 'common.transform' },
    { id: 'n3', executorType: 'workflow.end' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ],
};

const phantomGraph = {
  nodes: [
    { id: 'n1', executorType: 'workflow.start' },
    { id: 'n2', executorType: 'bogus.executor' },
    { id: 'n3', executorType: 'workflow.end' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ],
};

const unlabelledBranchGraph = {
  nodes: [
    { id: 'n1', executorType: 'workflow.start' },
    { id: 'c1', executorType: 'workflow.condition' },
    { id: 'a', executorType: 'common.transform' },
    { id: 'b', executorType: 'common.transform' },
    { id: 'n3', executorType: 'workflow.end' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'c1' },
    { id: 'e2', source: 'c1', target: 'a' }, // no label
    { id: 'e3', source: 'c1', target: 'b' }, // no label
    { id: 'e4', source: 'a', target: 'n3' },
    { id: 'e5', source: 'b', target: 'n3' },
  ],
};

const badTemplateGraph = {
  nodes: [
    { id: 'n1', executorType: 'workflow.start' },
    { id: 'n2', executorType: 'common.transform', parameters: { value: '{{n99.result}}' } },
    { id: 'n3', executorType: 'workflow.end' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('TASK-P1-003 — ExecutableGraphVerifier (L1 + L2)\n');

  await test('L1: phantom executor → PHANTOM_EXECUTOR error, l1 fails', async () => {
    const r = await makeVerifier().verify(phantomGraph);
    const codes = r.issues.map(i => i.code);
    assert.ok(codes.includes('PHANTOM_EXECUTOR'), 'expected PHANTOM_EXECUTOR');
    assert.strictEqual(r.levels.l1.pass, false);
    assert.ok(r.scores.executors < 1, 'executors score must drop below 1');
    assert.strictEqual(r.pass, false);
  });

  await test('L1: valid graph → pass, grade A', async () => {
    const r = await makeVerifier().verify(validGraph);
    assert.strictEqual(r.levels.l1.pass, true, `l1 errors: ${JSON.stringify(r.levels.l1.errors)}`);
    assert.strictEqual(r.pass, true, `issues: ${JSON.stringify(r.issues)}`);
    assert.strictEqual(r.grade, 'A');
    assert.strictEqual(r.scores.executors, 1);
  });

  await test('L2: condition node without labels → MISSING_BRANCH_LABELS', async () => {
    const r = await makeVerifier().verify(unlabelledBranchGraph);
    const codes = r.issues.map(i => i.code);
    assert.ok(codes.includes('MISSING_BRANCH_LABELS'), 'expected MISSING_BRANCH_LABELS');
    assert.strictEqual(r.levels.l2.pass, false);
    assert.ok(r.scores.branches < 1, 'branches score must drop');
  });

  await test('L2: labelled condition edges → no branch issue', async () => {
    const labelled = JSON.parse(JSON.stringify(unlabelledBranchGraph));
    labelled.edges[1].label = 'true';
    labelled.edges[2].label = 'false';
    const r = await makeVerifier().verify(labelled);
    const codes = r.issues.map(i => i.code);
    assert.ok(!codes.includes('MISSING_BRANCH_LABELS'), 'should not flag labelled edges');
    assert.strictEqual(r.scores.branches, 1);
  });

  await test('L2: invalid template ref → INVALID_TEMPLATE_REF', async () => {
    const r = await makeVerifier().verify(badTemplateGraph);
    const issue = r.issues.find(i => i.code === 'INVALID_TEMPLATE_REF');
    assert.ok(issue, 'expected INVALID_TEMPLATE_REF');
    assert.strictEqual(issue.ref, 'n99');
    assert.ok(r.scores.templates < 1, 'templates score must drop');
  });

  await test('grading: phantom graph grades below valid graph', async () => {
    const good = await makeVerifier().verify(validGraph);
    const bad = await makeVerifier().verify(phantomGraph);
    assert.ok(bad.score < good.score, `bad(${bad.score}) should be < good(${good.score})`);
  });

  await test('contract shape: pass/grade/score/levels/issues/suggestions present', async () => {
    const r = await makeVerifier().verify(validGraph);
    for (const k of ['pass', 'grade', 'score', 'scores', 'levels', 'issues', 'suggestions']) {
      assert.ok(k in r, `result must have '${k}'`);
    }
    assert.ok(r.levels.l1 && r.levels.l2, 'levels.l1 and levels.l2 required');
    assert.ok(Array.isArray(r.issues) && Array.isArray(r.suggestions));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
