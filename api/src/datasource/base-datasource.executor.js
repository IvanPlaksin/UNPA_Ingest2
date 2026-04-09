/**
 * =============================================================================
 * BASE DATASOURCE EXECUTOR
 *
 * Abstract base class for all DataSource executors.
 * Defines the operation interface and common functionality:
 *   - Output transformation (raw rows → { value, label, metadata })
 *   - Limit capping
 *   - Cache key generation + Redis caching wrapper
 *   - Cache invalidation
 * =============================================================================
 */

const { CacheStrategy } = require('../schemas/datasource-config.schema');

class BaseDataSourceExecutor {
  constructor(options = {}) {
    this.redis = options.redis || null;
    this.logger = options.logger || console;
  }

  // ---------------------------------------------------------------------------
  // Abstract Operations (subclasses MUST implement loadAll + search)
  // ---------------------------------------------------------------------------

  /**
   * Load all data with pagination.
   * @param {object} config - DataSource config (from builder.build())
   * @param {object} params - { limit, offset, filters, orderBy }
   * @returns {Promise<{ items: Array, total: number, cached: boolean }>}
   */
  async loadAll(/* config, params */) {
    throw new Error('loadAll() must be implemented by subclass');
  }

  /**
   * Text search (for autocomplete / dropdowns).
   * @param {object} config
   * @param {object} params - { query, limit, filters }
   * @returns {Promise<{ items: Array, total: number }>}
   */
  async search(/* config, params */) {
    throw new Error('search() must be implemented by subclass');
  }

  /**
   * Fetch a single record by ID.
   * @param {object} config
   * @param {object} params - { id }
   * @returns {Promise<object|null>}
   */
  async getById(/* config, params */) {
    throw new Error('getById() must be implemented by subclass');
  }

  /**
   * Count records.
   * @param {object} config
   * @param {object} params - { filters }
   * @returns {Promise<number>}
   */
  async count(/* config, params */) {
    throw new Error('count() must be implemented by subclass');
  }

  /**
   * Check if a value exists (for form validation).
   * @param {object} config
   * @param {object} params - { value, field }
   * @returns {Promise<boolean>}
   */
  async validate(/* config, params */) {
    throw new Error('validate() must be implemented by subclass');
  }

  // ---------------------------------------------------------------------------
  // Common Functionality
  // ---------------------------------------------------------------------------

  /**
   * Transform raw rows into the standard { value, label, metadata } format.
   */
  transformOutput(rawData, config) {
    const { valueField, labelField, metadataFields = [] } = config.config || config;

    return rawData.map(row => {
      // Try configured field, fall back to "value"/"label" aliases if missing
      let value = this._getNestedValue(row, valueField);
      if (value === undefined && row.value !== undefined) value = row.value;

      let label = this._getNestedValue(row, labelField);
      if (label === undefined && row.label !== undefined) label = row.label;

      const item = { value, label };

      if (metadataFields.length > 0) {
        item.metadata = {};
        for (const field of metadataFields) {
          item.metadata[field] = this._getNestedValue(row, field);
        }
      }

      return item;
    });
  }

  /**
   * Read a nested value by dot-path (e.g. "user.name").
   */
  _getNestedValue(obj, path) {
    if (!path) return undefined;
    return path.split('.').reduce(
      (current, key) => (current && current[key] !== undefined ? current[key] : undefined),
      obj,
    );
  }

  /**
   * Cap requested limit to config bounds.
   */
  applyLimits(params, config) {
    const { defaultLimit = 100, maxLimit = 1000 } = config.config || config;

    let limit = params.limit || defaultLimit;
    if (limit > maxLimit) {
      limit = maxLimit;
      this.logger.warn(`Limit ${params.limit} exceeds max ${maxLimit}, capped`);
    }

    const offset = params.offset || 0;
    return { limit, offset };
  }

  /**
   * Generate a Redis cache key for a given operation + params.
   */
  getCacheKey(config, operation, params) {
    const baseKey = `ds:${config.graphId || config.name}:${operation}`;
    const paramsHash = this._hashParams(params);
    return `${baseKey}:${paramsHash}`;
  }

  /**
   * Simple param hash for cache key differentiation.
   */
  _hashParams(params) {
    if (!params || Object.keys(params).length === 0) return 'default';
    return Buffer.from(JSON.stringify(params)).toString('base64').slice(0, 16);
  }

  /**
   * Wrap a loader function with Redis caching.
   */
  async withCache(config, operation, params, loader) {
    const cacheStrategy = config.config?.cacheStrategy || CacheStrategy.NONE;

    if (cacheStrategy === CacheStrategy.NONE || !this.redis) {
      const result = await loader();
      return { ...result, cached: false };
    }

    const cacheKey = this.getCacheKey(config, operation, params);

    // Try cache read
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    } catch (err) {
      this.logger.warn(`Cache read error: ${err.message}`);
    }

    // Load fresh
    const result = await loader();

    // Write cache
    try {
      const ttl = config.config?.cacheTTL || 3600;
      await this.redis.setex(cacheKey, ttl, JSON.stringify(result));
    } catch (err) {
      this.logger.warn(`Cache write error: ${err.message}`);
    }

    return { ...result, cached: false };
  }

  /**
   * Invalidate all cached entries for a DataSource.
   */
  async invalidateCache(config) {
    if (!this.redis) return;

    const pattern = `ds:${config.graphId || config.name}:*`;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.info(`Invalidated ${keys.length} cache keys for ${config.name}`);
      }
    } catch (err) {
      this.logger.warn(`Cache invalidation error: ${err.message}`);
    }
  }

  /**
   * Validate config before any operation.
   */
  validateConfig(config) {
    if (!config) throw new Error('DataSource config is required');
    if (!config.sourceType) throw new Error('DataSource sourceType is required');
    return true;
  }
}

module.exports = { BaseDataSourceExecutor };
