/**
 * Unit tests for EdgeVersionRepository
 */

import { EdgeVersionRepository } from '../edge-version.repository';
import { MemgraphClient } from '../../db/memgraph.client';
import { EdgeVersion, EdgeStatus, OrphanedReason, ChangeType, Namespace } from '../../types/immutable-graph.types';

jest.mock('../../db/memgraph.client');

describe('EdgeVersionRepository', () => {
  let repository: EdgeVersionRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const sampleEdge: EdgeVersion = {
    versionId: 'ev-001',
    edgeId: 'edge-001',
    sourceEntityId: 'e-001',
    targetEntityId: 'e-002',
    edgeType: 'RELATES_TO',
    namespace: Namespace.CORE,
    sequenceNumber: BigInt(1),
    versionName: 'CORE-9000-Genesis-edge-001',
    status: EdgeStatus.ACTIVE,
    orphanedReason: null,
    orphanedAt: null,
    orphanedByNodeId: null,
    originalStatus: null,
    ttStart: new Date('2024-01-01T00:00:00Z'),
    ttEnd: null,
    vtStart: new Date('2024-01-01T00:00:00Z'),
    vtEnd: null,
    previousVersionId: null,
    supersededById: null,
    changeType: ChangeType.CREATE,
    changeReason: 'Initial edge creation',
    changedBy: 'user-001',
    contentHash: 'edgehash123',
    previousHash: null,
    chainHash: 'edgechain123',
    properties: { weight: 1.0, label: 'relates' }
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new EdgeVersionRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an edge version', async () => {
      const mockRecord = {
        e: {
          versionId: sampleEdge.versionId,
          edgeId: sampleEdge.edgeId,
          sourceEntityId: sampleEdge.sourceEntityId,
          targetEntityId: sampleEdge.targetEntityId,
          edgeType: sampleEdge.edgeType,
          namespace: sampleEdge.namespace,
          sequenceNumber: 1,
          versionName: sampleEdge.versionName,
          status: sampleEdge.status,
          orphanedReason: null,
          orphanedAt: null,
          orphanedByNodeId: null,
          originalStatus: null,
          ttStart: sampleEdge.ttStart.toISOString(),
          ttEnd: null,
          vtStart: sampleEdge.vtStart.toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          changeType: sampleEdge.changeType,
          changeReason: sampleEdge.changeReason,
          changedBy: sampleEdge.changedBy,
          contentHash: sampleEdge.contentHash,
          previousHash: null,
          chainHash: sampleEdge.chainHash,
          properties: JSON.stringify(sampleEdge.properties)
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(sampleEdge);

      expect(mockClient.executeWrite).toHaveBeenCalledTimes(1);
      expect(result.versionId).toBe(sampleEdge.versionId);
      expect(result.edgeId).toBe(sampleEdge.edgeId);
      expect(result.status).toBe(EdgeStatus.ACTIVE);
    });
  });

  describe('findActiveByEdgeId', () => {
    it('should find active edge by edge ID', async () => {
      const mockRecord = {
        e: {
          versionId: sampleEdge.versionId,
          edgeId: sampleEdge.edgeId,
          sourceEntityId: sampleEdge.sourceEntityId,
          targetEntityId: sampleEdge.targetEntityId,
          edgeType: sampleEdge.edgeType,
          namespace: sampleEdge.namespace,
          sequenceNumber: 1,
          versionName: sampleEdge.versionName,
          status: 'ACTIVE',
          orphanedReason: null,
          orphanedAt: null,
          orphanedByNodeId: null,
          originalStatus: null,
          ttStart: sampleEdge.ttStart.toISOString(),
          ttEnd: null,
          vtStart: sampleEdge.vtStart.toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          changeType: sampleEdge.changeType,
          changeReason: sampleEdge.changeReason,
          changedBy: sampleEdge.changedBy,
          contentHash: sampleEdge.contentHash,
          previousHash: null,
          chainHash: sampleEdge.chainHash,
          properties: JSON.stringify(sampleEdge.properties)
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findActiveByEdgeId('edge-001');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(EdgeStatus.ACTIVE);
    });
  });

  describe('findBySourceEntityId', () => {
    it('should find edges by source entity ID', async () => {
      const mockRecords = [
        {
          e: {
            versionId: 'ev-001',
            edgeId: 'edge-001',
            sourceEntityId: 'e-001',
            targetEntityId: 'e-002',
            edgeType: 'RELATES_TO',
            namespace: Namespace.CORE,
            sequenceNumber: 1,
            versionName: 'CORE-9000-Genesis-edge-001',
            status: 'ACTIVE',
            orphanedReason: null,
            orphanedAt: null,
            orphanedByNodeId: null,
            originalStatus: null,
            ttStart: new Date().toISOString(),
            ttEnd: null,
            vtStart: new Date().toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: null,
            changeType: 'CREATE',
            changeReason: 'Test',
            changedBy: 'user',
            contentHash: 'hash1',
            previousHash: null,
            chainHash: 'chain1',
            properties: '{}'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findBySourceEntityId('e-001');

      expect(results).toHaveLength(1);
      expect(results[0].sourceEntityId).toBe('e-001');
    });
  });

  describe('findConnectedEdges', () => {
    it('should find edges connected to an entity', async () => {
      const mockRecords = [
        {
          e: {
            versionId: 'ev-001',
            edgeId: 'edge-001',
            sourceEntityId: 'e-001',
            targetEntityId: 'e-002',
            edgeType: 'RELATES_TO',
            namespace: Namespace.CORE,
            sequenceNumber: 1,
            versionName: 'CORE-9000-Genesis-edge-001',
            status: 'ACTIVE',
            orphanedReason: null,
            orphanedAt: null,
            orphanedByNodeId: null,
            originalStatus: null,
            ttStart: new Date().toISOString(),
            ttEnd: null,
            vtStart: new Date().toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: null,
            changeType: 'CREATE',
            changeReason: 'Test',
            changedBy: 'user',
            contentHash: 'hash1',
            previousHash: null,
            chainHash: 'chain1',
            properties: '{}'
          }
        },
        {
          e: {
            versionId: 'ev-002',
            edgeId: 'edge-002',
            sourceEntityId: 'e-003',
            targetEntityId: 'e-001',
            edgeType: 'DEPENDS_ON',
            namespace: Namespace.CORE,
            sequenceNumber: 2,
            versionName: 'CORE-9000-Genesis-edge-002',
            status: 'ACTIVE',
            orphanedReason: null,
            orphanedAt: null,
            orphanedByNodeId: null,
            originalStatus: null,
            ttStart: new Date().toISOString(),
            ttEnd: null,
            vtStart: new Date().toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: null,
            changeType: 'CREATE',
            changeReason: 'Test',
            changedBy: 'user',
            contentHash: 'hash2',
            previousHash: null,
            chainHash: 'chain2',
            properties: '{}'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findConnectedEdges('e-001', EdgeStatus.ACTIVE);

      expect(results).toHaveLength(2);
    });
  });

  describe('orphanEdge', () => {
    it('should orphan a single edge', async () => {
      const mockRecord = {
        e: {
          versionId: 'ev-001',
          edgeId: 'edge-001',
          sourceEntityId: 'e-001',
          targetEntityId: 'e-002',
          edgeType: 'RELATES_TO',
          namespace: Namespace.CORE,
          sequenceNumber: 1,
          versionName: 'CORE-9000-Genesis-edge-001',
          status: 'ORPHANED',
          orphanedReason: 'SOURCE_DEPRECATED',
          orphanedAt: new Date().toISOString(),
          orphanedByNodeId: 'e-001',
          originalStatus: 'ACTIVE',
          ttStart: new Date().toISOString(),
          ttEnd: new Date().toISOString(),
          vtStart: new Date().toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          changeType: 'CREATE',
          changeReason: 'Test',
          changedBy: 'user',
          contentHash: 'hash1',
          previousHash: null,
          chainHash: 'chain1',
          properties: '{}'
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.orphanEdge('ev-001', OrphanedReason.SOURCE_DEPRECATED, 'e-001');

      expect(result.status).toBe(EdgeStatus.ORPHANED);
      expect(result.orphanedReason).toBe(OrphanedReason.SOURCE_DEPRECATED);
      expect(result.originalStatus).toBe(EdgeStatus.ACTIVE);
    });

    it('should throw when edge not found', async () => {
      mockClient.executeWrite.mockResolvedValue([]);

      await expect(repository.orphanEdge('non-existent', OrphanedReason.SOURCE_DEPRECATED, 'e-001'))
        .rejects.toThrow();
    });
  });

  describe('orphanEdgesByNodeId', () => {
    it('should orphan all edges connected to a node', async () => {
      mockClient.executeWrite.mockResolvedValue([{ orphanedCount: 5 }]);

      const count = await repository.orphanEdgesByNodeId('e-001');

      expect(count).toBe(5);
      expect(mockClient.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('orphanedReason'),
        { nodeEntityId: 'e-001' }
      );
    });
  });

  describe('restoreOrphanedEdges', () => {
    it('should restore orphaned edges by node ID', async () => {
      mockClient.executeWrite.mockResolvedValue([{ restoredCount: 3 }]);

      const count = await repository.restoreOrphanedEdges('e-001');

      expect(count).toBe(3);
      expect(mockClient.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('originalStatus'),
        { nodeEntityId: 'e-001' }
      );
    });
  });

  describe('updateStatus', () => {
    it('should update edge status', async () => {
      const mockRecord = {
        e: {
          versionId: 'ev-001',
          edgeId: 'edge-001',
          sourceEntityId: 'e-001',
          targetEntityId: 'e-002',
          edgeType: 'RELATES_TO',
          namespace: Namespace.CORE,
          sequenceNumber: 1,
          versionName: 'CORE-9000-Genesis-edge-001',
          status: 'DEPRECATED',
          orphanedReason: null,
          orphanedAt: null,
          orphanedByNodeId: null,
          originalStatus: null,
          ttStart: new Date().toISOString(),
          ttEnd: new Date().toISOString(),
          vtStart: new Date().toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          changeType: 'CREATE',
          changeReason: 'Test',
          changedBy: 'user',
          contentHash: 'hash1',
          previousHash: null,
          chainHash: 'chain1',
          properties: '{}'
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.updateStatus('ev-001', EdgeStatus.DEPRECATED);

      expect(result.status).toBe(EdgeStatus.DEPRECATED);
      expect(result.ttEnd).not.toBeNull();
    });
  });

  describe('createConnectsRelationship', () => {
    it('should create CONNECTS relationship', async () => {
      mockClient.executeWrite.mockResolvedValue([]);

      await repository.createConnectsRelationship('ev-001', 'nv-001', 'SOURCE');

      expect(mockClient.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CONNECTS'),
        { edgeVersionId: 'ev-001', nodeVersionId: 'nv-001', role: 'SOURCE' }
      );
    });
  });
});
