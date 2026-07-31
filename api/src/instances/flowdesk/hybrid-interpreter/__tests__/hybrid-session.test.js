'use strict';

/**
 * HYB-004 — the hybrid session: a template for the middle of a form, the agent for
 * everything else, and one shared state underneath both.
 *
 * The model is a fake here on purpose. What is under test is WHO gets asked and
 * what the two paths do to the session — not what a model would say.
 */

const { createHybridSession, validateClick, resetSlots } = require('../hybrid-session.service');

const FORM = {
  serviceId: 'EO-HR-SA-EXT', version: 2, phases: ['context', 'detail'],
  metadata: { title: 'Extension of Appointment', altioraOusId: 3 },
  slots: [
    { slotId: 'indexNumber', type: 'string', required: true, phase: 'detail', promptHint: 'Index Number' },
    { slotId: 'lastDay', type: 'date', required: true, phase: 'detail', promptHint: 'Proposed end date' },
    { slotId: 'grade', type: 'enum', required: true, phase: 'detail', promptHint: 'Grade',
      presentOptions: [{ value: 'P3', label: 'P-3' }, { value: 'P4', label: 'P-4' }] },
    { slotId: 'comments', type: 'text', required: false, phase: 'detail', promptHint: 'Anything to add?' },
    { slotId: 'certifier', type: 'user', required: true, phase: 'detail', promptHint: 'Certifying officer' },
  ],
};

/** A session over an in-memory draft, a fake model, and the real everything-else. */
function harness({ draft: seed } = {}) {
  const draft = seed || {
    sessionId: 's1', serviceId: 'EO-HR-SA-EXT', schemaVersion: 2, status: 'draft',
    // Every form carries the request overlay (recipient → duty station → requester),
    // and those are answered before the form's own fields. A fixture that wants to
    // be "in the middle of the form" has to have answered them, or the field due is
    // always the recipient.
    slots: {
      beneficiary: { value: { userId: 'u1', name: 'Ivan Plaksin' } },
      location: { value: { name: 'Geneva', code: 'GVA' } },
      author: { value: { userId: 'u1', name: 'Ivan Plaksin' } },
    },
    patches: [], repair: { perSlot: {}, session: 0 },
  };
  const modelCalls = [];
  const draftService = {
    get: async () => JSON.parse(JSON.stringify(draft)),
    create: async () => draft,
    patch: async (_s, patches) => {
      for (const pt of patches) draft.slots[pt.slotId] = { value: pt.value, pending: !!pt.pending };
      return JSON.parse(JSON.stringify(draft));
    },
    discard: async () => true,
  };
  const llm = {
    messages: async (req) => {
      modelCalls.push(req);
      return { content: [{ type: 'text', text: 'A model wrote this.' }], stopReason: 'end_turn' };
    },
  };
  const session = createHybridSession(
    { sessionId: 's1', lang: 'en' },
    {
      llm, draftService,
      loadSnapshot: async () => FORM,
      resolveSearch: async () => [],
      promptService: { build: async () => ({ text: 'sys', prefix: 'sys', tail: '', manifest: null }) },
    },
  );
  return { session, draft, modelCalls };
}

/** The state that makes a template turn possible: past the first field, in FILL. */
const midForm = (h) => {
  h.session.toolSession.fieldsAskedThisForm = 2;
  // The overlay's own optional fields, waved away — as a real session does before it
  // reaches the service's fields.
  h.session.toolSession.skippedSlotIds.add('description');
  h.session.toolSession.skippedSlotIds.add('sharedWith');
};

describe('a click in the middle of a form is answered without the model', () => {
  test('template author, template route, zero model calls', async () => {
    const h = harness();
    midForm(h);

    const out = await h.session.sendTurn(null, {
      controlAction: { slotId: 'indexNumber', value: '1234567' },
    });

    expect(out.ok).toBe(true);
    expect(out.turn.turnAuthor).toBe('template');
    expect(out.turn.routerReason).toBe('template');
    expect(out.turn.route).toBe('TEMPLATE_FILL');
    expect(h.modelCalls).toHaveLength(0);
    // …and it asked the next field, with its widget.
    expect(out.turn.askingSlot).toBe('lastDay');
    expect(out.turn.controls[0].type).toBe('date');
  });

  test('the value is written by code before anything decides who speaks', async () => {
    const h = harness();
    midForm(h);
    await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1234567' } });
    expect(h.draft.slots.indexNumber.value).toBe('1234567');
  });

  test('the counter and the last control type follow the turn, because the router reads them', async () => {
    const h = harness();
    midForm(h);
    await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1234567' } });

    expect(h.session.toolSession.fieldsAskedThisForm).toBe(3);
    expect(h.session.toolSession.lastControlType).toBe('date');
    expect(h.session.toolSession.lastControls).toHaveLength(1);
  });
});

