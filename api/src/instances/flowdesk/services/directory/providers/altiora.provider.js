'use strict';

/**
 * Altiora DirectoryAdapter (F11c). The production directory backend: resolves
 * users / approvers / duty stations through the **Altiora API** (IP-2), the same
 * platform that fronts Login/identity (N1–N3 — the chat never calls Graph/LDAP
 * directly). Per the integration spec (`api/docs/ALTIORA_API_CHAT_INTEGRATION_SPEC.md`):
 *
 *   resolveUser      → GET  /api/users/search/global?searchTerm=&limit=
 *   getUser          → GET  /api/users/{id}
 *   getCurrentUser   → from the proxy-injected identity (X-FlowDesk-User-* headers,
 *                      i.e. AuthContext.sessionUser) — NOT an Altiora /me call
 *   resolveApprover  → getUser → orgUnitId → GET /api/tickets/resolve-approver?orgUnitId=
 *   listLocations    → GET  /api/dutystations
 *   searchLocations  → GET  /api/dutystations/search?q=
 *
 * Two gates: `API-Key` header + a service-user Bearer (obtained via
 * POST /api/auth/login, cached ~3h, refreshed on 401). Errors bubble up raw; the
 * ResilientProvider (F11f) maps them to DirectoryUnavailableError so the engine's
 * ADCC-085 path (retry / manual entry) engages.
 *
 * Field mapping is defensive: the Altiora JSON casing is not pinned in the spec,
 * so `pick()` accepts camelCase / PascalCase / a couple of aliases.
 *
 * @module instances/flowdesk/services/directory/providers/altiora.provider
 */

const { DirectoryUnavailableError } = require('../adapter.interface');

function pick(obj, keys, dflt = undefined) {
  if (!obj) return dflt;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return dflt;
}

/** Altiora AppUser (any casing) → our User shape. */
function mapUser(a) {
  if (!a) return null;
  const first = pick(a, ['firstName', 'FirstName']);
  const last = pick(a, ['lastName', 'LastName']);
  const display = pick(a, ['displayName', 'DisplayName']) || [first, last].filter(Boolean).join(' ') || undefined;
  const dsName = pick(a, ['dutyStationName', 'DutyStationName', 'dutyStation']);
  const dsCode = pick(a, ['dutyStationCode', 'DutyStationCode', 'dutyStationId', 'DutyStationId']);
  return {
    userId: String(pick(a, ['userId', 'UserId', 'id', 'Id'], '')),
    name: display || '(unknown)',
    email: pick(a, ['email', 'Email'], null),
    location: { code: dsCode != null ? String(dsCode) : null, name: dsName || null },
    department: pick(a, ['primaryOrgUnitName', 'PrimaryOrgUnitName', 'organizationUnitName', 'OrganizationUnitName'], null),
    role: mapRole(pick(a, ['roles', 'Roles'])),
    managerId: null, // Altiora uses org-unit approver resolution, not a manager chain
    orgUnitId: pick(a, ['primaryOrgUnitId', 'PrimaryOrgUnitId', 'organizationUnitId', 'OrganizationUnitId', 'orgUnitId'], null),
    orgUnitPath: pick(a, ['primaryOrgUnitCodePath', 'PrimaryOrgUnitCodePath', 'orgUnitPath'], null),
  };
}

function mapRole(roles) {
  const list = Array.isArray(roles) ? roles.map((r) => String(r).toLowerCase()) : [];
  if (list.some((r) => r.includes('director'))) return 'director';
  if (list.some((r) => r.includes('manager') || r.includes('approver') || r.includes('helpdesk'))) return 'manager';
  return 'staff';
}

/** Altiora DutyStation (any casing) → our Location shape. */
function mapLocation(d) {
  if (!d) return null;
  return {
    code: String(pick(d, ['dutyStationId', 'DutyStationId', 'code', 'Code', 'id', 'Id'], '')),
    name: pick(d, ['name', 'Name'], null),
    building: pick(d, ['building', 'Building']),
    city: pick(d, ['cityName', 'CityName', 'city', 'City'], null),
    timezone: pick(d, ['timeZoneTitle', 'TimeZoneTitle', 'timezone', 'timeZone'], null),
  };
}

/** Build a User from the proxy-injected identity (flowdesk-user.middleware shape). */
function mapSessionUser(su) {
  return {
    userId: String(pick(su, ['userId', 'id'], '')),
    name: pick(su, ['displayName', 'name'], null) || '(current user)',
    email: pick(su, ['email'], null),
    location: { code: pick(su.location || {}, ['dutyStationCode', 'code'], null), name: pick(su.location || {}, ['dutyStation', 'name'], null) },
    department: pick(su.orgUnit || {}, ['name'], null),
    role: 'staff',
    managerId: null,
    orgUnitId: pick(su.orgUnit || {}, ['id', 'orgUnitId'], null),
    orgUnitPath: pick(su.orgUnit || {}, ['path'], null),
    mode: 'self',
  };
}

