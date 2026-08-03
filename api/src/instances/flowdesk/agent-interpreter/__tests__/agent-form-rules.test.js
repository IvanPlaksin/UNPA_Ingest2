'use strict';

/**
 * The field rules the state machine has always enforced, now enforced for the
 * agent by the SAME module (form-policy). Each test names the rule and the
 * failure it prevents; a rule that only lives in the system prompt is a
 * suggestion, and the arena has shown what models do with suggestions.
 */

const { createAgentTools, createToolSession } = require('../agent-tools');

/** A form exercising every rule: conditional visibility, requiredWhen, autoResolve, dependencies. */
const SNAPSHOT = {
  serviceId: 'SVC-1',
  version: 1,
  metadata: { title: 'Test Service', altioraOusId: 59 },
  phases: ['context', 'detail', 'closing'],
  slots: [
    { slotId: 'travelType', type: 'enum', required: true, phase: 'context', promptHint: 'Type of travel',
      presentOptions: [{ value: 'official', label: 'Official' }, { value: 'personal', label: 'Personal' }] },
    // Visible only for official travel.
    { slotId: 'projectCode', type: 'text', required: true, phase: 'detail', promptHint: 'Project code',
      trefCondition: "slots.travelType == 'official'" },
    // Required only when the travel is official; visible always.
    { slotId: 'justification', type: 'text', phase: 'detail', promptHint: 'Justification',
      requiredWhen: "slots.travelType == 'official'" },
    // Never a question — the system fills it.
    { slotId: 'requestedBy', type: 'text', required: true, phase: 'context', autoResolve: true, promptHint: 'Requested by' },
    // Offered, not demanded.
    { slotId: 'comments', type: 'text', phase: 'closing', promptHint: 'Anything else', helpText: 'Optional notes for the approver' },
    // Ordered after the field it depends on even though it sits in the same phase.
    { slotId: 'endDate', type: 'date', required: true, phase: 'detail', promptHint: 'End date', dependsOn: ['startDate'] },
    { slotId: 'startDate', type: 'date', required: true, phase: 'detail', promptHint: 'Start date' },
  ],
};

