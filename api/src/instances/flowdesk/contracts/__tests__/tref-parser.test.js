'use strict';

/**
 * IP-0b test — the tref grammar: parsing, evaluation, precedence, diagnostics.
 *
 * The hard requirement running through this file is zero fixture migration: every
 * condition already ratified in a golden SchemaSnapshot must parse and evaluate
 * exactly as it did under the IP-0a dialect. The new grammar is a strict superset.
 */

const {
  parse,
  evaluate,
  evalTref,
  validate,
  isEmpty,
  TrefParseError,
  _internals,
} = require('../tref-parser');

const ctx = {
  slots: {
    badgeType: 'temporary',
    licenseType: 'team',
    os: 'macOS Sonoma (v14.x)',
    storage: '512GB',
    count: 3,
    urgent: true,
    empty: '',
    checklist: '["a","b"]',
    emptyChecklist: '[]',
    realArray: ['x', 'y'],
  },
  service: { approvalRequired: true },
};

describe('IP-0b: backward compatibility — zero fixture migration', () => {
  // These three are the complete set of trefConditions in contracts/fixtures/.
  test.each([
    ["slots.badgeType != 'permanent'", true],
    ["slots.licenseType != 'individual'", true],
    ['service.approvalRequired == true', true],
  ])('golden fixture condition %s evaluates to %s', (condition, expected) => {
    expect(evalTref(condition, ctx)).toBe(expected);
  });

  test('a non-slots path still parses — the fixtures depend on service.*', () => {
    // The ratified EBNF sketched `path = 'slots.' identifier`, which would have
    // rejected schema-snapshot.hardware.json outright.
    expect(parse('service.approvalRequired == true')).toEqual({
      type: 'comparison',
      left: { type: 'path', segments: ['service', 'approvalRequired'] },
      op: '==',
      right: true,
    });
  });

  test('absent or empty condition means the slot always applies', () => {
    expect(evalTref(undefined, ctx)).toBe(true);
    expect(evalTref(null, ctx)).toBe(true);
    expect(evalTref('', ctx)).toBe(true);
    expect(evalTref('   ', ctx)).toBe(true);
  });

  test('an unfilled slot compares as undefined rather than throwing', () => {
    expect(evalTref("slots.notFilled == 'x'", ctx)).toBe(false);
    expect(evalTref("slots.notFilled != 'x'", ctx)).toBe(true);
  });
});

describe('IP-0b: equality and literals', () => {
  test.each([
    ["slots.badgeType == 'temporary'", true],
    ["slots.badgeType == 'permanent'", false],
    ["slots.badgeType != 'permanent'", true],
    ['slots.count == 3', true],
    ['slots.count != 4', true],
    ['slots.urgent == true', true],
    ['slots.urgent == false', false],
    ["slots.empty == ''", true],
    ['slots.badgeType == "temporary"', true],
  ])('%s → %s', (condition, expected) => {
    expect(evalTref(condition, ctx)).toBe(expected);
  });

  test('a quoted string keeps spaces and punctuation — real Altiora option values', () => {
    expect(evalTref("slots.os == 'macOS Sonoma (v14.x)'", ctx)).toBe(true);
    expect(evalTref("slots.os == 'Windows 11 Enterprise (LTSB)'", ctx)).toBe(false);
  });

  test('negative and decimal numbers', () => {
    const c = { slots: { temp: -2.5 } };
    expect(evalTref('slots.temp == -2.5', c)).toBe(true);
    expect(evalTref('slots.temp < 0', c)).toBe(true);
  });
});

describe('IP-0b: ordering operators', () => {
  test.each([
    ['slots.count > 2', true],
    ['slots.count > 3', false],
    ['slots.count >= 3', true],
    ['slots.count < 4', true],
    ['slots.count <= 3', true],
    ['slots.count <= 2', false],
  ])('%s → %s', (condition, expected) => {
    expect(evalTref(condition, ctx)).toBe(expected);
  });

  test('ordering against an unfilled or non-numeric slot is false, not a crash', () => {
    expect(evalTref('slots.notFilled > 2', ctx)).toBe(false);
    expect(evalTref('slots.badgeType > 2', ctx)).toBe(false);
  });
});

