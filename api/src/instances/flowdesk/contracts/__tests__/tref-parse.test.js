'use strict';

/**
 * IP-0a test — trefCondition handling at the reducer boundary.
 *
 * The regression this locks down: a compound condition used to *match* the old
 * lenient regex and be mis-parsed into a garbage literal, so the comparison came
 * out false and the slot silently disappeared from the dialogue. A broken
 * condition must be distinguishable from a condition that says "no".
 *
 * IP-0b widened the grammar, so a compound condition is now valid and must
 * evaluate correctly rather than be rejected — the regression assertion moved
 * from "throws" to "gets the right answer". Grammar coverage lives in
 * tref-parser.test.js; this file guards the reducer's re-export surface.
 */

const { evalTref, parseTref, TrefParseError } = require('../draft-sr.reducer');

const ctx = {
  slots: { badgeType: 'temporary', count: 3, urgent: true, empty: '' },
  service: { approvalRequired: true },
};

describe('IP-0a: the reducer still exposes tref evaluation', () => {
  test('absent or empty condition means the slot always applies', () => {
    expect(evalTref(undefined, ctx)).toBe(true);
    expect(evalTref(null, ctx)).toBe(true);
    expect(evalTref('', ctx)).toBe(true);
    expect(evalTref('   ', ctx)).toBe(true);
  });

  test('the golden-fixture conditions evaluate as before', () => {
    expect(evalTref("slots.badgeType != 'permanent'", ctx)).toBe(true);
    expect(evalTref("slots.badgeType == 'permanent'", ctx)).toBe(false);
    expect(evalTref('service.approvalRequired == true', ctx)).toBe(true);
  });

  test('literals cover quoted strings, numbers and booleans', () => {
    expect(evalTref('slots.count == 3', ctx)).toBe(true);
    expect(evalTref('slots.urgent == true', ctx)).toBe(true);
    expect(evalTref("slots.empty == ''", ctx)).toBe(true);
    expect(evalTref('slots.badgeType == "temporary"', ctx)).toBe(true);
  });

  test('an unfilled slot compares as undefined rather than throwing', () => {
    expect(evalTref("slots.notFilled == 'x'", ctx)).toBe(false);
    expect(evalTref("slots.notFilled != 'x'", ctx)).toBe(true);
  });

  test('parseTref is re-exported and returns the AST', () => {
    expect(parseTref("slots.badgeType != 'permanent'")).toEqual({
      type: 'comparison',
      left: { type: 'path', segments: ['slots', 'badgeType'] },
      op: '!=',
      right: 'permanent',
    });
  });
});

describe('IP-0a: the silent-drop regression stays closed', () => {
  test('THE REGRESSION — a compound condition is answered correctly, never mis-parsed', () => {
    const compound = "slots.badgeType == 'temporary' && slots.count == 3";

    // Both clauses are true against ctx. The original evaluator returned false
    // here — it mis-parsed the RHS into the literal `temporary' && slots.count == 3`
    // — and the slot silently vanished from the dialogue. IP-0a made that throw;
    // IP-0b makes it evaluate. Either is acceptable; a silent false is not.
    expect(evalTref(compound, ctx)).toBe(true);
    expect(evalTref("slots.badgeType == 'temporary' && slots.count == 9", ctx)).toBe(false);
  });

  test('a malformed condition throws instead of returning a verdict', () => {
    expect(() => evalTref('slots.a @ 5', ctx)).toThrow(TrefParseError);
    expect(() => evalTref('just some prose', ctx)).toThrow(TrefParseError);
    expect(() => evalTref("slots.a == 'unterminated", ctx)).toThrow(TrefParseError);
  });

  test('the error carries the offending condition and a reason', () => {
    try {
      evalTref('slots.a @ 5', ctx);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TrefParseError);
      expect(err.condition).toBe('slots.a @ 5');
      expect(err.reason).toBeTruthy();
    }
  });

  test('a quoted string may contain spaces and punctuation', () => {
    const ctx2 = { slots: { os: 'macOS Sonoma (v14.x)' } };
    expect(evalTref("slots.os == 'macOS Sonoma (v14.x)'", ctx2)).toBe(true);
    expect(evalTref("slots.os == 'Windows 11 Enterprise (LTSB)'", ctx2)).toBe(false);
  });
});
