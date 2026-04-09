/**
 * Tests for DataSourceService (CRUD) and DataSourceRegistry (executor dispatch).
 */

const { DataSourceService } = require('../datasource.service');
const { DataSourceRegistry } = require('../datasource-registry');
const {
  DataSourceType,
  CacheStrategy,
  DataSourceOperation,
  SQLDataSourceBuilder,
  APIDataSourceBuilder,
  KBDataSourceBuilder,
  FileDataSourceBuilder,
  CompositeDataSourceBuilder,
} = require('../../schemas/datasource-config.schema');

// =============================================================================
// MOCK MEMGRAPH SERVICE
// =============================================================================

function createMockMemgraph() {
  const store = new Map();

  return {
    store,
    runQuery: jest.fn(async (cypher, params) => {
      // CREATE
      if (cypher.includes('CREATE')) {
        const node = { ...params };
        store.set(params.graphId, node);
        return [{ graphId: params.graphId }];
      }

      // DELETE
      if (cypher.includes('DELETE')) {
        const existed = store.has(params.graphId);
        store.delete(params.graphId);
        return [{ deleted: existed ? 1 : 0 }];
      }

      // COUNT for exists()
      if (cypher.includes('count(ds)')) {
        return [{ count: store.has(params.graphId) ? 1 : 0 }];
      }

      // SET (update) — must come before generic GET
      if (cypher.includes('SET')) {
        const node = store.get(params.graphId);
        if (!node) return [];
        Object.assign(node, params);
        return [{ graphId: params.graphId }];
      }

      // getForStructural - graph nodes lookup
      if (cypher.includes('graphId: $structuralGraphId')) {
        const node = store.get(params.structuralGraphId);
        if (!node) return [];
        return [{ nodesJson: node.nodesJson || '[]' }];
      }

      // IN query for referenced DataSources — must come before generic LIST
      if (cypher.includes('WHERE ds.graphId IN $ids')) {
        const items = (params.ids || [])
          .map(id => store.get(id))
          .filter(Boolean);
        return items.map(ds => ({ ds }));
      }

      // GET by graphId
      if (cypher.includes('graphId: $graphId') && cypher.includes('RETURN ds')) {
        const node = store.get(params.graphId);
        if (!node) return [];
        return [{ ds: node }];
      }

      // LIST / SEARCH — return all (generic, last)
      if (cypher.includes('MATCH (ds:DataSource)') && cypher.includes('RETURN ds')) {
        const items = Array.from(store.values())
          .filter(n => {
            if (params.namespace && n.namespace !== params.namespace) return false;
            if (params.sourceType && n.sourceType !== params.sourceType) return false;
            return true;
          });
        return items.map(ds => ({ ds }));
      }

      return [];
    }),
  };
}

// =============================================================================
// DATASOURCE SERVICE TESTS
// =============================================================================

