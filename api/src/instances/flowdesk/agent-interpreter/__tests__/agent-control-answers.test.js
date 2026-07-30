'use strict';

/**
 * Session fdv2-2815b706 — "the chat could not accept my answer several times".
 *
 * The user pressed the confirm on "Who is submitting this request?" three times
 * and was asked a fourth. The click arrived as {action:'confirm', slotId:'author'}
 * and was handed to the model as the bare string "[confirmed]": no slot, no
 * value. Nothing wrote it to the draft, so the field stayed empty and the
 * question came round again. The state machine never had this failure because it
 * applies a control answer in code.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');
const { createAgentLoop, describeValue } = require('../agent-loop.service');

const ME = { userId: 'u1', name: 'Ivan Plaksin', email: 'ivan@un.org' };

const FORM = {
  serviceId: 'EO-HR-SA-EXT', version: 2, metadata: { title: 'Extension', altioraOusId: 7 },
  phases: ['context', 'detail'],
  slots: [
    // As the orchestrator injects it for a real Altiora form: required, and with
    // NO autoResolve — so it is a question the user has to answer.
    { slotId: 'author', type: 'user', required: true, phase: 'context', resolverRef: 'resolve.author', promptHint: 'Who is submitting this request?' },
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', promptHint: 'Index number' },
    { slotId: 'typeOfExtension', type: 'enum', required: true, phase: 'detail', promptHint: 'Type of extension',
      presentOptions: [{ value: 'fixed', label: 'Fixed-term' }, { value: 'temp', label: 'Temporary' }] },
  ],
};

function harness() {
  const draft = { sessionId: 's1', serviceId: 'EO-HR-SA-EXT', slots: {}, status: 'draft' };
  let created = false;
  const draftService = {
    get: jest.fn(async () => (created ? draft : null)),
    create: jest.fn(async () => { created = true; return draft; }),
    patch: jest.fn(async (_s, patches) => {
      for (const p of patches) draft.slots[p.slotId] = { value: p.value, pending: !!p.pending };
      return draft;
    }),
    submit: jest.fn(async () => ({ srNumber: 'SR-1' })),
    escalate: jest.fn(async () => ({ escalationId: 'e' })),
  };
  const tools = createAgentTools({
    draftService,
    loadSnapshot: async () => FORM,
    resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'Extension' }],
    directory: { getCurrentUser: async () => ME },
  });
  const session = createToolSession();
  const ctx = { sessionId: 's1', userId: 'u1', userContext: {}, session, lang: 'en' };
  return { tools, ctx, session, draft, draftService };
}


/**
 * Fill the directory-backed context fields the way the runtime does — through a
 * control. draft_update refuses them on purpose: a person or a duty station is a
 * record the user PICKS, never prose the model types (form-policy.isReferenceSlot).
 */
async function pickContext(h, { beneficiary, location } = {}) {
  if (beneficiary !== undefined) {
    await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' },
      [{ id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: beneficiary }]);
  }
  if (location !== undefined) {
    await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'location' },
      [{ id: 'c', type: 'confirm', slotId: 'location', defaultValue: location }]);
  }
}

const start = async (h) => {
  await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
  return h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
};

describe('a control answer is written by code, not by the model', () => {
  // The requester is NEVER a question: Altiora stamps it from the authenticated
  // identity on every submit, so the chat only has to know it. The loader's own
  // definition made it required-and-asked, which is what fdv2-2815b706 ran into.
  test('the requester is filled from the signed-in user and never asked', async () => {
    const h = harness();
    await start(h);
    expect(h.draft.slots.author.value).toEqual(ME);

    await pickContext(h, { beneficiary: ME, location: 'New York' });
    await h.tools.execute('draft_update', { fields: { description: 'x' } }, h.ctx);
    const [shown] = await h.tools.autoControlFor(h.ctx, 'What next?', []);
    expect(shown.slotId).not.toBe('author');

    const upd = await h.tools.execute('draft_update', { fields: { indexNumber: 'X' } }, h.ctx);
    expect(upd.stillMissing.map((f) => f.slotId)).not.toContain('author');
    expect(upd.askable.map((f) => f.slotId)).not.toContain('author');
  });

  test('a control answer for a field that IS asked is written on the first click', async () => {
    const h = harness();
    await start(h);
    const shown = { id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME };

    const rec = await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' }, [shown]);
    expect(rec).not.toBeNull();
    expect(h.draft.slots.beneficiary.value).toEqual(ME);
  });

  test('a picked option is stored by its value, not its label', async () => {
    const h = harness();
    await start(h);
    await h.tools.execute('draft_update', { fields: { indexNumber: 'X' } }, h.ctx);
    const res = await h.tools.execute('emit_control', { type: 'choice', slotId: 'typeOfExtension' }, h.ctx);

    await h.tools.recordControlAnswer(h.ctx, { action: 'select', slotId: 'typeOfExtension', value: 'temp' }, [res.control]);
    expect(h.draft.slots.typeOfExtension.value).toBe('temp');
  });

  test('declining a confirm stores nothing — the next turn asks', async () => {
    const h = harness();
    await start(h);
    const shown = { id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME };
    expect(await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary', value: false }, [shown])).toBeNull();
    expect(h.draft.slots.beneficiary).toBeUndefined();
  });

  test('a control that is the model\'s own is not written to any field', async () => {
    const h = harness();
    await start(h);
    const rec = await h.tools.recordControlAnswer(h.ctx, { action: 'select', slotId: '__service__', value: 'X' }, []);
    expect(rec).toBeNull();
  });

  test('answered before the form exists, it waits on the session and lands in the draft', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const shown = { id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME };

    const rec = await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' }, [shown]);
    expect(rec).not.toBeNull();
    expect(h.session.pendingContext.beneficiary).toEqual(ME);

    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    expect(h.draft.slots.beneficiary.value).toEqual(ME);
  });
});

