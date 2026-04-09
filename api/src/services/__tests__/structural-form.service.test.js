/**
 * Tests for StructuralFormService.
 */

const { StructuralFormService } = require('../structural-form.service');
const { StructuralGraphBuilder, FieldDataType } = require('../../schemas/structural-graph.schema');
const { ConstraintGraphBuilder } = require('../../schemas/constraint-graph.schema');

// ── Test data ──────────────────────────────────────────────────────────────

const testStructural = new StructuralGraphBuilder('TestForm')
  .addField('name', FieldDataType.STRING, { label: { en: 'Full Name', fr: 'Nom complet' }, required: true })
  .addField('email', FieldDataType.EMAIL, { label: { en: 'Email' } })
  .addField('age', FieldDataType.INTEGER)
  .addEnum('role', ['user', 'admin'], { label: { en: 'Role' } })
  .build();

const testConstraint = new ConstraintGraphBuilder('TestConstraints', testStructural.graphId)
  .required('name')
  .required('email')
  .minLength('name', 2)
  .range('age', 18, 120)
  .visibleIf('role', { name: 'admin' })
  .computed('greeting', 'name + " hello"')
  .build();

// ── Mock Memgraph ──────────────────────────────────────────────────────────

function createMockMemgraph(graphs = {}) {
  return {
    runQuery: jest.fn(async (cypher, params) => {
      const graphId = params?.graphId || params?.structuralGraphId;

      // Auto-find CONSTRAINT query
      if (cypher.includes('CONSTRAINS')) {
        const constraintGraph = Object.values(graphs).find(g => g.graphType === 'CONSTRAINT');
        if (!constraintGraph) return [];
        return [{
          graphId: constraintGraph.graphId,
          graphType: constraintGraph.graphType,
          nodes: JSON.stringify(constraintGraph.nodes),
          edges: JSON.stringify(constraintGraph.edges),
          structuralGraphId: constraintGraph.structuralGraphId,
        }];
      }

      const graph = graphs[graphId];
      if (!graph) return [];
      return [{
        graphId: graph.graphId,
        graphType: graph.graphType,
        graphSubType: graph.graphSubType || null,
        graphDimension: graph.graphDimension || null,
        nodes: JSON.stringify(graph.nodes),
        edges: JSON.stringify(graph.edges),
        structuralGraphId: graph.structuralGraphId || null,
      }];
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('StructuralFormService', () => {
  let service;
  let mockMemgraph;

  beforeEach(() => {
    mockMemgraph = createMockMemgraph({
      [testStructural.graphId]: testStructural,
      [testConstraint.graphId]: testConstraint,
    });
    service = new StructuralFormService(mockMemgraph);
  });

  describe('getFormSpecification', () => {
    test('returns spec for STRUCTURAL node', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.jsonSchema).toBeDefined();
      expect(spec.jsonSchema.type).toBe('object');
      expect(spec.jsonSchema.properties.name).toBeDefined();
      expect(spec.jsonSchema.properties.email).toBeDefined();
    });

    test('applies CONSTRAINT required fields', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.jsonSchema.required).toContain('name');
      expect(spec.jsonSchema.required).toContain('email');
    });

    test('applies CONSTRAINT length rules', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.jsonSchema.properties.name.minLength).toBe(2);
    });

    test('applies CONSTRAINT range rules', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.jsonSchema.properties.age.minimum).toBe(18);
      expect(spec.jsonSchema.properties.age.maximum).toBe(120);
    });

    test('includes visibility rules', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.visibilityRules.role).toBeDefined();
      expect(spec.visibilityRules.role.type).toBe('visibility');
    });

    test('includes computed fields', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.computedFields.greeting).toBeDefined();
      expect(spec.computedFields.greeting.expression).toBe('name + " hello"');
      expect(spec.computedFields.greeting.dependencies).toContain('name');
    });

    test('includes Zod schema string', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.zodSchema).toContain('z.object');
      expect(spec.zodSchema).toContain('name');
    });

    test('includes field order', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.fieldOrder).toContain('name');
      expect(spec.fieldOrder).toContain('email');
      expect(spec.fieldOrder).toContain('age');
      expect(spec.fieldOrder).toContain('role');
    });

    test('includes metadata', async () => {
      const spec = await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      expect(spec.meta.structuralGraphId).toBe(testStructural.graphId);
      expect(spec.meta.constraintGraphId).toBe(testConstraint.graphId);
      expect(spec.meta.locale).toBe('en');
      expect(spec.meta.generatedAt).toBeDefined();
    });
  });

  describe('legacy fallback', () => {
    test('returns legacy form for parameterSchema', async () => {
      const parameterSchema = {
        type: 'object',
        properties: {
          userInput: { type: 'string' },
          count: { type: 'integer' },
        },
      };

      const spec = await service.getFormSpecification({ parameterSchema });

      expect(spec.meta.legacy).toBe(true);
      expect(spec.jsonSchema).toEqual(parameterSchema);
      expect(spec.fieldOrder).toEqual(['userInput', 'count']);
      expect(spec.zodSchema).toBeNull();
    });

    test('throws for node without any schema', async () => {
      await expect(service.getFormSpecification({}))
        .rejects.toThrow('neither structuralGraphId nor parameterSchema');
    });
  });

  describe('caching', () => {
    test('caches compiled specs', async () => {
      await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      // Reset call count
      mockMemgraph.runQuery.mockClear();

      await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      // Should not call Memgraph again
      expect(mockMemgraph.runQuery).not.toHaveBeenCalled();
    });

    test('clearCache removes cached entry', async () => {
      await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      service.clearCache(testStructural.graphId);

      mockMemgraph.runQuery.mockClear();

      await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      // Should call Memgraph again after cache clear
      expect(mockMemgraph.runQuery).toHaveBeenCalled();
    });

    test('clearAllCache removes all entries', async () => {
      await service.getFormSpecification({
        structuralGraphId: testStructural.graphId,
        constraintGraphId: testConstraint.graphId,
      });

      service.clearAllCache();
      expect(service._cache.size).toBe(0);
    });
  });

  describe('error handling', () => {
    test('throws if STRUCTURAL graph not found', async () => {
      const emptyMock = createMockMemgraph({});
      const svc = new StructuralFormService(emptyMock);

      await expect(svc.getFormSpecification({
        structuralGraphId: 'nonexistent',
      })).rejects.toThrow('STRUCTURAL graph not found');
    });

    test('throws if graph is not STRUCTURAL type', async () => {
      const wrongType = { ...testStructural, graphType: 'EXECUTABLE' };
      const wrongMock = createMockMemgraph({ [wrongType.graphId]: wrongType });
      const svc = new StructuralFormService(wrongMock);

      await expect(svc.getFormSpecification({
        structuralGraphId: wrongType.graphId,
      })).rejects.toThrow('not STRUCTURAL');
    });

    test('works without CONSTRAINT graph', async () => {
      const noCstrMock = createMockMemgraph({ [testStructural.graphId]: testStructural });
      const svc = new StructuralFormService(noCstrMock);

      const spec = await svc.getFormSpecification({
        structuralGraphId: testStructural.graphId,
      });

      // Should still work — just without constraints
      expect(spec.jsonSchema).toBeDefined();
      expect(spec.zodSchema).toBeNull();
      expect(spec.visibilityRules).toEqual({});
    });
  });

  describe('i18n', () => {
    test('respects locale parameter', async () => {
      const specFr = await service.getFormSpecification(
        { structuralGraphId: testStructural.graphId, constraintGraphId: testConstraint.graphId },
        { locale: 'fr' }
      );

      expect(specFr.meta.locale).toBe('fr');
      expect(specFr.jsonSchema.properties.name.title).toBe('Nom complet');
    });
  });
});

