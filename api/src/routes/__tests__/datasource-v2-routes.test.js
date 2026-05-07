/**
 * Integration tests for DataSource v2 REST API routes.
 * Uses express test setup with mocked services.
 */

const express = require('express');
const request = require('supertest');

// Mock the services before requiring the route
jest.mock('../../services/datasources', () => ({
  DataSourceService: jest.fn().mockImplementation(() => ({
    list: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'test' }),
    update: jest.fn().mockResolvedValue({ id: 'test' }),
    delete: jest.fn().mockResolvedValue({ deleted: true }),
    resolve: jest.fn().mockResolvedValue({ items: [] }),
    validateConfig: jest.fn().mockReturnValue({ valid: true }),
  })),
}));

jest.mock('../../services/memgraph.service', () => {
  const mockMemgraph = {
    runQuery: jest.fn().mockResolvedValue([]),
    executeQuery: jest.fn().mockResolvedValue({ records: [] }),
  };
  return {
    ...mockMemgraph,
    getMemgraphService: jest.fn(() => mockMemgraph),
  };
});

jest.mock('../../services/redis.service', () => null);

// Mock datasource.service (v2) so we can control responses
const mockDSServiceV2 = {
  get: jest.fn(),
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
};

jest.mock('../../services/datasource.service', () => ({
  DataSourceService: jest.fn().mockImplementation(() => mockDSServiceV2),
}));

// Mock registry
const mockRegistry = {
  register: jest.fn(),
  execute: jest.fn(),
  getExecutor: jest.fn().mockReturnValue({
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock('../../services/datasource-registry', () => ({
  dataSourceRegistry: mockRegistry,
}));

const router = require('../datasource.route');

// Setup test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/datasources', router);
  return app;
}

describe('DataSource v2 REST API Routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  const mockDS = {
    graphId: 'ds_test',
    name: 'TestSource',
    sourceType: 'SQL',
    config: { valueField: 'id', labelField: 'name' },
    sqlConfig: { query: 'SELECT id, name FROM items' },
  };

  // --- Load ---

  test('GET /:id/load returns items from executor', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue({
      items: [{ value: 1, label: 'Alpha' }],
      total: 10,
      cached: false,
    });

    const res = await request(app).get('/api/v1/datasources/ds_test/load?limit=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(10);
    expect(mockRegistry.execute).toHaveBeenCalledWith(
      mockDS,
      'loadAll',
      expect.objectContaining({ limit: 10 }),
    );
  });

  test('GET /:id/load returns 404 for unknown DataSource', async () => {
    mockDSServiceV2.get.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/datasources/unknown/load');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // --- Search ---

  test('GET /:id/search calls search executor', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue({
      items: [{ value: 1, label: 'Geneva' }],
      total: 1,
    });

    const res = await request(app).get('/api/v1/datasources/ds_test/search?q=Gen&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(mockRegistry.execute).toHaveBeenCalledWith(
      mockDS,
      'search',
      expect.objectContaining({ query: 'Gen', limit: 5 }),
    );
  });

  test('GET /:id/search supports "query" param alias', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue({ items: [], total: 0 });

    await request(app).get('/api/v1/datasources/ds_test/search?query=test');

    expect(mockRegistry.execute).toHaveBeenCalledWith(
      mockDS,
      'search',
      expect.objectContaining({ query: 'test' }),
    );
  });

  test('GET /:id/search returns 404 for unknown DataSource', async () => {
    mockDSServiceV2.get.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/datasources/unknown/search?q=x');

    expect(res.status).toBe(404);
  });

  // --- Get by item ID ---

  test('GET /:id/get/:itemId returns single item', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue({ value: 42, label: 'Found' });

    const res = await request(app).get('/api/v1/datasources/ds_test/get/42');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ value: 42, label: 'Found' });
  });

  test('GET /:id/get/:itemId returns 404 when item not found', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/datasources/ds_test/get/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Item not found');
  });

  // --- Count ---

  test('GET /:id/count returns count', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue(42);

    const res = await request(app).get('/api/v1/datasources/ds_test/count');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(42);
  });

  // --- Validate value ---

  test('POST /:id/validate-value returns valid:true', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/datasources/ds_test/validate-value')
      .send({ value: 42, field: 'id' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(mockRegistry.execute).toHaveBeenCalledWith(
      mockDS,
      'validate',
      { value: 42, field: 'id' },
    );
  });

  test('POST /:id/validate-value returns valid:false', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/datasources/ds_test/validate-value')
      .send({ value: 999 });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  // --- Cache invalidation ---

  test('DELETE /:id/cache invalidates cache', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);

    const res = await request(app).delete('/api/v1/datasources/ds_test/cache');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cache invalidated');
    expect(mockRegistry.getExecutor).toHaveBeenCalledWith('SQL');
  });

  test('DELETE /:id/cache returns 404 for unknown DataSource', async () => {
    mockDSServiceV2.get.mockResolvedValue(null);

    const res = await request(app).delete('/api/v1/datasources/unknown/cache');

    expect(res.status).toBe(404);
  });

  // --- Error handling ---

  test('GET /:id/load returns 500 on executor error', async () => {
    mockDSServiceV2.get.mockResolvedValue(mockDS);
    mockRegistry.execute.mockRejectedValue(new Error('Connection failed'));

    const res = await request(app).get('/api/v1/datasources/ds_test/load');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Connection failed');
  });
});
