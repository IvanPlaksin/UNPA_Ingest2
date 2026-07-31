'use strict';

/**
 * SCH-003 — the field that shares a request with colleagues, in the shape Altiora
 * actually reads.
 *
 * Two failures, both silent, on opposite sides of the same value:
 *
 *   · the FORM was handed our directory user — `{userId, name, email}` with an `id`
 *     bolted on. Altiora's MultiEmployeeSelector renders `{user.firstName}
 *     {user.lastName}` and nothing else, so the colleagues a user had just named
 *     came back as blank chips. The request looked as though it had been shared
 *     with nobody;
 *   · the API was handed nothing at all. Altiora's own wizard sends
 *     `SharedWithIds: data.sharedWith.map(u => u.id)`; our create-ticket DTO had no
 *     such field, so a chat-side submit dropped every colleague without a word.
 */

const { toAltioraUser, sharedWithIds } = require('../form-handoff');

describe('our directory user, in Altiora\'s shape', () => {
  test('a name the selector can actually display', () => {
    // The whole defect in one assertion: `name` is what we hold, firstName/lastName
    // is what it renders.
    expect(toAltioraUser({ userId: 'u1', name: 'James NDEMEZO', email: 'j@un.org' }))
      .toMatchObject({ id: 'u1', firstName: 'James', lastName: 'NDEMEZO', email: 'j@un.org' });
  });

  test('a family name of several words stays whole', () => {
    expect(toAltioraUser({ userId: 'u2', name: 'Maria del Carmen Rodriguez' }))
      .toMatchObject({ firstName: 'Maria', lastName: 'del Carmen Rodriguez' });
  });

  test('a user who already carries the parts is not re-split', () => {
    expect(toAltioraUser({ id: 'u3', firstName: 'Ana', lastName: 'Silva', email: 'a@un.org' }))
      .toMatchObject({ id: 'u3', firstName: 'Ana', lastName: 'Silva' });
  });

  test('a single-word name gives a first name and an empty family name', () => {
    // Better than a chip that reads "undefined".
    expect(toAltioraUser({ userId: 'u4', name: 'Prince' }))
      .toMatchObject({ firstName: 'Prince', lastName: '' });
  });

  test('the original fields survive — nothing downstream loses what it relied on', () => {
    const out = toAltioraUser({ userId: 'u5', name: 'A B', department: 'HR', role: 'staff' });
    expect(out).toMatchObject({ department: 'HR', role: 'staff', userId: 'u5' });
  });

  test('something with no id is not a user, and is dropped rather than sent empty', () => {
    expect(toAltioraUser({ name: 'No Id' })).toBeNull();
    expect(toAltioraUser(null)).toBeNull();
    expect(toAltioraUser('a string')).toBeNull();
  });
});

describe('the ids the create-ticket API expects', () => {
  const draftWith = (value) => ({ slots: { sharedWith: { value } } });

  test('are extracted from the objects the form holds', () => {
    expect(sharedWithIds(draftWith([{ userId: 'u1', name: 'A B' }, { id: 'u2' }])))
      .toEqual(['u1', 'u2']);
  });

  test('are absent — not empty — when nothing was shared', () => {
    // Altiora treats an absent optional field sensibly and a null it did not expect
    // is a good way to trip its 400 path.
    expect(sharedWithIds(draftWith([]))).toBeUndefined();
    expect(sharedWithIds({ slots: {} })).toBeUndefined();
    expect(sharedWithIds(null)).toBeUndefined();
  });

  test('a malformed entry is skipped rather than sent as a null id', () => {
    expect(sharedWithIds(draftWith([{ userId: 'u1' }, {}, null]))).toEqual(['u1']);
  });

  test('ids are strings, whatever the directory gave us', () => {
    expect(sharedWithIds(draftWith([{ id: 12345 }]))).toEqual(['12345']);
  });
});
