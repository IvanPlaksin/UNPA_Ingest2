'use strict';

/**
 * HYB-006/007 — the arena's simulated user, acting on the widget in front of it.
 *
 * Before this, only `choice` controls were clickable and every other widget was
 * answered in prose. Two consequences, both measured: the hybrid interpreter — whose
 * whole purpose is answering clicks without a model — received zero clicks in 20
 * arena turns (`free_text:17 not_fill_phase:3`), and runs A and B were scoring the
 * state machine and the agent on an input distribution production never produces.
 *
 * The directory rule took a deadlock to get right, and both halves of it are pinned
 * here: a directory field is SEARCHED (what a person does), never INVENTED (what
 * would fabricate data). Refusing it outright — the first version — meant the persona
 * could never get past the duty-station question, and a form was never reached.
 */

const { clickFor, dateFrom, numberFrom, optionsFrom, queryFrom } = require('../persona-click');

const ctrl = (type, over = {}) => [{ id: 'c1', type, slotId: 'field1', ...over }];

/** A confirm as the interpreters build it for a directory field: a search underneath. */
const directoryConfirm = (kind = 'location') => [{
  id: 'c1', type: 'confirm', slotId: 'location', defaultValue: { name: 'Geneva' },
  children: [{ id: 'c1-search', type: 'autocomplete', slotId: 'location', source: { directory: kind } }],
}];

describe('what a person does with the widget in front of them', () => {
  test('a text box takes the prose itself — it IS the answer, not a message about it', async () => {
    const out = await clickFor(ctrl('text'), 'WBS-2026-DT-014');
    expect(out.controlAction).toEqual({ slotId: 'field1', value: 'WBS-2026-DT-014' });
  });

  test('a textarea likewise, whole sentences and all', async () => {
    const said = 'To complete the digital transformation project through 2027.';
    expect((await clickFor(ctrl('textarea'), said)).controlAction).toEqual({ slotId: 'field1', value: said });
  });

  test('a date picker commits an ISO date', async () => {
    const out = await clickFor(ctrl('date'), 'I would like it to start on 2026-09-01 if possible');
    expect(out.controlAction).toEqual({ action: 'date_select', slotId: 'field1', value: '2026-09-01' });
  });

  test('…and understands the way people actually write dates', async () => {
    expect((await clickFor(ctrl('date'), 'from 30/09/2026')).controlAction.value).toBe('2026-09-30');
    expect((await clickFor(ctrl('date'), 'due 1.10.2026')).controlAction.value).toBe('2026-10-01');
  });

  test('a number box takes the number out of the sentence', async () => {
    expect((await clickFor(ctrl('number'), 'about 12 months in total')).controlAction).toEqual({ slotId: 'field1', value: 12 });
  });

  test('agreement is read from the whole sentence, because a person does not answer "yes"', async () => {
    // Live twice: "Form Completer, 123456 — that's me. Confirm." was read as a
    // DECLINE, because the interpreters' affirmative test is anchored to the start of
    // the message. The assistant then asked the same question five turns running.
    const said = "Form Completer, 123456 — that's me. Confirm.";
    expect((await clickFor(ctrl('confirm'), said)).controlAction).toEqual({ slotId: 'field1', value: true });
    expect((await clickFor(ctrl('confirm'), 'Geneva is correct, proceed')).controlAction).toEqual({ slotId: 'field1', value: true });
  });

  test('a confirm is a click when the persona agrees', async () => {
    expect((await clickFor(ctrl('confirm'), 'Yes, that is correct')).controlAction).toEqual({ slotId: 'field1', value: true });
    expect((await clickFor(ctrl('confirm'), 'да, верно')).controlAction).toEqual({ slotId: 'field1', value: true });
  });

  test('a toggle carries both answers, because both are clicks', async () => {
    expect((await clickFor(ctrl('toggle'), 'yes')).controlAction).toEqual({ slotId: 'field1', value: true });
    expect((await clickFor(ctrl('toggle'), 'no, not applicable')).controlAction).toEqual({ slotId: 'field1', value: false });
  });

  test('a multi-select picks the options the persona named', async () => {
    const options = [{ value: 'tor', label: 'Terms of Reference' }, { value: 'doa', label: 'Delegation of Authority' }];
    const out = await clickFor(ctrl('multichoice', { options }), 'the Terms of Reference and the doa');
    expect(out.controlAction).toEqual({ action: 'multichoice_select', slotId: 'field1', values: ['tor', 'doa'] });
  });
});

