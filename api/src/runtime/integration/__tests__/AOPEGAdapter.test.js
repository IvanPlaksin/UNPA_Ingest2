/**
 * AOPEGAdapter Tests
 */

const { AOPEGAdapter, EXECUTOR_TO_TOOL_MAP, RuntimeErrorCodes } = require('../AOPEGAdapter');
const { GraphFormatConverter } = require('../GraphFormatConverter');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK PLUGIN REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

function createMockPluginRegistry() {
  const executors = new Map();

  return {
    executors,

    registerExecutor(executor) {
      executors.set(executor.type, executor);
    },

    getExecutor(type) {
      return executors.get(type);
    },

    hasExecutor(type) {
      return executors.has(type);
    },

    listExecutors() {
      return Array.from(executors.values()).map(e => ({
        type: e.type,
        displayName: e.displayName,
        domain: e.domain
      }));
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════

const mockSanitizeExecutor = {
  type: 'ingestion.sanitize',
  displayName: 'Sanitize Text',
  description: 'Clean and normalize text content',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      removeHtml: { type: 'boolean', default: true }
    },
    required: ['text']
  },
  execute: async (params, ctx) => ({
    success: true,
    output: {
      text: params.text.trim().toLowerCase(),
      charCount: params.text.length,
      sanitized: true
    },
    metadata: { processingTime: 10 },
    qualityScore: 0.95,
    errors: []
  }),
  validateParameters: (params) => ({
    valid: !!params.text,
    errors: params.text ? [] : ['text is required']
  }),
  getDefaultParameters: () => ({ text: '', removeHtml: true })
};

const mockExtractEntitiesExecutor = {
  type: 'ingestion.extract_entities',
  displayName: 'Extract Entities',
  description: 'Extract named entities from text',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      minConfidence: { type: 'number', default: 0.6 }
    }
  },
  execute: async (params, ctx) => ({
    success: true,
    output: {
      entities: [
        { name: 'Test Entity', type: 'ORGANIZATION', confidence: 0.85 }
      ],
      text: params.text
    },
    metadata: { entityCount: 1 },
    qualityScore: 0.85,
    errors: []
  }),
  validateParameters: () => ({ valid: true, errors: [] }),
  getDefaultParameters: () => ({ minConfidence: 0.6 })
};

const mockQualityCheckExecutor = {
  type: 'ingestion.quality_check',
  displayName: 'Quality Check',
  description: 'Check content quality',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      threshold: { type: 'number', default: 0.7 },
      failOnLow: { type: 'boolean', default: false }
    }
  },
  execute: async (params, ctx) => {
    if (params.failOnLow && params.score < params.threshold) {
      return {
        success: false,
        output: null,
        metadata: {},
        errors: [{
          code: 'QUALITY_LOW',
          message: `Quality ${params.score} below threshold ${params.threshold}`,
          recoverable: true
        }]
      };
    }
    return {
      success: true,
      output: { passed: true, score: params.score || 0.8 },
      metadata: {},
      qualityScore: params.score || 0.8,
      errors: []
    };
  },
  validateParameters: () => ({ valid: true, errors: [] }),
  getDefaultParameters: () => ({ threshold: 0.7, failOnLow: false })
};

