/**
 * @fileoverview Configuration Loader and Persistence
 * @module services/extraction/config/config-loader
 * @version 1.0.0
 *
 * Handles loading, saving, and versioning of pipeline configurations.
 * Supports multiple storage backends and configuration profiles.
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const { DEFAULT_CONFIG, getConfig, deepMerge, exportConfig, importConfig } = require('./pipeline-config');
const { validateConfig } = require('./parameter-schema');

/**
 * Configuration storage paths
 */
const CONFIG_PATHS = {
  base: path.join(__dirname, '../../../../config/pipeline'),
  profiles: path.join(__dirname, '../../../../config/pipeline/profiles'),
  history: path.join(__dirname, '../../../../config/pipeline/history')
};

/**
 * Configuration Loader class
 * @class
 */
class ConfigLoader {
  constructor() {
    this.currentConfig = null;
    this.currentProfile = 'default';
    this.configHistory = [];
    this.maxHistorySize = 50;
  }

  /**
   * Initialize configuration loader
   * Creates necessary directories and loads default config
   */
  async initialize() {
    // Ensure directories exist
    for (const dir of Object.values(CONFIG_PATHS)) {
      await this._ensureDir(dir);
    }

    // Try to load saved config, fall back to default
    try {
      this.currentConfig = await this.loadProfile('default');
    } catch {
      this.currentConfig = { ...DEFAULT_CONFIG };
      await this.saveProfile('default', this.currentConfig);
    }

    return this.currentConfig;
  }

  /**
   * Get current configuration
   * @param {Object} overrides - Optional overrides
   * @returns {Object} Current configuration with overrides
   */
  getCurrent(overrides = {}) {
    if (!this.currentConfig) {
      this.currentConfig = { ...DEFAULT_CONFIG };
    }
    return getConfig({ ...this.currentConfig, ...overrides });
  }

  /**
   * Update current configuration
   * @param {Object} updates - Configuration updates
   * @param {boolean} persist - Whether to persist changes
   * @returns {Object} Updated configuration
   */
  async update(updates, persist = true) {
    // Save current to history before updating
    this._addToHistory(this.currentConfig);

    // Merge updates
    this.currentConfig = deepMerge(this.currentConfig, updates);

    // Validate
    const validation = validateConfig(this.currentConfig);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Persist if requested
    if (persist) {
      await this.saveProfile(this.currentProfile, this.currentConfig);
    }

    return this.currentConfig;
  }

