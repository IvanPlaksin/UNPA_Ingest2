/**
 * ExpressionSandbox Tests
 *
 * Tests for secure JavaScript expression evaluation.
 *
 * @module runtime/safety/__tests__/ExpressionSandbox.test
 */

const {
  ExpressionSandbox,
  DEFAULT_CONFIG,
  deepFreeze,
  getByPath,
  hasPath,
  getLength,
  matchPattern
} = require('../ExpressionSandbox');

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ExpressionSandbox - Helper Functions', () => {
  describe('deepFreeze', () => {
    it('freezes simple objects', () => {
      const obj = { a: 1, b: 2 };
      const frozen = deepFreeze(obj);
      expect(Object.isFrozen(frozen)).toBe(true);
    });

    it('freezes nested objects', () => {
      const obj = { a: { b: { c: 1 } } };
      const frozen = deepFreeze(obj);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.a)).toBe(true);
      expect(Object.isFrozen(frozen.a.b)).toBe(true);
    });

    it('freezes arrays', () => {
      const arr = [1, 2, { a: 1 }];
      const frozen = deepFreeze(arr);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen[2])).toBe(true);
    });

    it('handles null and primitives', () => {
      expect(deepFreeze(null)).toBe(null);
      expect(deepFreeze(42)).toBe(42);
      expect(deepFreeze('str')).toBe('str');
    });

    it('respects maxDepth', () => {
      const obj = { a: { b: { c: { d: 1 } } } };
      const frozen = deepFreeze(obj, 0, 2);
      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.a)).toBe(true);
      expect(Object.isFrozen(frozen.a.b)).toBe(true);
      // Beyond maxDepth, not frozen
      expect(Object.isFrozen(frozen.a.b.c)).toBe(false);
    });
  });

  describe('getByPath', () => {
    const obj = {
      a: 1,
      nested: { value: 42 },
      items: [{ name: 'first' }, { name: 'second' }]
    };

    it('gets top-level property', () => {
      expect(getByPath(obj, 'a')).toBe(1);
    });

    it('gets nested property', () => {
      expect(getByPath(obj, 'nested.value')).toBe(42);
    });

    it('gets array index', () => {
      expect(getByPath(obj, 'items[0].name')).toBe('first');
      expect(getByPath(obj, 'items[1].name')).toBe('second');
    });

    it('returns default for missing path', () => {
      expect(getByPath(obj, 'missing')).toBe(undefined);
      expect(getByPath(obj, 'missing', 'default')).toBe('default');
    });

    it('returns default for null/undefined object', () => {
      expect(getByPath(null, 'a', 'default')).toBe('default');
      expect(getByPath(undefined, 'a', 'default')).toBe('default');
    });

    it('returns default for invalid path', () => {
      expect(getByPath(obj, null, 'default')).toBe('default');
      expect(getByPath(obj, '', 'default')).toBe('default');
    });

    it('returns default for non-array index access', () => {
      expect(getByPath(obj, 'a[0]', 'default')).toBe('default');
    });
  });

  describe('hasPath', () => {
    const obj = {
      a: 1,
      nested: { value: 42, empty: null },
      items: [1, 2, 3]
    };

    it('returns true for existing paths', () => {
      expect(hasPath(obj, 'a')).toBe(true);
      expect(hasPath(obj, 'nested.value')).toBe(true);
      expect(hasPath(obj, 'nested.empty')).toBe(true);
      expect(hasPath(obj, 'items[0]')).toBe(true);
    });

    it('returns false for missing paths', () => {
      expect(hasPath(obj, 'missing')).toBe(false);
      expect(hasPath(obj, 'nested.missing')).toBe(false);
      expect(hasPath(obj, 'items[10]')).toBe(false);
    });

    it('returns false for null/undefined object', () => {
      expect(hasPath(null, 'a')).toBe(false);
      expect(hasPath(undefined, 'a')).toBe(false);
    });

    it('returns false for invalid path', () => {
      expect(hasPath(obj, null)).toBe(false);
      expect(hasPath(obj, '')).toBe(false);
    });
  });

  describe('getLength', () => {
    it('returns array length', () => {
      expect(getLength([1, 2, 3])).toBe(3);
      expect(getLength([])).toBe(0);
    });

    it('returns string length', () => {
      expect(getLength('hello')).toBe(5);
      expect(getLength('')).toBe(0);
    });

    it('returns object keys count', () => {
      expect(getLength({ a: 1, b: 2 })).toBe(2);
      expect(getLength({})).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
      expect(getLength(null)).toBe(0);
      expect(getLength(undefined)).toBe(0);
    });

    it('returns 0 for primitives', () => {
      expect(getLength(42)).toBe(0);
      expect(getLength(true)).toBe(0);
    });
  });

  describe('matchPattern', () => {
    it('matches valid patterns', () => {
      expect(matchPattern('hello world', '^hello')).toBe(true);
      expect(matchPattern('hello world', 'world$')).toBe(true);
      expect(matchPattern('test123', '\\d+')).toBe(true);
    });

    it('returns false for non-matches', () => {
      expect(matchPattern('hello', '^world')).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(matchPattern(123, '\\d+')).toBe(false);
      expect(matchPattern(null, '.*')).toBe(false);
    });

    it('returns false for invalid regex', () => {
      expect(matchPattern('test', '[invalid')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESSION SANDBOX TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ExpressionSandbox', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = new ExpressionSandbox();
  });

  describe('Construction', () => {
    it('uses default config', () => {
      expect(sandbox.config.timeoutMs).toBe(DEFAULT_CONFIG.timeoutMs);
      expect(sandbox.config.maxOutputSize).toBe(DEFAULT_CONFIG.maxOutputSize);
    });

    it('accepts custom config', () => {
      const custom = new ExpressionSandbox({ timeoutMs: 500 });
      expect(custom.config.timeoutMs).toBe(500);
    });
  });

  describe('evaluate - Basic Expressions', () => {
    it('evaluates arithmetic', () => {
      expect(sandbox.evaluate('2 + 2')).toBe(4);
      expect(sandbox.evaluate('10 * 5')).toBe(50);
      expect(sandbox.evaluate('Math.pow(2, 3)')).toBe(8);
    });

    it('evaluates boolean expressions', () => {
      expect(sandbox.evaluate('true && false')).toBe(false);
      expect(sandbox.evaluate('5 > 3')).toBe(true);
    });

    it('evaluates string operations', () => {
      expect(sandbox.evaluate('"hello".toUpperCase()')).toBe('HELLO');
      expect(sandbox.evaluate('"abc".length')).toBe(3);
    });

    it('evaluates JSON operations', () => {
      expect(sandbox.evaluate('JSON.parse("{}")')).toEqual({});
      expect(sandbox.evaluate('JSON.stringify({a:1})')).toBe('{"a":1}');
    });

    it('throws for non-string expression', () => {
      expect(() => sandbox.evaluate(123)).toThrow('Expression must be a string');
    });
  });

  describe('evaluate - Context Access', () => {
    it('accesses data context', () => {
      const context = { data: { count: 10 } };
      expect(sandbox.evaluate('data.count > 5', context)).toBe(true);
      expect(sandbox.evaluate('data.count', context)).toBe(10);
    });

    it('accesses input context', () => {
      const context = { input: { text: 'hello' } };
      expect(sandbox.evaluate('input.text', context)).toBe('hello');
    });

    it('accesses output context', () => {
      const context = { output: { result: 42 } };
      expect(sandbox.evaluate('output.result', context)).toBe(42);
    });

    it('accesses variables context', () => {
      const context = { variables: { counter: 5 } };
      expect(sandbox.evaluate('variables.counter', context)).toBe(5);
    });

    it('accesses iteration', () => {
      const context = { iteration: 3 };
      expect(sandbox.evaluate('iteration', context)).toBe(3);
    });
  });

  describe('evaluate - Utility Functions', () => {
    it('$has checks path existence', () => {
      const context = { data: { nested: { field: 1 } } };
      expect(sandbox.evaluate('$has(data, "nested.field")', context)).toBe(true);
      expect(sandbox.evaluate('$has(data, "nested.missing")', context)).toBe(false);
    });

    it('$get retrieves path with default', () => {
      const context = { data: { nested: { value: 42 } } };
      expect(sandbox.evaluate('$get(data, "nested.value")', context)).toBe(42);
      expect(sandbox.evaluate('$get(data, "nested.missing", "default")', context)).toBe('default');
    });

    it('$len returns length', () => {
      const context = { data: { items: [1, 2, 3] } };
      expect(sandbox.evaluate('$len(data.items)', context)).toBe(3);
    });

    it('$type returns typeof', () => {
      const context = { data: { num: 42, str: 'hi', arr: [] } };
      expect(sandbox.evaluate('$type(data.num)', context)).toBe('number');
      expect(sandbox.evaluate('$type(data.str)', context)).toBe('string');
      expect(sandbox.evaluate('$type(data.arr)', context)).toBe('object');
    });

    it('$match tests regex', () => {
      const context = { data: { text: 'Hello World' } };
      expect(sandbox.evaluate('$match(data.text, "^Hello")', context)).toBe(true);
      expect(sandbox.evaluate('$match(data.text, "^World")', context)).toBe(false);
    });

    it('$isEmpty checks emptiness', () => {
      const context = { data: { arr: [], str: '', obj: {}, val: 1 } };
      expect(sandbox.evaluate('$isEmpty(data.arr)', context)).toBe(true);
      expect(sandbox.evaluate('$isEmpty(data.str)', context)).toBe(true);
      expect(sandbox.evaluate('$isEmpty(data.obj)', context)).toBe(true);
      expect(sandbox.evaluate('$isEmpty(data.val)', context)).toBe(false);
      expect(sandbox.evaluate('$isEmpty(null)', context)).toBe(true);
    });

    it('$includes checks array membership', () => {
      const context = { data: { items: [1, 2, 3] } };
      expect(sandbox.evaluate('$includes(data.items, 2)', context)).toBe(true);
      expect(sandbox.evaluate('$includes(data.items, 5)', context)).toBe(false);
    });

    it('$some checks predicate on array', () => {
      const context = { data: { items: [1, 2, 3] } };
      expect(sandbox.evaluate('$some(data.items, x => x > 2)', context)).toBe(true);
      expect(sandbox.evaluate('$some(data.items, x => x > 5)', context)).toBe(false);
    });

    it('$every checks predicate on all', () => {
      const context = { data: { items: [2, 4, 6] } };
      expect(sandbox.evaluate('$every(data.items, x => x % 2 === 0)', context)).toBe(true);
      expect(sandbox.evaluate('$every(data.items, x => x > 3)', context)).toBe(false);
    });

    it('$min/$max find extremes', () => {
      expect(sandbox.evaluate('$min(1, 2, 3)')).toBe(1);
      expect(sandbox.evaluate('$max(1, 2, 3)')).toBe(3);
      expect(sandbox.evaluate('$min([5, 2, 8])')).toBe(2);
      expect(sandbox.evaluate('$max([5, 2, 8])')).toBe(8);
    });

    it('$sum calculates sum', () => {
      const context = { data: { nums: [1, 2, 3, 4] } };
      expect(sandbox.evaluate('$sum(data.nums)', context)).toBe(10);
      expect(sandbox.evaluate('$sum([])', context)).toBe(0);
    });

    it('$avg calculates average', () => {
      const context = { data: { nums: [2, 4, 6] } };
      expect(sandbox.evaluate('$avg(data.nums)', context)).toBe(4);
      expect(sandbox.evaluate('$avg([])', context)).toBe(0);
    });
  });

  describe('evaluate - Security', () => {
    it('blocks process access', () => {
      expect(() => sandbox.evaluate('process.exit()')).toThrow();
    });

    it('blocks require', () => {
      expect(() => sandbox.evaluate('require("fs")')).toThrow();
    });

    it('blocks global access', () => {
      expect(() => sandbox.evaluate('global.console')).toThrow();
    });

    it('blocks constructor chain escape', () => {
      expect(() =>
        sandbox.evaluate('this.constructor.constructor("return process")()')
      ).toThrow();
    });

    it('blocks Function constructor', () => {
      expect(() => sandbox.evaluate('new Function("return 1")()')).toThrow();
    });

    it('blocks eval from strings (codeGeneration disabled)', () => {
      expect(() => sandbox.evaluate('eval("1+1")')).toThrow();
    });

    it('context data is frozen - mutation throws', () => {
      const context = { data: { x: 1 } };
      expect(() => sandbox.evaluate('data.x = 5', context)).toThrow();
    });

    it('cannot add new properties to frozen context', () => {
      const context = { data: { x: 1 } };
      expect(() => sandbox.evaluate('data.y = 2', context)).toThrow();
    });
  });

  describe('evaluate - Timeout', () => {
    it('throws on infinite loop', () => {
      const fastSandbox = new ExpressionSandbox({ timeoutMs: 50 });
      expect(() => fastSandbox.evaluate('while(true){}')).toThrow(/timeout/i);
    });

    it('throws on long computation', () => {
      const fastSandbox = new ExpressionSandbox({ timeoutMs: 50 });
      expect(() =>
        fastSandbox.evaluate('let x=0;for(let i=0;i<1e9;i++)x+=i;x')
      ).toThrow(/timeout/i);
    });
  });

  describe('evaluateCondition', () => {
    it('casts result to boolean', () => {
      expect(sandbox.evaluateCondition('1')).toBe(true);
      expect(sandbox.evaluateCondition('0')).toBe(false);
      expect(sandbox.evaluateCondition('""')).toBe(false);
      expect(sandbox.evaluateCondition('"text"')).toBe(true);
      expect(sandbox.evaluateCondition('null')).toBe(false);
    });

    it('evaluates conditions with context', () => {
      const context = { data: { count: 10 } };
      expect(sandbox.evaluateCondition('data.count > 5', context)).toBe(true);
      expect(sandbox.evaluateCondition('data.count > 15', context)).toBe(false);
    });
  });

  describe('evaluateTemplate', () => {
    it('interpolates values', () => {
      const context = { data: { name: 'World' } };
      expect(sandbox.evaluateTemplate('Hello ${data.name}!', context)).toBe('Hello World!');
    });

    it('handles expressions in template', () => {
      const context = { data: { a: 2, b: 3 } };
      expect(sandbox.evaluateTemplate('Sum: ${data.a + data.b}', context)).toBe('Sum: 5');
    });

    it('converts result to string', () => {
      const context = { data: { num: 42 } };
      expect(sandbox.evaluateTemplate('Value: ${data.num}', context)).toBe('Value: 42');
    });

    it('throws for non-string template', () => {
      expect(() => sandbox.evaluateTemplate(123, {})).toThrow('Template must be a string');
    });
  });

  describe('validate', () => {
    it('returns valid for correct syntax', () => {
      expect(sandbox.validate('2 + 2')).toEqual({ valid: true });
      expect(sandbox.validate('x => x * 2')).toEqual({ valid: true });
    });

    it('returns invalid for syntax errors', () => {
      const result = sandbox.validate('2 + +');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns invalid for non-string', () => {
      const result = sandbox.validate(123);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Expression must be a string');
    });
  });

  describe('checkSafety', () => {
    it('returns safe for clean expressions', () => {
      expect(sandbox.checkSafety('data.count > 5')).toEqual({ safe: true, warnings: [] });
      expect(sandbox.checkSafety('$has(data, "field")')).toEqual({ safe: true, warnings: [] });
    });

    it('warns about eval', () => {
      const result = sandbox.checkSafety('eval("code")');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Use of eval() is forbidden');
    });

    it('warns about Function', () => {
      const result = sandbox.checkSafety('new Function("code")');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Direct Function constructor access is forbidden');
    });

    it('warns about require', () => {
      const result = sandbox.checkSafety('require("fs")');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Use of require() is forbidden');
    });

    it('warns about import', () => {
      const result = sandbox.checkSafety('import("module")');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Use of import is forbidden');
    });

    it('warns about process', () => {
      const result = sandbox.checkSafety('process.exit()');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Access to process is forbidden');
    });

    it('warns about global', () => {
      const result = sandbox.checkSafety('global.x');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Access to global is forbidden');
    });

    it('warns about setTimeout/setInterval', () => {
      const result1 = sandbox.checkSafety('setTimeout(fn, 100)');
      expect(result1.safe).toBe(false);
      expect(result1.warnings).toContain('Async functions are forbidden');

      const result2 = sandbox.checkSafety('setInterval(fn, 100)');
      expect(result2.safe).toBe(false);
    });

    it('warns about prototype chain manipulation', () => {
      const result = sandbox.checkSafety('obj.__proto__.x = 1');
      expect(result.safe).toBe(false);
      expect(result.warnings).toContain('Prototype chain manipulation is forbidden');
    });

    it('collects multiple warnings', () => {
      const result = sandbox.checkSafety('eval(require("fs"))');
      expect(result.safe).toBe(false);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Safe Built-ins', () => {
    it('provides Math functions', () => {
      expect(sandbox.evaluate('Math.floor(3.7)')).toBe(3);
      expect(sandbox.evaluate('Math.sqrt(16)')).toBe(4);
    });

    it('provides Array functions', () => {
      expect(sandbox.evaluate('Array.isArray([1,2])')).toBe(true);
      expect(sandbox.evaluate('Array.from("abc")')).toEqual(['a', 'b', 'c']);
    });

    it('provides Object functions', () => {
      expect(sandbox.evaluate('Object.keys({a:1,b:2})')).toEqual(['a', 'b']);
      expect(sandbox.evaluate('Object.values({a:1,b:2})')).toEqual([1, 2]);
    });

    it('provides Number/String/Boolean', () => {
      expect(sandbox.evaluate('Number("42")')).toBe(42);
      expect(sandbox.evaluate('String(42)')).toBe('42');
      expect(sandbox.evaluate('Boolean(1)')).toBe(true);
    });

    it('provides parseInt/parseFloat', () => {
      expect(sandbox.evaluate('parseInt("42")')).toBe(42);
      expect(sandbox.evaluate('parseFloat("3.14")')).toBe(3.14);
    });

    it('provides isNaN/isFinite', () => {
      expect(sandbox.evaluate('isNaN(NaN)')).toBe(true);
      expect(sandbox.evaluate('isFinite(100)')).toBe(true);
    });

    it('provides Date.now', () => {
      const now = Date.now();
      const result = sandbox.evaluate('Date.now()');
      expect(result).toBeGreaterThanOrEqual(now);
      expect(result).toBeLessThanOrEqual(now + 1000);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.timeoutMs).toBe(1000);
    expect(DEFAULT_CONFIG.maxOutputSize).toBe(1048576);
    expect(DEFAULT_CONFIG.maxDepth).toBe(100);
  });
});
