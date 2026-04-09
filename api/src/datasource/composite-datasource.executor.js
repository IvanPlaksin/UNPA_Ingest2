/**
 * =============================================================================
 * COMPOSITE DATASOURCE EXECUTOR
 *
 * Combines data from multiple DataSources using merge strategies:
 *   - union:  Concat all sources, dedupe by valueField
 *   - join:   Inner join by joinField (only matching items)
 *   - enrich: Primary source + extra fields from enrichment sources
 * =============================================================================
 */

const { BaseDataSourceExecutor } = require('./base-datasource.executor');

class CompositeDataSourceExecutor extends BaseDataSourceExecutor {
  constructor(options = {}) {
    super(options);
    this.dataSourceService = options.dataSourceService || null;
    this._registry = options.registry || null;
  }

  setDataSourceService(service) { this.dataSourceService = service; return this; }
  setRegistry(registry) { this._registry = registry; return this; }

  _getRegistry() {
    if (this._registry) return this._registry;
    const { dataSourceRegistry } = require('../services/datasource-registry');
    return dataSourceRegistry;
  }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  async loadAll(config, params = {}) {
    this.validateConfig(config);
    this._validateCompositeConfig(config);

    return this.withCache(config, 'loadAll', params, async () => {
      const { sources, mergeStrategy = 'union' } = config.compositeConfig;
      const sourceResults = await this._loadAllSources(sources, params);
      let merged = this._merge(sourceResults, mergeStrategy, config);

      const { limit, offset } = this.applyLimits(params, config);
      const total = merged.length;
      const paginated = merged.slice(offset, offset + limit);
      const items = this.transformOutput(paginated, config);

      return { items, total };
    });
  }

  async search(config, params = {}) {
    this.validateConfig(config);
    this._validateCompositeConfig(config);

    const { query: searchText, limit = 10 } = params;
    if (!searchText || searchText.length < 1) return { items: [], total: 0 };

    const { sources, mergeStrategy = 'union' } = config.compositeConfig;
    const sourceResults = await this._searchAllSources(sources, params);
    const merged = this._merge(sourceResults, mergeStrategy, config);

    const limited = merged.slice(0, Math.min(limit, config.config?.maxLimit || 100));
    const items = this.transformOutput(limited, config);

    return { items, total: merged.length };
  }

  async getById(config, params = {}) {
    this.validateConfig(config);
    this._validateCompositeConfig(config);

    const { id } = params;
    if (id === undefined || id === null) throw new Error('id is required for getById');

    const { sources, mergeStrategy = 'union' } = config.compositeConfig;
    const registry = this._getRegistry();

    const primarySource = sources.find(s => s.role === 'primary') || sources[0];
    const primaryConfig = await this._getSourceConfig(primarySource.dataSourceId);
    const primaryItem = await registry.execute(primaryConfig, 'getById', { id });

    if (!primaryItem) return null;

    if (mergeStrategy === 'enrich') {
      const enriched = await this._enrichItem(primaryItem, sources, primarySource, config);
      const transformed = this.transformOutput([enriched], config);
      return transformed[0];
    }

    const transformed = this.transformOutput([primaryItem], config);
    return transformed[0];
  }

  async count(config, params = {}) {
    this.validateConfig(config);
    this._validateCompositeConfig(config);

    const result = await this.loadAll(config, { ...params, limit: 100000, offset: 0 });
    return result.total;
  }

  async validate(config, params = {}) {
    this.validateConfig(config);
    this._validateCompositeConfig(config);

    if (params.value === undefined) throw new Error('value is required for validate');

    const { sources } = config.compositeConfig;
    const registry = this._getRegistry();
    const primarySource = sources.find(s => s.role === 'primary') || sources[0];
    const primaryConfig = await this._getSourceConfig(primarySource.dataSourceId);

    return registry.execute(primaryConfig, 'validate', params);
  }

  // ---------------------------------------------------------------------------
  // Source Loading
  // ---------------------------------------------------------------------------

  async _loadAllSources(sources, params) {
    const registry = this._getRegistry();
    const results = [];

    for (const source of sources) {
      try {
        const sourceConfig = await this._getSourceConfig(source.dataSourceId);
        const result = await registry.execute(sourceConfig, 'loadAll', {
          ...params,
          limit: params.limit ? params.limit * 10 : 1000,
          offset: 0,
        });

        results.push({
          source, config: sourceConfig, items: result.items || [], total: result.total,
        });
      } catch (error) {
        this.logger.warn(`Failed to load source ${source.dataSourceId}: ${error.message}`);
        results.push({
          source, config: null, items: [], total: 0, error: error.message,
        });
      }
    }

    return results;
  }

  async _searchAllSources(sources, params) {
    const registry = this._getRegistry();
    const results = [];

    for (const source of sources) {
      try {
        const sourceConfig = await this._getSourceConfig(source.dataSourceId);
        const result = await registry.execute(sourceConfig, 'search', params);

        results.push({
          source, config: sourceConfig, items: result.items || [], total: result.total,
        });
      } catch (error) {
        this.logger.warn(`Failed to search source ${source.dataSourceId}: ${error.message}`);
        results.push({
          source, config: null, items: [], total: 0, error: error.message,
        });
      }
    }

    return results;
  }

  async _getSourceConfig(dataSourceId) {
    if (!this.dataSourceService) {
      throw new Error('DataSourceService not configured for Composite executor');
    }
    const config = await this.dataSourceService.get(dataSourceId);
    if (!config) throw new Error(`Source DataSource not found: ${dataSourceId}`);
    return config;
  }

