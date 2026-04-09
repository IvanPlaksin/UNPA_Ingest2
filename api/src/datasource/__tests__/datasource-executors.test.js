/**
 * Tests for BaseDataSourceExecutor and SQLDataSourceExecutor.
 */

const { BaseDataSourceExecutor } = require('../base-datasource.executor');
const { SQLDataSourceExecutor } = require('../sql-datasource.executor');
const { SQLDataSourceBuilder, CacheStrategy } = require('../../schemas/datasource-config.schema');

// =============================================================================
// MOCK HELPERS
// =============================================================================

function createMockRedis() {
  const store = new Map();
  return {
    store,
    get: jest.fn(async (key) => store.get(key) || null),
    setex: jest.fn(async (key, ttl, value) => { store.set(key, value); }),
    keys: jest.fn(async (pattern) => {
      const prefix = pattern.replace('*', '');
      return Array.from(store.keys()).filter(k => k.startsWith(prefix));
    }),
    del: jest.fn(async (...keys) => { keys.forEach(k => store.delete(k)); }),
  };
}

function createMockConnection(recordset = []) {
  const inputs = {};
  const request = {
    input: jest.fn((name, value) => { inputs[name] = value; }),
    query: jest.fn(async () => ({ recordset })),
    _inputs: inputs,
  };
  return {
    request: jest.fn(() => request),
    _request: request,
  };
}

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// =============================================================================
// BASE EXECUTOR TESTS
// =============================================================================

