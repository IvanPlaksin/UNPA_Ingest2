/**
 * Tests for KBDataSourceExecutor (Cypher + Vector).
 */

const { KBDataSourceExecutor } = require('../kb-datasource.executor');
const { KBDataSourceBuilder, CacheStrategy } = require('../../schemas/datasource-config.schema');

// =============================================================================
// MOCK HELPERS
// =============================================================================

function createMockMemgraph(results = []) {
  return {
    runQuery: jest.fn(async () => results),
  };
}

function createMockQdrant() {
  return {
    scroll: jest.fn(async () => ({ points: [] })),
    search: jest.fn(async () => []),
    retrieve: jest.fn(async () => []),
    getCollection: jest.fn(async () => ({ points_count: 0 })),
  };
}

function createMockEmbedder() {
  return {
    embed: jest.fn(async () => [0.1, 0.2, 0.3]),
  };
}

function createMockLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// =============================================================================
// CYPHER TESTS
// =============================================================================

describe('KBDataSourceExecutor — Cypher', () => {
  let executor;
  let mockMemgraph;

  beforeEach(() => {
    mockMemgraph = createMockMemgraph();
    executor = new KBDataSourceExecutor({
      memgraph: mockMemgraph,
      logger: createMockLogger(),
    });
  });

  // --- loadAll Cypher ---

  test('loadAll dispatches to Cypher by default', async () => {
    mockMemgraph.runQuery
      .mockResolvedValueOnce([{ value: 'e1', label: 'Entry 1' }]) // main query
      .mockResolvedValueOnce([{ total: 5 }]); // count

    const config = new KBDataSourceBuilder('Entries', { graphId: 'ds_entries' })
      .setCypherQuery('MATCH (c:CatalogEntry) RETURN c.entryId AS value, c.name AS label')
      .setOutputMapping('value', 'label')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    const result = await executor.loadAll(config);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ value: 'e1', label: 'Entry 1' });
    expect(result.total).toBe(5);
    expect(result.cached).toBe(false);
    expect(mockMemgraph.runQuery).toHaveBeenCalledTimes(2);
  });

  test('loadAll appends SKIP/LIMIT when not present', async () => {
    mockMemgraph.runQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const config = new KBDataSourceBuilder('NoPage', { graphId: 'ds_np' })
      .setCypherQuery('MATCH (n) RETURN n')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await executor.loadAll(config, { limit: 10, offset: 5 });

    const queryCalled = mockMemgraph.runQuery.mock.calls[0][0];
    expect(queryCalled).toContain('SKIP $offset');
    expect(queryCalled).toContain('LIMIT $limit');
  });

  test('loadAll throws without cypherQuery', async () => {
    const config = new KBDataSourceBuilder('NoCypher', { graphId: 'ds_nc' })
      .setCacheStrategy(CacheStrategy.NONE)
      .build();
    // cypherQuery is empty by default

    await expect(executor.loadAll(config)).rejects.toThrow('cypherQuery is required');
  });

  test('loadAll throws without memgraph', async () => {
    const noMgExecutor = new KBDataSourceExecutor({ logger: createMockLogger() });
    const config = new KBDataSourceBuilder('X', { graphId: 'x' })
      .setCypherQuery('MATCH (n) RETURN n')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await expect(noMgExecutor.loadAll(config)).rejects.toThrow('Memgraph service not configured');
  });

  // --- search Cypher ---

  test('search dispatches Cypher search query', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([
      { value: 'e1', label: 'Geneva' },
    ]);

    const config = new KBDataSourceBuilder('SearchTest', { graphId: 'ds_search' })
      .setCypherQuery('MATCH (n) RETURN n')
      .setCypherSearchQuery(
        'MATCH (c:CatalogEntry) WHERE c.name =~ $searchPattern RETURN c.entryId AS value, c.name AS label LIMIT $limit'
      )
      .setOutputMapping('value', 'label')
      .build();

    const result = await executor.search(config, { query: 'Gen', limit: 5 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Geneva');
    const params = mockMemgraph.runQuery.mock.calls[0][1];
    expect(params.searchPattern).toContain('Gen');
  });

  test('search returns empty for empty query', async () => {
    const config = new KBDataSourceBuilder('EmptySearch', { graphId: 'ds_es' }).build();
    const result = await executor.search(config, { query: '' });
    expect(result.items).toEqual([]);
  });

  test('search auto-generates query when cypherSearchQuery not set', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([]);

    const config = new KBDataSourceBuilder('AutoSearch', { graphId: 'ds_as' })
      .setCypherQuery('MATCH (n) RETURN n')
      .build();
    // No cypherSearchQuery set

    await executor.search(config, { query: 'test' });

    const queryCalled = mockMemgraph.runQuery.mock.calls[0][0];
    expect(queryCalled).toContain('=~ $searchPattern');
  });

  test('search escapes regex special characters', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([]);

    const config = new KBDataSourceBuilder('Regex', { graphId: 'ds_rx' })
      .setCypherQuery('MATCH (n) RETURN n')
      .build();

    await executor.search(config, { query: 'test.query+more' });

    const params = mockMemgraph.runQuery.mock.calls[0][1];
    expect(params.searchPattern).toContain('test\\.query\\+more');
  });

  // --- getById Cypher ---

  test('getById returns single item', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([
      { value: 'abc', label: 'Found It' },
    ]);

    const config = new KBDataSourceBuilder('GetById', { graphId: 'ds_gbi' })
      .setOutputMapping('value', 'label')
      .build();

    const result = await executor.getById(config, { id: 'abc' });
    expect(result).toEqual({ value: 'abc', label: 'Found It' });
  });

  test('getById returns null when not found', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([]);

    const config = new KBDataSourceBuilder('GetByIdNull', { graphId: 'ds_gbn' }).build();
    const result = await executor.getById(config, { id: 'nope' });
    expect(result).toBeNull();
  });

  test('getById throws without id', async () => {
    const config = new KBDataSourceBuilder('NoId', { graphId: 'ds_nid' }).build();
    await expect(executor.getById(config, {})).rejects.toThrow('id is required');
  });

  // --- count Cypher ---

  test('count uses cypherCountQuery when provided', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([{ total: 42 }]);

    const config = new KBDataSourceBuilder('Count', { graphId: 'ds_cnt' })
      .setCypherQuery('MATCH (n) RETURN n')
      .build();
    config.kbConfig.cypherCountQuery = 'MATCH (n:CatalogEntry) RETURN count(n) as total';

    const result = await executor.count(config);
    expect(result).toBe(42);
  });

  test('count auto-generates from cypherQuery', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([{ total: 7 }]);

    const config = new KBDataSourceBuilder('CountAuto', { graphId: 'ds_ca' })
      .setCypherQuery('MATCH (n:Entity) RETURN n.id AS value, n.name AS label')
      .build();

    const result = await executor.count(config);
    expect(result).toBe(7);

    const queryCalled = mockMemgraph.runQuery.mock.calls[0][0];
    expect(queryCalled).toContain('count(*)');
    expect(queryCalled).not.toContain('n.id AS value');
  });

  // --- validate Cypher ---

  test('validate returns true when value exists', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([{ value: 'x' }]);

    const config = new KBDataSourceBuilder('ValTrue', { graphId: 'ds_vt' }).build();
    const result = await executor.validate(config, { value: 'x' });
    expect(result).toBe(true);
  });

  test('validate returns false when not found', async () => {
    mockMemgraph.runQuery.mockResolvedValueOnce([]);

    const config = new KBDataSourceBuilder('ValFalse', { graphId: 'ds_vf' }).build();
    const result = await executor.validate(config, { value: 'missing' });
    expect(result).toBe(false);
  });

  test('validate throws without value', async () => {
    const config = new KBDataSourceBuilder('NoVal', { graphId: 'ds_nv' }).build();
    await expect(executor.validate(config, {})).rejects.toThrow('value is required');
  });

  // --- Unsupported queryType ---

  test('loadAll throws for unsupported queryType', async () => {
    const config = new KBDataSourceBuilder('Bad', { graphId: 'ds_bad' }).build();
    config.kbConfig.queryType = 'graphql';

    await expect(executor.loadAll(config)).rejects.toThrow('Unsupported KB queryType');
  });

  test('search throws for unsupported queryType', async () => {
    const config = new KBDataSourceBuilder('Bad2', { graphId: 'ds_bad2' }).build();
    config.kbConfig.queryType = 'graphql';

    await expect(executor.search(config, { query: 'x' })).rejects.toThrow('Unsupported KB queryType');
  });
});

