/**
 * Tests for DataSource configuration schema builders.
 */

const {
  DataSourceType,
  CacheStrategy,
  DataSourceOperation,
  BaseDataSourceBuilder,
  SQLDataSourceBuilder,
  APIDataSourceBuilder,
  KBDataSourceBuilder,
  FileDataSourceBuilder,
  CompositeDataSourceBuilder,
} = require('../datasource-config.schema');

// =============================================================================
// ENUM TESTS
// =============================================================================

describe('DataSource Enums', () => {
  test('DataSourceType has all 5 types', () => {
    expect(Object.keys(DataSourceType)).toEqual(['SQL', 'API', 'FILE', 'KB', 'COMPOSITE']);
  });

  test('CacheStrategy has all 4 strategies', () => {
    expect(Object.keys(CacheStrategy)).toEqual(['NONE', 'SESSION', 'TTL', 'STATIC']);
  });

  test('DataSourceOperation has all 5 operations', () => {
    expect(Object.keys(DataSourceOperation)).toEqual([
      'LOAD_ALL', 'SEARCH', 'GET_BY_ID', 'COUNT', 'VALIDATE',
    ]);
  });
});

// =============================================================================
// BASE BUILDER TESTS
// =============================================================================

describe('BaseDataSourceBuilder', () => {
  test('creates datasource with defaults', () => {
    const ds = new BaseDataSourceBuilder('TestSource').build();

    expect(ds.graphType).toBe('STRUCTURAL');
    expect(ds.graphSubType).toBe('datasource');
    expect(ds.graphDimension).toBe('DATA');
    expect(ds.name).toBe('TestSource');
    expect(ds.sourceType).toBe(DataSourceType.SQL);
    expect(ds.config.cacheStrategy).toBe(CacheStrategy.TTL);
    expect(ds.config.cacheTTL).toBe(3600);
    expect(ds.config.defaultLimit).toBe(100);
    expect(ds.config.maxLimit).toBe(1000);
    expect(ds.config.valueField).toBe('value');
    expect(ds.config.labelField).toBe('label');
  });

  test('fluent API sets all config fields', () => {
    const ds = new BaseDataSourceBuilder('Configured')
      .setDescription('My data source')
      .setOutputMapping('id', 'displayName', ['department', 'location'])
      .setCacheStrategy(CacheStrategy.SESSION, 1800)
      .setLimits(50, 500)
      .build();

    expect(ds.config.description).toBe('My data source');
    expect(ds.config.valueField).toBe('id');
    expect(ds.config.labelField).toBe('displayName');
    expect(ds.config.metadataFields).toEqual(['department', 'location']);
    expect(ds.config.cacheStrategy).toBe('session');
    expect(ds.config.cacheTTL).toBe(1800);
    expect(ds.config.defaultLimit).toBe(50);
    expect(ds.config.maxLimit).toBe(500);
  });

  test('graphId is generated with name prefix', () => {
    const ds = new BaseDataSourceBuilder('Users').build();
    expect(ds.graphId).toMatch(/^datasource_Users_\d+$/);
  });

  test('custom graphId is preserved', () => {
    const ds = new BaseDataSourceBuilder('Users', { graphId: 'custom-id' }).build();
    expect(ds.graphId).toBe('custom-id');
  });
});

// =============================================================================
// SQL DATASOURCE TESTS
// =============================================================================

describe('SQLDataSourceBuilder', () => {
  test('creates SQL datasource with defaults', () => {
    const ds = new SQLDataSourceBuilder('Employees').build();

    expect(ds.sourceType).toBe(DataSourceType.SQL);
    expect(ds.sqlConfig).toBeDefined();
    expect(ds.sqlConfig.connectionId).toBe('default');
    expect(ds.sqlConfig.query).toBe('');
    expect(ds.sqlConfig.parameterMapping).toEqual({});
  });

  test('fluent API configures SQL queries', () => {
    const ds = new SQLDataSourceBuilder('Departments')
      .setConnection('hr-db')
      .setQuery('SELECT id, name FROM departments WHERE active = 1')
      .setCountQuery('SELECT COUNT(*) as total FROM departments WHERE active = 1')
      .setSearchQuery(
        'SELECT id, name FROM departments WHERE name LIKE @search',
        'name'
      )
      .setParameterMapping({ orgUnit: 'org_unit_id' })
      .setOutputMapping('id', 'name')
      .build();

    expect(ds.sqlConfig.connectionId).toBe('hr-db');
    expect(ds.sqlConfig.query).toContain('SELECT id, name FROM departments');
    expect(ds.sqlConfig.countQuery).toContain('COUNT(*)');
    expect(ds.sqlConfig.searchQuery).toContain('@search');
    expect(ds.sqlConfig.searchField).toBe('name');
    expect(ds.sqlConfig.parameterMapping).toEqual({ orgUnit: 'org_unit_id' });
    expect(ds.config.valueField).toBe('id');
    expect(ds.config.labelField).toBe('name');
  });

  test('inherits base config', () => {
    const ds = new SQLDataSourceBuilder('Test', { namespace: 'HR' })
      .setCacheStrategy(CacheStrategy.STATIC)
      .build();

    expect(ds.namespace).toBe('HR');
    expect(ds.config.cacheStrategy).toBe('static');
    expect(ds.graphType).toBe('STRUCTURAL');
  });
});

