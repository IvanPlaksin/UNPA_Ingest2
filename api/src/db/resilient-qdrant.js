/**
 * Resilient Qdrant Client Wrapper (PH-007)
 *
 * Circuit breaker protection for vector search operations.
 * Search returns empty results on failure. Writes propagate errors.
 *
 * @module db/resilient-qdrant
 */

'use strict';

const { getCircuitBreaker } = require('../utils/circuit-breaker');
const logger = require('../utils/logger').child('Qdrant');

class ResilientQdrant {
  constructor(client, options = {}) {
    this.client = client;

    this.breaker = getCircuitBreaker('qdrant', {
      failureThreshold: options.failureThreshold || 3,
      resetTimeout: options.resetTimeout || 10000,
      halfOpenMax: options.halfOpenMax || 2
    });
  }

  async search(collection, vector, options = {}) {
    return this.breaker.execute(
      () => this.client.search(collection, {
        vector,
        limit: options.limit || 10,
        filter: options.filter,
        with_payload: options.withPayload ?? true,
        with_vector: options.withVector ?? false
      }),
      () => {
        logger.warn({ collection }, 'Qdrant search unavailable, returning empty');
        return [];
      }
    );
  }

  async upsert(collection, points) {
    return this.breaker.execute(
      () => this.client.upsert(collection, { points })
      // No fallback for writes
    );
  }

  async healthCheck() {
    try {
      await this.breaker.execute(() => this.client.getCollections());
      return { healthy: true, state: this.breaker.getState() };
    } catch (error) {
      return { healthy: false, error: error.message, state: this.breaker.getState() };
    }
  }

  getState() { return this.breaker.getState(); }
}

module.exports = { ResilientQdrant };
