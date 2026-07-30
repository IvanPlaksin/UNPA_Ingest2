'use strict';

/**
 * C1 — the form belongs to the BENEFICIARY's location.
 *
 * A service is offered by several providers, each with its own form, and which one
 * serves a request is decided by location. It used to be decided by the ACTING
 * user's duty station, so an HR officer in Geneva raising a separation for a
 * colleague in Nairobi was shown Geneva's form and filled Geneva's fields.
 *
 * Three things are tested: what the context derives from a draft, that the loader
 * detects providers with it, and that a draft survives the form changing under it.
 */

const {
  runWithSchemaContext, getSchemaContext, updateSchemaContext,
  schemaContextFrom, locationPathFrom,
} = require('../schema-context');
const { createSchemaLoader, defaultLocationPathOf } = require('../schema-orchestrator');
const reducer = require('../../contracts/draft-sr.reducer');

const NAIROBI = { code: '7f3e-guid', name: 'Nairobi', city: 'Nairobi' };
const GENEVA = { code: 'gva-guid', name: 'Geneva' };

describe('what decides the form', () => {
  test('the location confirmed for the request', () => {
    const draft = { slots: { location: { value: NAIROBI } } };
    expect(schemaContextFrom(draft, null).locationPath).toBe('Nairobi');
  });

  test('before it is asked, the beneficiary\'s own duty station — the same answer one step earlier', () => {
    const draft = { slots: { beneficiary: { value: { name: 'Amina', location: NAIROBI, orgUnitPath: 'UNCS/HR/' } } } };
    const ctx = schemaContextFrom(draft, null);
    expect(ctx.locationPath).toBe('Nairobi');
    // detect scopes on the org unit too, and it was never being sent.
    expect(ctx.beneficiaryOrgUnitPath).toBe('UNCS/HR/');
  });

  test('answers held before the draft exists count — that is when the form is chosen', () => {
    expect(schemaContextFrom(null, { location: NAIROBI }).locationPath).toBe('Nairobi');
  });

  test('the confirmed location outranks the beneficiary\'s profile', () => {
    const draft = {
      slots: {
        beneficiary: { value: { name: 'Amina', location: NAIROBI } },
        location: { value: GENEVA },
      },
    };
    expect(schemaContextFrom(draft, null).locationPath).toBe('Geneva');
  });

  test('a duty-station GUID is NOT a path, so it is not offered as one', () => {
    // detect matches on Region/Country/DutyStation. A GUID matches nothing, and
    // "no provider" reads to the user as "this service is not available here" — a
    // wrong answer dressed as a real one. No path means the caller's own stands.
    expect(locationPathFrom({ code: 'only-a-guid' })).toBeNull();
    expect(schemaContextFrom({ slots: { location: { value: { code: 'only-a-guid' } } } }, null).locationPath).toBeNull();
  });

  test('nothing known → nothing claimed', () => {
    expect(schemaContextFrom(null, null)).toEqual({ locationPath: null, beneficiaryOrgUnitPath: null });
  });
});