describe('a typed answer is written by code too', () => {
  // Live (fdv2-gate-1785334…): the user typed their index number, the model
  // recorded it and then wrote "what type of extension are you requesting?" —
  // but the box under that sentence was the NEXT field the code had chosen, not
  // the one the model had in mind. The brief is built before the model runs, so
  // an answer recorded by the model always leaves it one field behind.
  test('the field whose text box was on screen takes what was typed', async () => {
    const h = harness();
    await start(h);
    await pickContext(h, { beneficiary: ME, location: { name: 'Geneva' } });
    const shown = [{ id: 'c', type: 'text', slotId: 'indexNumber' }];

    const rec = await h.tools.recordTypedAnswer(h.ctx, '1234567', shown);

    expect(rec).toMatchObject({ slotId: 'indexNumber', value: '1234567', typed: true });
    expect(h.draft.slots.indexNumber.value).toBe('1234567');
    // …and the brief now names the field that really is due, so the sentence the
    // model writes and the control the code emits are about the same thing.
    h.session.skippedSlotIds.add('description');
    const brief = await h.tools.turnBrief(h.ctx, '1234567');
    expect(brief).toContain('typeOfExtension');
    expect(brief).not.toContain('slotId indexNumber');
  });

  test('a question is not an answer', async () => {
    const h = harness();
    await start(h);
    const shown = [{ id: 'c', type: 'text', slotId: 'indexNumber' }];
    expect(await h.tools.recordTypedAnswer(h.ctx, 'what is an index number?', shown)).toBeNull();
    expect(h.draft.slots.indexNumber).toBeUndefined();
  });

  test('a person is never typed, whatever box was on screen', async () => {
    const h = harness();
    await start(h);
    // A directory field could only ever have been shown as a confirm/autocomplete,
    // but the rule is asserted at the writing end as well: prose must not become a
    // person (form-policy.isReferenceSlot).
    const shown = [{ id: 'c', type: 'text', slotId: 'author' }];
    expect(await h.tools.recordTypedAnswer(h.ctx, 'Ivan Plaksin', shown)).toBeNull();
  });

  test('nothing on screen, nothing recorded', async () => {
    const h = harness();
    await start(h);
    expect(await h.tools.recordTypedAnswer(h.ctx, 'some words', [])).toBeNull();
  });
});

describe('the model is told what was stored, not that something was confirmed', () => {
  const runTurn = async (h, controlAction, shownControls) => {
    let seen = null;
    const llm = { messages: async ({ messages }) => { seen = messages; return { content: [{ type: 'text', text: 'ok' }] }; } };
    const loop = createAgentLoop({
      llm, tools: h.tools,
      promptService: { build: async () => ({ text: 'sys', manifest: null }) },
    });
    const session = h.session;
    session.controls = shownControls;
    await loop.runTurn({ sessionId: 's1', history: [], userMessage: '', controlAction, session, lang: 'en' });
    return seen[seen.length - 1].content;
  };

  test('the user turn names the field and the value that was saved', async () => {
    const h = harness();
    await start(h);
    const shown = { id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME, label: 'Who is this request for?' };
    const text = await runTurn(h, { action: 'confirm', slotId: 'beneficiary' }, [shown]);

    expect(text).toContain('Who is this request for?');
    expect(text).toContain('Ivan Plaksin');
    expect(text).not.toContain('[confirmed]');
    expect(h.draft.slots.beneficiary.value).toEqual(ME);
  });

  test('choosing to open the form opens it, and the turn says filling ends there', async () => {
    const h = harness();
    await start(h);
    const text = await runTurn(h, { action: 'select', slotId: '__open_form__', value: 'open' }, []);

    expect(h.session.openForm).toBeTruthy();
    expect(h.session.openForm.serviceId).toBe('EO-HR-SA-EXT');
    expect(text).toContain('assisted filling ends here');
  });

  test('choosing to stay in the chat does NOT open the form', async () => {
    const h = harness();
    await start(h);
    await runTurn(h, { action: 'select', slotId: '__open_form__', value: 'stay' }, []);
    expect(h.session.openForm).toBeNull();
  });
});

describe('describeValue', () => {
  test('a directory record reads as its name', () => {
    expect(describeValue(ME)).toBe('Ivan Plaksin');
    expect(describeValue('New York')).toBe('New York');
  });
});

describe('one control per field per turn', () => {
  test('emitting the same field twice replaces, it does not duplicate', async () => {
    const h = harness();
    await start(h);
    await pickContext(h, { beneficiary: ME, location: 'NY' });
    await h.tools.execute('draft_update', { fields: { description: 'x' } }, h.ctx);

    await h.tools.execute('emit_control', { type: 'text', slotId: 'indexNumber' }, h.ctx);
    await h.tools.execute('emit_control', { type: 'text', slotId: 'indexNumber' }, h.ctx);

    expect(h.session.controls.filter((c) => c.slotId === 'indexNumber')).toHaveLength(1);
  });
});

