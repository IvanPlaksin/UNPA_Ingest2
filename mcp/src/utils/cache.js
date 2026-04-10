/**
 * Simple In-Memory Cache with TTL (PH-006)
 *
 * Usage:
 *   const cache = new SimpleCache({ ttl: 5 * 60 * 1000, maxSize: 50 });
 *   cache.set('key', value);
 *   const v = cache.get('key'); // null if expired
 */

export class SimpleCache {
  constructor(options = {}) {
    this.ttl = options.ttl || 5 * 60 * 1000;
    this.maxSize = options.maxSize || 100;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttl = this.ttl) {
    if (this.cache.size >= this.maxSize) {
      this._pruneOldest();
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  _pruneOldest() {
    const toRemove = Math.max(1, Math.floor(this.maxSize * 0.1));
    const entries = [...this.cache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
}

export default SimpleCache;
