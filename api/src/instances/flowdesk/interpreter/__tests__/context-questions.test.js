'use strict';

/**
 * Two defects from session fdv2-781b9302, both of the same shape: the assistant
 * already held what the user was being asked for.
 *
 *   turn 3 — "Which location or duty station should this request be processed from?"
 *            asked cold, while the control underneath it offered the answer for one
 *            click. The user confirmed that control on the next turn. The value was
 *            right; the sentence simply did not mention it.
 *
 *   turn 8 — `sharedWith` rendered as a free-text box: a typing field for a value
 *            that only exists as directory records.
 *
 * The location cause is narrow and worth naming: `describeField` handed the model
 * `promptHint` and nothing else, so it had no way to name a duty station it was about
 * to propose. A model cannot write a better sentence than the information it is given.
 */

const { questionFor, locationQuestion, isSelf } = require('../context-questions');
const { buildControlFromSlot, directoryOf } = require('../controls');

const LOC = { slotId: 'location', type: 'location', promptHint: 'Which location or duty station?' };
const geneva = { code: 'GVA', name: 'Geneva', city: 'Geneva' };
const draftWith = (slots) => ({ slots });

describe('the duty-station question names the duty station', () => {
  test('for the person asking, it is THEIR profile that is quoted', () => {
    // `author` is resolved silently at intake for every Altiora form, so in a real
    // draft both parties are known and the comparison is by identity.
    const draft = draftWith({
      author: { value: { userId: 'u1' } },
      beneficiary: { value: { userId: 'u1', name: 'Ivan P', location: geneva } },
    });
    expect(questionFor(LOC, draft)).toBe('Your profile has you at Geneva. Should this request be handled there?');
  });

  test('with no author to compare against, it names the person rather than guessing', () => {
    // My first fixture omitted `author` and I expected "your profile" — the code
    // named the person instead, and it was right to. "Your profile has you at X"
    // told to someone raising a request FOR A COLLEAGUE is wrong in a way the
    // neutral phrasing never is, and the name is true either way.
    const draft = draftWith({ beneficiary: { value: { userId: 'u1', name: 'Ivan P', location: geneva } } });
    expect(questionFor(LOC, draft)).toBe('Ivan P is based at Geneva. Should this request be handled there?');
  });

  test('for a colleague, it is THEIRS — and they are named', () => {
    // One phrasing for both cases is wrong in one of them, every time.
    const draft = draftWith({
      author: { value: { userId: 'u1' } },
      beneficiary: { value: { userId: 'u2', name: 'Maria Silva', location: { name: 'Nairobi' } } },
    });
    expect(questionFor(LOC, draft)).toBe('Maria Silva is based at Nairobi. Should this request be handled there?');
  });

  test('a place with a distinct city reads as both', () => {
    const draft = draftWith({
      beneficiary: { value: { userId: 'u1', location: { name: 'UNON', city: 'Nairobi' } } },
    });
    expect(questionFor(LOC, draft)).toMatch('UNON, Nairobi');
  });

  test('with nothing to propose it asks plainly rather than promising a suggestion', () => {
    // A sentence that offers a suggestion and shows none is worse than a plain ask.
    expect(questionFor(LOC, draftWith({}))).toBe('Which location or duty station should this request be handled at?');
    expect(questionFor(LOC, draftWith({ beneficiary: { value: { userId: 'u1', name: 'No Place' } } })))
      .toBe('Which location or duty station should this request be handled at?');
  });

  test('an unnamed colleague still gets a question about the right place', () => {
    const draft = draftWith({
      author: { value: { userId: 'u1' } },
      beneficiary: { value: { userId: 'u2', location: { name: 'Vienna' } } },
    });
    expect(questionFor(LOC, draft)).toMatch(/someone based at Vienna/);
  });

  test('every other field keeps the schema’s own prompt', () => {
    // Deliberately a closed map: a templating language over prompts is one nobody
    // could audit.
    expect(questionFor({ slotId: 'amount', promptHint: 'Amount' }, draftWith({}))).toBe('Amount');
  });

  test('a malformed draft does not take the turn down', () => {
    expect(questionFor(LOC, null)).toBeTruthy();
    expect(locationQuestion({}, null)).toBeTruthy();
  });
});

describe('who the request is for', () => {
  test('nothing chosen yet reads as self, which is the default the control offers', () => {
    expect(isSelf(draftWith({}))).toBe(true);
  });

  test('the same person is self', () => {
    expect(isSelf(draftWith({
      author: { value: { userId: 'u1' } },
      beneficiary: { value: { userId: 'u1' } },
    }))).toBe(true);
  });

  test('a different person is not', () => {
    expect(isSelf(draftWith({
      author: { value: { userId: 'u1' } },
      beneficiary: { value: { userId: 'u2' } },
    }))).toBe(false);
  });
});

