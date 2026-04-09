/**
 * =============================================================================
 * SQL DATASOURCE EXECUTOR
 *
 * Executor for loading data from SQL Server via mssql connection pool.
 * Supports: loadAll, search, getById, count, validate.
 * Uses SQL Server OFFSET/FETCH pagination syntax.
 * =============================================================================
 */

const { BaseDataSourceExecutor } = require('./base-datasource.executor');
const sql = require('mssql');
const { DEFAULTS } = require('../config/mssql.config');

class SQLDataSourceExecutor extends BaseDataSourceExecutor {
  constructor(options = {}) {
    super(options);
    this.connectionPool = options.connectionPool || null;
    /** @type {Map<string, sql.ConnectionPool>} */
    this._poolCache = new Map();
  }

  /**
   * Set connection pool (mssql pool instance).
   */
  setConnectionPool(pool) {
    this.connectionPool = pool;
    return this;
  }

  /**
   * Get connection pool — resolves dynamically from domain service by connectionId.
   * Falls back to a static pool if set directly.
   */
  async getConnection(config) {
    const connectionId = config.sqlConfig?.connectionId;

    // 1. Check pool cache
    if (connectionId && this._poolCache.has(connectionId)) {
      const cached = this._poolCache.get(connectionId);
      if (cached.connected) return cached;
      this._poolCache.delete(connectionId);
    }

    // 2. Static pool fallback
    if (!connectionId && this.connectionPool) {
      return this.connectionPool;
    }

    // 3. Resolve from domain service
    if (!connectionId) throw new Error('SQL connection pool not configured (no connectionId)');

    const { getDomainService } = require('../services/domain');
    const domainService = getDomainService();

    // Ensure domain is active
    if (!domainService.getCurrentDomain()) {
      await domainService.switchDomain('default');
    }

    const { config: dsConfig, credentials } = await domainService.getDataSourceWithCredentials(connectionId);
    const params = dsConfig.connectionParams || {};

    const poolConfig = {
      server: params.server,
      port: parseInt(params.port) || DEFAULTS.PORT,
      database: params.database,
      user: credentials?.username || credentials?.user,
      password: credentials?.password,
      domain: credentials?.domain,
      options: {
        encrypt: params.encryption ?? params.encrypt ?? DEFAULTS.ENCRYPT,
        trustServerCertificate: params.trustServerCertificate ?? DEFAULTS.TRUST_SERVER_CERTIFICATE,
        enableArithAbort: true,
        readOnlyIntent: true,
      },
      connectionTimeout: DEFAULTS.CONNECTION_TIMEOUT,
      requestTimeout: DEFAULTS.REQUEST_TIMEOUT,
      pool: { max: DEFAULTS.POOL_MAX, min: DEFAULTS.POOL_MIN, idleTimeoutMillis: DEFAULTS.POOL_IDLE_TIMEOUT },
    };

    const pool = await new sql.ConnectionPool(poolConfig).connect();
    this._poolCache.set(connectionId, pool);
    this.logger.info(`SQL pool opened for connection '${connectionId}' → ${params.server}:${poolConfig.port}/${params.database}`);
    return pool;
  }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  async loadAll(config, params = {}) {
    this.validateConfig(config);

    return this.withCache(config, 'loadAll', params, async () => {
      const connection = await this.getConnection(config);
      const { limit, offset } = this.applyLimits(params, config);
      const sqlConfig = config.sqlConfig || {};

      if (!sqlConfig.query) {
        throw new Error('SQL query is required for loadAll');
      }

      const baseQuery = sqlConfig.query.trim().replace(/;+\s*$/, '');
      const hasOrderBy = /ORDER\s+BY\b/i.test(baseQuery);
      const paginatedQuery = hasOrderBy
        ? `${baseQuery} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
        : `${baseQuery} ORDER BY 1 OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

      const queryParams = this._buildParams(params.filters, sqlConfig.parameterMapping);

      const request = connection.request();
      for (const [key, value] of Object.entries(queryParams)) {
        request.input(key, value);
      }

      const result = await request.query(paginatedQuery);
      const items = this.transformOutput(result.recordset, config);
      const total = await this._getCount(connection, sqlConfig, queryParams);

      return { items, total };
    });
  }