// =============================================================================
// DATASOURCE RESOLUTION TESTS
// =============================================================================

describe('StructuralFormService — DataSource Resolution', () => {
  // Build STRUCTURAL graph with DataSource fields
  const dsStructural = new StructuralGraphBuilder('DSForm', { graphId: 'struct_ds_form' })
    .addField('requestorName', FieldDataType.STRING, { required: true })
    .addDataSourceField('dutyStation', 'ds_stations', {
      label: { en: 'Duty Station' },
      required: true,
    })
    .addDataSourceField('beneficiary', 'ds_staff', {
      label: { en: 'Beneficiary' },
      searchable: true,
      dataSourceOptions: { minSearchLength: 3 },
    })
    .addCascadingField('city', 'ds_cities', 'dutyStation', 'stationCode', {
      label: { en: 'City' },
    })
    .build();

  // Mock DataSource configs
  const mockDSConfigs = {
    ds_stations: {
      graphId: 'ds_stations',
      sourceType: 'SQL',
      config: { valueField: 'station_id', labelField: 'station_name', maxLimit: 500 },
    },
    ds_staff: {
      graphId: 'ds_staff',
      sourceType: 'SQL',
      config: { valueField: 'staff_id', labelField: 'display_name' },
    },
    ds_cities: {
      graphId: 'ds_cities',
      sourceType: 'SQL',
      config: { valueField: 'city_id', labelField: 'city_name' },
    },
  };

  function createDSMockMemgraph() {
    return {
      runQuery: jest.fn(async (cypher, params) => {
        if (cypher.includes('CONSTRAINS')) return [];
        const graphId = params?.graphId || params?.structuralGraphId;
        if (graphId === dsStructural.graphId) {
          return [{
            graphId: dsStructural.graphId,
            graphType: 'STRUCTURAL',
            graphSubType: null,
            graphDimension: 'DATA',
            nodes: JSON.stringify(dsStructural.nodes),
            edges: JSON.stringify(dsStructural.edges),
            structuralGraphId: null,
          }];
        }
        return [];
      }),
    };
  }

  function createMockDSService() {
    return {
      get: jest.fn(async (graphId) => mockDSConfigs[graphId] || null),
    };
  }

  function createMockRegistry() {
    return {
      execute: jest.fn(async () => ({
        items: [
          { value: 'UNHQ', label: 'UN Headquarters' },
          { value: 'UNOG', label: 'UN Geneva' },
        ],
        total: 2,
        cached: false,
      })),
    };
  }

  let service;
  let mockDSService;

  beforeEach(() => {
    mockDSService = createMockDSService();
    service = new StructuralFormService(createDSMockMemgraph(), {
      dataSourceService: mockDSService,
    });
  });

  // --- _resolveDataSources ---

  test('_resolveDataSources finds all fields with DataSource bindings', async () => {
    const result = await service._resolveDataSources(dsStructural);

    expect(Object.keys(result.dataSources)).toEqual(
      expect.arrayContaining(['dutyStation', 'beneficiary', 'city'])
    );
    // requestorName has no DataSource
    expect(result.dataSources.requestorName).toBeUndefined();
  });

  test('_resolveDataSources tracks cascading dependencies', async () => {
    const result = await service._resolveDataSources(dsStructural);

    expect(result.cascadingDependencies.city).toBeDefined();
    expect(result.cascadingDependencies.city.dependsOn).toBe('dutyStation');
    expect(result.cascadingDependencies.city.paramName).toBe('stationCode');
    expect(result.cascadingDependencies.city.dataSourceId).toBe('ds_cities');
  });

  test('_resolveDataSources handles missing DataSource gracefully', async () => {
    mockDSService.get.mockResolvedValue(null);

    const result = await service._resolveDataSources(dsStructural);

    expect(result.dataSources.dutyStation.type).toBe('error');
    expect(result.dataSources.dutyStation.error).toContain('not found');
  });

  // --- _resolveFieldDataSource ---

  test('resolves search-type DataSource', async () => {
    const binding = {
      dataSourceId: 'ds_staff',
      operation: 'search',
      minSearchLength: 3,
      debounceMs: 300,
    };

    const result = await service._resolveFieldDataSource('beneficiary', binding);

    expect(result.type).toBe('search');
    expect(result.dataSourceId).toBe('ds_staff');
    expect(result.endpoint).toContain('/search');
    expect(result.minSearchLength).toBe(3);
    expect(result.valueField).toBe('staff_id');
    expect(result.labelField).toBe('display_name');
  });

  test('resolves preloaded DataSource when preloadAll=true', async () => {
    // Need to mock the registry for preloading
    const { dataSourceRegistry } = require('../datasource-registry');
    const originalExecute = dataSourceRegistry.execute;
    dataSourceRegistry.execute = jest.fn(async () => ({
      items: [{ value: 'UNHQ', label: 'HQ' }],
      total: 1,
      cached: false,
    }));

    const binding = {
      dataSourceId: 'ds_stations',
      operation: 'loadAll',
    };

    const result = await service._resolveFieldDataSource('dutyStation', binding, { preloadAll: true });

    expect(result.type).toBe('preloaded');
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.valueField).toBe('station_id');

    dataSourceRegistry.execute = originalExecute;
  });

  test('resolves endpoint DataSource for cascading fields', async () => {
    const binding = {
      dataSourceId: 'ds_cities',
      operation: 'loadAll',
      dependsOn: { field: 'dutyStation', paramName: 'stationCode' },
    };

    const result = await service._resolveFieldDataSource('city', binding, { preloadAll: true });

    // Cascading fields always get endpoint, even with preloadAll
    expect(result.type).toBe('endpoint');
    expect(result.dependsOn).toEqual({ field: 'dutyStation', paramName: 'stationCode' });
  });

  test('resolves endpoint DataSource when preloadAll=false', async () => {
    const binding = {
      dataSourceId: 'ds_stations',
      operation: 'loadAll',
    };

    const result = await service._resolveFieldDataSource('dutyStation', binding, { preloadAll: false });

    expect(result.type).toBe('endpoint');
    expect(result.endpoint).toContain('/load');
  });

  test('falls back to endpoint when preload fails', async () => {
    const { dataSourceRegistry } = require('../datasource-registry');
    const originalExecute = dataSourceRegistry.execute;
    dataSourceRegistry.execute = jest.fn(async () => { throw new Error('Connection failed'); });

    const binding = {
      dataSourceId: 'ds_stations',
      operation: 'loadAll',
    };

    const result = await service._resolveFieldDataSource('dutyStation', binding, { preloadAll: true });

    expect(result.type).toBe('endpoint');
    expect(result.error).toBe('Connection failed');

    dataSourceRegistry.execute = originalExecute;
  });

  test('throws when DataSource not found', async () => {
    mockDSService.get.mockResolvedValue(null);

    await expect(
      service._resolveFieldDataSource('bad', { dataSourceId: 'nonexistent', operation: 'loadAll' })
    ).rejects.toThrow('DataSource not found');
  });

  // --- _mergeDataSourceConfig ---

  test('_mergeDataSourceConfig overrides valueField/labelField', () => {
    const dsConfig = {
      config: { valueField: 'id', labelField: 'name', maxLimit: 100 },
    };
    const binding = { valueField: 'code', labelField: 'display_name' };

    const merged = service._mergeDataSourceConfig(dsConfig, binding);

    expect(merged.config.valueField).toBe('code');
    expect(merged.config.labelField).toBe('display_name');
    expect(merged.config.maxLimit).toBe(100); // preserved
  });

  test('_mergeDataSourceConfig preserves defaults when no overrides', () => {
    const dsConfig = {
      config: { valueField: 'id', labelField: 'name' },
    };
    const binding = {};

    const merged = service._mergeDataSourceConfig(dsConfig, binding);

    expect(merged.config.valueField).toBe('id');
    expect(merged.config.labelField).toBe('name');
  });

  // --- getFormSpecification with DataSources ---

  test('getFormSpecification includes dataSources and cascading', async () => {
    const { dataSourceRegistry } = require('../datasource-registry');
    const originalExecute = dataSourceRegistry.execute;
    dataSourceRegistry.execute = jest.fn(async () => ({
      items: [{ value: 'v1', label: 'l1' }],
      total: 1,
      cached: false,
    }));

    const spec = await service.getFormSpecification({
      structuralGraphId: dsStructural.graphId,
    });

    expect(spec.dataSources).toBeDefined();
    expect(spec.cascadingDependencies).toBeDefined();
    expect(spec.dataSources.dutyStation).toBeDefined();
    expect(spec.dataSources.beneficiary).toBeDefined();
    expect(spec.dataSources.city).toBeDefined();

    dataSourceRegistry.execute = originalExecute;
  });

  test('getFormSpecification skips DS resolution when resolveDataSources=false', async () => {
    const spec = await service.getFormSpecification(
      { structuralGraphId: dsStructural.graphId },
      { resolveDataSources: false }
    );

    expect(spec.dataSources).toEqual({});
    expect(spec.cascadingDependencies).toEqual({});
    // DataSourceService.get should NOT have been called
    expect(mockDSService.get).not.toHaveBeenCalled();
  });

  test('getFormSpecification includes dataSources in formSpec even without CONSTRAINT', async () => {
    const { dataSourceRegistry } = require('../datasource-registry');
    const originalExecute = dataSourceRegistry.execute;
    dataSourceRegistry.execute = jest.fn(async () => ({
      items: [],
      total: 0,
      cached: false,
    }));

    const spec = await service.getFormSpecification({
      structuralGraphId: dsStructural.graphId,
    });

    expect(spec.jsonSchema).toBeDefined();
    expect(spec.dataSources.beneficiary.type).toBe('search');
    expect(spec.dataSources.city.type).toBe('endpoint');

    dataSourceRegistry.execute = originalExecute;
  });
});