  // ---------------------------------------------------------------------------
  // Merge Strategies
  // ---------------------------------------------------------------------------

  _merge(sourceResults, strategy, config) {
    switch (strategy) {
      case 'union': return this._mergeUnion(sourceResults, config);
      case 'join': return this._mergeJoin(sourceResults, config);
      case 'enrich': return this._mergeEnrich(sourceResults, config);
      default: throw new Error(`Unsupported merge strategy: ${strategy}`);
    }
  }

  /**
   * Union: concat all, dedupe by valueField.
   */
  _mergeUnion(sourceResults, config) {
    const valueField = config.config?.valueField || 'value';
    const seen = new Set();
    const merged = [];

    for (const result of sourceResults) {
      for (const item of result.items) {
        const key = String(item[valueField] ?? item.value);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push({ ...item, _source: result.source.dataSourceId });
        }
      }
    }

    return merged;
  }

  /**
   * Join: inner join — only items present in ALL sources.
   */
  _mergeJoin(sourceResults, config) {
    if (sourceResults.length === 0) return [];
    if (sourceResults.length === 1) return sourceResults[0].items;

    const primaryResult = sourceResults.find(r => r.source.role === 'primary') || sourceResults[0];
    const secondaryResults = sourceResults.filter(r => r !== primaryResult);

    // Build lookup maps
    const secondaryMaps = secondaryResults.map(result => {
      const joinField = result.source.joinField || config.config?.valueField || 'value';
      const map = new Map();
      for (const item of result.items) {
        map.set(String(item[joinField] ?? item.value), item);
      }
      return { result, map };
    });

    const primaryJoinField =
      primaryResult.source.joinField || config.config?.valueField || 'value';
    const merged = [];

    for (const primaryItem of primaryResult.items) {
      const primaryKey = String(primaryItem[primaryJoinField] ?? primaryItem.value);

      if (secondaryMaps.every(({ map }) => map.has(primaryKey))) {
        let mergedItem = { ...primaryItem };

        for (const { map, result } of secondaryMaps) {
          const secondaryItem = map.get(primaryKey);
          if (secondaryItem) {
            for (const [key, value] of Object.entries(secondaryItem)) {
              if (!(key in mergedItem)) {
                mergedItem[key] = value;
              }
            }
          }
        }

        merged.push(mergedItem);
      }
    }

    return merged;
  }

  /**
   * Enrich: keep all primary items, add fields from enrichment sources where matched.
   */
  _mergeEnrich(sourceResults, config) {
    if (sourceResults.length === 0) return [];

    const primaryResult = sourceResults.find(r => r.source.role === 'primary') || sourceResults[0];
    const enrichmentResults = sourceResults.filter(
      r => r !== primaryResult && (r.source.role === 'enrichment' || r.source.role === 'secondary'),
    );

    if (enrichmentResults.length === 0) return primaryResult.items;

    // Build lookup maps
    const enrichmentMaps = enrichmentResults.map(result => {
      const joinField = result.source.joinField || config.config?.valueField || 'value';
      const map = new Map();
      for (const item of result.items) {
        map.set(String(item[joinField] ?? item.value), item);
      }
      return { result, map };
    });

    const primaryJoinField =
      primaryResult.source.joinField || config.config?.valueField || 'value';

    return primaryResult.items.map(primaryItem => {
      const primaryKey = String(primaryItem[primaryJoinField] ?? primaryItem.value);
      let enrichedItem = { ...primaryItem };

      for (const { map } of enrichmentMaps) {
        const extra = map.get(primaryKey);
        if (extra) {
          for (const [key, value] of Object.entries(extra)) {
            if (!(key in enrichedItem)) {
              enrichedItem[key] = value;
            }
          }
        }
      }

      return enrichedItem;
    });
  }

  /**
   * Enrich a single item (for getById).
   */
  async _enrichItem(item, sources, primarySource, config) {
    const registry = this._getRegistry();
    const enrichmentSources = sources.filter(
      s => s !== primarySource && (s.role === 'enrichment' || s.role === 'secondary'),
    );

    if (enrichmentSources.length === 0) return item;

    const primaryJoinField =
      primarySource.joinField || config.config?.valueField || 'value';
    const primaryKey = String(item[primaryJoinField] ?? item.value);

    let enrichedItem = { ...item };

    for (const source of enrichmentSources) {
      try {
        const sourceConfig = await this._getSourceConfig(source.dataSourceId);
        const enrichmentItem = await registry.execute(sourceConfig, 'getById', { id: primaryKey });

        if (enrichmentItem) {
          for (const [key, value] of Object.entries(enrichmentItem)) {
            if (!(key in enrichedItem)) {
              enrichedItem[key] = value;
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to enrich from ${source.dataSourceId}: ${error.message}`);
      }
    }

    return enrichedItem;
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  _validateCompositeConfig(config) {
    const cc = config.compositeConfig;
    if (!cc) throw new Error('compositeConfig is required for Composite DataSource');
    if (!cc.sources || !Array.isArray(cc.sources)) {
      throw new Error('compositeConfig.sources array is required');
    }
    if (cc.sources.length === 0) {
      throw new Error('compositeConfig.sources must have at least one source');
    }
    for (const source of cc.sources) {
      if (!source.dataSourceId) throw new Error('Each source must have dataSourceId');
    }
    return true;
  }
}

module.exports = { CompositeDataSourceExecutor };