function harness(overrides = {}) {
  const draft = { sessionId: 's1', serviceId: 'SVC-1', slots: {}, status: 'draft' };
  // As in the real service: there is no draft until one is created. A fixture
  // that hands one back from the start would hide the idempotency guardrail.
  let created = false;
  const draftService = {
    get: jest.fn(async () => (created ? draft : null)),
    create: jest.fn(async () => { created = true; return draft; }),
    patch: jest.fn(async (_s, patches) => {
      for (const p of patches) draft.slots[p.slotId] = { value: p.value, pending: !!p.pending };
      return draft;
    }),
    submit: jest.fn(async () => ({ srNumber: 'SR-1' })),
    escalate: jest.fn(async () => ({ escalationId: 'esc-1' })),
    ...overrides.draftService,
  };
  const tools = createAgentTools({
    draftService,
    loadSnapshot: async () => SNAPSHOT,
    resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'SVC-1', title: 'Test Service' }],
    tools: { searchArticles: async () => [] },
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

const ids = (list) => (list || []).map((f) => f.slotId);

/**
 * Every form carries the request-level overlay (who it is for, which duty
 * station, the free-text summary) — see form-overlay. The rule tests below are
 * about the SERVICE's own fields, so the overlay is answered first, exactly as a
 * real conversation would.
 */
const OVERLAY_ANSWERS = { description: 'because' };

async function started(h, { fillOverlay = true } = {}) {
  await h.tools.execute('catalog_search', { query: 'test' }, h.ctx);
  const created = await h.tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
  if (!fillOverlay) return created;
  h.session.skippedSlotIds.add('sharedWith'); // optional, and asked at the very end
  await pickContext(h, { beneficiary: 'me', location: 'Geneva' });
  const after = await h.tools.execute('draft_update', { fields: OVERLAY_ANSWERS }, h.ctx);
  // The queue as it stands once the overlay is answered — which is where the
  // service's own rules start.
  return { ...created, ...after, willAsk: created.willAsk };
}

describe('the request-level overlay is applied to every form', () => {
  test('the duty station is in the queue even though the service schema has no such field', async () => {
    const h = harness();
    const created = await started(h, { fillOverlay: false });
    // The duty-station question now NAMES the duty station it is about to propose,
    // taken from the caller's own profile. The bare label was what left the model
    // asking cold while the control below it already held the answer
    // (fdv2-781b9302). This harness supplies an acting user, so the composed form is
    // what a real turn produces.
    expect(created.willAsk).toContain('Your profile has you at New York HQ. Should this request be handled there?');
    // And it is asked before the service's own fields: it is context.
    expect(created.nextField.slotId).toBe('beneficiary');

    await pickContext(h, { beneficiary: 'me' });
    const upd = await h.tools.execute('draft_update', { fields: { description: 'x' } }, h.ctx);
    expect(upd.nextField.slotId).toBe('location');
    expect(ids(upd.stillMissing)).toContain('location');
  });

  test('the duty station cannot be skipped — it is required', async () => {
    const h = harness();
    await started(h, { fillOverlay: false });
    const res = await h.tools.recordSkip(h.ctx, 'location');
    expect(res.ok).toBe(false);
  });
});

describe('rule 1 — trefCondition: a hidden field is never asked', () => {
  test('projectCode is absent until the travel is official', async () => {
    const h = harness();
    const created = await started(h);
    expect(ids(created.fields)).not.toContain('projectCode');

    const upd = await h.tools.execute('draft_update', { fields: { travelType: 'official' } }, h.ctx);
    expect(ids(upd.stillMissing)).toContain('projectCode');
  });

  test('choosing personal travel keeps it hidden', async () => {
    const h = harness();
    await started(h);
    const upd = await h.tools.execute('draft_update', { fields: { travelType: 'personal' } }, h.ctx);
    expect(ids(upd.stillMissing)).not.toContain('projectCode');
    expect(ids(upd.optionalRemaining)).not.toContain('projectCode');
  });
});

describe('rule 2 — requiredWhen: conditional requiredness', () => {
  test('justification is optional for personal travel and required for official', async () => {
    const personal = harness();
    await started(personal);
    const p = await personal.tools.execute('draft_update', { fields: { travelType: 'personal' } }, personal.ctx);
    expect(ids(p.stillMissing)).not.toContain('justification');
    expect(ids(p.optionalRemaining)).toContain('justification');

    const official = harness();
    await started(official);
    const o = await official.tools.execute('draft_update', { fields: { travelType: 'official' } }, official.ctx);
    expect(ids(o.stillMissing)).toContain('justification');
  });
});

describe('rule 3 — autoResolve is never a question', () => {
  test('requestedBy is required on the schema but never offered to the model', async () => {
    const h = harness();
    const created = await started(h);
    expect(ids(created.fields)).not.toContain('requestedBy');
    const upd = await h.tools.execute('draft_update', { fields: { travelType: 'official' } }, h.ctx);
    expect(ids(upd.stillMissing)).not.toContain('requestedBy');
  });
});

describe('rule 5 — dependsOn and phase ordering', () => {
  test('the context phase comes first, and endDate waits for startDate', async () => {
    const h = harness();
    const created = await started(h);
    expect(created.nextField.slotId).toBe('travelType');

    await h.tools.execute('draft_update', { fields: { travelType: 'official' } }, h.ctx);
    const afterProject = await h.tools.execute('draft_update', { fields: { projectCode: 'P-1', justification: 'x' } }, h.ctx);
    expect(afterProject.nextField.slotId).toBe('startDate');

    const afterStart = await h.tools.execute('draft_update', { fields: { startDate: '2026-08-01' } }, h.ctx);
    expect(afterStart.nextField.slotId).toBe('endDate');
  });
});

describe('rule 6 — a stale value is asked again', () => {
  test('a slot marked stale returns to the missing list', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'official' } }, h.ctx);
    h.draft.slots.travelType.stale = true;
    const upd = await h.tools.execute('draft_update', { fields: { projectCode: 'P-1' } }, h.ctx);
    expect(ids(upd.stillMissing)).toContain('travelType');
  });
});