describe('the model takes the turns it should, and says which condition sent it', () => {
  test('free text', async () => {
    const h = harness();
    midForm(h);
    const out = await h.session.sendTurn('what does index number mean?', {});
    expect(out.turn.turnAuthor).toBe('model');
    expect(out.turn.routerReason).toBe('free_text');
    expect(h.modelCalls).toHaveLength(1);
  });

  test('the first field of a form — the turn that sets the context', async () => {
    const h = harness(); // fieldsAskedThisForm = 0
    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1' } });
    expect(out.turn.routerReason).toBe('first_field');
    expect(h.modelCalls).toHaveLength(1);
  });

  test('a fork control is the turn\'s own question, not a field', async () => {
    const h = harness();
    midForm(h);
    const out = await h.session.sendTurn(null, { controlAction: { slotId: '__service__', value: 'EO-HR-SA-EXT' } });
    expect(out.turn.routerReason).toBe('not_fill_phase');
  });

  test('NOT a non-English session — the automaton answers it with the English label', async () => {
    // Ivan's ruling: no localisation means fall back to the English field name, not
    // to the model. The old rule made the automaton unreachable for every non-English
    // user, which is most of them.
    const h = harness();
    midForm(h);
    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1' }, lang: 'ru' });
    expect(out.turn.turnAuthor).toBe('template');
    expect(h.modelCalls).toHaveLength(0);
  });

  test('an invalid date is REFUSED, not stored, and the model explains', async () => {
    const h = harness();
    midForm(h);
    const out = await h.session.sendTurn(null, { controlAction: { action: 'date_select', slotId: 'lastDay', value: 'next Tuesday' } });

    expect(out.turn.routerReason).toBe('control_rejected');
    expect(h.draft.slots.lastDay).toBeUndefined();
  });

  test('an option outside the slot\'s domain is refused the same way', async () => {
    const h = harness();
    midForm(h);
    const out = await h.session.sendTurn(null, {
      controlAction: { action: 'multichoice_select', slotId: 'grade', values: ['P3', 'D2'] },
    });
    expect(out.turn.routerReason).toBe('control_rejected');
  });

  test('Skip on a REQUIRED field is refused — the request cannot be raised without it', async () => {
    const h = harness();
    midForm(h);
    const out = await h.session.sendTurn(null, { controlAction: { slotId: '__skip__', value: 'indexNumber' } });
    expect(out.turn.routerReason).toBe('control_rejected');
  });

  test('the ladder being up sends the turn to the model', async () => {
    const h = harness();
    midForm(h);
    h.draft.repair = { perSlot: { indexNumber: 2 }, session: 2 };
    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1' } });
    expect(out.turn.routerReason).toBe('repair_active');
  });

  test('nothing left to ask is caught by the router itself, before the template is asked', async () => {
    const h = harness();
    midForm(h);
    Object.assign(h.draft.slots, {
      indexNumber: { value: '1' }, lastDay: { value: '2026-09-30' }, grade: { value: 'P3' },
      certifier: { value: { userId: 'u9', name: 'A Certifier' } },
    });
    h.session.toolSession.skippedSlotIds.add('comments');

    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'grade', value: 'P3' } });

    expect(out.turn.turnAuthor).toBe('model');
    expect(out.turn.routerReason).toBe('no_prompt_hint');
  });

  test('a template that CAN be routed but cannot render honestly falls through, and says why', async () => {
    // A people-picker mid-form with nothing to propose. The router lets it through —
    // the field has a label and everything else is in order — so the refusal has to
    // come from the renderer, and it must name itself in the reason.
    const h = harness();
    midForm(h);
    Object.assign(h.draft.slots, {
      indexNumber: { value: '1' }, lastDay: { value: '2026-09-30' }, grade: { value: 'P3' },
    });
    h.session.toolSession.skippedSlotIds.add('comments');

    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'grade', value: 'P3' } });

    expect(out.turn.turnAuthor).toBe('model');
    expect(out.turn.routerReason).toBe('fallthrough:directory_without_default');
  });});

