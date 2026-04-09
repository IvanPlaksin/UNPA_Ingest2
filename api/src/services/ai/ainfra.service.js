/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AINFRA SERVICE - AI Infrastructure Configuration Management
 *
 * Manages AI-related project settings in the Core Knowledge Graph.
 * Graph structure: AINFRA (AI Infrastructure Root Node)
 *
 * Features:
 * - Named configuration sets (presets)
 * - Provider-specific settings
 * - Rate limits and quotas
 * - Usage history tracking
 * - Budget management
 *
 * OPTIMIZED: Tensor tracking, combined queries, graph indexes
 * ═══════════════════════════════════════════════════════════════════════════
 */

const memgraphService = require('../memgraph.service');
const { v4: uuidv4 } = require('uuid');

// ────────────────────────────────────────────────────────────────────────────
// LAZY TENSOR SERVICE (avoid circular dependency)
// ────────────────────────────────────────────────────────────────────────────

let _tensorService = null;
function getTensorServiceLazy() {
  if (!_tensorService) {
    try {
      const { getTensorService } = require('../tensor.service');
      _tensorService = getTensorService();
    } catch (e) { /* tensor service not available */ }
  }
  return _tensorService;
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH SCHEMA CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const AINFRA_LABELS = {
  ROOT: 'AINFRA',                    // Root node for AI Infrastructure
  CONFIG_SET: 'AIConfigSet',         // Named configuration set
  PROVIDER_CONFIG: 'AIProviderConfig', // Provider-specific configuration
  USAGE_SNAPSHOT: 'AIUsageSnapshot', // Usage history snapshot
  ALERT: 'AIAlert',                  // Usage alert record
};

const AINFRA_RELATIONS = {
  HAS_CONFIG: 'HAS_CONFIG',          // AINFRA -> AIConfigSet
  USES_PROVIDER: 'USES_PROVIDER',    // AIConfigSet -> AIProviderConfig
  HAS_SNAPSHOT: 'HAS_SNAPSHOT',      // AINFRA -> AIUsageSnapshot
  HAS_ALERT: 'HAS_ALERT',            // AINFRA -> AIAlert
  ACTIVE_CONFIG: 'ACTIVE_CONFIG',    // AINFRA -> AIConfigSet (current active)
};

// Default configuration values
const DEFAULT_PROVIDER_CONFIGS = {
  gemini: {
    provider: 'gemini',
    displayName: 'Google Gemini',
    enabled: true,
    rpmLimit: 60,
    dailyTokenLimit: 1000000,
    dailyBudgetUsd: 10,
    defaultModel: 'gemini-pro-latest',
    costPerInputToken: 0.00025,
    costPerOutputToken: 0.0005,
  },
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic Claude',
    enabled: true,
    rpmLimit: 50,
    dailyTokenLimit: 500000,
    dailyBudgetUsd: 20,
    defaultModel: 'claude-sonnet-4-5-20250929',
    costPerInputToken: 0.003,
    costPerOutputToken: 0.015,
  },
  ollama: {
    provider: 'ollama',
    displayName: 'Meta Llama (Local)',
    enabled: true,
    rpmLimit: 100,
    dailyTokenLimit: null, // Unlimited for local
    dailyBudgetUsd: null,  // Free for local
    defaultModel: 'llama3.3:70b',
    costPerInputToken: 0,
    costPerOutputToken: 0,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// AINFRA SERVICE CLASS
// ────────────────────────────────────────────────────────────────────────────

// Cache configuration - INCREASED to reduce database load
const STATUS_CACHE_TTL_MS = 30000; // 30 seconds cache for status (was 10s)
const CONFIG_CACHE_TTL_MS = 60000; // 60 seconds cache for config (was 30s)
const STALE_CACHE_MAX_AGE_MS = 300000; // 5 minutes - max age for stale cache fallback

// Query timeout configuration (prevents hanging queries)
const QUERY_TIMEOUT_MS = {
  FAST: 3000,    // 3 seconds for simple lookups
  NORMAL: 5000,  // 5 seconds for standard queries
  INIT: 15000,   // 15 seconds for initialization (create indexes, etc)
};

class AINFRAService {
  constructor() {
    this.memgraph = memgraphService;
    this.initialized = false;
    this._initPromise = null; // Cache init promise to prevent parallel runs

    // Status cache to reduce database load
    this._statusCache = null;
    this._statusCacheTime = 0;

    // Active config cache (changes rarely)
    this._activeConfigCache = null;
    this._activeConfigCacheTime = 0;

    // In-flight query tracking (prevents duplicate parallel queries)
    this._statusQueryInFlight = null;
    this._configQueryInFlight = null;
  }

  /**
   * Invalidate all caches (call after config changes)
   */
  invalidateCache() {
    this._statusCache = null;
    this._statusCacheTime = 0;
    this._activeConfigCache = null;
    this._activeConfigCacheTime = 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize AINFRA graph structure
   * Creates root node, indexes, and default configuration if not exists
   * OPTIMIZED: Cached promise to prevent parallel initialization
   */
  async initialize() {
    // Return cached promise if already initializing/initialized
    if (this._initPromise) return this._initPromise;
    if (this.initialized) return;

    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  /**
   * Internal initialization logic
   * @private
   */
  async _doInitialize() {
    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.initialize', {});

    const now = new Date().toISOString();

    try {
      // Create indexes for AINFRA labels (run once, idempotent)
      // Uses longer INIT timeout since index creation can take time
      await this._ensureIndexes();

      // Create AINFRA root node if not exists - single optimized query
      await this.memgraph.executeQuery(`
        MERGE (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
        ON CREATE SET
          root.name = 'AI Infrastructure',
          root.createdAt = $now,
          root.updatedAt = $now,
          root.version = '1.0'
        RETURN root
      `, { now }, { timeout: QUERY_TIMEOUT_MS.INIT });

      // Check if default config exists
      const result = await this.memgraph.executeQuery(`
        MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
        -[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET} {name: 'default'})
        RETURN config
      `, {}, { timeout: QUERY_TIMEOUT_MS.NORMAL });

      if (result.records.length === 0) {
        // Create default configuration set (skipInit=true to avoid recursion)
        await this._createConfigSetInternal('default', 'Default AI Configuration', true);
      }

      this.initialized = true;
      tensorService?.complete(tensor?.id, { success: true });
      console.log('[AINFRA] Service initialized with indexes');
    } catch (error) {
      console.error('[AINFRA] Initialization error:', error);
      this._initPromise = null; // Reset on error to allow retry
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }

  /**
   * Create indexes for AINFRA graph nodes
   * @private
   */
  async _ensureIndexes() {
    const indexes = [
      `CREATE INDEX ON :${AINFRA_LABELS.ROOT}(id)`,
      `CREATE INDEX ON :${AINFRA_LABELS.CONFIG_SET}(id)`,
      `CREATE INDEX ON :${AINFRA_LABELS.CONFIG_SET}(name)`,
      `CREATE INDEX ON :${AINFRA_LABELS.PROVIDER_CONFIG}(id)`,
      `CREATE INDEX ON :${AINFRA_LABELS.PROVIDER_CONFIG}(provider)`,
      `CREATE INDEX ON :${AINFRA_LABELS.USAGE_SNAPSHOT}(id)`,
      `CREATE INDEX ON :${AINFRA_LABELS.USAGE_SNAPSHOT}(timestamp)`,
      `CREATE INDEX ON :${AINFRA_LABELS.ALERT}(id)`,
      `CREATE INDEX ON :${AINFRA_LABELS.ALERT}(timestamp)`,
    ];

    for (const indexQuery of indexes) {
      try {
        // Use INIT timeout for index creation (can take time on large graphs)
        await this.memgraph.executeQuery(indexQuery, {}, { timeout: QUERY_TIMEOUT_MS.INIT });
      } catch (e) {
        // Index already exists - ignore
        if (!e.message?.includes('already exists')) {
          console.warn('[AINFRA] Index creation warning:', e.message);
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION SET MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new named configuration set
   * @param {string} name - Configuration set name
   * @param {string} description - Description
   * @param {boolean} setActive - Set as active configuration
   * @returns {Promise<Object>} Created config set
   */
  async createConfigSet(name, description = '', setActive = false) {
    await this.initialize();
    return this._createConfigSetInternal(name, description, setActive);
  }

  /**
   * Internal method to create config set (avoids recursion during init)
   * @private
   */
  async _createConfigSetInternal(name, description = '', setActive = false) {
    const configId = `config-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    try {
      // FIX-KB-001: MERGE to prevent duplicate config sets on repeated init
      await this.memgraph.executeQuery(`
        MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
        MERGE (config:${AINFRA_LABELS.CONFIG_SET} {name: $name})
        ON CREATE SET
          config.id = $configId,
          config.description = $description,
          config.createdAt = $now,
          config.updatedAt = $now
        ON MATCH SET
          config.updatedAt = $now
        MERGE (root)-[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config)
        RETURN config
      `, { configId, name, description, now });

      // Create default provider configurations
      for (const [provider, defaultConfig] of Object.entries(DEFAULT_PROVIDER_CONFIGS)) {
        await this._createProviderConfig(configId, defaultConfig);
      }

      // Set as active if requested
      if (setActive) {
        await this._setActiveConfigSetInternal(name);
      }

      return {
        id: configId,
        name,
        description,
        createdAt: now,
      };
    } catch (error) {
      console.error('[AINFRA] Error creating config set:', error);
      throw error;
    }
  }

  /**
   * Create provider configuration for a config set
   * @private
   */
  async _createProviderConfig(configSetId, config) {
    const providerId = `provider-${config.provider}-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    // FIX-KB-001: MERGE to prevent duplicate provider configs
    await this.memgraph.executeQuery(`
      MATCH (configSet:${AINFRA_LABELS.CONFIG_SET} {id: $configSetId})
      MERGE (provider:${AINFRA_LABELS.PROVIDER_CONFIG} {provider: $provider})
      ON CREATE SET
        provider.id = $providerId,
        provider.displayName = $displayName,
        provider.enabled = $enabled,
        provider.rpmLimit = $rpmLimit,
        provider.dailyTokenLimit = $dailyTokenLimit,
        provider.dailyBudgetUsd = $dailyBudgetUsd,
        provider.defaultModel = $defaultModel,
        provider.costPerInputToken = $costPerInputToken,
        provider.costPerOutputToken = $costPerOutputToken,
        provider.createdAt = $now,
        provider.updatedAt = $now
      ON MATCH SET
        provider.updatedAt = $now
      MERGE (configSet)-[:${AINFRA_RELATIONS.USES_PROVIDER}]->(provider)
      RETURN provider
    `, {
      configSetId,
      providerId,
      provider: config.provider,
      displayName: config.displayName,
      enabled: config.enabled,
      rpmLimit: config.rpmLimit,
      dailyTokenLimit: config.dailyTokenLimit,
      dailyBudgetUsd: config.dailyBudgetUsd,
      defaultModel: config.defaultModel,
      costPerInputToken: config.costPerInputToken,
      costPerOutputToken: config.costPerOutputToken,
      now,
    });
  }

  /**
   * Get all configuration sets
   * OPTIMIZED: Two simple queries instead of OPTIONAL MATCH per row
   * @returns {Promise<Array>} List of config sets
   */
  async listConfigSets() {
    await this.initialize();

    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.listConfigSets', {});

    try {
      // Query 1: Get active config ID (simple, fast)
      const activeResult = await this.memgraph.executeQuery(`
        MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.ACTIVE_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET})
        RETURN config.id AS activeId
      `);
      const activeId = activeResult.records[0]?.get('activeId') || null;

      // Query 2: Get all configs (simple, no OPTIONAL)
      const result = await this.memgraph.executeQuery(`
        MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET})
        RETURN config
        ORDER BY config.name
      `);

      // Mark active in JavaScript (O(n) comparison vs O(n) OPTIONAL MATCH per row)
      const configs = result.records.map(r => ({
        ...r.get('config').properties,
        isActive: r.get('config').properties.id === activeId,
      }));

      tensorService?.complete(tensor?.id, { count: configs.length });
      return configs;
    } catch (error) {
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }

  /**
   * Get configuration set by name
   * OPTIMIZED: Two simple queries instead of OPTIONAL MATCH in complex query
   * @param {string} name - Config set name
   * @returns {Promise<Object|null>} Config set with provider configs
   */
  async getConfigSet(name) {
    await this.initialize();

    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.getConfigSet', { name });

    try {
      // Query 1: Get config with providers (simple MATCH + OPTIONAL for providers)
      const result = await this.memgraph.executeQuery(`
        MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET} {name: $name})
        OPTIONAL MATCH (config)-[:${AINFRA_RELATIONS.USES_PROVIDER}]->(provider:${AINFRA_LABELS.PROVIDER_CONFIG})
        RETURN config, collect(provider) AS providers
      `, { name });

      if (result.records.length === 0) {
        tensorService?.complete(tensor?.id, { found: false });
        return null;
      }

      // Query 2: Check if this is the active config
      const activeResult = await this.memgraph.executeQuery(`
        MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.ACTIVE_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET} {name: $name})
        RETURN config.id AS id
      `, { name });
      const isActive = activeResult.records.length > 0;

      const record = result.records[0];
      const config = record.get('config').properties;
      const providers = (record.get('providers') || []).map(p => p?.properties).filter(Boolean);

      tensorService?.complete(tensor?.id, {
        found: true,
        providerCount: providers.length
      });

      return {
        ...config,
        isActive,
        providers: providers.reduce((acc, p) => {
          acc[p.provider] = p;
          return acc;
        }, {}),
      };
    } catch (error) {
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }

  /**
   * Get active configuration set
   * OPTIMIZED v4: Request deduplication + caching + timeouts
   * Prevents connection pool exhaustion by not starting duplicate queries
   * @returns {Promise<Object|null>} Active config set (or cached fallback on timeout)
   */
  async getActiveConfigSet() {
    await this.initialize();

    const now = Date.now();

    // OPTIMIZATION 1: Return fresh cache immediately
    if (this._activeConfigCache && (now - this._activeConfigCacheTime) < CONFIG_CACHE_TTL_MS) {
      return this._activeConfigCache;
    }

    // OPTIMIZATION 2: If query already in flight, return stale cache
    if (this._configQueryInFlight) {
      if (this._activeConfigCache && (now - this._activeConfigCacheTime) < STALE_CACHE_MAX_AGE_MS) {
        console.log('[AINFRA] Config query in flight - returning stale cache');
        return this._activeConfigCache;
      }
      // No cache - wait for in-flight query
      try {
        return await this._configQueryInFlight;
      } catch (e) {
        // Fall through to try again
      }
    }

    // Start new query with in-flight tracking
    this._configQueryInFlight = this._fetchActiveConfigSet();

    try {
      return await this._configQueryInFlight;
    } catch (error) {
      // Return stale cache on error
      if (this._activeConfigCache && (now - this._activeConfigCacheTime) < STALE_CACHE_MAX_AGE_MS) {
        console.warn('[AINFRA] Config query failed - returning stale cache:', error.message);
        return this._activeConfigCache;
      }
      throw error;
    } finally {
      this._configQueryInFlight = null;
    }
  }

  /**
   * Internal method to fetch active config from database
   * @private
   */
  async _fetchActiveConfigSet() {
    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.getActiveConfigSet', { cached: false });

    try {
      // STEP 1: Try to get active config
      let result = await this.memgraph.executeQuery(`
        MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.ACTIVE_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET})
        OPTIONAL MATCH (config)-[:${AINFRA_RELATIONS.USES_PROVIDER}]->(p:${AINFRA_LABELS.PROVIDER_CONFIG})
        RETURN config, collect(p) AS providers, true AS isActive
      `, {}, { timeout: QUERY_TIMEOUT_MS.FAST });

      // STEP 2: If no active config, get default
      let isActiveConfig = true;
      if (result.records.length === 0) {
        result = await this.memgraph.executeQuery(`
          MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET} {name: 'default'})
          OPTIONAL MATCH (config)-[:${AINFRA_RELATIONS.USES_PROVIDER}]->(p:${AINFRA_LABELS.PROVIDER_CONFIG})
          RETURN config, collect(p) AS providers, false AS isActive
        `, {}, { timeout: QUERY_TIMEOUT_MS.FAST });
        isActiveConfig = false;
      }

      if (result.records.length === 0) {
        tensorService?.complete(tensor?.id, { found: false });
        return null;
      }

      const record = result.records[0];
      const config = record.get('config').properties;
      const providers = (record.get('providers') || []).map(p => p?.properties).filter(Boolean);

      const configResult = {
        ...config,
        isActive: isActiveConfig,
        providers: providers.reduce((acc, p) => {
          acc[p.provider] = p;
          return acc;
        }, {}),
      };

      // Cache the result
      this._activeConfigCache = configResult;
      this._activeConfigCacheTime = Date.now();

      tensorService?.complete(tensor?.id, {
        found: true,
        configName: config.name,
        providerCount: providers.length
      });

      return configResult;
    } catch (error) {
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }

  /**
   * Set active configuration set
   * @param {string} name - Config set name to activate
   */
  async setActiveConfigSet(name) {
    await this.initialize();
    await this._setActiveConfigSetInternal(name);
    // Invalidate caches after config change
    this.invalidateCache();
  }

  /**
   * Internal method to set active config (avoids recursion during init)
   * @private
   */
  async _setActiveConfigSetInternal(name) {
    // FIX-KB-001: Two-step to prevent row-per-match duplication in Memgraph
    // Step 1: Remove all existing ACTIVE_CONFIG edges
    await this.memgraph.executeQuery(`
      MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[r:${AINFRA_RELATIONS.ACTIVE_CONFIG}]->()
      DELETE r
    `);
    // Step 2: Create single new ACTIVE_CONFIG edge
    await this.memgraph.executeQuery(`
      MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
      MATCH (root)-[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET} {name: $name})
      CREATE (root)-[:${AINFRA_RELATIONS.ACTIVE_CONFIG}]->(config)
      RETURN config
    `, { name });
  }

  /**
   * Update provider configuration
   * @param {string} configSetName - Config set name
   * @param {string} provider - Provider ID (gemini, anthropic, ollama)
   * @param {Object} updates - Configuration updates
   */
  async updateProviderConfig(configSetName, provider, updates) {
    await this.initialize();

    const allowedFields = [
      'enabled', 'rpmLimit', 'dailyTokenLimit', 'dailyBudgetUsd',
      'defaultModel', 'costPerInputToken', 'costPerOutputToken'
    ];

    const setClause = Object.keys(updates)
      .filter(k => allowedFields.includes(k))
      .map(k => `p.${k} = $${k}`)
      .join(', ');

    if (!setClause) return;

    const now = new Date().toISOString();
    await this.memgraph.executeQuery(`
      MATCH (config:${AINFRA_LABELS.CONFIG_SET} {name: $configSetName})
      -[:${AINFRA_RELATIONS.USES_PROVIDER}]->(p:${AINFRA_LABELS.PROVIDER_CONFIG} {provider: $provider})
      SET ${setClause}, p.updatedAt = $now
      RETURN p
    `, { configSetName, provider, now, ...updates });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // USAGE TRACKING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Save usage snapshot
   * @param {Object} usageStats - Usage statistics from AIUsageMonitor
   */
  async saveUsageSnapshot(usageStats) {
    await this.initialize();

    const snapshotId = `snapshot-${Date.now()}`;
    const now = new Date().toISOString();

    await this.memgraph.executeQuery(`
      MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
      CREATE (snapshot:${AINFRA_LABELS.USAGE_SNAPSHOT} {
        id: $snapshotId,
        date: $date,
        timestamp: $now,
        data: $data
      })
      CREATE (root)-[:${AINFRA_RELATIONS.HAS_SNAPSHOT}]->(snapshot)
      RETURN snapshot
    `, {
      snapshotId,
      date: usageStats.date,
      now,
      data: JSON.stringify(usageStats.providers),
    });

    // Clean up old snapshots (keep last 30 days)
    await this._cleanupOldSnapshots(30);
  }

  /**
   * Get usage history
   * @param {number} days - Number of days to retrieve
   * @returns {Promise<Array>} Usage history
   */
  async getUsageHistory(days = 7) {
    await this.initialize();

    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.getUsageHistory', { days });

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await this.memgraph.executeQuery(`
        MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
        -[:${AINFRA_RELATIONS.HAS_SNAPSHOT}]->(snapshot:${AINFRA_LABELS.USAGE_SNAPSHOT})
        WHERE snapshot.timestamp >= $cutoff
        RETURN snapshot
        ORDER BY snapshot.timestamp DESC
      `, { cutoff: cutoffDate.toISOString() });

      const history = result.records.map(r => {
        const props = r.get('snapshot').properties;
        return {
          ...props,
          providers: JSON.parse(props.data || '{}'),
        };
      });

      tensorService?.complete(tensor?.id, { count: history.length });
      return history;
    } catch (error) {
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }

  /**
   * Clean up old usage snapshots
   * @private
   */
  async _cleanupOldSnapshots(keepDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    await this.memgraph.executeQuery(`
      MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
      -[r:${AINFRA_RELATIONS.HAS_SNAPSHOT}]->(snapshot:${AINFRA_LABELS.USAGE_SNAPSHOT})
      WHERE snapshot.timestamp < $cutoff
      DELETE r, snapshot
    `, { cutoff: cutoffDate.toISOString() });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ALERT MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Record usage alert
   * @param {Object} alert - Alert data
   */
  async recordAlert(alert) {
    await this.initialize();

    const alertId = `alert-${Date.now()}`;
    const now = new Date().toISOString();

    await this.memgraph.executeQuery(`
      MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
      CREATE (a:${AINFRA_LABELS.ALERT} {
        id: $alertId,
        level: $level,
        provider: $provider,
        message: $message,
        timestamp: $now,
        acknowledged: false
      })
      CREATE (root)-[:${AINFRA_RELATIONS.HAS_ALERT}]->(a)
      RETURN a
    `, {
      alertId,
      level: alert.level,
      provider: alert.provider,
      message: alert.message,
      now,
    });
  }

  /**
   * Get recent alerts
   * @param {number} limit - Max alerts to return
   * @returns {Promise<Array>} Recent alerts
   */
  async getRecentAlerts(limit = 10) {
    await this.initialize();

    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.getRecentAlerts', { limit });

    try {
      // Memgraph requires LIMIT to be an integer literal, not a parameter
      const safeLimit = Math.max(1, Math.min(100, parseInt(limit) || 10));

      const result = await this.memgraph.executeQuery(`
        MATCH (root:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})
        -[:${AINFRA_RELATIONS.HAS_ALERT}]->(a:${AINFRA_LABELS.ALERT})
        RETURN a
        ORDER BY a.timestamp DESC
        LIMIT ${safeLimit}
      `);

      const alerts = result.records.map(r => r.get('a').properties);
      tensorService?.complete(tensor?.id, { count: alerts.length });
      return alerts;
    } catch (error) {
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }

  /**
   * Acknowledge alert
   * @param {string} alertId - Alert ID
   */
  async acknowledgeAlert(alertId) {
    const now = new Date().toISOString();
    await this.memgraph.executeQuery(`
      MATCH (a:${AINFRA_LABELS.ALERT} {id: $alertId})
      SET a.acknowledged = true, a.acknowledgedAt = $now
      RETURN a
    `, { alertId, now });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMBINED STATUS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get full AI infrastructure status
   * OPTIMIZED v4: Request deduplication + caching + timeouts
   *
   * Key optimizations:
   * - If query already in flight, return stale cache immediately (no new query)
   * - 30-second cache TTL (increased from 10s)
   * - 5-minute stale cache fallback
   * - In-flight query tracking prevents connection pool exhaustion
   *
   * @param {Object} currentUsage - Current usage from AIUsageMonitor
   * @returns {Promise<Object>} Full status
   */
  async getInfraStatus(currentUsage = null) {
    await this.initialize();

    const now = Date.now();

    // OPTIMIZATION 1: Return fresh cache immediately
    if (this._statusCache && (now - this._statusCacheTime) < STATUS_CACHE_TTL_MS) {
      return {
        ...this._statusCache,
        usage: currentUsage,
        timestamp: new Date().toISOString(),
      };
    }

    // OPTIMIZATION 2: If query already in flight, return stale cache (don't pile up queries!)
    if (this._statusQueryInFlight) {
      if (this._statusCache && (now - this._statusCacheTime) < STALE_CACHE_MAX_AGE_MS) {
        console.log('[AINFRA] Query in flight - returning stale cache');
        return {
          ...this._statusCache,
          usage: currentUsage,
          timestamp: new Date().toISOString(),
          _staleCache: true,
        };
      }
      // No cache at all - wait for in-flight query
      console.log('[AINFRA] No cache, waiting for in-flight query');
      try {
        const result = await this._statusQueryInFlight;
        return { ...result, usage: currentUsage };
      } catch (e) {
        // In-flight query failed, fall through to try again
      }
    }

    // Start new query with in-flight tracking
    this._statusQueryInFlight = this._fetchInfraStatus();

    try {
      const result = await this._statusQueryInFlight;
      return {
        ...result,
        usage: currentUsage,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // On error, return stale cache if available
      if (this._statusCache && (now - this._statusCacheTime) < STALE_CACHE_MAX_AGE_MS) {
        console.warn('[AINFRA] Query failed - returning stale cache:', error.message);
        return {
          ...this._statusCache,
          usage: currentUsage,
          timestamp: new Date().toISOString(),
          _staleCache: true,
          _error: error.message,
        };
      }
      throw error;
    } finally {
      this._statusQueryInFlight = null;
    }
  }

  /**
   * Internal method to fetch status from database
   * @private
   */
  async _fetchInfraStatus() {
    const tensorService = getTensorServiceLazy();
    const tensor = tensorService?.start('ainfra.getInfraStatus', { cached: false });

    try {
      let activeConfig = null;
      let recentAlerts = [];

      // STEP 1: Try to get active config
      const activeResult = await this.memgraph.executeQuery(`
        MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.ACTIVE_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET})
        OPTIONAL MATCH (config)-[:${AINFRA_RELATIONS.USES_PROVIDER}]->(p:${AINFRA_LABELS.PROVIDER_CONFIG})
        RETURN config, collect(p) AS providers
      `, {}, { timeout: QUERY_TIMEOUT_MS.FAST });

      // STEP 2: If no active config, get default
      let configResult = activeResult;
      if (activeResult.records.length === 0) {
        configResult = await this.memgraph.executeQuery(`
          MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.HAS_CONFIG}]->(config:${AINFRA_LABELS.CONFIG_SET} {name: 'default'})
          OPTIONAL MATCH (config)-[:${AINFRA_RELATIONS.USES_PROVIDER}]->(p:${AINFRA_LABELS.PROVIDER_CONFIG})
          RETURN config, collect(p) AS providers
        `, {}, { timeout: QUERY_TIMEOUT_MS.FAST });
      }

      // Process config result
      if (configResult.records.length > 0) {
        const record = configResult.records[0];
        const configNode = record.get('config');
        const providerNodes = record.get('providers') || [];

        if (configNode) {
          const config = configNode.properties;
          const providers = providerNodes.map(p => p.properties);

          activeConfig = {
            ...config,
            isActive: activeResult.records.length > 0,
            providers: providers.reduce((acc, p) => {
              acc[p.provider] = p;
              return acc;
            }, {}),
          };
        }
      }

      // STEP 3: Get alerts (skip if config query was slow)
      try {
        const alertsResult = await this.memgraph.executeQuery(`
          MATCH (:${AINFRA_LABELS.ROOT} {id: 'ainfra-root'})-[:${AINFRA_RELATIONS.HAS_ALERT}]->(a:${AINFRA_LABELS.ALERT})
          RETURN a
          ORDER BY a.timestamp DESC
          LIMIT 5
        `, {}, { timeout: QUERY_TIMEOUT_MS.FAST });

        recentAlerts = alertsResult.records
          .map(r => r.get('a'))
          .filter(a => a)
          .map(a => a.properties);
      } catch (alertError) {
        console.warn('[AINFRA] Alerts query failed, continuing without alerts');
        recentAlerts = this._statusCache?.alerts || [];
      }

      // Cache the result
      const result = { config: activeConfig, alerts: recentAlerts };
      this._statusCache = result;
      this._statusCacheTime = Date.now();

      tensorService?.complete(tensor?.id, {
        hasConfig: !!activeConfig,
        alertCount: recentAlerts.length
      });

      return result;
    } catch (error) {
      tensorService?.fail(tensor?.id, error);
      throw error;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ────────────────────────────────────────────────────────────────────────────

let ainfraInstance = null;

function getAINFRAService() {
  if (!ainfraInstance) {
    ainfraInstance = new AINFRAService();
  }
  return ainfraInstance;
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  AINFRAService,
  getAINFRAService,
  AINFRA_LABELS,
  AINFRA_RELATIONS,
  DEFAULT_PROVIDER_CONFIGS,
};
