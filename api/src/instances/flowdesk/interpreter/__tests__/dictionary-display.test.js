'use strict';

/**
 * SCH-004 — a dictionary value shown the way Altiora shows it.
 *
 * A dictionary-backed field stores a KEY and displays a LABEL, and the label is not
 * one column: Altiora composes it from every display column of the row, each with a
 * literal prefix and suffix, each able to start a new line. We showed the stored
 * value — a number where the reader expects a name, in the confirmation summary,
 * which is the last thing read before a request is sent.
 *
 * Measured before building: of the 76 live schemas, 10 fields are dictionary-backed
 * and NONE carries extra display columns or display metadata. So the multi-column
 * paths below are unexercised in production today. They are ported anyway, because a
 * composition that quietly ignored metadata the schema may carry tomorrow is exactly
 * the silent divergence this module exists to end.
 */

const { composeDictionaryDisplay, displayForValue } = require('../dictionary-display');

describe("the row's label, composed as Altiora composes it", () => {
  const values = { c1: '10001103', c2: 'James NDEMEZO', c3: '' };

  test('one column is just that column — the case the live catalogue actually has', () => {
    expect(composeDictionaryDisplay(values, ['c2'])).toBe('James NDEMEZO');
  });

  test('several columns are joined by a space, in display order', () => {
    expect(composeDictionaryDisplay(values, ['c1', 'c2'])).toBe('10001103 James NDEMEZO');
  });

  test('a prefix and a suffix are literal text around the value', () => {
    const meta = { c1: { prefix: '#' }, c2: { prefix: '— ', suffix: ' (payee)' } };
    expect(composeDictionaryDisplay(values, ['c1', 'c2'], meta))
      .toBe('#10001103 — James NDEMEZO (payee)');
  });

  test('a column marked lineBreakBefore starts a new line', () => {
    expect(composeDictionaryDisplay(values, ['c1', 'c2'], { c2: { lineBreakBefore: true } }))
      .toBe('10001103\nJames NDEMEZO');
  });

  test('an empty column with no decoration contributes nothing', () => {
    expect(composeDictionaryDisplay(values, ['c1', 'c3', 'c2'])).toBe('10001103 James NDEMEZO');
  });

  test('an empty column WITH a prefix still appears — because that is what Altiora does', () => {
    // I expected this to be dropped and wrote the test that way; the port disagreed.
    // Altiora keeps the piece when `${prefix}${value}${suffix}`.trim() is non-empty,
    // so a decorated empty column shows its decoration. It looks like a defect and
    // may be one, but the requirement is that our display be IDENTICAL to theirs —
    // "improving" it here is how two renderings of one row start to differ.
    expect(composeDictionaryDisplay(values, ['c1', 'c3', 'c2'], { c3: { prefix: '— ' } }))
      .toBe('10001103 —  James NDEMEZO');
  });

  test('the first non-empty column never gets a leading separator', () => {
    expect(composeDictionaryDisplay(values, ['c3', 'c2'], { c2: { lineBreakBefore: true } }))
      .toBe('James NDEMEZO');
  });

  test('no columns is an empty string, not the word undefined', () => {
    expect(composeDictionaryDisplay(values, [])).toBe('');
    expect(composeDictionaryDisplay(null, ['c1'])).toBe('');
  });
});

describe('what a filled slot shows', () => {
  test('the label the dictionary gave, when the value is a key', () => {
    // The defect in one line: the draft holds "10001103"; the reader needs the name.
    expect(displayForValue('10001103', {}, { display: 'James NDEMEZO' })).toBe('James NDEMEZO');
  });

  test("an enum shows its option's label, not the code stored", () => {
    const slot = { presentOptions: [{ value: 'PNR', label: 'Payment not received' }] };
    expect(displayForValue('PNR', slot)).toBe('Payment not received');
  });

  test('a plain value is shown as itself', () => {
    expect(displayForValue('Geneva')).toBe('Geneva');
    expect(displayForValue(42)).toBe('42');
  });

  test('a directory user shows their name', () => {
    expect(displayForValue({ userId: 'u1', name: 'Maria Silva' })).toBe('Maria Silva');
  });

  test('…and falls back to the parts when there is no single name', () => {
    expect(displayForValue({ id: 'u2', firstName: 'Ana', lastName: 'Costa' })).toBe('Ana Costa');
  });

  test('a list shows every entry, each in its own right', () => {
    expect(displayForValue([{ userId: 'u1', name: 'A B' }, { userId: 'u2', name: 'C D' }]))
      .toBe('A B, C D');
  });

  test('an empty value is empty, never "null"', () => {
    expect(displayForValue(null)).toBe('');
    expect(displayForValue('')).toBe('');
  });

  test('the captured label wins over the option table — it is what was really said', () => {
    const slot = { presentOptions: [{ value: 'X', label: 'stale label' }] };
    expect(displayForValue('X', slot, { display: 'what the dictionary returned' }))
      .toBe('what the dictionary returned');
  });
});