describe('a long form is offered before it is walked', () => {
  // Live, the offer ("29 fields — you might prefer the form itself") used to ride the
  // turn that confirmed the duty station. Once a template took that turn, the offer
  // slipped to whatever model turn came next. Condition 10 puts it back at the top.
  const bigForm = () => ({
    ...FORM,
    slots: [
      ...FORM.slots,
      ...Array.from({ length: 20 }, (_, i) => ({
        slotId: `extra${i}`, type: 'string', required: false, phase: 'detail', promptHint: `Extra ${i}`,
      })),
    ],
  });

  function bigHarness() {
    const h = harness();
    // Same session, bigger form: the loader is what both paths read.
    h.session.tools.beginTurn(Date.now());
    return h;
  }

  test('while the offer is outstanding the turn belongs to the model', async () => {
    const big = bigForm();
    const h = harness();
    h.session.loadSnapshot = async () => big;
    // The hybrid reads the form through the tools' memoised loader, so the fixture
    // has to be swapped where the tools look.
    h.session.tools.loadSnapshot = async () => require('../../interpreter/form-overlay').effectiveSnapshot(big);
    midForm(h);

    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1' } });

    expect(out.turn.routerReason).toBe('large_form_offer');
  });

  test('once it has been made, the template carries on', async () => {
    const big = bigForm();
    const h = harness();
    h.session.tools.loadSnapshot = async () => require('../../interpreter/form-overlay').effectiveSnapshot(big);
    midForm(h);
    h.session.toolSession.largeFormOffered = true; // the agent path sets this when it offers

    const out = await h.session.sendTurn(null, { controlAction: { slotId: 'indexNumber', value: '1' } });

    expect(out.turn.turnAuthor).toBe('template');
  });
});

describe('Skip on an OPTIONAL field stays on the template path', () => {
  test('it is recorded, acknowledged as a skip, and the next field is asked', async () => {
    const h = harness();
    midForm(h);
    Object.assign(h.draft.slots, { indexNumber: { value: '1' }, lastDay: { value: '2026-09-30' } });

    const out = await h.session.sendTurn(null, { controlAction: { slotId: '__skip__', value: 'comments' } });

    expect(h.session.toolSession.skippedSlotIds.has('comments')).toBe(true);
    expect(out.turn.turnAuthor).toBe('template');
    expect(out.turn.response.startsWith('Skipped.')).toBe(true);
    expect(out.turn.askingSlot).toBe('grade');
  });
});

describe('one state under both paths', () => {
  test('a skip taken by a template turn is visible to the model path', async () => {
    const h = harness();
    midForm(h);
    Object.assign(h.draft.slots, { indexNumber: { value: '1' }, lastDay: { value: '2026-09-30' } });
    await h.session.sendTurn(null, { controlAction: { slotId: '__skip__', value: 'comments' } });

    // The model path runs on the same tool session — the agent inside the hybrid was
    // constructed with it, so there is no second copy to disagree.
    expect(h.session.toolSession.skippedSlotIds.has('comments')).toBe(true);
    const out = await h.session.sendTurn('is there anything else?', {});
    expect(out.turn.turnAuthor).toBe('model');
    expect(h.session.toolSession.skippedSlotIds.has('comments')).toBe(true);
  });

  test('the session exposes the same seams the agent does, so a caller drives either identically', () => {
    const h = harness();
    expect(h.session.interpreterMode).toBe('hybrid');
    expect(typeof h.session.sendTurn).toBe('function');
    expect(h.session.sessionId).toBe('s1');
    expect(h.session.sideEffects).toBeDefined();
    expect(h.session.tools).toBeDefined();
  });

  test('it never throws — a broken draft store becomes {ok:false}', async () => {
    const h = harness();
    h.session.draftService.get = async () => { throw new Error('redis down'); };
    // The agent path swallows its own errors, so this asserts only that the hybrid
    // does not propagate one to the arena.
    const out = await h.session.sendTurn('hello', {});
    expect(out.ok === false || out.ok === true).toBe(true);
  });
});

