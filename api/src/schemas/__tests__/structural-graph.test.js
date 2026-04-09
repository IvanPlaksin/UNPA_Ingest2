/**
 * Tests for STRUCTURAL graph schema and JSON Schema compiler.
 */

const { StructuralGraphBuilder, FieldDataType, StructuralNodeType } = require('../structural-graph.schema');
const { structuralToJsonSchema } = require('../../compilers/structural-to-jsonschema');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('StructuralGraphBuilder', () => {
  test('creates simple form with fields', () => {
    const graph = new StructuralGraphBuilder('ContactForm')
      .addField('firstName', FieldDataType.STRING, { label: { en: 'First Name' } })
      .addField('lastName', FieldDataType.STRING)
      .addField('email', FieldDataType.EMAIL)
      .addField('age', FieldDataType.INTEGER)
      .build();

    expect(graph.graphType).toBe('STRUCTURAL');
    expect(graph.graphDimension).toBe('DATA');
    expect(graph.nodes.length).toBe(5); // ROOT + 4 fields
    expect(graph.edges.length).toBe(4); // 4 CONTAINS edges
    expect(graph.nodes[0].nodeType).toBe(StructuralNodeType.ROOT);
  });

  test('creates enum field', () => {
    const graph = new StructuralGraphBuilder('RequestForm')
      .addEnum('priority', ['low', 'medium', 'high', 'critical'], {
        enumLabels: {
          low: { en: 'Low', fr: 'Bas' },
          high: { en: 'High', fr: 'Haut' },
        },
      })
      .build();

    const enumNode = graph.nodes.find(n => n.name === 'priority');
    expect(enumNode.nodeType).toBe(StructuralNodeType.ENUM);
    expect(enumNode.enumValues).toEqual(['low', 'medium', 'high', 'critical']);
  });

  test('creates nested object', () => {
    const graph = new StructuralGraphBuilder('UserProfile')
      .addField('name', FieldDataType.STRING)
      .addObject('address', obj => {
        obj.addField('street', FieldDataType.STRING)
           .addField('city', FieldDataType.STRING)
           .addField('zip', FieldDataType.STRING);
      })
      .build();

    expect(graph.nodes.length).toBe(6); // ROOT + name + address + 3 address fields
    expect(graph.edges.length).toBe(5); // ROOT→name, ROOT→address, address→3 fields
  });

  test('creates array field', () => {
    const graph = new StructuralGraphBuilder('TagsForm')
      .addArray('tags', FieldDataType.STRING, { minItems: 1, maxItems: 10 })
      .build();

    const arrayNode = graph.nodes.find(n => n.name === 'tags');
    expect(arrayNode.nodeType).toBe(StructuralNodeType.ARRAY);
    expect(arrayNode.minItems).toBe(1);
    expect(arrayNode.maxItems).toBe(10);
    // ROOT + array + item = 3 nodes
    expect(graph.nodes.length).toBe(3);
  });

  test('supports required fields', () => {
    const graph = new StructuralGraphBuilder('RequiredTest')
      .addField('name', FieldDataType.STRING, { required: true })
      .addField('nickname', FieldDataType.STRING, { required: false })
      .build();

    const nameNode = graph.nodes.find(n => n.name === 'name');
    const nickNode = graph.nodes.find(n => n.name === 'nickname');
    expect(nameNode.required).toBe(true);
    expect(nickNode.required).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPILER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('StructuralToJsonSchemaCompiler', () => {
  test('compiles simple form to valid JSON Schema', () => {
    const graph = new StructuralGraphBuilder('TestForm')
      .addField('name', FieldDataType.STRING)
      .addField('email', FieldDataType.EMAIL)
      .addField('count', FieldDataType.INTEGER)
      .addField('active', FieldDataType.BOOLEAN)
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.type).toBe('object');
    expect(schema.properties.name.type).toBe('string');
    expect(schema.properties.email.type).toBe('string');
    expect(schema.properties.email.format).toBe('email');
    expect(schema.properties.count.type).toBe('integer');
    expect(schema.properties.active.type).toBe('boolean');
  });

  test('compiles required fields', () => {
    const graph = new StructuralGraphBuilder('RequiredForm')
      .addField('name', FieldDataType.STRING, { required: true })
      .addField('age', FieldDataType.INTEGER, { required: true })
      .addField('bio', FieldDataType.TEXT)
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.required).toEqual(['name', 'age']);
    expect(schema.properties.bio).toBeDefined();
  });

  test('compiles enum correctly', () => {
    const graph = new StructuralGraphBuilder('EnumTest')
      .addEnum('status', ['draft', 'published', 'archived'])
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.properties.status.type).toBe('string');
    expect(schema.properties.status.enum).toEqual(['draft', 'published', 'archived']);
  });

  test('compiles nested object', () => {
    const graph = new StructuralGraphBuilder('NestedTest')
      .addField('name', FieldDataType.STRING)
      .addObject('address', obj => {
        obj.addField('street', FieldDataType.STRING)
           .addField('city', FieldDataType.STRING);
      })
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.properties.address.type).toBe('object');
    expect(schema.properties.address.properties.street.type).toBe('string');
    expect(schema.properties.address.properties.city.type).toBe('string');
  });

  test('compiles array with items', () => {
    const graph = new StructuralGraphBuilder('ArrayTest')
      .addArray('tags', FieldDataType.STRING, { minItems: 1, maxItems: 5 })
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.properties.tags.type).toBe('array');
    expect(schema.properties.tags.items.type).toBe('string');
    expect(schema.properties.tags.minItems).toBe(1);
    expect(schema.properties.tags.maxItems).toBe(5);
  });

  test('compiles date/time formats', () => {
    const graph = new StructuralGraphBuilder('DateTest')
      .addField('birthDate', FieldDataType.DATE)
      .addField('createdAt', FieldDataType.DATETIME)
      .addField('startTime', FieldDataType.TIME)
      .addField('website', FieldDataType.URL)
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.properties.birthDate.format).toBe('date');
    expect(schema.properties.createdAt.format).toBe('date-time');
    expect(schema.properties.startTime.format).toBe('time');
    expect(schema.properties.website.format).toBe('uri');
  });

  test('includes i18n title and description', () => {
    const graph = new StructuralGraphBuilder('I18nTest', { label: { en: 'Test Form', fr: 'Formulaire' } })
      .addField('name', FieldDataType.STRING, {
        label: { en: 'Full Name', fr: 'Nom complet' },
        description: { en: 'Enter your full name', fr: 'Entrez votre nom complet' },
      })
      .build();

    const schemaEn = structuralToJsonSchema.compile(graph, { locale: 'en' });
    expect(schemaEn.properties.name.title).toBe('Full Name');
    expect(schemaEn.properties.name.description).toBe('Enter your full name');

    const schemaFr = structuralToJsonSchema.compile(graph, { locale: 'fr' });
    expect(schemaFr.properties.name.title).toBe('Nom complet');
    expect(schemaFr.properties.name.description).toBe('Entrez votre nom complet');
  });

  test('throws on missing ROOT node', () => {
    expect(() => {
      structuralToJsonSchema.compile({ nodes: [], edges: [] });
    }).toThrow('ROOT node');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AJV VALIDATION INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('AJV Validation Integration', () => {
  let ajv;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
  });

  test('compiled schema validates correct data', () => {
    const graph = new StructuralGraphBuilder('ValidationTest')
      .addField('email', FieldDataType.EMAIL, { required: true })
      .addField('age', FieldDataType.INTEGER)
      .addField('active', FieldDataType.BOOLEAN)
      .build();

    const schema = structuralToJsonSchema.compile(graph);
    const validate = ajv.compile(schema);

    expect(validate({ email: 'test@example.com', age: 25, active: true })).toBe(true);
  });

  test('compiled schema rejects invalid email', () => {
    const graph = new StructuralGraphBuilder('EmailTest')
      .addField('email', FieldDataType.EMAIL)
      .build();

    const schema = structuralToJsonSchema.compile(graph);
    const validate = ajv.compile(schema);

    expect(validate({ email: 'not-an-email' })).toBe(false);
    expect(validate.errors[0].keyword).toBe('format');
  });

  test('compiled schema enforces required fields', () => {
    const graph = new StructuralGraphBuilder('RequiredTest')
      .addField('name', FieldDataType.STRING, { required: true })
      .addField('bio', FieldDataType.TEXT)
      .build();

    const schema = structuralToJsonSchema.compile(graph);
    const validate = ajv.compile(schema);

    expect(validate({ name: 'Alice' })).toBe(true);
    expect(validate({ bio: 'Some text' })).toBe(false); // missing required 'name'
  });

  test('compiled schema validates array bounds', () => {
    const graph = new StructuralGraphBuilder('ArrayBoundsTest')
      .addArray('items', FieldDataType.STRING, { minItems: 1, maxItems: 3 })
      .build();

    const schema = structuralToJsonSchema.compile(graph);
    const validate = ajv.compile(schema);

    expect(validate({ items: ['a'] })).toBe(true);
    expect(validate({ items: ['a', 'b', 'c'] })).toBe(true);
    expect(validate({ items: [] })).toBe(false);          // minItems
    expect(validate({ items: ['a', 'b', 'c', 'd'] })).toBe(false); // maxItems
  });

  test('compiled schema validates nested objects', () => {
    const graph = new StructuralGraphBuilder('NestedValidation')
      .addField('name', FieldDataType.STRING, { required: true })
      .addObject('address', obj => {
        obj.addField('city', FieldDataType.STRING, { required: true })
           .addField('zip', FieldDataType.STRING);
      })
      .build();

    const schema = structuralToJsonSchema.compile(graph);
    const validate = ajv.compile(schema);

    expect(validate({ name: 'Alice', address: { city: 'NY', zip: '10001' } })).toBe(true);
    expect(validate({ name: 'Alice', address: { zip: '10001' } })).toBe(false); // missing city
  });

  test('realistic UN service request form', () => {
    const graph = new StructuralGraphBuilder('ServiceRequestForm', { namespace: 'FLOWDESK' })
      .addField('requestorName', FieldDataType.STRING, { required: true, label: { en: 'Requestor Name' } })
      .addField('requestorEmail', FieldDataType.EMAIL, { required: true })
      .addEnum('serviceType', ['IT_Hardware', 'IT_Software', 'Facilities', 'HR_Access'], { required: true })
      .addEnum('priority', ['low', 'medium', 'high', 'critical'], { defaultValue: 'medium' })
      .addField('description', FieldDataType.TEXT, { required: true })
      .addField('requestDate', FieldDataType.DATE, { required: true })
      .addObject('deliveryAddress', obj => {
        obj.addField('building', FieldDataType.STRING, { required: true })
           .addField('floor', FieldDataType.INTEGER)
           .addField('room', FieldDataType.STRING);
      })
      .addArray('attachments', FieldDataType.FILE, { maxItems: 5 })
      .build();

    const schema = structuralToJsonSchema.compile(graph);
    const validate = ajv.compile(schema);

    // Valid request
    expect(validate({
      requestorName: 'John Doe',
      requestorEmail: 'john@un.org',
      serviceType: 'IT_Hardware',
      priority: 'medium',
      description: 'Need a new laptop',
      requestDate: '2026-03-30',
      deliveryAddress: { building: 'UN HQ', floor: 5, room: 'A-512' },
      attachments: ['spec-sheet.pdf'],
    })).toBe(true);

    // Invalid: missing required fields
    expect(validate({
      requestorName: 'John Doe',
    })).toBe(false);

    // Invalid: wrong enum value
    expect(validate({
      requestorName: 'John Doe',
      requestorEmail: 'john@un.org',
      serviceType: 'INVALID_TYPE',
      description: 'test',
      requestDate: '2026-03-30',
    })).toBe(false);
  });
});

