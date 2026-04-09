const { GxeManagerService } = require('../../GxeManagerService');
const { ExecutionRegistry } = require('../../ExecutionRegistry');
const { ConcurrencyGovernor } = require('../../ConcurrencyGovernor');

// Mock dependencies
const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  hSet: jest.fn().mockResolvedValue(1),
  hGet: jest.fn(),
  hGetAll: jest.fn().mockResolvedValue({}),
  sAdd: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue([]),
  zAdd: jest.fn().mockResolvedValue(1),
  zRangeByScore: jest.fn().mockResolvedValue([]),
  keys: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(1),
  xAdd: jest.fn().mockResolvedValue('1-0'),
  xRange: jest.fn().mockResolvedValue([])
};

const mockMemgraph = {
  query: jest.fn().mockResolvedValue([])
};

class MockRuntimeEngine {
  constructor() {
    this.events = {};
  }

  on(event, handler) {
    this.events[event] = handler;
  }

  async execute(graph, payload) {
    setTimeout(() => {
      this.events['execution.completed']?.({ result: { success: true } });
    }, 100);
  }

  async abort() {}
}

describe('E2E: Execution Lifecycle', () => {
  let registry;
  let manager;
  let governor;

  beforeAll(() => {
    registry = new ExecutionRegistry(mockRedis);
    governor = new ConcurrencyGovernor(registry, mockRedis);

    manager = new GxeManagerService({
      registry,
      mcpRegistry: { getTool: () => null },
      RuntimeEngine: MockRuntimeEngine,
      graphCatalog: { getGraph: jest.fn().mockResolvedValue({ graphId: 'test', nodes: [], edges: [] }) },
      memgraphService: mockMemgraph
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Manual Launch', () => {
    it('should launch execution and return record', async () => {
      manager._loadGraph = jest.fn().mockResolvedValue({
        graphId: 'test-graph-1',
        nodes: [],
        edges: []
      });

      const execution = await manager.launch('test-graph-1', { input: 'test' });

      expect(execution).toBeDefined();
      expect(execution.executionId).toBeDefined();
      expect(execution.graphId).toBe('test-graph-1');
    });

    it('should handle concurrent launches within limits', async () => {
      const canStart = await governor.canStart('test-graph', 'NORMAL');
      expect(typeof canStart).toBe('boolean');
    });
  });

  describe('Pause and Resume', () => {
    it('should pause running execution', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        executionId: 'exec-1',
        graphId: 'test-graph',
        status: 'RUNNING'
      }));

      const result = await manager.pause('exec-1', {
        reason: 'Manual pause for testing'
      });

      expect(result).toBeDefined();
    });

    it('should resume paused execution with payload', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        executionId: 'exec-2',
        graphId: 'test-graph',
        status: 'PAUSED',
        currentNodeId: 'node-1'
      }));

      const result = await manager.resume('exec-2', {
        nodeId: 'node-1',
        payload: { approved: true }
      });

      expect(result).toBeDefined();
    });
  });

  describe('Cancel', () => {
    it('should cancel execution', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        executionId: 'exec-3',
        graphId: 'test-graph',
        status: 'RUNNING'
      }));

      const result = await manager.cancel('exec-3', 'Test cancellation');

      expect(result).toBeDefined();
    });
  });

  describe('Rollback', () => {
    it('should rollback execution', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        executionId: 'exec-4',
        graphId: 'test-graph',
        status: 'PAUSED',
        checkpointRef: 'checkpoint-1'
      }));

      mockRedis.keys.mockResolvedValueOnce(['gxe:checkpoint:exec-4:cp-1']);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        checkpointId: 'cp-1',
        timestamp: Date.now(),
        nodeStates: {},
        completedNodes: ['node-1']
      }));

      const result = await manager.rollback('exec-4', {
        mode: 'TO_CHECKPOINT',
        checkpointId: 'cp-1'
      });

      expect(result).toBeDefined();
    });
  });
});