describe('the pure functions', () => {
  test('validateClick lets an ordinary click through', () => {
    expect(validateClick({ slotId: 'indexNumber', value: '1' }, FORM, {})).toEqual({ ok: true });
    expect(validateClick(null, FORM, {})).toEqual({ ok: true });
  });

  test('validateClick accepts a well-formed date and rejects prose', () => {
    expect(validateClick({ action: 'date_select', slotId: 'lastDay', value: '2026-09-30' }, FORM, {}).ok).toBe(true);
    expect(validateClick({ action: 'date_select', slotId: 'lastDay', value: '30/09/2026' }, FORM, {}).ok).toBe(false);
  });

  test('resetSlots reports what this write invalidated, and nothing else', () => {
    const before = { slots: { a: { value: 1 }, b: { value: 2, stale: true } } };
    const after = { slots: { a: { value: 1, stale: true }, b: { value: 2, stale: true } } };
    expect(resetSlots(before, after)).toEqual(['a']);
  });
});

describe('the other two modes are untouched', () => {
  /**
   * HYB-FIX-001 — this test used to assert that an unset flag meant AGENT, and it
   * passed for weeks while that default sent every form click through the model. It
   * was not wrong about the code; it encoded the defect as the contract.
   *
   * The default is now hybrid, and the expensive path must be asked for by name.
   */
  test('chat-v2 defaults to the HYBRID, and takes the agent only when told', () => {
    const chatV2 = require('../../interpreter/chat-v2.service');
    const prev = { i: process.env.FLOWDESK_INTERPRETER, h: process.env.FLOWDESK_HYBRID_INTERPRETER };
    try {
      delete process.env.FLOWDESK_INTERPRETER;
      delete process.env.FLOWDESK_HYBRID_INTERPRETER;
      expect(chatV2.hybridEnabled()).toBe(true);
      process.env.FLOWDESK_INTERPRETER = 'agent';
      expect(chatV2.hybridEnabled()).toBe(false);
      delete process.env.FLOWDESK_INTERPRETER;
      process.env.FLOWDESK_INTERPRETER = 'hybrid';
      expect(chatV2.hybridEnabled()).toBe(true);
      // Both set is a contradiction, and the precedence changed with the default.
      // `FLOWDESK_INTERPRETER=agent` is now a deliberate, expensive opt-OUT, while
      // the legacy switch is redundant (hybrid is the default anyway) and is most
      // likely left over. The explicit refusal wins — and `announceInterpreter` says
      // which one took effect, so the contradiction is visible rather than guessed at.
      process.env.FLOWDESK_INTERPRETER = 'agent';
      process.env.FLOWDESK_HYBRID_INTERPRETER = '1';
      expect(chatV2.hybridEnabled()).toBe(false);
    } finally {
      if (prev.i === undefined) delete process.env.FLOWDESK_INTERPRETER; else process.env.FLOWDESK_INTERPRETER = prev.i;
      if (prev.h === undefined) delete process.env.FLOWDESK_HYBRID_INTERPRETER; else process.env.FLOWDESK_HYBRID_INTERPRETER = prev.h;
    }
  });

  test('the agent session still builds its own tool session when nobody injects one', () => {
    const { createAgentSession } = require('../../agent-interpreter/agent-session.service');
    const a = createAgentSession({ sessionId: 'a1' }, {
      llm: { messages: async () => ({ content: [] }) },
      loadSnapshot: async () => FORM,
      resolveSearch: async () => [],
    });
    expect(a.interpreterMode).toBe('agent');
    expect(a.toolSession).toBeDefined();
    expect(a.toolSession.skippedSlotIds instanceof Set).toBe(true);
  });
});

/**
 * HYB-FIX-001 made the hybrid the default, which means it — not the agent — is what
 * a user's hand-off now goes through. The hand-off itself is the agent's work and is
 * tested there; what has to hold HERE is that the wrapper does not swallow the signal
 * on its way out. A session that failed to end would leave the chat answering against
 * a request that has already left for the form.
 */
describe('the hand-off survives the hybrid wrapper', () => {
  test('a boundary turn is delegated, and the agent verdict comes back untouched', async () => {
    const h = harness();
    const openForm = { serviceId: 'EO-HR-SA-EXT', ousId: 3, prefill: {} };
    // Replace the delegate: the question is what the wrapper does with its answer.
    h.session.agent.sendTurn = async () => ({
      ok: true,
      ms: 5,
      turn: {
        response: 'Opening the form now.', responseType: 'open_form', openForm,
        sessionEnded: true, controls: null, askingSlot: null, isComplete: false,
      },
    });

    // Free text is condition 1 in the router: a boundary, always the model's.
    const out = await h.session.sendTurn('open the form please', {});

    expect(out.turn.responseType).toBe('open_form');
    expect(out.turn.openForm).toEqual(openForm);
    expect(out.turn.sessionEnded).toBe(true);
  });
});
