/**
 * Tests for NodeRunner
 */

const { NodeRunner, RunStatus, FailurePhase } = require('../NodeRunner');
const { PortManager } = require('../../dataflow/PortManager');
const { DataFlowManager } = require('../../dataflow/DataFlowManager');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const mockToolDefinitions = {
  'text.sanitize': {
    id: 'text.sanitize',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    },
    outputSchema: {
      type: 'object',
      properties: {
        sanitized: { type: 'string' },
        stats: { type: 'object' }
      }
    }
  },
  'extraction.entities': {
    id: 'extraction.entities',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        language: { type: 'string' }
      },
      required: ['text']
    },
    outputSchema: {
      type: 'object',
      properties: {
        entities: { type: 'array' },
        count: { type: 'number' }
      }
    }
  },
  'slow.tool': {
    id: 'slow.tool',
    inputSchema: {
      type: 'object',
      properties: { delay: { type: 'number' } },
      required: ['delay']
    },
    outputSchema: {
      type: 'object',
      properties: { result: { type: 'string' } }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MOCK TOOLS
// ═══════════════════════════════════════════════════════════════════════════

class MockTool {
  constructor(id, definition, executor) {
    this._id = id;
    this._definition = definition;
    this._executor = executor;
  }

  getDefinition() {
    return this._definition;
  }

  async execute(input, context) {
    return this._executor(input, context);
  }
}

function createMockRegistry() {
  const tools = new Map();

  // text.sanitize - successful tool
  tools.set('text.sanitize', new MockTool(
    'text.sanitize',
    mockToolDefinitions['text.sanitize'],
    async (input) => ({
      data: {
        sanitized: input.text.trim().toLowerCase(),
        stats: { originalLength: input.text.length }
      }
    })
  ));

  // extraction.entities - successful tool
  tools.set('extraction.entities', new MockTool(
    'extraction.entities',
    mockToolDefinitions['extraction.entities'],
    async (input) => ({
      data: {
        entities: ['Entity1', 'Entity2'],
        count: 2
      }
    })
  ));

  // slow.tool - tool that delays (for timeout testing)
  tools.set('slow.tool', new MockTool(
    'slow.tool',
    mockToolDefinitions['slow.tool'],
    async (input, context) => {
      // Check for abort signal
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({ data: { result: 'completed' } });
        }, input.delay);

        // Handle abort
        if (context?.signal) {
          context.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
          });
        }
      });
    }
  ));

  // error.tool - tool that throws
  tools.set('error.tool', new MockTool(
    'error.tool',
    { id: 'error.tool', inputSchema: { type: 'object', properties: {} } },
    async () => {
      throw new Error('Intentional error');
    }
  ));

  // null.tool - tool that returns null (no data wrapper)
  tools.set('null.tool', new MockTool(
    'null.tool',
    { id: 'null.tool', inputSchema: { type: 'object', properties: {} } },
    async () => null // Returns null directly
  ));

  return {
    getTool: (id) => tools.get(id) || null,
    hasTool: (id) => tools.has(id)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('NodeRunner', () => {
  let runner;
  let mockRegistry;
  let portManager;
  let dataFlowManager;

  beforeEach(() => {
    runner = new NodeRunner();
    mockRegistry = createMockRegistry();
    portManager = new PortManager();

    // Register ports for test nodes
    portManager.registerPorts('sanitize-node', mockToolDefinitions['text.sanitize']);
    portManager.registerPorts('entity-node', mockToolDefinitions['extraction.entities']);
    portManager.registerPorts('slow-node', mockToolDefinitions['slow.tool']);

    // Simple test DAG: sanitize → entities
    const edges = [
      { id: 'e1', source: 'sanitize-node', target: 'entity-node', sourceHandle: 'sanitized', targetHandle: 'text' }
    ];

    dataFlowManager = new DataFlowManager(portManager, edges);
  });

  function createContext(overrides = {}) {
    return {
      mcpRegistry: mockRegistry,
      portManager,
      dataFlowManager,
      globalVariables: new Map(),
      executionId: 'test-exec-1',
      config: { nodeTimeoutMs: 5000 },
      ...overrides
    };
  }

  describe('successful execution', () => {
    test('executes all 5 phases successfully', async () => {
      // Set input data
      portManager.setPortData('sanitize-node', 'text', '  Hello World  ');

      const result = await runner.run('sanitize-node', 'text.sanitize', createContext());

      expect(result.status).toBe(RunStatus.SUCCEEDED);
      expect(result.output).toEqual({
        sanitized: 'hello world',
        stats: { originalLength: 15 }
      });

      // Check metrics (can be 0 for very fast operations)
      expect(result.metrics.wallTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.phases.resolveMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.phases.validateInputMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.phases.executeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.phases.validateOutputMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.phases.propagateMs).toBeGreaterThanOrEqual(0);
    });

    test('propagates output to downstream nodes', async () => {
      portManager.setPortData('sanitize-node', 'text', '  Test Input  ');

      await runner.run('sanitize-node', 'text.sanitize', createContext());

      // Check downstream port received data
      const downstreamData = portManager.getPortData('entity-node', 'text');
      expect(downstreamData).toBe('test input');
    });

    test('returns propagation results', async () => {
      portManager.setPortData('sanitize-node', 'text', 'test');

      const result = await runner.run('sanitize-node', 'text.sanitize', createContext());

      expect(result.propagationResults).toBeDefined();
      expect(result.propagationResults).toHaveLength(1);
      expect(result.propagationResults[0].success).toBe(true);
    });
  });

  describe('RESOLVE phase failures', () => {
    test('fails with TOOL_NOT_FOUND for non-existent tool', async () => {
      portManager.setPortData('sanitize-node', 'text', 'test');

      const result = await runner.run('sanitize-node', 'nonexistent.tool', createContext());

      expect(result.status).toBe(RunStatus.FAILED);
      expect(result.error).toBe('TOOL_NOT_FOUND');
      expect(result.failedAtPhase).toBe(FailurePhase.RESOLVE);
      expect(result.details.toolId).toBe('nonexistent.tool');
    });
  });

  describe('VALIDATE_INPUT phase failures', () => {
    test('fails with INVALID_INPUT when required field missing', async () => {
      // Don't set any input data - 'text' is required
      const result = await runner.run('sanitize-node', 'text.sanitize', createContext());

      expect(result.status).toBe(RunStatus.FAILED);
      expect(result.error).toBe('INVALID_INPUT');
      expect(result.failedAtPhase).toBe(FailurePhase.VALIDATE_INPUT);
      expect(result.details.errors).toContain('Missing required field: text');
    });
  });

  describe('EXECUTE phase failures', () => {
    test('fails with EXECUTION_ERROR when tool throws', async () => {
      portManager.registerPorts('error-node', { id: 'error.tool', inputSchema: { type: 'object', properties: {} } });

      const result = await runner.run('error-node', 'error.tool', createContext());

      expect(result.status).toBe(RunStatus.FAILED);
      expect(result.error).toBe('EXECUTION_ERROR');
      expect(result.failedAtPhase).toBe(FailurePhase.EXECUTE);
      expect(result.details.error).toBe('Intentional error');
    });

    test('fails with NODE_TIMEOUT when execution exceeds timeout', async () => {
      portManager.setPortData('slow-node', 'delay', 500); // 500ms delay

      const result = await runner.run('slow-node', 'slow.tool', createContext({
        config: { nodeTimeoutMs: 100 } // 100ms timeout
      }));

      expect(result.status).toBe(RunStatus.FAILED);
      expect(result.error).toBe('NODE_TIMEOUT');
      expect(result.failedAtPhase).toBe(FailurePhase.EXECUTE);
    }, 10000);

    test('succeeds when execution completes before timeout', async () => {
      portManager.setPortData('slow-node', 'delay', 50); // 50ms delay

      const result = await runner.run('slow-node', 'slow.tool', createContext({
        config: { nodeTimeoutMs: 500 } // 500ms timeout
      }));

      expect(result.status).toBe(RunStatus.SUCCEEDED);
      expect(result.output).toEqual({ result: 'completed' });
    });
  });

  describe('VALIDATE_OUTPUT phase failures', () => {
    test('fails with INVALID_OUTPUT when tool returns null', async () => {
      portManager.registerPorts('null-node', { id: 'null.tool', inputSchema: { type: 'object', properties: {} } });

      const result = await runner.run('null-node', 'null.tool', createContext());

      expect(result.status).toBe(RunStatus.FAILED);
      expect(result.error).toBe('INVALID_OUTPUT');
      expect(result.failedAtPhase).toBe(FailurePhase.VALIDATE_OUTPUT);
    });
  });

  describe('metrics tracking', () => {
    test('records timing for each phase', async () => {
      portManager.setPortData('sanitize-node', 'text', 'test');

      const result = await runner.run('sanitize-node', 'text.sanitize', createContext());

      expect(result.metrics).toBeDefined();
      // wallTimeMs can be 0 for very fast operations (sub-millisecond)
      expect(result.metrics.wallTimeMs).toBeGreaterThanOrEqual(0);

      // All phase timings should be non-negative
      Object.values(result.metrics.phases).forEach(timing => {
        expect(timing).toBeGreaterThanOrEqual(0);
      });

      // Wall time should be >= sum of phases
      const phaseSum = Object.values(result.metrics.phases).reduce((a, b) => a + b, 0);
      expect(result.metrics.wallTimeMs).toBeGreaterThanOrEqual(phaseSum);
    });

    test('records metrics even on failure', async () => {
      const result = await runner.run('sanitize-node', 'nonexistent.tool', createContext());

      expect(result.status).toBe(RunStatus.FAILED);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.wallTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.phases.resolveMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('context handling', () => {
    test('passes execution context to tool', async () => {
      let receivedContext = null;

      const customRegistry = {
        getTool: (id) => {
          if (id === 'context.checker') {
            return new MockTool('context.checker', {
              id: 'context.checker',
              inputSchema: { type: 'object', properties: {} }
            }, async (input, context) => {
              receivedContext = context;
              return { data: { ok: true } };
            });
          }
          return null;
        }
      };

      portManager.registerPorts('context-node', { id: 'context.checker', inputSchema: { type: 'object', properties: {} } });

      await runner.run('context-node', 'context.checker', createContext({
        mcpRegistry: customRegistry,
        executionId: 'exec-123',
        globalVariables: new Map([['key', 'value']])
      }));

      expect(receivedContext).toBeDefined();
      expect(receivedContext.executionId).toBe('exec-123');
      expect(receivedContext.nodeId).toBe('context-node');
      expect(receivedContext.globalVariables.get('key')).toBe('value');
      expect(receivedContext.signal).toBeDefined();
    });
  });

  describe('default timeout', () => {
    test('uses default timeout when not specified', async () => {
      portManager.setPortData('slow-node', 'delay', 10);

      // Create context without config.nodeTimeoutMs
      const ctx = createContext();
      delete ctx.config.nodeTimeoutMs;

      const result = await runner.run('slow-node', 'slow.tool', ctx);

      expect(result.status).toBe(RunStatus.SUCCEEDED);
    });
  });
});