  async search(config, params = {}) {
    this.validateConfig(config);

    const { query: searchText, limit = 10 } = params;

    if (!searchText || searchText.length < 1) {
      return { items: [], total: 0 };
    }

    const connection = await this.getConnection(config);
    const sqlConfig = config.sqlConfig || {};

    let searchQuery = sqlConfig.searchQuery;

    if (!searchQuery) {
      const baseQuery = sqlConfig.query;
      const searchField = sqlConfig.searchField || config.config?.labelField || 'name';

      if (baseQuery.toLowerCase().includes('where')) {
        searchQuery = baseQuery.replace(/where/i, `WHERE ${searchField} LIKE @searchText AND`);
      } else {
        searchQuery = baseQuery + ` WHERE ${searchField} LIKE @searchText`;
      }
    }

    const cappedLimit = Math.min(limit, config.config?.maxLimit || 100);
    searchQuery = `
      ${searchQuery}
      ORDER BY 1
      OFFSET 0 ROWS
      FETCH NEXT ${cappedLimit} ROWS ONLY
    `;

    const request = connection.request();
    request.input('searchText', `%${searchText}%`);

    const filterParams = this._buildParams(params.filters, sqlConfig.parameterMapping);
    for (const [key, value] of Object.entries(filterParams)) {
      request.input(key, value);
    }

    const result = await request.query(searchQuery);
    const items = this.transformOutput(result.recordset, config);

    return { items, total: items.length };
  }

  async getById(config, params = {}) {
    this.validateConfig(config);

    const { id } = params;
    if (!id) throw new Error('id is required for getById');

    const connection = await this.getConnection(config);
    const sqlConfig = config.sqlConfig || {};
    const valueField = config.config?.valueField || 'id';

    let query = sqlConfig.query;
    if (query.toLowerCase().includes('where')) {
      query = query.replace(/where/i, `WHERE ${valueField} = @id AND`);
    } else {
      query = query + ` WHERE ${valueField} = @id`;
    }

    const request = connection.request();
    request.input('id', id);

    const result = await request.query(query);
    if (result.recordset.length === 0) return null;

    const items = this.transformOutput([result.recordset[0]], config);
    return items[0];
  }

  async count(config, params = {}) {
    this.validateConfig(config);

    const connection = await this.getConnection(config);
    const sqlConfig = config.sqlConfig || {};
    const queryParams = this._buildParams(params.filters, sqlConfig.parameterMapping);

    return this._getCount(connection, sqlConfig, queryParams);
  }

  async validate(config, params = {}) {
    this.validateConfig(config);

    const { value, field } = params;
    if (value === undefined) throw new Error('value is required for validate');

    const connection = await this.getConnection(config);
    const sqlConfig = config.sqlConfig || {};
    const checkField = field || config.config?.valueField || 'id';

    let query = sqlConfig.query;
    if (query.toLowerCase().includes('where')) {
      query = query.replace(/where/i, `WHERE ${checkField} = @checkValue AND`);
    } else {
      query = query + ` WHERE ${checkField} = @checkValue`;
    }

    const countQuery = `SELECT COUNT(*) as cnt FROM (${query}) as subq`;

    const request = connection.request();
    request.input('checkValue', value);

    const result = await request.query(countQuery);
    return result.recordset[0].cnt > 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async _getCount(connection, sqlConfig, queryParams) {
    let countQuery = sqlConfig.countQuery;

    if (!countQuery) {
      countQuery = `SELECT COUNT(*) as total FROM (${sqlConfig.query}) as countQuery`;
    }

    const request = connection.request();
    for (const [key, value] of Object.entries(queryParams)) {
      request.input(key, value);
    }

    const result = await request.query(countQuery);
    return result.recordset[0].total;
  }

  _buildParams(filters, parameterMapping = {}) {
    const params = {};
    if (!filters) return params;

    for (const [filterKey, filterValue] of Object.entries(filters)) {
      const paramName = parameterMapping[filterKey] || filterKey;
      params[paramName] = filterValue;
    }

    return params;
  }
}

module.exports = { SQLDataSourceExecutor };