const mockFatalErrorExecutor = {
  type: 'ingestion.fatal_fail',
  displayName: 'Fatal Fail',
  description: 'Always fails with non-recoverable error',
  domain: 'ingestion',
  parameterSchema: { type: 'object', properties: {} },
  execute: async () => ({
    success: false,
    output: null,
    metadata: {},
    errors: [{
      code: 'FATAL_ERROR',
      message: 'This is a fatal non-recoverable error',
      recoverable: false
    }]
  }),
  validateParameters: () => ({ valid: true, errors: [] }),
  getDefaultParameters: () => ({})
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - Construction', () => {
  test('requires pluginRegistry', () => {
    expect(() => new AOPEGAdapter()).toThrow('requires a pluginRegistry');
    expect(() => new AOPEGAdapter(null)).toThrow('requires a pluginRegistry');
  });

  test('accepts valid pluginRegistry', () => {
    const registry = createMockPluginRegistry();
    const adapter = new AOPEGAdapter(registry);
    expect(adapter).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: TYPE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - Type Mapping', () => {
  let adapter;

  beforeEach(() => {
    adapter = new AOPEGAdapter(createMockPluginRegistry());
  });

  test('maps known executor types to tool IDs', () => {
    expect(adapter.mapExecutorTypeToToolId('ingestion.sanitize')).toBe('text.sanitize');
    expect(adapter.mapExecutorTypeToToolId('ingestion.chunk_text')).toBe('text.chunk');
    expect(adapter.mapExecutorTypeToToolId('ingestion.extract_entities')).toBe('extraction.entities');
    expect(adapter.mapExecutorTypeToToolId('ingestion.write_graph')).toBe('graph.create_node');
  });

  test('returns executor type as-is for unknown types', () => {
    expect(adapter.mapExecutorTypeToToolId('custom.my_executor')).toBe('custom.my_executor');
    expect(adapter.mapExecutorTypeToToolId('unknown_type')).toBe('unknown_type');
  });

  test('reverse maps tool IDs to executor types', () => {
    expect(adapter.mapToolIdToExecutorType('text.sanitize')).toBe('ingestion.sanitize');
    expect(adapter.mapToolIdToExecutorType('extraction.entities')).toBe('ingestion.extract_entities');
  });

  test('returns tool ID as-is for unknown reverse mapping', () => {
    expect(adapter.mapToolIdToExecutorType('custom.tool')).toBe('custom.tool');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: WRAP EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - wrapExecutor', () => {
  let registry;
  let adapter;

  beforeEach(() => {
    registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);
    registry.registerExecutor(mockExtractEntitiesExecutor);
    adapter = new AOPEGAdapter(registry);
  });

  test('returns null for unknown executor', () => {
    const wrapped = adapter.wrapExecutor('unknown.executor');
    expect(wrapped).toBeNull();
  });

  test('creates wrapped executor with correct properties', () => {
    const wrapped = adapter.wrapExecutor('ingestion.sanitize');

    expect(wrapped).not.toBeNull();
    expect(wrapped.toolId).toBe('text.sanitize');
    expect(wrapped.executorType).toBe('ingestion.sanitize');
    expect(wrapped.displayName).toBe('Sanitize Text');
    expect(wrapped.description).toBe('Clean and normalize text content');
    expect(wrapped.domain).toBe('ingestion');
    expect(wrapped.inputSchema).toEqual(mockSanitizeExecutor.parameterSchema);
    expect(typeof wrapped.execute).toBe('function');
    expect(typeof wrapped.validateParameters).toBe('function');
    expect(typeof wrapped.getDefaultParameters).toBe('function');
  });

  test('caches wrapped executors', () => {
    const wrapped1 = adapter.wrapExecutor('ingestion.sanitize');
    const wrapped2 = adapter.wrapExecutor('ingestion.sanitize');

    expect(wrapped1).toBe(wrapped2); // Same reference
  });

  test('preserves reference to original executor', () => {
    const wrapped = adapter.wrapExecutor('ingestion.sanitize');
    expect(wrapped._aopegExecutor).toBe(mockSanitizeExecutor);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: EXECUTE
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - execute', () => {
  let registry;
  let adapter;

  beforeEach(() => {
    registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);
    registry.registerExecutor(mockQualityCheckExecutor);
    registry.registerExecutor(mockFatalErrorExecutor);
    adapter = new AOPEGAdapter(registry);
  });

  test('maps input and output correctly on success', async () => {
    const wrapped = adapter.wrapExecutor('ingestion.sanitize');
    const ctx = { executionId: 'exec-1', nodeId: 'node-1' };

    const output = await wrapped.execute({ text: '  Hello World  ' }, ctx);

    expect(output).toEqual({
      text: 'hello world',
      charCount: 15,
      sanitized: true
    });
  });

  test('throws with INVALID_INPUT for validation failure', async () => {
    const wrapped = adapter.wrapExecutor('ingestion.sanitize');

    await expect(wrapped.execute({}, {})).rejects.toMatchObject({
      code: RuntimeErrorCodes.INVALID_INPUT,
      message: expect.stringContaining('text is required')
    });
  });

  test('throws with EXECUTION_ERROR for recoverable AOPEG error', async () => {
    const wrapped = adapter.wrapExecutor('ingestion.quality_check');

    await expect(
      wrapped.execute({ failOnLow: true, score: 0.3, threshold: 0.7 }, {})
    ).rejects.toMatchObject({
      code: RuntimeErrorCodes.EXECUTION_ERROR,
      message: expect.stringContaining('Quality 0.3 below threshold')
    });
  });

  test('throws with FATAL_ERROR for non-recoverable AOPEG error', async () => {
    const wrapped = adapter.wrapExecutor('ingestion.fatal_fail');

    await expect(wrapped.execute({}, {})).rejects.toMatchObject({
      code: RuntimeErrorCodes.FATAL_ERROR,
      message: expect.stringContaining('non-recoverable')
    });
  });

  test('includes aopegErrors in thrown error', async () => {
    const wrapped = adapter.wrapExecutor('ingestion.quality_check');

    try {
      await wrapped.execute({ failOnLow: true, score: 0.3, threshold: 0.7 }, {});
      fail('Should have thrown');
    } catch (error) {
      expect(error.aopegErrors).toBeDefined();
      expect(error.aopegErrors[0].code).toBe('QUALITY_LOW');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: WRAP ALL EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - wrapAllExecutors', () => {
  test('wraps all registered executors', () => {
    const registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);
    registry.registerExecutor(mockExtractEntitiesExecutor);
    registry.registerExecutor(mockQualityCheckExecutor);

    const adapter = new AOPEGAdapter(registry);
    const wrapped = adapter.wrapAllExecutors();

    expect(wrapped.size).toBe(3);
    expect(wrapped.has('text.sanitize')).toBe(true);
    expect(wrapped.has('extraction.entities')).toBe(true);
    // quality_check has no mapping, uses executor type as toolId
    expect(wrapped.has('ingestion.quality_check')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: REGISTER IN MCP REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - registerInMcpRegistry', () => {
  test('registers all wrapped executors in MCP registry', () => {
    const registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);
    registry.registerExecutor(mockExtractEntitiesExecutor);

    const adapter = new AOPEGAdapter(registry);

    const mcpRegistry = new Map();
    mcpRegistry.hasTool = (id) => mcpRegistry.has(id);

    const stats = adapter.registerInMcpRegistry(mcpRegistry);

    expect(stats.registered).toBe(2);
    expect(stats.skipped).toBe(0);
    expect(stats.errors).toHaveLength(0);
    expect(mcpRegistry.has('text.sanitize')).toBe(true);
    expect(mcpRegistry.has('extraction.entities')).toBe(true);
  });

  test('skips existing tools when overwrite=false', () => {
    const registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);

    const adapter = new AOPEGAdapter(registry);

    const mcpRegistry = new Map();
    mcpRegistry.set('text.sanitize', { existing: true });
    mcpRegistry.hasTool = (id) => mcpRegistry.has(id);

    const stats = adapter.registerInMcpRegistry(mcpRegistry, { overwrite: false });

    expect(stats.registered).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(mcpRegistry.get('text.sanitize').existing).toBe(true);
  });

  test('overwrites existing tools when overwrite=true', () => {
    const registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);

    const adapter = new AOPEGAdapter(registry);

    const mcpRegistry = new Map();
    mcpRegistry.set('text.sanitize', { existing: true });
    mcpRegistry.hasTool = (id) => mcpRegistry.has(id);

    const stats = adapter.registerInMcpRegistry(mcpRegistry, { overwrite: true });

    expect(stats.registered).toBe(1);
    expect(stats.skipped).toBe(0);
    expect(mcpRegistry.get('text.sanitize').existing).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: UTILITY METHODS
// ═══════════════════════════════════════════════════════════════════════════

describe('AOPEGAdapter - Utility Methods', () => {
  let adapter;

  beforeEach(() => {
    const registry = createMockPluginRegistry();
    registry.registerExecutor(mockSanitizeExecutor);
    registry.registerExecutor(mockExtractEntitiesExecutor);
    adapter = new AOPEGAdapter(registry);
  });

  test('hasExecutor checks AOPEG registry', () => {
    expect(adapter.hasExecutor('ingestion.sanitize')).toBe(true);
    expect(adapter.hasExecutor('unknown.type')).toBe(false);
  });

  test('getAvailableExecutorTypes returns all types', () => {
    const types = adapter.getAvailableExecutorTypes();
    expect(types).toContain('ingestion.sanitize');
    expect(types).toContain('ingestion.extract_entities');
    expect(types.length).toBe(2);
  });

  test('getExecutorInfo returns full info with mapping', () => {
    const info = adapter.getExecutorInfo('ingestion.sanitize');

    expect(info).toEqual({
      executorType: 'ingestion.sanitize',
      toolId: 'text.sanitize',
      displayName: 'Sanitize Text',
      description: 'Clean and normalize text content',
      domain: 'ingestion',
      parameterSchema: mockSanitizeExecutor.parameterSchema
    });
  });

  test('getExecutorInfo returns null for unknown executor', () => {
    expect(adapter.getExecutorInfo('unknown')).toBeNull();
  });

  test('clearCache clears wrapped executor cache', () => {
    adapter.wrapExecutor('ingestion.sanitize');
    expect(adapter.getStats().cachedWrappers).toBe(1);

    adapter.clearCache();
    expect(adapter.getStats().cachedWrappers).toBe(0);
  });

  test('getStats returns correct statistics', () => {
    adapter.wrapExecutor('ingestion.sanitize');

    const stats = adapter.getStats();
    expect(stats.availableExecutors).toBe(2);
    expect(stats.cachedWrappers).toBe(1);
    expect(stats.mappedTypes).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: GRAPH FORMAT CONVERTER
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphFormatConverter - aopegToReactFlow', () => {
  let converter;

  beforeEach(() => {
    converter = new GraphFormatConverter();
  });

  test('converts AOPEG graph to ReactFlow format', () => {
    const aopegGraph = {
      id: 'graph-1',
      version: 1,
      entryNodeId: 'node-1',
      exitNodeIds: ['node-3'],
      nodes: [
        { id: 'node-1', executorType: 'ingestion.sanitize', parameters: { removeHtml: true } },
        { id: 'node-2', executorType: 'ingestion.extract_entities', parameters: {} },
        { id: 'node-3', executorType: 'ingestion.write_graph', parameters: {} }
      ],
      edges: [
        { sourceNodeId: 'node-1', targetNodeId: 'node-2', priority: 0 },
        { sourceNodeId: 'node-2', targetNodeId: 'node-3', priority: 0 }
      ],
      defaultParameters: { namespace: 'test' }
    };

    const rfDag = converter.aopegToReactFlow(aopegGraph);

    expect(rfDag.nodes).toHaveLength(3);
    expect(rfDag.edges).toHaveLength(2);

    // Check node conversion
    const node1 = rfDag.nodes.find(n => n.id === 'node-1');
    expect(node1.data.toolId).toBe('text.sanitize');
    expect(node1.data.executorType).toBe('ingestion.sanitize');
    expect(node1.data.parameters).toEqual({ removeHtml: true });

    // Check edge conversion
    const edge1 = rfDag.edges.find(e => e.source === 'node-1');
    expect(edge1.target).toBe('node-2');

    // Check preserved metadata
    expect(rfDag._aopeg.graphId).toBe('graph-1');
    expect(rfDag._aopeg.entryNodeId).toBe('node-1');
  });

  test('handles dataMapping in edges', () => {
    const aopegGraph = {
      id: 'g1',
      entryNodeId: 'a',
      exitNodeIds: ['b'],
      nodes: [
        { id: 'a', executorType: 'test.a' },
        { id: 'b', executorType: 'test.b' }
      ],
      edges: [{
        sourceNodeId: 'a',
        targetNodeId: 'b',
        dataMapping: [
          { sourceField: 'result', targetField: 'input' }
        ]
      }]
    };

    const rfDag = converter.aopegToReactFlow(aopegGraph);

    expect(rfDag.edges[0].sourceHandle).toBe('result');
    expect(rfDag.edges[0].targetHandle).toBe('input');
    expect(rfDag.edges[0].data.dataMapping).toEqual(aopegGraph.edges[0].dataMapping);
  });
});

describe('GraphFormatConverter - reactFlowToAopeg', () => {
  let converter;

  beforeEach(() => {
    converter = new GraphFormatConverter();
  });

  test('converts ReactFlow DAG to AOPEG format', () => {
    const rfDag = {
      nodes: [
        { id: 'n1', data: { toolId: 'text.sanitize', parameters: { x: 1 } }, position: { x: 0, y: 0 } },
        { id: 'n2', data: { toolId: 'extraction.entities' }, position: { x: 200, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' }
      ]
    };

    const aopegGraph = converter.reactFlowToAopeg(rfDag);

    expect(aopegGraph.nodes).toHaveLength(2);
    expect(aopegGraph.edges).toHaveLength(1);
    expect(aopegGraph.entryNodeId).toBe('n1'); // Auto-detected
    expect(aopegGraph.exitNodeIds).toContain('n2'); // Auto-detected

    // Check node conversion
    const node1 = aopegGraph.nodes.find(n => n.id === 'n1');
    expect(node1.executorType).toBe('ingestion.sanitize'); // Reverse mapped
    expect(node1.parameters).toEqual({ x: 1 });

    // Check edge conversion
    expect(aopegGraph.edges[0].sourceNodeId).toBe('n1');
    expect(aopegGraph.edges[0].targetNodeId).toBe('n2');
  });

  test('uses provided entry/exit nodes', () => {
    const rfDag = {
      nodes: [
        { id: 'a', data: { executorType: 'test.a' } },
        { id: 'b', data: { executorType: 'test.b' } },
        { id: 'c', data: { executorType: 'test.c' } }
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' }
      ]
    };

    const aopegGraph = converter.reactFlowToAopeg(rfDag, 'a', ['c']);

    expect(aopegGraph.entryNodeId).toBe('a');
    expect(aopegGraph.exitNodeIds).toEqual(['c']);
  });

  test('preserves AOPEG metadata from _aopeg property', () => {
    const rfDag = {
      nodes: [{ id: 'n1', data: { toolId: 'test' } }],
      edges: [],
      _aopeg: {
        graphId: 'original-id',
        version: 5,
        defaultParameters: { key: 'value' }
      }
    };

    const aopegGraph = converter.reactFlowToAopeg(rfDag);

    expect(aopegGraph.id).toBe('original-id');
    expect(aopegGraph.version).toBe(5);
    expect(aopegGraph.defaultParameters).toEqual({ key: 'value' });
  });
});

describe('GraphFormatConverter - roundtrip', () => {
  test('roundtrip aopeg → reactflow → aopeg preserves data', () => {
    const converter = new GraphFormatConverter();

    const original = {
      id: 'roundtrip-test',
      version: 2,
      entryNodeId: 'start',
      exitNodeIds: ['end'],
      nodes: [
        {
          id: 'start',
          executorType: 'ingestion.sanitize',
          parameters: { removeHtml: true },
          timeout: 5000
        },
        {
          id: 'middle',
          executorType: 'ingestion.extract_entities',
          parameters: { minConfidence: 0.8 }
        },
        {
          id: 'end',
          executorType: 'ingestion.write_graph',
          parameters: { namespace: 'test' }
        }
      ],
      edges: [
        {
          id: 'e1',
          sourceNodeId: 'start',
          targetNodeId: 'middle',
          priority: 0,
          dataMapping: [{ sourceField: 'text', targetField: 'input' }]
        },
        {
          id: 'e2',
          sourceNodeId: 'middle',
          targetNodeId: 'end',
          priority: 0
        }
      ],
      defaultParameters: { globalKey: 'globalValue' }
    };

    // Convert to ReactFlow and back
    const rfDag = converter.aopegToReactFlow(original);
    const restored = converter.reactFlowToAopeg(rfDag, original.entryNodeId, original.exitNodeIds);

    // Check key fields preserved
    expect(restored.id).toBe(original.id);
    expect(restored.version).toBe(original.version);
    expect(restored.entryNodeId).toBe(original.entryNodeId);
    expect(restored.exitNodeIds).toEqual(original.exitNodeIds);
    expect(restored.nodes).toHaveLength(original.nodes.length);
    expect(restored.edges).toHaveLength(original.edges.length);
    expect(restored.defaultParameters).toEqual(original.defaultParameters);

    // Check node data preserved
    const restoredStart = restored.nodes.find(n => n.id === 'start');
    expect(restoredStart.executorType).toBe('ingestion.sanitize');
    expect(restoredStart.parameters).toEqual({ removeHtml: true });
    expect(restoredStart.timeout).toBe(5000);

    // Check edge data preserved
    const restoredE1 = restored.edges.find(e => e.id === 'e1');
    expect(restoredE1.sourceNodeId).toBe('start');
    expect(restoredE1.targetNodeId).toBe('middle');
    expect(restoredE1.dataMapping).toEqual([{ sourceField: 'text', targetField: 'input' }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe('GraphFormatConverter - Validation', () => {
  let converter;

  beforeEach(() => {
    converter = new GraphFormatConverter();
  });

  test('validateAOPEGGraph detects missing nodes', () => {
    const result = converter.validateAOPEGGraph({ entryNodeId: 'a', exitNodeIds: ['b'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Graph must have nodes array');
  });

  test('validateAOPEGGraph detects missing entryNodeId', () => {
    const result = converter.validateAOPEGGraph({ nodes: [], exitNodeIds: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Graph must have entryNodeId');
  });

  test('validateAOPEGGraph detects invalid entry node reference', () => {
    const graph = {
      nodes: [{ id: 'a', executorType: 'test' }],
      edges: [],
      entryNodeId: 'nonexistent',
      exitNodeIds: ['a']
    };
    const result = converter.validateAOPEGGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Entry node not found: nonexistent');
  });

  test('validateReactFlowDAG detects missing toolId', () => {
    const dag = {
      nodes: [{ id: 'n1', data: {} }],
      edges: []
    };
    const result = converter.validateReactFlowDAG(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing toolId'))).toBe(true);
  });

  test('validateReactFlowDAG passes for valid DAG', () => {
    const dag = {
      nodes: [
        { id: 'n1', data: { toolId: 'test' } },
        { id: 'n2', data: { kind: 'test2' } }
      ],
      edges: [{ source: 'n1', target: 'n2' }]
    };
    const result = converter.validateReactFlowDAG(dag);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
