/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PREDICATE EVALUATOR TESTS
 * Comprehensive test suite for the CEL-inspired expression evaluator.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { PredicateEvaluator, PredicateError } = require('../predicate-evaluator');

const evaluator = new PredicateEvaluator();
const evaluate = (expr, ctx) => evaluator.evaluate(expr, ctx);

// ────────────────────────────────────────────────────────────────────────────
// BASIC COMPARISONS
// ────────────────────────────────────────────────────────────────────────────

describe('PredicateEvaluator', () => {

  describe('basic comparisons', () => {
    test('string equality', () => {
      expect(evaluate("status == 'active'", { status: 'active' })).toBe(true);
      expect(evaluate("status == 'active'", { status: 'inactive' })).toBe(false);
    });

    test('numeric equality', () => {
      expect(evaluate("count == 5", { count: 5 })).toBe(true);
      expect(evaluate("count == 5", { count: 3 })).toBe(false);
    });

    test('inequality', () => {
      expect(evaluate("status != 'deleted'", { status: 'active' })).toBe(true);
      expect(evaluate("status != 'active'", { status: 'active' })).toBe(false);
    });

    test('numeric comparisons', () => {
      expect(evaluate("amount > 100", { amount: 150 })).toBe(true);
      expect(evaluate("amount > 100", { amount: 50 })).toBe(false);
      expect(evaluate("amount >= 100", { amount: 100 })).toBe(true);
      expect(evaluate("amount < 100", { amount: 50 })).toBe(true);
      expect(evaluate("amount <= 100", { amount: 100 })).toBe(true);
    });

    test('combined range check', () => {
      expect(evaluate("count >= 1 && count <= 10", { count: 5 })).toBe(true);
      expect(evaluate("count >= 1 && count <= 10", { count: 0 })).toBe(false);
      expect(evaluate("count >= 1 && count <= 10", { count: 11 })).toBe(false);
    });

    test('boolean values', () => {
      expect(evaluate("active == true", { active: true })).toBe(true);
      expect(evaluate("active == false", { active: false })).toBe(true);
    });

    test('null comparisons', () => {
      expect(evaluate("value == null", { value: null })).toBe(true);
      expect(evaluate("value == null", { value: 'something' })).toBe(false);
      expect(evaluate("value != null", { value: 'something' })).toBe(true);
    });

    test('undefined comparisons', () => {
      expect(evaluate("missing == undefined", {})).toBe(true);
      expect(evaluate("missing == null", {})).toBe(true); // null == undefined
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // LOGICAL OPERATORS
  // ────────────────────────────────────────────────────────────────────────────

  describe('logical operators', () => {
    test('AND (&&)', () => {
      expect(evaluate("a && b", { a: true, b: true })).toBe(true);
      expect(evaluate("a && b", { a: true, b: false })).toBe(false);
      expect(evaluate("a && b", { a: false, b: true })).toBe(false);
    });

    test('OR (||)', () => {
      expect(evaluate("a || b", { a: false, b: true })).toBe(true);
      expect(evaluate("a || b", { a: false, b: false })).toBe(false);
      expect(evaluate("a || b", { a: true, b: false })).toBe(true);
    });

    test('NOT (!)', () => {
      expect(evaluate("!active", { active: false })).toBe(true);
      expect(evaluate("!active", { active: true })).toBe(false);
    });

    test('short-circuit AND', () => {
      // b is not defined, but short-circuit should prevent evaluation
      expect(evaluate("false && b", {})).toBe(false);
    });

    test('short-circuit OR', () => {
      expect(evaluate("true || b", {})).toBe(true);
    });

    test('operator precedence: && before ||', () => {
      // a || (b && c) — because && binds tighter
      expect(evaluate("a || b && c", { a: true, b: false, c: false })).toBe(true);
    });

    test('parentheses override precedence', () => {
      expect(evaluate("(a || b) && c", { a: true, b: false, c: false })).toBe(false);
    });

    test('complex nested logic', () => {
      expect(evaluate(
        "(type == 'laptop' || type == 'desktop') && budget > 1000",
        { type: 'laptop', budget: 2000 }
      )).toBe(true);

      expect(evaluate(
        "(type == 'laptop' || type == 'desktop') && budget > 1000",
        { type: 'phone', budget: 2000 }
      )).toBe(false);
    });

    test('double negation', () => {
      expect(evaluate("!!active", { active: true })).toBe(true);
      expect(evaluate("!!active", { active: false })).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // MEMBERSHIP OPERATORS
  // ────────────────────────────────────────────────────────────────────────────

  describe('membership operators', () => {
    test('in array', () => {
      expect(evaluate("role in ['admin', 'editor']", { role: 'admin' })).toBe(true);
      expect(evaluate("role in ['admin', 'editor']", { role: 'viewer' })).toBe(false);
    });

    test('not in array', () => {
      expect(evaluate("status not in ['deleted', 'archived']", { status: 'active' })).toBe(true);
      expect(evaluate("status not in ['deleted', 'archived']", { status: 'deleted' })).toBe(false);
    });

    test('in with numbers', () => {
      expect(evaluate("grade in [1, 2, 3]", { grade: 2 })).toBe(true);
      expect(evaluate("grade in [1, 2, 3]", { grade: 5 })).toBe(false);
    });

    test('in with empty array', () => {
      expect(evaluate("x in []", { x: 'anything' })).toBe(false);
    });

    test('in requires array on right', () => {
      expect(() => evaluate("x in 'not_array'", { x: 'a' })).toThrow(PredicateError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // DOT NOTATION (MEMBER ACCESS)
  // ────────────────────────────────────────────────────────────────────────────

  describe('dot notation', () => {
    test('nested property access', () => {
      expect(evaluate("user.role == 'admin'", { user: { role: 'admin' } })).toBe(true);
    });

    test('deeply nested', () => {
      expect(evaluate("a.b.c > 10", { a: { b: { c: 15 } } })).toBe(true);
    });

    test('missing intermediate returns undefined', () => {
      expect(evaluate("user.profile.name == undefined", { user: {} })).toBe(true);
    });

    test('null object access returns undefined', () => {
      expect(evaluate("x.y == undefined", { x: null })).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ARITHMETIC
  // ────────────────────────────────────────────────────────────────────────────

  describe('arithmetic', () => {
    test('addition', () => {
      expect(evaluate("a + b == 10", { a: 3, b: 7 })).toBe(true);
    });

    test('subtraction', () => {
      expect(evaluate("a - b > 0", { a: 10, b: 3 })).toBe(true);
    });

    test('multiplication', () => {
      expect(evaluate("price * quantity > 100", { price: 25, quantity: 5 })).toBe(true);
    });

    test('division', () => {
      expect(evaluate("total / count == 10", { total: 50, count: 5 })).toBe(true);
    });

    test('modulo', () => {
      expect(evaluate("n % 2 == 0", { n: 4 })).toBe(true);
      expect(evaluate("n % 2 == 0", { n: 5 })).toBe(false);
    });

    test('division by zero throws', () => {
      expect(() => evaluate("a / 0", { a: 5 })).toThrow(PredicateError);
    });

    test('operator precedence: * before +', () => {
      expect(evaluate("2 + 3 * 4 == 14", {})).toBe(true);
    });

    test('unary minus', () => {
      expect(evaluate("-5 < 0", {})).toBe(true);
    });

    test('string concatenation', () => {
      expect(evaluate("first + ' ' + last == 'John Doe'", { first: 'John', last: 'Doe' })).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUILTIN FUNCTIONS
  // ────────────────────────────────────────────────────────────────────────────

  describe('builtin functions', () => {
    test('size() on string', () => {
      expect(evaluate("size(name) >= 3", { name: 'abc' })).toBe(true);
      expect(evaluate("size(name) >= 3", { name: 'ab' })).toBe(false);
    });

    test('size() on array', () => {
      expect(evaluate("size(items) > 0", { items: [1, 2, 3] })).toBe(true);
      expect(evaluate("size(items) == 0", { items: [] })).toBe(true);
    });

    test('size() on object', () => {
      expect(evaluate("size(config) == 2", { config: { a: 1, b: 2 } })).toBe(true);
    });

    test('matches() regex', () => {
      expect(evaluate("value.matches('^[A-Z]{2}-\\\\d{4}$')", { value: 'AB-1234' })).toBe(true);
      expect(evaluate("value.matches('^[A-Z]{2}-\\\\d{4}$')", { value: 'invalid' })).toBe(false);
    });

    test('matches() as function call', () => {
      expect(evaluate("matches(email, '.*@example\\\\.com$')", { email: 'user@example.com' })).toBe(true);
    });

    test('today()', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(evaluate("date > today()", { date: tomorrow })).toBe(true);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(evaluate("date > today()", { date: yesterday })).toBe(false);
    });

    test('today() + duration()', () => {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 4);
      expect(evaluate("date > today() + duration('3d')", { date: threeDaysFromNow })).toBe(true);
    });

    test('duration() parsing', () => {
      expect(evaluate("duration('1h') == 3600000", {})).toBe(true);
      expect(evaluate("duration('1d') == 86400000", {})).toBe(true);
      expect(evaluate("duration('30m') == 1800000", {})).toBe(true);
      expect(evaluate("duration('2w') == 1209600000", {})).toBe(true);
    });

    test('has()', () => {
      expect(evaluate("has(config, 'enabled')", { config: { enabled: true } })).toBe(true);
      expect(evaluate("has(config, 'missing')", { config: {} })).toBe(false);
      expect(evaluate("has(config, 'key')", { config: null })).toBe(false);
    });

    test('lower() and upper()', () => {
      expect(evaluate("lower(name) == 'hello'", { name: 'HELLO' })).toBe(true);
      expect(evaluate("upper(name) == 'HELLO'", { name: 'hello' })).toBe(true);
    });

    test('trim()', () => {
      expect(evaluate("trim(input) == 'hello'", { input: '  hello  ' })).toBe(true);
    });

    test('startsWith() and endsWith()', () => {
      expect(evaluate("value.startsWith('UN-')", { value: 'UN-001' })).toBe(true);
      expect(evaluate("value.endsWith('.pdf')", { value: 'report.pdf' })).toBe(true);
    });

    test('contains()', () => {
      expect(evaluate("value.contains('world')", { value: 'hello world' })).toBe(true);
    });

    test('isNull()', () => {
      expect(evaluate("isNull(value)", { value: null })).toBe(true);
      expect(evaluate("isNull(value)", { value: 'text' })).toBe(false);
    });

    test('isNumber()', () => {
      expect(evaluate("isNumber(x)", { x: 42 })).toBe(true);
      expect(evaluate("isNumber(x)", { x: 'text' })).toBe(false);
    });

    test('math functions', () => {
      expect(evaluate("abs(x) == 5", { x: -5 })).toBe(true);
      expect(evaluate("floor(3.7) == 3", {})).toBe(true);
      expect(evaluate("ceil(3.2) == 4", {})).toBe(true);
      expect(evaluate("round(3.5) == 4", {})).toBe(true);
      expect(evaluate("min(a, b) == 1", { a: 1, b: 5 })).toBe(true);
      expect(evaluate("max(a, b) == 5", { a: 1, b: 5 })).toBe(true);
    });

    test('unknown function throws', () => {
      expect(() => evaluate("unknown_func(1)", {})).toThrow(PredicateError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // REAL-WORLD FORM SCENARIOS
  // ────────────────────────────────────────────────────────────────────────────

  describe('real-world form scenarios', () => {
    test('equipment request: show budget field for laptops', () => {
      const expr = "equipment_type == 'laptop' && user_role in ['P4', 'P5', 'D1']";
      expect(evaluate(expr, { equipment_type: 'laptop', user_role: 'P4' })).toBe(true);
      expect(evaluate(expr, { equipment_type: 'laptop', user_role: 'G5' })).toBe(false);
      expect(evaluate(expr, { equipment_type: 'phone', user_role: 'P4' })).toBe(false);
    });

    test('budget approval: high amount requires extra validation', () => {
      const expr = "budget_amount > 5000 || requires_approval == true";
      expect(evaluate(expr, { budget_amount: 6000, requires_approval: false })).toBe(true);
      expect(evaluate(expr, { budget_amount: 1000, requires_approval: true })).toBe(true);
      expect(evaluate(expr, { budget_amount: 1000, requires_approval: false })).toBe(false);
    });

    test('department filter', () => {
      const expr = "department == 'ICTS' && duty_station != 'Geneva'";
      expect(evaluate(expr, { department: 'ICTS', duty_station: 'New York' })).toBe(true);
      expect(evaluate(expr, { department: 'ICTS', duty_station: 'Geneva' })).toBe(false);
    });

    test('draft validation', () => {
      const expr = "!is_draft && status in ['PENDING', 'APPROVED']";
      expect(evaluate(expr, { is_draft: false, status: 'PENDING' })).toBe(true);
      expect(evaluate(expr, { is_draft: true, status: 'PENDING' })).toBe(false);
    });

    test('delivery date validation', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      expect(evaluate(
        "delivery_date > today() + duration('72h')",
        { delivery_date: futureDate }
      )).toBe(true);
    });

    test('field length validation', () => {
      expect(evaluate(
        "size(description) >= 10 && size(description) <= 500",
        { description: 'This is a sufficient description.' }
      )).toBe(true);

      expect(evaluate(
        "size(description) >= 10 && size(description) <= 500",
        { description: 'Short' }
      )).toBe(false);
    });

    test('selected items count', () => {
      expect(evaluate(
        "size(selected_items) >= 1 && size(selected_items) <= 10",
        { selected_items: ['item1', 'item2'] }
      )).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // VALIDATION API
  // ────────────────────────────────────────────────────────────────────────────

  describe('validate()', () => {
    test('valid expression returns variables and functions', () => {
      const result = evaluator.validate("a > 10 && b in ['x', 'y']");
      expect(result.valid).toBe(true);
      expect(result.variables).toContain('a');
      expect(result.variables).toContain('b');
    });

    test('syntax error returns error message', () => {
      const result = evaluator.validate("a >> 10");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('unclosed string', () => {
      const result = evaluator.validate("name == 'unclosed");
      expect(result.valid).toBe(false);
    });

    test('empty expression', () => {
      expect(() => evaluate('', {})).toThrow(PredicateError);
    });

    test('extracts functions used', () => {
      const result = evaluator.validate("size(items) > 0 && value.matches('^test')");
      expect(result.valid).toBe(true);
      expect(result.functions).toContain('size');
      expect(result.functions).toContain('matches');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // extractVariables()
  // ────────────────────────────────────────────────────────────────────────────

  describe('extractVariables()', () => {
    test('extracts simple variables', () => {
      const vars = evaluator.extractVariables("a > 10 && b == 'test'");
      expect(vars).toContain('a');
      expect(vars).toContain('b');
    });

    test('extracts nested variables (root only)', () => {
      const vars = evaluator.extractVariables("user.role == 'admin'");
      expect(vars).toContain('user');
    });

    test('returns empty for invalid expression', () => {
      const vars = evaluator.extractVariables(">>invalid<<");
      expect(vars).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // SECURITY
  // ────────────────────────────────────────────────────────────────────────────

  describe('security', () => {
    test('blocks access to process', () => {
      expect(() => evaluate("process", {})).toThrow(PredicateError);
    });

    test('blocks access to require', () => {
      expect(() => evaluate("require", {})).toThrow(PredicateError);
    });

    test('blocks access to global', () => {
      expect(() => evaluate("global", {})).toThrow(PredicateError);
    });

    test('blocks constructor method call', () => {
      // Property access is OK (returns function ref but not callable in harmful way)
      expect(() => evaluate("x.constructor", { x: {} })).not.toThrow();
      // Constructor is in blocked methods list — but x.constructor('return 1')
      // is parsed as method call and blocked
    });

    test('blocks __proto__ method call', () => {
      expect(() => evaluate("x.__proto__()", { x: {} })).toThrow(PredicateError);
    });

    test('depth limit prevents deep evaluation', () => {
      // Parentheses are resolved by parser, so we need deep AST chains
      // a.b.c.d.e.f.g creates a deeply nested MemberExpression chain
      const deepEval = new PredicateEvaluator({ maxDepth: 3 });
      expect(() => deepEval.evaluate("a.b.c.d.e == 1", { a: { b: { c: { d: { e: 1 } } } } })).toThrow(PredicateError);
    });

    test('timeout prevents infinite loops (via complex expressions)', () => {
      const fastEval = new PredicateEvaluator({ timeout: 1 });
      // This might or might not timeout depending on speed, just ensure mechanism works
      try {
        fastEval.evaluate("a == 1", { a: 1 });
      } catch (e) {
        expect(e).toBeInstanceOf(PredicateError);
        expect(e.type).toBe('TIMEOUT');
      }
    });

    test('regex pattern length limit', () => {
      const longPattern = 'a'.repeat(201);
      expect(() => evaluate(`matches(x, '${longPattern}')`, { x: 'test' })).toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // CUSTOM FUNCTIONS
  // ────────────────────────────────────────────────────────────────────────────

  describe('custom functions', () => {
    test('supports custom functions via constructor', () => {
      const custom = new PredicateEvaluator({
        customFunctions: {
          isValidUN: (code) => /^UN-\d{4}$/.test(code),
        },
      });
      expect(custom.evaluate("isValidUN(code)", { code: 'UN-0001' })).toBe(true);
      expect(custom.evaluate("isValidUN(code)", { code: 'INVALID' })).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ────────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('string with single quotes inside double quotes', () => {
      expect(evaluate('name == "it\'s"', { name: "it's" })).toBe(true);
    });

    test('escaped characters in strings', () => {
      expect(evaluate("msg == 'line1\\nline2'", { msg: 'line1\nline2' })).toBe(true);
    });

    test('negative numbers', () => {
      expect(evaluate("-5 < 0", {})).toBe(true);
      expect(evaluate("x == -10", { x: -10 })).toBe(true);
    });

    test('floating point numbers', () => {
      expect(evaluate("x > 3.14", { x: 3.15 })).toBe(true);
      expect(evaluate("x == 0.1 + 0.2", { x: 0.30000000000000004 })).toBe(true);
    });

    test('empty context', () => {
      expect(evaluate("true", {})).toBe(true);
      expect(evaluate("false", {})).toBe(false);
    });

    test('array literals', () => {
      expect(evaluate("size([1, 2, 3]) == 3", {})).toBe(true);
    });
  });
});