describe('rule 7 — optional fields carry a way out', () => {
  test('emit_control on an optional field marks it optional and adds a Skip control', async () => {
    const h = harness();
    await started(h);
    // Everything ahead of it is in, so `comments` is the field due.
    await h.tools.execute('draft_update', {
      fields: { travelType: 'personal', justification: 'x', startDate: '2026-08-01', endDate: '2026-08-05' },
    }, h.ctx);
    const res = await h.tools.execute('emit_control', { type: 'text', slotId: 'comments' }, h.ctx);

    expect(res.ok).toBe(true);
    expect(res.optional).toBe(true);
    expect(h.ctx.session.controls).toHaveLength(2);
    const skip = h.ctx.session.controls[1];
    expect(skip.slotId).toBe('__skip__');
    expect(skip.options[0].value).toBe('comments');
    // The field's own help text reaches the label the user reads.
    expect(h.ctx.session.controls[0].label).toContain('Optional notes for the approver');
    expect(h.ctx.session.controls[0].label).toContain('(optional)');
  });

  test('a required field gets no Skip control', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('emit_control', { type: 'choice', slotId: 'travelType' }, h.ctx);
    expect(h.ctx.session.controls.map((c) => c.slotId)).not.toContain('__skip__');
  });

  test('a skipped field leaves the queue for good', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'personal' } }, h.ctx);
    h.session.skippedSlotIds.add('comments');
    const upd = await h.tools.execute('draft_update', { fields: { startDate: '2026-08-01' } }, h.ctx);
    expect(ids(upd.optionalRemaining)).not.toContain('comments');
  });
});

describe('rule 9 — a long form is offered, not walked', () => {
  const BIG = { ...SNAPSHOT, slots: Array.from({ length: 16 }, (_, i) => ({ slotId: `f${i}`, type: 'text', required: true, phase: 'detail', promptHint: `Field ${i}` })) };

  test('draft_create flags the form and offers the choice once', async () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService, loadSnapshot: async () => BIG,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'SVC-1', title: 'Big' }],
    });
    await tools.execute('catalog_search', { query: 'x' }, h.ctx);
    // The offer waits for the opening questions: proposing the form before
    // "who is this for?" and "which duty station?" jumps over the two fields
    // that decide whether the service is available at all.
    const early = await tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
    expect(early.largeForm).toBeUndefined();

    await pickContext({ ...h, tools }, { beneficiary: 'me', location: 'Geneva' });
    await tools.execute('draft_update', { fields: { description: 'x' } }, h.ctx);
    const first = await tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
    expect(first.largeForm.fieldCount).toBeGreaterThanOrEqual(16);

    // The payload keeps being returned until the control is actually on screen —
    // marking it "offered" when only the model had heard about it is what let a
    // 29-field form be walked one question at a time (fdv2-996e487d). Rendering
    // the fork is what closes it.
    await tools.execute('emit_control', {
      type: 'choice', slotId: '__open_form__', options: [{ value: 'open', label: 'Open' }, { value: 'stay', label: 'Stay' }],
    }, h.ctx);
    const second = await tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
    expect(second.largeForm).toBeUndefined();
  });

  test('open_form hands over the draft, pre-filled', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'official' } }, h.ctx);
    const res = await h.tools.execute('open_form', {}, h.ctx);
    expect(res.ok).toBe(true);
    expect(h.session.openForm.serviceId).toBe('SVC-1');
    expect(h.session.openForm.ousId).toBe(59);
    expect(h.session.openForm.prefill).toBeTruthy();
  });

  test('open_form without a draft refuses rather than promising', async () => {
    const h = harness({ draftService: { get: jest.fn(async () => null) } });
    const res = await h.tools.execute('open_form', {}, h.ctx);
    expect(res.ok).toBe(false);
  });
});

