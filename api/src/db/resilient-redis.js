/**
 * Resilient Redis Client Wrapper (PH-007)
 *
 * Circuit breaker with in-memory fallback cache.
 * When Redis is down, reads/writes degrade to local Map.
 * Rate limiting fails open (allows requests through).
 *
 * @module db/resilient-redis
 */

'use strict';

const { getCircuitBreaker } = require('../utils/circuit-breaker');
const logger = require('../utils/logger').child('Redis');

class ResilientRedis {
  constructor(client, options = {}) {
    this.client = client;
    this.useFallback = options.useFallback ?? true;
    this.fallbackCache = new Map();
    this.fallbackTTLs = new Map();

    this.breaker = getCircuitBreaker('redis', {
      failureThreshold: options.failureThreshold || 3,
      resetTimeout: options.resetTimeout || 10000,
      halfOpenMax: options.halfOpenMax || 2
    });
  }

  async get(key) {
    return this.breaker.execute(
      () => this.client.get(key),
      () => {
        if (!this.useFallback) return null;
        const value = this.fallbackCache.get(key);
        const ttl = this.fallbackTTLs.get(key);
        if (ttl && Date.now() > ttl) {
          this.fallbackCache.delete(key);
          this.fallbackTTLs.delete(key);
          return null;
        }
        return value ?? null;
      }
    );
  }

  async set(key, value, options = {}) {
    if (this.useFallback) {
      this.fallbackCache.set(key, value);
      if (options.EX) {
        this.fallbackTTLs.set(key, Date.now() + options.EX * 1000);
      }
    }

    return this.breaker.execute(
      () => this.client.set(key, value, options),
      () => {
        logger.debug({ key }, 'Redis SET failed, stored in memory');
        return 'OK';
      }
    );
  }

  async del(key) {
    this.fallbackCache.delete(key);
    this.fallbackTTLs.delete(key);
    return this.breaker.execute(
      () => this.client.del(key),
      () => 1
    );
  }

  async incr(key) {
    return this.breaker.execute(
      () => this.client.incr(key),
      () => {
        const current = parseInt(this.fallbackCache.get(key) || '0', 10);
        const next = current + 1;
        this.fallbackCache.set(key, String(next));
        return next;
      }
    );
  }

  async healthCheck() {
    try {
      await this.breaker.execute(() => this.client.ping());
      return { healthy: true, state: this.breaker.getState(), fallbackSize: this.fallbackCache.size };
    } catch (error) {
      return { healthy: false, error: error.message, state: this.breaker.getState(), fallbackSize: this.fallbackCache.size };
    }
  }

  getState() {
    return { ...this.breaker.getState(), fallbackSize: this.fallbackCache.size };
  }

  clearFallbackCache() {
    this.fallbackCache.clear();
    this.fallbackTTLs.clear();
  }
}

module.exports = { ResilientRedis };