describe('BaseDataSourceExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new BaseDataSourceExecutor({ logger: createMockLogger() });
  });

  // --- Abstract methods throw ---

  test('loadAll() throws not implemented', async () => {
    await expect(executor.loadAll({}, {})).rejects.toThrow('must be implemented');
  });

  test('search() throws not implemented', async () => {
    await expect(executor.search({}, {})).rejects.toThrow('must be implemented');
  });

  test('getById() throws not implemented', async () => {
    await expect(executor.getById({}, {})).rejects.toThrow('must be implemented');
  });

  test('count() throws not implemented', async () => {
    await expect(executor.count({}, {})).rejects.toThrow('must be implemented');
  });

  test('validate() throws not implemented', async () => {
    await expect(executor.validate({}, {})).rejects.toThrow('must be implemented');
  });

  // --- transformOutput ---

  test('transformOutput maps value and label from raw data', () => {
    const config = { config: { valueField: 'id', labelField: 'name', metadataFields: [] } };
    const rawData = [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
    ];

    const result = executor.transformOutput(rawData, config);

    expect(result).toEqual([
      { value: 1, label: 'Alpha' },
      { value: 2, label: 'Beta' },
    ]);
  });

  test('transformOutput includes metadata fields', () => {
    const config = {
      config: { valueField: 'id', labelField: 'name', metadataFields: ['code', 'region'] },
    };
    const rawData = [{ id: 1, name: 'NYC', code: 'US', region: 'NAM' }];

    const result = executor.transformOutput(rawData, config);

    expect(result[0].metadata).toEqual({ code: 'US', region: 'NAM' });
  });

  test('transformOutput supports nested paths', () => {
    const config = { config: { valueField: 'user.id', labelField: 'user.name', metadataFields: [] } };
    const rawData = [{ user: { id: 42, name: 'John' } }];

    const result = executor.transformOutput(rawData, config);

    expect(result[0]).toEqual({ value: 42, label: 'John' });
  });

  test('transformOutput handles missing fields gracefully', () => {
    const config = { config: { valueField: 'id', labelField: 'name', metadataFields: [] } };
    const rawData = [{ id: 1 }]; // no 'name' field

    const result = executor.transformOutput(rawData, config);

    expect(result[0]).toEqual({ value: 1, label: undefined });
  });

  // --- applyLimits ---

  test('applyLimits uses defaults when no params', () => {
    const config = { config: { defaultLimit: 50, maxLimit: 200 } };
    const result = executor.applyLimits({}, config);

    expect(result).toEqual({ limit: 50, offset: 0 });
  });

  test('applyLimits caps to maxLimit', () => {
    const config = { config: { defaultLimit: 50, maxLimit: 200 } };
    const result = executor.applyLimits({ limit: 500 }, config);

    expect(result.limit).toBe(200);
  });

  test('applyLimits respects offset', () => {
    const config = { config: { defaultLimit: 10, maxLimit: 100 } };
    const result = executor.applyLimits({ limit: 10, offset: 20 }, config);

    expect(result).toEqual({ limit: 10, offset: 20 });
  });

  // --- getCacheKey ---

  test('getCacheKey generates deterministic key', () => {
    const config = { graphId: 'ds_test' };
    const key1 = executor.getCacheKey(config, 'loadAll', { limit: 10 });
    const key2 = executor.getCacheKey(config, 'loadAll', { limit: 10 });

    expect(key1).toBe(key2);
    expect(key1).toContain('ds:ds_test:loadAll:');
  });

  test('getCacheKey differentiates by operation', () => {
    const config = { graphId: 'ds_test' };
    const key1 = executor.getCacheKey(config, 'loadAll', {});
    const key2 = executor.getCacheKey(config, 'search', {});

    expect(key1).not.toBe(key2);
  });

  test('getCacheKey uses "default" for empty params', () => {
    const config = { graphId: 'ds_test' };
    const key = executor.getCacheKey(config, 'loadAll', {});

    expect(key).toBe('ds:ds_test:loadAll:default');
  });

  // --- withCache ---

  test('withCache skips cache when strategy is NONE', async () => {
    const config = { config: { cacheStrategy: 'none' } };
    const loader = jest.fn().mockResolvedValue({ items: [1], total: 1 });

    const result = await executor.withCache(config, 'loadAll', {}, loader);

    expect(result.cached).toBe(false);
    expect(loader).toHaveBeenCalled();
  });

  test('withCache skips cache when no redis', async () => {
    const config = { config: { cacheStrategy: 'ttl' } };
    const loader = jest.fn().mockResolvedValue({ items: [1], total: 1 });

    const result = await executor.withCache(config, 'loadAll', {}, loader);

    expect(result.cached).toBe(false);
    expect(loader).toHaveBeenCalled();
  });

  test('withCache reads from Redis and returns cached: true', async () => {
    const redis = createMockRedis();
    const cachedData = { items: [{ value: 1 }], total: 1 };
    redis.store.set('ds:ds_cached:loadAll:default', JSON.stringify(cachedData));

    const executorWithRedis = new BaseDataSourceExecutor({ redis, logger: createMockLogger() });
    const config = { graphId: 'ds_cached', config: { cacheStrategy: 'ttl' } };
    const loader = jest.fn();

    const result = await executorWithRedis.withCache(config, 'loadAll', {}, loader);

    expect(result.cached).toBe(true);
    expect(result.items).toEqual([{ value: 1 }]);
    expect(loader).not.toHaveBeenCalled();
  });

  test('withCache stores result in Redis on cache miss', async () => {
    const redis = createMockRedis();
    const executorWithRedis = new BaseDataSourceExecutor({ redis, logger: createMockLogger() });
    const config = { graphId: 'ds_miss', config: { cacheStrategy: 'ttl', cacheTTL: 600 } };
    const loader = jest.fn().mockResolvedValue({ items: [{ value: 2 }], total: 1 });

    const result = await executorWithRedis.withCache(config, 'loadAll', {}, loader);

    expect(result.cached).toBe(false);
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringContaining('ds:ds_miss:loadAll:'),
      600,
      expect.any(String),
    );
  });

  // --- invalidateCache ---

  test('invalidateCache deletes matching keys', async () => {
    const redis = createMockRedis();
    redis.store.set('ds:ds_inv:loadAll:abc', 'data1');
    redis.store.set('ds:ds_inv:search:def', 'data2');

    const executorWithRedis = new BaseDataSourceExecutor({ redis, logger: createMockLogger() });
    await executorWithRedis.invalidateCache({ graphId: 'ds_inv', name: 'test' });

    expect(redis.del).toHaveBeenCalled();
  });

  test('invalidateCache does nothing without redis', async () => {
    // Should not throw
    await executor.invalidateCache({ graphId: 'ds_noop', name: 'test' });
  });

  // --- validateConfig ---

  test('validateConfig throws for null config', () => {
    expect(() => executor.validateConfig(null)).toThrow('config is required');
  });

  test('validateConfig throws for missing sourceType', () => {
    expect(() => executor.validateConfig({})).toThrow('sourceType is required');
  });

  test('validateConfig returns true for valid config', () => {
    expect(executor.validateConfig({ sourceType: 'SQL' })).toBe(true);
  });
});

// =============================================================================
// SQL EXECUTOR TESTS
// =============================================================================