describe('one question per turn', () => {
  test('a fork (form or chat) is not joined by the next field question', async () => {
    const h = harness();
    await start(h);
    // The opening questions outrank a fork, so they have to be answered before
    // the fork can stand on its own.
    await pickContext(h, { beneficiary: ME, location: 'NY' });
    await h.tools.execute('draft_update', { fields: { description: 'x' } }, h.ctx);
    const fork = [{ id: 'c', type: 'choice', slotId: '__open_form__', options: [{ value: 'open', label: 'Open' }] }];
    expect(await h.tools.autoControlFor(h.ctx, 'Form or chat?', fork)).toBeNull();
  });

  test('…but it never jumps over the opening questions', async () => {
    const h = harness();
    await start(h);
    const fork = [{ id: 'c', type: 'choice', slotId: '__open_form__', options: [{ value: 'open', label: 'Open' }] }];
    const auto = await h.tools.autoControlFor(h.ctx, 'Form or chat?', fork);
    expect(auto[0].slotId).toBe('beneficiary');
  });

  test('an ordinary turn still gets its field control', async () => {
    const h = harness();
    await start(h);
    const auto = await h.tools.autoControlFor(h.ctx, 'Who is this for?', []);
    expect(auto[0].slotId).toBe('beneficiary');
  });
});

/**
 * Session fdv2-111bd67f: the recipient was confirmed, the assistant asked for the
 * duty station in prose — and no control appeared. Before the form exists the
 * opening order is a queue like any other; it just had no owner.
 */
describe('the opening queue continues past the recipient', () => {
  const withDir = (me) => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => FORM,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'Extension' }],
      directory: { getCurrentUser: async () => me },
    });
    return { ...h, tools };
  };
  const PROFILE = { userId: 'u1', name: 'Ivan Plaksin', location: { code: 'NY-HQ', name: 'New York HQ' } };

  test('after the recipient is confirmed, the duty station is offered from the profile', async () => {
    const h = withDir(PROFILE);
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' },
      [{ id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: PROFILE }]);

    const [control] = await h.tools.autoControlFor(h.ctx, 'Where are you based?', []);
    expect(control.slotId).toBe('location');
    expect(control.type).toBe('confirm');
    // Proposed, not asked for blind — and searchable against the LOCATION directory.
    expect(control.defaultValue).toEqual({ code: 'NY-HQ', name: 'New York HQ' });
    expect(control.children[0].source.directory).toBe('location');
  });

  test('the duty station follows the chosen colleague, not the signed-in user', async () => {
    const h = withDir(PROFILE);
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const other = { userId: 'u2', name: 'Maria Rossi', location: { code: 'GVA', name: 'Geneva' } };
    await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', other);

    const [control] = await h.tools.autoControlFor(h.ctx, 'Where are they based?', []);
    expect(control.slotId).toBe('location');
    expect(control.defaultValue).toEqual({ code: 'GVA', name: 'Geneva' });
  });

  // Under the closed contract the model asks for "the field", never for a named
  // one — so order is not something it can get wrong. What matters is that the
  // code hands over the right field first.
  test('the opening queue keeps its order — the recipient comes before the duty station', async () => {
    const h = withDir(PROFILE);
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const res = await h.tools.execute('emit_control', { type: 'confirm', target: 'field' }, h.ctx);
    expect(res.ok).toBe(true);
    expect(res.control.slotId).toBe('beneficiary');
  });

  test('once both are answered, the opening queue is done', async () => {
    const h = withDir(PROFILE);
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', PROFILE);
    await h.tools.recordPreDraftAnswer(h.ctx, 'location', { code: 'NY-HQ', name: 'New York HQ' });
    expect(await h.tools.autoControlFor(h.ctx, 'Right then.', [])).toBeNull();
  });
});

describe('the duty station is proposed from whatever the turn knows', () => {
  test('with no directory, the caller\'s own profile location is proposed', async () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService, loadSnapshot: async () => FORM,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'E' }],
      directory: { getCurrentUser: async () => null },
    });
    h.ctx.userContext = { userId: 'u1', name: 'Ivan Plaksin', location: 'New York HQ' };
    await tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    await tools.recordPreDraftAnswer(h.ctx, 'beneficiary', { userId: 'u1', name: 'Ivan Plaksin' });

    const [control] = await tools.autoControlFor(h.ctx, 'Where are you based?', []);
    expect(control.slotId).toBe('location');
    expect(control.defaultValue).toEqual({ name: 'New York HQ' });
  });
});

/**
 * D2/D1 from the FSM sweep. The state machine keeps a typed mention of a person
 * or a duty station as a HINT and promotes it only once it resolves against the
 * directory — "prevents unvalidated free text filling the slot". The agent has no
 * resolver, so the control is the single way in. Live drafts showed the cost:
 * `beneficiary: "Ivan Plaksin"` where the form expects a person record.
 */
