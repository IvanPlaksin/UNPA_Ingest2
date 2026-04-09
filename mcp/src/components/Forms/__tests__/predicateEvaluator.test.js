/**
 * Tests for client-side predicate evaluator.
 * Run from mcp/ root or copy evaluatePredicate to a CJS module for jest.
 *
 * Since mcp/ has no test framework, these are structured as a self-executing
 * test runner that can be run with: node src/components/Forms/__tests__/predicateEvaluator.test.js
 */

// Re-implement evaluatePredicate in CJS for testability
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

function evaluatePredicate(expression, context) {
  try {
    // 1. Extract string literals and replace with placeholders
    const strings = [];
    const withPlaceholders = expression.replace(/(["'])(?:(?!\1).)*\1/g, (match) => {
      strings.push(match);
      return `__STR${strings.length - 1}__`;
    });

    // 2. Replace variable references with context values
    const evaluated = withPlaceholders.replace(/\b([a-zA-Z_$][a-zA-Z0-9_.]*)\b/g, (match) => {
      if (['true', 'false', 'null', 'undefined', 'and', 'or', 'not'].includes(match)) {
        return match;
      }
      if (match.startsWith('__STR')) return match;
      const value = getNestedValue(context, match);
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'string') return JSON.stringify(value);
      if (Array.isArray(value)) return JSON.stringify(value);
      return String(value);
    });

    // 3. Restore string literals
    const restored = evaluated.replace(/__STR(\d+)__/g, (_, idx) => strings[Number(idx)]);

    // 4. Convert operators
    const jsExpression = restored
      .replace(/\band\b/gi, '&&')
      .replace(/\bor\b/gi, '||')
      .replace(/\bnot\b/gi, '!')
      .replace(/(?<!=)==(?!=)/g, '===')
      .replace(/!=(?!=)/g, '!==');
    const fn = new Function('return ' + jsExpression);
    return !!fn();
  } catch (e) {
    return true;
  }
}

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    }
  };
}

console.log('predicateEvaluator tests:\n');

// Simple equality
test('evaluates simple string equality', () => {
  expect(evaluatePredicate("status == 'active'", { status: 'active' })).toBe(true);
});

test('evaluates string inequality', () => {
  expect(evaluatePredicate("status != 'active'", { status: 'pending' })).toBe(true);
});

test('evaluates string equality - false case', () => {
  expect(evaluatePredicate("status == 'active'", { status: 'pending' })).toBe(false);
});

// Numeric comparisons
test('evaluates numeric greater than', () => {
  expect(evaluatePredicate("amount > 100", { amount: 150 })).toBe(true);
});

test('evaluates numeric less than', () => {
  expect(evaluatePredicate("amount < 100", { amount: 50 })).toBe(true);
});

test('evaluates numeric equality', () => {
  expect(evaluatePredicate("count == 5", { count: 5 })).toBe(true);
});

// Boolean
test('evaluates boolean true', () => {
  expect(evaluatePredicate("isActive == true", { isActive: true })).toBe(true);
});

test('evaluates boolean false', () => {
  expect(evaluatePredicate("isActive == false", { isActive: false })).toBe(true);
});

// Logical operators
test('evaluates AND', () => {
  expect(evaluatePredicate("a > 1 and b > 1", { a: 2, b: 3 })).toBe(true);
});

test('evaluates OR', () => {
  expect(evaluatePredicate("a > 10 or b > 1", { a: 0, b: 3 })).toBe(true);
});

test('evaluates AND - false case', () => {
  expect(evaluatePredicate("a > 1 and b > 10", { a: 2, b: 3 })).toBe(false);
});

// Nested values
test('evaluates nested property', () => {
  expect(evaluatePredicate("user.role == 'admin'", { user: { role: 'admin' } })).toBe(true);
});

// Undefined fields
test('undefined field returns false for equality', () => {
  expect(evaluatePredicate("missing == 'value'", {})).toBe(false);
});

// Null handling
test('null field', () => {
  expect(evaluatePredicate("field == null", { field: null })).toBe(true);
});

// Complex expressions
test('complex condition with multiple operators', () => {
  expect(evaluatePredicate(
    "type == 'hardware' and priority > 3",
    { type: 'hardware', priority: 5 }
  )).toBe(true);
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
}