// =============================================================================
// API DATASOURCE TESTS
// =============================================================================

describe('APIDataSourceBuilder', () => {
  test('creates API datasource with defaults', () => {
    const ds = new APIDataSourceBuilder('ExternalUsers').build();

    expect(ds.sourceType).toBe(DataSourceType.API);
    expect(ds.apiConfig).toBeDefined();
    expect(ds.apiConfig.method).toBe('GET');
    expect(ds.apiConfig.authType).toBe('none');
    expect(ds.apiConfig.responsePath).toBe('data');
  });

  test('fluent API configures endpoint and auth', () => {
    const ds = new APIDataSourceBuilder('Countries')
      .setEndpoint('https://api.example.com/countries', 'GET')
      .setHeaders({ 'Accept-Language': 'en' })
      .setQueryParams({ region: 'europe' })
      .setResponseMapping('results', 'totalCount')
      .setAuth('bearer', 'auth-config-1')
      .build();

    expect(ds.apiConfig.endpoint).toBe('https://api.example.com/countries');
    expect(ds.apiConfig.method).toBe('GET');
    expect(ds.apiConfig.headers['Accept-Language']).toBe('en');
    expect(ds.apiConfig.queryParams.region).toBe('europe');
    expect(ds.apiConfig.responsePath).toBe('results');
    expect(ds.apiConfig.totalPath).toBe('totalCount');
    expect(ds.apiConfig.authType).toBe('bearer');
    expect(ds.apiConfig.authConfigId).toBe('auth-config-1');
  });

  test('POST with body template', () => {
    const ds = new APIDataSourceBuilder('GraphQL')
      .setEndpoint('https://api.example.com/graphql', 'POST')
      .setBodyTemplate({ query: '{ users { id name } }' })
      .setResponseMapping('data.users')
      .build();

    expect(ds.apiConfig.method).toBe('POST');
    expect(ds.apiConfig.bodyTemplate).toEqual({ query: '{ users { id name } }' });
    expect(ds.apiConfig.responsePath).toBe('data.users');
  });
});

// =============================================================================
// KB DATASOURCE TESTS
// =============================================================================

describe('KBDataSourceBuilder', () => {
  test('creates KB datasource with cypher defaults', () => {
    const ds = new KBDataSourceBuilder('GraphNodes').build();

    expect(ds.sourceType).toBe(DataSourceType.KB);
    expect(ds.kbConfig).toBeDefined();
    expect(ds.kbConfig.queryType).toBe('cypher');
    expect(ds.kbConfig.similarityThreshold).toBe(0.7);
  });

  test('configures cypher queries', () => {
    const ds = new KBDataSourceBuilder('CatalogEntries')
      .setCypherQuery('MATCH (c:CatalogEntry) RETURN c.entryId AS value, c.name AS label')
      .setCypherSearchQuery(
        'MATCH (c:CatalogEntry) WHERE c.name CONTAINS $search RETURN c.entryId AS value, c.name AS label'
      )
      .setNamespace('CORE')
      .build();

    expect(ds.kbConfig.queryType).toBe('cypher');
    expect(ds.kbConfig.cypherQuery).toContain('CatalogEntry');
    expect(ds.kbConfig.cypherSearchQuery).toContain('$search');
    expect(ds.kbConfig.namespace).toBe('CORE');
  });

  test('configures vector search', () => {
    const ds = new KBDataSourceBuilder('SemanticSearch')
      .setVectorSearch('documents', 0.8)
      .setEmbeddingModel('bge-base-en-v1.5')
      .build();

    expect(ds.kbConfig.queryType).toBe('vector');
    expect(ds.kbConfig.collection).toBe('documents');
    expect(ds.kbConfig.similarityThreshold).toBe(0.8);
    expect(ds.kbConfig.embeddingModel).toBe('bge-base-en-v1.5');
  });
});

// =============================================================================
// FILE DATASOURCE TESTS
// =============================================================================

describe('FileDataSourceBuilder', () => {
  test('creates File datasource with defaults', () => {
    const ds = new FileDataSourceBuilder('StaticList').build();

    expect(ds.sourceType).toBe(DataSourceType.FILE);
    expect(ds.fileConfig).toBeDefined();
    expect(ds.fileConfig.format).toBe('json');
    expect(ds.fileConfig.encoding).toBe('utf-8');
    expect(ds.fileConfig.watchFile).toBe(false);
  });

  test('configures CSV file', () => {
    const ds = new FileDataSourceBuilder('CsvImport')
      .setFilePath('/data/countries.csv', 'csv')
      .setCsvOptions(';', true)
      .setEncoding('utf-16')
      .setWatchFile(true)
      .build();

    expect(ds.fileConfig.filePath).toBe('/data/countries.csv');
    expect(ds.fileConfig.format).toBe('csv');
    expect(ds.fileConfig.delimiter).toBe(';');
    expect(ds.fileConfig.hasHeader).toBe(true);
    expect(ds.fileConfig.encoding).toBe('utf-16');
    expect(ds.fileConfig.watchFile).toBe(true);
  });

  test('configures JSON file', () => {
    const ds = new FileDataSourceBuilder('JsonData')
      .setFilePath('/config/options.json', 'json')
      .setCacheStrategy(CacheStrategy.STATIC)
      .build();

    expect(ds.fileConfig.format).toBe('json');
    expect(ds.config.cacheStrategy).toBe('static');
  });
});