function createAltioraProvider(config = {}) {
  const providerId = 'altiora';
  const baseUrl = (config.baseUrl || process.env.ALTIORA_API_BASE || 'http://localhost:5000').replace(/\/$/, '');
  const apiKey = config.apiKey || process.env.ALTIORA_API_KEY || null;
  const svcEmail = config.serviceEmail || process.env.ALTIORA_SERVICE_EMAIL || null;
  const svcPassword = config.servicePassword || process.env.ALTIORA_SERVICE_PASSWORD || null;
  let token = config.token || process.env.ALTIORA_API_TOKEN || null;
  let tokenExp = token ? Infinity : 0; // a pre-supplied token has no known expiry
  const httpClient = config.httpClient || defaultHttp;

  function defaultHttp(method, url, { headers, body } = {}) {
    return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => ({ status: r.status, ok: r.ok, json: await r.json().catch(() => null) }));
  }

  async function login() {
    if (!svcEmail || !svcPassword) throw new Error('ALTIORA_SERVICE_EMAIL/PASSWORD not configured (and no ALTIORA_API_TOKEN)');
    const res = await httpClient('POST', `${baseUrl}/api/auth/login`, {
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'API-Key': apiKey } : {}) },
      body: { email: svcEmail, password: svcPassword },
    });
    if (!res.ok || !res.json) throw new Error(`login ${res.status}`);
    token = pick(res.json, ['token', 'Token']);
    tokenExp = Date.now() + 2.5 * 3600 * 1000; // refresh a bit before the 3h expiry
    if (!token) throw new Error('login returned no token');
    return token;
  }

  async function ensureToken() {
    if (token && Date.now() < tokenExp) return token;
    return login();
  }

  async function call(method, path, { query, retry = true } = {}) {
    const t = await ensureToken();
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString()}` : '';
    const res = await httpClient(method, `${baseUrl}${path}${qs}`, {
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'API-Key': apiKey } : {}), Authorization: `Bearer ${t}` },
    });
    if (res.status === 401 && retry) { token = null; return call(method, path, { query, retry: false }); }
    if (res.status === 404) return { status: 404, json: null };
    if (!res.ok) throw new Error(`Altiora ${method} ${path} → ${res.status}`);
    return res;
  }

  const asArray = (json) => (Array.isArray(json) ? json : (json && (json.items || json.results || json.data)) || []);

  return {
    providerId,
    baseUrl,

    async resolveUser(query) {
      const res = await call('GET', '/api/users/search/global', { query: { searchTerm: query, limit: 20 } });
      return asArray(res.json).map(mapUser).filter(Boolean);
    },

    async getUser(userId) {
      const res = await call('GET', `/api/users/${encodeURIComponent(userId)}`);
      return res.status === 404 ? null : mapUser(res.json);
    },

    async getCurrentUser(context = {}) {
      if (context.sessionUser && (context.sessionUser.userId || context.sessionUser.id)) return mapSessionUser(context.sessionUser);
      if (context.userId) { const u = await this.getUser(context.userId); if (u) return u; }
      // In production the proxy always injects identity; its absence is a real fault.
      throw new DirectoryUnavailableError(providerId, 'no current-user identity (proxy headers missing)');
    },

    async resolveApprover(userId) {
      const user = await this.getUser(userId);
      const orgUnitId = user && user.orgUnitId;
      if (!orgUnitId) return null;
      const res = await call('GET', '/api/tickets/resolve-approver', { query: { orgUnitId } });
      const j = res.json || {};
      const users = asArray(pick(j, ['users', 'Users']) || j);
      return users.length ? mapUser(users[0]) : null;
    },

    // Altiora resolves approvers by org-unit, not a manager chain — expose the
    // same result under getManager for interface completeness.
    getManager(userId) { return this.resolveApprover(userId); },

    // No enterprise "list all managers" endpoint; alternatives are not surfaced.
    async listManagers() { return []; },

    async listLocations() {
      const res = await call('GET', '/api/dutystations');
      return asArray(res.json).map(mapLocation).filter(Boolean);
    },

    async resolveLocation(code) {
      // Duty-station "code" is the GUID dutyStationId — text search won't match it,
      // so resolve from the full list (small, cached upstream).
      const all = await this.listLocations();
      return all.find((l) => l && String(l.code).toLowerCase() === String(code).toLowerCase()) || null;
    },

    async searchLocations(query) {
      const res = await call('GET', '/api/dutystations/search', { query: { q: query } });
      return asArray(res.json).map(mapLocation).filter(Boolean);
    },
  };
}

module.exports = { createAltioraProvider, mapUser, mapLocation, mapSessionUser, mapRole };