describe('the context is what the loader reads', () => {
  test('inside a turn it is the request\'s location; outside, there is no turn to speak for', () => {
    runWithSchemaContext({ locationPath: 'Nairobi' }, () => {
      expect(defaultLocationPathOf()).toBe('Nairobi');
    });
    expect(defaultLocationPathOf()).toBeNull();
  });

  test('it can be revised mid-turn: the location is often answered DURING one', () => {
    runWithSchemaContext({ locationPath: 'Geneva' }, () => {
      updateSchemaContext({ locationPath: 'Nairobi' });
      expect(getSchemaContext().locationPath).toBe('Nairobi');
      expect(defaultLocationPathOf()).toBe('Nairobi');
    });
  });

  test('the provider lookup receives the request\'s location and org unit', async () => {
    const seen = [];
    const loader = createSchemaLoader({
      catalogLookup: async () => ({ guid: 'g-1', approvalRequired: false, title: 'Separation' }),
      locationPathOf: () => 'Geneva', // the acting user's own — must NOT win
      beneficiaryOrgUnitPathOf: () => null,
      detectProviders: async (guid, opts) => { seen.push(opts); return [{ organizationUnitServiceId: 7, score: 100 }]; },
      getSchemaVersion: async () => ({ contentHash: 'h', version: 3 }),
      getSchema: async () => ({ fields: [] }),
      materialize: () => ({ snapshot: { serviceId: 'S', version: 3, phases: ['detail'], metadata: {}, slots: [] }, warnings: [] }),
      registry: {
        checkFreshness: async () => 'fresh',
        getSchema: async () => ({ serviceId: 'S', version: 3, phases: ['detail'], metadata: {}, slots: [] }),
        storeSchema: async () => ({ replaced: null }),
      },
      graphLoad: async () => null,
    });

    await loader.loadSnapshot('S', { locationPath: 'Nairobi', beneficiaryOrgUnitPath: 'UNCS/HR/' });

    expect(seen[0]).toEqual({ locationPath: 'Nairobi', beneficiaryOrgUnitPath: 'UNCS/HR/' });
  });

  test('with nothing passed it falls back to the caller — the behaviour that existed before', async () => {
    const seen = [];
    const loader = createSchemaLoader({
      catalogLookup: async () => ({ guid: 'g-1', approvalRequired: false, title: 'T' }),
      locationPathOf: () => 'Geneva',
      beneficiaryOrgUnitPathOf: () => null,
      detectProviders: async (guid, opts) => { seen.push(opts); return [{ organizationUnitServiceId: 7 }]; },
      getSchemaVersion: async () => ({ contentHash: 'h', version: 1 }),
      getSchema: async () => ({ fields: [] }),
      materialize: () => ({ snapshot: { serviceId: 'S', version: 1, phases: ['detail'], metadata: {}, slots: [] }, warnings: [] }),
      registry: {
        checkFreshness: async () => 'fresh',
        getSchema: async () => ({ serviceId: 'S', version: 1, phases: ['detail'], metadata: {}, slots: [] }),
        storeSchema: async () => ({ replaced: null }),
      },
      graphLoad: async () => null,
    });

    await loader.loadSnapshot('S');

    expect(seen[0].locationPath).toBe('Geneva');
  });
});

describe('a draft outlives the form changing under it', () => {
  const now = 1700000000000;
  const newForm = {
    serviceId: 'S', version: 9,
    slots: [{ slotId: 'reason', type: 'text' }, { slotId: 'grade', type: 'enum' }],
  };

  test('answers the new form still has a field for are kept', () => {
    const draft = {
      sessionId: 's', serviceId: 'S', schemaVersion: 4,
      slots: { reason: { value: 'relocation' }, localOnlyField: { value: 'x' } },
    };
    const out = reducer.reconcileToSchema(draft, newForm, now);

    expect(out.slots.reason.value).toBe('relocation');
    expect(out.slots.localOnlyField).toBeUndefined();
    expect(out.schemaVersion).toBe(9);
  });

  test('what was dropped is recorded, because the user is owed the reason for a re-ask', () => {
    const draft = { sessionId: 's', serviceId: 'S', schemaVersion: 4, slots: { gone: { value: 1 } } };
    const out = reducer.reconcileToSchema(draft, newForm, now);

    expect(out.schemaSwitch).toMatchObject({ from: 4, to: 9, dropped: ['gone'] });
  });

  test('a slot whose TYPE changed is dropped: the same word is not the same answer', () => {
    // 'temp' picked from one provider's option list is not 'temp' typed as free
    // text, and the options behind the enum belonged to the old provider.
    const draft = { sessionId: 's', serviceId: 'S', schemaVersion: 4, slots: { grade: { value: 'P3', type: 'text' } } };
    const out = reducer.reconcileToSchema(draft, newForm, now);

    expect(out.slots.grade).toBeUndefined();
    expect(out.schemaSwitch.dropped).toEqual(['grade']);
  });

  test('the same form is left completely alone', () => {
    const draft = { sessionId: 's', serviceId: 'S', schemaVersion: 9, slots: { anything: { value: 1 } } };
    expect(reducer.reconcileToSchema(draft, newForm, now)).toBe(draft);
  });
});
