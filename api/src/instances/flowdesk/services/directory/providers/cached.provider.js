'use strict';

/**
 * CachedProvider (F11e) — a caching decorator around any DirectoryAdapter. The
 * directory is hit on almost every turn (resolve beneficiary/author/approver,
 * default location), so a short-TTL cache in front of the provider (mock now,
 * the Altiora API later) removes repeated lookups. Transparent: `providerId`
 * mirrors the base, so callers and the contract are unchanged.
 *
 * Strategy:
 *   - users / search: stale-while-revalidate — a soft TTL bounds freshness;
 *     past it the stale value is returned immediately and a refresh runs async
 *     (physical Redis TTL = 2× soft, so stale is still available to serve).
 *   - locations: plain TTL (rarely change).
 *   - When the store is absent/unready (Redis down, tests) every call passes
 *     straight through — caching is best-effort, never a dependency.
 *
 * @module instances/flowdesk/services/directory/providers/cached.provider
 */

const DEFAULTS = {
  userTTL: Number(process.env.FLOWDESK_DIRECTORY_CACHE_TTL_USERS) || 300, // 5 min
  locationTTL: Number(process.env.FLOWDESK_DIRECTORY_CACHE_TTL_LOCATIONS) || 3600, // 1 h
  searchTTL: Number(process.env.FLOWDESK_DIRECTORY_CACHE_TTL_SEARCH) || 120, // 2 min
};

function djb2(s) {
  let h = 5381;
  const str = String(s == null ? '' : s).toLowerCase().trim();
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * @param {import('../adapter.interface').DirectoryAdapter} base
 * @param {Object} deps
 * @param {{get,set,del}} [deps.store]  - key/value store (JSON in/out); default redis.service
 * @param {() => number} [deps.now]
 * @param {Object} [deps.config]
 */
function createCachedProvider(base, deps = {}) {
  const store = deps.store === undefined ? safeRedis() : deps.store;
  const now = deps.now || (() => Date.now());
  const ttl = { ...DEFAULTS, ...(deps.config || {}) };
  let lastRefresh = null; // exposed for tests

  function safeRedisModule() { try { return require('../../../../../services/redis.service'); } catch { return null; } }
  function safeRedis() {
    const r = safeRedisModule();
    return r ? { get: (k) => r.get(k), set: (k, v, s) => r.set(k, v, s), del: (k) => r.del(k) } : null;
  }

  function refreshAsync(key, softSec, producer) {
    lastRefresh = Promise.resolve().then(async () => {
      try { const v = await producer(); await store.set(key, { v, soft: now() + softSec * 1000 }, softSec * 2); }
      catch { /* best-effort refresh */ }
    });
    return lastRefresh;
  }

  async function cachedCall(key, softSec, swr, producer) {
    if (!store) return producer();
    let env = null;
    try { env = await store.get(key); } catch { env = null; }
    const t = now();
    if (env && typeof env === 'object' && 'v' in env) {
      if (t < env.soft) return env.v;            // fresh hit
      if (swr) { refreshAsync(key, softSec, producer); return env.v; } // stale-while-revalidate
    }
    const v = await producer();                  // miss (or non-swr expiry)
    const physical = swr ? softSec * 2 : softSec;
    try { await store.set(key, { v, soft: t + softSec * 1000 }, physical); } catch { /* best-effort */ }
    return v;
  }

  const K = {
    user: (id) => `directory:user:${id}`,
    manager: (id) => `directory:manager:${id}`,
    approver: (id) => `directory:approver:${id}`,
    managers: 'directory:managers:all',
    me: (id) => `directory:me:${id}`,
    searchUser: (q) => `directory:search:user:${djb2(q)}`,
    locations: 'directory:locations:all',
    location: (c) => `directory:location:${String(c).toLowerCase()}`,
    searchLoc: (q) => `directory:search:loc:${djb2(q)}`,
  };

  return {
    providerId: base.providerId, // transparent decorator
    cached: true,

    resolveUser: (query) => cachedCall(K.searchUser(query), ttl.searchTTL, true, () => base.resolveUser(query)),
    getUser: (userId) => cachedCall(K.user(userId), ttl.userTTL, true, () => base.getUser(userId)),
    async getCurrentUser(context = {}) {
      // A pre-resolved sessionUser is already in hand — nothing to cache.
      if (context && context.sessionUser && context.sessionUser.userId) return base.getCurrentUser(context);
      const id = (context && context.userId) || (context && context.token ? `t:${djb2(context.token)}` : 'default');
      return cachedCall(K.me(id), ttl.userTTL, true, () => base.getCurrentUser(context));
    },
    getManager: (userId) => cachedCall(K.manager(userId), ttl.userTTL, true, () => base.getManager(userId)),
    resolveApprover: (userId) => cachedCall(K.approver(userId), ttl.userTTL, true, () => base.resolveApprover(userId)),
    listManagers: () => cachedCall(K.managers, ttl.userTTL, true, () => base.listManagers()),
    listLocations: () => cachedCall(K.locations, ttl.locationTTL, false, () => base.listLocations()),
    resolveLocation: (code) => cachedCall(K.location(code), ttl.locationTTL, false, () => base.resolveLocation(code)),
    searchLocations: (query) => cachedCall(K.searchLoc(query), ttl.searchTTL, true, () => base.searchLocations(query)),

    // ── invalidation (F11e) ──
    async invalidateUser(userId) {
      if (!store) return;
      for (const k of [K.user(userId), K.manager(userId), K.approver(userId), K.me(userId)]) {
        try { await store.del(k); } catch { /* best-effort */ }
      }
    },
    async invalidateLocations() {
      if (!store) return;
      try { await store.del(K.locations); } catch { /* best-effort */ }
    },

    // test seam
    _lastRefresh: () => lastRefresh,
  };
}

module.exports = { createCachedProvider, DEFAULTS, djb2 };
