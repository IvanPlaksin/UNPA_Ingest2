/**
 * DataSource Service + Resolver Tests
 */

const { StaticListResolver } = require('../resolvers/static-list.resolver');
const { MemgraphQueryResolver } = require('../resolvers/memgraph-query.resolver');
const { SqlQueryResolver } = require('../resolvers/sql-query.resolver');
const { RestApiResolver } = require('../resolvers/rest-api.resolver');
const { BaseResolver } = require('../resolvers/base.resolver');

// ────────────────────────────────────────────────────────────────────────────
// StaticListResolver
// ────────────────────────────────────────────────────────────────────────────

describe('StaticListResolver', () => {
  const resolver = new StaticListResolver();

  test('resolves string items', async () => {
    const result = await resolver.resolve({ items: ['US', 'UK', 'FR'] });
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({ value: 'US', label: 'US' });
  });

  test('resolves object items with defaults', async () => {
    const result = await resolver.resolve({
      items: [
        { value: 'us', label: 'United States' },
        { value: 'uk', label: 'United Kingdom' },
      ],
    });
    expect(result.items[0].value).toBe('us');
    expect(result.items[0].label).toBe('United States');
  });

  test('supports custom value/label fields', async () => {
    const result = await resolver.resolve({
      items: [{ code: 'NY', city: 'New York' }],
      valueField: 'code',
      labelField: 'city',
    });
    expect(result.items[0].value).toBe('NY');
    expect(result.items[0].label).toBe('New York');
  });

  test('handles empty items', async () => {
    const result = await resolver.resolve({ items: [] });
    expect(result.items).toEqual([]);
  });

  test('validates requires items array', () => {
    expect(resolver.validate({}).valid).toBe(false);
    expect(resolver.validate({ items: [] }).valid).toBe(true);
    expect(resolver.validate({ items: 'not array' }).valid).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MemgraphQueryResolver
// ────────────────────────────────────────────────────────────────────────────

describe('MemgraphQueryResolver', () => {
  test('validates cypher required', () => {
    const resolver = new MemgraphQueryResolver();
    expect(resolver.validate({}).valid).toBe(false);
    expect(resolver.validate({ cypher: 'MATCH (n) RETURN n' }).valid).toBe(true);
  });

  test('resolves dynamic params from context', () => {
    const resolver = new MemgraphQueryResolver();
    const key = resolver.getCacheKey(
      { cypher: 'MATCH (n) RETURN n', parameters: {}, dynamicParams: { dept: 'formData.department' } },
      { formData: { department: 'ICTS' } }
    );
    expect(key).toContain('ICTS');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SqlQueryResolver
// ────────────────────────────────────────────────────────────────────────────

describe('SqlQueryResolver', () => {
  const resolver = new SqlQueryResolver();

  test('validates query required', () => {
    expect(resolver.validate({}).valid).toBe(false);
    expect(resolver.validate({ query: 'SELECT 1' }).valid).toBe(true);
  });

  test('detects dangerous SQL', () => {
    const result = resolver.validate({ query: 'SELECT 1; DROP TABLE users' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('dangerous');
  });

  test('allows safe SELECT', () => {
    expect(resolver.validate({ query: 'SELECT name, id FROM users WHERE active = @active' }).valid).toBe(true);
  });

  test('generates cache key with params', () => {
    const key = resolver.getCacheKey(
      { query: 'SELECT 1', parameters: { a: 1 }, connection: 'prod' },
      {}
    );
    expect(key).toContain('prod');
    expect(key).toContain('SELECT 1');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// RestApiResolver
// ────────────────────────────────────────────────────────────────────────────

describe('RestApiResolver', () => {
  const resolver = new RestApiResolver();

  test('validates url required', () => {
    expect(resolver.validate({}).valid).toBe(false);
    expect(resolver.validate({ url: 'https://api.example.com/data' }).valid).toBe(true);
  });

  test('interpolates template variables', () => {
    const result = resolver._interpolate(
      'https://api.example.com/${domain}/users',
      { domain: 'admin' }
    );
    expect(result).toBe('https://api.example.com/admin/users');
  });

  test('generates cache key', () => {
    const key = resolver.getCacheKey(
      { url: 'https://api.example.com/data', method: 'GET' },
      {}
    );
    expect(key).toContain('GET');
    expect(key).toContain('api.example.com');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BaseResolver
// ────────────────────────────────────────────────────────────────────────────

describe('BaseResolver', () => {
  const base = new BaseResolver();

  test('resolve throws by default', async () => {
    await expect(base.resolve({})).rejects.toThrow('must be implemented');
  });

  test('validate returns true by default', () => {
    expect(base.validate({}).valid).toBe(true);
  });

  test('_resolvePath handles nested paths', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(base._resolvePath(obj, 'a.b.c')).toBe(42);
    expect(base._resolvePath(obj, 'a.missing')).toBeUndefined();
    expect(base._resolvePath(null, 'a.b')).toBeUndefined();
  });

  test('getCacheKey returns null by default', () => {
    expect(base.getCacheKey({}, {})).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DataSourceService (validateConfig only — no DB needed)
// ────────────────────────────────────────────────────────────────────────────

describe('DataSourceService.validateConfig', () => {
  const { DataSourceService } = require('../datasource.service');
  const svc = new DataSourceService({});

  test('validates STATIC_LIST config', () => {
    expect(svc.validateConfig('STATIC_LIST', { items: ['a', 'b'] }).valid).toBe(true);
    expect(svc.validateConfig('STATIC_LIST', {}).valid).toBe(false);
  });

  test('validates MEMGRAPH_QUERY config', () => {
    expect(svc.validateConfig('MEMGRAPH_QUERY', { cypher: 'MATCH (n) RETURN n' }).valid).toBe(true);
    expect(svc.validateConfig('MEMGRAPH_QUERY', {}).valid).toBe(false);
  });

  test('validates SQL_QUERY config', () => {
    expect(svc.validateConfig('SQL_QUERY', { query: 'SELECT 1' }).valid).toBe(true);
    expect(svc.validateConfig('SQL_QUERY', {}).valid).toBe(false);
  });

  test('validates REST_API config', () => {
    expect(svc.validateConfig('REST_API', { url: 'https://example.com' }).valid).toBe(true);
    expect(svc.validateConfig('REST_API', {}).valid).toBe(false);
  });

  test('rejects unknown type', () => {
    expect(svc.validateConfig('UNKNOWN_TYPE', {}).valid).toBe(false);
  });
});