// =============================================================================
// VECTOR (QDRANT) TESTS
// =============================================================================

describe('KBDataSourceExecutor — Vector', () => {
  let executor;
  let mockQdrant;
  let mockEmbedder;

  beforeEach(() => {
    mockQdrant = createMockQdrant();
    mockEmbedder = createMockEmbedder();
    executor = new KBDataSourceExecutor({
      qdrant: mockQdrant,
      embedder: mockEmbedder,
      logger: createMockLogger(),
    });
  });

  // --- loadAll Vector ---

  test('loadAll scrolls Qdrant collection', async () => {
    mockQdrant.scroll.mockResolvedValueOnce({
      points: [
        { id: 'p1', payload: { value: 'v1', label: 'Doc 1' } },
        { id: 'p2', payload: { value: 'v2', label: 'Doc 2' } },
      ],
    });
    mockQdrant.getCollection.mockResolvedValueOnce({ points_count: 10 });

    const config = new KBDataSourceBuilder('VecAll', { graphId: 'ds_va' })
      .setVectorSearch('documents', 0.7)
      .setOutputMapping('value', 'label')
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    const result = await executor.loadAll(config);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(10);
    expect(mockQdrant.scroll).toHaveBeenCalledWith('documents', expect.objectContaining({
      with_payload: true, with_vector: false,
    }));
  });

  test('loadAll throws without collection', async () => {
    const config = new KBDataSourceBuilder('NoColl', { graphId: 'ds_noc' })
      .setVectorSearch('', 0.7)
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await expect(executor.loadAll(config)).rejects.toThrow('collection is required');
  });

  test('loadAll throws without qdrant', async () => {
    const noQdrantExec = new KBDataSourceExecutor({ logger: createMockLogger() });
    const config = new KBDataSourceBuilder('NoQ', { graphId: 'ds_noq' })
      .setVectorSearch('docs', 0.7)
      .setCacheStrategy(CacheStrategy.NONE)
      .build();

    await expect(noQdrantExec.loadAll(config)).rejects.toThrow('Qdrant client not configured');
  });

  // --- search Vector ---

  test('search embeds query and searches Qdrant', async () => {
    mockEmbedder.embed.mockResolvedValueOnce([0.5, 0.6, 0.7]);
    mockQdrant.search.mockResolvedValueOnce([
      { id: 'p1', score: 0.95, payload: { value: 'v1', label: 'Similar Doc' } },
    ]);

    const config = new KBDataSourceBuilder('VecSearch', { graphId: 'ds_vs' })
      .setVectorSearch('documents', 0.8)
      .setOutputMapping('value', 'label')
      .build();

    const result = await executor.search(config, { query: 'test query', limit: 5 });

    expect(mockEmbedder.embed).toHaveBeenCalledWith('test query');
    expect(mockQdrant.search).toHaveBeenCalledWith('documents', expect.objectContaining({
      vector: [0.5, 0.6, 0.7],
      score_threshold: 0.8,
      limit: 5,
    }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].label).toBe('Similar Doc');
  });

  test('search returns empty for empty query (vector)', async () => {
    const config = new KBDataSourceBuilder('EmptyVec', { graphId: 'ds_ev' })
      .setVectorSearch('docs', 0.7)
      .build();

    const result = await executor.search(config, { query: '' });
    expect(result.items).toEqual([]);
  });

  test('search throws without embedder', async () => {
    const noEmbExec = new KBDataSourceExecutor({
      qdrant: mockQdrant,
      logger: createMockLogger(),
    });
    const config = new KBDataSourceBuilder('NoEmb', { graphId: 'ds_ne' })
      .setVectorSearch('docs', 0.7)
      .build();

    await expect(noEmbExec.search(config, { query: 'test' })).rejects.toThrow('Embedder service not configured');
  });

  test('search throws without collection', async () => {
    const config = new KBDataSourceBuilder('NoCollSearch', { graphId: 'ds_ncs' })
      .setVectorSearch('', 0.7)
      .build();

    await expect(executor.search(config, { query: 'test' })).rejects.toThrow('collection is required');
  });

  // --- getById Vector ---

  test('getById retrieves point from Qdrant', async () => {
    mockQdrant.retrieve.mockResolvedValueOnce([
      { id: 'p1', payload: { value: 'v1', label: 'Found' } },
    ]);

    const config = new KBDataSourceBuilder('VecGetById', { graphId: 'ds_vgbi' })
      .setVectorSearch('docs', 0.7)
      .setOutputMapping('value', 'label')
      .build();

    const result = await executor.getById(config, { id: 'p1' });
    expect(result.label).toBe('Found');
    expect(mockQdrant.retrieve).toHaveBeenCalledWith('docs', expect.objectContaining({
      ids: ['p1'],
    }));
  });

  test('getById returns null when point not found', async () => {
    mockQdrant.retrieve.mockResolvedValueOnce([]);

    const config = new KBDataSourceBuilder('VecNotFound', { graphId: 'ds_vnf' })
      .setVectorSearch('docs', 0.7)
      .build();

    const result = await executor.getById(config, { id: 'missing' });
    expect(result).toBeNull();
  });

  test('getById returns null on "not found" error', async () => {
    mockQdrant.retrieve.mockRejectedValueOnce(new Error('Point not found'));

    const config = new KBDataSourceBuilder('VecErr', { graphId: 'ds_ve' })
      .setVectorSearch('docs', 0.7)
      .build();

    const result = await executor.getById(config, { id: 'bad' });
    expect(result).toBeNull();
  });

  // --- count Vector ---

  test('count returns points_count from collection info', async () => {
    mockQdrant.getCollection.mockResolvedValueOnce({ points_count: 42 });

    const config = new KBDataSourceBuilder('VecCount', { graphId: 'ds_vc' })
      .setVectorSearch('documents', 0.7)
      .build();

    const result = await executor.count(config);
    expect(result).toBe(42);
    expect(mockQdrant.getCollection).toHaveBeenCalledWith('documents');
  });

  test('count throws without collection', async () => {
    const config = new KBDataSourceBuilder('NoCollCount', { graphId: 'ds_ncc' })
      .setVectorSearch('', 0.7)
      .build();

    await expect(executor.count(config)).rejects.toThrow('collection is required');
  });

  // --- validate Vector ---

  test('validate returns true when point exists', async () => {
    mockQdrant.retrieve.mockResolvedValueOnce([
      { id: 'p1', payload: { value: 'v1' } },
    ]);

    const config = new KBDataSourceBuilder('VecVal', { graphId: 'ds_vv' })
      .setVectorSearch('docs', 0.7)
      .build();

    const result = await executor.validate(config, { value: 'p1' });
    expect(result).toBe(true);
  });

  test('validate returns false when point not found', async () => {
    mockQdrant.retrieve.mockResolvedValueOnce([]);

    const config = new KBDataSourceBuilder('VecValF', { graphId: 'ds_vvf' })
      .setVectorSearch('docs', 0.7)
      .build();

    const result = await executor.validate(config, { value: 'missing' });
    expect(result).toBe(false);
  });
});

// =============================================================================
// FLUENT SETTERS
// =============================================================================

describe('KBDataSourceExecutor — Setters', () => {
  test('setMemgraph returns this', () => {
    const exec = new KBDataSourceExecutor();
    expect(exec.setMemgraph({})).toBe(exec);
  });

  test('setQdrant returns this', () => {
    const exec = new KBDataSourceExecutor();
    expect(exec.setQdrant({})).toBe(exec);
  });

  test('setEmbedder returns this', () => {
    const exec = new KBDataSourceExecutor();
    expect(exec.setEmbedder({})).toBe(exec);
  });
});
