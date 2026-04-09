/**
 * ConditionalBranch Tests
 *
 * Tests for conditional branching control flow.
 *
 * @module runtime/control/__tests__/ConditionalBranch.test
 */

const {
  ConditionalBranch,
  createIfElse,
  createSwitch,
  createRangeBranch
} = require('../ConditionalBranch');

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.log(`✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.log(`✗ ${message}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ConditionalBranch Construction ===\n');

const cb = new ConditionalBranch({
  id: 'test-branch',
  branches: [
    { id: 'high', condition: 'data.value > 100' },
    { id: 'medium', condition: 'data.value > 50' },
    { id: 'low', condition: 'data.value > 0' },
    { id: 'default', isDefault: true }
  ]
});

assertEqual(cb.id, 'test-branch', 'Constructor: sets id');
assertEqual(cb.branchCount, 4, 'Constructor: counts branches');
assert(cb.shortCircuit, 'Constructor: default shortCircuit is true');

console.log('\n=== Basic Evaluation ===\n');

// Test high value
let result = cb.evaluate({ data: { value: 150 } });
assertEqual(result.selectedBranch, 'high', 'evaluate: selects high branch for value > 100');
assert(result.matched, 'evaluate: matched is true');
assertEqual(result.evaluations.length, 1, 'evaluate: short-circuits after first match');

// Test medium value
result = cb.evaluate({ data: { value: 75 } });
assertEqual(result.selectedBranch, 'medium', 'evaluate: selects medium branch for value > 50');

// Test low value
result = cb.evaluate({ data: { value: 25 } });
assertEqual(result.selectedBranch, 'low', 'evaluate: selects low branch for value > 0');

// Test default (negative value)
result = cb.evaluate({ data: { value: -5 } });
assertEqual(result.selectedBranch, 'default', 'evaluate: selects default for no match');

console.log('\n=== evaluateAll (no short-circuit) ===\n');

// Value 150 matches high, medium, and low
const allResult = cb.evaluateAll({ data: { value: 150 } });
assertEqual(allResult.branches, ['high', 'medium', 'low'], 'evaluateAll: returns all matching branches');
assertEqual(allResult.evaluations.length, 3, 'evaluateAll: evaluates all conditions');

// Value -5 matches none, falls to default
const noMatchResult = cb.evaluateAll({ data: { value: -5 } });
assertEqual(noMatchResult.branches, ['default'], 'evaluateAll: uses default when none match');

console.log('\n=== ifElse Convenience ===\n');

const ifResult = cb.ifElse('data.count > 10', { data: { count: 15 } });
assertEqual(ifResult.result, true, 'ifElse: returns true for truthy');
assertEqual(ifResult.branch, 'if', 'ifElse: branch is "if"');

const elseResult = cb.ifElse('data.count > 10', { data: { count: 5 } });
assertEqual(elseResult.result, false, 'ifElse: returns false for falsy');
assertEqual(elseResult.branch, 'else', 'ifElse: branch is "else"');

// Error handling
const errorResult = cb.ifElse('data.missing.value > 10', { data: {} });
assertEqual(errorResult.branch, 'else', 'ifElse: falls to else on error');
assert(errorResult.error !== null, 'ifElse: captures error');

console.log('\n=== Validation ===\n');

const validBranch = new ConditionalBranch({
  id: 'valid',
  branches: [
    { id: 'a', condition: 'data.x > 5' },
    { id: 'b', condition: 'data.y === "test"' }
  ]
});
const validResult = validBranch.validate();
assert(validResult.valid, 'validate: valid for correct syntax');
assertEqual(validResult.errors.length, 0, 'validate: no errors');

const invalidBranch = new ConditionalBranch({
  id: 'invalid',
  branches: [
    { id: 'a', condition: 'data.x > > 5' },  // Syntax error
    { id: 'b', condition: 'require("fs")' }  // Unsafe
  ]
});
const invalidResult = invalidBranch.validate();
assert(!invalidResult.valid, 'validate: invalid for bad syntax/unsafe');
assertEqual(invalidResult.errors.length, 2, 'validate: reports all errors');

console.log('\n=== Branch Management ===\n');

const managedBranch = new ConditionalBranch({
  id: 'managed',
  branches: [
    { id: 'a', condition: 'true' }
  ]
});

managedBranch.addBranch({ id: 'b', condition: 'data.x > 0' });
assertEqual(managedBranch.branchCount, 2, 'addBranch: increases count');

const removed = managedBranch.removeBranch('a');
assert(removed, 'removeBranch: returns true for existing');
assertEqual(managedBranch.branchCount, 1, 'removeBranch: decreases count');

const notRemoved = managedBranch.removeBranch('nonexistent');
assert(!notRemoved, 'removeBranch: returns false for nonexistent');

const updated = managedBranch.updateCondition('b', 'data.x > 10');
assert(updated, 'updateCondition: returns true on success');

const branches = managedBranch.getBranches();
assertEqual(branches[0].condition, 'data.x > 10', 'updateCondition: updates condition');

console.log('\n=== Serialization ===\n');

const original = new ConditionalBranch({
  id: 'serialize-test',
  branches: [
    { id: 'a', condition: 'data.x > 5', priority: 1 },
    { id: 'b', condition: 'data.y < 10', priority: 2 },
    { id: 'default', isDefault: true }
  ],
  shortCircuit: false,
  timeoutMs: 500
});

const json = original.toJSON();
assertEqual(json.id, 'serialize-test', 'toJSON: preserves id');
assertEqual(json.branches.length, 3, 'toJSON: preserves branches');
assertEqual(json.config.shortCircuit, false, 'toJSON: preserves config');

const restored = ConditionalBranch.fromJSON(json);
assertEqual(restored.id, original.id, 'fromJSON: restores id');
assertEqual(restored.branchCount, original.branchCount, 'fromJSON: restores branches');
assertEqual(restored.shortCircuit, original.shortCircuit, 'fromJSON: restores config');

console.log('\n=== Factory: createIfElse ===\n');

const simpleIf = createIfElse('simple', 'data.ready');

const ifTaken = simpleIf.evaluate({ data: { ready: true } });
assertEqual(ifTaken.selectedBranch, 'if', 'createIfElse: if branch when true');

const elseTaken = simpleIf.evaluate({ data: { ready: false } });
assertEqual(elseTaken.selectedBranch, 'else', 'createIfElse: else branch when false');

console.log('\n=== Factory: createSwitch ===\n');

const statusSwitch = createSwitch('status', 'data.status', [
  { value: 'pending', branchId: 'pending' },
  { value: 'active', branchId: 'active' },
  { value: 'completed', branchId: 'completed' }
], 'unknown');

let switchResult = statusSwitch.evaluate({ data: { status: 'active' } });
assertEqual(switchResult.selectedBranch, 'active', 'createSwitch: matches value');

switchResult = statusSwitch.evaluate({ data: { status: 'archived' } });
assertEqual(switchResult.selectedBranch, 'unknown', 'createSwitch: falls to default');

console.log('\n=== Factory: createRangeBranch ===\n');

const scoreBranch = createRangeBranch('score', 'data.score', [
  { min: 90, branchId: 'excellent' },
  { min: 70, max: 90, branchId: 'good' },
  { min: 50, max: 70, branchId: 'average' },
  { max: 50, branchId: 'poor' }
], 'unknown');

let rangeResult = scoreBranch.evaluate({ data: { score: 95 } });
assertEqual(rangeResult.selectedBranch, 'excellent', 'createRangeBranch: matches highest range');

rangeResult = scoreBranch.evaluate({ data: { score: 75 } });
assertEqual(rangeResult.selectedBranch, 'good', 'createRangeBranch: matches middle range');

rangeResult = scoreBranch.evaluate({ data: { score: 30 } });
assertEqual(rangeResult.selectedBranch, 'poor', 'createRangeBranch: matches lowest range');

console.log('\n=== Priority Ordering ===\n');

const priorityBranch = new ConditionalBranch({
  id: 'priority',
  branches: [
    { id: 'last', condition: 'true', priority: 3 },
    { id: 'first', condition: 'true', priority: 1 },
    { id: 'second', condition: 'true', priority: 2 }
  ]
});

const priorityResult = priorityBranch.evaluate({});
assertEqual(priorityResult.selectedBranch, 'first', 'priority: lower priority evaluated first');

console.log('\n=== Context Snapshot ===\n');

const contextBranch = new ConditionalBranch({
  id: 'context-test',
  branches: [
    { id: 'a', condition: 'true' }
  ]
});

const contextResult = contextBranch.evaluate({
  data: { x: 1 },
  input: { y: 2 },
  output: { z: 3 },
  variables: { v: 4 },
  iteration: 5
});

assert(contextResult.context.hasData, 'context: has data');
assert(contextResult.context.hasInput, 'context: has input');
assert(contextResult.context.hasOutput, 'context: has output');
assert(contextResult.context.hasVariables, 'context: has variables');
assertEqual(contextResult.context.iteration, 5, 'context: has iteration');

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
