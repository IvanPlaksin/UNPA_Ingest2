'use strict';

/**
 * F9.1b test — mock directories (user + location).
 */

const dir = require('../index');

describe('F9.1b: user directory', () => {
  test('resolveUser fuzzy by surname → match', async () => {
    const r = await dir.resolveUser('petrov');
    expect(r).toHaveLength(1);
    expect(r[0].userId).toBe('U001');
    expect(r[0].location.code).toBe('NY-HQ');
  });

  test('resolveUser by email', async () => {
    const r = await dir.resolveUser('ivanova@un.org');
    expect(r[0].userId).toBe('U002');
  });

  test('resolveUser unknown → []', async () => {
    expect(await dir.resolveUser('nobody')).toEqual([]);
  });

  test('resolveUser empty → []', async () => {
    expect(await dir.resolveUser('')).toEqual([]);
  });

  test('getCurrentUser returns the self user with location', async () => {
    const me = await dir.getCurrentUser();
    expect(me.userId).toBe('U001');
    expect(me.location.code).toBe('NY-HQ');
  });
});

describe('F9.2a: org hierarchy / approver', () => {
  test('resolveApprover(U002 staff) → U005 (their director-manager)', async () => {
    const a = await dir.resolveApprover('U002');
    expect(a.userId).toBe('U005');
  });

  test('resolveApprover(U003 staff) → U001 (their manager)', async () => {
    const a = await dir.resolveApprover('U003');
    expect(a.userId).toBe('U001');
  });

  test('resolveApprover(U004 director) → null (top-level)', async () => {
    expect(await dir.resolveApprover('U004')).toBeNull();
  });

  test('getManager returns the supervisor record', async () => {
    const m = await dir.getManager('U001');
    expect(m.userId).toBe('U004');
    expect(m.role).toBe('director');
  });
});

describe('F9.1b: location directory', () => {
  test('listLocations → 10 duty stations', async () => {
    const list = await dir.listLocations();
    expect(list).toHaveLength(10);
    expect(list.every((l) => l.code && l.name && l.city)).toBe(true);
  });

  test('resolveLocation known (case-insensitive) → object', async () => {
    const loc = await dir.resolveLocation('gva');
    expect(loc).toMatchObject({ code: 'GVA', city: 'Geneva' });
  });

  test('resolveLocation unknown → null', async () => {
    expect(await dir.resolveLocation('XXX')).toBeNull();
  });

  test('searchLocations by city', async () => {
    const r = await dir.searchLocations('geneva');
    expect(r[0].code).toBe('GVA');
  });
});
