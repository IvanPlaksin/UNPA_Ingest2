'use strict';

const {
  SchemaRegistry,
  getSchemaRegistry,
  NAMESPACES,
  NODE_STATUS,
  CHANGE_TYPES,
  CATALOG_TYPES,
  REQUIRED_CORE_FIELDS,
} = require('../schema-registry');

describe('SchemaRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  test('should initialize with 8 built-in schemas', () => {
    const schemas = registry.listSchemas();
    expect(schemas).toHaveLength(17);
    expect(schemas).toContain('codex://schemas/base-node');
    expect(schemas).toContain('codex://schemas/provenance');
    expect(schemas).toContain('codex://schemas/node-version');
    expect(schemas).toContain('codex://schemas/edge-version');
    expect(schemas).toContain('codex://schemas/catalog-entry');
    expect(schemas).toContain('codex://schemas/graph-version');
    expect(schemas).toContain('codex://schemas/execution-record');
  });

  test('getSchemaRegistry returns singleton', () => {
    const a = getSchemaRegistry();
    const b = getSchemaRegistry();
    expect(a).toBe(b);
  });

  // -----------------------------------------------------------------------
  // BaseNode validation
  // -----------------------------------------------------------------------

  describe('BaseNode', () => {
    const validNode = {
      id: 'abc-123',
      createdAt: '2026-03-12T10:00:00.000Z',
      namespace: 'CORE',
    };

    test('accepts valid base node', () => {
      const { valid, errors } = registry.validateBaseNode(validNode);
      expect(valid).toBe(true);
      expect(errors).toBeNull();
    });

    test('rejects node without id', () => {
      const { valid } = registry.validateBaseNode({ createdAt: '2026-03-12T10:00:00.000Z', namespace: 'CORE' });
      expect(valid).toBe(false);
    });

    test('rejects node without createdAt', () => {
      const { valid } = registry.validateBaseNode({ id: 'x', namespace: 'CORE' });
      expect(valid).toBe(false);
    });

    test('rejects node without namespace', () => {
      const { valid } = registry.validateBaseNode({ id: 'x', createdAt: '2026-03-12T10:00:00.000Z' });
      expect(valid).toBe(false);
    });

    test('accepts node with extra properties (additionalProperties: true)', () => {
      const { valid } = registry.validateBaseNode({ ...validNode, customField: 42 });
      expect(valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Provenance validation
  // -----------------------------------------------------------------------

  describe('Provenance', () => {
    const validProvenance = {
      sourceType: 'llm',
      sourceId: 'claude-opus-4-6',
      confidence: 0.85,
    };

    test('accepts valid provenance', () => {
      const { valid } = registry.validateProvenance(validProvenance);
      expect(valid).toBe(true);
    });

    test('rejects invalid sourceType', () => {
      const { valid } = registry.validateProvenance({ ...validProvenance, sourceType: 'unknown' });
      expect(valid).toBe(false);
    });

    test('rejects confidence > 1', () => {
      const { valid } = registry.validateProvenance({ ...validProvenance, confidence: 1.5 });
      expect(valid).toBe(false);
    });

    test('rejects confidence < 0', () => {
      const { valid } = registry.validateProvenance({ ...validProvenance, confidence: -0.1 });
      expect(valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // NodeVersion validation
  // -----------------------------------------------------------------------

  describe('NodeVersion', () => {
    const hash64 = 'a'.repeat(64);
    const validNodeVersion = {
      versionId: 'v-001',
      entityId: 'e-001',
      namespace: 'CORE',
      sequenceNumber: 1,
      status: 'ACTIVE',
      ttStart: '2026-03-12T10:00:00.000Z',
      ttEnd: null,
      vtStart: '2026-03-12T10:00:00.000Z',
      vtEnd: null,
      previousVersionId: null,
      supersededById: null,
      mergedFromIds: [],
      splitIntoIds: [],
      changeType: 'CREATE',
      changeReason: 'Initial',
      changedBy: 'system',
      changeSource: 'importer',
      extractionCycleId: null,
      contentHash: hash64,
      previousHash: null,
      chainHash: hash64,
      signature: null,
      properties: {},
      nodeType: 'BusinessRule',
    };

    test('accepts valid NodeVersion', () => {
      const { valid, errors } = registry.validateNodeVersion(validNodeVersion);
      expect(valid).toBe(true);
      expect(errors).toBeNull();
    });

    test('rejects NodeVersion without contentHash', () => {
      const { valid } = registry.validateNodeVersion({ ...validNodeVersion, contentHash: undefined });
      expect(valid).toBe(false);
    });

    test('rejects contentHash shorter than 64 chars', () => {
      const { valid } = registry.validateNodeVersion({ ...validNodeVersion, contentHash: 'short' });
      expect(valid).toBe(false);
    });

    test('rejects invalid namespace enum', () => {
      const { valid } = registry.validateNodeVersion({ ...validNodeVersion, namespace: 'INVALID' });
      expect(valid).toBe(false);
    });

    test('rejects invalid status enum', () => {
      const { valid } = registry.validateNodeVersion({ ...validNodeVersion, status: 'INVALID' });
      expect(valid).toBe(false);
    });

    test('rejects additional properties (strict mode)', () => {
      const { valid } = registry.validateNodeVersion({ ...validNodeVersion, unknownField: 'x' });
      expect(valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // CatalogEntry validation
  // -----------------------------------------------------------------------

  describe('CatalogEntry', () => {
    const validEntry = {
      entryId: 'ce-001',
      name: 'SQL Extraction Pipeline',
      type: 'business',
      namespace: 'default',
      createdAt: '2026-03-12T10:00:00.000Z',
    };

    test('accepts valid catalog entry', () => {
      const { valid } = registry.validateCatalogEntry(validEntry);
      expect(valid).toBe(true);
    });

    test('rejects invalid type enum', () => {
      const { valid } = registry.validateCatalogEntry({ ...validEntry, type: 'invalid' });
      expect(valid).toBe(false);
    });

    test('rejects empty name', () => {
      const { valid } = registry.validateCatalogEntry({ ...validEntry, name: '' });
      expect(valid).toBe(false);
    });

    test('accepts optional fields', () => {
      const { valid } = registry.validateCatalogEntry({
        ...validEntry,
        description: 'A description',
        tags: ['sql', 'extraction'],
        visibility: 'PUBLIC',
        qualityScore: 0.95,
      });
      expect(valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // GraphVersion validation
  // -----------------------------------------------------------------------

  describe('GraphVersion', () => {
    const hash64 = 'b'.repeat(64);
    const validVersion = {
      versionId: 'gv-001',
      versionNumber: 1,
      createdAt: '2026-03-12T10:00:00.000Z',
      contentHash: hash64,
    };

    test('accepts valid graph version', () => {
      const { valid } = registry.validateGraphVersion(validVersion);
      expect(valid).toBe(true);
    });

    test('rejects versionNumber < 1', () => {
      const { valid } = registry.validateGraphVersion({ ...validVersion, versionNumber: 0 });
      expect(valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // ExecutionRecord validation
  // -----------------------------------------------------------------------

  describe('ExecutionRecord', () => {
    const validRecord = {
      executionId: 'exec-001',
      graphId: 'graph-001',
      status: 'COMPLETED',
      startedAt: '2026-03-12T10:00:00.000Z',
    };

    test('accepts valid execution record', () => {
      const { valid } = registry.validateExecutionRecord(validRecord);
      expect(valid).toBe(true);
    });

    test('rejects invalid status', () => {
      const { valid } = registry.validateExecutionRecord({ ...validRecord, status: 'RUNNING' });
      expect(valid).toBe(false);
    });
  });

  describe('ExecutionNodeRecord', () => {
    test('accepts valid execution node record', () => {
      const { valid } = registry.validateExecutionNodeRecord({
        id: 'ner-001',
        executionId: 'exec-001',
        nodeId: 'node-1',
        status: 'completed',
      });
      expect(valid).toBe(true);
    });

    test('rejects missing nodeId', () => {
      const { valid } = registry.validateExecutionNodeRecord({
        id: 'ner-001',
        executionId: 'exec-001',
        status: 'completed',
      });
      expect(valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Custom schema registration
  // -----------------------------------------------------------------------

  describe('Custom schema', () => {
    test('can register and validate custom schema', () => {
      registry.register({
        $id: 'codex://schemas/custom-test',
        type: 'object',
        required: ['foo'],
        properties: { foo: { type: 'string' } },
      });

      const { valid } = registry.validate('codex://schemas/custom-test', { foo: 'bar' });
      expect(valid).toBe(true);

      const { valid: invalid } = registry.validate('codex://schemas/custom-test', { foo: 123 });
      expect(invalid).toBe(false);
    });

    test('returns error for unknown schema', () => {
      const { valid, errors } = registry.validate('codex://schemas/nonexistent', {});
      expect(valid).toBe(false);
      expect(errors[0].message).toContain('Schema not found');
    });

    test('getSchema returns raw schema object', () => {
      const schema = registry.getSchema('codex://schemas/base-node');
      expect(schema).not.toBeNull();
      expect(schema.$id).toBe('codex://schemas/base-node');
    });

    test('getSchema returns null for unknown', () => {
      expect(registry.getSchema('codex://schemas/nope')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------

  describe('Constants', () => {
    test('NAMESPACES has 6 values', () => {
      expect(Object.keys(NAMESPACES)).toHaveLength(6);
    });

    test('NODE_STATUS has 6 values', () => {
      expect(Object.keys(NODE_STATUS)).toHaveLength(6);
    });

    test('CHANGE_TYPES has 6 values', () => {
      expect(Object.keys(CHANGE_TYPES)).toHaveLength(6);
    });

    test('CATALOG_TYPES has 5 values', () => {
      expect(Object.keys(CATALOG_TYPES)).toHaveLength(5);
    });

    test('REQUIRED_CORE_FIELDS.MANDATORY has id, createdAt, namespace', () => {
      expect(REQUIRED_CORE_FIELDS.MANDATORY).toEqual(['id', 'createdAt', 'namespace']);
    });
  });
});
