'use strict';

/**
 * I-4 — `requiredWhen` runtime semantics (ratified: a rule-revealed Altiora field
 * is required while its show-condition holds). One predicate, `isRequiredNow`,
 * backs both "which slot to ask next" (engine) and "is the draft complete"
 * (submit), so they cannot disagree.
 */

const { isRequiredNow, validateForSubmit } = require('../draft-sr.reducer');

const ctxOf = (slots, approvalRequired = false) => ({ service: { approvalRequired }, slots });

describe('I-4: isRequiredNow', () => {
  test('unconditional required, no trefCondition → always required', () => {
    expect(isRequiredNow({ required: true }, ctxOf({}))).toBe(true);
  });

  test('required + trefCondition → required only when visible', () => {
    const s = { required: true, trefCondition: "slots.a == 'x'" };
    expect(isRequiredNow(s, ctxOf({ a: 'x' }))).toBe(true);
    expect(isRequiredNow(s, ctxOf({ a: 'y' }))).toBe(false); // not visible
  });

  test('requiredWhen (base not required) → required exactly when the condition holds', () => {
    const s = { required: false, requiredWhen: "slots.docs == 'Yes'" };
    expect(isRequiredNow(s, ctxOf({ docs: 'Yes' }))).toBe(true);
    expect(isRequiredNow(s, ctxOf({ docs: 'No' }))).toBe(false);
    expect(isRequiredNow(s, ctxOf({}))).toBe(false);
  });

  test('rule-revealed field: trefCondition == requiredWhen == show-expr → asked when shown', () => {
    // materializer output shape for a show_field target
    const s = { required: false, trefCondition: "slots.docs == 'Yes'", requiredWhen: "slots.docs == 'Yes'" };
    expect(isRequiredNow(s, ctxOf({ docs: 'Yes' }))).toBe(true);
    expect(isRequiredNow(s, ctxOf({ docs: 'No' }))).toBe(false);
  });

  test('requiredWhen is gated by visibility — hidden wins even if the condition holds', () => {
    const s = { required: false, trefCondition: 'service.neverShown == true', requiredWhen: "slots.a == 'x'" };
    expect(isRequiredNow(s, ctxOf({ a: 'x' }))).toBe(false); // not visible ⇒ never required
  });

  test('truly optional (no required, no requiredWhen) → never required', () => {
    expect(isRequiredNow({ required: false, trefCondition: "slots.a == 'x'" }, ctxOf({ a: 'x' }))).toBe(false);
  });
});

describe('I-4: submit validation honours requiredWhen', () => {
  const snapshot = {
    metadata: { approvalRequired: false },
    slots: [
      { slotId: 'docs', type: 'enum', required: true, phase: 'detail' },
      { slotId: 'list', type: 'text', required: false, phase: 'detail',
        trefCondition: "slots.docs == 'Yes'", requiredWhen: "slots.docs == 'Yes'" },
    ],
  };
  const draft = (slots) => ({ slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { value: v, provenance: 'user_edited', stale: false }])) });

  test('docs=No → the conditional slot is not demanded; submit OK', () => {
    expect(validateForSubmit(draft({ docs: 'No' }), snapshot)).toMatchObject({ ok: true, missing: [] });
  });

  test('docs=Yes but list empty → incomplete (list now required)', () => {
    const r = validateForSubmit(draft({ docs: 'Yes' }), snapshot);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('list');
  });

  test('docs=Yes and list filled → complete', () => {
    expect(validateForSubmit(draft({ docs: 'Yes', list: 'passport, contract' }), snapshot).ok).toBe(true);
  });
});
