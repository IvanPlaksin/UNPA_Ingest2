'use strict';

/**
 * Hand-off from chat to Altiora's request form: the DraftSR → `initialFormData`
 * conversion, and the post-submit "what else" menu.
 */

const { draftToInitialFormData, postSubmitServices } = require('../form-handoff');
const { ui } = require('../templates/ui-strings');

const snapshot = {
  serviceId: 'EO-HR-SA-EXT',
  metadata: {
    fieldIdMapping: {
      indexNumber: 'field_idx',
      comments: 'field_comments',
      docs: 'field_docs',
    },
  },
};

describe('draftToInitialFormData', () => {
  test('schema answers are keyed by the ORIGINAL Altiora field id', () => {
    const out = draftToInitialFormData({ slots: { indexNumber: { value: '12345' } } }, snapshot);
    expect(out.dynamicData).toEqual({ field_idx: '12345' });
  });

  test('a multi-select is handed over as the JSON-array string the form parses', () => {
    const out = draftToInitialFormData({ slots: { docs: { value: ['tor', 'doa'] } } }, snapshot);
    expect(out.dynamicData.field_docs).toBe('["tor","doa"]');
    expect(JSON.parse(out.dynamicData.field_docs)).toEqual(['tor', 'doa']);
  });

  test('empty, null and undefined values are omitted rather than sent as blanks', () => {
    const out = draftToInitialFormData({
      slots: { indexNumber: { value: '' }, comments: { value: null }, docs: {} },
    }, snapshot);
    expect(out.dynamicData).toEqual({});
  });

  test('a slot with no Altiora counterpart is not invented into dynamicData', () => {
    const out = draftToInitialFormData({ slots: { somethingLocal: { value: 'x' } } }, snapshot);
    expect(out.dynamicData).toEqual({});
  });

  test('a different beneficiary maps to other + beneficiaryUser (with an id the form uses)', () => {
    const bene = { userId: 'U2', name: 'Petrov' };
    const author = { userId: 'U1', name: 'Ivanov', mode: 'self' };
    const out = draftToInitialFormData({ slots: { beneficiary: { value: bene }, author: { value: author } } }, snapshot);
    expect(out.beneficiary).toBe('other');
    expect(out.beneficiaryUser).toMatchObject({ userId: 'U2', id: 'U2', name: 'Petrov' });
  });

  test('a literal self-beneficiary is passed as self', () => {
    const out = draftToInitialFormData({ slots: { beneficiary: { value: 'self' } } }, snapshot);
    expect(out.beneficiary).toBe('self');
    expect(out.beneficiaryUser).toBeUndefined();
  });

  test('the resolved current user (mode:self) is self, not other', () => {
    const me = { userId: 'U1', name: 'Ivanov', mode: 'self' };
    const out = draftToInitialFormData({ slots: { beneficiary: { value: me } } }, snapshot);
    expect(out.beneficiary).toBe('self');
    expect(out.beneficiaryUser).toBeUndefined();
  });

  test('beneficiary == author (same userId) is self even without a mode marker', () => {
    // Both resolved from the directory to the same person: this is the reported case —
    // beneficiary and requester are one user — and must not become an 'other'.
    const me = { userId: 'U1', name: 'Ivanov' };
    const out = draftToInitialFormData({ slots: { beneficiary: { value: { ...me } }, author: { value: { ...me } } } }, snapshot);
    expect(out.beneficiary).toBe('self');
    expect(out.beneficiaryUser).toBeUndefined();
  });

  test('the wizard step-1 Request Title is seeded from the service title', () => {
    const out = draftToInitialFormData({ slots: {} }, { serviceId: 'X', metadata: { title: 'Extension of Appointment' } });
    expect(out.title).toBe('Extension of Appointment');
  });

  test('a description slot, when the chat gathered one, seeds step-1 Description', () => {
    const out = draftToInitialFormData({ slots: { description: { value: '  needs a 6-month extension  ' } } }, snapshot);
    expect(out.description).toBe('needs a 6-month extension');
  });

  test('no description slot → no description key (left for the user to fill)', () => {
    const out = draftToInitialFormData({ slots: {} }, snapshot);
    expect(out.description).toBeUndefined();
  });

  test('a resolved location is carried across', () => {
    const loc = { code: 'GVA', name: 'Geneva', dutyStationId: 'g-1' };
    const out = draftToInitialFormData({ slots: { location: { value: loc } } }, snapshot);
    expect(out.location).toEqual(loc);
  });

  test('a snapshot without fieldIdMapping degrades to an empty dynamicData, not a throw', () => {
    const out = draftToInitialFormData({ slots: { indexNumber: { value: '1' } } }, { metadata: {} });
    expect(out.dynamicData).toEqual({});
  });
});

describe('postSubmitServices', () => {
  test('offers the four always-available services', () => {
    const controls = postSubmitServices(ui('en'), false);
    expect(controls[0].type).toBe('choice');
    expect(controls[0].options.map((o) => o.value))
      .toEqual(['NEW_INTENT', 'INFO_QUESTION', 'MY_REQUESTS', 'CATALOG_BROWSE']);
  });

  test('approvals appear only for a user who may act', () => {
    expect(postSubmitServices(ui('en'), true)[0].options.map((o) => o.value)).toContain('ACT_APPROVE');
  });

  test('labels are localized', () => {
    expect(postSubmitServices(ui('ru'), false)[0].options[0].label).toBe('Оформить заявку');
    expect(postSubmitServices(ui('fr'), false)[0].options[0].label).toBe('Créer une demande');
  });
});

// The request-level description is a universal slot (added only to Altiora snapshots),
// so form-handoff carries it to the wizard's own description field.
describe('universal request description → form', () => {
  test('a filled description slot seeds step-1 Description', () => {
    const out = draftToInitialFormData({ slots: { description: { value: 'extend for 6 months' } } }, snapshot);
    expect(out.description).toBe('extend for 6 months');
  });
});
