'use strict';

/**
 * "Got it. Amendment Type" — a label read out as a question.
 *
 * Someone who does not know what an amendment type is was handed the words they did
 * not understand, and nothing else. The guidance existed the whole time: it went onto
 * the CONTROL'S label, where it renders small or not at all, while the sentence the
 * person reads carried none of it.
 *
 * Measured before choosing between the two sources: 269 of 465 live slots (58%) carry
 * Altiora's own `description`/`placeholder`, and all 73 schemas carry generated field
 * meanings covering the rest. So neither source alone is enough and both together are
 * too much — they say the same thing twice, in a turn that has to stay short.
 */

const { questionWithGuidance, guidanceFor, oneSentence } = require('../field-guidance');

describe('which text explains a field', () => {
  test("Altiora's own words win — they are authored by whoever owns the service", () => {
    // And they sometimes state a RULE rather than a description, which a generated
    // paraphrase would quietly replace with a summary of it.
    const slot = {
      promptHint: 'Document number',
      helpText: 'If you do not know the Umoja document number, enter “-1”.',
      fieldMeaning: 'The reference number of the payment document.',
    };
    expect(guidanceFor(slot).full).toMatch(/enter “-1”/);
  });

  test('the generated meaning fills the gap where Altiora left none', () => {
    const slot = { promptHint: 'Amendment Type', fieldMeaning: 'Select the kind of change being made.' };
    expect(guidanceFor(slot).full).toBe('Select the kind of change being made.');
  });

  test('a field that explains itself gets nothing added', () => {
    expect(guidanceFor({ promptHint: 'Grant Number' })).toBeNull();
  });

  test('guidance that merely restates the label teaches nothing, so it is dropped', () => {
    expect(guidanceFor({ promptHint: 'Amount', helpText: 'Amount' })).toBeNull();
  });
});

describe('the question a person is actually asked', () => {
  test('names the field, then says what it is for', () => {
    const q = questionWithGuidance('Amendment Type', {
      promptHint: 'Amendment Type',
      fieldMeaning: 'Select the kind of change being made to the contribution agreement.',
    });
    expect(q).toBe('Amendment Type: Select the kind of change being made to the contribution agreement.');
  });

  test('is unchanged when there is nothing to add — which is what makes this safe everywhere', () => {
    expect(questionWithGuidance('Grant Number', { promptHint: 'Grant Number' })).toBe('Grant Number');
  });

  test('a question that already explains itself is left alone', () => {
    // Some Altiora labels are whole clauses; a second explanation on top reads as a
    // stutter.
    const long = 'If your request relates to a previously submitted request, please include the reference number';
    expect(questionWithGuidance(long, { promptHint: long, helpText: 'Include the reference number.' })).toBe(long);
  });

  test('a trailing question mark is not left stranded before the colon', () => {
    const q = questionWithGuidance('Are supporting documents attached?', {
      promptHint: 'Are supporting documents attached?',
      helpText: 'If you selected Yes, please ensure the documents are labeled.',
    });
    expect(q).toBe('Are supporting documents attached: If you selected Yes, please ensure the documents are labeled.');
  });
});

describe('length, because a question with a paragraph attached is not a question', () => {
  const para = 'Enter the Business Partner number associated with the payee in the Umoja system. '
    + 'This is normally found on the payment advice. If the payee is an external vendor the number '
    + 'begins with a 1, and for staff members it is the index number instead.';

  test('the message gets one sentence', () => {
    expect(oneSentence(para)).toBe('Enter the Business Partner number associated with the payee in the Umoja system.');
  });

  test('the control keeps the whole of it — the reader who wants detail is looking at the field', () => {
    const g = guidanceFor({ promptHint: 'BP or Index #', helpText: para });
    expect(g.full).toBe(para);
    expect(g.inline.length).toBeLessThan(para.length);
  });

  test('a long run of words with no sentence end is cut at a word, never mid-word', () => {
    const runOn = 'a'.repeat(3) + ' ' + Array.from({ length: 60 }, () => 'word').join(' ');
    const out = oneSentence(runOn);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  test('short guidance is passed through whole', () => {
    expect(oneSentence('Enter the amount.')).toBe('Enter the amount.');
  });

  test('nothing in, nothing out', () => {
    expect(oneSentence(null)).toBe('');
    expect(oneSentence('   ')).toBe('');
  });
});
