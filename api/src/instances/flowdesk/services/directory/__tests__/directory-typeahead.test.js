'use strict';

/**
 * I-6 — directory typeahead read model. Exercised against the real mock provider
 * (so the item mapping is tested end-to-end) plus a fake for the failure path.
 */

const dir = require('../index');
const { typeahead, userItem, locationItem, UnknownDirectoryTypeError, MIN_QUERY, MAX_LIMIT } = require('../directory-typeahead');
const { DirectoryUnavailableError } = require('../adapter.interface');

describe('I-6: typeahead against the mock directory', () => {
  test('type=user resolves and maps to typeahead items', async () => {
    const { type, query, results } = await typeahead(dir, 'user', 'petrov');
    expect(type).toBe('user');
    expect(query).toBe('petrov');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ value: 'U001', label: expect.any(String) });
    expect(results[0].meta).toHaveProperty('email');
  });

  test('type=beneficiary is an alias for user', async () => {
    const { type, results } = await typeahead(dir, 'beneficiary', 'ivanova@un.org');
    expect(type).toBe('user');
    expect(results[0].value).toBe('U002');
  });

  test('type=location searches duty stations', async () => {
    const { type, results } = await typeahead(dir, 'location', 'gen');
    expect(type).toBe('location');
    expect(results.map((r) => r.value)).toContain('GVA');
    const gva = results.find((r) => r.value === 'GVA');
    expect(gva).toMatchObject({ label: 'Geneva', sublabel: 'Geneva' });
  });

  test('type=dutystations aliases to location', async () => {
    const { type } = await typeahead(dir, 'dutystations', 'vienna');
    expect(type).toBe('location');
  });

  test('unknown type → UnknownDirectoryTypeError', async () => {
    await expect(typeahead(dir, 'widget', 'x')).rejects.toThrow(UnknownDirectoryTypeError);
    await expect(typeahead(dir, 'widget', 'x')).rejects.toMatchObject({ code: 'BAD_DIRECTORY_TYPE' });
  });

  test(`query shorter than MIN_QUERY (${MIN_QUERY}) → empty, no search`, async () => {
    const spy = jest.spyOn(dir, 'resolveUser');
    const { results } = await typeahead(dir, 'user', 'p');
    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('missing query → empty', async () => {
    expect((await typeahead(dir, 'user', undefined)).results).toEqual([]);
    expect((await typeahead(dir, 'location', null)).results).toEqual([]);
  });

  test('limit is clamped and applied', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ userId: `U${i}`, name: `User ${i}`, email: `u${i}@un.org`, location: {} }));
    const fake = { resolveUser: async () => many, searchLocations: async () => [] };
    expect((await typeahead(fake, 'user', 'user', { limit: 5 })).results).toHaveLength(5);
    expect((await typeahead(fake, 'user', 'user', { limit: 999 })).results).toHaveLength(MAX_LIMIT);
    expect((await typeahead(fake, 'user', 'user', {})).results).toHaveLength(10); // default
    expect((await typeahead(fake, 'user', 'user', { limit: 'abc' })).results).toHaveLength(10); // NaN → default
  });

  test('DirectoryUnavailableError bubbles up for the controller to map to 503', async () => {
    const down = { resolveUser: async () => { throw new DirectoryUnavailableError('altiora', 'timeout'); }, searchLocations: async () => [] };
    await expect(typeahead(down, 'user', 'petrov')).rejects.toBeInstanceOf(DirectoryUnavailableError);
  });
});

describe('I-6: item mappers', () => {
  test('userItem falls back through email → department → location for sublabel', () => {
    expect(userItem({ userId: 1, name: 'A', email: 'a@x' }).sublabel).toBe('a@x');
    expect(userItem({ userId: 1, name: 'A', department: 'HR' }).sublabel).toBe('HR');
    expect(userItem({ userId: 1, name: 'A', location: { name: 'NY' } }).sublabel).toBe('NY');
    expect(userItem({ userId: 1, name: 'A' }).sublabel).toBeUndefined();
  });

  test('locationItem uses city then building for sublabel, label falls back to code', () => {
    expect(locationItem({ code: 'GVA', name: 'Geneva', city: 'Geneva' })).toMatchObject({ value: 'GVA', label: 'Geneva', sublabel: 'Geneva' });
    expect(locationItem({ code: 'X', building: 'B' })).toMatchObject({ label: 'X', sublabel: 'B' });
  });
});