describe('sharing a request with colleagues is a directory pick, not typing', () => {
  const SHARED = { slotId: 'sharedWith', type: 'userlist', promptHint: 'Share with colleagues?' };

  test('a userlist IS a directory field — it was not, which is the whole defect', () => {
    expect(directoryOf(SHARED)).toBe('user');
  });

  test('it renders as a search that keeps its picks', () => {
    const c = buildControlFromSlot(SHARED, { label: SHARED.promptHint });
    expect(c).toMatchObject({
      type: 'autocomplete', slotId: 'sharedWith', multi: true, selected: [],
    });
    expect(c.source).toMatchObject({ directory: 'user', minChars: 2 });
  });

  test('NOT a text box — the value only exists as directory records', () => {
    expect(buildControlFromSlot(SHARED, {}).type).not.toBe('text');
  });

  test('people already chosen come back as options the client can render', () => {
    // Without label and value the chips would have to be looked up a second time.
    const c = buildControlFromSlot(SHARED, {
      label: 'x', defaultValue: [{ userId: 'u2', name: 'Maria Silva', email: 'm@un.org' }],
    });
    expect(c.selected).toEqual([{ value: 'u2', label: 'Maria Silva', description: 'm@un.org' }]);
  });

  test('a single-user field is still a confirm, not a multi picker', () => {
    // `beneficiary` proposes one person to accept with one click; nothing changed there.
    const c = buildControlFromSlot({ slotId: 'beneficiary', type: 'user' }, { defaultValue: { userId: 'u1', name: 'A' } });
    expect(c.type).toBe('confirm');
    expect(c.multi).toBeUndefined();
  });
});

/**
 * "Is this request for yourself, or for someone else?" (fdv2-65d84c0e) makes the
 * person answer a question about the SHAPE of the answer before giving it, and costs
 * a turn: yes, and then the name. The control already holds the signed-in user, so
 * the question can propose them and the same turn accepts or replaces them.
 */
describe('who the request is for is proposed, not forked', () => {
  const B = { slotId: 'beneficiary', type: 'user', promptHint: 'Who is this request for?' };

  test('names the signed-in person and says how to change it', () => {
    expect(questionFor(B, draftWith({}), { userId: 'u1', name: 'Ivan Plaksin' }))
      .toBe('Is this request for you, Ivan Plaksin? If it is for a colleague, search for them instead.');
  });

  test('composes a name from its parts when that is all the directory gives', () => {
    expect(questionFor(B, draftWith({}), { userId: 'u1', firstName: 'Ana', lastName: 'Costa' }))
      .toMatch('Ana Costa');
  });

  test('with nobody signed in it asks plainly rather than naming a stranger', () => {
    expect(questionFor(B, draftWith({}), null))
      .toBe('Who is this request for? Search for the person, or confirm it is for you.');
  });

  test('it is never a two-button fork', () => {
    // The phrasing this replaced. It cost a turn and told the user nothing about who
    // the assistant already had in mind.
    for (const actor of [{ userId: 'u1', name: 'X Y' }, null]) {
      expect(questionFor(B, draftWith({}), actor)).not.toMatch(/yourself, or for someone else/i);
    }
  });
});

/**
 * The field reached the wizard as nothing at all.
 *
 * "Shared with (read-only access)" stayed empty after the user picked someone in
 * chat, because `draftToInitialFormData` only emits `sharedWith` when the stored
 * value is an ARRAY — and a directory pick was stored as a single record. The chain
 * was broken at its quietest point: the pick succeeded, the draft held it, and the
 * hand-off skipped it without a word.
 */
describe('a field that holds several people reaches the form', () => {
  const { draftToInitialFormData } = require('../form-handoff');
  const SNAP = { metadata: {}, slots: [] };

  test('a list of people is carried, each in the shape the selector renders', () => {
    const draft = { slots: { sharedWith: { value: [
      { userId: 'u2', name: 'Maria Silva', email: 'm@un.org' },
      { userId: 'u3', name: 'Ivan Petrov', email: 'i@un.org' },
    ] } } };
    const out = draftToInitialFormData(draft, SNAP);
    expect(out.sharedWith).toEqual([
      expect.objectContaining({ id: 'u2', firstName: 'Maria', lastName: 'Silva' }),
      expect.objectContaining({ id: 'u3', firstName: 'Ivan', lastName: 'Petrov' }),
    ]);
  });

  test('one person is still a list — the wizard reads an array or nothing', () => {
    const draft = { slots: { sharedWith: { value: [{ userId: 'u2', name: 'Maria Silva' }] } } };
    expect(draftToInitialFormData(draft, SNAP).sharedWith).toHaveLength(1);
  });

  test('nobody chosen sends nothing rather than an empty array', () => {
    // Altiora treats an absent optional field sensibly; an empty array it did not
    // expect is a good way to trip its 400 path.
    expect(draftToInitialFormData({ slots: { sharedWith: { value: [] } } }, SNAP).sharedWith).toBeUndefined();
  });
});
