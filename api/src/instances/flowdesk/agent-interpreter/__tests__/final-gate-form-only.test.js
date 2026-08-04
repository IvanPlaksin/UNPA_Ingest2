'use strict';

/**
 * The request is filed from the form, and the last step says so.
 *
 * `FLOWDESK_FINAL_GATE=form` (the default) already made draft_submit refuse. What it
 * did not do was stop the final gate offering "Carry on here" beside "Open the form" —
 * an option that could not lead anywhere. Choosing it left the user answering whatever
 * came next and arriving back at the same gate, because the only exit had been declined
 * and no other exists.
 *
 * A button that cannot finish the journey does not belong at the step whose whole
 * purpose is to finish it.
 *
 * What is NOT removed: the long-form fork earlier in the conversation still offers to
 * carry on in the chat. That one is real — the user fills the fields by talking and
 * still leaves through the form at the end.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');

const SNAPSHOT = {
  serviceId: 'SVC-1',
  metadata: { title: 'Education grant claim' },
  slots: [{ slotId: 'amount', label: 'Amount', type: 'text', required: true }],
};

// The draft's real shape: `slots` keyed by slotId, each holding a `value`. And the
// context slots count — the gate only stands when NOTHING is left to ask, which
// includes who the request is for and where it is handled.
const filled = (v) => ({ value: v, source: 'user' });
const DRAFT = {
  sessionId: 's1',
  serviceId: 'SVC-1',
  status: 'draft',
  slots: {
    beneficiary: filled('self'),
    location: filled('Geneva'),
    amount: filled('100'),
  },
};

const mk = () => createAgentTools({
  draftService: {
    get: async () => DRAFT, create: async () => DRAFT,
    patch: async () => DRAFT, discard: async () => true,
    submit: async () => ({ srNumber: 'SR-9' }),
  },
  loadSnapshot: async () => SNAPSHOT,
  resolveSearch: async () => [],
});

const ctx = () => ({
  sessionId: 's1', session: createToolSession(), lang: 'en',
  userContext: { userId: 'u-1', name: 'Ivan Plaksin' },
});

describe('the last step offers the form, and only the form', () => {
  const OLD = process.env.FLOWDESK_FINAL_GATE;
  afterEach(() => { if (OLD === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = OLD; });

  test('one option, and it is the form', async () => {
    process.env.FLOWDESK_FINAL_GATE = 'form';
    const tools = mk();
    const c = ctx();

    const controls = await tools.autoControlFor(c, 'All done.', []);
    const gate = (controls || []).find((x) => x.slotId === '__open_form__');

    expect(gate).toBeDefined();
    expect(gate.options.map((o) => o.value)).toEqual(['open']);
  });

  test('nothing on it says "carry on here"', async () => {
    process.env.FLOWDESK_FINAL_GATE = 'form';
    const c = ctx();
    const controls = await mk().autoControlFor(c, 'All done.', []);
    const gate = (controls || []).find((x) => x.slotId === '__open_form__');

    expect(JSON.stringify(gate)).not.toMatch(/carry on here/i);
  });

  test('the wording states where the request is filed instead of asking a one-answer question', async () => {
    // "Open it now?" with a single button reads as a choice taken away rather than
    // one that never existed.
    process.env.FLOWDESK_FINAL_GATE = 'form';
    const c = ctx();
    const controls = await mk().autoControlFor(c, 'All done.', []);
    const gate = (controls || []).find((x) => x.slotId === '__open_form__');

    expect(gate.question).toMatch(/filed from the form/i);
    expect(gate.question).not.toMatch(/Open it now\?/);
  });

  test('the chat still refuses to file it, which is the rule the button now matches', async () => {
    process.env.FLOWDESK_FINAL_GATE = 'form';
    const out = await mk().TOOLS.draft_submit({}, ctx());

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/filed from the form/i);
  });

  test('the gate is a SETTING: turn it off and the chat may finish a request again', async () => {
    // The switch is FLOWDESK_FINAL_GATE, one variable for one decision. A second flag
    // for the same thing is how two halves of a system come to disagree.
    process.env.FLOWDESK_FINAL_GATE = 'chat';
    const c = ctx();

    const controls = await mk().autoControlFor(c, 'All done.', []);
    const gate = (controls || []).find((x) => x.slotId === '__open_form__');

    expect(gate).toBeUndefined();       // no forced hand-off
  });
});
