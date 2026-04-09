/**
 * RuntimeEngine Tests
 *
 * Test cases from GXE Runtime P0:
 * 1. Happy path end-to-end
 * 2. Failure propagation
 * 3. Parallel DAG (diamond)
 * 4. Empty inputData
 * 5. GraphValidator integration
 */

const { RuntimeEngine } = require('../RuntimeEngine');
const { RunStatus } = require('../execution/NodeRunner');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a mock tool
 */
function createMockTool(toolId, executor, inputSchema = {}, outputSchema = {}) {
  return {
    id: toolId,
    getDefinition: () => ({
      id: toolId,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        ...inputSchema
      },
      outputSchema: {
        type: 'object',
        properties: {},
        ...outputSchema
      }
    }),
    execute: executor
  };
}

/**
 * Create mock MCP Registry with tools
 */
function createMockRegistry(tools = {}) {
  return {
    getTool: (toolId) => tools[toolId] || null,
    listTools: () => Object.values(tools).map(t => ({ id: t.id }))
  };
}

/**
 * Create standard test tools
 */
function createStandardTools() {
  return {
    'text.sanitize': createMockTool(
      'text.sanitize',
      async (input) => ({
        data: {
          sanitized: (input.text || '').trim().toLowerCase(),
          stats: { originalLength: (input.text || '').length }
        }
      }),
      {
        properties: { text: { type: 'string' } },
        required: ['text']
      },
      {
        properties: { sanitized: { type: 'string' }, stats: { type: 'object' } }
      }
    ),

    'extraction.entities': createMockTool(
      'extraction.entities',
      async (input) => ({
        data: {
          entities: [{ name: 'UN', type: 'ORG' }],
          count: 1
        }
      }),
      {
        properties: { text: { type: 'string' } }
      },
      {
        properties: { entities: { type: 'array' }, count: { type: 'number' } }
      }
    ),

    'graph.create_node': createMockTool(
      'graph.create_node',
      async (input) => ({
        data: {
          nodeId: 'n-1',
          created: true
        }
      }),
      {
        properties: { properties: { type: 'array' } } // Accept array (entities from upstream)
      },
      {
        properties: { nodeId: { type: 'string' }, created: { type: 'boolean' } }
      }
    ),

    'always.fail': createMockTool(
      'always.fail',
      async () => {
        throw new Error('This tool always fails');
      }
    ),

    'simple.passthrough': createMockTool(
      'simple.passthrough',
      async (input) => ({
        data: { ...input, processed: true }
      })
    )
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Construction', () => {
  test('requires mcpRegistry', () => {
    expect(() => new RuntimeEngine(null)).toThrow('RuntimeEngine requires mcpRegistry');
  });

  test('accepts custom config', () => {
    const registry = createMockRegistry();
    const engine = new RuntimeEngine(registry, {
      maxConcurrency: 5,
      maxNodeRetries: 2
    });

    expect(engine._config.maxConcurrency).toBe(5);
    expect(engine._config.maxNodeRetries).toBe(2);
    // Defaults preserved
    expect(engine._config.nodeTimeoutMs).toBe(60000);
  });

  test('initial state is IDLE', () => {
    const registry = createMockRegistry();
    const engine = new RuntimeEngine(registry);

    expect(engine.getState()).toBe('IDLE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: HAPPY PATH END-TO-END
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Happy Path', () => {
  test('executes linear DAG successfully', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false // Skip validation for faster test
    });

    const dag = {
      nodes: [
        { id: 'sanitize-1', data: { toolId: 'text.sanitize', label: 'Sanitize' } },
        { id: 'extract-1', data: { toolId: 'extraction.entities', label: 'Extract' } },
        { id: 'store-1', data: { toolId: 'graph.create_node', label: 'Store' } }
      ],
      edges: [
        { id: 'e1', source: 'sanitize-1', target: 'extract-1', sourceHandle: 'sanitized', targetHandle: 'text' },
        { id: 'e2', source: 'extract-1', target: 'store-1', sourceHandle: 'entities', targetHandle: 'properties' }
      ]
    };

    const result = await engine.execute(dag, { text: '  Hello World from UN  ' });

    expect(result.executionId).toBeTruthy();
    expect(result.status).toBe('COMPLETED');
    expect(result.metrics.nodesSucceeded).toBe(3);
    expect(result.metrics.nodesFailed).toBe(0);
    expect(result.output['store-1']).toBeDefined();
    expect(result.output['store-1'].nodeId).toBe('n-1');
    expect(result.history).toBeDefined();
    expect(result.history.length).toBeGreaterThan(0);
  });

  test('emits execution events', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } }
      ],
      edges: []
    };

    const events = [];
    engine.on('execution:stateChange', (ev) => events.push(ev));
    engine.on('node:completed', (ev) => events.push(ev));

    await engine.execute(dag, {});

    expect(events.some(e => e.to === 'INITIALIZING')).toBe(true);
    expect(events.some(e => e.to === 'READY')).toBe(true);
    expect(events.some(e => e.to === 'RUNNING')).toBe(true);
    expect(events.some(e => e.to === 'COMPLETED')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: FAILURE PROPAGATION
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Failure Propagation', () => {
  test('middle node failure cancels downstream', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false,
      maxNodeRetries: 1 // Fail fast
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } },
        { id: 'node-2', data: { toolId: 'always.fail' } },
        { id: 'node-3', data: { toolId: 'simple.passthrough' } }
      ],
      edges: [
        { id: 'e1', source: 'node-1', target: 'node-2' },
        { id: 'e2', source: 'node-2', target: 'node-3' }
      ]
    };

    const result = await engine.execute(dag, {});

    expect(result.status).toBe('FAILED');
    expect(result.metrics.nodesFailed).toBe(1);
    expect(result.metrics.nodesCancelled).toBe(1); // node-3 should be cancelled
    expect(result.nodeResults['node-1'].status).toBe('SUCCEEDED');
    expect(result.nodeResults['node-2'].status).toBe('FAILED');
    expect(result.nodeResults['node-3'].status).toBe('CANCELLED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: PARALLEL DAG (DIAMOND)
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Parallel DAG', () => {
  test('executes diamond DAG with parallel branches', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false,
      maxConcurrency: 10
    });

    // Diamond: A → B → D, A → C → D
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'simple.passthrough' } },
        { id: 'B', data: { toolId: 'simple.passthrough' } },
        { id: 'C', data: { toolId: 'simple.passthrough' } },
        { id: 'D', data: { toolId: 'simple.passthrough' } }
      ],
      edges: [
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'A', target: 'C' },
        { id: 'e3', source: 'B', target: 'D' },
        { id: 'e4', source: 'C', target: 'D' }
      ]
    };

    const result = await engine.execute(dag, { value: 'test' });

    expect(result.status).toBe('COMPLETED');
    expect(result.metrics.nodesSucceeded).toBe(4);
    expect(result.output['D']).toBeDefined();
    expect(result.output['D'].processed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: EMPTY INPUT DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Empty Input', () => {
  test('handles empty inputData gracefully', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } }
      ],
      edges: []
    };

    const result = await engine.execute(dag, {});

    expect(result.status).toBe('COMPLETED');
    expect(result.metrics.nodesSucceeded).toBe(1);
  });

  test('handles undefined inputData', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } }
      ],
      edges: []
    };

    const result = await engine.execute(dag);

    expect(result.status).toBe('COMPLETED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: GRAPH VALIDATOR INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Validation', () => {
  test('fails on empty graph', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: true
    });

    const dag = {
      nodes: [],
      edges: []
    };

    const result = await engine.execute(dag, {});

    expect(result.status).toBe('FAILED');
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.errors.some(e => e.code === 'EMPTY_GRAPH')).toBe(true);
  });

  test('auto-fixes orphan edges', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: true
    });

    // DAG with orphan edge (references non-existent node)
    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } },
        { id: 'node-2', data: { toolId: 'simple.passthrough' } }
      ],
      edges: [
        { id: 'e1', source: 'node-1', target: 'node-2' },
        { id: 'e-orphan', source: 'node-1', target: 'non-existent' } // Orphan edge
      ]
    };

    const result = await engine.execute(dag, {});

    // Should succeed after auto-fix removes orphan edge
    expect(result.status).toBe('COMPLETED');
    expect(result.validation.autoFixed).toBe(true);
  });

  test('fails on cyclic graph', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: true
    });

    // DAG with cycle: A → B → C → A
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'simple.passthrough' } },
        { id: 'B', data: { toolId: 'simple.passthrough' } },
        { id: 'C', data: { toolId: 'simple.passthrough' } }
      ],
      edges: [
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'B', target: 'C' },
        { id: 'e3', source: 'C', target: 'A' } // Creates cycle
      ]
    };

    const result = await engine.execute(dag, {});

    expect(result.status).toBe('FAILED');
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.fatalErrors.some(e => e.code === 'GRAPH_HAS_CYCLES')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: PROGRESS AND STATE
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Progress', () => {
  test('getProgress returns correct values', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } },
        { id: 'node-2', data: { toolId: 'simple.passthrough' } }
      ],
      edges: [{ id: 'e1', source: 'node-1', target: 'node-2' }]
    };

    await engine.execute(dag, {});

    const progress = engine.getProgress();
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(2);
    expect(progress.percentage).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: TIMEOUT
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Timeout', () => {
  test('respects graphTimeoutMs', async () => {
    const slowTool = createMockTool(
      'slow.tool',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { data: { done: true } };
      }
    );

    const registry = createMockRegistry({ 'slow.tool': slowTool });
    const engine = new RuntimeEngine(registry, {
      enableValidation: false,
      graphTimeoutMs: 100 // Very short timeout
    });

    const dag = {
      nodes: [
        { id: 'slow-node', data: { toolId: 'slow.tool' } }
      ],
      edges: []
    };

    const result = await engine.execute(dag, {});

    expect(result.status).toBe('TIMED_OUT');
  }, 10000);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: METRICS
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Metrics', () => {
  test('collects execution metrics', async () => {
    const tools = createStandardTools();
    const registry = createMockRegistry(tools);
    const engine = new RuntimeEngine(registry, {
      enableValidation: false
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'simple.passthrough' } },
        { id: 'node-2', data: { toolId: 'simple.passthrough' } },
        { id: 'node-3', data: { toolId: 'simple.passthrough' } }
      ],
      edges: [
        { id: 'e1', source: 'node-1', target: 'node-2' },
        { id: 'e2', source: 'node-2', target: 'node-3' }
      ]
    };

    const result = await engine.execute(dag, {});

    expect(result.metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.nodesTotal).toBe(3);
    expect(result.metrics.nodesSucceeded).toBe(3);
    expect(result.metrics.nodesFailed).toBe(0);
    expect(result.metrics.nodesSkipped).toBe(0);
    expect(result.metrics.nodesCancelled).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: MISSING TOOL
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine - Missing Tool', () => {
  test('handles missing tool gracefully', async () => {
    const registry = createMockRegistry({}); // Empty registry
    const engine = new RuntimeEngine(registry, {
      enableValidation: false
    });

    const dag = {
      nodes: [
        { id: 'node-1', data: { toolId: 'non.existent.tool' } }
      ],
      edges: []
    };

    const result = await engine.execute(dag, {});

    // Should fail because tool is not found during execution
    expect(result.status).toBe('FAILED');
    expect(result.nodeResults['node-1'].status).toBe('FAILED');
  });
});
