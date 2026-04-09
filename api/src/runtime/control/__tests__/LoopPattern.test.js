/**
 * LoopPattern Tests
 *
 * Tests for loop control flow patterns.
 *
 * @module runtime/control/__tests__/LoopPattern.test
 */

const {
  LoopPattern,
  LoopType,
  LoopState,
  createForEach,
  createWhile,
  createDoWhile,
  createCountLoop
} = require('../LoopPattern');

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

console.log('=== LoopPattern Construction ===\n');

const loop = new LoopPattern({
  id: 'test-loop',
  type: LoopType.FOR_EACH,
  collection: 'data.items'
});

assertEqual(loop.id, 'test-loop', 'Constructor: sets id');
assertEqual(loop.type, LoopType.FOR_EACH, 'Constructor: sets type');
assertEqual(loop.state, LoopState.IDLE, 'Constructor: initial state is IDLE');

console.log('\n=== FOR_EACH Loop (Sync) ===\n');

const forEachLoop = createForEach('foreach', 'data.items');
const forEachResult = forEachLoop.executeSync(
  { data: { items: ['a', 'b', 'c'] } },
  (ctx) => `processed-${ctx.item}`
);

assert(forEachResult.completed, 'FOR_EACH: completes');
assertEqual(forEachResult.iterations, 3, 'FOR_EACH: correct iteration count');
assertEqual(forEachResult.results, ['processed-a', 'processed-b', 'processed-c'], 'FOR_EACH: correct results');
assertEqual(forEachResult.state, LoopState.COMPLETED, 'FOR_EACH: state is COMPLETED');

// Test iteration context
let capturedContexts = [];
createForEach('foreach-ctx', 'data.items').executeSync(
  { data: { items: [10, 20, 30] } },
  (ctx) => { capturedContexts.push({ ...ctx }); return ctx.item; }
);

assertEqual(capturedContexts[0].index, 0, 'FOR_EACH context: index 0');
assertEqual(capturedContexts[0].iteration, 1, 'FOR_EACH context: iteration 1');
assertEqual(capturedContexts[0].isFirst, true, 'FOR_EACH context: isFirst');
assertEqual(capturedContexts[0].isLast, false, 'FOR_EACH context: not isLast');
assertEqual(capturedContexts[2].isLast, true, 'FOR_EACH context: last isLast');
assertEqual(capturedContexts[0].total, 3, 'FOR_EACH context: total');
assertEqual(capturedContexts[0].remaining, 2, 'FOR_EACH context: remaining');

console.log('\n=== FOR_EACH with Object ===\n');

const objLoop = createForEach('foreach-obj', 'data.items');
let objEntries = [];
objLoop.executeSync(
  { data: { items: { a: 1, b: 2 } } },
  (ctx) => { objEntries.push({ key: ctx.key, value: ctx.item }); return ctx.item; }
);

assertEqual(objEntries.length, 2, 'FOR_EACH object: iterates entries');
assert(objEntries.some(e => e.key === 'a' && e.value === 1), 'FOR_EACH object: has key a');
assert(objEntries.some(e => e.key === 'b' && e.value === 2), 'FOR_EACH object: has key b');

console.log('\n=== WHILE Loop ===\n');

let counter = 0;
const whileLoop = createWhile('while', 'iteration < 5');
const whileResult = whileLoop.executeSync(
  {},
  (ctx) => { counter++; return counter; }
);

assert(whileResult.completed, 'WHILE: completes');
assertEqual(whileResult.iterations, 5, 'WHILE: correct iteration count');
assertEqual(whileResult.results, [1, 2, 3, 4, 5], 'WHILE: correct results');

// Test false condition
const falseWhile = createWhile('false-while', 'false');
const falseResult = falseWhile.executeSync({}, () => 'x');
assertEqual(falseResult.iterations, 0, 'WHILE false: zero iterations');

console.log('\n=== DO_WHILE Loop ===\n');

let doCounter = 0;
const doWhileLoop = createDoWhile('dowhile', 'iteration < 3');
const doWhileResult = doWhileLoop.executeSync(
  {},
  (ctx) => { doCounter++; return doCounter; }
);

assert(doWhileResult.completed, 'DO_WHILE: completes');
assertEqual(doWhileResult.iterations, 3, 'DO_WHILE: correct iteration count');

// Test false condition still runs once
const falseDoWhile = createDoWhile('false-dowhile', 'false');
const falseDoResult = falseDoWhile.executeSync({}, () => 'once');
assertEqual(falseDoResult.iterations, 1, 'DO_WHILE false: runs once');
assertEqual(falseDoResult.results, ['once'], 'DO_WHILE false: has one result');

