'use strict';

/**
 * HYB-002 — the test that decides who writes a turn.
 *
 * One case per condition, one for the template path, and one for priority: several
 * conditions hold at once often enough (a rejected click on a Russian session with
 * the ladder up) that the REASON must be predictable — it is what the operator
 * reads in telemetry to understand why a turn cost what it did.
 */

const { turnNeedsModel, REASONS } = require('../turn-router');

/** A turn that SHOULD be answered from a template — every condition deliberately clear. */
const templateTurn = () => ({
  input: { controlAction: { slotId: 'lastDay', value: '2026-09-30' } },
  state: {
    controlRejected: false,
    slotsReset: [],
    repair: { active: false },
    inFillPhase: true,
    nextField: { slotId: 'reason', promptHint: 'Why is the extension needed?' },
    fieldsAskedThisForm: 3,
    lang: 'en',
  },
});

const verdict = (mutate = () => {}) => {
  const t = templateTurn();
  mutate(t);
  return turnNeedsModel(t.input, t.state);
};

describe('the baseline: a click in the middle of a form', () => {
  test('is answered from a template — this is the 81% of turns the hybrid exists for', () => {
    expect(verdict()).toEqual({ needsModel: false, reason: 'template' });
  });
});

describe('each condition sends the turn to the model, and says which one did it', () => {
  test('1 — free text is a conversation, not a form entry', () => {
    expect(verdict((t) => { t.input.controlAction = null; }))
      .toEqual({ needsModel: true, reason: 'free_text' });
  });

  test('2 — the click produced no value, and the user is owed the reason', () => {
    expect(verdict((t) => { t.state.controlRejected = true; }))
      .toEqual({ needsModel: true, reason: 'control_rejected' });
  });

  test('3 — the answer invalidated other answers', () => {
    expect(verdict((t) => { t.state.slotsReset = ['grade', 'step']; }))
      .toEqual({ needsModel: true, reason: 'cascade_reset' });
  });

  test('4 — the repair ladder is up', () => {
    expect(verdict((t) => { t.state.repair = { active: true }; }))
      .toEqual({ needsModel: true, reason: 'repair_active' });
  });

  test('5 — a boundary (service choice, confirm, hand-off) belongs to the model', () => {
    expect(verdict((t) => { t.state.inFillPhase = false; }))
      .toEqual({ needsModel: true, reason: 'not_fill_phase' });
  });

  test('6 — nothing due to ask', () => {
    expect(verdict((t) => { t.state.nextField = null; }))
      .toEqual({ needsModel: true, reason: 'no_prompt_hint' });
  });

  test('6 — a field with no label to ask it by: the template must not improvise', () => {
    expect(verdict((t) => { t.state.nextField = { slotId: 'x' }; }))
      .toEqual({ needsModel: true, reason: 'no_prompt_hint' });
  });

  test('7 — the first field of a form, where the user learns what they are in for', () => {
    expect(verdict((t) => { t.state.fieldsAskedThisForm = 0; }))
      .toEqual({ needsModel: true, reason: 'first_field' });
  });

  test('7 — an absent counter counts as the first field, not as many', () => {
    expect(verdict((t) => { delete t.state.fieldsAskedThisForm; }))
      .toEqual({ needsModel: true, reason: 'first_field' });
  });

  /**
   * Reversed by Ivan's ruling (2026-07-31). The old rule sent every non-English turn
   * to the model, which meant the automaton was unreachable for a Russian or French
   * user on every turn of every form — the feature existed for English sessions only.
   * A missing localisation now falls back to the English field label, which is the
   * label the Altiora form shows that user anyway.
   */
  test('9 — a non-English session is answered by the template, not handed to the model', () => {
    expect(verdict((t) => { t.state.lang = 'ru'; })).toEqual({ needsModel: false, reason: 'template' });
  });

  test('9 — and so is every other language we do not localise', () => {
    for (const lang of ['fr', 'es', 'ar', 'zh', 'pt-BR']) {
      expect(verdict((t) => { t.state.lang = lang; }).needsModel).toBe(false);
    }
  });

  test('9 — a regional English tag is still English', () => {
    expect(verdict((t) => { t.state.lang = 'en-GB'; }))
      .toEqual({ needsModel: false, reason: 'template' });
  });

  test('9 — an absent language is treated as English, because that is what the session default is', () => {
    expect(verdict((t) => { delete t.state.lang; }))
      .toEqual({ needsModel: false, reason: 'template' });
  });

  test('10 — a long form must be OFFERED before it is walked, and that is an explanation', () => {
    expect(verdict((t) => { t.state.largeFormOfferPending = true; }))
      .toEqual({ needsModel: true, reason: 'large_form_offer' });
  });

  test('10 — once the offer has been made, the template carries on', () => {
    expect(verdict((t) => { t.state.largeFormOfferPending = false; }))
      .toEqual({ needsModel: false, reason: 'template' });
  });
});

describe('priority — the first match wins, so the reason is predictable', () => {
  test('free text outranks everything, including a rejected click', () => {
    const v = verdict((t) => {
      t.input.controlAction = null;
      t.state.controlRejected = true;
      t.state.repair = { active: true };
      t.state.lang = 'ru';
    });
    expect(v.reason).toBe('free_text');
  });

  test('a rejected click outranks the cascade and the ladder', () => {
    const v = verdict((t) => {
      t.state.controlRejected = true;
      t.state.slotsReset = ['grade'];
      t.state.repair = { active: true };
    });
    expect(v.reason).toBe('control_rejected');
  });

  test('the form\'s own state outranks the session\'s language', () => {
    const v = verdict((t) => { t.state.inFillPhase = false; t.state.lang = 'ru'; });
    expect(v.reason).toBe('not_fill_phase');
  });

  test('the declared order IS the evaluation order', () => {
    // Turning the conditions on one at a time, from the last to the first, must
    // walk the reasons backwards through REASONS — which is the only way the list
    // in the module and the behaviour here can be checked against each other.
    const turnOn = {
      free_text: (t) => { t.input.controlAction = null; },
      control_rejected: (t) => { t.state.controlRejected = true; },
      cascade_reset: (t) => { t.state.slotsReset = ['x']; },
      repair_active: (t) => { t.state.repair = { active: true }; },
      not_fill_phase: (t) => { t.state.inFillPhase = false; },
      no_prompt_hint: (t) => { t.state.nextField = null; },
      first_field: (t) => { t.state.fieldsAskedThisForm = 0; },
      large_form_offer: (t) => { t.state.largeFormOfferPending = true; },
    };
    const applied = [];
    for (const reason of [...REASONS].reverse()) {
      applied.unshift(turnOn[reason]);
      const t = templateTurn();
      for (const m of applied) m(t);
      // With everything from `reason` onwards switched on, the FIRST of them wins.
      expect(turnNeedsModel(t.input, t.state).reason).toBe(reason);
    }
  });
});

describe('nothing to reason from', () => {
  test('a missing state is answered by the model, not guessed at', () => {
    expect(turnNeedsModel({ controlAction: {} }, null).needsModel).toBe(true);
    expect(turnNeedsModel(null, {}).needsModel).toBe(true);
    expect(turnNeedsModel(undefined, undefined).needsModel).toBe(true);
  });
});
