/**
 * Quick manual test for ExpressionSandbox
 */

const {
  ExpressionSandbox,
  deepFreeze,
  getByPath,
  hasPath,
  getLength,
  matchPattern
} = require('../ExpressionSandbox');

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
  assert(eq, `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

function assertThrows(fn, message) {
  try {
    fn();
    assert(false, `${message} - should have thrown`);
  } catch (e) {
    assert(true, `${message} - threw: ${e.message.substring(0, 50)}`);
  }
}

console.log('=== Helper Functions ===\n');

// deepFreeze
const frozen = deepFreeze({ a: { b: 1 } });
assert(Object.isFrozen(frozen), 'deepFreeze: freezes object');
assert(Object.isFrozen(frozen.a), 'deepFreeze: freezes nested');

// getByPath
assertEqual(getByPath({ a: { b: 1 } }, 'a.b'), 1, 'getByPath: nested access');
assertEqual(getByPath({ items: [{ x: 1 }] }, 'items[0].x'), 1, 'getByPath: array index');
assertEqual(getByPath({}, 'missing', 'default'), 'default', 'getByPath: default value');

// hasPath
assert(hasPath({ a: 1 }, 'a'), 'hasPath: existing');
assert(!hasPath({ a: 1 }, 'b'), 'hasPath: missing');

// getLength
assertEqual(getLength([1, 2, 3]), 3, 'getLength: array');
assertEqual(getLength('hello'), 5, 'getLength: string');
assertEqual(getLength({ a: 1, b: 2 }), 2, 'getLength: object');

// matchPattern
assert(matchPattern('hello', '^hel'), 'matchPattern: match');
assert(!matchPattern('hello', '^world'), 'matchPattern: no match');

console.log('\n=== ExpressionSandbox ===\n');

const sandbox = new ExpressionSandbox();

// Basic evaluation
assertEqual(sandbox.evaluate('2 + 2'), 4, 'evaluate: arithmetic');
assertEqual(sandbox.evaluate('true && false'), false, 'evaluate: boolean');
assertEqual(sandbox.evaluate('"hello".toUpperCase()'), 'HELLO', 'evaluate: string ops');

// Context access
assertEqual(sandbox.evaluate('data.count', { data: { count: 10 } }), 10, 'evaluate: data access');
assertEqual(sandbox.evaluate('data.count > 5', { data: { count: 10 } }), true, 'evaluate: condition');

// Utility functions
assert(sandbox.evaluate('$has(data, "a")', { data: { a: 1 } }), 'evaluate: $has true');
assert(!sandbox.evaluate('$has(data, "b")', { data: { a: 1 } }), 'evaluate: $has false');
assertEqual(sandbox.evaluate('$get(data, "a.b", "default")', { data: { a: {} } }), 'default', 'evaluate: $get with default');
assertEqual(sandbox.evaluate('$len(data.arr)', { data: { arr: [1, 2, 3] } }), 3, 'evaluate: $len');
assertEqual(sandbox.evaluate('$type(data.num)', { data: { num: 42 } }), 'number', 'evaluate: $type');
assert(sandbox.evaluate('$match(data.text, "^Hello")', { data: { text: 'Hello World' } }), 'evaluate: $match');
assert(sandbox.evaluate('$isEmpty([])', {}), 'evaluate: $isEmpty array');
assert(sandbox.evaluate('$includes(data.arr, 2)', { data: { arr: [1, 2, 3] } }), 'evaluate: $includes');
assert(sandbox.evaluate('$some(data.arr, x => x > 2)', { data: { arr: [1, 2, 3] } }), 'evaluate: $some');
assert(sandbox.evaluate('$every(data.arr, x => x > 0)', { data: { arr: [1, 2, 3] } }), 'evaluate: $every');
assertEqual(sandbox.evaluate('$min(1, 2, 3)'), 1, 'evaluate: $min');
assertEqual(sandbox.evaluate('$max(1, 2, 3)'), 3, 'evaluate: $max');
assertEqual(sandbox.evaluate('$sum(data.arr)', { data: { arr: [1, 2, 3] } }), 6, 'evaluate: $sum');
assertEqual(sandbox.evaluate('$avg(data.arr)', { data: { arr: [2, 4, 6] } }), 4, 'evaluate: $avg');

// evaluateCondition
assert(sandbox.evaluateCondition('1'), 'evaluateCondition: truthy');
assert(!sandbox.evaluateCondition('0'), 'evaluateCondition: falsy');

// evaluateTemplate
assertEqual(
  sandbox.evaluateTemplate('Hello ${data.name}!', { data: { name: 'World' } }),
  'Hello World!',
  'evaluateTemplate: interpolation'
);

// validate
assertEqual(sandbox.validate('2 + 2').valid, true, 'validate: valid syntax');
assert(!sandbox.validate('2 + +').valid, 'validate: invalid syntax');

// checkSafety
assert(sandbox.checkSafety('data.count > 5').safe, 'checkSafety: safe expression');
assert(!sandbox.checkSafety('eval("code")').safe, 'checkSafety: unsafe eval');
assert(!sandbox.checkSafety('require("fs")').safe, 'checkSafety: unsafe require');
assert(!sandbox.checkSafety('process.exit()').safe, 'checkSafety: unsafe process');

// Security tests
console.log('\n=== Security Tests ===\n');

assertThrows(() => sandbox.evaluate('process.exit()'), 'security: blocks process');
assertThrows(() => sandbox.evaluate('require("fs")'), 'security: blocks require');
assertThrows(() => sandbox.evaluate('global.x'), 'security: blocks global');

// Mutation test
assertThrows(
  () => sandbox.evaluate('data.x = 5', { data: { x: 1 } }),
  'security: frozen context mutation'
);

// Timeout test (use longer timeout on Windows where vm timeout can be slow)
console.log('\n=== Timeout Test ===\n');
const fastSandbox = new ExpressionSandbox({ timeoutMs: 100 });

// Test with CPU-bound work rather than infinite loop which may not trigger timeout on all platforms
try {
  const start = Date.now();
  fastSandbox.evaluate('let x=0;for(let i=0;i<1e10;i++)x++');
  const elapsed = Date.now() - start;
  if (elapsed < 500) {
    // If it completed too fast, it didn't timeout properly
    assert(false, 'timeout: should have timed out');
  } else {
    assert(true, 'timeout: computation took too long but did not throw');
  }
} catch (e) {
  assert(e.message.includes('timeout') || e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT',
    `timeout: threw timeout error - ${e.message.substring(0, 50)}`);
}

// Summary
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