describe('SQLDataSourceExecutor', () => {
  let executor;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    executor = new SQLDataSourceExecutor({ logger: mockLogger });
  });

  // --- Connection ---

  test('getConnection throws when pool not configured', async () => {
    await expect(executor.getConnection({})).rejects.toThrow('connection pool not configured');
  });

  test('setConnectionPool sets pool and returns this', () => {
    const pool = {};
    const result = executor.setConnectionPool(pool);
    expect(result).toBe(executor);
    expect(executor.connectionPool).toBe(pool);
  });

  // --- loadAll ---

  test('loadAll returns items and total', async () => {
    const mockConn = createMockConnection([
      { station_id: 1, station_name: 'Geneva' },
      { station_id: 2, station_name: 'New York' },
    ]);
    // Override count query to return total
    const originalQuery = mockConn._request.query;
    mockConn._request.query = jest.fn(async (sql) => {
      if (sql.includes('COUNT(*)')) {
        return { recordset: [{ total: 10 }] };
      }
      return { recordset: [
        { station_id: 1, station_name: 'Geneva' },
        { station_id: 2, station_name: 'New York' },
      ]};
    });

    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('Stations', { graphId: 'ds_stations' })
      .setQuery('SELECT station_id, station_name FROM stations')
      .setOutputMapping('station_id', 'station_name')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    const result = await executor.loadAll(config, { limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ value: 1, label: 'Geneva' });
    expect(result.total).toBe(10);
    expect(result.cached).toBe(false);
  });

  test('loadAll throws when query is missing', async () => {
    const mockConn = createMockConnection();
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('NoQuery', { graphId: 'ds_nq' })
      .setCacheStrategy(CacheStrategy.NONE)
      .build();
    // query is empty string by default

    await expect(executor.loadAll(config)).rejects.toThrow('SQL query is required');
  });

  // --- search ---

  test('search returns matching items', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ id: 1, name: 'Geneva' }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('Stations', { graphId: 'ds_s' })
      .setQuery('SELECT id, name FROM stations')
      .setSearchQuery('SELECT id, name FROM stations WHERE name LIKE @searchText')
      .setOutputMapping('id', 'name')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    const result = await executor.search(config, { query: 'Gen', limit: 5 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Geneva');
    expect(mockConn._request.input).toHaveBeenCalledWith('searchText', '%Gen%');
  });

  test('search returns empty for empty query', async () => {
    executor.setConnectionPool(createMockConnection());

    const config = new SQLDataSourceBuilder('X', { graphId: 'ds_x' })
      .setQuery('SELECT 1')
      .build();

    const result = await executor.search(config, { query: '' });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test('search auto-generates WHERE when no searchQuery defined', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ id: 1, name: 'Found' }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('Auto', { graphId: 'ds_auto' })
      .setQuery('SELECT id, name FROM items')
      .setOutputMapping('id', 'name')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();
    // No searchQuery set — should auto-generate

    const result = await executor.search(config, { query: 'test' });

    const queryCalled = mockConn._request.query.mock.calls[0][0];
    expect(queryCalled).toContain('LIKE @searchText');
  });

  // --- getById ---

  test('getById returns single item', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ id: 42, name: 'Found' }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('ById', { graphId: 'ds_byid' })
      .setQuery('SELECT id, name FROM items')
      .setOutputMapping('id', 'name')
      .build();

    const result = await executor.getById(config, { id: 42 });
    expect(result).toEqual({ value: 42, label: 'Found' });
  });

  test('getById returns null when not found', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({ recordset: [] }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('ByIdNull', { graphId: 'ds_null' })
      .setQuery('SELECT id, name FROM items')
      .build();

    const result = await executor.getById(config, { id: 999 });
    expect(result).toBeNull();
  });

  test('getById throws without id', async () => {
    executor.setConnectionPool(createMockConnection());
    const config = new SQLDataSourceBuilder('NoId', { graphId: 'ds_noid' })
      .setQuery('SELECT 1')
      .build();

    await expect(executor.getById(config, {})).rejects.toThrow('id is required');
  });

  // --- count ---

  test('count returns total from countQuery', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ total: 42 }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('Count', { graphId: 'ds_cnt' })
      .setQuery('SELECT id FROM items')
      .setCountQuery('SELECT COUNT(*) as total FROM items')
      .build();

    const result = await executor.count(config);
    expect(result).toBe(42);
  });

  test('count auto-generates from base query when no countQuery', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ total: 5 }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('CountAuto', { graphId: 'ds_cntauto' })
      .setQuery('SELECT id, name FROM items')
      .build();

    const result = await executor.count(config);
    expect(result).toBe(5);

    const queryCalled = mockConn._request.query.mock.calls[0][0];
    expect(queryCalled).toContain('COUNT(*)');
  });

  // --- validate ---

  test('validate returns true when value exists', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ cnt: 1 }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('Val', { graphId: 'ds_val' })
      .setQuery('SELECT id FROM items')
      .build();

    const result = await executor.validate(config, { value: 42 });
    expect(result).toBe(true);
  });

  test('validate returns false when value does not exist', async () => {
    const mockConn = createMockConnection();
    mockConn._request.query = jest.fn(async () => ({
      recordset: [{ cnt: 0 }],
    }));
    executor.setConnectionPool(mockConn);

    const config = new SQLDataSourceBuilder('ValFalse', { graphId: 'ds_valf' })
      .setQuery('SELECT id FROM items')
      .build();

    const result = await executor.validate(config, { value: 999 });
    expect(result).toBe(false);
  });

  test('validate throws without value', async () => {
    executor.setConnectionPool(createMockConnection());
    const config = new SQLDataSourceBuilder('ValNoVal', { graphId: 'ds_vnv' })
      .setQuery('SELECT 1')
      .build();

    await expect(executor.validate(config, {})).rejects.toThrow('value is required');
  });

  // --- _buildParams ---

  test('_buildParams maps filter keys via parameterMapping', () => {
    const result = executor._buildParams(
      { orgUnit: 'IT', region: 'EUR' },
      { orgUnit: 'org_unit_id' },
    );

    expect(result).toEqual({ org_unit_id: 'IT', region: 'EUR' });
  });

  test('_buildParams returns empty for null filters', () => {
    const result = executor._buildParams(null, {});
    expect(result).toEqual({});
  });
});