describe('the auto-control fallback obeys the same rules', () => {
  test('it never picks a hidden, auto-resolved or skipped field', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'personal' } }, h.ctx);
    h.session.skippedSlotIds.add('comments');

    const auto = await h.tools.autoControlFor(h.ctx, 'What are the dates?');
    const slotIds = auto.map((c) => c.slotId);
    expect(slotIds).not.toContain('projectCode');   // hidden for personal travel
    expect(slotIds).not.toContain('requestedBy');   // autoResolve
    expect(slotIds).not.toContain('comments');      // skipped
    // Form order decides, not requiredness: justification is optional here but
    // sits earlier on the form than the dates, so it is what gets asked.
    expect(slotIds[0]).toBe('justification');
  });

  test('an optional target brings its Skip control with it', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', {
      fields: { travelType: 'personal', justification: 'x', startDate: '2026-08-01', endDate: '2026-08-05' },
    }, h.ctx);

    const auto = await h.tools.autoControlFor(h.ctx, 'Anything else to add?');
    expect(auto.map((c) => c.slotId)).toEqual(['comments', '__skip__']);
  });

  test('nothing left to ask → the form hand-off, or nothing in chat-terminal mode', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', {
      fields: { travelType: 'personal', startDate: '2026-08-01', endDate: '2026-08-05', justification: 'x' },
    }, h.ctx);
    h.session.skippedSlotIds.add('comments');

    const auto = await h.tools.autoControlFor(h.ctx, 'All done.');
    expect((auto || [])[0].slotId).toBe('__open_form__');

    const prev = process.env.FLOWDESK_FINAL_GATE;
    process.env.FLOWDESK_FINAL_GATE = 'submit';
    try {
      const chat = harness();
      await started(chat);
      await chat.tools.execute('draft_update', {
        fields: { travelType: 'personal', startDate: '2026-08-01', endDate: '2026-08-05', justification: 'x' },
      }, chat.ctx);
      chat.session.skippedSlotIds.add('comments');
      expect(await chat.tools.autoControlFor(chat.ctx, 'All done.')).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = prev;
    }
  });
});

// Variant B: the field is the code's decision, so a control for any other field
// is refused outright. A warning was not enough — live, the model wrote about the
// duty station, attached the subject control, and the mandatory field was lost.
describe('the code chooses the field, the model writes the words', () => {
  // The model cannot name a field any more (A4): `target:"field"` means "the one
  // due", and the schema offers no other way to point at a form field. The case
  // this test used to cover — naming the wrong field — is unreachable by
  // contract, so what is worth asserting is that the code picks the right one.
  test('asking for "the field" gives the field that is due, whatever the model had in mind', async () => {
    const h = harness();
    await started(h);
    const res = await h.tools.execute('emit_control', { type: 'text', target: 'field' }, h.ctx);
    expect(res.ok).toBe(true);
    expect(h.ctx.session.controls[0].slotId).toBe('travelType');
  });

  test('an out-of-order ANSWER is still accepted — only the question is constrained', async () => {
    const h = harness();
    await started(h);
    const upd = await h.tools.execute('draft_update', { fields: { comments: 'note first' } }, h.ctx);
    expect(upd.ok).toBe(true);
    expect(h.draft.slots.comments.value).toBe('note first');
    expect(upd.nextField.slotId).toBe('travelType');
  });

  test('emitting the field the queue is actually on carries no warning', async () => {
    const h = harness();
    await started(h);
    const res = await h.tools.execute('emit_control', { type: 'choice', slotId: 'travelType' }, h.ctx);
    expect(res.warning).toBeUndefined();
  });
});

describe('GUARDRAIL 4 — re-creating a draft must not wipe it', () => {
  test('a second draft_create for the same service keeps every answer', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'official', projectCode: 'P-1' } }, h.ctx);

    const again = await h.tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
    expect(again.ok).toBe(true);
    expect(again.alreadyOpen).toBe(true);
    expect(h.draft.slots.projectCode.value).toBe('P-1');
    expect(h.draftService.create).toHaveBeenCalledTimes(1);
    expect(ids(again.stillMissing)).not.toContain('projectCode');
  });

  test('values passed on the second call are recorded rather than dropped', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'official' } }, h.ctx);

    await h.tools.execute('draft_create', { serviceCode: 'SVC-1', fields: { projectCode: 'P-2' } }, h.ctx);
    expect(h.draft.slots.projectCode.value).toBe('P-2');
  });
});