  /**
   * Load configuration profile
   * @param {string} profileName - Profile name
   * @returns {Object} Configuration
   */
  async loadProfile(profileName) {
    const filePath = path.join(CONFIG_PATHS.profiles, `${profileName}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const config = importConfig(content);
      this.currentProfile = profileName;
      this.currentConfig = config;
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Profile '${profileName}' not found`);
      }
      throw error;
    }
  }

  /**
   * Save configuration profile
   * @param {string} profileName - Profile name
   * @param {Object} config - Configuration to save
   */
  async saveProfile(profileName, config = null) {
    const configToSave = config || this.currentConfig;
    const filePath = path.join(CONFIG_PATHS.profiles, `${profileName}.json`);

    // Add metadata
    const configWithMeta = {
      ...configToSave,
      _meta: {
        profile: profileName,
        savedAt: new Date().toISOString(),
        version: configToSave.version || '1.0.0'
      }
    };

    await fs.writeFile(filePath, exportConfig(configWithMeta), 'utf-8');
    this.currentProfile = profileName;
  }

  /**
   * List available profiles
   * @returns {Array} Profile names
   */
  async listProfiles() {
    try {
      const files = await fs.readdir(CONFIG_PATHS.profiles);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch {
      return ['default'];
    }
  }

  /**
   * Delete profile
   * @param {string} profileName - Profile to delete
   */
  async deleteProfile(profileName) {
    if (profileName === 'default') {
      throw new Error('Cannot delete default profile');
    }

    const filePath = path.join(CONFIG_PATHS.profiles, `${profileName}.json`);
    await fs.unlink(filePath);

    if (this.currentProfile === profileName) {
      await this.loadProfile('default');
    }
  }

  /**
   * Clone current profile to new name
   * @param {string} newName - New profile name
   * @returns {Object} Cloned configuration
   */
  async cloneProfile(newName) {
    const config = { ...this.currentConfig };
    await this.saveProfile(newName, config);
    return config;
  }

  /**
   * Save configuration snapshot to history
   * @param {string} label - Optional label for snapshot
   */
  async saveSnapshot(label = '') {
    const snapshot = {
      config: { ...this.currentConfig },
      timestamp: new Date().toISOString(),
      profile: this.currentProfile,
      label
    };

    const fileName = `snapshot_${Date.now()}.json`;
    const filePath = path.join(CONFIG_PATHS.history, fileName);

    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    return fileName;
  }

  /**
   * List configuration history
   * @param {number} limit - Maximum entries to return
   * @returns {Array} History entries
   */
  async listHistory(limit = 20) {
    try {
      const files = await fs.readdir(CONFIG_PATHS.history);
      const snapshots = files
        .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const history = [];
      for (const file of snapshots) {
        try {
          const content = await fs.readFile(path.join(CONFIG_PATHS.history, file), 'utf-8');
          const snapshot = JSON.parse(content);
          history.push({
            file,
            timestamp: snapshot.timestamp,
            profile: snapshot.profile,
            label: snapshot.label
          });
        } catch {
          // Skip corrupted files
        }
      }

      return history;
    } catch {
      return [];
    }
  }

  /**
   * Restore configuration from snapshot
   * @param {string} snapshotFile - Snapshot file name
   * @returns {Object} Restored configuration
   */
  async restoreSnapshot(snapshotFile) {
    const filePath = path.join(CONFIG_PATHS.history, snapshotFile);
    const content = await fs.readFile(filePath, 'utf-8');
    const snapshot = JSON.parse(content);

    this._addToHistory(this.currentConfig);
    this.currentConfig = snapshot.config;

    return this.currentConfig;
  }

  /**
   * Undo last configuration change
   * @returns {Object|null} Previous configuration or null
   */
  undo() {
    if (this.configHistory.length === 0) {
      return null;
    }

    const previous = this.configHistory.pop();
    this.currentConfig = previous;
    return this.currentConfig;
  }

  /**
   * Reset to default configuration
   * @param {boolean} persist - Whether to persist reset
   */
  async reset(persist = true) {
    this._addToHistory(this.currentConfig);
    this.currentConfig = { ...DEFAULT_CONFIG };

    if (persist) {
      await this.saveProfile(this.currentProfile, this.currentConfig);
    }

    return this.currentConfig;
  }

  /**
   * Compare two configurations
   * @param {Object} config1 - First configuration
   * @param {Object} config2 - Second configuration
   * @returns {Array} List of differences
   */
  compareConfigs(config1, config2) {
    const differences = [];

    function compare(obj1, obj2, path = '') {
      const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

      for (const key of keys) {
        const currentPath = path ? `${path}.${key}` : key;
        const val1 = obj1?.[key];
        const val2 = obj2?.[key];

        if (key.startsWith('_')) continue; // Skip metadata

        if (typeof val1 === 'object' && typeof val2 === 'object' && !Array.isArray(val1)) {
          compare(val1, val2, currentPath);
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          differences.push({
            path: currentPath,
            oldValue: val1,
            newValue: val2
          });
        }
      }
    }

    compare(config1, config2);
    return differences;
  }

  /**
   * Export configuration for sharing
   * @param {string} format - Export format ('json', 'yaml')
   * @returns {string} Exported configuration
   */
  export(format = 'json') {
    if (format === 'json') {
      return exportConfig(this.currentConfig);
    }
    // Could add YAML support here
    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Import configuration from string
   * @param {string} content - Configuration content
   * @param {string} format - Format ('json')
   * @returns {Object} Imported configuration
   */
  async import(content, format = 'json') {
    let config;

    if (format === 'json') {
      config = importConfig(content);
    } else {
      throw new Error(`Unsupported import format: ${format}`);
    }

    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    this._addToHistory(this.currentConfig);
    this.currentConfig = config;

    return config;
  }

  /**
   * Add configuration to in-memory history
   * @private
   */
  _addToHistory(config) {
    if (config) {
      this.configHistory.push({ ...config });
      if (this.configHistory.length > this.maxHistorySize) {
        this.configHistory.shift();
      }
    }
  }

  /**
   * Ensure directory exists
   * @private
   */
  async _ensureDir(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }
}

// Singleton instance
let loaderInstance = null;

/**
 * Get configuration loader instance
 * @returns {ConfigLoader}
 */
function getConfigLoader() {
  if (!loaderInstance) {
    loaderInstance = new ConfigLoader();
  }
  return loaderInstance;
}

/**
 * Initialize and get configuration loader
 * @returns {Promise<ConfigLoader>}
 */
async function initConfigLoader() {
  const loader = getConfigLoader();
  await loader.initialize();
  return loader;
}

module.exports = {
  ConfigLoader,
  getConfigLoader,
  initConfigLoader,
  CONFIG_PATHS
};
