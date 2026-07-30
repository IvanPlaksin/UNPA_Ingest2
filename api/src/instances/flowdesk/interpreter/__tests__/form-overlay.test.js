'use strict';

/**
 * The overlay adds the request-level fields every form carries. Two rules it has
 * to get right, both learned the hard way:
 *   - identity leads, in a fixed order, whoever supplied the field;
 *   - de-duplication is by CONCEPT, because the same thing arrives under two ids.
 */

const { effectiveSnapshot, CONTEXT_SLOTS } = require('../form-overlay');

const altiora = (slots, approvalRequired = false) => ({
  serviceId: 'SVC', version: 1,
  metadata: { title: 'T', altioraOusId: 7, approvalRequired },
  phases: ['detail'],
  slots,
});
const ids = (snap) => snap.slots.map((s) => s.slotId);

describe('identity leads, in order', () => {
  test('a bare Altiora form gets who / where, ahead of its own fields', () => {
    const out = effectiveSnapshot(altiora([{ slotId: 'subject', type: 'string', phase: 'detail' }]));
    expect(ids(out).slice(0, 2)).toEqual(['beneficiary', 'location']);
    expect(ids(out)).toContain('subject');
  });

  test('when the loader already injected them, the overlay does not jump ahead', () => {
    // The summary field must not land at index 0, ahead of the duty station: the
    // ask order follows the form's order (fdv2-111bd67f).
    const out = effectiveSnapshot(altiora([
      { slotId: 'beneficiary', type: 'user', phase: 'context' },
      { slotId: 'location', type: 'location', phase: 'context' },
      { slotId: 'author', type: 'user', phase: 'context' },
      { slotId: 'subject', type: 'string', phase: 'detail' },
    ]));
    expect(ids(out).slice(0, 3)).toEqual(['beneficiary', 'location', 'author']);
    expect(ids(out).indexOf('description')).toBeGreaterThan(ids(out).indexOf('location'));
  });
});

describe('the requester is never a question', () => {
  test("the loader's required, non-silent author is normalised to silent", () => {
    const out = effectiveSnapshot(altiora([
      { slotId: 'author', type: 'user', required: true, phase: 'context', resolverRef: 'resolve.author' },
    ]));
    const author = out.slots.find((s) => s.slotId === 'author');
    expect(author.autoResolve).toBe(true);
    expect(author.required).toBe(false);
  });
});

describe('one concept, one slot', () => {
  test('a form that already has `approver` does not also get `manualApprover`', () => {
    const out = effectiveSnapshot(altiora([
      { slotId: 'approver', type: 'user', required: true, phase: 'detail', resolverRef: 'resolve.approver' },
      { slotId: 'subject', type: 'string', phase: 'detail' },
    ], true));

    expect(ids(out)).toContain('approver');
    expect(ids(out)).not.toContain('manualApprover');
  });

  test('without one, the overlay still supplies the authoriser when approval is needed', () => {
    const out = effectiveSnapshot(altiora([{ slotId: 'subject', type: 'string', phase: 'detail' }], true));
    expect(ids(out)).toContain('manualApprover');
  });

  test('no approval, no authoriser at all', () => {
    const out = effectiveSnapshot(altiora([{ slotId: 'subject', type: 'string', phase: 'detail' }], false));
    expect(ids(out)).not.toContain('manualApprover');
    expect(ids(out)).not.toContain('approver');
  });
});

describe('a non-Altiora snapshot keeps its own shape', () => {
  test('only the context slots are overlaid — no Altiora request-level extras', () => {
    const out = effectiveSnapshot({
      serviceId: 'FIXTURE', version: 1, metadata: { title: 'T' }, phases: ['detail'],
      slots: [{ slotId: 'assetType', type: 'enum', phase: 'detail' }],
    });
    expect(ids(out)).toEqual([...CONTEXT_SLOTS.map((s) => s.slotId), 'assetType']);
    expect(ids(out)).not.toContain('description');
    expect(ids(out)).not.toContain('sharedWith');
  });
});
