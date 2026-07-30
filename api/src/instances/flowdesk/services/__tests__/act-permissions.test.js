'use strict';

// Mock the Memgraph driver so the permissions store is testable without a DB.
const mockStore = new Map(); // key -> { key, enabled, ... }
const mockDefaults = new Map(); // permission -> enabledForAll
jest.mock('../../schema-graph/driver', () => ({
  runAutocommit: async () => [],
  read: async (cypher) => {
    if (/FlowdeskPermissionDefault.*RETURN d\.permission/s.test(cypher)) {
      return [...mockDefaults.entries()].map(([permission, enabledForAll]) => ({ get: (k) => (k === 'permission' ? permission : enabledForAll) }));
    }
    if (/WHERE p\.enabled RETURN p\.key/.test(cypher)) {
      return [...mockStore.values()].filter((n) => n.enabled).map((n) => ({ get: () => n.key }));
    }
    return [...mockStore.values()].map((n) => ({ get: () => ({ properties: n }) }));
  },
  write: async (cypher, params) => {
    if (/MERGE \(d:FlowdeskPermissionDefault/.test(cypher)) {
      mockDefaults.set(params.permission, params.enabledForAll); return [{ get: () => ({ properties: params }) }];
    }
    const k = params.k;
    if (/DETACH DELETE/.test(cypher)) { mockStore.delete(k); return []; }
    if (/SET p\.enabled = \$enabled/.test(cypher)) {
      const n = mockStore.get(k); if (!n) return [];
      n.enabled = params.enabled; return [{ get: () => ({ properties: n }) }];
    }
    // MERGE add
    const n = mockStore.get(k) || { key: k, addedAt: params.now };
    Object.assign(n, { label: params.label, kind: params.kind, enabled: true, addedBy: params.addedBy });
    mockStore.set(k, n);
    return [{ get: () => ({ properties: n }) }];
  },
}));

describe('act-permissions.service (mocked driver)', () => {
  let perms;
  beforeEach(() => { mockStore.clear(); mockDefaults.clear(); jest.resetModules(); perms = require('../act-permissions.service'); });

  test('add persists + exposes enabled key to the gate', async () => {
    await perms.add({ key: 'Ivan@UN.org', label: 'Ivan', addedBy: 'admin' });
    expect(perms.getDynamicKeys()).toContain('ivan@un.org'); // normalized lowercase
    const list = await perms.list();
    expect(list[0]).toMatchObject({ key: 'ivan@un.org', kind: 'email', enabled: true });
  });

  test('kind detection: uuid vs email', async () => {
    await perms.add({ key: 'B2D97601-865B-444F-B369-5912ECABB360' });
    const list = await perms.list();
    expect(list[0].kind).toBe('userId');
  });

  test('setEnabled toggles cache + remove clears it', async () => {
    await perms.add({ key: 'x@y.z' });
    await perms.setEnabled('x@y.z', false);
    expect(perms.getDynamicKeys()).not.toContain('x@y.z');
    await perms.setEnabled('x@y.z', true);
    expect(perms.getDynamicKeys()).toContain('x@y.z');
    await perms.remove('x@y.z');
    expect(perms.getDynamicKeys()).not.toContain('x@y.z');
  });

  test('effective unions env + dynamic, fail-closed when empty', async () => {
    process.env.FLOWDESK_ACT_USERS = 'boss@un.org';
    await perms.add({ key: 'ivan@un.org' });
    const eff = await perms.effective();
    expect(eff.env).toContain('boss@un.org');
    expect(eff.effective).toEqual(expect.arrayContaining(['boss@un.org', 'ivan@un.org']));
    expect(eff.failClosed).toBe(false);
    delete process.env.FLOWDESK_ACT_USERS;
  });

  test('setDefault toggles the global "enabled for all" flag', async () => {
    expect(perms.getDefault('submit_service_request')).toBe(false);
    await perms.setDefault('submit_service_request', true, 'admin');
    expect(perms.getDefault('submit_service_request')).toBe(true);
    const list = perms.listPermissions();
    expect(list.find((p) => p.key === 'submit_service_request').enabledForAll).toBe(true);
    await perms.setDefault('submit_service_request', false, 'admin');
    expect(perms.getDefault('submit_service_request')).toBe(false);
  });

  test('setDefault rejects unknown permission', async () => {
    await expect(perms.setDefault('bogus', true)).rejects.toThrow(/unknown permission/);
  });

  test('enabled-for-all default lifts fail-closed even with empty allowlist', async () => {
    delete process.env.FLOWDESK_ACT_USERS;
    await perms.setDefault('submit_service_request', true, 'admin');
    const eff = await perms.effective();
    expect(eff.failClosed).toBe(false); // everyone may act
  });
});

describe('act-authorization union with dynamic grants', () => {
  let authz;
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../act-permissions.service', () => ({ getDynamicKeys: jest.fn(() => []), getDefault: jest.fn(() => false) }));
    authz = require('../act-authorization');
  });
  afterEach(() => { delete process.env.FLOWDESK_ACT_USERS; });

  test('env allowlist authorizes', () => {
    process.env.FLOWDESK_ACT_USERS = 'ivan@un.org';
    expect(authz.isActAuthorized({ email: 'Ivan@UN.org' })).toBe(true);
  });

  test('dynamic grant supplements empty env', () => {
    process.env.FLOWDESK_ACT_USERS = '';
    require('../act-permissions.service').getDynamicKeys.mockReturnValue(['b2d97601-865b-444f-b369-5912ecabb360']);
    expect(authz.isActAuthorized({ userId: 'B2D97601-865B-444F-B369-5912ECABB360' })).toBe(true);
  });

  test('fail closed when env + dynamic both empty', () => {
    process.env.FLOWDESK_ACT_USERS = '';
    require('../act-permissions.service').getDynamicKeys.mockReturnValue([]);
    require('../act-permissions.service').getDefault = jest.fn(() => false);
    expect(authz.isActAuthorized({ email: 'x@y.z' })).toBe(false);
  });

  test('global "enabled for all" default authorizes any user', () => {
    process.env.FLOWDESK_ACT_USERS = '';
    const svc = require('../act-permissions.service');
    svc.getDynamicKeys.mockReturnValue([]);
    svc.getDefault = jest.fn((p) => p === 'submit_service_request');
    expect(authz.isActAuthorized({ email: 'anyone@anywhere.z' })).toBe(true);
  });
});