describe('DataSourceService', () => {
  let service;
  let mockMemgraph;

  beforeEach(() => {
    mockMemgraph = createMockMemgraph();
    service = new DataSourceService(mockMemgraph);
  });

  // --- CREATE ---

  test('create() stores a SQL DataSource and returns graphId', async () => {
    const config = new SQLDataSourceBuilder('Employees', { graphId: 'ds_emp' })
      .setConnection('hr-db')
      .setQuery('SELECT * FROM employees')
      .build();

    const id = await service.create(config);

    expect(id).toBe('ds_emp');
    expect(mockMemgraph.runQuery).toHaveBeenCalledTimes(1);
    expect(mockMemgraph.store.has('ds_emp')).toBe(true);
  });

  test('create() rejects invalid sourceType', async () => {
    const config = { graphId: 'bad', name: 'Bad', namespace: 'CORE', sourceType: 'INVALID', config: {} };
    await expect(service.create(config)).rejects.toThrow('Invalid sourceType');
  });

  test('create() stores JSON-stringified configs', async () => {
    const config = new SQLDataSourceBuilder('Test', { graphId: 'ds_test' })
      .setQuery('SELECT 1')
      .build();

    await service.create(config);

    const call = mockMemgraph.runQuery.mock.calls[0];
    const params = call[1];
    expect(typeof params.config).toBe('string');
    expect(typeof params.sqlConfig).toBe('string');
    expect(params.apiConfig).toBeNull();
  });

  // --- GET ---

  test('get() returns parsed DataSource', async () => {
    const config = new APIDataSourceBuilder('Countries', { graphId: 'ds_countries' })
      .setEndpoint('https://api.example.com/countries')
      .build();

    await service.create(config);
    const result = await service.get('ds_countries');

    expect(result).not.toBeNull();
    expect(result.graphId).toBe('ds_countries');
    expect(result.sourceType).toBe('API');
  });

  test('get() returns null for non-existent ID', async () => {
    const result = await service.get('non_existent');
    expect(result).toBeNull();
  });

  // --- UPDATE ---

  test('update() modifies fields and returns updated object', async () => {
    const config = new SQLDataSourceBuilder('Deps', { graphId: 'ds_deps' }).build();
    await service.create(config);

    const updated = await service.update('ds_deps', { name: 'Departments' });
    expect(updated.name).toBe('Departments');
  });

  test('update() with no fields returns existing DataSource', async () => {
    const config = new SQLDataSourceBuilder('NoOp', { graphId: 'ds_noop' }).build();
    await service.create(config);

    const result = await service.update('ds_noop', {});
    expect(result.graphId).toBe('ds_noop');
    // runQuery called once for create + once for get (no SET query)
    expect(mockMemgraph.runQuery).toHaveBeenCalledTimes(2);
  });

  // --- DELETE ---

  test('delete() returns true for existing DataSource', async () => {
    const config = new SQLDataSourceBuilder('ToDelete', { graphId: 'ds_del' }).build();
    await service.create(config);

    const result = await service.delete('ds_del');
    expect(result).toBe(true);
  });

  test('delete() returns false for non-existent DataSource', async () => {
    const result = await service.delete('no_such_id');
    expect(result).toBe(false);
  });

  // --- EXISTS ---

  test('exists() returns true when DataSource exists', async () => {
    const config = new SQLDataSourceBuilder('Exists', { graphId: 'ds_exists' }).build();
    await service.create(config);

    expect(await service.exists('ds_exists')).toBe(true);
  });

  test('exists() returns false when DataSource does not exist', async () => {
    expect(await service.exists('no_such')).toBe(false);
  });

  // --- LIST ---

  test('list() returns all DataSources', async () => {
    await service.create(new SQLDataSourceBuilder('A', { graphId: 'ds_a', namespace: 'CORE' }).build());
    await service.create(new APIDataSourceBuilder('B', { graphId: 'ds_b', namespace: 'CORE' }).build());

    const result = await service.list();
    expect(result.length).toBe(2);
  });

  test('list() filters by namespace', async () => {
    await service.create(new SQLDataSourceBuilder('A', { graphId: 'ds_a', namespace: 'CORE' }).build());
    await service.create(new SQLDataSourceBuilder('B', { graphId: 'ds_b', namespace: 'HR' }).build());

    const result = await service.list('CORE');
    expect(result.length).toBe(1);
    expect(result[0].namespace).toBe('CORE');
  });

  test('list() filters by sourceType', async () => {
    await service.create(new SQLDataSourceBuilder('A', { graphId: 'ds_sql' }).build());
    await service.create(new APIDataSourceBuilder('B', { graphId: 'ds_api' }).build());

    const result = await service.list(null, { sourceType: 'SQL' });
    expect(result.length).toBe(1);
    expect(result[0].sourceType).toBe('SQL');
  });

  // --- getForStructural ---

  test('getForStructural() extracts referenced DataSource IDs from nodes JSON', async () => {
    // Create a DataSource
    await service.create(new SQLDataSourceBuilder('Stations', { graphId: 'ds_stations' }).build());

    // Create a mock structural graph with nodes referencing the DataSource
    mockMemgraph.store.set('structural_form_1', {
      graphId: 'structural_form_1',
      graphType: 'STRUCTURAL',
      nodesJson: JSON.stringify([
        { nodeId: 'n1', name: 'station', dataSource: { dataSourceId: 'ds_stations' } },
        { nodeId: 'n2', name: 'name' },
      ]),
    });

    const result = await service.getForStructural('structural_form_1');
    expect(result.length).toBe(1);
    expect(result[0].graphId).toBe('ds_stations');
  });

  test('getForStructural() returns empty for graph with no DataSource refs', async () => {
    mockMemgraph.store.set('structural_no_ds', {
      graphId: 'structural_no_ds',
      graphType: 'STRUCTURAL',
      nodesJson: JSON.stringify([
        { nodeId: 'n1', name: 'field1' },
      ]),
    });

    const result = await service.getForStructural('structural_no_ds');
    expect(result).toEqual([]);
  });

  // --- _parseDataSource ---

  test('_parseDataSource handles already-parsed objects', () => {
    const parsed = service._parseDataSource({
      graphId: 'test',
      name: 'Test',
      config: { valueField: 'id' }, // already an object, not stringified
      sqlConfig: null,
    });
    expect(parsed.config.valueField).toBe('id');
    expect(parsed.sqlConfig).toBeNull();
  });
});

// =============================================================================
// DATASOURCE REGISTRY TESTS
// =============================================================================