// =============================================================================
// COMPOSITE DATASOURCE TESTS
// =============================================================================

describe('CompositeDataSourceBuilder', () => {
  test('creates Composite datasource with defaults', () => {
    const ds = new CompositeDataSourceBuilder('MergedUsers').build();

    expect(ds.sourceType).toBe(DataSourceType.COMPOSITE);
    expect(ds.compositeConfig).toBeDefined();
    expect(ds.compositeConfig.sources).toEqual([]);
    expect(ds.compositeConfig.mergeStrategy).toBe('union');
  });

  test('adds multiple sources with roles', () => {
    const ds = new CompositeDataSourceBuilder('EnrichedEmployees')
      .addSource('datasource_hr_employees', 'primary')
      .addSource('datasource_ad_users', 'enrichment', 'email')
      .addSource('datasource_badge_system', 'enrichment', 'employeeId')
      .setMergeStrategy('enrich')
      .build();

    expect(ds.compositeConfig.sources).toHaveLength(3);
    expect(ds.compositeConfig.sources[0]).toEqual({
      dataSourceId: 'datasource_hr_employees',
      role: 'primary',
      joinField: null,
    });
    expect(ds.compositeConfig.sources[1]).toEqual({
      dataSourceId: 'datasource_ad_users',
      role: 'enrichment',
      joinField: 'email',
    });
    expect(ds.compositeConfig.mergeStrategy).toBe('enrich');
  });

  test('join strategy with two sources', () => {
    const ds = new CompositeDataSourceBuilder('JoinedData')
      .addSource('ds_users', 'primary')
      .addSource('ds_departments', 'secondary', 'departmentId')
      .setMergeStrategy('join')
      .build();

    expect(ds.compositeConfig.mergeStrategy).toBe('join');
    expect(ds.compositeConfig.sources).toHaveLength(2);
  });
});

// =============================================================================
// INTEGRATION: REAL-WORLD SCENARIOS
// =============================================================================

describe('Real-world DataSource scenarios', () => {
  test('UN Duty Stations dropdown from SQL', () => {
    const ds = new SQLDataSourceBuilder('DutyStations', {
      namespace: 'CORE',
      graphId: 'datasource_duty_stations',
    })
      .setConnection('hr-db')
      .setQuery('SELECT station_id, station_name, country_code FROM duty_stations WHERE active = 1 ORDER BY station_name')
      .setSearchQuery(
        'SELECT station_id, station_name, country_code FROM duty_stations WHERE station_name LIKE @search ORDER BY station_name',
        'station_name'
      )
      .setOutputMapping('station_id', 'station_name', ['country_code'])
      .setCacheStrategy(CacheStrategy.TTL, 86400) // 24h -- rarely changes
      .build();

    expect(ds.graphId).toBe('datasource_duty_stations');
    expect(ds.sourceType).toBe('SQL');
    expect(ds.config.valueField).toBe('station_id');
    expect(ds.config.labelField).toBe('station_name');
    expect(ds.config.metadataFields).toEqual(['country_code']);
    expect(ds.config.cacheTTL).toBe(86400);
    expect(ds.sqlConfig.connectionId).toBe('hr-db');
  });

  test('Knowledge graph catalog entries from Memgraph', () => {
    const ds = new KBDataSourceBuilder('GraphCatalog', {
      graphId: 'datasource_graph_catalog',
    })
      .setCypherQuery(
        'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition) ' +
        'RETURN c.entryId AS value, c.name AS label, g.graphType AS graphType'
      )
      .setOutputMapping('value', 'label', ['graphType'])
      .setCacheStrategy(CacheStrategy.SESSION)
      .build();

    expect(ds.sourceType).toBe('KB');
    expect(ds.kbConfig.queryType).toBe('cypher');
    expect(ds.kbConfig.cypherQuery).toContain('CatalogEntry');
    expect(ds.config.cacheStrategy).toBe('session');
  });

  test('Composite: HR employees enriched with AD data', () => {
    const ds = new CompositeDataSourceBuilder('FullEmployeeProfile', {
      graphId: 'datasource_full_employee',
    })
      .addSource('datasource_hr_employees', 'primary')
      .addSource('datasource_ad_users', 'enrichment', 'email')
      .setMergeStrategy('enrich')
      .setCacheStrategy(CacheStrategy.TTL, 3600)
      .build();

    expect(ds.sourceType).toBe('COMPOSITE');
    expect(ds.compositeConfig.sources).toHaveLength(2);
    expect(ds.compositeConfig.mergeStrategy).toBe('enrich');
  });
});