describe('D2 — a directory field is picked, never typed', () => {
  test('the model cannot write a person as prose', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('draft_update', { fields: { beneficiary: 'Ivan Plaksin' } }, h.ctx);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/people directory/i);
    expect(res.error).toContain('searchHint');
    expect(h.draft.slots.beneficiary).toBeUndefined();
  });

  test('a duty station is refused the same way, naming its own directory', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('draft_update', { fields: { location: 'Geneva' } }, h.ctx);
    expect(res.error).toMatch(/duty-station directory/i);
  });

  test('the record the user picked IS accepted, and lands as resolved', async () => {
    const h = harness();
    await start(h);
    await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' },
      [{ id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME }]);

    expect(h.draft.slots.beneficiary.value).toEqual(ME);
    expect(h.draftService.patch).toHaveBeenCalledWith('s1',
      [expect.objectContaining({ slotId: 'beneficiary', provenance: 'resolved' })]);
  });

  test('ordinary fields are unaffected — the rule is about references', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('draft_update', { fields: { indexNumber: 'X-42' } }, h.ctx);
    expect(res.ok).toBe(true);
    expect(h.draft.slots.indexNumber.value).toBe('X-42');
  });

  test('what the user said opens the search pre-typed, as a QUERY not a value', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('emit_control',
      { type: 'confirm', slotId: 'beneficiary', searchHint: 'Maria Ivanova' }, h.ctx);

    expect(res.ok).toBe(true);
    expect(res.control.children[0].prefill).toBe('Maria Ivanova');
    // A hint is not a value: nothing was written.
    expect(h.draft.slots.beneficiary).toBeUndefined();
  });
});

describe('D1 — a value must fit the field', () => {
  test('an enum value outside the form\'s own options is refused, and they are listed', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('draft_update', { fields: { typeOfExtension: 'whatever' } }, h.ctx);

    expect(res.ok).toBe(false);
    expect(res.error).toContain('fixed');
    expect(res.error).toContain('temp');
    expect(h.draft.slots.typeOfExtension).toBeUndefined();
  });

  test('a value from the options is accepted', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('draft_update', { fields: { typeOfExtension: 'temp' } }, h.ctx);
    expect(res.ok).toBe(true);
    expect(h.draft.slots.typeOfExtension.value).toBe('temp');
  });

  test('a good field still lands when another in the same call is bad', async () => {
    const h = harness();
    await start(h);
    const res = await h.tools.execute('draft_update',
      { fields: { indexNumber: 'X-42', typeOfExtension: 'nonsense' } }, h.ctx);

    expect(res.ok).toBe(true);
    expect(h.draft.slots.indexNumber.value).toBe('X-42');
    expect(h.draft.slots.typeOfExtension).toBeUndefined();
    expect(res.invalid.map((i) => i.slotId)).toContain('typeOfExtension');
  });
});

describe('the opening phase is not a place to live', () => {
  test('with a service found and no draft, the brief says to create it', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const brief = await h.tools.turnBrief(h.ctx);
    expect(brief).toContain('draft_create');
    expect(brief).toContain('EO-HR-SA-EXT');
  });

  test('answers held before the draft are named, so they are not collected twice', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', ME);

    const brief = await h.tools.turnBrief(h.ctx);
    expect(brief).toContain('beneficiary');
    expect(brief).toContain('carried in automatically');
  });

  test('before any service there is nothing to say', async () => {
    const h = harness();
    expect(await h.tools.turnBrief(h.ctx)).toBeNull();
  });
});

describe('trust is per FIELD, not per call', () => {
  test('draft_create carries held answers in, but still refuses the model\'s own prose', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    // The user picked this record from the directory.
    await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', ME);

    // …and the model tries to type the duty station in the same breath.
    await h.tools.execute('draft_create',
      { serviceCode: 'EO-HR-SA-EXT', fields: { location: 'Geneva', indexNumber: 'X-1' } }, h.ctx);

    expect(h.draft.slots.beneficiary.value).toEqual(ME);        // held answer: in
    expect(h.draft.slots.location).toBeUndefined();             // model's prose: refused
    expect(h.draft.slots.indexNumber.value).toBe('X-1');        // ordinary field: in
  });
});

describe('what the user picked outranks what the model typed', () => {
  test('a held directory record is not overwritten by prose in the same draft_create', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', ME);

    await h.tools.execute('draft_create',
      { serviceCode: 'EO-HR-SA-EXT', fields: { beneficiary: 'Ivan Plaksin' } }, h.ctx);

    expect(h.draft.slots.beneficiary.value).toEqual(ME);
  });
});

/**
 * Session fdv2-cd0ab081: "I need a Extension" → "appoiment" → "I need a Extension
 * of appoiment". Three turns, `nodeTrace: []` on every one — the catalogue was
 * never consulted while the model reasoned about what the English might mean.
 * The state machine runs resolve.search in code on every turn while there is no
 * draft; the agent left it to the model.
 */
