'use strict';

/**
 * Dialogue quality metrics (Phase 6) — counted from transcripts, no judge, no model.
 *
 * The property that matters most here is that the SAME rule is applied to both
 * interpreters. A detector that knew which architecture produced a turn could be
 * made to say anything; these tests pin it to the text.
 */

const metrics = require('../dialogue-metrics.service');
const { ui } = require('../../../instances/flowdesk/interpreter/templates/ui-strings');

const CANNED = ui('en').agent.disambiguate;
const CANNED_RU = ui('ru').agent.disambiguate;
const PROSE = 'You asked about home leave. The Advance Home Leave service fits because it covers travel to your home country, which is what you described.';
const OTHER_PROSE = 'I could not find a service for changing bank details. Nothing in the catalogue covers it, so I would raise this with payroll directly.';

const turn = (agent, user = '', route = null) => ({ agentResponse: agent, userMessage: user, route });

describe('template detection is evidence-based, not mode-based', () => {
  test('a string straight from the table is a template', () => {
    expect(metrics.detectTemplateUsed(CANNED).template).toBe(true);
  });

  test('free prose is not', () => {
    expect(metrics.detectTemplateUsed(PROSE).template).toBe(false);
  });

  test('a template wrapped in prose still counts — the canned sentence is present', () => {
    expect(metrics.detectTemplateUsed(`Sure, one moment. ${CANNED}`).template).toBe(true);
  });

  test('every language is covered, not just English', () => {
    expect(metrics.detectTemplateUsed(CANNED_RU).template).toBe(true);
    expect(metrics.detectTemplateUsed(ui('fr').agent.disambiguate).template).toBe(true);
    expect(metrics.detectTemplateUsed(ui('zh').agent.disambiguate).template).toBe(true);
  });

  test('an empty reply is not a template', () => {
    expect(metrics.detectTemplateUsed('').template).toBe(false);
    expect(metrics.detectTemplateUsed(null).template).toBe(false);
  });

  test('the detector reports WHICH template matched, so a claim can be checked', () => {
    const r = metrics.detectTemplateUsed(CANNED);
    expect(typeof r.matched).toBe('string');
    expect(r.matched.length).toBeGreaterThan(10);
  });

  test('nothing in the detector consults an interpreter mode', () => {
    // The comparison EXP-002 runs would be rigged if the agent were exempted by
    // construction. Same input, same verdict, whoever produced it.
    const src = require('fs').readFileSync(require('path').join(__dirname, '../dialogue-metrics.service.js'), 'utf8');
    expect(src).not.toMatch(/interpreterMode|isAgent|mode\s*===\s*'agent'/);
  });
});

describe('repetition detection', () => {
  test('the same canned line twice is a repeat', () => {
    expect(metrics.detectSameAsLastTurn(CANNED, CANNED)).toBe(true);
  });

  test('the same canned line with different surrounding text still repeats', () => {
    expect(metrics.detectSameAsLastTurn(`Right. ${CANNED}`, `Okay. ${CANNED}`)).toBe(true);
  });

  test('two different pieces of prose are not a repeat', () => {
    expect(metrics.detectSameAsLastTurn(PROSE, OTHER_PROSE)).toBe(false);
  });

  test('identical prose IS a repeat — saying the same thing twice is the defect', () => {
    expect(metrics.detectSameAsLastTurn(PROSE, PROSE)).toBe(true);
  });

  test('the first turn of a dialogue cannot repeat', () => {
    expect(metrics.detectSameAsLastTurn(CANNED, null)).toBe(false);
  });
});

describe('rejection detection across languages', () => {
  test.each([
    ['none of those match', true],
    ['that is not what I need', true],
    ['I already told you', true],
    ['ни один не подходит', true],
    ['не то, что мне нужно', true],
    ['aucun de ces services', true],
    ['ninguno de esos', true],
    ['都不是我要的', true],
    ['ليس هذا ما أريد', true],
    ['yes, please continue', false],
    ['да, продолжайте', false],
    ['', false],
  ])('%s -> %s', (msg, expected) => {
    expect(metrics.detectUserSaidNotMatch(msg)).toBe(expected);
  });
});