// The state machine's structural guarantee: a turn can only reach the
// confirmation when the askable queue is empty (interpreter-engine
// `if (remaining.length === 0)`). Without it the agent walked past a required
// field — Ivan's "the chat skipped the mandatory location question".
describe('GUARDRAIL 5 — mandatory fields cannot be walked past', () => {
  const prevGate = process.env.FLOWDESK_FINAL_GATE;
  beforeAll(() => { process.env.FLOWDESK_FINAL_GATE = 'submit'; }); // about the chat terminal
  afterAll(() => { if (prevGate === undefined) delete process.env.FLOWDESK_FINAL_GATE; else process.env.FLOWDESK_FINAL_GATE = prevGate; });

  test('the confirm control is refused while a required field is empty', async () => {
    const h = harness();
    await started(h);
    const res = await h.tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, h.ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Type of travel');
    expect(h.ctx.session.confirmShown).toBe(false);
  });

  test('submitting is refused too, even if a confirm was accepted earlier', async () => {
    const h = harness();
    await started(h);
    h.session.confirmShown = true;
    h.session.confirmAccepted = true;
    const res = await h.tools.execute('draft_submit', {}, h.ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('required');
    expect(h.draftService.submit).not.toHaveBeenCalled();
  });

  test('once everything required is filled, the confirmation is allowed', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', {
      fields: { travelType: 'personal', startDate: '2026-08-01', endDate: '2026-08-05' },
    }, h.ctx);
    const res = await h.tools.execute('emit_control', { type: 'confirm', slotId: '__confirm__' }, h.ctx);
    expect(res.ok).toBe(true);
    expect(h.ctx.session.confirmShown).toBe(true);
  });
});

describe('ADCC-097 — a required field cannot be skipped', () => {
  test('Skip on a required field is refused and it stays in the queue', async () => {
    const h = harness();
    await started(h);
    const res = await h.tools.recordSkip(h.ctx, 'travelType');
    expect(res.ok).toBe(false);
    expect(res.label).toBe('Type of travel');
    expect(res.choices).toEqual(['provide', 'park', 'cancel']);
    expect(h.session.skippedSlotIds.has('travelType')).toBe(false);

    const upd = await h.tools.execute('draft_update', { fields: { startDate: '2026-08-01' } }, h.ctx);
    expect(ids(upd.stillMissing)).toContain('travelType');
  });

  test('Skip on an optional field is accepted', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'personal' } }, h.ctx);
    const res = await h.tools.recordSkip(h.ctx, 'comments');
    expect(res.ok).toBe(true);
    expect(h.session.skippedSlotIds.has('comments')).toBe(true);
  });

  test('a field that is required only conditionally can be skipped while the condition is off', async () => {
    const h = harness();
    await started(h);
    await h.tools.execute('draft_update', { fields: { travelType: 'personal' } }, h.ctx);
    expect((await h.tools.recordSkip(h.ctx, 'justification')).ok).toBe(true);

    const official = harness();
    await started(official);
    await official.tools.execute('draft_update', { fields: { travelType: 'official' } }, official.ctx);
    expect((await official.tools.recordSkip(official.ctx, 'justification')).ok).toBe(false);
  });
});

describe('a refusal must say what to do next', () => {
  // A SERVICE field, not a context one: `beneficiary` and `location` are part of
  // the overlay and are legitimately asked before the form opens.
  // Before a draft exists there are still fields to ask — the opening ones — so
  // "the field" resolves to those. A SERVICE field cannot be requested at all,
  // because the model never names one (A4).
  test('before the draft exists, "the field" is an opening question', async () => {
    const h = harness();
    await h.tools.execute('catalog_search', { query: 'test' }, h.ctx);
    const res = await h.tools.execute('emit_control', { type: 'confirm', target: 'field' }, h.ctx);
    expect(res.ok).toBe(true);
    expect(res.control.slotId).toBe('beneficiary');
  });

  test('the model\'s own controls still work without a draft', async () => {
    const h = harness();
    const res = await h.tools.execute('emit_control', {
      type: 'choice', slotId: '__service__', options: [{ value: 'A', label: 'A' }],
    }, h.ctx);
    expect(res.ok).toBe(true);
  });
});

