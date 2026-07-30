'use strict';

/**
 * HYB-006 — the arena's simulated user, clicking.
 *
 * Before this, only `choice` controls were clickable and every other widget was
 * answered in prose. Two consequences, both measured: the hybrid interpreter — whose
 * whole purpose is answering clicks without a model — received zero clicks in 20
 * arena turns (`free_text:17 not_fill_phase:3`), and runs A and B were scoring the
 * state machine and the agent on an input distribution production never produces.
 *
 * The tests below pin both halves of the contract: what a person WOULD do with each
 * widget, and the one thing that must stay un-simulated.
 */

const { clickFor, dateFrom, numberFrom, optionsFrom } = require('../persona-click');

const ctrl = (type, over = {}) => [{ id: 'c1', type, slotId: 'field1', ...over }];

describe('what a person does with the widget in front of them', () => {
  test('a text box takes the prose itself — it IS the answer, not a message about it', () => {
    const out = clickFor(ctrl('text'), 'WBS-2026-DT-014');
    expect(out.controlAction).toEqual({ slotId: 'field1', value: 'WBS-2026-DT-014' });
  });

  test('a textarea likewise, whole sentences and all', () => {
    const said = 'To complete the digital transformation project through 2027.';
    expect(clickFor(ctrl('textarea'), said).controlAction).toEqual({ slotId: 'field1', value: said });
  });

  test('a date picker commits an ISO date', () => {
    const out = clickFor(ctrl('date'), 'I would like it to start on 2026-09-01 if possible');
    expect(out.controlAction).toEqual({ action: 'date_select', slotId: 'field1', value: '2026-09-01' });
  });

  test('…and understands the way people actually write dates', () => {
    expect(clickFor(ctrl('date'), 'from 30/09/2026').controlAction.value).toBe('2026-09-30');
    expect(clickFor(ctrl('date'), 'due 1.10.2026').controlAction.value).toBe('2026-10-01');
  });

  test('a number box takes the number out of the sentence', () => {
    expect(clickFor(ctrl('number'), 'about 12 months in total').controlAction).toEqual({ slotId: 'field1', value: 12 });
  });

  test('a confirm is a click when the persona agrees', () => {
    expect(clickFor(ctrl('confirm'), 'Yes, that is correct').controlAction).toEqual({ slotId: 'field1', value: true });
    expect(clickFor(ctrl('confirm'), 'да, верно').controlAction).toEqual({ slotId: 'field1', value: true });
  });

  test('a toggle carries both answers, because both are clicks', () => {
    expect(clickFor(ctrl('toggle'), 'yes').controlAction).toEqual({ slotId: 'field1', value: true });
    expect(clickFor(ctrl('toggle'), 'no, not applicable').controlAction).toEqual({ slotId: 'field1', value: false });
  });

  test('a multi-select picks the options the persona named', () => {
    const options = [{ value: 'tor', label: 'Terms of Reference' }, { value: 'doa', label: 'Delegation of Authority' }];
    const out = clickFor(ctrl('multichoice', { options }), 'the Terms of Reference and the doa');
    expect(out.controlAction).toEqual({ action: 'multichoice_select', slotId: 'field1', values: ['tor', 'doa'] });
  });
});

describe('what it refuses to simulate, and says so', () => {
  test('a directory autocomplete: a pick is a real record, and inventing one fabricates data', () => {
    expect(clickFor(ctrl('autocomplete'), 'Maria Ivanova'))
      .toEqual({ controlAction: null, why: 'directory_needs_a_real_pick' });
  });

  test('declining a confirm means searching the directory — also un-simulable', () => {
    expect(clickFor(ctrl('confirm'), 'No, it is for a colleague'))
      .toEqual({ controlAction: null, why: 'declined_needs_a_real_pick' });
  });

  test('an answer with no date in it stays free text rather than becoming a made-up one', () => {
    expect(clickFor(ctrl('date'), 'as soon as possible please'))
      .toEqual({ controlAction: null, why: 'no_date_in_answer' });
  });

  test('an unclear yes stays free text — the model can ask again', () => {
    expect(clickFor(ctrl('confirm'), 'hmm, I am not sure what you mean'))
      .toEqual({ controlAction: null, why: 'unclear_confirm' });
  });

  test('an option nobody named is not guessed at', () => {
    const options = [{ value: 'tor', label: 'Terms of Reference' }];
    expect(clickFor(ctrl('multichoice', { options }), 'something else entirely'))
      .toEqual({ controlAction: null, why: 'no_option_matched' });
  });

  test('a fork control is not a field, and is handled by the runner as a choice', () => {
    const forks = [{ id: 'c', type: 'choice', slotId: '__service__', options: [{ value: 'X' }] }];
    expect(clickFor(forks, 'the first one')).toEqual({ controlAction: null, why: 'no_field_control' });
  });

  test('no controls at all, or nothing said', () => {
    expect(clickFor([], 'anything').controlAction).toBeNull();
    expect(clickFor(ctrl('text'), '   ').controlAction).toBeNull();
  });

  test('a widget type it has never met is refused by name, not by guess', () => {
    expect(clickFor(ctrl('hologram'), 'yes')).toEqual({ controlAction: null, why: 'unsupported_control:hologram' });
  });
});

describe('the parsers, on their own', () => {
  test('dateFrom prefers an explicit ISO date to a loose one', () => {
    expect(dateFrom('between 2026-09-01 and 30/09/2026')).toBe('2026-09-01');
  });

  test('dateFrom reads a loose date day-first, as every persona here writes it', () => {
    expect(dateFrom('01/10/2026')).toBe('2026-10-01');
  });

  test('numberFrom survives thousands separators and decimals', () => {
    expect(numberFrom('12 months')).toBe(12);
    expect(numberFrom('3,5 years')).toBe(3.5);
    expect(numberFrom('no digits here')).toBeNull();
  });

  test('optionsFrom matches on value or on label, case-insensitively', () => {
    const options = [{ value: 'RB', label: 'Regular Budget' }, { value: 'XB', label: 'Extra-budgetary' }];
    expect(optionsFrom('the regular budget', options)).toEqual(['RB']);
    expect(optionsFrom('xb please', options)).toEqual(['XB']);
  });
});