describe('a directory field is searched, not invented', () => {
  const geneva = { code: 'GVA', name: 'Geneva' };
  const resolver = (record) => {
    const calls = [];
    return { calls, resolveDirectory: async (kind, query) => { calls.push({ kind, query }); return record; } };
  };

  test('an autocomplete commits whichever record the REAL search returned', async () => {
    const r = resolver(geneva);
    const out = await clickFor(ctrl('autocomplete', { slotId: 'location', source: { directory: 'location' } }),
      'Geneva is my duty station', r);

    expect(out.controlAction).toEqual({ slotId: 'location', value: geneva });
    // …and it searched the directory the CONTROL named, with the persona's own words.
    expect(r.calls).toEqual([{ kind: 'location', query: 'Geneva' }]);
  });

  test('declining a confirm is what a person does next: search for the right record', async () => {
    const r = resolver({ userId: 'u9', name: 'Maria Ivanova' });
    const out = await clickFor(directoryConfirm('user'), 'No, it is for Maria Ivanova', r);

    expect(out.controlAction).toEqual({ slotId: 'location', value: { userId: 'u9', name: 'Maria Ivanova' } });
    expect(r.calls[0].kind).toBe('user');
  });

  test('when the search finds nothing, the refusal stands and says so', async () => {
    const r = resolver(null);
    expect(await clickFor(directoryConfirm(), 'No, somewhere else entirely', r))
      .toEqual({ controlAction: null, why: 'directory_no_match' });
  });

  test('with no resolver injected it stays free text, exactly as before', async () => {
    expect((await clickFor(ctrl('autocomplete', { source: { directory: 'user' } }), 'Maria Ivanova')).controlAction).toBeNull();
  });

  test('a directory that throws is not the persona\'s problem to solve', async () => {
    const out = await clickFor(directoryConfirm(), 'No, Nairobi', {
      resolveDirectory: async () => { throw new Error('directory down'); },
    });
    expect(out.controlAction).toBeNull();
  });

  test('the search kind comes from the control, never from the slot name', async () => {
    // A people search for a duty station is precisely the confusion typed controls
    // exist to prevent, so the kind is read off the widget.
    const r = resolver(geneva);
    await clickFor(directoryConfirm('location'), 'No, Geneva', r);
    expect(r.calls[0].kind).toBe('location');
  });
});

describe('what it still refuses to do', () => {
  test('an answer with no date in it stays free text rather than becoming a made-up one', async () => {
    expect(await clickFor(ctrl('date'), 'as soon as possible please'))
      .toEqual({ controlAction: null, why: 'no_date_in_answer' });
  });

  test('an unclear answer on a plain confirm stays free text — the model can ask again', async () => {
    expect(await clickFor(ctrl('confirm'), 'hmm, I am not sure what you mean'))
      .toEqual({ controlAction: null, why: 'unclear_confirm' });
  });

  test('an option nobody named is not guessed at', async () => {
    const options = [{ value: 'tor', label: 'Terms of Reference' }];
    expect(await clickFor(ctrl('multichoice', { options }), 'something else entirely'))
      .toEqual({ controlAction: null, why: 'no_option_matched' });
  });

  test('a fork control is not a field, and is handled by the runner as a choice', async () => {
    const forks = [{ id: 'c', type: 'choice', slotId: '__service__', options: [{ value: 'X' }] }];
    expect(await clickFor(forks, 'the first one')).toEqual({ controlAction: null, why: 'no_field_control' });
  });

  test('no controls at all, or nothing said', async () => {
    expect((await clickFor([], 'anything')).controlAction).toBeNull();
    expect((await clickFor(ctrl('text'), '   ')).controlAction).toBeNull();
  });

  test('a widget type it has never met is refused by name, not by guess', async () => {
    expect(await clickFor(ctrl('hologram'), 'yes')).toEqual({ controlAction: null, why: 'unsupported_control:hologram' });
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

  test('queryFrom pulls the searchable phrase out of a sentence', () => {
    expect(queryFrom('New York is my duty station')).toBe('New York');
    expect(queryFrom('it is for Maria Ivanova')).toBe('Maria Ivanova');
    // Nothing capitalised: the whole sentence is a fair query rather than nothing.
    expect(queryFrom('somewhere warm')).toBe('somewhere warm');
  });
});