describe('IP-0b: string operators', () => {
  test.each([
    ["slots.os contains 'Sonoma'", true],
    ["slots.os contains 'Windows'", false],
    ["slots.os startsWith 'macOS'", true],
    ["slots.os startsWith 'Ubuntu'", false],
  ])('%s → %s', (condition, expected) => {
    expect(evalTref(condition, ctx)).toBe(expected);
  });

  test('contains sees through a checklist JSON-array string, as Altiora does', () => {
    expect(evalTref("slots.checklist contains 'a'", ctx)).toBe(true);
    expect(evalTref("slots.checklist contains 'z'", ctx)).toBe(false);
    expect(evalTref("slots.realArray contains 'x'", ctx)).toBe(true);
  });

  test('string operators on an unfilled slot are false', () => {
    expect(evalTref("slots.notFilled contains 'a'", ctx)).toBe(false);
    expect(evalTref("slots.notFilled startsWith 'a'", ctx)).toBe(false);
  });
});

describe('IP-0b: set membership', () => {
  test.each([
    ["slots.badgeType in ['temporary', 'contractor']", true],
    ["slots.badgeType in ['permanent']", false],
    ['slots.count in [1, 2, 3]', true],
    ["slots.badgeType in []", false],
  ])('%s → %s', (condition, expected) => {
    expect(evalTref(condition, ctx)).toBe(expected);
  });

  test("not_in is expressed with NOT, per the ratified mapping", () => {
    expect(evalTref("!(slots.badgeType in ['permanent'])", ctx)).toBe(true);
  });

  test('lhs-operator-rhs symmetry is enforced — the JS-ish form is rejected', () => {
    expect(() => parse("['a','b'].includes(slots.x)")).toThrow(TrefParseError);
  });
});

describe('IP-0b: is empty / is not empty', () => {
  test.each([
    ['slots.empty is empty', true],
    ['slots.badgeType is empty', false],
    ['slots.notFilled is empty', true],
    ['slots.emptyChecklist is empty', true],
    ['slots.checklist is empty', false],
    ['slots.badgeType is not empty', true],
    ['slots.empty is not empty', false],
  ])('%s → %s', (condition, expected) => {
    expect(evalTref(condition, ctx)).toBe(expected);
  });

  test('isEmpty is wider than falsiness — 0 and false are filled values', () => {
    // The reason `!slots.x` was rejected for is_empty: it would call a valid
    // zero or false "empty" and silently drop the slot.
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty('[]')).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty(null)).toBe(true);

    const c = { slots: { count: 0, flag: false } };
    expect(evalTref('slots.count is empty', c)).toBe(false);
    expect(evalTref('slots.flag is empty', c)).toBe(false);
  });
});

describe('IP-0b: boolean logic and precedence', () => {
  test('AND requires both sides', () => {
    expect(evalTref("slots.badgeType == 'temporary' && slots.count == 3", ctx)).toBe(true);
    expect(evalTref("slots.badgeType == 'temporary' && slots.count == 9", ctx)).toBe(false);
  });

  test('OR requires either side', () => {
    expect(evalTref("slots.badgeType == 'permanent' || slots.count == 3", ctx)).toBe(true);
    expect(evalTref("slots.badgeType == 'permanent' || slots.count == 9", ctx)).toBe(false);
  });

  test('NOT negates', () => {
    expect(evalTref("!(slots.badgeType == 'permanent')", ctx)).toBe(true);
    expect(evalTref("!(slots.badgeType == 'temporary')", ctx)).toBe(false);
  });

  test('AND binds tighter than OR', () => {
    // false || (true && true) === true. If OR bound tighter it would be
    // (false || true) && true — also true — so use a case that separates them:
    // true || (false && false) === true, but (true || false) && false === false.
    expect(evalTref("slots.count == 3 || slots.count == 9 && slots.count == 8", ctx)).toBe(true);
    expect(parse('a == 1 || b == 2 && c == 3')).toEqual({
      type: 'logical',
      op: '||',
      left: { type: 'comparison', left: { type: 'path', segments: ['a'] }, op: '==', right: 1 },
      right: {
        type: 'logical',
        op: '&&',
        left: { type: 'comparison', left: { type: 'path', segments: ['b'] }, op: '==', right: 2 },
        right: { type: 'comparison', left: { type: 'path', segments: ['c'] }, op: '==', right: 3 },
      },
    });
  });

  test('parentheses override precedence', () => {
    expect(evalTref("(slots.count == 3 || slots.count == 9) && slots.count == 8", ctx)).toBe(false);
  });

  test('the real Altiora multi-check AND rule now round-trips', () => {
    // FormRule { logic:'AND', checks:[os equals macOS, storage equals 512GB] }
    const condition = "slots.os == 'macOS Sonoma (v14.x)' && slots.storage == '512GB'";
    expect(evalTref(condition, ctx)).toBe(true);
  });

  test('nested logic', () => {
    expect(evalTref("(slots.count > 1 && slots.urgent == true) || slots.badgeType == 'permanent'", ctx)).toBe(true);
    expect(evalTref("!(slots.count > 1 && slots.urgent == true)", ctx)).toBe(false);
  });
});

