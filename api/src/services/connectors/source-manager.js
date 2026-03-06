/**
 * Source Manager
 * Unified interface for managing multiple data source connectors
 *
 * Features:
 *   - Register/unregister connectors by name
 *   - Connect/disconnect all at once
 *   - Fetch and ingest through ingestion pipeline
 *   - Cross-source search
 *   - Event forwarding
 *
 * @module services/connectors/source-manager
 */

const { EventEmitter } = require('events');
const { FileSystemConnector } = require('./filesystem-connector');
const { TFSConnector } = require('./tfs-connector');
const { SharePointConnector } = require('./sharepoint-connector');

class SourceManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = options;
    this.connectors = new Map();
    this.connectorTypes = {
      filesystem: FileSystemConnector,
      tfs: TFSConnector,
      sharepoint: SharePointConnector
    };

    this.stats = {
      totalSources: 0,
      connectedSources: 0,
      totalFetched: 0,
      totalIngested: 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════

  register(name, type, config = {}) {
    if (this.connectors.has(name)) {
      throw new Error(`Connector "${name}" already registered`);
    }

    const ConnectorClass = this.connectorTypes[type];
    if (!ConnectorClass) {
      throw new Error(`Unknown connector type: ${type}`);
    }

    const connector = new ConnectorClass(config);

    connector.on('connected', () => {
      this.stats.connectedSources++;
      this.emit('connector:connected', { name, type });
    });

    connector.on('disconnected', () => {
      this.stats.connectedSources = Math.max(0, this.stats.connectedSources - 1);
      this.emit('connector:disconnected', { name, type });
    });

    this.connectors.set(name, { connector, type, config });
    this.stats.totalSources++;

    console.log(`[SourceManager] Registered connector: ${name} (${type})`);
    return connector;
  }

  get(name) {
    const entry = this.connectors.get(name);
    return entry?.connector;
  }

  async unregister(name) {
    const entry = this.connectors.get(name);
    if (!entry) return false;

    try {
      await entry.connector.disconnect();
    } catch (error) {
      // Ignore disconnect errors during unregister
    }

    this.connectors.delete(name);
    this.stats.totalSources--;
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  async connect(name) {
    const connector = this.get(name);
    if (!connector) {
      throw new Error(`Connector "${name}" not found`);
    }
    return connector.connect();
  }

  async connectAll() {
    const results = {};

    for (const [name, { connector }] of this.connectors) {
      try {
        await connector.connect();
        results[name] = { success: true };
      } catch (error) {
        results[name] = { success: false, error: error.message };
      }
    }

    return results;
  }

  async disconnect(name) {
    const connector = this.get(name);
    if (connector) {
      await connector.disconnect();
    }
  }

  async disconnectAll() {
    for (const [name, { connector }] of this.connectors) {
      try {
        await connector.disconnect();
      } catch (error) {
        console.warn(`[SourceManager] Error disconnecting ${name}:`, error.message);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA ACCESS
  // ═══════════════════════════════════════════════════════════════════════

  async list(sourceName, path, options = {}) {
    const connector = this.get(sourceName);
    if (!connector) {
      throw new Error(`Connector "${sourceName}" not found`);
    }
    return connector.list(path, options);
  }

  async fetch(sourceName, itemPath, options = {}) {
    const connector = this.get(sourceName);
    if (!connector) {
      throw new Error(`Connector "${sourceName}" not found`);
    }

    this.stats.totalFetched++;
    return connector.fetch(itemPath, options);
  }

  async fetchAndIngest(sourceName, itemPath, options = {}) {
    const item = await this.fetch(sourceName, itemPath, options);

    const content = item.text || item.content;
    if (!content) {
      throw new Error('No content to ingest');
    }

    const { ingestionPipeline } = require('../ingestion');

    const result = await ingestionPipeline.ingest(content, {
      format: item.format || '.txt',
      domain: options.domain,
      metadata: {
        source: sourceName,
        path: itemPath,
        ...item
      },
      clientId: options.clientId
    });

    this.stats.totalIngested++;
    return result;
  }

  async batchFetchAndIngest(sourceName, itemPaths, options = {}) {
    const results = [];

    for (const p of itemPaths) {
      try {
        const result = await this.fetchAndIngest(sourceName, p, options);
        results.push({ path: p, success: true, result });
      } catch (error) {
        results.push({ path: p, success: false, error: error.message });
      }
    }

    return {
      results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════════════

  async searchAll(query, options = {}) {
    const results = {};
    const sources = options.sources || [...this.connectors.keys()];

    for (const name of sources) {
      const connector = this.get(name);
      if (!connector) continue;

      try {
        results[name] = await connector.search(query, options);
      } catch (error) {
        results[name] = { error: error.message };
      }
    }

    return {
      query,
      results,
      sourcesSearched: Object.keys(results).length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATUS / STATS
  // ═══════════════════════════════════════════════════════════════════════

  getStatuses() {
    const statuses = {};

    for (const [name, { connector, type }] of this.connectors) {
      statuses[name] = {
        type,
        connected: connector.connected,
        stats: connector.stats,
        lastError: connector.lastError?.message || null
      };
    }

    return statuses;
  }

  listConnectors() {
    return [...this.connectors.entries()].map(([name, { type, connector }]) => ({
      name,
      type,
      connected: connector.connected
    }));
  }

  getStats() {
    return {
      ...this.stats,
      connectors: this.listConnectors()
    };
  }
}

const sourceManager = new SourceManager();

module.exports = {
  SourceManager,
  sourceManager
};
