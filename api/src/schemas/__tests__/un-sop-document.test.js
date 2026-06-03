/**
 * Tests for UN SOP Document schema builders and enum constants.
 */

const {
  UN_ISSUING_BODY,
  UN_DOCUMENT_TYPE,
  UN_DEONT_MODALITY,
  UN_REFERENCE_TYPE,
  buildUNRegulatoryDocumentSchema,
  buildUNDocumentSectionSchema,
  buildUNRoleAssignmentSchema,
  buildUNCrossReferenceSchema,
} = require('../un-sop-document.schema');

// =============================================================================
// ENUM TESTS
// =============================================================================

describe('UN SOP Enums', () => {
  test('UN_ISSUING_BODY has 11 bodies', () => {
    const keys = Object.keys(UN_ISSUING_BODY);
    expect(keys).toContain('SECRETARIAT');
    expect(keys).toContain('UNHCR');
    expect(keys).toContain('ILO');
    expect(keys).toContain('UNICC');
    expect(keys.length).toBe(11);
  });

  test('UN_DOCUMENT_TYPE has 8 types', () => {
    const keys = Object.keys(UN_DOCUMENT_TYPE);
    expect(keys).toContain('SGB_BULLETIN');
    expect(keys).toContain('ADMINISTRATIVE_INSTRUCTION');
    expect(keys).toContain('DIRECTIVE');
    expect(keys.length).toBe(8);
  });

  test('UN_DEONT_MODALITY has 6 modalities', () => {
    const keys = Object.keys(UN_DEONT_MODALITY);
    expect(keys).toContain('SHALL');
    expect(keys).toContain('MUST');
    expect(keys).toContain('IS_RESPONSIBLE_FOR');
    expect(keys).toContain('MUST_NOT');
    expect(keys.length).toBe(6);
  });

  test('UN_REFERENCE_TYPE has 4 types', () => {
    const keys = Object.keys(UN_REFERENCE_TYPE);
    expect(keys).toEqual(['SUPERSEDES', 'SUPPLEMENTS', 'IMPLEMENTS', 'RELATES_TO']);
  });

  test('enum values match keys (no typos)', () => {
    for (const [k, v] of Object.entries(UN_ISSUING_BODY)) {
      expect(k).toBe(v);
    }
    for (const [k, v] of Object.entries(UN_DOCUMENT_TYPE)) {
      expect(k).toBe(v);
    }
  });
});

// =============================================================================
// UN_REGULATORY_DOCUMENT SCHEMA TESTS
// =============================================================================

describe('buildUNRegulatoryDocumentSchema', () => {
  let schema;

  beforeAll(() => {
    schema = buildUNRegulatoryDocumentSchema();
  });

  test('produces a STRUCTURAL graph', () => {
    expect(schema.graphType).toBe('STRUCTURAL');
    expect(schema.graphDimension).toBe('DATA');
  });

  test('namespace is UN_SOP', () => {
    expect(schema.namespace).toBe('UN_SOP');
  });

  test('name is UN_REGULATORY_DOCUMENT', () => {
    expect(schema.name).toBe('UN_REGULATORY_DOCUMENT');
  });

  test('has required fields: documentSymbol, issuingBody, documentType, title, effectiveDate', () => {
    const fieldNames = schema.nodes.map(n => n.name);
    expect(fieldNames).toContain('documentSymbol');
    expect(fieldNames).toContain('issuingBody');
    expect(fieldNames).toContain('documentType');
    expect(fieldNames).toContain('title');
    expect(fieldNames).toContain('effectiveDate');
  });

  test('documentSymbol is marked required', () => {
    const node = schema.nodes.find(n => n.name === 'documentSymbol');
    expect(node).toBeDefined();
    expect(node.required).toBe(true);
  });

  test('effectiveDate is a DATE field', () => {
    const node = schema.nodes.find(n => n.name === 'effectiveDate');
    expect(node).toBeDefined();
    expect(node.dataType).toBe('date');
  });

  test('issuingBody is an ENUM node with 11 values', () => {
    const node = schema.nodes.find(n => n.name === 'issuingBody');
    expect(node).toBeDefined();
    expect(node.nodeType).toBe('ENUM');
    expect(node.enumValues.length).toBe(11);
    expect(node.enumValues).toContain('SECRETARIAT');
  });

  test('has edges connecting root to all fields', () => {
    const rootId = schema.nodes.find(n => n.nodeType === 'ROOT').nodeId;
    const rootEdges = schema.edges.filter(e => e.source === rootId);
    // ROOT should connect to at least 8 field nodes
    expect(rootEdges.length).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================
// UN_DOCUMENT_SECTION SCHEMA TESTS
// =============================================================================

describe('buildUNDocumentSectionSchema', () => {
  let schema;

  beforeAll(() => {
    schema = buildUNDocumentSectionSchema();
  });

  test('name is UN_DOCUMENT_SECTION', () => {
    expect(schema.name).toBe('UN_DOCUMENT_SECTION');
  });

  test('has sectionNumber and obligations fields', () => {
    const fieldNames = schema.nodes.map(n => n.name);
    expect(fieldNames).toContain('sectionNumber');
    expect(fieldNames).toContain('obligations');
  });

  test('sectionNumber is required', () => {
    const node = schema.nodes.find(n => n.name === 'sectionNumber');
    expect(node.required).toBe(true);
  });

  test('obligations is an ARRAY node', () => {
    const node = schema.nodes.find(n => n.name === 'obligations');
    expect(node).toBeDefined();
    expect(node.nodeType).toBe('ARRAY');
  });
});

// =============================================================================
// UN_ROLE_ASSIGNMENT SCHEMA TESTS
// =============================================================================

describe('buildUNRoleAssignmentSchema', () => {
  let schema;

  beforeAll(() => {
    schema = buildUNRoleAssignmentSchema();
  });

  test('name is UN_ROLE_ASSIGNMENT', () => {
    expect(schema.name).toBe('UN_ROLE_ASSIGNMENT');
  });

  test('has role and responsibilities fields', () => {
    const fieldNames = schema.nodes.map(n => n.name);
    expect(fieldNames).toContain('role');
    expect(fieldNames).toContain('responsibilities');
    expect(fieldNames).toContain('accountableTo');
  });

  test('role is required', () => {
    const node = schema.nodes.find(n => n.name === 'role');
    expect(node.required).toBe(true);
  });
});

// =============================================================================
// UN_CROSS_REFERENCE SCHEMA TESTS
// =============================================================================

describe('buildUNCrossReferenceSchema', () => {
  let schema;

  beforeAll(() => {
    schema = buildUNCrossReferenceSchema();
  });

  test('name is UN_CROSS_REFERENCE', () => {
    expect(schema.name).toBe('UN_CROSS_REFERENCE');
  });

  test('has referenceType as ENUM with 4 values', () => {
    const node = schema.nodes.find(n => n.name === 'referenceType');
    expect(node).toBeDefined();
    expect(node.nodeType).toBe('ENUM');
    expect(node.enumValues).toEqual(['SUPERSEDES', 'SUPPLEMENTS', 'IMPLEMENTS', 'RELATES_TO']);
  });

  test('sourceDocumentSymbol and targetDocumentSymbol are required', () => {
    const src = schema.nodes.find(n => n.name === 'sourceDocumentSymbol');
    const tgt = schema.nodes.find(n => n.name === 'targetDocumentSymbol');
    expect(src.required).toBe(true);
    expect(tgt.required).toBe(true);
  });
});