describe('the catalogue is searched by code, not when the model feels like it', () => {
  const withSearch = (results) => {
    const h = harness();
    const calls = [];
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => FORM,
      resolveSearch: async (q) => { calls.push(q); return results; },
      directory: { getCurrentUser: async () => ME },
    });
    return { ...h, tools, calls };
  };
  const HIT = [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'Extension of Appointment & Assignment' }];

  test('a typed message searches the catalogue and the brief names what was found', async () => {
    const h = withSearch(HIT);
    const brief = await h.tools.turnBrief(h.ctx, 'I need a Extension of appoiment');

    expect(h.calls).toEqual(['I need a Extension of appoiment']);
    expect(brief).toContain('EO-HR-SA-EXT');
    expect(brief).toContain('Extension of Appointment & Assignment');
    // …and the code is now usable, so draft_create is not refused by guardrail 1.
    expect(h.session.offeredServiceCodes.has('EO-HR-SA-EXT')).toBe(true);
  });

  test('nothing found is said plainly, not turned into another clarifying question', async () => {
    const h = withSearch([]);
    const brief = await h.tools.turnBrief(h.ctx, 'something nobody offers');
    expect(brief).toContain('NOTHING matched');
    expect(brief).toContain('do not keep asking them to rephrase');
  });

  test('a control click is not a catalogue query', async () => {
    const h = withSearch(HIT);
    await h.tools.turnBrief(h.ctx, '[confirmed]');
    expect(h.calls).toEqual([]);
  });

  test('once a request is open the catalogue is left alone', async () => {
    const h = withSearch(HIT);
    await start(h);
    h.calls.length = 0;
    const brief = await h.tools.turnBrief(h.ctx, 'change the dates');
    expect(h.calls).toEqual([]);
    expect(brief).toContain('request open');
  });

  test('a catalogue outage does not cost the turn', async () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService, loadSnapshot: async () => FORM,
      resolveSearch: async () => { throw new Error('TEI 500'); },
      directory: { getCurrentUser: async () => ME },
    });
    expect(await tools.turnBrief(h.ctx, 'I need an extension')).toBeNull();
  });
});

describe('the brief explains a re-ask the user did not cause', () => {
  // The duty station decides which office serves the request, and each office has
  // its own form. When it changes, answers with no field on the new form are gone
  // (reducer.reconcileToSchema) — the next question is chosen by code either way,
  // but only the model can tell the user WHY it is asking again.
  test('a form swap is stated once, with what was lost', async () => {
    const h = harness();
    await start(h);
    h.draft.schemaSwitch = { at: 'now', from: 1, to: 2, dropped: ['gvaBadgeReturn'] };

    const brief = await h.tools.turnBrief(h.ctx, 'Nairobi');

    expect(brief).toContain('duty station changed');
    expect(brief).toContain('gvaBadgeReturn');
    expect(brief).toContain('Say so once');
  });

  test('an ordinary turn carries no such note', async () => {
    const h = harness();
    await start(h);
    const brief = await h.tools.turnBrief(h.ctx, 'hello');
    expect(brief).not.toContain('duty station changed');
  });
});

describe('the opening questions wait for a settled service', () => {
  // Live: after a hand-off the user asked "what is the status of the request we
  // were just filling?". The reply was right — and carried a "who is this request
  // for?" control, for a request nobody had started. The catalogue is searched in
  // code on every pre-draft turn, so "a service was offered" is true of any message
  // that merely resembles one.
  const preDraft = () => {
    const h = harness();
    return h;
  };

  test('several candidates on the table → no recipient control yet', async () => {
    const h = preDraft();
    h.session.offeredServiceCodes.add('EO-HR-SA-EXT');
    h.session.offeredServiceCodes.add('EO-HR-AP-AP-EIC');
    expect(await h.tools.autoControlFor(h.ctx, 'Here is what I found.', [])).toBeNull();
  });

  test('one candidate — the service the graph says to resolve to → the recipient is asked', async () => {
    const h = preDraft();
    h.session.offeredServiceCodes.add('EO-HR-SA-EXT');
    const auto = await h.tools.autoControlFor(h.ctx, 'This is the one.', []);
    expect((auto || [])[0].slotId).toBe('beneficiary');
  });

  test('…and once the user has picked one, the count no longer matters', async () => {
    const h = preDraft();
    h.session.offeredServiceCodes.add('EO-HR-SA-EXT');
    h.session.offeredServiceCodes.add('EO-HR-AP-AP-EIC');
    h.session.chosenServiceCode = 'EO-HR-SA-EXT';
    const auto = await h.tools.autoControlFor(h.ctx, 'Good choice.', []);
    expect((auto || [])[0].slotId).toBe('beneficiary');
  });
});

describe('which service comes before who it is for', () => {
  test('a service choice is asked alone — the recipient question waits', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const serviceChoice = [{
      id: 'c', type: 'choice', slotId: '__service__',
      options: [{ value: 'EO-HR-SA-EXT', label: 'Extension' }, { value: 'X', label: 'Other' }],
    }];
    expect(await h.tools.autoControlFor(h.ctx, 'Which of these?', serviceChoice)).toBeNull();
  });

  test('once the service is settled, the recipient question comes back', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const auto = await h.tools.autoControlFor(h.ctx, 'Right — who is it for?', []);
    expect(auto[0].slotId).toBe('beneficiary');
  });
});

/**
 * Session fdv2-996e487d ended in a loop it could not leave: the user clicked
 * confirm four times, draft_submit was refused five times, and each turn the
 * agent showed the gate under a new invented name — `__submit__`,
 * `__confirm_submit__`, `__final_confirm__`. The loop only accepted the literal
 * `__confirm__`, so the agreement was never registered.
 */
