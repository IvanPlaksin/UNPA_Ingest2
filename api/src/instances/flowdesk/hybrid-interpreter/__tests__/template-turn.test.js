'use strict';

/**
 * HYB-003 — the 0-LLM turn.
 *
 * Two things are being pinned. First, that the rendered turn is a REAL turn: the
 * same response contract, the same widget for the same slot, the optional way out
 * where the form allows one — the frontend must not be able to tell who wrote it.
 * Second, and more important, that it PASSES rather than guesses: every case it
 * cannot render honestly must return `{fallthrough:true}` so the model takes over.
 */

const { buildTemplateTurn, ackFor, shortQuestion } = require('../template-turn.service');

const SNAPSHOT = {
  serviceId: 'EO-HR-SA-EXT', version: 2, phases: ['context', 'detail'],
  metadata: { title: 'Extension of Appointment' },
  slots: [
    { slotId: 'beneficiary', type: 'user', required: true, phase: 'context', promptHint: 'Who is this request for?' },
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', promptHint: 'Index Number', helpText: 'Your staff file identifier' },
    { slotId: 'lastDay', type: 'date', required: true, phase: 'detail', promptHint: 'Proposed end date' },
    { slotId: 'comments', type: 'text', required: false, phase: 'detail', promptHint: 'Anything to add?' },
    { slotId: 'grade', type: 'enum', required: true, phase: 'detail', promptHint: 'Grade' }, // no options — no widget
    { slotId: 'nameless', type: 'string', required: true, phase: 'detail' },                 // no promptHint
  ],
};

const DRAFT = { sessionId: 's1', serviceId: 'EO-HR-SA-EXT', schemaVersion: 2, status: 'draft', slots: {} };
const field = (slotId) => SNAPSHOT.slots.find((s) => s.slotId === slotId);
const turn = (over = {}) => buildTemplateTurn({
  draft: DRAFT, snapshot: SNAPSHOT, nextField: field('indexNumber'), lang: 'en', lastControlType: 'confirm', ...over,
});

describe('the rendered turn is a real turn', () => {
  test('acknowledgement plus the field\'s own question, and the widget the form implies', async () => {
    const t = await turn();

    expect(t.fallthrough).toBeUndefined();
    expect(t.response).toBe('Got it. Index Number');
    expect(t.askingSlot).toBe('indexNumber');
    expect(t.controls).toHaveLength(1);
    expect(t.controls[0].type).toBe('text');
    // The help text rides on the LABEL, as it does on the agent path — the question
    // stays one line and the explanation sits with the box.
    expect(t.controls[0].label).toContain('Your staff file identifier');
  });

  test('the response contract is the same one the model path returns', async () => {
    const t = await turn();

    expect(t).toMatchObject({
      responseType: 'agent_with_controls',
      currentNode: 'TEMPLATE_FILL',
      engineStatus: 'WAITING_FOR_INPUT',
      isComplete: false,
      version: 'v2',
      state: { serviceId: 'EO-HR-SA-EXT', route: 'TEMPLATE_FILL' },
    });
    // The honest trace of a turn with no tools and no model.
    expect(t.executionLog).toEqual([{ node: 'TEMPLATE_FILL', status: 'COMPLETED' }]);
  });

  test('a date field gets a date picker, not a text box', async () => {
    const t = await turn({ nextField: field('lastDay') });
    expect(t.controls[0].type).toBe('date');
  });

  test('an OPTIONAL field says so and carries a way past it', async () => {
    const t = await turn({ nextField: field('comments') });

    expect(t.controls[0].label).toContain('(optional)');
    expect(t.controls[1]).toMatchObject({ type: 'choice', slotId: '__skip__' });
    expect(t.controls[1].options[0].value).toBe('comments');
  });

  test('a Skip is acknowledged as a skip, not as an answer', async () => {
    const t = await turn({ nextField: field('comments'), skipped: true });
    expect(t.response.startsWith('Skipped.')).toBe(true);
  });

  test('the acknowledgement follows the control the user ACTED on', async () => {
    expect((await turn({ lastControlType: 'date' })).response.startsWith('Recorded.')).toBe(true);
    expect((await turn({ lastControlType: 'choice' })).response.startsWith('Noted.')).toBe(true);
    expect((await turn({ lastControlType: 'autocomplete' })).response.startsWith('Thanks.')).toBe(true);
  });
});

