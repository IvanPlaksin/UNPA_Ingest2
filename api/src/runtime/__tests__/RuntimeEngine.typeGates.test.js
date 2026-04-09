/**
 * RuntimeEngine Type Gates Tests
 *
 * Verifies that:
 * 1. EXECUTABLE, COMPOSITE, VALIDATION types pass the type gate
 * 2. STRUCTURAL, STORABLE, CONSTRAINT, EVENT, PROJECTION types are rejected
 * 3. TEMPLATE throws "requires instantiation" error
 * 4. PROCESS throws "requires compilation" error
 * 5. SubType routing produces correct execution config
 * 6. Default graphType (EXECUTABLE) is used when not specified
 * 7. GraphType appears in execution result
 */

const { RuntimeEngine } = require('../RuntimeEngine');
const { GraphType } = require('../../services/graph-classification.service');
const { GraphTypeError } = require('../../errors/GraphTypeError');

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockTool(toolId, executor) {
  return {
    id: toolId,
    getDefinition: () => ({
      id: toolId,
      inputSchema: { type: 'object', properties: {}, required: [] },
      outputSchema: { type: 'object', properties: {} }
    }),
    execute: executor || (async (input) => ({ result: 'ok' }))
  };
}

function createMockRegistry(tools = {}) {
  return {
    getTool: (toolId) => tools[toolId] || null,
    listTools: () => Object.values(tools).map(t => ({ id: t.id }))
  };
}

function createMinimalDAG(graphType, graphSubType = null) {
  return {
    graphType,
    graphSubType,
    nodes: [
      { id: 'n1', executorType: 'common.passthrough', data: { label: 'Start' } },
      { id: 'n2', executorType: 'common.passthrough', data: { label: 'End' } }
    ],
    edges: [
      { source: 'n1', target: 'n2' }
    ]
  };
}

function createEngine() {
  const registry = createMockRegistry({
    'common.passthrough': createMockTool('common.passthrough', async (input) => input || {})
  });
  return new RuntimeEngine(registry, { enableValidation: false });
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('RuntimeEngine Type Gates', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('Executable types pass the gate', () => {
    test('EXECUTABLE is allowed', async () => {
      const dag = createMinimalDAG(GraphType.EXECUTABLE);
      const result = await engine.execute(dag, {});
      expect(result.status).not.toBe('TYPE_ERROR');
      expect(result.graphType).toBe(GraphType.EXECUTABLE);
    });

    test('COMPOSITE is allowed', async () => {
      const dag = createMinimalDAG(GraphType.COMPOSITE);
      const result = await engine.execute(dag, {});
      expect(result.graphType).toBe(GraphType.COMPOSITE);
    });

    test('VALIDATION is allowed', async () => {
      const dag = createMinimalDAG(GraphType.VALIDATION);
      const result = await engine.execute(dag, {});
      expect(result.graphType).toBe(GraphType.VALIDATION);
    });

    test('null graphType defaults to EXECUTABLE', async () => {
      const dag = createMinimalDAG(null);
      const result = await engine.execute(dag, {});
      // Should not throw — null defaults to EXECUTABLE
      expect(result.status).not.toBe('TYPE_ERROR');
    });
  });

  describe('Non-executable types are rejected', () => {
    const nonExecutableTypes = [
      GraphType.STRUCTURAL,
      GraphType.STORABLE,
      GraphType.CONSTRAINT,
      GraphType.EVENT,
      GraphType.PROJECTION,
    ];

    for (const type of nonExecutableTypes) {
      test(`${type} is rejected with GraphTypeError`, async () => {
        const dag = createMinimalDAG(type);
        await expect(engine.execute(dag, {})).rejects.toThrow(GraphTypeError);
        await expect(engine.execute(dag, {})).rejects.toThrow(/Cannot execute/);
      });
    }
  });

  describe('Special type gates', () => {
    test('TEMPLATE requires instantiation', async () => {
      const dag = createMinimalDAG(GraphType.TEMPLATE);
      await expect(engine.execute(dag, {})).rejects.toThrow(GraphTypeError);
      await expect(engine.execute(dag, {})).rejects.toThrow(/instantiation/i);
    });

    test('PROCESS requires compilation', async () => {
      const dag = createMinimalDAG(GraphType.PROCESS);
      await expect(engine.execute(dag, {})).rejects.toThrow(GraphTypeError);
      await expect(engine.execute(dag, {})).rejects.toThrow(/compilation/i);
    });
  });

  describe('GraphTypeError properties', () => {
    test('contains graphType and expectedTypes', async () => {
      const dag = createMinimalDAG(GraphType.STRUCTURAL);
      try {
        await engine.execute(dag, {});
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GraphTypeError);
        expect(e.graphType).toBe(GraphType.STRUCTURAL);
        expect(e.expectedTypes).toContain(GraphType.EXECUTABLE);
        expect(e.expectedTypes).toContain(GraphType.COMPOSITE);
        expect(e.expectedTypes).toContain(GraphType.VALIDATION);
        expect(e.code).toBe('GRAPH_TYPE_ERROR');
      }
    });
  });

  describe('SubType execution config', () => {
    test('_getTypeExecutionConfig for dialog', () => {
      const config = engine._getTypeExecutionConfig(GraphType.EXECUTABLE, 'dialog');
      expect(config.useCheckpoint).toBe(true);
      expect(config.reExecutionPattern).toBe(true);
      expect(config.useSaga).toBe(false);
    });

    test('_getTypeExecutionConfig for business', () => {
      const config = engine._getTypeExecutionConfig(GraphType.EXECUTABLE, 'business');
      expect(config.useSaga).toBe(true);
      expect(config.compensateOnFailure).toBe(true);
      expect(config.useCheckpoint).toBe(false);
    });

    test('_getTypeExecutionConfig for extraction', () => {
      const config = engine._getTypeExecutionConfig(GraphType.EXECUTABLE, 'extraction');
      expect(config.useCheckpoint).toBe(true);
      expect(config.spiralExecution).toBe(true);
    });

    test('_getTypeExecutionConfig for VALIDATION is readOnly', () => {
      const config = engine._getTypeExecutionConfig(GraphType.VALIDATION, null);
      expect(config.readOnly).toBe(true);
    });

    test('_getTypeExecutionConfig for COMPOSITE isolates sub-graphs', () => {
      const config = engine._getTypeExecutionConfig(GraphType.COMPOSITE, null);
      expect(config.isolateSubGraphs).toBe(true);
    });
  });

  describe('Result includes graphType', () => {
    test('graphType and graphSubType in execution result', async () => {
      const dag = createMinimalDAG(GraphType.EXECUTABLE, 'dialog');
      const result = await engine.execute(dag, {});
      expect(result.graphType).toBe(GraphType.EXECUTABLE);
      expect(result.graphSubType).toBe('dialog');
    });
  });
});