console.log('\n=== COUNT Loop ===\n');

const countLoop = createCountLoop('count', 4);
const countResult = countLoop.executeSync(
  {},
  (ctx) => ctx.index * 2
);

assert(countResult.completed, 'COUNT: completes');
assertEqual(countResult.iterations, 4, 'COUNT: correct iteration count');
assertEqual(countResult.results, [0, 2, 4, 6], 'COUNT: correct results');

console.log('\n=== Break ===\n');

const breakLoop = createForEach('break-loop', 'data.items');
let breakResults = [];
breakLoop.executeSync(
  { data: { items: [1, 2, 3, 4, 5] } },
  (ctx) => {
    if (ctx.item === 3) breakLoop.break('found 3');
    breakResults.push(ctx.item);
    return ctx.item;
  }
);

assertEqual(breakResults, [1, 2, 3], 'Break: stops at item');
assertEqual(breakLoop.state, LoopState.ABORTED, 'Break: state is ABORTED');

console.log('\n=== Max Iterations Safety ===\n');

const infiniteLoop = new LoopPattern({
  id: 'infinite',
  type: LoopType.WHILE,
  condition: 'true',
  maxIterations: 10
});
const infiniteResult = infiniteLoop.executeSync({}, () => 'x');

assertEqual(infiniteResult.iterations, 10, 'Max iterations: stops at limit');
assert(infiniteResult.breakReason.includes('Max iterations'), 'Max iterations: has reason');

console.log('\n=== Async Execution ===\n');

async function testAsync() {
  const asyncLoop = createForEach('async', 'data.items');
  const asyncResult = await asyncLoop.execute(
    { data: { items: [1, 2, 3] } },
    async (ctx) => {
      await new Promise(r => setTimeout(r, 1));
      return ctx.item * 10;
    }
  );

  assert(asyncResult.completed, 'Async: completes');
  assertEqual(asyncResult.results, [10, 20, 30], 'Async: correct results');
}

testAsync().then(() => {
  console.log('\n=== Validation ===\n');

  const validLoop = createForEach('valid', 'data.items');
  const validResult = validLoop.validate();
  assert(validResult.valid, 'Validation: valid loop passes');
  assertEqual(validResult.errors.length, 0, 'Validation: no errors');

  const invalidLoop = new LoopPattern({
    id: 'invalid',
    type: LoopType.WHILE,
    condition: 'x > > 5'
  });
  const invalidResult = invalidLoop.validate();
  assert(!invalidResult.valid, 'Validation: invalid syntax fails');
  assert(invalidResult.errors.length > 0, 'Validation: has errors');

  const unsafeLoop = new LoopPattern({
    id: 'unsafe',
    type: LoopType.WHILE,
    condition: 'require("fs")'
  });
  const unsafeResult = unsafeLoop.validate();
  assert(!unsafeResult.valid, 'Validation: unsafe condition fails');

  console.log('\n=== Serialization ===\n');

  const original = new LoopPattern({
    id: 'serialize-test',
    type: LoopType.FOR_EACH,
    collection: 'data.list',
    maxIterations: 500
  });

  const json = original.toJSON();
  assertEqual(json.id, 'serialize-test', 'toJSON: preserves id');
  assertEqual(json.type, LoopType.FOR_EACH, 'toJSON: preserves type');
  assertEqual(json.collection, 'data.list', 'toJSON: preserves collection');
  assertEqual(json.maxIterations, 500, 'toJSON: preserves maxIterations');

  const restored = LoopPattern.fromJSON(json);
  assertEqual(restored.id, original.id, 'fromJSON: restores id');
  assertEqual(restored.type, original.type, 'fromJSON: restores type');

  console.log('\n=== Constants ===\n');

  assertEqual(LoopType.FOR_EACH, 'for_each', 'LoopType.FOR_EACH');
  assertEqual(LoopType.WHILE, 'while', 'LoopType.WHILE');
  assertEqual(LoopType.DO_WHILE, 'do_while', 'LoopType.DO_WHILE');
  assertEqual(LoopType.COUNT, 'count', 'LoopType.COUNT');

  assertEqual(LoopState.IDLE, 'idle', 'LoopState.IDLE');
  assertEqual(LoopState.RUNNING, 'running', 'LoopState.RUNNING');
  assertEqual(LoopState.COMPLETED, 'completed', 'LoopState.COMPLETED');
  assertEqual(LoopState.ABORTED, 'aborted', 'LoopState.ABORTED');

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
});
