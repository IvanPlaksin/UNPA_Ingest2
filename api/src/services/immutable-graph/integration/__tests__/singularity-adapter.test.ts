/**
 * Singularity Adapter Unit Tests
 * UN ProjectAdvisor - Visualization adapter testing
 */

import { SingularityAdapter, SingularityQueryOptions } from '../singularity-adapter';
import { ImmutableGraphService } from '../../immutable-graph.service';
import { Namespace, NodeStatus, EdgeStatus, NodeVersion, EdgeVersion } from '../../../../types/immutable-graph.types';

describe('SingularityAdapter', () => {
  let mockGraphService: jest.Mocked<ImmutableGraphService>;
  let adapter: SingularityAdapter;

  const createMockNode = (overrides: Partial<NodeVersion> = {}): NodeVersion => ({
    versionId: 'v-001',
    entityId: 'entity-001',
    namespace: Namespace.PROJECT,
    nodeType: 'Function',
    status: NodeStatus.ACTIVE,
    properties: { name: 'testFunction' },
    sequenceNumber: BigInt(1),
    versionName: 'PROJECT-9000-ALPHA-FUNC-001',
    ttStart: new Date(),
    ttEnd: null,
    vtStart: new Date(),
    vtEnd: null,
    changeType: 'CREATE' as any,
    changeReason: 'Test',
    changedBy: 'test',
    changeSource: 'test',
    previousVersionId: null,
    supersededById: null,
    mergedFromIds: [],
    splitIntoIds: [],
    extractionCycleId: null,
    contentHash: 'hash123',
    previousHash: null,
    chainHash: 'chain123',
    signature: null,
    ...overrides
  });

  const createMockEdge = (overrides: Partial<EdgeVersion> = {}): EdgeVersion => ({
    versionId: 'ev-001',
    edgeId: 'edge-001',
    sourceEntityId: 'entity-001',
    targetEntityId: 'entity-002',
    edgeType: 'CALLS',
    namespace: Namespace.PROJECT,
    status: EdgeStatus.ACTIVE,
    properties: {},
    sequenceNumber: BigInt(1),
    versionName: 'PROJECT-9000-ALPHA-EDGE-001',
    ttStart: new Date(),
    ttEnd: null,
    vtStart: new Date(),
    vtEnd: null,
    changeType: 'CREATE' as any,
    changeReason: 'Test',
    changedBy: 'test',
    previousVersionId: null,
    supersededById: null,
    orphanedReason: null,
    orphanedAt: null,
    orphanedByNodeId: null,
    originalStatus: null,
    contentHash: 'hash123',
    previousHash: null,
    chainHash: 'chain123',
    ...overrides
  });

  beforeEach(() => {
    mockGraphService = {
      queryNodes: jest.fn(),
      getConnectedEdges: jest.fn(),
      getNodeByEntityId: jest.fn()
    } as unknown as jest.Mocked<ImmutableGraphService>;

    adapter = new SingularityAdapter(mockGraphService);
  });

  describe('getGraph', () => {
    it('should return empty graph when no nodes exist', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT
      });

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.metadata.totalNodes).toBe(0);
      expect(result.metadata.totalEdges).toBe(0);
    });

    it('should convert nodes to Singularity format', async () => {
      const mockNode = createMockNode({
        entityId: 'func-001',
        nodeType: 'Function',
        properties: { name: 'calculateTotal' }
      });

      mockGraphService.queryNodes.mockResolvedValue([mockNode]);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('func-001');
      expect(result.nodes[0].type).toBe('Function');
      expect(result.nodes[0].label).toBe('calculateTotal');
      expect(result.nodes[0].layer).toBe('code');
      expect(result.nodes[0].visual).toBeDefined();
      expect(result.nodes[0].position).toBeDefined();
    });

    it('should assign correct layers based on node type', async () => {
      const nodes = [
        createMockNode({ entityId: 'epic-1', nodeType: 'Epic', properties: { name: 'Epic 1' } }),
        createMockNode({ entityId: 'task-1', nodeType: 'Task', properties: { name: 'Task 1' } }),
        createMockNode({ entityId: 'func-1', nodeType: 'Function', properties: { name: 'Func 1' } })
      ];

      mockGraphService.queryNodes.mockResolvedValue(nodes);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT
      });

      expect(result.nodes.find(n => n.id === 'epic-1')?.layer).toBe('strategic');
      expect(result.nodes.find(n => n.id === 'task-1')?.layer).toBe('business');
      expect(result.nodes.find(n => n.id === 'func-1')?.layer).toBe('code');
    });

    it('should filter nodes by type', async () => {
      const nodes = [
        createMockNode({ entityId: 'func-1', nodeType: 'Function' }),
        createMockNode({ entityId: 'class-1', nodeType: 'Class' })
      ];

      mockGraphService.queryNodes.mockResolvedValue(nodes);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT,
        nodeTypes: ['Function']
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('Function');
    });

    it('should exclude deprecated nodes by default', async () => {
      const nodes = [
        createMockNode({ entityId: 'active-1', status: NodeStatus.ACTIVE }),
        createMockNode({ entityId: 'deprecated-1', status: NodeStatus.DEPRECATED })
      ];

      mockGraphService.queryNodes.mockResolvedValue(nodes);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT
      });

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('active-1');
    });

    it('should include deprecated nodes when requested', async () => {
      const nodes = [
        createMockNode({ entityId: 'active-1', status: NodeStatus.ACTIVE }),
        createMockNode({ entityId: 'deprecated-1', status: NodeStatus.DEPRECATED })
      ];

      mockGraphService.queryNodes.mockResolvedValue(nodes);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT,
        includeDeprecated: true
      });

      expect(result.nodes).toHaveLength(2);
    });

    it('should include edges between visible nodes', async () => {
      const nodes = [
        createMockNode({ entityId: 'node-a' }),
        createMockNode({ entityId: 'node-b' })
      ];

      const edge = createMockEdge({
        sourceEntityId: 'node-a',
        targetEntityId: 'node-b'
      });

      mockGraphService.queryNodes.mockResolvedValue(nodes);
      mockGraphService.getConnectedEdges
        .mockResolvedValueOnce([edge])
        .mockResolvedValueOnce([edge]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('node-a');
      expect(result.edges[0].target).toBe('node-b');
    });

    it('should exclude orphaned edges by default', async () => {
      const nodes = [
        createMockNode({ entityId: 'node-a' }),
        createMockNode({ entityId: 'node-b' })
      ];

      const edges = [
        createMockEdge({ edgeId: 'active-edge', status: EdgeStatus.ACTIVE, sourceEntityId: 'node-a', targetEntityId: 'node-b' }),
        createMockEdge({ edgeId: 'orphaned-edge', status: EdgeStatus.ORPHANED, sourceEntityId: 'node-a', targetEntityId: 'node-b' })
      ];

      mockGraphService.queryNodes.mockResolvedValue(nodes);
      mockGraphService.getConnectedEdges.mockResolvedValue(edges);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].id).toBe('active-edge');
    });

    it('should apply correct visual styles based on status', async () => {
      const deprecatedNode = createMockNode({
        entityId: 'deprecated-1',
        nodeType: 'Function',
        status: NodeStatus.DEPRECATED
      });

      mockGraphService.queryNodes.mockResolvedValue([deprecatedNode]);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.getGraph({
        namespace: Namespace.PROJECT,
        includeDeprecated: true
      });

      expect(result.nodes[0].visual.color).toBe('#F59E0B'); // STATUS_COLORS.DEPRECATED
    });
  });

  describe('expandNode', () => {
    it('should return empty graph for non-existent node', async () => {
      mockGraphService.getNodeByEntityId.mockResolvedValue(null);

      const result = await adapter.expandNode('non-existent');

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should expand from center node', async () => {
      const centerNode = createMockNode({ entityId: 'center' });
      const neighborNode = createMockNode({ entityId: 'neighbor' });
      const edge = createMockEdge({
        sourceEntityId: 'center',
        targetEntityId: 'neighbor'
      });

      mockGraphService.getNodeByEntityId
        .mockResolvedValueOnce(centerNode)
        .mockResolvedValueOnce(neighborNode);
      mockGraphService.getConnectedEdges
        .mockResolvedValueOnce([edge])
        .mockResolvedValueOnce([]);

      const result = await adapter.expandNode('center', 1);

      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it('should respect depth limit', async () => {
      const node1 = createMockNode({ entityId: 'node-1' });
      const node2 = createMockNode({ entityId: 'node-2' });
      const node3 = createMockNode({ entityId: 'node-3' });

      const edge1 = createMockEdge({ sourceEntityId: 'node-1', targetEntityId: 'node-2' });
      const edge2 = createMockEdge({ sourceEntityId: 'node-2', targetEntityId: 'node-3' });

      mockGraphService.getNodeByEntityId
        .mockResolvedValueOnce(node1)
        .mockResolvedValueOnce(node2);
      mockGraphService.getConnectedEdges
        .mockResolvedValueOnce([edge1])
        .mockResolvedValueOnce([edge2]);

      const result = await adapter.expandNode('node-1', 1);

      // Should only expand 1 level: node-1 + node-2
      expect(result.nodes).toHaveLength(2);
    });

    it('should position center node at origin', async () => {
      const centerNode = createMockNode({ entityId: 'center', nodeType: 'Function' });

      mockGraphService.getNodeByEntityId.mockResolvedValue(centerNode);
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const result = await adapter.expandNode('center');

      const centerSingularityNode = result.nodes.find(n => n.id === 'center');
      expect(centerSingularityNode?.position?.x).toBe(0);
      expect(centerSingularityNode?.position?.y).toBe(0);
    });
  });
});
