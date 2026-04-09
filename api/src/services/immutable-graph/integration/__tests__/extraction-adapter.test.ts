/**
 * Extraction Adapter Unit Tests
 * UN ProjectAdvisor - Integration adapter testing
 */

import { ExtractionAdapter, ExtractionResult, ImportResult } from '../extraction-adapter';
import { ImmutableGraphService } from '../../immutable-graph.service';
import { Namespace, NodeStatus, EdgeStatus, NodeVersion, EdgeVersion } from '../../../../types/immutable-graph.types';

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-v4'
}));

// Mock SSE emitters
jest.mock('../../../../routes/immutable-graph-sse.routes', () => ({
  emitNodeCreated: jest.fn(),
  emitNodeUpdated: jest.fn(),
  GraphEventEmitter: {
    getInstance: jest.fn()
  }
}));

describe('ExtractionAdapter', () => {
  let mockGraphService: jest.Mocked<ImmutableGraphService>;
  let adapter: ExtractionAdapter;

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
      createNode: jest.fn(),
      updateNode: jest.fn(),
      getNodeByEntityId: jest.fn(),
      queryNodes: jest.fn(),
      createEdge: jest.fn(),
      getConnectedEdges: jest.fn(),
      deprecateNode: jest.fn(),
      deprecateEdge: jest.fn(),
      mergeNodes: jest.fn(),
      getNodeLineage: jest.fn(),
      verifyNodeChain: jest.fn(),
      physicalDeleteNode: jest.fn(),
      getEdgeByEdgeId: jest.fn()
    } as unknown as jest.Mocked<ImmutableGraphService>;

    adapter = new ExtractionAdapter(mockGraphService, 'test-project');
  });

  describe('importExtractionResult', () => {
    it('should import new entities', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);
      mockGraphService.createNode.mockResolvedValue(createMockNode({ entityId: 'new-entity-1' }));
      mockGraphService.getConnectedEdges.mockResolvedValue([]);
      mockGraphService.createEdge.mockResolvedValue(createMockEdge());

      const extractionResult: ExtractionResult = {
        entities: [
          {
            externalId: 'ext-001',
            type: 'function',
            name: 'calculateDiscount',
            properties: { complexity: 12 },
            sourceRef: '/src/discount.ts'
          }
        ],
        relationships: [],
        sourceInfo: {
          cycleId: 'cycle-001',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.nodesCreated).toBe(1);
      expect(result.nodesUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockGraphService.createNode).toHaveBeenCalled();
    });

    it('should update existing entities with changes', async () => {
      const existingNode = createMockNode({
        entityId: 'existing-entity',
        properties: { _externalId: 'ext-001', complexity: 10 }
      });

      mockGraphService.queryNodes.mockResolvedValue([existingNode]);
      mockGraphService.updateNode.mockResolvedValue(createMockNode({
        entityId: 'existing-entity',
        properties: { _externalId: 'ext-001', complexity: 15 }
      }));

      const extractionResult: ExtractionResult = {
        entities: [
          {
            externalId: 'ext-001',
            type: 'function',
            name: 'calculateDiscount',
            properties: { complexity: 15 },
            sourceRef: '/src/discount.ts'
          }
        ],
        relationships: [],
        sourceInfo: {
          cycleId: 'cycle-002',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.nodesCreated).toBe(0);
      expect(result.nodesUpdated).toBe(1);
      expect(mockGraphService.updateNode).toHaveBeenCalled();
    });

    it('should skip unchanged entities', async () => {
      const existingNode = createMockNode({
        entityId: 'existing-entity',
        properties: { _externalId: 'ext-001', complexity: 10, name: 'func' }
      });

      mockGraphService.queryNodes.mockResolvedValue([existingNode]);

      const extractionResult: ExtractionResult = {
        entities: [
          {
            externalId: 'ext-001',
            type: 'function',
            name: 'func',
            properties: { complexity: 10 },
            sourceRef: '/src/discount.ts'
          }
        ],
        relationships: [],
        sourceInfo: {
          cycleId: 'cycle-002',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.nodesCreated).toBe(0);
      expect(result.nodesUpdated).toBe(1); // Still counts as update even if no changes
      expect(mockGraphService.createNode).not.toHaveBeenCalled();
      expect(mockGraphService.updateNode).not.toHaveBeenCalled();
    });

    it('should import relationships between entities', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);
      mockGraphService.createNode
        .mockResolvedValueOnce(createMockNode({ entityId: 'entity-a' }))
        .mockResolvedValueOnce(createMockNode({ entityId: 'entity-b' }));
      mockGraphService.getConnectedEdges.mockResolvedValue([]);
      mockGraphService.createEdge.mockResolvedValue(createMockEdge());

      const extractionResult: ExtractionResult = {
        entities: [
          { externalId: 'ext-a', type: 'function', name: 'funcA', properties: {}, sourceRef: '' },
          { externalId: 'ext-b', type: 'function', name: 'funcB', properties: {}, sourceRef: '' }
        ],
        relationships: [
          {
            sourceExternalId: 'ext-a',
            targetExternalId: 'ext-b',
            type: 'CALLS',
            properties: {},
            confidence: 0.95
          }
        ],
        sourceInfo: {
          cycleId: 'cycle-001',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.nodesCreated).toBe(2);
      expect(result.edgesCreated).toBe(1);
      expect(mockGraphService.createEdge).toHaveBeenCalled();
    });

    it('should handle missing entity mappings for relationships', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);
      mockGraphService.createNode.mockResolvedValue(createMockNode({ entityId: 'entity-a' }));
      mockGraphService.getConnectedEdges.mockResolvedValue([]);

      const extractionResult: ExtractionResult = {
        entities: [
          { externalId: 'ext-a', type: 'function', name: 'funcA', properties: {}, sourceRef: '' }
        ],
        relationships: [
          {
            sourceExternalId: 'ext-a',
            targetExternalId: 'ext-missing',
            type: 'CALLS',
            properties: {},
            confidence: 0.9
          }
        ],
        sourceInfo: {
          cycleId: 'cycle-001',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.nodesCreated).toBe(1);
      expect(result.edgesCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('edge');
    });

    it('should handle node creation errors gracefully', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);
      mockGraphService.createNode.mockRejectedValue(new Error('Database error'));

      const extractionResult: ExtractionResult = {
        entities: [
          { externalId: 'ext-001', type: 'function', name: 'func', properties: {}, sourceRef: '' }
        ],
        relationships: [],
        sourceInfo: {
          cycleId: 'cycle-001',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.nodesCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Database error');
    });

    it('should skip existing relationships', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);
      mockGraphService.createNode
        .mockResolvedValueOnce(createMockNode({ entityId: 'entity-a' }))
        .mockResolvedValueOnce(createMockNode({ entityId: 'entity-b' }));
      mockGraphService.getConnectedEdges.mockResolvedValue([
        createMockEdge({ targetEntityId: 'entity-b', edgeType: 'CALLS' })
      ]);

      const extractionResult: ExtractionResult = {
        entities: [
          { externalId: 'ext-a', type: 'function', name: 'funcA', properties: {}, sourceRef: '' },
          { externalId: 'ext-b', type: 'function', name: 'funcB', properties: {}, sourceRef: '' }
        ],
        relationships: [
          {
            sourceExternalId: 'ext-a',
            targetExternalId: 'ext-b',
            type: 'CALLS',
            properties: {},
            confidence: 0.95
          }
        ],
        sourceInfo: {
          cycleId: 'cycle-001',
          projectId: 'test-project',
          sourceSystem: 'git',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      const result = await adapter.importExtractionResult(extractionResult);

      expect(result.edgesCreated).toBe(0);
      expect(result.edgesUpdated).toBe(1);
      expect(mockGraphService.createEdge).not.toHaveBeenCalled();
    });

    it('should map entity types correctly', async () => {
      mockGraphService.queryNodes.mockResolvedValue([]);
      mockGraphService.createNode.mockResolvedValue(createMockNode());

      const extractionResult: ExtractionResult = {
        entities: [
          { externalId: 'ext-001', type: 'stored_procedure', name: 'sp_test', properties: {}, sourceRef: '' }
        ],
        relationships: [],
        sourceInfo: {
          cycleId: 'cycle-001',
          projectId: 'test-project',
          sourceSystem: 'tfvc',
          extractedAt: new Date(),
          extractorVersion: '1.0.0'
        }
      };

      await adapter.importExtractionResult(extractionResult);

      expect(mockGraphService.createNode).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeType: 'StoredProcedure'
        })
      );
    });
  });
});
