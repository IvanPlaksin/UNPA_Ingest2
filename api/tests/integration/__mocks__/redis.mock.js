/**
 * In-memory Redis mock for integration tests.
 */
'use strict';

class RedisMock {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    const val = this.store.get(key);
    if (val === undefined) return null;
    // Redis returns strings; if stored as JSON, return as-is
    return typeof val === 'string' ? val : JSON.stringify(val);
  }

  async set(key, value, ttlSec) {
    this.store.set(key, value);
    if (ttlSec) {
      this.ttls.set(key, Date.now() + ttlSec * 1000);
    }
    return 'OK';
  }

  async del(key) {
    this.store.delete(key);
    this.ttls.delete(key);
    return 1;
  }

  async incr(key) {
    const val = parseInt(this.store.get(key) || '0', 10) + 1;
    this.store.set(key, String(val));
    return val;
  }

  async expire(key, sec) {
    this.ttls.set(key, Date.now() + sec * 1000);
    return 1;
  }

  async ttl(key) {
    const t = this.ttls.get(key);
    if (!t) return -1;
    return Math.max(0, Math.ceil((t - Date.now()) / 1000));
  }

  async ping() { return 'PONG'; }

  reset() {
    this.store.clear();
    this.ttls.clear();
  }
}

/**
 * Create a mock that matches redis.service module.exports shape
 * (standalone functions, not class methods)
 */
function createRedisMockModule() {
  const mock = new RedisMock();
  return {
    get: (k) => mock.get(k),
    set: (k, v, ttl) => mock.set(k, v, ttl),
    del: (k) => mock.del(k),
    flush: () => { mock.reset(); return Promise.resolve(); },
    destroy: () => Promise.resolve(),
    client: null,
    getClient: () => null,
    isReady: () => true,
    getCachedHealthCheck: async (key, fn) => ({ data: await fn(), cached: false }),
    getCachedConfig: async (key, fn) => fn(),
    invalidateConfig: async () => {},
    invalidateAllHealthChecks: async () => {},
    invalidateAllConfigs: async () => {},
    CACHE_TTL: 60,
    CACHE_KEYS: {},
    _mock: mock // exposed for test access
  };
}

module.exports = { RedisMock, createRedisMockModule };