describe('the submit gate is answered by the control shown, whatever it is called', () => {
  // The chat terminal, not the default form hand-off.
  const prevGate = process.env.FLOWDESK_FINAL_GATE;
  beforeAll(() => { process.env.FLOWDESK_FINAL_GATE = 'submit'; });
  afterAll(() => { if (prevGate === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = prevGate; });

  const complete = async (h) => {
    await start(h);
    await pickContext(h, { beneficiary: ME, location: 'NY' });
    await h.tools.execute('draft_update', { fields: { indexNumber: 'X', typeOfExtension: 'temp' } }, h.ctx);
  };

  const runTurn = async (h, controlAction) => {
    const loop = createAgentLoop({
      llm: { messages: async () => ({ content: [{ type: 'text', text: 'ok' }] }) },
      tools: h.tools,
      promptService: { build: async () => ({ text: 'sys', manifest: null }) },
    });
    await loop.runTurn({ sessionId: 's1', history: [], userMessage: '', controlAction, session: h.session, lang: 'en' });
  };

  test('a gate the model named `__submit__` still records the agreement', async () => {
    const h = harness();
    await complete(h);
    const shown = await h.tools.execute('emit_control', { type: 'confirm', slotId: '__submit__' }, h.ctx);
    expect(shown.ok).toBe(true);
    expect(h.session.confirmSlotId).toBe('__submit__');

    await runTurn(h, { action: 'confirm', slotId: '__submit__' });
    expect(h.session.confirmAccepted).toBe(true);

    const res = await h.tools.execute('draft_submit', {}, h.ctx);
    expect(res.ok).toBe(true);
  });

  test('declining on the gate does not count as agreeing', async () => {
    const h = harness();
    await complete(h);
    await h.tools.execute('emit_control', { type: 'confirm', slotId: '__final_confirm__' }, h.ctx);
    await runTurn(h, { action: 'confirm', slotId: '__final_confirm__', value: false });

    expect(h.session.confirmAccepted).toBe(false);
    expect((await h.tools.execute('draft_submit', {}, h.ctx)).ok).toBe(false);
  });

  test("a FIELD's confirm is an answer, not agreement to file the request", async () => {
    const h = harness();
    await start(h);
    // "Is this for you?" is a confirm control too — it must not open the gate.
    await h.tools.execute('emit_control', { type: 'confirm', slotId: 'beneficiary' }, h.ctx);
    expect(h.session.confirmShown).toBe(false);
    expect(h.session.confirmSlotId).toBeNull();
  });

  test('changing a value after agreeing withdraws it, gate and all', async () => {
    const h = harness();
    await complete(h);
    await h.tools.execute('emit_control', { type: 'confirm', slotId: '__submit__' }, h.ctx);
    await runTurn(h, { action: 'confirm', slotId: '__submit__' });

    await h.tools.execute('draft_update', { fields: { indexNumber: 'Y' } }, h.ctx);
    expect(h.session.confirmAccepted).toBe(false);
    expect(h.session.confirmSlotId).toBeNull();
  });
});

describe('a long form is offered as a fork the user can click', () => {
  const BIG = { ...FORM, slots: [...FORM.slots, ...Array.from({ length: 20 }, (_, i) => ({ slotId: `x${i}`, type: 'text', required: true, phase: 'detail', promptHint: `X ${i}` }))] };
  const bigHarness = () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService, loadSnapshot: async () => BIG,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'E' }],
      directory: { getCurrentUser: async () => ME },
    });
    return { ...h, tools };
  };

  test('when the model only talks about the form, the choice is attached anyway', async () => {
    const h = bigHarness();
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    await pickContext(h, { beneficiary: ME, location: 'NY' });

    const auto = await h.tools.autoControlFor(h.ctx, 'This is a long form, we can go through it together.', []);
    expect(auto[0].slotId).toBe('__open_form__');
    expect(auto[0].options.map((o) => o.value)).toEqual(['open', 'stay']);
  });

  test('offered once — a fork put twice reads as not having heard the answer', async () => {
    const h = bigHarness();
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    await pickContext(h, { beneficiary: ME, location: 'NY' });

    await h.tools.autoControlFor(h.ctx, 'long form', []);
    const again = await h.tools.autoControlFor(h.ctx, 'long form', []);
    expect((again || []).every((c) => c.slotId !== '__open_form__')).toBe(true);
  });

  test('a model that renders the fork itself is not doubled up on', async () => {
    const h = bigHarness();
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    await pickContext(h, { beneficiary: ME, location: 'NY' });

    await h.tools.execute('emit_control', {
      type: 'choice', slotId: '__open_form__', options: [{ value: 'open', label: 'Open' }, { value: 'stay', label: 'Stay' }],
    }, h.ctx);
    expect(h.session.largeFormOffered).toBe(true);
    const auto = await h.tools.autoControlFor(h.ctx, 'anything', []);
    expect((auto || []).every((c) => c.slotId !== '__open_form__')).toBe(true);
  });
});

describe('opening the form ends assisted filling', () => {
  test('no field question survives the hand-off', async () => {
    const h = harness();
    await start(h);
    const loop = createAgentLoop({
      llm: { messages: async () => ({ content: [{ type: 'text', text: 'Opening it now.' }] }) },
      tools: h.tools,
      promptService: { build: async () => ({ text: 'sys', manifest: null }) },
    });
    // The model leaves a field control on screen alongside the hand-off.
    h.session.controls = [{ id: 'c', type: 'text', slotId: 'indexNumber' }];
    const out = await loop.runTurn({
      sessionId: 's1', history: [], userMessage: '',
      controlAction: { action: 'select', slotId: '__open_form__', value: 'open' },
      session: h.session, lang: 'en',
    });

    expect(out.openForm).toBeTruthy();
    expect(out.controls).toBeNull();
  });
});