describe('a directory field is only rendered when it can propose something', () => {
  test('with a resolved default it is a confirm plus a people search', async () => {
    const t = await turn({
      nextField: field('beneficiary'),
      resolveDefault: async () => ({ defaultValue: { userId: 'u1', name: 'Ivan Plaksin' }, alternatives: [] }),
    });

    expect(t.controls[0].type).toBe('confirm');
    expect(t.controls[0].defaultValue).toEqual({ userId: 'u1', name: 'Ivan Plaksin' });
    expect(t.controls[0].children[0].source.directory).toBe('user');
  });

  test('without one it PASSES: a "Yes" that agrees to nothing is worse than a slow turn', async () => {
    const t = await turn({ nextField: field('beneficiary'), resolveDefault: async () => ({ defaultValue: null }) });
    expect(t).toMatchObject({ fallthrough: true, why: 'directory_without_default' });
  });

  test('with no resolver at all it PASSES rather than rendering an empty confirm', async () => {
    const t = await turn({ nextField: field('beneficiary'), resolveDefault: undefined });
    expect(t).toMatchObject({ fallthrough: true, why: 'no_resolver' });
  });
});

describe('it passes instead of guessing — the rule that makes the template safe', () => {
  test('no field due', async () => {
    expect(await turn({ nextField: null })).toMatchObject({ fallthrough: true, why: 'no_field' });
  });

  test('a field that is not on this form', async () => {
    expect(await turn({ nextField: { slotId: 'ghost', promptHint: 'Ghost?' } }))
      .toMatchObject({ fallthrough: true, why: 'slot_not_in_snapshot' });
  });

  test('a field with no label to ask it by', async () => {
    expect(await turn({ nextField: field('nameless') }))
      .toMatchObject({ fallthrough: true, why: 'no_prompt_hint' });
  });

  test('a type no widget covers (an enum with no options)', async () => {
    expect(await turn({ nextField: field('grade') }))
      .toMatchObject({ fallthrough: true, why: 'no_control_for_type' });
  });

  test('no draft, no snapshot', async () => {
    expect(await buildTemplateTurn({})).toMatchObject({ fallthrough: true });
    expect(await buildTemplateTurn()).toMatchObject({ fallthrough: true });
  });

  test('it NEVER throws — an exception becomes a pass, because a throw loses the turn', async () => {
    const exploding = {
      draft: DRAFT,
      snapshot: SNAPSHOT,
      nextField: field('beneficiary'),
      resolveDefault: async () => { throw new Error('directory down'); },
    };
    const t = await buildTemplateTurn(exploding);
    expect(t.fallthrough).toBe(true);
    expect(t.why).toContain('directory down');
  });
});

describe('a question is a sentence, not a paragraph', () => {
  const CONSENT = 'I confirm that the information provided in this form is accurate and complete, '
    + 'that the necessary approvals have been obtained, and that the proposed extension is consistent with the rules.';

  test('an ordinary label is asked exactly as the form wrote it', () => {
    expect(shortQuestion('Index Number')).toBe('Index Number');
  });

  test('a consent clause is cut at its first sentence — read out whole it is not a question', () => {
    const out = shortQuestion(CONSENT);
    expect(out.length).toBeLessThan(CONSENT.length);
    expect(out.startsWith('I confirm that the information provided')).toBe(true);
  });

  test('a long label with no sentence at all is trimmed, and says it was', () => {
    const rambling = 'A very long label with no sentence break at all that simply keeps going and going past the limit';
    expect(shortQuestion(rambling).endsWith('…')).toBe(true);
  });

  test('the CONTROL still carries the full wording, so nothing is hidden', async () => {
    const snapshot = {
      serviceId: 'S', version: 1, phases: ['detail'], metadata: {},
      slots: [{ slotId: 'consent', type: 'toggle', required: false, phase: 'detail', promptHint: CONSENT }],
    };
    const t = await buildTemplateTurn({
      draft: { sessionId: 's', serviceId: 'S', schemaVersion: 1, slots: {} },
      snapshot, nextField: snapshot.slots[0], lang: 'en', lastControlType: 'choice',
    });

    expect(t.response.length).toBeLessThan(CONSENT.length);
    expect(t.controls[0].label).toContain('consistent with the rules');
  });
});

describe('ackFor', () => {
  test('falls back to a sane phrase for an unknown control type', () => {
    expect(ackFor('en', 'no-such-type')).toBe('Got it.');
  });

  test('is translated, so the strings are ready if the template path is ever let past English', () => {
    expect(ackFor('ru', 'confirm')).toBe('Понял.');
    expect(ackFor('zh', 'skip')).toBe('已跳过。');
  });
});
