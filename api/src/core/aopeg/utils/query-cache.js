/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUERY RESULT CACHE
 * In-memory caching layer for graph query results
 * ═══════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  // Default TTL in milliseconds (5 minutes)
  defaultTtl: 5 * 60 * 1000,
  // Maximum number of entries in cache
  maxEntries: 1000,
  // Enable cache statistics
  enableStats: true,
  // Cache key prefix
  keyPrefix: 'qcache:'
};

// ────────────────────────────────────────────────────────────────────────────
// CACHE ENTRY
// ────────────────────────────────────────────────────────────────────────────

class CacheEntry {
  constructor(value, ttl) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttl;
    this.hits = 0;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  hit() {
    this.hits++;
    return this.value;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// QUERY CACHE
// ────────────────────────────────────────────────────────────────────────────

class QueryCache {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.config.defaultTtl
    );
  }

  /**
   * Generate a cache key from query and parameters
   * @param {string} query - Cypher query
   * @param {object} params - Query parameters
   * @returns {string} - Cache key
   */
  generateKey(query, params = {}) {
    const normalized = JSON.stringify({ query, params });
    const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    return `${this.config.keyPrefix}${hash}`;
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} - Cached value or undefined
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.config.enableStats) this.stats.misses++;
      return undefined;
    }

    if (entry.isExpired()) {
      this.cache.delete(key);
      if (this.config.enableStats) this.stats.misses++;
      return undefined;
    }

    if (this.config.enableStats) this.stats.hits++;
    return entry.hit();
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - TTL in milliseconds (optional)
   */
  set(key, value, ttl = this.config.defaultTtl) {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, new CacheEntry(value, ttl));
    if (this.config.enableStats) this.stats.sets++;
  }

  /**
   * Get or set a value with a factory function
   * @param {string} query - Cypher query
   * @param {object} params - Query parameters
   * @param {function} factory - Async factory function
   * @param {number} ttl - TTL in milliseconds (optional)
   * @returns {Promise<*>} - Cached or fresh value
   */
  async getOrSet(query, params, factory, ttl = this.config.defaultTtl) {
    const key = this.generateKey(query, params);
    let value = this.get(key);

    if (value !== undefined) {
      return value;
    }

    value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param {string|RegExp} pattern - Key pattern to match
   */
  invalidate(pattern) {
    if (typeof pattern === 'string') {
      this.cache.delete(pattern);
      return;
    }

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Evict the oldest entry
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      if (this.config.enableStats) this.stats.evictions++;
    }
  }

  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.config.maxEntries
    };
  }

  /**
   * Shutdown the cache
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON & EXPORTS
// ────────────────────────────────────────────────────────────────────────────

/** @type {QueryCache} */
let instance = null;

/**
 * Get QueryCache singleton
 * @param {object} config - Optional configuration
 * @returns {QueryCache}
 */
function getQueryCache(config) {
  if (!instance) {
    instance = new QueryCache(config);
  }
  return instance;
}

/**
 * Create a dedicated cache for a specific namespace
 * @param {string} namespace - Cache namespace
 * @param {object} config - Optional configuration
 * @returns {QueryCache}
 */
function createNamespacedCache(namespace, config = {}) {
  return new QueryCache({
    ...config,
    keyPrefix: `${namespace}:`
  });
}

// Cache TTL presets
const TTL = {
  SHORT: 30 * 1000,        // 30 seconds
  MEDIUM: 5 * 60 * 1000,   // 5 minutes
  LONG: 30 * 60 * 1000,    // 30 minutes
  HOUR: 60 * 60 * 1000     // 1 hour
};

module.exports = {
  QueryCache,
  getQueryCache,
  createNamespacedCache,
  TTL
};
