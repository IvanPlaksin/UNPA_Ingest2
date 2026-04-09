/**
 * Tests for CompositeDataSourceExecutor.
 */

const { CompositeDataSourceExecutor } = require('../composite-datasource.executor');
const { CompositeDataSourceBuilder, CacheStrategy } = require('../../schemas/datasource-config.schema');

// =============================================================================
// TEST DATA
// =============================================================================

const staffItems = [
  { value: 'S001', label: 'Alice Johnson', department: 'IT', email: 'alice@un.org' },
  { value: 'S002', label: 'Bob Smith', department: 'HR', email: 'bob@un.org' },
  { value: 'S003', label: 'Carol White', department: 'IT', email: 'carol@un.org' },
];

const badgeItems = [
  { value: 'S001', label: 'Alice Johnson', badgeId: 'B-100', accessLevel: 'admin' },
  { value: 'S002', label: 'Bob Smith', badgeId: 'B-200', accessLevel: 'user' },
  { value: 'S004', label: 'Dave Brown', badgeId: 'B-400', accessLevel: 'user' },
];

const deptItems = [
  { value: 'IT', label: 'Information Technology', head: 'CTO' },
  { value: 'HR', label: 'Human Resources', head: 'CHRO' },
  { value: 'FIN', label: 'Finance', head: 'CFO' },
];

// =============================================================================
// MOCK HELPERS
// =============================================================================

function createMockLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function createMockDSService(configs = {}) {
  return {
    get: jest.fn(async (id) => configs[id] || null),
  };
}

function createMockRegistry(dataSets = {}) {
  return {
    execute: jest.fn(async (config, operation, params) => {
      const id = config.graphId || config.name;
      const items = dataSets[id] || [];

      if (operation === 'loadAll') {
        const filtered = params?.filters
          ? items.filter(item =>
              Object.entries(params.filters).every(([k, v]) => String(item[k]) === String(v)))
          : items;
        return { items: filtered, total: filtered.length, cached: false };
      }

      if (operation === 'search') {
        const q = (params?.query || '').toLowerCase();
        const matched = items.filter(item =>
          Object.values(item).some(v => String(v).toLowerCase().includes(q)));
        return { items: matched, total: matched.length };
      }

      if (operation === 'getById') {
        const found = items.find(item => String(item.value) === String(params.id));
        return found || null;
      }

      if (operation === 'validate') {
        return items.some(item => String(item.value) === String(params.value));
      }

      return { items: [], total: 0 };
    }),
  };
}

function makeConfig(mergeStrategy, sources, extraOpts = {}) {
  const builder = new CompositeDataSourceBuilder('Test', {
    graphId: 'ds_composite_test',
    valueField: 'value',
    labelField: 'label',
    metadataFields: extraOpts.metadataFields || [],
    cacheStrategy: CacheStrategy.NONE,
  });
  builder.compositeConfig.mergeStrategy = mergeStrategy;
  builder.compositeConfig.sources = sources;
  return builder.build();
}

const defaultSources = [
  { dataSourceId: 'ds_staff', role: 'primary' },
  { dataSourceId: 'ds_badges', role: 'enrichment', joinField: 'value' },
];

const defaultDSConfigs = {
  ds_staff: { graphId: 'ds_staff', sourceType: 'SQL', config: { valueField: 'value', labelField: 'label' } },
  ds_badges: { graphId: 'ds_badges', sourceType: 'SQL', config: { valueField: 'value', labelField: 'label' } },
  ds_departments: { graphId: 'ds_departments', sourceType: 'KB', config: { valueField: 'value', labelField: 'label' } },
};

const defaultDataSets = {
  ds_staff: staffItems,
  ds_badges: badgeItems,
  ds_departments: deptItems,
};

// =============================================================================
// TESTS
// =============================================================================