describe('an invented slotId cannot swallow the answer', () => {
  // A made-up field name can no longer be expressed: `target` is a closed enum
  // and `field` carries no name. This asserts the contract itself.
  test('the schema offers no way to name a field, so none can be invented', () => {
    const { TOOL_SCHEMAS } = require('../agent-tools');
    const emit = TOOL_SCHEMAS.find((t) => t.name === 'emit_control');
    expect(emit.input_schema.properties.target.enum)
      .toEqual(['field', '__service__', '__confirm__', '__open_form__', '__skip__']);
  });

  // `__recipient__` is NOT an example here any more — it is an alias for the
  // beneficiary field (see SLOT_ALIASES). This is a control that is genuinely the
  // model's own: a choice between the services it just found.
  test('a control that is genuinely the model\'s own is unaffected', async () => {
    const h = harness();
    await started(h);
    const res = await h.tools.execute('emit_control', {
      type: 'choice', slotId: '__service__', options: [{ value: 'SVC-1', label: 'Test Service' }],
    }, h.ctx);
    expect(res.ok).toBe(true);
    expect(res.control.slotId).toBe('__service__');
  });
});

describe('the open request is named every turn', () => {
  test('the brief carries the serviceCode, which tool traffic does not survive to give', async () => {
    const h = harness();
    await started(h);
    const brief = await h.tools.turnBrief(h.ctx);
    expect(brief).toContain('SVC-1');
    expect(brief).toContain('do NOT call draft_create again');
  });

  test('no draft, no brief — nothing to restate', async () => {
    const h = harness();
    expect(await h.tools.turnBrief(h.ctx)).toBeNull();
  });
});

/**
 * Session fdv2-2161acf8: the agent found the service, asked "is this extension
 * request for yourself, or for someone else?" — and shipped NO controls. The
 * recipient question comes before the form, and the code only ever looked inside
 * a draft that did not exist yet.
 */
describe('the recipient question carries its controls, before any form exists', () => {
  const ME = { userId: 'u1', name: 'Ivan Plaksin', email: 'ivan@un.org' };
  const withDirectory = () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => SNAPSHOT,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'SVC-1', title: 'Test Service' }],
      directory: { getCurrentUser: async () => ME },
    });
    return { ...h, tools };
  };

  test('a "Yes" that means ME, plus a directory autocomplete to choose someone else', async () => {
    const h = withDirectory();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);

    const [control, ...rest] = await h.tools.autoControlFor(h.ctx, 'Is this request for yourself, or for someone else?');
    expect(rest).toHaveLength(0);
    expect(control.slotId).toBe('beneficiary');
    expect(control.type).toBe('confirm');
    // 1 — the confirm agrees to the signed-in user, not to nothing.
    expect(control.defaultValue).toEqual(ME);
    // 2 — and the search child is bound to the PEOPLE directory.
    expect(control.children[0].type).toBe('autocomplete');
    expect(control.children[0].source.directory).toBe('user');
  });

  test('the model can emit it itself, and gets the same control', async () => {
    const h = withDirectory();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const res = await h.tools.execute('emit_control', { type: 'confirm', slotId: 'beneficiary' }, h.ctx);
    expect(res.ok).toBe(true);
    expect(res.control.defaultValue).toEqual(ME);
    expect(res.control.children[0].source.directory).toBe('user');
  });

  test('before a service is found there is nothing to be "for"', async () => {
    const h = withDirectory();
    expect(await h.tools.autoControlFor(h.ctx, 'What do you need?')).toBeNull();
  });

  test('"Yes" resolves to the signed-in user and survives into the draft', async () => {
    const h = withDirectory();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);

    expect(await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', true)).toBe(true);
    expect(h.session.pendingContext.beneficiary).toEqual(ME);

    await h.tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
    expect(h.draft.slots.beneficiary.value).toEqual(ME);
    expect(h.session.pendingContext).toEqual({});
  });

  test('choosing a colleague from the autocomplete stores that person instead', async () => {
    const h = withDirectory();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const other = { userId: 'u2', name: 'Maria Rossi' };

    await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', other);
    expect(h.session.pendingContext.beneficiary).toEqual(other);
    // Answered → the opening queue moves on to where they are based, rather than
    // asking who it is for a second time.
    const next = await h.tools.autoControlFor(h.ctx, 'Anything else?');
    expect(next[0].slotId).toBe('location');
  });

  test('once the draft owns the slot, pre-draft recording steps aside', async () => {
    const h = withDirectory();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    await h.tools.execute('draft_create', { serviceCode: 'SVC-1' }, h.ctx);
    expect(await h.tools.recordPreDraftAnswer(h.ctx, 'beneficiary', true)).toBe(false);
  });
});