describe('DataSourceRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new DataSourceRegistry();
  });

  // --- REGISTER ---

  test('register() accepts valid executor', () => {
    const executor = {
      loadAll: jest.fn(),
      search: jest.fn(),
    };

    registry.register(DataSourceType.SQL, executor);
    expect(registry.hasExecutor(DataSourceType.SQL)).toBe(true);
  });

  test('register() rejects invalid sourceType', () => {
    expect(() => {
      registry.register('INVALID', { loadAll: jest.fn(), search: jest.fn() });
    }).toThrow('Invalid sourceType');
  });

  test('register() rejects executor without loadAll', () => {
    expect(() => {
      registry.register(DataSourceType.SQL, { search: jest.fn() });
    }).toThrow('must implement loadAll()');
  });

  test('register() rejects executor without search', () => {
    expect(() => {
      registry.register(DataSourceType.SQL, { loadAll: jest.fn() });
    }).toThrow('must implement search()');
  });

  // --- GET EXECUTOR ---

  test('getExecutor() returns registered executor', () => {
    const executor = { loadAll: jest.fn(), search: jest.fn() };
    registry.register(DataSourceType.API, executor);

    expect(registry.getExecutor(DataSourceType.API)).toBe(executor);
  });

  test('getExecutor() throws for unregistered type', () => {
    expect(() => registry.getExecutor(DataSourceType.SQL)).toThrow('No executor registered');
  });

  // --- HAS EXECUTOR ---

  test('hasExecutor() returns false for unregistered type', () => {
    expect(registry.hasExecutor(DataSourceType.FILE)).toBe(false);
  });

  // --- GET REGISTERED TYPES ---

  test('getRegisteredTypes() returns all registered types', () => {
    registry.register(DataSourceType.SQL, { loadAll: jest.fn(), search: jest.fn() });
    registry.register(DataSourceType.KB, { loadAll: jest.fn(), search: jest.fn() });

    const types = registry.getRegisteredTypes();
    expect(types).toEqual(['SQL', 'KB']);
  });

  // --- EXECUTE ---

  test('execute() dispatches loadAll to correct executor', async () => {
    const executor = {
      loadAll: jest.fn().mockResolvedValue([{ id: 1, name: 'A' }]),
      search: jest.fn(),
    };
    registry.register(DataSourceType.SQL, executor);

    const config = new SQLDataSourceBuilder('Test').build();
    const result = await registry.execute(config, DataSourceOperation.LOAD_ALL, { limit: 10 });

    expect(executor.loadAll).toHaveBeenCalledWith(config, { limit: 10 });
    expect(result).toEqual([{ id: 1, name: 'A' }]);
  });

  test('execute() dispatches search to correct executor', async () => {
    const executor = {
      loadAll: jest.fn(),
      search: jest.fn().mockResolvedValue([{ id: 2 }]),
    };
    registry.register(DataSourceType.API, executor);

    const config = new APIDataSourceBuilder('Test').build();
    const result = await registry.execute(config, DataSourceOperation.SEARCH, { query: 'test' });

    expect(executor.search).toHaveBeenCalledWith(config, { query: 'test' });
    expect(result).toEqual([{ id: 2 }]);
  });

  test('execute() throws for invalid operation', async () => {
    registry.register(DataSourceType.SQL, { loadAll: jest.fn(), search: jest.fn() });
    const config = new SQLDataSourceBuilder('Test').build();

    await expect(registry.execute(config, 'invalidOp')).rejects.toThrow('Invalid operation');
  });

  test('execute() throws for unsupported operation on executor', async () => {
    registry.register(DataSourceType.SQL, { loadAll: jest.fn(), search: jest.fn() });
    const config = new SQLDataSourceBuilder('Test').build();

    await expect(registry.execute(config, DataSourceOperation.GET_BY_ID)).rejects.toThrow('does not support getById');
  });

  test('execute() supports getById when executor implements it', async () => {
    const executor = {
      loadAll: jest.fn(),
      search: jest.fn(),
      getById: jest.fn().mockResolvedValue({ id: 42, name: 'Found' }),
    };
    registry.register(DataSourceType.KB, executor);

    const config = new KBDataSourceBuilder('Test').build();
    const result = await registry.execute(config, DataSourceOperation.GET_BY_ID, { id: 42 });

    expect(result).toEqual({ id: 42, name: 'Found' });
  });

  // --- FLUENT REGISTER ---

  test('register() returns registry for chaining', () => {
    const exec = { loadAll: jest.fn(), search: jest.fn() };
    const result = registry
      .register(DataSourceType.SQL, exec)
      .register(DataSourceType.API, exec);

    expect(result).toBe(registry);
    expect(registry.getRegisteredTypes()).toEqual(['SQL', 'API']);
  });
});
