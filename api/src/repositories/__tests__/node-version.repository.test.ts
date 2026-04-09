/**
 * Unit tests for NodeVersionRepository
 */

import { NodeVersionRepository } from '../node-version.repository';
import { MemgraphClient } from '../../db/memgraph.client';
import { NodeVersion, NodeStatus, ChangeType, Namespace } from '../../types/immutable-graph.types';

// Mock the MemgraphClient
jest.mock('../../db/memgraph.client');

describe('NodeVersionRepository', () => {
  let repository: NodeVersionRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const sampleNode: NodeVersion = {
    versionId: 'v-001',
    entityId: 'e-001',
    namespace: Namespace.CORE,
    sequenceNumber: BigInt(1),
    versionName: 'CORE-9000-Genesis-node-001',
    status: NodeStatus.ACTIVE,
    ttStart: new Date('2024-01-01T00:00:00Z'),
    ttEnd: null,
    vtStart: new Date('2024-01-01T00:00:00Z'),
    vtEnd: null,
    previousVersionId: null,
    supersededById: null,
    mergedFromIds: [],
    splitIntoIds: [],
    changeType: ChangeType.CREATE,
    changeReason: 'Initial creation',
    changedBy: 'user-001',
    changeSource: 'api',
    extractionCycleId: null,
    contentHash: 'abc123',
    previousHash: null,
    chainHash: 'chain123',
    signature: null,
    properties: { name: 'Test Node', type: 'concept' },
    nodeType: 'Concept'
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new NodeVersionRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a node version', async () => {
      const mockRecord = {
        n: {
          versionId: sampleNode.versionId,
          entityId: sampleNode.entityId,
          namespace: sampleNode.namespace,
          sequenceNumber: 1,
          versionName: sampleNode.versionName,
          status: sampleNode.status,
          ttStart: sampleNode.ttStart.toISOString(),
          ttEnd: null,
          vtStart: sampleNode.vtStart.toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          mergedFromIds: [],
          splitIntoIds: [],
          changeType: sampleNode.changeType,
          changeReason: sampleNode.changeReason,
          changedBy: sampleNode.changedBy,
          changeSource: sampleNode.changeSource,
          extractionCycleId: null,
          contentHash: sampleNode.contentHash,
          previousHash: null,
          chainHash: sampleNode.chainHash,
          signature: null,
          properties: JSON.stringify(sampleNode.properties),
          nodeType: sampleNode.nodeType
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(sampleNode);

      expect(mockClient.executeWrite).toHaveBeenCalledTimes(1);
      expect(result.versionId).toBe(sampleNode.versionId);
      expect(result.entityId).toBe(sampleNode.entityId);
      expect(result.status).toBe(NodeStatus.ACTIVE);
    });
  });

  describe('findByVersionId', () => {
    it('should find a node by version ID', async () => {
      const mockRecord = {
        n: {
          versionId: sampleNode.versionId,
          entityId: sampleNode.entityId,
          namespace: sampleNode.namespace,
          sequenceNumber: 1,
          versionName: sampleNode.versionName,
          status: sampleNode.status,
          ttStart: sampleNode.ttStart.toISOString(),
          ttEnd: null,
          vtStart: sampleNode.vtStart.toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          mergedFromIds: [],
          splitIntoIds: [],
          changeType: sampleNode.changeType,
          changeReason: sampleNode.changeReason,
          changedBy: sampleNode.changedBy,
          changeSource: sampleNode.changeSource,
          extractionCycleId: null,
          contentHash: sampleNode.contentHash,
          previousHash: null,
          chainHash: sampleNode.chainHash,
          signature: null,
          properties: JSON.stringify(sampleNode.properties),
          nodeType: sampleNode.nodeType
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findByVersionId('v-001');

      expect(result).not.toBeNull();
      expect(result!.versionId).toBe('v-001');
    });

    it('should return null when node not found', async () => {
      mockClient.executeQuery.mockResolvedValue([]);

      const result = await repository.findByVersionId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findActiveByEntityId', () => {
    it('should find active node by entity ID', async () => {
      const mockRecord = {
        n: {
          versionId: sampleNode.versionId,
          entityId: sampleNode.entityId,
          namespace: sampleNode.namespace,
          sequenceNumber: 1,
          versionName: sampleNode.versionName,
          status: 'ACTIVE',
          ttStart: sampleNode.ttStart.toISOString(),
          ttEnd: null,
          vtStart: sampleNode.vtStart.toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          mergedFromIds: [],
          splitIntoIds: [],
          changeType: sampleNode.changeType,
          changeReason: sampleNode.changeReason,
          changedBy: sampleNode.changedBy,
          changeSource: sampleNode.changeSource,
          extractionCycleId: null,
          contentHash: sampleNode.contentHash,
          previousHash: null,
          chainHash: sampleNode.chainHash,
          signature: null,
          properties: JSON.stringify(sampleNode.properties),
          nodeType: sampleNode.nodeType
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findActiveByEntityId('e-001');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(NodeStatus.ACTIVE);
    });
  });

  describe('updateStatus', () => {
    it('should update node status', async () => {
      const mockRecord = {
        n: {
          versionId: sampleNode.versionId,
          entityId: sampleNode.entityId,
          namespace: sampleNode.namespace,
          sequenceNumber: 1,
          versionName: sampleNode.versionName,
          status: 'DEPRECATED',
          ttStart: sampleNode.ttStart.toISOString(),
          ttEnd: new Date().toISOString(),
          vtStart: sampleNode.vtStart.toISOString(),
          vtEnd: null,
          previousVersionId: null,
          supersededById: null,
          mergedFromIds: [],
          splitIntoIds: [],
          changeType: sampleNode.changeType,
          changeReason: sampleNode.changeReason,
          changedBy: sampleNode.changedBy,
          changeSource: sampleNode.changeSource,
          extractionCycleId: null,
          contentHash: sampleNode.contentHash,
          previousHash: null,
          chainHash: sampleNode.chainHash,
          signature: null,
          properties: JSON.stringify(sampleNode.properties),
          nodeType: sampleNode.nodeType
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.updateStatus('v-001', NodeStatus.DEPRECATED);

      expect(result.status).toBe(NodeStatus.DEPRECATED);
      expect(result.ttEnd).not.toBeNull();
    });

    it('should throw when node not found', async () => {
      mockClient.executeWrite.mockResolvedValue([]);

      await expect(repository.updateStatus('non-existent', NodeStatus.DEPRECATED))
        .rejects.toThrow();
    });
  });

  describe('findByNamespace', () => {
    it('should find nodes by namespace', async () => {
      const mockRecords = [
        {
          n: {
            versionId: 'v-001',
            entityId: 'e-001',
            namespace: Namespace.CORE,
            sequenceNumber: 1,
            versionName: 'CORE-9000-Genesis-node-001',
            status: 'ACTIVE',
            ttStart: new Date().toISOString(),
            ttEnd: null,
            vtStart: new Date().toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: null,
            mergedFromIds: [],
            splitIntoIds: [],
            changeType: 'CREATE',
            changeReason: 'Test',
            changedBy: 'user',
            changeSource: 'api',
            extractionCycleId: null,
            contentHash: 'hash1',
            previousHash: null,
            chainHash: 'chain1',
            signature: null,
            properties: '{}',
            nodeType: 'Concept'
          }
        },
        {
          n: {
            versionId: 'v-002',
            entityId: 'e-002',
            namespace: Namespace.CORE,
            sequenceNumber: 2,
            versionName: 'CORE-9000-Genesis-node-002',
            status: 'ACTIVE',
            ttStart: new Date().toISOString(),
            ttEnd: null,
            vtStart: new Date().toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: null,
            mergedFromIds: [],
            splitIntoIds: [],
            changeType: 'CREATE',
            changeReason: 'Test',
            changedBy: 'user',
            changeSource: 'api',
            extractionCycleId: null,
            contentHash: 'hash2',
            previousHash: null,
            chainHash: 'chain2',
            signature: null,
            properties: '{}',
            nodeType: 'Concept'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findByNamespace(Namespace.CORE, NodeStatus.ACTIVE);

      expect(results).toHaveLength(2);
      expect(results[0].namespace).toBe(Namespace.CORE);
    });
  });

  describe('createVersionOfRelationship', () => {
    it('should create VERSION_OF relationship', async () => {
      mockClient.executeWrite.mockResolvedValue([]);

      await repository.createVersionOfRelationship('v-002', 'v-001');

      expect(mockClient.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('VERSION_OF'),
        { fromVersionId: 'v-002', toVersionId: 'v-001' }
      );
    });
  });

  describe('queryAtValidTime', () => {
    it('should query nodes at a specific valid time', async () => {
      const mockRecords = [
        {
          n: {
            versionId: 'v-001',
            entityId: 'e-001',
            namespace: Namespace.CORE,
            sequenceNumber: 1,
            versionName: 'CORE-9000-Genesis-node-001',
            status: 'ACTIVE',
            ttStart: new Date('2024-01-01').toISOString(),
            ttEnd: null,
            vtStart: new Date('2024-01-01').toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: null,
            mergedFromIds: [],
            splitIntoIds: [],
            changeType: 'CREATE',
            changeReason: 'Test',
            changedBy: 'user',
            changeSource: 'api',
            extractionCycleId: null,
            contentHash: 'hash1',
            previousHash: null,
            chainHash: 'chain1',
            signature: null,
            properties: '{}',
            nodeType: 'Concept'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const validTime = new Date('2024-06-15');
      const results = await repository.queryAtValidTime(Namespace.CORE, validTime);

      expect(mockClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('vtStart'),
        expect.objectContaining({
          namespace: Namespace.CORE,
          validTime: validTime.toISOString()
        })
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('getLineage', () => {
    it('should get node version lineage', async () => {
      const mockRecords = [
        {
          version: {
            versionId: 'v-001',
            entityId: 'e-001',
            namespace: Namespace.CORE,
            sequenceNumber: 1,
            versionName: 'CORE-9000-Genesis-node-001',
            status: 'SUPERSEDED',
            ttStart: new Date('2024-01-01').toISOString(),
            ttEnd: new Date('2024-02-01').toISOString(),
            vtStart: new Date('2024-01-01').toISOString(),
            vtEnd: null,
            previousVersionId: null,
            supersededById: 'v-002',
            mergedFromIds: [],
            splitIntoIds: [],
            changeType: 'CREATE',
            changeReason: 'Initial',
            changedBy: 'user',
            changeSource: 'api',
            extractionCycleId: null,
            contentHash: 'hash1',
            previousHash: null,
            chainHash: 'chain1',
            signature: null,
            properties: '{}',
            nodeType: 'Concept'
          }
        },
        {
          version: {
            versionId: 'v-002',
            entityId: 'e-001',
            namespace: Namespace.CORE,
            sequenceNumber: 2,
            versionName: 'CORE-9000-Update-node-002',
            status: 'ACTIVE',
            ttStart: new Date('2024-02-01').toISOString(),
            ttEnd: null,
            vtStart: new Date('2024-02-01').toISOString(),
            vtEnd: null,
            previousVersionId: 'v-001',
            supersededById: null,
            mergedFromIds: [],
            splitIntoIds: [],
            changeType: 'UPDATE',
            changeReason: 'Updated content',
            changedBy: 'user',
            changeSource: 'api',
            extractionCycleId: null,
            contentHash: 'hash2',
            previousHash: 'hash1',
            chainHash: 'chain2',
            signature: null,
            properties: '{}',
            nodeType: 'Concept'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const lineage = await repository.getLineage('e-001');

      expect(lineage).toHaveLength(2);
      expect(lineage[0].sequenceNumber).toBeLessThan(lineage[1].sequenceNumber);
    });
  });
});
