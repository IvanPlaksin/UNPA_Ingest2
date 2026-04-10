/**
 * Resilient Memgraph Client Wrapper (PH-007)
 *
 * Adds circuit breaker protection and graceful degradation to Memgraph queries.
 * Read queries return empty results when Memgraph is unavailable.
 * Write queries propagate errors (no silent data loss).
 *
 * @module db/resilient-memgraph
 */

'use strict';

const { getCircuitBreaker } = require('../utils/circuit-breaker');
const logger = require('../utils/logger').child('Memgraph');

class ResilientMemgraph {
  constructor(driver, options = {}) {
    this.driver = driver;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 2000;
    this.isReconnecting = false;

    this.breaker = getCircuitBreaker('memgraph', {
      failureThreshold: options.failureThreshold || 3,
      resetTimeout: options.resetTimeout || 15000,
      halfOpenMax: options.halfOpenMax || 2
    });
  }

  /**
   * Execute a Cypher read query with graceful degradation.
   */
  async query(cypher, params = {}, options = {}) {
    const { fallback = null } = options;

    return this.breaker.execute(
      async () => {
        const session = this.driver.session();
        try {
          const result = await session.run(cypher, params);
          return result.records;
        } finally {
          await session.close();
        }
      },
      () => {
        if (fallback !== null) {
          logger.warn({ query: cypher.substring(0, 80) }, 'Using fallback for read query');
          return typeof fallback === 'function' ? fallback() : fallback;
        }
        // Default: empty result for MATCH queries
        if (cypher.trim().toUpperCase().startsWith('MATCH')) {
          logger.warn({ query: cypher.substring(0, 80) }, 'Returning empty result (Memgraph unavailable)');
          return [];
        }
        throw new Error('Memgraph unavailable');
      }
    );
  }

  /**
   * Execute a write query (no fallback — must propagate errors).
   */
  async write(cypher, params = {}) {
    return this.breaker.execute(
      async () => {
        const session = this.driver.session();
        try {
          const result = await session.run(cypher, params);
          return result.records;
        } finally {
          await session.close();
        }
      }
    );
  }

  async healthCheck() {
    try {
      await this.query('RETURN 1 AS health', {}, { fallback: null });
      return { healthy: true, state: this.breaker.getState() };
    } catch (error) {
      return { healthy: false, error: error.message, state: this.breaker.getState() };
    }
  }

  async reconnect() {
    if (this.isReconnecting) return false;
    this.isReconnecting = true;
    logger.info('Attempting Memgraph reconnection...');

    for (let attempt = 1; attempt <= this.maxReconnectAttempts; attempt++) {
      try {
        await this.driver.verifyConnectivity();
        this.breaker.reset();
        logger.info({ attempt }, 'Memgraph reconnected');
        this.isReconnecting = false;
        return true;
      } catch (error) {
        logger.warn({ attempt, error: error.message }, 'Reconnect attempt failed');
        if (attempt < this.maxReconnectAttempts) {
          await new Promise(r => setTimeout(r, this.reconnectDelay * attempt));
        }
      }
    }

    logger.error('Memgraph reconnection failed after all attempts');
    this.isReconnecting = false;
    return false;
  }

  getState() { return this.breaker.getState(); }
}

module.exports = { ResilientMemgraph };
