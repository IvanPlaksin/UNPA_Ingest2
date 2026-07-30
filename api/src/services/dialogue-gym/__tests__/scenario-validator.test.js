'use strict';

/**
 * Ground-truth validator — the check ratification was missing.
 *
 * Three of nine ratified scenarios expected services that could not answer their
 * goal, so a third of the golden set measured nothing and every run against it
 * was scored as an agent failure. The regression these tests guard is not a
 * crash: it is a scenario being ratified against a service that cannot pass.
 */

const { createScenarioValidator, overlap } = require('../scenario-validator.service');

const catalogue = {
  'EO-HR-BE-SRA-SA': 'Request for Salary Advance',
  'EO-HR-BE-TRE-AHL': 'Advance Home Leave Queries',
  'EO-HR-BE-DA-DA': 'Dependency Allowances Queries',
  'EO-HR-BE-EG-EGC': 'Education Grant Claim(s) Queries',
  'EO-FIN-PAY-INQ': 'Payment Inquiry',
};
const rows = (title) => (title == null ? [] : [{ get: () => title }]);
const validator = createScenarioValidator({
  read: async (_c, params) => rows(catalogue[params.c]),
});

const scenario = (over = {}) => ({ scenarioId: 's1', name: 'S', userGoal: '', initialMessage: '', ...over });

describe('a code that is not in the catalogue is refused', () => {
  test('blocking, with a reason a human can act on', async () => {
    const r = await validator.validate(scenario({ userGoal: 'anything' }), 'EO-DOES-NOT-EXIST');
    expect(r.ok).toBe(false);
    expect(r.blocking[0].code).toBe('SERVICE_NOT_IN_CATALOG');
    expect(r.blocking[0].message).toMatch(/can never pass/);
  });

  test('there is no judgement call here — it blocks regardless of the goal', async () => {
    const r = await validator.validate(scenario({ userGoal: 'perfectly sensible request' }), 'NOPE');
    expect(r.ok).toBe(false);
  });
});

describe('the title acknowledgement is the real control', () => {
  test('ratifying without acknowledging puts the service NAME in front of the caller', async () => {
    // The exact pair that was ratified and made nine runs unwinnable. It is not
    // blocked — a lexical check cannot know it is wrong — but the name is shown.
    const r = await validator.validate(scenario({
      userGoal: 'Change the bank account used for salary payment.',
      initialMessage: 'I need to change the bank account where my salary is paid',
    }), 'EO-HR-BE-SRA-SA');
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('SERVICE_TITLE_UNACKNOWLEDGED');
    expect(r.warnings[0].message).toContain('Request for Salary Advance');
    expect(r.warnings[0].message).toContain('Change the bank account');
  });

  test('acknowledging the WRONG name is blocked', async () => {
    // A ratifier who believes they are picking a bank-details service, while the
    // code points at Salary Advance, is refused rather than recorded.
    const r = await validator.validate(
      scenario({ userGoal: 'Change the bank account used for salary payment.' }),
      'EO-HR-BE-SRA-SA',
      { acknowledgedServiceTitle: 'Change Bank Details' }
    );
    expect(r.ok).toBe(false);
    expect(r.blocking[0].code).toBe('TITLE_ACKNOWLEDGEMENT_MISMATCH');
    expect(r.blocking[0].message).toContain('Request for Salary Advance');
  });

  test('acknowledging the right name passes with no warning', async () => {
    const r = await validator.validate(
      scenario({ userGoal: 'Determine eligibility and apply for a dependency allowance.' }),
      'EO-HR-BE-DA-DA',
      { acknowledgedServiceTitle: 'Dependency Allowances Queries' }
    );
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  test('acknowledgement tolerates case and spacing, not a different name', async () => {
    const ok = await validator.validate(scenario(), 'EO-FIN-PAY-INQ', { acknowledgedServiceTitle: '  payment   INQUIRY ' });
    expect(ok.ok).toBe(true);
    const bad = await validator.validate(scenario(), 'EO-FIN-PAY-INQ', { acknowledgedServiceTitle: 'Payment Inquiries' });
    expect(bad.ok).toBe(false);
  });

  test('the service title always comes back, acknowledged or not', async () => {
    const r = await validator.validate(scenario({ userGoal: 'x' }), 'EO-FIN-PAY-INQ');
    expect(r.serviceTitle).toBe('Payment Inquiry');
  });
});

describe('the similarity score is reported but never gates', () => {
  test('a GOOD pair scoring 0.000 is not blocked, and a BAD pair scoring higher is not caught', async () => {
    // This is the measurement that killed the threshold idea: the good pair
    // scores lower than the bad one, so no cutoff could separate them.
    const good = await validator.validate(
      scenario({ userGoal: 'Resolve an unspecified problem with their pay.' }), 'EO-FIN-PAY-INQ');
    const bad = await validator.validate(
      scenario({ userGoal: 'Find out the remaining annual leave balance.' }), 'EO-HR-BE-TRE-AHL');
    expect(good.similarity).toBeLessThan(bad.similarity);
    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(true);
  });
});

describe('deflection scenarios', () => {
  test('a null code is valid — it asserts that no service fits', async () => {
    const r = await validator.validate(scenario({ userGoal: 'fix the coffee machine' }), null);
    expect(r.ok).toBe(true);
    expect(r.deflection).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  test('an empty string is treated the same as null', async () => {
    const r = await validator.validate(scenario({ userGoal: 'x' }), '');
    expect(r.deflection).toBe(true);
  });
});

describe('the overlap heuristic (informational only)', () => {
  test('shared vocabulary scores, unrelated does not', () => {
    expect(overlap('education grant claim for a child', 'Education Grant Claim(s) Queries')).toBeGreaterThan(0.4);
    expect(overlap('change the bank account for salary', 'Request for Salary Advance')).toBeLessThan(0.4);
  });

  test('plural and singular count as the same word', () => {
    expect(overlap('dependency allowance', 'Dependency Allowances Queries')).toBeGreaterThan(0.5);
  });

  test('boilerplate alone never carries a match', () => {
    // Without stopword removal, "Request ... Queries" would match almost any goal.
    expect(overlap('I would like to submit a request', 'Payment Inquiry')).toBe(0);
  });
});

describe('validateAll sweep', () => {
  test('counts blocked and warned across a set', async () => {
    const r = await validator.validateAll([
      scenario({ scenarioId: 'ok', userGoal: 'dependency allowance', expectedServiceCode: 'EO-HR-BE-DA-DA' }),
      scenario({ scenarioId: 'warn', userGoal: 'change my bank account', expectedServiceCode: 'EO-HR-BE-SRA-SA' }),
      scenario({ scenarioId: 'gone', userGoal: 'x', expectedServiceCode: 'MISSING' }),
      scenario({ scenarioId: 'deflect', userGoal: 'coffee machine', expectedServiceCode: null }),
    ]);
    expect(r.total).toBe(4);
    expect(r.blocked).toBe(1);          // the nonexistent code
    expect(r.warned).toBe(2);           // both existing codes, unacknowledged in a sweep
  });
});