describe('IP-0b: diagnostics', () => {
  test.each([
    ['', /expected a path/],                                  // parse('') — evalTref short-circuits, parse does not
    ['slots.badgeType', /expected a comparison operator/],
    ['just some prose', /expected a comparison operator/],
    ['slots.a ==', /expected a literal/],
    ["== 'x'", /expected a path/],
    ['slots.a == unquoted', /expected a literal/],
    ["slots.a == 'unterminated", /unterminated string literal/],
    ["slots['a'] == 'x'", /expected a comparison operator/],
    ['(slots.a == 1', /expected '\)'/],
    ["slots.a in 'notanarray'", /expected an array literal after 'in'/],
    ["slots.a == ['x']", /expected a scalar literal after '=='/],
    ["slots.a > 'text'", /expected a number after '>'/],
    ['slots.a contains 5', /expected a string after \'contains\'/],
    ['slots.a is', /expected 'empty'/],
    ['slots.a is not', /expected 'empty'/],
    ["slots.a == 'x' extra", /expected end of input/],
    // A bare path is not a boolean expression — the parser says so at the '&&'
    // rather than blaming whatever follows it.
    ['slots.a && ', /expected a comparison operator/],
    ['slots.a @ 5', /unexpected character/],
  ])('rejects %s', (condition, expectedMessage) => {
    expect(() => parse(condition)).toThrow(TrefParseError);
    expect(() => parse(condition)).toThrow(expectedMessage);
  });

  test('the error carries position, expected and found', () => {
    try {
      parse('slots.a == unquoted');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TrefParseError);
      expect(err.tref).toBe('slots.a == unquoted');
      expect(typeof err.position).toBe('number');
      expect(err.expected).toMatch(/literal/);
      expect(err.found).toBeTruthy();
    }
  });

  test('the IP-0a error shape still holds — condition and reason', () => {
    try {
      parse('slots.a @ 5');
    } catch (err) {
      expect(err.condition).toBe('slots.a @ 5');
      expect(err.reason).toBeTruthy();
    }
  });

  test('a non-string condition is rejected', () => {
    expect(() => parse(42)).toThrow(/expected a string condition/);
  });

  test('validate reports instead of throwing', () => {
    expect(validate("slots.a == 'x'")).toEqual({ valid: true });
    const bad = validate('slots.a @ 5');
    expect(bad.valid).toBe(false);
    expect(bad.error).toBeInstanceOf(TrefParseError);
  });
});

describe('IP-0b: memoization', () => {
  beforeEach(() => _internals.astCache.clear());

  test('the same string yields the same AST instance', () => {
    const a = parse("slots.badgeType == 'temporary'");
    const b = parse("slots.badgeType == 'temporary'");
    expect(a).toBe(b);
  });

  test('different strings yield different ASTs', () => {
    expect(parse("slots.a == 'x'")).not.toBe(parse("slots.b == 'x'"));
  });

  test('the cache is bounded', () => {
    for (let i = 0; i < 600; i++) parse(`slots.f${i} == ${i}`);
    expect(_internals.astCache.size).toBeLessThanOrEqual(500);
  });

  test('a rejected condition is not cached as valid', () => {
    expect(() => parse('slots.a @ 5')).toThrow(TrefParseError);
    expect(() => parse('slots.a @ 5')).toThrow(TrefParseError);
  });
});

describe('IP-0b: evaluate() on a prepared AST', () => {
  test('parse once, evaluate against many contexts', () => {
    const ast = parse("slots.badgeType == 'permanent'");
    expect(evaluate(ast, { slots: { badgeType: 'permanent' } })).toBe(true);
    expect(evaluate(ast, { slots: { badgeType: 'temporary' } })).toBe(false);
    expect(evaluate(ast, { slots: {} })).toBe(false);
  });

  test('evaluation is total — a missing context branch does not throw', () => {
    const ast = parse("slots.deep.nested.value == 'x'");
    expect(evaluate(ast, {})).toBe(false);
    expect(evaluate(ast, { slots: {} })).toBe(false);
  });
});
