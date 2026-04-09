/**
 * =============================================================================
 * DATASOURCE CONFIGURATION SCHEMAS
 *
 * DataSource -- a graph-instrument for dynamic data loading into forms.
 * Each DataSource is stored as a STRUCTURAL graph with configuration.
 *
 * Types:
 *   SQL       -- SQL Server / PostgreSQL queries
 *   API       -- External REST/GraphQL endpoints
 *   FILE      -- JSON / CSV / XML files
 *   KB        -- Knowledge Base (Memgraph / Qdrant)
 *   COMPOSITE -- Merges multiple DataSources
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// ENUMS
// -----------------------------------------------------------------------------

const DataSourceType = {
  SQL: 'SQL',
  API: 'API',
  FILE: 'FILE',
  KB: 'KB',
  COMPOSITE: 'COMPOSITE',
};

const CacheStrategy = {
  NONE: 'none',       // Always fresh
  SESSION: 'session', // Per user session
  TTL: 'ttl',         // Time-to-live
  STATIC: 'static',   // Load once, manual refresh
};

const DataSourceOperation = {
  LOAD_ALL: 'loadAll',
  SEARCH: 'search',
  GET_BY_ID: 'getById',
  COUNT: 'count',
  VALIDATE: 'validate',
};

// -----------------------------------------------------------------------------
// BASE BUILDER
// -----------------------------------------------------------------------------

class BaseDataSourceBuilder {
  constructor(name, options = {}) {
    this.graphId = options.graphId || `datasource_${name}_${Date.now()}`;
    this.name = name;
    this.namespace = options.namespace || 'CORE';
    this.sourceType = options.sourceType || DataSourceType.SQL;

    this.config = {
      description: options.description || '',

      // Output mapping
      valueField: options.valueField || 'value',
      labelField: options.labelField || 'label',
      metadataFields: options.metadataFields || [],

      // Caching
      cacheStrategy: options.cacheStrategy || CacheStrategy.TTL,
      cacheTTL: options.cacheTTL || 3600, // 1 hour default

      // Limits
      defaultLimit: options.defaultLimit || 100,
      maxLimit: options.maxLimit || 1000,
    };
  }

  setDescription(description) {
    this.config.description = description;
    return this;
  }

  setOutputMapping(valueField, labelField, metadataFields = []) {
    this.config.valueField = valueField;
    this.config.labelField = labelField;
    this.config.metadataFields = metadataFields;
    return this;
  }

  setCacheStrategy(strategy, ttl = 3600) {
    this.config.cacheStrategy = strategy;
    this.config.cacheTTL = ttl;
    return this;
  }

  setLimits(defaultLimit, maxLimit) {
    this.config.defaultLimit = defaultLimit;
    this.config.maxLimit = maxLimit;
    return this;
  }

  build() {
    return {
      graphId: this.graphId,
      graphType: 'STRUCTURAL',
      graphSubType: 'datasource',
      graphDimension: 'DATA',
      namespace: this.namespace,
      name: this.name,
      sourceType: this.sourceType,
      config: this.config,
    };
  }
}

// -----------------------------------------------------------------------------
// SQL DATASOURCE
// -----------------------------------------------------------------------------

class SQLDataSourceBuilder extends BaseDataSourceBuilder {
  constructor(name, options = {}) {
    super(name, { ...options, sourceType: DataSourceType.SQL });

    this.sqlConfig = {
      // Connection (reference to connection config, not credentials!)
      connectionId: options.connectionId || 'default',

      // Query
      query: options.query || '',
      countQuery: options.countQuery || '',
      searchQuery: options.searchQuery || '',

      // Parameters
      parameterMapping: options.parameterMapping || {},
    };
  }

  setConnection(connectionId) {
    this.sqlConfig.connectionId = connectionId;
    return this;
  }

  setQuery(query) {
    this.sqlConfig.query = query;
    return this;
  }

  setCountQuery(countQuery) {
    this.sqlConfig.countQuery = countQuery;
    return this;
  }

  setSearchQuery(searchQuery, searchField) {
    this.sqlConfig.searchQuery = searchQuery;
    this.sqlConfig.searchField = searchField;
    return this;
  }

  setParameterMapping(mapping) {
    this.sqlConfig.parameterMapping = mapping;
    return this;
  }

  build() {
    const base = super.build();
    return {
      ...base,
      sqlConfig: this.sqlConfig,
    };
  }
}

// -----------------------------------------------------------------------------
// API DATASOURCE
// -----------------------------------------------------------------------------

class APIDataSourceBuilder extends BaseDataSourceBuilder {
  constructor(name, options = {}) {
    super(name, { ...options, sourceType: DataSourceType.API });

    this.apiConfig = {
      endpoint: options.endpoint || '',
      method: options.method || 'GET',
      headers: options.headers || {},

      // Request
      queryParams: options.queryParams || {},
      bodyTemplate: options.bodyTemplate || null,

      // Response mapping
      responsePath: options.responsePath || 'data', // JSONPath to items array
      totalPath: options.totalPath || 'total',

      // Auth
      authType: options.authType || 'none', // none, bearer, apiKey, basic
      authConfigId: options.authConfigId || null,
    };
  }

  setEndpoint(endpoint, method = 'GET') {
    this.apiConfig.endpoint = endpoint;
    this.apiConfig.method = method;
    return this;
  }

  setHeaders(headers) {
    this.apiConfig.headers = headers;
    return this;
  }

  setQueryParams(params) {
    this.apiConfig.queryParams = params;
    return this;
  }

  setBodyTemplate(template) {
    this.apiConfig.bodyTemplate = template;
    return this;
  }

  setResponseMapping(responsePath, totalPath = 'total') {
    this.apiConfig.responsePath = responsePath;
    this.apiConfig.totalPath = totalPath;
    return this;
  }

  setAuth(authType, authConfigId) {
    this.apiConfig.authType = authType;
    this.apiConfig.authConfigId = authConfigId;
    return this;
  }

  build() {
    const base = super.build();
    return {
      ...base,
      apiConfig: this.apiConfig,
    };
  }
}

// -----------------------------------------------------------------------------
// KB (KNOWLEDGE BASE) DATASOURCE
// -----------------------------------------------------------------------------

class KBDataSourceBuilder extends BaseDataSourceBuilder {
  constructor(name, options = {}) {
    super(name, { ...options, sourceType: DataSourceType.KB });

    this.kbConfig = {
      // Query type
      queryType: options.queryType || 'cypher', // cypher | vector

      // Cypher config
      cypherQuery: options.cypherQuery || '',
      cypherCountQuery: options.cypherCountQuery || '',
      cypherSearchQuery: options.cypherSearchQuery || '',

      // Vector config (Qdrant)
      collection: options.collection || '',
      embeddingModel: options.embeddingModel || 'default',
      similarityThreshold: options.similarityThreshold || 0.7,

      // Namespace filter
      namespace: options.kbNamespace || null,
    };
  }

  setCypherQuery(query) {
    this.kbConfig.cypherQuery = query;
    this.kbConfig.queryType = 'cypher';
    return this;
  }

  setCypherSearchQuery(searchQuery) {
    this.kbConfig.cypherSearchQuery = searchQuery;
    return this;
  }

  setVectorSearch(collection, similarityThreshold = 0.7) {
    this.kbConfig.queryType = 'vector';
    this.kbConfig.collection = collection;
    this.kbConfig.similarityThreshold = similarityThreshold;
    return this;
  }

  setEmbeddingModel(model) {
    this.kbConfig.embeddingModel = model;
    return this;
  }

  setNamespace(namespace) {
    this.kbConfig.namespace = namespace;
    return this;
  }

  build() {
    const base = super.build();
    return {
      ...base,
      kbConfig: this.kbConfig,
    };
  }
}

// -----------------------------------------------------------------------------
// FILE DATASOURCE
// -----------------------------------------------------------------------------

class FileDataSourceBuilder extends BaseDataSourceBuilder {
  constructor(name, options = {}) {
    super(name, { ...options, sourceType: DataSourceType.FILE });

    this.fileConfig = {
      filePath: options.filePath || '',
      format: options.format || 'json', // json | csv | xml

      // CSV options
      delimiter: options.delimiter || ',',
      hasHeader: options.hasHeader !== false,

      // Encoding
      encoding: options.encoding || 'utf-8',

      // Watch for changes
      watchFile: options.watchFile || false,
    };
  }

  setFilePath(filePath, format = 'json') {
    this.fileConfig.filePath = filePath;
    this.fileConfig.format = format;
    return this;
  }

  setCsvOptions(delimiter = ',', hasHeader = true) {
    this.fileConfig.delimiter = delimiter;
    this.fileConfig.hasHeader = hasHeader;
    return this;
  }

  setEncoding(encoding) {
    this.fileConfig.encoding = encoding;
    return this;
  }

  setWatchFile(watch) {
    this.fileConfig.watchFile = watch;
    return this;
  }

  build() {
    const base = super.build();
    return {
      ...base,
      fileConfig: this.fileConfig,
    };
  }
}

// -----------------------------------------------------------------------------
// COMPOSITE DATASOURCE
// -----------------------------------------------------------------------------

class CompositeDataSourceBuilder extends BaseDataSourceBuilder {
  constructor(name, options = {}) {
    super(name, { ...options, sourceType: DataSourceType.COMPOSITE });

    this.compositeConfig = {
      sources: [], // Array of { dataSourceId, role, joinField }
      mergeStrategy: options.mergeStrategy || 'union', // union | join | enrich
    };
  }

  addSource(dataSourceId, role = 'primary', joinField = null) {
    this.compositeConfig.sources.push({
      dataSourceId,
      role, // primary | secondary | enrichment
      joinField,
    });
    return this;
  }

  setMergeStrategy(strategy) {
    this.compositeConfig.mergeStrategy = strategy;
    return this;
  }

  build() {
    const base = super.build();
    return {
      ...base,
      compositeConfig: this.compositeConfig,
    };
  }
}

// -----------------------------------------------------------------------------
// EXPORTS
// -----------------------------------------------------------------------------

module.exports = {
  // Enums
  DataSourceType,
  CacheStrategy,
  DataSourceOperation,

  // Builders
  BaseDataSourceBuilder,
  SQLDataSourceBuilder,
  APIDataSourceBuilder,
  KBDataSourceBuilder,
  FileDataSourceBuilder,
  CompositeDataSourceBuilder,
};
