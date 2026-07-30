'use strict';

/**
 * Agent tools (EXP-002) — wrappers and, more importantly, guardrails.
 *
 * The guardrails exist because the arena caught the state machine's model doing
 * each of these things: inventing a service that does not exist and promising to
 * raise it, and announcing a hand-off that no code could perform. A prompt can
 * ask a model not to; only these checks stop it.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');

const SNAPSHOT = {
  serviceId: 'EO-HR-BE-TRE-TRE', version: 3,
  metadata: { title: 'Travel Related Entitlements Queries' },
  slots: [
    // The request-level overlay (form-overlay) is declared here rather than
    // injected, so these tests stay about the tools and not about the overlay —
    // which has its own tests in agent-form-rules.
    { slotId: 'beneficiary', type: 'user', required: true, phase: 'context', promptHint: 'Who is this request for?' },
    { slotId: 'location', type: 'location', required: true, phase: 'context', promptHint: 'Which location or duty station?' },
    { slotId: 'subject', type: 'string', required: true, promptHint: 'Subject', section: 'Main' },
    { slotId: 'notes', type: 'text', required: false, promptHint: 'Notes', helpText: 'Anything else' },
    { slotId: 'when', type: 'date', required: true, promptHint: 'Travel date' },
  ],
};

/** The overlay answers every conversation gives before the service's own fields. */
const CONTEXT_DONE = { beneficiary: 'me', location: 'Geneva' };

function mk(over = {}) {
  const drafts = new Map();
  const escalations = [];
  const deps = {
    resolveSearch: async () => ([
      { type: 'SERVICE', serviceId: 'EO-HR-BE-TRE-TRE', title: 'Travel Related Entitlements Queries', score: 0.9 },
      { type: 'SERVICE', serviceId: 'EO-HR-BE-TRE-AHL', title: 'Advance Home Leave Queries', score: 0.8 },
    ]),
    loadSnapshot: async (id) => (id === 'EO-HR-BE-TRE-TRE' ? SNAPSHOT : null),
    tools: { searchArticles: async () => [{ title: 'Travel policy', answerSnippet: 'Book 14 days ahead.' }] },
    draftService: {
      create: async (sid, serviceId, version) => { drafts.set(sid, { serviceId, version, slots: {} }); return drafts.get(sid); },
      get: async (sid) => drafts.get(sid) || null,
      patch: async (sid, patches) => {
        const d = drafts.get(sid);
        for (const p of patches) d.slots[p.slotId] = { value: p.value };
        return d;
      },
      submit: async () => ({ srNumber: 'SR-2026-1', ticketId: 77 }),
      escalate: async (sid, reason, ref, extra) => {
        escalations.push({ sid, reason, ref, extra });
        return { escalationId: 'ESC-1', hadDraft: false, stub: true };
      },
    },
    ...over,
  };
  const tools = createAgentTools(deps);
  const ctx = { sessionId: 's1', userId: 'u1', session: createToolSession(), userContext: {} };
  return { tools, ctx, drafts, escalations };
}

