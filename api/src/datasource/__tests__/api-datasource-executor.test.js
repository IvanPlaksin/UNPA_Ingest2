/**
 * Tests for APIDataSourceExecutor.
 */

const { APIDataSourceExecutor } = require('../api-datasource.executor');
const { APIDataSourceBuilder, CacheStrategy } = require('../../schemas/datasource-config.schema');

// =============================================================================
// MOCK HELPERS
// =============================================================================

function createMockHttpClient(responseData = {}, status = 200) {
  return jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: jest.fn(async () => JSON.stringify(responseData)),
    headers: { get: () => 'application/json' },
  }));
}

function createMockAuthService() {
  return {
    getToken: jest.fn(async () => 'mock-token-123'),
    getApiKey: jest.fn(async () => ({ headerName: 'X-API-Key', apiKey: 'key-abc' })),
    getBasicAuth: jest.fn(async () => ({ username: 'user', password: 'pass' })),
  };
}

function createMockLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// =============================================================================
// TESTS
// =============================================================================

describe('APIDataSourceExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new APIDataSourceExecutor({ logger: createMockLogger() });
  });

  // --- Setters ---

  test('setHttpClient returns this for chaining', () => {
    expect(executor.setHttpClient(() => {})).toBe(executor);
  });

  test('setAuthService returns this for chaining', () => {
    expect(executor.setAuthService({})).toBe(executor);
  });

  // --- loadAll ---

  test('loadAll fetches data and transforms output', async () => {
    const httpClient = createMockHttpClient({
      data: [
        { id: 1, name: 'Alpha', code: 'A' },
        { id: 2, name: 'Beta', code: 'B' },
      ],
      total: 10,
    });

    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('Countries', { graphId: 'ds_api' })
      .setEndpoint('https://api.example.com/countries')
      .setResponseMapping('data', 'total')
      .setOutputMapping('id', 'name', ['code'])
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    const result = await executor.loadAll(config, { limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ value: 1, label: 'Alpha', metadata: { code: 'A' } });
    expect(result.total).toBe(10);
    expect(result.cached).toBe(false);
    expect(httpClient).toHaveBeenCalledTimes(1);
  });

  test('loadAll includes query params in URL', async () => {
    const httpClient = createMockHttpClient({ data: [], total: 0 });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('Test', { graphId: 'ds_t' })
      .setEndpoint('https://api.example.com/items')
      .setQueryParams({ region: 'EU' })
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config, { limit: 5, offset: 10 });

    const calledUrl = httpClient.mock.calls[0][0];
    expect(calledUrl).toContain('region=EU');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('offset=10');
  });

  test('loadAll throws without endpoint', async () => {
    executor.setHttpClient(createMockHttpClient());

    const config = new APIDataSourceBuilder('NoEndpoint', { graphId: 'ds_ne' })
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await expect(executor.loadAll(config)).rejects.toThrow('endpoint is required');
  });

  test('loadAll throws without httpClient when no global fetch', async () => {
    // Temporarily remove global fetch
    const originalFetch = globalThis.fetch;
    delete globalThis.fetch;

    const freshExecutor = new APIDataSourceExecutor({ logger: createMockLogger() });

    const config = new APIDataSourceBuilder('NoClient', { graphId: 'ds_nc' })
      .setEndpoint('https://api.example.com')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await expect(freshExecutor.loadAll(config)).rejects.toThrow('HTTP client not configured');

    // Restore
    globalThis.fetch = originalFetch;
  });

  test('loadAll throws on non-OK response', async () => {
    executor.setHttpClient(createMockHttpClient({}, 500));

    const config = new APIDataSourceBuilder('ServerErr', { graphId: 'ds_se' })
      .setEndpoint('https://api.example.com/fail')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await expect(executor.loadAll(config)).rejects.toThrow('API request failed: 500');
  });

  // --- search ---

  test('search passes query as search param', async () => {
    const httpClient = createMockHttpClient({
      data: [{ id: 1, name: 'Geneva' }],
    });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('Search', { graphId: 'ds_search' })
      .setEndpoint('https://api.example.com/cities')
      .setOutputMapping('id', 'name')
      .build();

    const result = await executor.search(config, { query: 'Gen', limit: 5 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Geneva');
    const calledUrl = httpClient.mock.calls[0][0];
    expect(calledUrl).toContain('q=Gen');
  });

  test('search returns empty for empty query', async () => {
    executor.setHttpClient(createMockHttpClient());
    const config = new APIDataSourceBuilder('EmptyQ', { graphId: 'ds_eq' })
      .setEndpoint('https://api.example.com')
      .build();

    const result = await executor.search(config, { query: '' });
    expect(result.items).toEqual([]);
  });

  test('search uses custom searchParam', async () => {
    const httpClient = createMockHttpClient({ data: [] });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('CustomParam', { graphId: 'ds_cp' })
      .setEndpoint('https://api.example.com/search')
      .build();
    config.apiConfig.searchParam = 'search_term';

    await executor.search(config, { query: 'test' });

    const calledUrl = httpClient.mock.calls[0][0];
    expect(calledUrl).toContain('search_term=test');
  });

  // --- getById ---

  test('getById appends ID to endpoint', async () => {
    const httpClient = createMockHttpClient({ id: 42, name: 'Found' });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('GetById', { graphId: 'ds_gbi' })
      .setEndpoint('https://api.example.com/items')
      .setOutputMapping('id', 'name')
      .build();

    const result = await executor.getById(config, { id: 42 });

    expect(result).toEqual({ value: 42, label: 'Found' });
    const calledUrl = httpClient.mock.calls[0][0];
    expect(calledUrl).toContain('/items/42');
  });

  test('getById returns null on 404', async () => {
    executor.setHttpClient(createMockHttpClient({}, 404));

    const config = new APIDataSourceBuilder('NotFound', { graphId: 'ds_nf' })
      .setEndpoint('https://api.example.com/items')
      .build();

    const result = await executor.getById(config, { id: 999 });
    expect(result).toBeNull();
  });

  test('getById throws without id', async () => {
    executor.setHttpClient(createMockHttpClient());
    const config = new APIDataSourceBuilder('NoId', { graphId: 'ds_noid' })
      .setEndpoint('https://api.example.com')
      .build();

    await expect(executor.getById(config, {})).rejects.toThrow('id is required');
  });

  // --- count ---

  test('count returns total from loadAll', async () => {
    const httpClient = createMockHttpClient({ data: [{ id: 1 }], total: 42 });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('Count', { graphId: 'ds_cnt' })
      .setEndpoint('https://api.example.com/items')
      .setResponseMapping('data', 'total')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    const result = await executor.count(config);
    expect(result).toBe(42);
  });

  // --- validate ---

  test('validate returns true when item exists', async () => {
    executor.setHttpClient(createMockHttpClient({ id: 1, name: 'Found' }));

    const config = new APIDataSourceBuilder('Val', { graphId: 'ds_val' })
      .setEndpoint('https://api.example.com/items')
      .build();

    const result = await executor.validate(config, { value: 1 });
    expect(result).toBe(true);
  });

  test('validate returns false on 404', async () => {
    executor.setHttpClient(createMockHttpClient({}, 404));

    const config = new APIDataSourceBuilder('ValF', { graphId: 'ds_valf' })
      .setEndpoint('https://api.example.com/items')
      .build();

    const result = await executor.validate(config, { value: 999 });
    expect(result).toBe(false);
  });

  test('validate throws without value', async () => {
    executor.setHttpClient(createMockHttpClient());
    const config = new APIDataSourceBuilder('NoVal', { graphId: 'ds_nv' })
      .setEndpoint('https://api.example.com')
      .build();

    await expect(executor.validate(config, {})).rejects.toThrow('value is required');
  });

  // --- Auth ---

  test('bearer auth adds Authorization header', async () => {
    const httpClient = createMockHttpClient({ data: [] });
    const authService = createMockAuthService();
    executor.setHttpClient(httpClient).setAuthService(authService);

    const config = new APIDataSourceBuilder('BearerAuth', { graphId: 'ds_bearer' })
      .setEndpoint('https://api.example.com/secure')
      .setAuth('bearer', 'auth-1')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config);

    const calledOptions = httpClient.mock.calls[0][1];
    expect(calledOptions.headers.Authorization).toBe('Bearer mock-token-123');
    expect(authService.getToken).toHaveBeenCalledWith('auth-1');
  });

  test('apiKey auth adds custom header', async () => {
    const httpClient = createMockHttpClient({ data: [] });
    const authService = createMockAuthService();
    executor.setHttpClient(httpClient).setAuthService(authService);

    const config = new APIDataSourceBuilder('ApiKeyAuth', { graphId: 'ds_apikey' })
      .setEndpoint('https://api.example.com/secure')
      .setAuth('apiKey', 'auth-2')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config);

    const calledOptions = httpClient.mock.calls[0][1];
    expect(calledOptions.headers['X-API-Key']).toBe('key-abc');
  });

  test('basic auth adds Base64 header', async () => {
    const httpClient = createMockHttpClient({ data: [] });
    const authService = createMockAuthService();
    executor.setHttpClient(httpClient).setAuthService(authService);

    const config = new APIDataSourceBuilder('BasicAuth', { graphId: 'ds_basic' })
      .setEndpoint('https://api.example.com/secure')
      .setAuth('basic', 'auth-3')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config);

    const calledOptions = httpClient.mock.calls[0][1];
    const expected = `Basic ${Buffer.from('user:pass').toString('base64')}`;
    expect(calledOptions.headers.Authorization).toBe(expected);
  });

  test('no auth when authType is none', async () => {
    const httpClient = createMockHttpClient({ data: [] });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('NoAuth', { graphId: 'ds_noauth' })
      .setEndpoint('https://api.example.com/public')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config);

    const calledOptions = httpClient.mock.calls[0][1];
    expect(calledOptions.headers.Authorization).toBeUndefined();
  });

  // --- POST with body template ---

  test('POST sends body template as JSON', async () => {
    const httpClient = createMockHttpClient({ data: [] });
    executor.setHttpClient(httpClient);

    const config = new APIDataSourceBuilder('PostBody', { graphId: 'ds_post' })
      .setEndpoint('https://api.example.com/graphql', 'POST')
      .setBodyTemplate({ query: '{ users { id } }' })
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config);

    const calledOptions = httpClient.mock.calls[0][1];
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.body).toBe(JSON.stringify({ query: '{ users { id } }' }));
    expect(calledOptions.headers['Content-Type']).toBe('application/json');
  });

  // --- URL building ---

  test('_buildUrl merges configured and runtime params', () => {
    const url = executor._buildUrl(
      { endpoint: 'https://api.example.com/data', queryParams: { region: 'EU' } },
      { limit: 10, search: 'test' },
    );

    expect(url).toContain('region=EU');
    expect(url).toContain('limit=10');
    expect(url).toContain('search=test');
    expect(url).toContain('?');
  });

  test('_buildUrl skips null/undefined params', () => {
    const url = executor._buildUrl(
      { endpoint: 'https://api.example.com/data' },
      { a: 1, b: null, c: undefined, d: 'ok' },
    );

    expect(url).toContain('a=1');
    expect(url).toContain('d=ok');
    expect(url).not.toContain('b=');
    expect(url).not.toContain('c=');
  });

  // --- _extractItems ---

  test('_extractItems uses responsePath', () => {
    const data = { results: { items: [1, 2, 3] } };
    const items = executor._extractItems(data, { responsePath: 'results.items' });
    expect(items).toEqual([1, 2, 3]);
  });

  test('_extractItems defaults to "data" path', () => {
    const data = { data: [1, 2] };
    const items = executor._extractItems(data, {});
    expect(items).toEqual([1, 2]);
  });

  // --- _extractTotal ---

  test('_extractTotal uses totalPath', () => {
    const data = { meta: { count: 42 } };
    const total = executor._extractTotal(data, { totalPath: 'meta.count' });
    expect(total).toBe(42);
  });
});