/**
 * A2 — the form is loaded once per turn.
 *
 * Twelve places need the form, and each call went to Altiora: loadSnapshot runs
 * detectProviders + getSchemaVersion every time, even when the schema is already
 * in the registry. Session gate-1785326429 paid six POST/GET pairs on one turn,
 * the first costing 4.7s of a 21.6s turn.
 */
describe('the form is fetched once a turn, not once a question', () => {
  const counting = (locationPath = 'NY') => {
    const h = harness();
    let loads = 0;
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => { loads += 1; return FORM; },
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'E' }],
      directory: { getCurrentUser: async () => ME },
      locationPathOf: () => locationPath,
    });
    return { ...h, tools, loads: () => loads };
  };

  test('many tools, one fetch', async () => {
    const h = counting();
    h.tools.beginTurn('t1');
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    const before = h.loads();

    await h.tools.execute('draft_update', { fields: { indexNumber: 'A' } }, h.ctx);
    await h.tools.turnBrief(h.ctx, '');
    await h.tools.autoControlFor(h.ctx, 'next?', []);
    await h.tools.missingRequired(h.ctx);

    expect(h.loads()).toBe(before); // four more consumers, no further fetch
  });

  test('a new turn fetches again — between turns the form can change', async () => {
    const h = counting();
    h.tools.beginTurn('t1');
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    const first = h.loads();

    h.tools.beginTurn('t2');
    await h.tools.missingRequired(h.ctx);
    expect(h.loads()).toBeGreaterThan(first);
  });

  test('a different duty station is a different form — the key says so', async () => {
    const h = counting('NY');
    h.tools.beginTurn('t1');
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    const atNY = h.loads();

    // Same turn, the acting user's duty station changes → the memo must miss.
    const moved = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => FORM,
      resolveSearch: async () => [],
      locationPathOf: () => 'GVA',
    });
    moved.beginTurn('t1');
    expect(await moved.missingRequired(h.ctx)).toEqual(expect.any(Array));
    expect(atNY).toBeGreaterThan(0);
  });

  test('a form that fails to load is not remembered as missing', async () => {
    const h = harness();
    let calls = 0;
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => { calls += 1; return calls === 1 ? null : FORM; },
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'E' }],
      locationPathOf: () => 'NY',
    });
    tools.beginTurn('t1');
    await tools.execute('catalog_search', { query: 'x' }, h.ctx);

    const first = await tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    expect(first.ok).toBe(false); // no form available yet
    const second = await tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    expect(second.ok).toBe(true); // …and the failure was not cached
  });
});

/**
 * Session fdv2-dacb3883: the user clicked "Extension of Appointment & Assignment"
 * and the model called draft_create with `EO-HR-EAA` — a code it made up from the
 * title, because the click was described to it by LABEL only. The refusal, the
 * re-search and the retry cost two extra model calls and 5.8s of a 13.4s turn.
 */
describe('a picked option carries its value, not just its label', () => {
  const { describeUserTurn } = require('../agent-loop.service');
  const serviceChoice = [{
    id: 'c', type: 'choice', slotId: '__service__',
    options: [{ value: 'EO-HR-SA-EXT', label: 'Extension of Appointment & Assignment' }],
  }];

  test('the code travels with the title', () => {
    const text = describeUserTurn('', { slotId: '__service__', value: 'EO-HR-SA-EXT' }, serviceChoice);
    expect(text).toContain('Extension of Appointment & Assignment');
    expect(text).toContain('EO-HR-SA-EXT');
  });

  test('when value and label are the same, it is not said twice', () => {
    const shown = [{ id: 'c', type: 'choice', slotId: '__x__', options: [{ value: 'Geneva', label: 'Geneva' }] }];
    expect(describeUserTurn('', { slotId: '__x__', value: 'Geneva' }, shown)).toBe('[selected: Geneva]');
  });

  test('the chosen service is named in the brief, so it is never guessed again', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    h.ctx.session.chosenServiceCode = 'EO-HR-SA-EXT';

    const brief = await h.tools.turnBrief(h.ctx, '');
    expect(brief).toContain('draft_create({serviceCode: "EO-HR-SA-EXT"})');
  });
});

/**
 * Session fdv2-e1791ec1: the reply asked "would you like to add any notes?" while
 * the buttons underneath offered "Fill in the form" / "Continue with the
 * assistant". The user clicked the option that matched the SENTENCE — continue —
 * and then answered twenty more questions by hand. Swapping the control without
 * swapping the question is a mismatch built by the code itself.
 */
