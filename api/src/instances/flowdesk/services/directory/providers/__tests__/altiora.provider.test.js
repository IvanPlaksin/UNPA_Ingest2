'use strict';

/**
 * F11c/F11h — Altiora directory provider against a mocked Altiora API (no live
 * backend). Verifies endpoint mapping, AppUser→User / DutyStation→Location
 * shaping, org-unit approver resolution, token/login flow, and getCurrentUser
 * from the proxy-injected identity.
 */

const { createAltioraProvider, mapUser, mapLocation, mapRole } = require('../altiora.provider');

// A scriptable Altiora HTTP double. Routes by method+path prefix.
function mockHttp(routes, calls = []) {
  return async (method, url, opts) => {
    calls.push({ method, url });
    const u = new URL(url);
    const key = `${method} ${u.pathname}`;
    for (const [pattern, handler] of Object.entries(routes)) {
      if (key === pattern || key.startsWith(pattern)) {
        const out = typeof handler === 'function' ? handler(u, opts) : handler;
        return { status: out.status || 200, ok: (out.status || 200) < 400, json: out.json !== undefined ? out.json : out };
      }
    }
    return { status: 404, ok: false, json: null };
  };
}

const APP_USER = { userId: 'GUID-1', firstName: 'Maria', lastName: 'Ivanova', email: 'ivanova@un.org', dutyStationCode: 'GVA', dutyStationName: 'Geneva', primaryOrgUnitName: 'HR', primaryOrgUnitId: 42, roles: ['Staff'] };
const APPROVER = { userId: 'GUID-9', firstName: 'Sofia', lastName: 'Rossi', email: 'rossi@un.org', roles: ['Manager'] };
const DS = [{ code: 'GVA', name: 'Geneva', city: 'Geneva' }, { code: 'NYC', name: 'New York HQ', city: 'New York' }];

function make(routes, calls) {
  return createAltioraProvider({ baseUrl: 'https://altiora.test', apiKey: 'k', token: 'seed-token', httpClient: mockHttp(routes, calls) });
}

describe('F11c: pure mappers', () => {
  test('mapUser normalises casing + org fields', () => {
    const u = mapUser(APP_USER);
    expect(u).toMatchObject({ userId: 'GUID-1', name: 'Maria Ivanova', email: 'ivanova@un.org', department: 'HR', orgUnitId: 42 });
    expect(u.location).toEqual({ code: 'GVA', name: 'Geneva' });
  });
  test('mapUser handles PascalCase', () => {
    expect(mapUser({ UserId: 'X', DisplayName: 'Y', Email: 'z@u.org' }).userId).toBe('X');
  });
  test('mapRole maps role lists', () => {
    expect(mapRole(['Director'])).toBe('director');
    expect(mapRole(['HelpdeskExecute'])).toBe('manager');
    expect(mapRole(['Staff'])).toBe('staff');
    expect(mapRole(undefined)).toBe('staff');
  });
  test('mapLocation shapes a duty station', () => {
    expect(mapLocation(DS[0])).toMatchObject({ code: 'GVA', name: 'Geneva', city: 'Geneva' });
  });
});

describe('F11c: endpoint behavior (mocked HTTP)', () => {
  test('resolveUser → global search → User[]', async () => {
    const p = make({ 'GET /api/users/search/global': { json: [APP_USER] } });
    const r = await p.resolveUser('ivan');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('Maria Ivanova');
  });

  test('getUser found / 404→null', async () => {
    const p = make({ 'GET /api/users/GUID-1': { json: APP_USER }, 'GET /api/users/nope': { status: 404 } });
    expect((await p.getUser('GUID-1')).email).toBe('ivanova@un.org');
    expect(await p.getUser('nope')).toBeNull();
  });

  test('getCurrentUser from the proxy-injected sessionUser (no API call)', async () => {
    const calls = [];
    const p = make({}, calls);
    const u = await p.getCurrentUser({ sessionUser: { userId: 'GUID-1', displayName: 'Maria Ivanova', email: 'ivanova@un.org', orgUnit: { name: 'HR', id: 42, path: 'UNCS/HR' }, location: { dutyStation: 'Geneva', dutyStationCode: 'GVA' } } });
    expect(u.userId).toBe('GUID-1');
    expect(u.name).toBe('Maria Ivanova');
    expect(calls).toHaveLength(0); // identity came from headers, not Altiora
  });

  test('getCurrentUser without identity → DirectoryUnavailableError', async () => {
    const p = make({});
    await expect(p.getCurrentUser({})).rejects.toMatchObject({ code: 'DIRECTORY_UNAVAILABLE' });
  });

  test('resolveApprover: getUser → orgUnitId → resolve-approver', async () => {
    const p = make({
      'GET /api/users/GUID-1': { json: APP_USER },
      'GET /api/tickets/resolve-approver': (u) => (u.searchParams.get('orgUnitId') === '42' ? { json: { source: 'Manager', users: [APPROVER] } } : { json: { users: [] } }),
    });
    const appr = await p.resolveApprover('GUID-1');
    expect(appr.name).toBe('Sofia Rossi');
  });

  test('locations: list + search', async () => {
    const p = make({ 'GET /api/dutystations/search': (u) => { const q = (u.searchParams.get('q') || '').toLowerCase(); return { json: DS.filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)) }; }, 'GET /api/dutystations': { json: DS } });
    expect(await p.listLocations()).toHaveLength(2);
    const geneva = await p.resolveLocation('GVA');
    expect(geneva.name).toBe('Geneva');
    expect((await p.searchLocations('new york'))[0].code).toBe('NYC');
  });

  test('401 → re-login → retry once', async () => {
    let issued = 0; let firstCall = true;
    const httpClient = async (method, url) => {
      if (url.endsWith('/api/auth/login')) { issued++; return { status: 200, ok: true, json: { token: `t${issued}` } }; }
      if (url.includes('/api/users/search/global')) {
        if (firstCall) { firstCall = false; return { status: 401, ok: false, json: null }; }
        return { status: 200, ok: true, json: [APP_USER] };
      }
      return { status: 404, ok: false, json: null };
    };
    const p = createAltioraProvider({ baseUrl: 'https://altiora.test', apiKey: 'k', serviceEmail: 'svc@x', servicePassword: 'p', httpClient });
    const r = await p.resolveUser('ivan');
    expect(r).toHaveLength(1);
    expect(issued).toBe(2); // logged in initially, then again after the 401
  });
});
