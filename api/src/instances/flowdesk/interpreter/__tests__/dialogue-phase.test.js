'use strict';

/**
 * EC-002 — the dialogue phase.
 *
 * This is now ONE fact with two consumers: the hybrid router decides whether a
 * template may answer a click, and the prompt compiler decides which rules apply. The
 * tests that matter most are therefore the ones about them not being able to disagree.
 */

const { computePhase, compilationContext, PHASES, FORK_SLOTS } = require('../dialogue-phase');
const { FORK_SLOTS: HYBRID_FORK_SLOTS } = require('../../hybrid-interpreter/hybrid-session.service');

const session = (over = {}) => ({
  offeredServiceCodes: new Set(),
  draftServiceCode: null, chosenServiceCode: null,
  confirmShown: false, confirmAccepted: false,
  finalGateShown: false, openForm: null, lastTool: null,
  ...over,
});
const draft = (serviceId = 'EO-HR-BE-EG-EGC') => ({ serviceId, status: 'draft' });

describe('one definition, two consumers', () => {
  test('the router imports the SAME fork-slot list this module owns', () => {
    // Two copies had already drifted apart while this was being written: three
    // entries in one, four in the other. That is the whole argument in miniature.
    expect(HYBRID_FORK_SLOTS).toBe(FORK_SLOTS);
    expect(FORK_SLOTS.has('__large_form__')).toBe(true);
  });

  test('every phase it can return is in the vocabulary the schema allows', () => {
    // The condition editor offers exactly these; a phase the schema has never heard
    // of would be unselectable and would silently match nothing.
    const cases = [
      { session: session() },
      { session: session({ offeredServiceCodes: new Set(['a', 'b']) }) },
      { session: session(), draft: draft() },
      { session: session({ confirmShown: true }) },
      { session: session({ lastTool: 'kb_search' }) },
      { session: session({ finalGateShown: true }) },
    ];
    for (const c of cases) expect(PHASES).toContain(computePhase(c).phase);
  });
});

describe('where the conversation stands', () => {
  test('nothing resolved yet is intent', () => {
    expect(computePhase({ session: session() }).phase).toBe('intent');
  });

  test('several services offered and none chosen is a choice, not filling', () => {
    const s = session({ offeredServiceCodes: new Set(['EO-HR-A', 'EO-HR-B']) });
    expect(computePhase({ session: s }).phase).toBe('service_choice');
  });

  test('ONE service offered is not a choice — there is nothing to choose between', () => {
    const s = session({ offeredServiceCodes: new Set(['EO-HR-A']) });
    expect(computePhase({ session: s }).phase).toBe('intent');
  });

  test('an open draft is filling', () => {
    expect(computePhase({ session: session(), draft: draft() }).phase).toBe('fill');
  });

  test('a click on a FORK control is not filling — it is the turn\'s own question', () => {
    const p = { session: session(), draft: draft(), controlAction: { slotId: '__service__' } };
    expect(computePhase(p).phase).not.toBe('fill');
  });

  test('an open confirm gate outranks filling: the turn is about the request as a whole', () => {
    const s = session({ confirmShown: true, confirmAccepted: false });
    expect(computePhase({ session: s, draft: draft() }).phase).toBe('confirm');
  });

  test('an ACCEPTED confirm is no longer a gate', () => {
    const s = session({ confirmShown: true, confirmAccepted: true });
    expect(computePhase({ session: s, draft: draft() }).phase).toBe('fill');
  });

  test('the hand-off outranks everything — nothing after it is intake', () => {
    const s = session({ confirmShown: true, finalGateShown: true });
    expect(computePhase({ session: s, draft: draft() }).phase).toBe('handed_off');
  });

  test('a knowledge-base lookup with no request open is reading', () => {
    expect(computePhase({ session: session({ lastTool: 'kb_search' }) }).phase).toBe('reading');
  });

  test('…but a KB lookup DURING form filling is still filling', () => {
    const s = session({ lastTool: 'kb_search' });
    expect(computePhase({ session: s, draft: draft() }).phase).toBe('fill');
  });

  test('it explains itself — the reason is carried, not just the verdict', () => {
    expect(computePhase({ session: session({ finalGateShown: true }) }).why).toMatch(/handed over/i);
  });
});

describe('the compilation context', () => {
  test('the service CATEGORY is the family, not the service', () => {
    // A rule pinned to one service is nearly always a field hint in disguise and
    // belongs on the form.
    const c = compilationContext({ session: session(), draft: draft('EO-HR-BE-EG-EGC') });
    expect(c.serviceCategory).toBe('EO-HR');
    expect(c.serviceId).toBe('EO-HR-BE-EG-EGC');
  });

  test('no service means no category, rather than a guess', () => {
    expect(compilationContext({ session: session() }).serviceCategory).toBeNull();
  });

  test('tool context says whether a request is open', () => {
    expect(compilationContext({ session: session() }).toolContext).toContain('no_draft');
    expect(compilationContext({ session: session(), draft: draft() }).toolContext).toContain('has_draft');
  });

  test('searching the catalogue is visible as its own fact', () => {
    const c = compilationContext({ session: session({ lastTool: 'catalog_search' }) });
    expect(c.toolContext).toContain('searching_catalog');
  });

  test('language and channel default rather than coming back undefined', () => {
    const c = compilationContext({ session: session() });
    expect(c.language).toBe('en');
    expect(c.channel).toBe('text');
  });
});

describe('it never throws on a half-built session', () => {
  test('no session at all', () => {
    expect(computePhase({}).phase).toBe('intent');
  });

  test('offeredServiceCodes as an array rather than a Set', () => {
    // Sessions arrive from a store as well as from memory, and JSON has no Set.
    const s = { offeredServiceCodes: ['a', 'b'] };
    expect(computePhase({ session: s }).phase).toBe('service_choice');
  });
});