describe('the "Yes" always confirms someone', () => {
  const noDirectory = () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => SNAPSHOT,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'SVC-1', title: 'T' }],
      directory: { getCurrentUser: async () => null }, // unauthenticated, as live without a token
    });
    return { ...h, tools };
  };

  test('when the directory cannot answer, the caller from the turn is used', async () => {
    const h = noDirectory();
    h.ctx.userContext = { userId: 'u9', name: 'Ivan Plaksin', email: 'ivan@un.org' };
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    const [control] = await h.tools.autoControlFor(h.ctx, 'Is this for you?');
    expect(control.defaultValue).toEqual({ userId: 'u9', name: 'Ivan Plaksin', email: 'ivan@un.org' });
  });

  test('with nothing known about the caller, the control still renders and can be searched', async () => {
    const h = noDirectory();
    h.ctx.userContext = {}; h.ctx.userId = null;
    await h.tools.execute('catalog_search', { query: 'x' }, h.ctx);
    const [control] = await h.tools.autoControlFor(h.ctx, 'Is this for you?');
    expect(control.defaultValue).toBeUndefined();
    expect(control.children[0].source.directory).toBe('user');
  });
});

/**
 * Session fdv2-039fd2b4: after the service was chosen the agent asked "is this
 * extension request for yourself, or for someone else?" and emitted its OWN
 * `__recipient__` menu. Clicking it filled nothing, so the next turn had to ask
 * for the person all over again. The recipient question IS the beneficiary field.
 */
describe('the recipient question cannot be answered by a menu of the model\'s own', () => {
  const ME = { userId: 'u1', name: 'Ivan Plaksin' };
  const withDir = () => {
    const h = harness();
    const tools = createAgentTools({
      draftService: h.draftService,
      loadSnapshot: async () => SNAPSHOT,
      resolveSearch: async () => [{ type: 'SERVICE', serviceId: 'SVC-1', title: 'T' }],
      directory: { getCurrentUser: async () => ME },
    });
    return { ...h, tools };
  };

  test('an invented `__recipient__` becomes the real beneficiary control', async () => {
    const h = withDir();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const res = await h.tools.execute('emit_control', {
      type: 'choice', slotId: '__recipient__',
      options: [{ value: 'me', label: 'For me' }, { value: 'other', label: 'Someone else' }],
    }, h.ctx);

    expect(res.ok).toBe(true);
    expect(res.control.slotId).toBe('beneficiary');
    expect(res.control.type).toBe('confirm');
    expect(res.control.defaultValue).toEqual(ME);
    expect(res.control.children[0].source.directory).toBe('user');
  });

  test('a control of the model\'s own does not satisfy the guarantee', async () => {
    const h = withDir();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    // Something genuinely its own — not an alias — emitted this turn.
    const emitted = [{ id: 'c1', type: 'choice', slotId: '__anything__', options: [] }];

    const auto = await h.tools.autoControlFor(h.ctx, 'Is this for yourself, or someone else?', emitted);
    expect(auto).not.toBeNull();
    expect(auto[0].slotId).toBe('beneficiary');
    expect(auto[0].defaultValue).toEqual(ME);
  });

  test('when the beneficiary control IS already there, nothing is duplicated', async () => {
    const h = withDir();
    await h.tools.execute('catalog_search', { query: 'extension' }, h.ctx);
    const emitted = [{ id: 'c1', type: 'confirm', slotId: 'beneficiary' }];
    expect(await h.tools.autoControlFor(h.ctx, 'Is this for you?', emitted)).toBeNull();
  });

  test('mid-form, a control for the wrong field does not satisfy the guarantee either', async () => {
    const h = withDir();
    await started(h);
    const emitted = [{ id: 'c1', type: 'text', slotId: 'comments' }];
    const auto = await h.tools.autoControlFor(h.ctx, 'What sort of travel?', emitted);
    expect(auto[0].slotId).toBe('travelType');
  });
});