// =============================================================================
// DATASOURCE BINDING TESTS
// =============================================================================

describe('DataSource Binding', () => {
  // --- Builder ---

  test('addField with dataSource stores normalized binding', () => {
    const graph = new StructuralGraphBuilder('DSField')
      .addField('station', FieldDataType.STRING, {
        dataSource: {
          dataSourceId: 'ds_stations',
          operation: 'loadAll',
        },
      })
      .build();

    const stationNode = graph.nodes.find(n => n.name === 'station');
    expect(stationNode.dataSource).toBeDefined();
    expect(stationNode.dataSource.dataSourceId).toBe('ds_stations');
    expect(stationNode.dataSource.operation).toBe('loadAll');
    expect(stationNode.dataSource.minSearchLength).toBe(2);
    expect(stationNode.dataSource.debounceMs).toBe(300);
    expect(stationNode.dataSource.dependsOn).toBeNull();
  });

  test('addField without dataSource has null dataSource', () => {
    const graph = new StructuralGraphBuilder('NoDS')
      .addField('name', FieldDataType.STRING)
      .build();

    const nameNode = graph.nodes.find(n => n.name === 'name');
    expect(nameNode.dataSource).toBeNull();
  });

  test('addField throws when dataSourceId is missing', () => {
    expect(() => {
      new StructuralGraphBuilder('BadDS')
        .addField('bad', FieldDataType.STRING, {
          dataSource: { operation: 'loadAll' }, // no dataSourceId
        });
    }).toThrow('dataSourceId is required');
  });

  test('_normalizeDataSourceBinding applies defaults', () => {
    const builder = new StructuralGraphBuilder('Defaults');
    const binding = builder._normalizeDataSourceBinding({
      dataSourceId: 'ds_test',
    });

    expect(binding.operation).toBe('loadAll');
    expect(binding.valueField).toBeNull();
    expect(binding.labelField).toBeNull();
    expect(binding.minSearchLength).toBe(2);
    expect(binding.debounceMs).toBe(300);
    expect(binding.dependsOn).toBeNull();
    expect(binding.staticFilters).toBeNull();
    expect(binding.showMetadata).toBe(false);
    expect(binding.metadataTemplate).toBeNull();
  });

  test('_normalizeDataSourceBinding preserves overrides', () => {
    const builder = new StructuralGraphBuilder('Overrides');
    const binding = builder._normalizeDataSourceBinding({
      dataSourceId: 'ds_custom',
      operation: 'search',
      valueField: 'code',
      labelField: 'display_name',
      minSearchLength: 3,
      debounceMs: 500,
      dependsOn: { field: 'country', paramName: 'countryCode' },
      staticFilters: { active: true },
      showMetadata: true,
      metadataTemplate: '${metadata.code} - ${label}',
    });

    expect(binding.operation).toBe('search');
    expect(binding.valueField).toBe('code');
    expect(binding.labelField).toBe('display_name');
    expect(binding.minSearchLength).toBe(3);
    expect(binding.debounceMs).toBe(500);
    expect(binding.dependsOn).toEqual({ field: 'country', paramName: 'countryCode' });
    expect(binding.staticFilters).toEqual({ active: true });
    expect(binding.showMetadata).toBe(true);
    expect(binding.metadataTemplate).toBe('${metadata.code} - ${label}');
  });

  // --- addDataSourceField ---

  test('addDataSourceField creates select field', () => {
    const graph = new StructuralGraphBuilder('DSSelect')
      .addDataSourceField('dutyStation', 'ds_duty_stations', {
        label: { en: 'Duty Station' },
        required: true,
      })
      .build();

    const node = graph.nodes.find(n => n.name === 'dutyStation');
    expect(node.dataType).toBe('string');
    expect(node.required).toBe(true);
    expect(node.dataSource.dataSourceId).toBe('ds_duty_stations');
    expect(node.dataSource.operation).toBe('loadAll');
    expect(node.uiHints.widget).toBe('select');
  });

  test('addDataSourceField creates autocomplete when searchable', () => {
    const graph = new StructuralGraphBuilder('DSAutocomplete')
      .addDataSourceField('beneficiary', 'ds_staff', {
        searchable: true,
        dataSourceOptions: { minSearchLength: 3 },
      })
      .build();

    const node = graph.nodes.find(n => n.name === 'beneficiary');
    expect(node.dataSource.operation).toBe('search');
    expect(node.dataSource.minSearchLength).toBe(3);
    expect(node.uiHints.widget).toBe('autocomplete');
  });

  // --- addCascadingField ---

  test('addCascadingField creates field with dependsOn', () => {
    const graph = new StructuralGraphBuilder('Cascading')
      .addDataSourceField('country', 'ds_countries')
      .addCascadingField('city', 'ds_cities', 'country', 'countryCode', {
        label: { en: 'City' },
      })
      .build();

    const cityNode = graph.nodes.find(n => n.name === 'city');
    expect(cityNode.dataSource.dataSourceId).toBe('ds_cities');
    expect(cityNode.dataSource.dependsOn).toEqual({
      field: 'country',
      paramName: 'countryCode',
    });
  });

  // --- Compiler x-dataSource ---

  test('compiler includes x-dataSource extension for DataSource fields', () => {
    const graph = new StructuralGraphBuilder('CompilerDS')
      .addDataSourceField('station', 'ds_stations', {
        label: { en: 'Station' },
      })
      .addField('name', FieldDataType.STRING)
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.properties.station['x-dataSource']).toBeDefined();
    expect(schema.properties.station['x-dataSource'].dataSourceId).toBe('ds_stations');
    expect(schema.properties.station['x-dataSource'].operation).toBe('loadAll');

    // Plain field should NOT have x-dataSource
    expect(schema.properties.name['x-dataSource']).toBeUndefined();
  });

  test('compiler includes dependsOn in x-dataSource', () => {
    const graph = new StructuralGraphBuilder('CompilerCascade')
      .addDataSourceField('country', 'ds_countries')
      .addCascadingField('city', 'ds_cities', 'country', 'countryCode')
      .build();

    const schema = structuralToJsonSchema.compile(graph);

    expect(schema.properties.city['x-dataSource'].dependsOn).toEqual({
      field: 'country',
      paramName: 'countryCode',
    });
  });

  // --- Real-world scenario ---

  test('UN service request with DataSource fields', () => {
    const graph = new StructuralGraphBuilder('ServiceRequest', { namespace: 'FLOWDESK' })
      .addField('requestorName', FieldDataType.STRING, { required: true })
      .addField('requestorEmail', FieldDataType.EMAIL, { required: true })
      .addDataSourceField('dutyStation', 'DS_UNDutyStations_v1', {
        label: { en: 'Duty Station' },
        required: true,
      })
      .addDataSourceField('beneficiary', 'DS_StaffDirectory_v1', {
        label: { en: 'Beneficiary' },
        searchable: true,
        dataSourceOptions: { minSearchLength: 2, debounceMs: 300 },
      })
      .addCascadingField('city', 'DS_Cities_v1', 'dutyStation', 'stationCode', {
        label: { en: 'City' },
      })
      .addField('description', FieldDataType.TEXT, { required: true })
      .build();

    expect(graph.nodes.length).toBe(7); // ROOT + 6 fields
    expect(graph.edges.length).toBe(6); // 6 CONTAINS

    const stationNode = graph.nodes.find(n => n.name === 'dutyStation');
    expect(stationNode.dataSource.dataSourceId).toBe('DS_UNDutyStations_v1');

    const beneficiaryNode = graph.nodes.find(n => n.name === 'beneficiary');
    expect(beneficiaryNode.dataSource.operation).toBe('search');

    const cityNode = graph.nodes.find(n => n.name === 'city');
    expect(cityNode.dataSource.dependsOn.field).toBe('dutyStation');

    // Compile and verify schema
    const schema = structuralToJsonSchema.compile(graph);
    expect(schema.properties.dutyStation['x-dataSource'].dataSourceId).toBe('DS_UNDutyStations_v1');
    expect(schema.properties.beneficiary['x-dataSource'].operation).toBe('search');
    expect(schema.properties.city['x-dataSource'].dependsOn.paramName).toBe('stationCode');
  });
});