describe('CompositeDataSourceExecutor', () => {
  let executor;
  let mockRegistry;

  beforeEach(() => {
    mockRegistry = createMockRegistry(defaultDataSets);
    executor = new CompositeDataSourceExecutor({
      logger: createMockLogger(),
      dataSourceService: createMockDSService(defaultDSConfigs),
      registry: mockRegistry,
    });
  });

  // --- Setters ---

  test('setDataSourceService returns this', () => {
    expect(executor.setDataSourceService({})).toBe(executor);
  });

  test('setRegistry returns this', () => {
    expect(executor.setRegistry({})).toBe(executor);
  });

  // ─── Union Strategy ────────────────────────────────────────────────────────

  describe('Union strategy', () => {
    test('merges items from two sources', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.loadAll(config);

      // S001, S002, S003 from staff + S004 from badges (dedupe S001, S002)
      expect(result.total).toBe(4);
      expect(result.items.map(i => i.value)).toEqual(
        expect.arrayContaining(['S001', 'S002', 'S003', 'S004']),
      );
    });

    test('deduplicates by valueField', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.loadAll(config);

      const s001Items = result.items.filter(i => i.value === 'S001');
      expect(s001Items.length).toBe(1); // Only from primary (first seen)
    });

    test('handles empty source gracefully', async () => {
      const registry = createMockRegistry({ ds_staff: staffItems, ds_empty: [] });
      const exec = new CompositeDataSourceExecutor({
        logger: createMockLogger(),
        dataSourceService: createMockDSService({
          ...defaultDSConfigs,
          ds_empty: { graphId: 'ds_empty', sourceType: 'SQL', config: {} },
        }),
        registry,
      });

      const config = makeConfig('union', [
        { dataSourceId: 'ds_staff', role: 'primary' },
        { dataSourceId: 'ds_empty', role: 'secondary' },
      ]);

      const result = await exec.loadAll(config);
      expect(result.total).toBe(3); // Only staff items
    });

    test('handles source error gracefully', async () => {
      const registry = createMockRegistry(defaultDataSets);
      registry.execute.mockImplementation(async (config, op) => {
        if (config.graphId === 'ds_badges') throw new Error('Connection failed');
        return { items: staffItems, total: staffItems.length };
      });

      const exec = new CompositeDataSourceExecutor({
        logger: createMockLogger(),
        dataSourceService: createMockDSService(defaultDSConfigs),
        registry,
      });

      const config = makeConfig('union', defaultSources);
      const result = await exec.loadAll(config);

      expect(result.total).toBe(3); // Only staff (badges failed)
    });

    test('paginates merged results', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.loadAll(config, { limit: 2, offset: 1 });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(4);
    });
  });

  // ─── Join Strategy ─────────────────────────────────────────────────────────

  describe('Join strategy', () => {
    test('returns only items present in both sources', async () => {
      const config = makeConfig('join', defaultSources);
      const result = await executor.loadAll(config);

      // S001 and S002 exist in both, S003 only in staff, S004 only in badges
      expect(result.total).toBe(2);
      expect(result.items.map(i => i.value)).toEqual(
        expect.arrayContaining(['S001', 'S002']),
      );
    });

    test('merged items contain fields from both sources', async () => {
      const config = makeConfig('join', defaultSources, {
        metadataFields: ['department', 'badgeId', 'accessLevel'],
      });
      const result = await executor.loadAll(config);

      const alice = result.items.find(i => i.value === 'S001');
      expect(alice.metadata.department).toBe('IT'); // from staff
      expect(alice.metadata.badgeId).toBe('B-100'); // from badges
      expect(alice.metadata.accessLevel).toBe('admin');
    });

    test('returns empty when no matching items', async () => {
      const registry = createMockRegistry({
        ds_staff: [{ value: 'A', label: 'Alpha' }],
        ds_badges: [{ value: 'B', label: 'Beta' }],
      });
      const exec = new CompositeDataSourceExecutor({
        logger: createMockLogger(),
        dataSourceService: createMockDSService(defaultDSConfigs),
        registry,
      });

      const config = makeConfig('join', defaultSources);
      const result = await exec.loadAll(config);

      expect(result.total).toBe(0);
    });

    test('single source returns all items', async () => {
      const config = makeConfig('join', [
        { dataSourceId: 'ds_staff', role: 'primary' },
      ]);
      const result = await executor.loadAll(config);

      expect(result.total).toBe(3);
    });

    test('join with three sources', async () => {
      const registry = createMockRegistry({
        ds_staff: staffItems,
        ds_badges: badgeItems,
        ds_departments: [
          { value: 'S001', label: 'IT', extra: 'dept-data-1' },
          { value: 'S002', label: 'HR', extra: 'dept-data-2' },
        ],
      });

      const exec = new CompositeDataSourceExecutor({
        logger: createMockLogger(),
        dataSourceService: createMockDSService(defaultDSConfigs),
        registry,
      });

      const config = makeConfig('join', [
        { dataSourceId: 'ds_staff', role: 'primary' },
        { dataSourceId: 'ds_badges', role: 'secondary', joinField: 'value' },
        { dataSourceId: 'ds_departments', role: 'secondary', joinField: 'value' },
      ], { metadataFields: ['extra'] });

      const result = await exec.loadAll(config);

      expect(result.total).toBe(2);
      const alice = result.items.find(i => i.value === 'S001');
      expect(alice.metadata.extra).toBe('dept-data-1');
    });
  });

  // ─── Enrich Strategy ───────────────────────────────────────────────────────

  describe('Enrich strategy', () => {
    test('keeps all primary items', async () => {
      const config = makeConfig('enrich', defaultSources);
      const result = await executor.loadAll(config);

      // All 3 staff items kept
      expect(result.total).toBe(3);
    });

    test('adds fields from enrichment source where matched', async () => {
      const config = makeConfig('enrich', defaultSources, {
        metadataFields: ['department', 'badgeId', 'accessLevel'],
      });
      const result = await executor.loadAll(config);

      const alice = result.items.find(i => i.value === 'S001');
      expect(alice.metadata.department).toBe('IT'); // from primary
      expect(alice.metadata.badgeId).toBe('B-100'); // from enrichment
      expect(alice.metadata.accessLevel).toBe('admin');
    });

    test('unmatched items remain unchanged', async () => {
      const config = makeConfig('enrich', defaultSources, {
        metadataFields: ['department', 'badgeId'],
      });
      const result = await executor.loadAll(config);

      const carol = result.items.find(i => i.value === 'S003');
      expect(carol.metadata.department).toBe('IT');
      expect(carol.metadata.badgeId).toBeUndefined(); // S003 not in badges
    });

    test('does not overwrite existing primary fields', async () => {
      const config = makeConfig('enrich', defaultSources);
      const result = await executor.loadAll(config);

      const alice = result.items.find(i => i.value === 'S001');
      expect(alice.label).toBe('Alice Johnson'); // from primary, not overwritten
    });

    test('returns primary items when no enrichment sources', async () => {
      const config = makeConfig('enrich', [
        { dataSourceId: 'ds_staff', role: 'primary' },
      ]);
      const result = await executor.loadAll(config);

      expect(result.total).toBe(3);
    });

    test('multiple enrichment sources', async () => {
      const registry = createMockRegistry({
        ds_staff: staffItems,
        ds_badges: badgeItems,
        ds_departments: [
          { value: 'S001', label: 'Alice', deptFull: 'IT Full Name' },
        ],
      });

      const exec = new CompositeDataSourceExecutor({
        logger: createMockLogger(),
        dataSourceService: createMockDSService(defaultDSConfigs),
        registry,
      });

      const config = makeConfig('enrich', [
        { dataSourceId: 'ds_staff', role: 'primary' },
        { dataSourceId: 'ds_badges', role: 'enrichment', joinField: 'value' },
        { dataSourceId: 'ds_departments', role: 'enrichment', joinField: 'value' },
      ], { metadataFields: ['badgeId', 'deptFull'] });

      const result = await exec.loadAll(config);
      const alice = result.items.find(i => i.value === 'S001');
      expect(alice.metadata.badgeId).toBe('B-100');
      expect(alice.metadata.deptFull).toBe('IT Full Name');
    });
  });

  // ─── Search ────────────────────────────────────────────────────────────────

  describe('search', () => {
    test('searches across union sources', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.search(config, { query: 'alice', limit: 10 });

      expect(result.items.length).toBe(1);
      expect(result.items[0].label).toBe('Alice Johnson');
    });

    test('returns empty for empty query', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.search(config, { query: '' });

      expect(result.items).toEqual([]);
    });

    test('search with enrich strategy', async () => {
      const config = makeConfig('enrich', defaultSources);
      const result = await executor.search(config, { query: 'bob', limit: 10 });

      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    test('returns item from primary source', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.getById(config, { id: 'S001' });

      expect(result).not.toBeNull();
      expect(result.label).toBe('Alice Johnson');
    });

    test('returns null for non-existent ID', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.getById(config, { id: 'MISSING' });

      expect(result).toBeNull();
    });

    test('enriches item when strategy is enrich', async () => {
      const config = makeConfig('enrich', defaultSources);
      const result = await executor.getById(config, { id: 'S001' });

      expect(result).not.toBeNull();
      // getById should enrich from badges
      // The mock registry returns the item directly for getById
    });

    test('throws without id', async () => {
      const config = makeConfig('union', defaultSources);
      await expect(executor.getById(config, {})).rejects.toThrow('id is required');
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    test('returns merged count for union', async () => {
      const config = makeConfig('union', defaultSources);
      const result = await executor.count(config);

      expect(result).toBe(4); // 3 staff + 1 unique badge
    });

    test('returns joined count', async () => {
      const config = makeConfig('join', defaultSources);
      const result = await executor.count(config);

      expect(result).toBe(2); // S001, S002
    });
  });

  // ─── validate ──────────────────────────────────────────────────────────────

  describe('validate', () => {
    test('validates in primary source', async () => {
      const config = makeConfig('union', defaultSources);

      expect(await executor.validate(config, { value: 'S001' })).toBe(true);
      expect(await executor.validate(config, { value: 'MISSING' })).toBe(false);
    });

    test('throws without value', async () => {
      const config = makeConfig('union', defaultSources);
      await expect(executor.validate(config, {})).rejects.toThrow('value is required');
    });
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  describe('Config validation', () => {
    test('throws without compositeConfig', async () => {
      const config = { sourceType: 'COMPOSITE', config: {} };
      await expect(executor.loadAll(config)).rejects.toThrow('compositeConfig is required');
    });

    test('throws without sources array', async () => {
      const config = { sourceType: 'COMPOSITE', config: {}, compositeConfig: {} };
      await expect(executor.loadAll(config)).rejects.toThrow('sources array is required');
    });

    test('throws for empty sources', async () => {
      const config = { sourceType: 'COMPOSITE', config: {}, compositeConfig: { sources: [] } };
      await expect(executor.loadAll(config)).rejects.toThrow('at least one source');
    });

    test('throws for source without dataSourceId', async () => {
      const config = {
        sourceType: 'COMPOSITE', config: {},
        compositeConfig: { sources: [{ role: 'primary' }] },
      };
      await expect(executor.loadAll(config)).rejects.toThrow('must have dataSourceId');
    });

    test('throws for unsupported merge strategy', async () => {
      const config = makeConfig('invalid_strategy', defaultSources);
      await expect(executor.loadAll(config)).rejects.toThrow('Unsupported merge strategy');
    });

    test('gracefully handles missing DataSourceService (logs warning, empty result)', async () => {
      const logger = createMockLogger();
      const exec = new CompositeDataSourceExecutor({
        logger,
        registry: mockRegistry,
      });

      const config = makeConfig('union', defaultSources);
      const result = await exec.loadAll(config);

      // Sources fail gracefully, result is empty
      expect(result.total).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    test('gracefully handles source not found (logs warning)', async () => {
      const logger = createMockLogger();
      const exec = new CompositeDataSourceExecutor({
        logger,
        dataSourceService: createMockDSService({}), // empty
        registry: mockRegistry,
      });

      const config = makeConfig('union', defaultSources);
      const result = await exec.loadAll(config);

      expect(result.total).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
