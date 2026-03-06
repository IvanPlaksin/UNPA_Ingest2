/**
 * Base Connector
 * Abstract base class for all data source connectors
 *
 * Features:
 *   - connect/disconnect lifecycle
 *   - retry mechanism with exponential backoff
 *   - stats tracking
 *   - event emitting
 *
 * @module services/connectors/base-connector
 */

const { EventEmitter } = require('events');

class BaseConnector extends EventEmitter {
  constructor(name, options = {}) {
    super();

    this.name = name;
    this.type = options.type || 'generic';
    this.options = {
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      ...options
    };

    this.connected = false;
    this.lastError = null;
    this.stats = {
      connectAttempts: 0,
      successfulConnects: 0,
      itemsFetched: 0,
      errors: 0,
      lastActivity: null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE (must override)
  // ═══════════════════════════════════════════════════════════════════════

  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Test connection (connect then disconnect)
   */
  async testConnection() {
    try {
      await this.connect();
      await this.disconnect();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA ACCESS (must override)
  // ═══════════════════════════════════════════════════════════════════════

  async list(path, options = {}) {
    throw new Error('list() must be implemented by subclass');
  }

  async fetch(itemId, options = {}) {
    throw new Error('fetch() must be implemented by subclass');
  }

  /**
   * Fetch multiple items
   */
  async fetchMany(itemIds, options = {}) {
    const results = [];

    for (const id of itemIds) {
      try {
        const item = await this.fetch(id, options);
        results.push({ id, success: true, data: item });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Search items (optional override)
   */
  async search(query, options = {}) {
    throw new Error('search() not supported by this connector');
  }

  /**
   * Watch for changes (optional override)
   */
  async watch(path, callback) {
    throw new Error('watch() not supported by this connector');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RETRY
  // ═══════════════════════════════════════════════════════════════════════

  async withRetry(operation, context = '') {
    let lastError;

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`[${this.name}] ${context} attempt ${attempt} failed:`, error.message);

        if (attempt < this.options.retryAttempts) {
          await this._delay(this.options.retryDelay * attempt);
        }
      }
    }

    this.stats.errors++;
    this.lastError = lastError;
    throw lastError;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════

  _updateStats(event, count = 1) {
    this.stats.lastActivity = new Date().toISOString();

    switch (event) {
      case 'connect':
        this.stats.connectAttempts++;
        break;
      case 'connect_success':
        this.stats.successfulConnects++;
        break;
      case 'fetch':
        this.stats.itemsFetched += count;
        break;
      case 'error':
        this.stats.errors += count;
        break;
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get connector info
   */
  getInfo() {
    return {
      name: this.name,
      type: this.type,
      connected: this.connected,
      lastError: this.lastError?.message || null,
      stats: this.stats
    };
  }
}

module.exports = { BaseConnector };