describe('run aggregation', () => {
  test('a fully canned run scores zero generation and high repetition', () => {
    const r = metrics.runMetrics([
      turn(CANNED, 'I need to change my bank account', 'DISAMBIGUATE'),
      turn(CANNED, 'none of those', 'DISAMBIGUATE'),
      turn(CANNED, 'still not it', 'DISAMBIGUATE'),
    ]);
    expect(r.generationRate).toBe(0);
    expect(r.templateRate).toBe(1);
    expect(r.templateRepeatRate).toBeCloseTo(2 / 3, 5);
    expect(r.maxConsecutiveTemplate).toBe(3);
    expect(r.disambiguateCount).toBe(3);
  });

  test('a fully generated run scores full generation and no repetition', () => {
    const r = metrics.runMetrics([turn(PROSE, 'hello'), turn(OTHER_PROSE, 'and the bank one?')]);
    expect(r.generationRate).toBe(1);
    expect(r.templateRepeatRate).toBe(0);
    expect(r.maxConsecutiveTemplate).toBe(0);
  });

  test('explainAfterRejectRate is 0 when a rejection is answered with the same canned line', () => {
    // The exact complaint: the user says the options are wrong and gets them again.
    // A turn carries the persona message AND the reply to it, so the rejection and
    // the answer are the same record.
    const r = metrics.runMetrics([
      turn(CANNED, 'I need a bank change', 'DISAMBIGUATE'),
      turn(CANNED, 'none of those match', 'DISAMBIGUATE'),
    ]);
    expect(r.rejects).toBe(1);
    expect(r.explainAfterRejectRate).toBe(0);
  });

  test('explainAfterRejectRate is 1 when the rejection is answered with prose', () => {
    const r = metrics.runMetrics([
      turn(CANNED, 'I need a bank change', 'DISAMBIGUATE'),
      turn(OTHER_PROSE, 'none of those match', 'DISAMBIGUATE'),
    ]);
    expect(r.rejects).toBe(1);
    expect(r.explainAfterRejectRate).toBe(1);
  });

  test('a run with no rejection reports null, not a misleading zero', () => {
    const r = metrics.runMetrics([turn(PROSE, 'hi')]);
    expect(r.explainAfterRejectRate).toBeNull();
  });

  test('an empty run does not divide by zero', () => {
    const r = metrics.runMetrics([]);
    expect(r.turns).toBe(0);
    expect(r.generationRate).toBe(0);
  });

  test('consecutive-template streaks reset when prose appears', () => {
    const r = metrics.runMetrics([turn(CANNED), turn(CANNED), turn(PROSE), turn(CANNED)]);
    expect(r.maxConsecutiveTemplate).toBe(2);
  });
});

describe('store-backed aggregation', () => {
  const mkRow = (o) => ({ get: (k) => o[k] });

  test('computeRunMetrics reads the run turns in order', async () => {
    const { createDialogueMetrics } = metrics;
    const M = createDialogueMetrics({
      read: async () => [
        { get: () => ({ properties: { turnIndex: 0, agentResponse: CANNED, userMessage: 'hi', route: 'DISAMBIGUATE' } }) },
        { get: () => ({ properties: { turnIndex: 1, agentResponse: CANNED, userMessage: 'none of those', route: 'DISAMBIGUATE' } }) },
      ],
    });
    const r = await M.computeRunMetrics('run-1');
    expect(r.turns).toBe(2);
    expect(r.generationRate).toBe(0);
    expect(r.explainAfterRejectRate).toBe(0);
  });

  test('computeBaseline weights runs by their turn count, not equally', async () => {
    // A one-turn run must not carry the same weight as a ten-turn run.
    const rows = [
      mkRow({ runId: 'a', i: 0, agentResponse: PROSE, userMessage: 'x', route: null }),
      mkRow({ runId: 'b', i: 0, agentResponse: CANNED, userMessage: 'x', route: 'DISAMBIGUATE' }),
      mkRow({ runId: 'b', i: 1, agentResponse: CANNED, userMessage: 'y', route: 'DISAMBIGUATE' }),
      mkRow({ runId: 'b', i: 2, agentResponse: CANNED, userMessage: 'z', route: 'DISAMBIGUATE' }),
    ];
    const M = metrics.createDialogueMetrics({ read: async () => rows });
    const b = await M.computeBaseline({});
    expect(b.runs).toBe(2);
    expect(b.turns).toBe(4);
    // 1 generated of 4 turns — not the 50% an unweighted average of runs would give.
    expect(b.generationRate).toBeCloseTo(0.25, 5);
  });
});