describe('catalog_search', () => {
  test('returns real services and remembers what it offered', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('catalog_search', { query: 'travel advance' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.services.map((s) => s.serviceCode)).toContain('EO-HR-BE-TRE-TRE');
    expect(ctx.session.offeredServiceCodes.has('EO-HR-BE-TRE-TRE')).toBe(true);
  });

  test('an empty result tells the model NOT to invent one', async () => {
    const { tools, ctx } = mk({ resolveSearch: async () => [] });
    const r = await tools.execute('catalog_search', { query: 'change my bank account' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
    expect(r.note).toMatch(/Do not invent/i);
  });

  test('a backend failure is described, not thrown', async () => {
    const { tools, ctx } = mk({ resolveSearch: async () => { throw new Error('qdrant down'); } });
    const r = await tools.execute('catalog_search', { query: 'x' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/qdrant down/);
  });
});

describe('GUARDRAIL: draft_create only accepts a searched service', () => {
  test('a code the model never saw is refused', async () => {
    // The arena caught the state machine's model offering "Payroll Banking
    // Details Update", which does not exist. This is that failure, blocked.
    const { tools, ctx } = mk();
    const r = await tools.execute('draft_create', { serviceCode: 'EO-HR-INVENTED' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not among the services catalog_search returned/i);
  });

  test('a searched code is accepted and returns the form', async () => {
    const { tools, ctx } = mk();
    await tools.execute('catalog_search', { query: 'travel' }, ctx);
    const r = await tools.execute('draft_create', { serviceCode: 'EO-HR-BE-TRE-TRE' }, ctx);
    expect(r.ok).toBe(true);
    // What the model gets is the running order as LABELS — enough to tell the user
    // what is coming, and not enough to pick a field out of turn.
    expect(r.willAsk).toEqual([
      'Who is this request for?', 'Which location or duty station?', 'Subject', 'Notes', 'Travel date',
    ]);
    expect(r.requiredCount).toBe(4);
    // The field due now still arrives whole, section and all.
    expect(r.nextField.slotId).toBe('beneficiary');
  });

  test('a searched code with no form is refused honestly', async () => {
    const { tools, ctx } = mk();
    await tools.execute('catalog_search', { query: 'leave' }, ctx);
    const r = await tools.execute('draft_create', { serviceCode: 'EO-HR-BE-TRE-AHL' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/do not pretend/i);
  });

  test('known values passed at creation are applied', async () => {
    const { tools, ctx, drafts } = mk();
    await tools.execute('catalog_search', { query: 'travel' }, ctx);
    const r = await tools.execute('draft_create', { serviceCode: 'EO-HR-BE-TRE-TRE', fields: { subject: 'Mission to Nairobi' } }, ctx);
    expect(r.prefilled).toContain('subject');
    expect(drafts.get('s1').slots.subject.value).toBe('Mission to Nairobi');
  });
});

describe('draft_update', () => {
  const ready = async () => {
    const h = mk();
    await h.tools.execute('catalog_search', { query: 'travel' }, h.ctx);
    // The directory fields arrive the way the runtime delivers them — picked from
    // the directory before the form opened, then carried into the draft.
    for (const [slotId, value] of Object.entries(CONTEXT_DONE)) {
      await h.tools.recordPreDraftAnswer(h.ctx, slotId, value);
    }
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-BE-TRE-TRE' }, h.ctx);
    return h;
  };

  test('sets known fields and reports what is still missing', async () => {
    const { tools, ctx } = await ready();
    const r = await tools.execute('draft_update', { fields: { subject: 'Mission' } }, ctx);
    expect(r.ok).toBe(true);
    expect(r.set).toEqual(['subject']);
    expect(r.stillMissing.map((m) => m.slotId)).toEqual(['when']);
  });

  test('invented field names are rejected with the reason', async () => {
    const { tools, ctx } = await ready();
    const r = await tools.execute('draft_update', { fields: { iban: 'DE89' } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/none of those fields exist/i);
  });

  test('unknown fields are dropped while known ones still apply', async () => {
    const { tools, ctx } = await ready();
    const r = await tools.execute('draft_update', { fields: { subject: 'M', iban: 'DE89' } }, ctx);
    expect(r.ok).toBe(true);
    expect(r.set).toEqual(['subject']);
    expect(r.rejected).toEqual(['iban']);
  });

  test('updating without a draft explains what to do first', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('draft_update', { fields: { subject: 'x' } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/draft_create first/);
  });
});

describe('GUARDRAIL: draft_submit needs a confirmed confirm control', () => {
  // These are about the chat-submit terminal. The default terminal is now the
  // form hand-off (FLOWDESK_FINAL_GATE=form), where filing from chat is refused
  // on purpose — see the final-gate tests.
  const prevGate = process.env.FLOWDESK_FINAL_GATE;
  beforeAll(() => { process.env.FLOWDESK_FINAL_GATE = 'submit'; });
  afterAll(() => { if (prevGate === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = prevGate; });

  const filled = async () => {
    const h = mk();
    await h.tools.execute('catalog_search', { query: 'travel' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'EO-HR-BE-TRE-TRE' }, h.ctx);
    // The directory fields go in through a control, as the runtime fills them.
    for (const [slotId, value] of Object.entries(CONTEXT_DONE)) {
      await h.tools.recordControlAnswer(h.ctx, { action: 'confirm', slotId },
        [{ id: 'c', type: 'confirm', slotId, defaultValue: value }]);
    }
    await h.tools.execute('draft_update', { fields: { subject: 'M', when: '2026-08-01' } }, h.ctx);
    return h;
  };

  test('refused when no confirm was ever shown', async () => {
    const { tools, ctx } = await filled();
    const r = await tools.execute('draft_submit', {}, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/have not shown the user a confirm control/i);
  });

  test('refused when the confirm was shown but not answered', async () => {
    const { tools, ctx } = await filled();
    await tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__', label: 'Submit?' }, ctx);
    const r = await tools.execute('draft_submit', {}, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/has not agreed yet/i);
  });

  test('allowed once the user has agreed', async () => {
    const { tools, ctx } = await filled();
    await tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, ctx);
    ctx.session.confirmAccepted = true; // the loop sets this from the user's reply
    const r = await tools.execute('draft_submit', {}, ctx);
    expect(r.ok).toBe(true);
    expect(r.srNumber).toBe('SR-2026-1');
  });

  test('changing a value after agreement withdraws the agreement', async () => {
    // Otherwise the user confirms request A and the model submits request B.
    const { tools, ctx } = await filled();
    await tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, ctx);
    ctx.session.confirmAccepted = true;
    await tools.execute('draft_update', { fields: { subject: 'Different trip' } }, ctx);
    expect(ctx.session.confirmAccepted).toBe(false);
    const r = await tools.execute('draft_submit', {}, ctx);
    expect(r.ok).toBe(false);
  });

  test('a submit failure is reported honestly, never as success', async () => {
    // The required fields are filled: the mandatory-field gate refuses an
    // incomplete draft before Altiora is reached, and this test is about how an
    // Altiora FAILURE is reported.
    const complete = { serviceId: 'EO-HR-BE-TRE-TRE', slots: { beneficiary: { value: 'me' }, location: { value: 'GVA' }, subject: { value: 'S' }, when: { value: '2026-09-01' } } };
    const { tools, ctx } = mk({
      draftService: {
        create: async () => complete, get: async () => complete,
        patch: async () => complete, submit: async () => { throw new Error('Altiora rejected it'); },
        escalate: async () => ({ escalationId: 'E' }),
      },
    });
    await tools.execute('catalog_search', { query: 'travel' }, ctx);
    await tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, ctx);
    ctx.session.confirmAccepted = true;
    const r = await tools.execute('draft_submit', {}, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/do not claim it succeeded/i);
  });
});

describe('GUARDRAIL: escalation costs a tool call', () => {
  test('registers a node and returns a reference', async () => {
    const { tools, ctx, escalations } = mk();
    const r = await tools.execute('escalation_create', { reason: 'no matching service', summary: 'User needs a bank change; catalogue has none.' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.escalationId).toBe('ESC-1');
    expect(escalations[0].extra.conversationSummary).toMatch(/bank change/);
  });

  test('it is a stub, and the model is told not to over-promise', async () => {
    // EXP-002 registers the request; nothing connects a human yet. The wording
    // matters — the transcripts caught "please hold while I transfer you".
    const { tools, ctx } = mk();
    const r = await tools.execute('escalation_create', { reason: 'r', summary: 's' }, ctx);
    expect(r.stub).toBe(true);
    expect(r.tellUser).toMatch(/do NOT say they are being transferred/i);
  });

  test('it works with no draft — the moment a stuck user asks for a person', async () => {
    const { tools, ctx, escalations } = mk();
    const r = await tools.execute('escalation_create', { reason: 'stuck', summary: 'nothing matched' }, ctx);
    expect(r.ok).toBe(true);
    expect(escalations[0].sid).toBe('s1');
  });

  test('a summary is required — the person picking it up needs context', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('escalation_create', { reason: 'stuck' }, ctx);
    expect(r.ok).toBe(false);
  });

  test('a failure is not reported to the user as success', async () => {
    const { tools, ctx } = mk({
      draftService: {
        create: async () => ({}), get: async () => null, patch: async () => ({}), submit: async () => ({}),
        escalate: async () => { throw new Error('memgraph down'); },
      },
    });
    const r = await tools.execute('escalation_create', { reason: 'r', summary: 's' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Do not tell the user it was/i);
  });
});

describe('emit_control', () => {
  test('builds a control the frontend contract accepts', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('emit_control', {
      type: 'choice', slotId: '__service__', label: 'Which one?',
      options: [{ value: 'A', label: 'Service A' }],
    }, ctx);
    expect(r.ok).toBe(true);
    expect(r.control).toMatchObject({ type: 'choice', slotId: '__service__' });
    expect(ctx.session.controls).toHaveLength(1);
  });

  test('a choice with no options is refused', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('emit_control', { type: 'choice', target: '__service__' }, ctx);
    expect(r.ok).toBe(false);
  });

  test('an unknown control type is refused with the allowed list', async () => {
    const { tools, ctx } = mk();
    // A form field's type comes from the schema, so only the model's OWN controls
    // can carry a wrong one.
    const r = await tools.execute('emit_control', { type: 'hologram', target: '__service__' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/type must be one of/);
  });

  test('showing a confirm arms the submit guardrail', async () => {
    const { tools, ctx } = mk();
    expect(ctx.session.confirmShown).toBe(false);
    await tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, ctx);
    expect(ctx.session.confirmShown).toBe(true);
  });
});

describe('the executor contract', () => {
  test('an unknown tool name is an error, not a crash', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('rm_rf', {}, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown tool/);
  });

  test('an unexpected throw inside a tool becomes a described failure', async () => {
    const { tools, ctx } = mk({ loadSnapshot: async () => { throw new Error('boom'); } });
    await tools.execute('catalog_search', { query: 'travel' }, ctx);
    const r = await tools.execute('draft_create', { serviceCode: 'EO-HR-BE-TRE-TRE' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/boom/);
  });

  test('every call is timed, so the loop can report cost', async () => {
    const { tools, ctx } = mk();
    const r = await tools.execute('kb_search', { query: 'travel policy' }, ctx);
    expect(typeof r.ms).toBe('number');
  });

  test('the schemas exposed to the model cover exactly the implemented tools', () => {
    const { tools } = mk();
    expect(tools.TOOL_SCHEMAS.map((t) => t.name).sort()).toEqual(Object.keys(tools.TOOLS).sort());
  });
});

// The model asked for a location and emitted a bare `autocomplete`; with no
// source.directory the client fell back to the people directory and offered a
// PERSON picker for "which duty station?". The control a slot deserves is schema
// knowledge, so the schema decides it — the model only says which slot it means.
describe('controls are derived from the form schema, not from the model', () => {
  const FORM = {
    serviceId: 'S1', version: 1, metadata: { title: 'T' },
    slots: [
      { slotId: 'location', type: 'location', required: true, promptHint: 'Which duty station?' },
      { slotId: 'beneficiary', type: 'user', required: true, promptHint: 'Who is this for?' },
      { slotId: 'when', type: 'date', required: true, promptHint: 'Travel date' },
      { slotId: 'grade', type: 'enum', required: false, promptHint: 'Grade', presentOptions: [{ value: 'P3', label: 'P-3' }] },
      { slotId: 'notes', type: 'text', required: false, promptHint: 'Notes' },
    ],
  };
  // The field is chosen by CODE (variant B), so a control is only accepted for the
  // field that is DUE. Each schema-derivation case therefore starts from a draft
  // where its own field is the head of the queue.
  const ORDER = ['location', 'beneficiary', 'when', 'grade', 'notes'];
  const withForm = (dueSlot = 'location') => {
    const slots = {};
    for (const id of ORDER) {
      if (id === dueSlot) break;
      slots[id] = { value: 'x' };
    }
    return mk({
      loadSnapshot: async () => FORM,
      draftService: {
        get: async () => ({ serviceId: 'S1', slots }),
        create: async () => ({}), patch: async () => ({}), submit: async () => ({}), escalate: async () => ({}),
      },
    });
  };
  const directoryOf = (c) => (c.children && c.children[0] && c.children[0].source && c.children[0].source.directory) || null;

  test('a location slot searches the LOCATION directory, whatever the model asked for', async () => {
    const { tools, ctx } = withForm();
    const r = await tools.execute('emit_control', { type: 'autocomplete', slotId: 'location' }, ctx);
    expect(r.ok).toBe(true);
    expect(directoryOf(r.control)).toBe('location');
  });

  test('a user slot searches the PEOPLE directory', async () => {
    const { tools, ctx } = withForm('beneficiary');
    const r = await tools.execute('emit_control', { type: 'autocomplete', slotId: 'beneficiary' }, ctx);
    expect(directoryOf(r.control)).toBe('user');
  });

  test('a date slot gets a date picker even when the model asks for text', async () => {
    const { tools, ctx } = withForm('when');
    const r = await tools.execute('emit_control', { type: 'text', slotId: 'when' }, ctx);
    expect(r.control.type).toBe('date');
    expect(r.note).toMatch(/because the form defines when as date/);
  });

  test('an enum slot becomes a choice over the form\'s own options', async () => {
    const { tools, ctx } = withForm('grade');
    const r = await tools.execute('emit_control', { type: 'text', slotId: 'grade' }, ctx);
    expect(r.control.type).toBe('choice');
    expect(r.control.options.map((o) => o.value)).toEqual(['P3']);
  });

  test('a free-text slot is not turned into a choice by a confused model', async () => {
    const { tools, ctx } = withForm('notes');
    const r = await tools.execute('emit_control', { type: 'choice', slotId: 'notes', options: [{ value: 'a', label: 'A' }] }, ctx);
    expect(r.control.type).toBe('textarea');
  });

  test('an autocomplete for something that is NOT a form field is refused', async () => {
    // There is no directory behind it, which is precisely how the person-picker
    // appeared for a location question.
    const { tools, ctx } = withForm();
    const r = await tools.execute('emit_control', { type: 'autocomplete', slotId: '__service__' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no directory to search/i);
  });

  test('non-form controls still work — a service choice and a confirm', async () => {
    const { tools, ctx } = withForm();
    const choice = await tools.execute('emit_control', {
      type: 'choice', slotId: '__service__', options: [{ value: 'A', label: 'Service A' }],
    }, ctx);
    expect(choice.ok).toBe(true);
    expect(choice.control.type).toBe('choice');
    // The confirm is the terminal gate (GUARDRAIL 5), so it needs a draft whose
    // required fields are in — this fixture's draft is deliberately empty.
    const done = mk({
      loadSnapshot: async () => FORM,
      draftService: {
        get: async () => ({ serviceId: 'S1', slots: { location: { value: 'GVA' }, beneficiary: { value: 'me' }, when: { value: '2026-09-01' } } }),
        create: async () => ({}), patch: async () => ({}), submit: async () => ({}), escalate: async () => ({}),
      },
    });
    const confirm = await done.tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, done.ctx);
    expect(confirm.ok).toBe(true);
    expect(done.ctx.session.confirmShown).toBe(true);
  });

  test('with no draft yet, the model\'s own control is used unchanged', async () => {
    const { tools, ctx } = mk(); // default fixture: draftService.get returns null
    const r = await tools.execute('emit_control', { type: 'choice', target: '__service__', options: [{ value: 'v', label: 'L' }] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.control.type).toBe('choice');
  });
});

// "Controls are unstable" — sometimes the model attaches one, sometimes it asks
// in prose. A prompt cannot fix that reliably; this is the code guarantee. When
// a turn ends mid-form with required fields empty and no control, the control is
// built from the schema and attached.
describe('a mid-form turn always carries a control, even if the model forgot', () => {
  const FORM = {
    serviceId: 'S1', version: 1, metadata: { title: 'T' },
    slots: [
      { slotId: 'location', type: 'location', required: true, promptHint: 'Which duty station?' },
      { slotId: 'when', type: 'date', required: true, promptHint: 'Travel date' },
      { slotId: 'notes', type: 'text', required: false, promptHint: 'Notes' },
    ],
  };
  const withDraft = (draft) => mk({
    loadSnapshot: async () => FORM,
    draftService: {
      get: async () => draft, create: async () => ({}), patch: async () => ({}),
      submit: async () => ({}), escalate: async () => ({}),
    },
  });
  const ctx0 = { sessionId: 's1', session: createToolSession(), userContext: {} };

  // The fallback returns a LIST: an optional field ships with its Skip control,
  // so the way out arrives with the question rather than a turn later.
  const first = async (tools, text) => (await tools.autoControlFor(ctx0, text) || [])[0];

  test('the control is built for the field that is due, from its schema', async () => {
    const { tools } = withDraft({ serviceId: 'S1', slots: {} });
    const c = await first(tools, 'Could you tell me your duty station or office?');
    expect(c.slotId).toBe('location');
    // And it searches duty stations, not people — the original complaint.
    expect(c.children[0].source.directory).toBe('location');
  });

  // Under variant B the fallback follows the QUEUE, not the wording of the reply:
  // when the date is the field due, it is a date picker that appears.
  test('a date field, when it is the one due, yields a date picker', async () => {
    const { tools } = withDraft({ serviceId: 'S1', slots: { location: { value: 'GVA' } } });
    const c = await first(tools, 'When are you travelling?');
    expect(c.slotId).toBe('when');
    expect(c.type).toBe('date');
  });

  test('when the reply matches nothing, the next askable field is used', async () => {
    const { tools } = withDraft({ serviceId: 'S1', slots: {} });
    expect((await first(tools, 'Let me get a couple of details.')).slotId).toBe('location');
  });

  // CHANGED with the field-rule port: an unfilled OPTIONAL field is offered, as
  // the state machine has always offered it — with "(optional)" on the label and
  // a Skip beside it. The previous behaviour (required-only) meant the assistant
  // silently dropped fields the form was willing to collect.
  test('an unfilled optional field is offered, marked optional, with a way out', async () => {
    const { tools } = withDraft({ serviceId: 'S1', slots: { location: { value: 'GVA' }, when: { value: '2026-09-01' } } });
    const controls = await tools.autoControlFor(ctx0, 'Anything else to add?');
    expect(controls.map((c) => c.slotId)).toEqual(['notes', '__skip__']);
    expect(controls[0].label).toContain('(optional)');
  });

  // With the form as the terminal, "nothing left to ask" is precisely when the
  // hand-off appears — so the old invariant is asserted in the chat-terminal mode.
  test('once everything askable is filled or skipped, no control is invented', async () => {
    const prev = process.env.FLOWDESK_FINAL_GATE;
    process.env.FLOWDESK_FINAL_GATE = 'submit';
    try {
    const { tools } = withDraft({
      serviceId: 'S1',
      slots: { location: { value: 'GVA' }, beneficiary: { value: 'me' }, when: { value: '2026-09-01' }, notes: { value: 'n' } },
    });
      expect(await tools.autoControlFor(ctx0, 'All set.')).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = prev;
    }
  });

  test('…and with the form as the terminal, that is when it is offered', async () => {
    const { tools } = withDraft({
      serviceId: 'S1',
      slots: { location: { value: 'GVA' }, beneficiary: { value: 'me' }, when: { value: '2026-09-01' }, notes: { value: 'n' } },
    });
    const auto = await tools.autoControlFor({ ...ctx0, session: createToolSession() }, 'All set.');
    expect((auto || [])[0].slotId).toBe('__open_form__');
  });

  test('no draft means no control — a plain answer must not sprout one', async () => {
    const { tools } = withDraft(null);
    expect(await tools.autoControlFor(ctx0, 'Home leave is an entitlement to travel home.')).toBeNull();
  });
});