describe('a fork the code attaches brings its own question', () => {
  const BIG = { ...FORM, slots: [...FORM.slots, ...Array.from({ length: 25 }, (_, i) => ({ slotId: `q${i}`, type: 'text', required: true, phase: 'detail', promptHint: `Q ${i}` }))] };

  const bigTools = (h) => createAgentTools({
    draftService: h.draftService, loadSnapshot: async () => BIG,
    resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'EO-HR-SA-EXT', title: 'Extension of Appointment' }],
    directory: { getCurrentUser: async () => ME },
  });

  test('the fork carries the sentence that belongs to it', async () => {
    const h = harness();
    const tools = bigTools(h);
    await tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    await tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' },
      [{ id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME }]);
    await tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'location' },
      [{ id: 'c', type: 'confirm', slotId: 'location', defaultValue: 'NY' }]);

    const [fork] = await tools.autoControlFor(h.ctx, 'Would you like to add any notes?', []);
    expect(fork.slotId).toBe('__open_form__');
    expect(fork.replaces).toBe(true);
    expect(fork.question).toMatch(/fields/);
  });

  test('the turn shows the fork\'s question, not the one the model wrote', async () => {
    const h = harness();
    const tools = bigTools(h);
    await tools.execute('catalog_search', { query: 'x' }, h.ctx);
    await tools.execute('draft_create', { serviceCode: 'EO-HR-SA-EXT' }, h.ctx);
    await tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'beneficiary' },
      [{ id: 'c', type: 'confirm', slotId: 'beneficiary', defaultValue: ME }]);
    await tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId: 'location' },
      [{ id: 'c', type: 'confirm', slotId: 'location', defaultValue: 'NY' }]);

    const loop = createAgentLoop({
      llm: { messages: async () => ({ content: [{ type: 'text', text: 'Would you like to add any notes?' }] }) },
      tools,
      promptService: { build: async () => ({ text: 'sys', manifest: null }) },
    });
    const out = await loop.runTurn({ sessionId: 's1', history: [], userMessage: 'ok', session: h.session, lang: 'en' });

    expect(out.controls.map((c) => c.slotId)).toEqual(['__open_form__']);
    expect(out.response).not.toContain('notes');
    expect(out.response).toMatch(/fields/);
    // …and the `replaces`/`question` bookkeeping never reaches the client.
    expect(out.controls[0].replaces).toBeUndefined();
    expect(out.controls[0].question).toBeUndefined();
  });
});

/**
 * The final gate. When nothing is left to ask, the request goes to the FORM —
 * always, not when the model remembers to. Reaching the end of the questions is
 * the moment a chat is least able to show what is about to be filed: it can
 * paraphrase, the form can show it.
 */
describe('a completed request ends at the form', () => {
  // Everything answered OR skipped — the terminal waits for the optional fields
  // too, exactly as the state machine's does (`remaining.length === 0`).
  const fill = async (h) => {
    await start(h);
    await pickContext(h, { beneficiary: ME, location: 'NY' });
    await h.tools.execute('draft_update', { fields: { indexNumber: 'X', typeOfExtension: 'temp' } }, h.ctx);
    for (const optional of ['description', 'sharedWith']) h.session.skippedSlotIds.add(optional);
  };

  test('with every field in, the turn offers the form and says so', async () => {
    const h = harness();
    await fill(h);
    const auto = await h.tools.autoControlFor(h.ctx, 'All done!', []);

    expect(auto[0].slotId).toBe('__open_form__');
    expect(auto[0].replaces).toBe(true);
    expect(auto[0].question).toBeTruthy();
    expect(auto[0].options.map((o) => o.value)).toEqual(['open', 'stay']);
  });

  test('it is offered once, not on every later turn', async () => {
    const h = harness();
    await fill(h);
    await h.tools.autoControlFor(h.ctx, 'All done!', []);
    const again = await h.tools.autoControlFor(h.ctx, 'anything', []);
    expect((again || []).every((c) => c.slotId !== '__open_form__')).toBe(true);
  });

  test('filing from the chat is refused while the form is the terminal', async () => {
    const h = harness();
    await fill(h);
    const res = await h.tools.execute('draft_submit', {}, h.ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/filed from the form/i);
  });

  test('a deployment can still finish in chat', async () => {
    const prev = process.env.FLOWDESK_FINAL_GATE;
    process.env.FLOWDESK_FINAL_GATE = 'submit';
    try {
      const h = harness();
      await fill(h);
      // No form hand-off in this mode — nothing left to ask, so nothing attached.
      expect(await h.tools.autoControlFor(h.ctx, 'All done!', [])).toBeNull();
      h.session.confirmShown = true; h.session.confirmAccepted = true;
      expect((await h.tools.execute('draft_submit', {}, h.ctx)).ok).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = prev;
    }
  });

  test('the gate does not fire while anything is still missing', async () => {
    const h = harness();
    await start(h);
    const auto = await h.tools.autoControlFor(h.ctx, 'next?', []);
    expect(auto[0].slotId).not.toBe('__open_form__');
  });
});

describe('recording an answer without naming the field', () => {
  test('`value` alone lands on the field that was asked', async () => {
    const h = harness();
    await start(h);
    await pickContext(h, { beneficiary: ME, location: 'NY' });
    const due = (await h.tools.execute('draft_update', { fields: { indexNumber: 'X' } }, h.ctx)).nextField;

    const res = await h.tools.execute('draft_update', { value: 'temp' }, h.ctx);
    expect(res.ok).toBe(true);
    expect(h.draft.slots[due.slotId].value).toBe('temp');
  });

  test('with nothing being asked it says so instead of guessing', async () => {
    const h = harness();
    await start(h);
    await pickContext(h, { beneficiary: ME, location: 'NY' });
    await h.tools.execute('draft_update', { fields: { indexNumber: 'X', typeOfExtension: 'temp' } }, h.ctx);
    for (const optional of ['description', 'sharedWith']) h.session.skippedSlotIds.add(optional);
    const res = await h.tools.execute('draft_update', { value: 'stray' }, h.ctx);
    expect(res.ok).toBe(false);
  });
});
