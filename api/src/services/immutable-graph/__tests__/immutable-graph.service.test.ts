/**
 * Unit tests for ImmutableGraphService
 */

// Mock uuid before imports
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-v4'
}));

import { ImmutableGraphService } from '../immutable-graph.service';
import { NamespaceService } from '../namespace.service';
import { GodModeService } from '../god-mode.service';
import { NodeVersionRepository } from '../../../repositories/node-version.repository';
import { EdgeVersionRepository } from '../../../repositories/edge-version.repository';
import { MergeRecordRepository } from '../../../repositories/merge-record.repository';
import {
  NodeVersion,
  EdgeVersion,
  NodeStatus,
  EdgeStatus,
  ChangeType,
  Namespace,
  VersionCodename,
  EntityNotFoundError
} from '../../../types/immutable-graph.types';

// Mock all repositories
jest.mock('../../../repositories/node-version.repository');
jest.mock('../../../repositories/edge-version.repository');
jest.mock('../../../repositories/merge-record.repository');
jest.mock('../namespace.service');
jest.mock('../god-mode.service');

// Mock HashService for chain verification
jest.mock('../hash.service', () => ({
  HashService: {
    calculateContentHash: jest.fn().mockReturnValue('mock-content-hash'),
    calculateChainHash: jest.fn().mockReturnValue('mock-chain-hash'),
    verifyChain: jest.fn().mockReturnValue(true)
  }
}));

describe('ImmutableGraphService', () => {
  let service: ImmutableGraphService;
  let mockNodeRepo: jest.Mocked<NodeVersionRepository>;
  let mockEdgeRepo: jest.Mocked<EdgeVersionRepository>;
  let mockMergeRecordRepo: jest.Mocked<MergeRecordRepository>;
  let mockNamespaceService: jest.Mocked<NamespaceService>;
  let mockGodModeService: jest.Mocked<GodModeService>;

  const createMockNode = (overrides: Partial<NodeVersion> = {}): NodeVersion => ({
    versionId: 'v-001',
    entityId: 'e-001',
    namespace: Namespace.PROJECT,
    sequenceNumber: BigInt(1),
    versionName: 'PRJ-9000-Genesis-node-001',
    status: NodeStatus.ACTIVE,
    ttStart: new Date('2024-01-01'),
    ttEnd: null,
    vtStart: new Date('2024-01-01'),
    vtEnd: null,
    previousVersionId: null,
    supersededById: null,
    mergedFromIds: [],
    splitIntoIds: [],
    changeType: ChangeType.CREATE,
    changeReason: 'Test creation',
    changedBy: 'test-user',
    changeSource: 'test',
    extractionCycleId: null,
    contentHash: 'hash123',
    previousHash: null,
    chainHash: 'chain123',
    signature: null,
    properties: { name: 'Test Node' },
    nodeType: 'Function',
    ...overrides
  });

  const createMockEdge = (overrides: Partial<EdgeVersion> = {}): EdgeVersion => ({
    versionId: 'ev-001',
    edgeId: 'edge-001',
    sourceEntityId: 'e-001',
    targetEntityId: 'e-002',
    edgeType: 'CALLS',
    namespace: Namespace.PROJECT,
    sequenceNumber: BigInt(1),
    versionName: 'PRJ-9000-Genesis-edge-001',
    status: EdgeStatus.ACTIVE,
    orphanedReason: null,
    orphanedAt: null,
    orphanedByNodeId: null,
    originalStatus: null,
    ttStart: new Date('2024-01-01'),
    ttEnd: null,
    vtStart: new Date('2024-01-01'),
    vtEnd: null,
    previousVersionId: null,
    supersededById: null,
    changeType: ChangeType.CREATE,
    changeReason: 'Test edge',
    changedBy: 'test-user',
    contentHash: 'edgehash123',
    previousHash: null,
    chainHash: 'edgechain123',
    properties: {},
    ...overrides
  });

  beforeEach(() => {
    mockNodeRepo = {
      create: jest.fn(),
      findByVersionId: jest.fn(),
      findActiveByEntityId: jest.fn(),
      findAllVersionsByEntityId: jest.fn(),
      findByNamespace: jest.fn(),
      updateStatus: jest.fn(),
      setSupersededBy: jest.fn(),
      createVersionOfRelationship: jest.fn(),
      createSupersedesRelationship: jest.fn(),
      createMergedFromRelationship: jest.fn(),
      queryAtValidTime: jest.fn(),
      queryAtTransactionTime: jest.fn(),
      queryAtBothTimes: jest.fn(),
      getLineage: jest.fn()
    } as unknown as jest.Mocked<NodeVersionRepository>;

    mockEdgeRepo = {
      create: jest.fn(),
      findByVersionId: jest.fn(),
      findActiveByEdgeId: jest.fn(),
      findBySourceEntityId: jest.fn(),
      findByTargetEntityId: jest.fn(),
      findConnectedEdges: jest.fn(),
      updateStatus: jest.fn(),
      orphanEdge: jest.fn(),
      orphanEdgesByNodeId: jest.fn(),
      restoreOrphanedEdges: jest.fn(),
      createConnectsRelationship: jest.fn()
    } as unknown as jest.Mocked<EdgeVersionRepository>;

    mockMergeRecordRepo = {
      create: jest.fn(),
      findByMergeId: jest.fn(),
      findByResultEntityId: jest.fn(),
      findBySourceEntityId: jest.fn()
    } as unknown as jest.Mocked<MergeRecordRepository>;

    mockNamespaceService = {
      getOrCreate: jest.fn(),
      getNextVersion: jest.fn(),
      incrementEpoch: jest.fn(),
      isGodModeAllowed: jest.fn()
    } as unknown as jest.Mocked<NamespaceService>;

    mockGodModeService = {
      requireActiveSession: jest.fn(),
      createAuditRecord: jest.fn(),
      markForDeletion: jest.fn(),
      canConfirmDeletion: jest.fn(),
      confirmDeletion: jest.fn(),
      createTombstone: jest.fn(),
      markDeletionExecuted: jest.fn()
    } as unknown as jest.Mocked<GodModeService>;

    service = new ImmutableGraphService(
      mockNodeRepo,
      mockEdgeRepo,
      mockMergeRecordRepo,
      mockNamespaceService,
      mockGodModeService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createNode', () => {
    it('should create a new node with correct version metadata', async () => {
      const expectedNode = createMockNode();

      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Genesis-node-001',
        epoch: 9000,
        sequence: BigInt(1)
      });
      mockNodeRepo.create.mockResolvedValue(expectedNode);

      const result = await service.createNode({
        namespace: Namespace.PROJECT,
        nodeType: 'Function',
        properties: { name: 'Test Node' },
        changeReason: 'Test creation',
        changedBy: 'test-user',
        changeSource: 'test'
      });

      expect(result.status).toBe(NodeStatus.ACTIVE);
      expect(result.changeType).toBe(ChangeType.CREATE);
      expect(mockNodeRepo.create).toHaveBeenCalledTimes(1);
      expect(mockNamespaceService.getNextVersion).toHaveBeenCalledWith(
        Namespace.PROJECT,
        'node',
        VersionCodename.Genesis,
        undefined
      );
    });

    it('should generate content and chain hash', async () => {
      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Genesis-node-001',
        epoch: 9000,
        sequence: BigInt(1)
      });
      mockNodeRepo.create.mockImplementation(async (node) => node);

      const result = await service.createNode({
        namespace: Namespace.PROJECT,
        nodeType: 'Function',
        properties: { name: 'Test' },
        changeReason: 'Test',
        changedBy: 'user',
        changeSource: 'test'
      });

      // With HashService mocked, we check that hashes are set (actual values are mocked)
      expect(result.contentHash).toBeTruthy();
      expect(result.chainHash).toBeTruthy();
      expect(result.previousHash).toBeNull();
    });
  });

  describe('updateNode', () => {
    it('should create new version and supersede old one', async () => {
      const originalNode = createMockNode();
      const updatedNode = createMockNode({
        versionId: 'v-002',
        sequenceNumber: BigInt(2),
        versionName: 'PRJ-9000-Refinement-node-002',
        previousVersionId: 'v-001',
        changeType: ChangeType.UPDATE,
        properties: { name: 'Test Node', updated: true }
      });

      mockNodeRepo.findActiveByEntityId.mockResolvedValue(originalNode);
      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Refinement-node-002',
        epoch: 9000,
        sequence: BigInt(2)
      });
      mockNodeRepo.updateStatus.mockResolvedValue({ ...originalNode, status: NodeStatus.SUPERSEDED });
      mockNodeRepo.create.mockResolvedValue(updatedNode);

      const result = await service.updateNode({
        entityId: 'e-001',
        newProperties: { updated: true },
        changeReason: 'Update test',
        changedBy: 'test-user'
      });

      expect(result.versionId).toBe('v-002');
      expect(result.previousVersionId).toBe('v-001');
      expect(result.changeType).toBe(ChangeType.UPDATE);
      expect(mockNodeRepo.updateStatus).toHaveBeenCalledWith('v-001', NodeStatus.SUPERSEDED, 'mock-uuid-v4');
      expect(mockNodeRepo.createVersionOfRelationship).toHaveBeenCalled();
      expect(mockNodeRepo.createSupersedesRelationship).toHaveBeenCalled();
    });

    it('should throw EntityNotFoundError for non-existent entity', async () => {
      mockNodeRepo.findActiveByEntityId.mockResolvedValue(null);

      await expect(service.updateNode({
        entityId: 'non-existent',
        newProperties: { test: true },
        changeReason: 'Test',
        changedBy: 'test-user'
      })).rejects.toThrow(EntityNotFoundError);
    });

    it('should maintain hash chain integrity', async () => {
      const originalNode = createMockNode({
        contentHash: 'original-content-hash',
        chainHash: 'original-chain-hash'
      });

      mockNodeRepo.findActiveByEntityId.mockResolvedValue(originalNode);
      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Refinement-node-002',
        epoch: 9000,
        sequence: BigInt(2)
      });
      mockNodeRepo.updateStatus.mockResolvedValue({ ...originalNode, status: NodeStatus.SUPERSEDED });
      mockNodeRepo.create.mockImplementation(async (node) => node);

      const result = await service.updateNode({
        entityId: 'e-001',
        newProperties: { updated: true },
        changeReason: 'Update',
        changedBy: 'user'
      });

      expect(result.previousHash).toBe('original-content-hash');
      expect(result.contentHash).not.toBe('original-content-hash');
      expect(result.chainHash).not.toBe('original-chain-hash');
    });
  });

  describe('deprecateNode', () => {
    it('should deprecate node and orphan connected edges', async () => {
      const node = createMockNode();
      const deprecatedNode = { ...node, status: NodeStatus.DEPRECATED };

      mockNodeRepo.findActiveByEntityId.mockResolvedValue(node);
      mockNodeRepo.updateStatus.mockResolvedValue(deprecatedNode);
      mockEdgeRepo.orphanEdgesByNodeId.mockResolvedValue(3);

      const result = await service.deprecateNode('e-001', 'No longer needed', 'test-user');

      expect(result.node.status).toBe(NodeStatus.DEPRECATED);
      expect(result.orphanedEdgesCount).toBe(3);
      expect(mockEdgeRepo.orphanEdgesByNodeId).toHaveBeenCalledWith('e-001');
    });

    it('should throw for non-existent node', async () => {
      mockNodeRepo.findActiveByEntityId.mockResolvedValue(null);

      await expect(service.deprecateNode('non-existent', 'Test', 'user'))
        .rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('mergeNodes', () => {
    it('should merge two nodes into one', async () => {
      const nodeA = createMockNode({ entityId: 'e-001', properties: { name: 'A', propA: true } });
      const nodeB = createMockNode({
        versionId: 'v-002',
        entityId: 'e-002',
        properties: { name: 'B', propB: true }
      });

      mockNodeRepo.findActiveByEntityId
        .mockResolvedValueOnce(nodeA)
        .mockResolvedValueOnce(nodeB);
      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Consolidation-node-003',
        epoch: 9000,
        sequence: BigInt(3)
      });
      mockNodeRepo.create.mockImplementation(async (node) => node);
      mockNodeRepo.updateStatus.mockImplementation(async (vid, status) =>
        createMockNode({ versionId: vid, status })
      );
      mockMergeRecordRepo.create.mockImplementation(async (record) => record);
      mockEdgeRepo.findConnectedEdges.mockResolvedValue([]);

      const result = await service.mergeNodes({
        entityIdA: 'e-001',
        entityIdB: 'e-002',
        mergeReason: 'Duplicate entities',
        mergedBy: 'test-user'
      });

      expect(result.mergedNode.status).toBe(NodeStatus.ACTIVE);
      expect(result.mergedNode.changeType).toBe(ChangeType.MERGE);
      expect(result.mergedNode.mergedFromIds).toContain('e-001');
      expect(result.mergedNode.mergedFromIds).toContain('e-002');
      expect(result.mergedNode.properties.name).toBe('B'); // B priority
      expect(result.mergedNode.properties.propA).toBe(true);
      expect(result.mergedNode.properties.propB).toBe(true);
      expect(result.mergeRecord.mergeStrategy).toBe('UNION');
    });

    it('should reject merge of nodes from different namespaces', async () => {
      const nodeA = createMockNode({ namespace: Namespace.PROJECT });
      const nodeB = createMockNode({ namespace: Namespace.CORE });

      mockNodeRepo.findActiveByEntityId
        .mockResolvedValueOnce(nodeA)
        .mockResolvedValueOnce(nodeB);

      await expect(service.mergeNodes({
        entityIdA: 'e-001',
        entityIdB: 'e-002',
        mergeReason: 'Test',
        mergedBy: 'user'
      })).rejects.toThrow('different namespaces');
    });

    it('should reject merge of nodes with different types', async () => {
      const nodeA = createMockNode({ nodeType: 'Function' });
      const nodeB = createMockNode({ nodeType: 'Class' });

      mockNodeRepo.findActiveByEntityId
        .mockResolvedValueOnce(nodeA)
        .mockResolvedValueOnce(nodeB);

      await expect(service.mergeNodes({
        entityIdA: 'e-001',
        entityIdB: 'e-002',
        mergeReason: 'Test',
        mergedBy: 'user'
      })).rejects.toThrow('different types');
    });

    it('should migrate edges to merged node', async () => {
      const nodeA = createMockNode({ entityId: 'e-001' });
      const nodeB = createMockNode({ entityId: 'e-002', versionId: 'v-002' });
      const edgeA = createMockEdge({ sourceEntityId: 'e-001', targetEntityId: 'e-003' });

      mockNodeRepo.findActiveByEntityId
        .mockResolvedValueOnce(nodeA)
        .mockResolvedValueOnce(nodeB)
        .mockResolvedValue(createMockNode({ entityId: 'e-003', versionId: 'v-003' }));
      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Consolidation-node-003',
        epoch: 9000,
        sequence: BigInt(3)
      });
      mockNodeRepo.create.mockImplementation(async (node) => node);
      mockNodeRepo.updateStatus.mockImplementation(async (vid, status) =>
        createMockNode({ versionId: vid, status })
      );
      mockMergeRecordRepo.create.mockImplementation(async (record) => record);
      mockEdgeRepo.findConnectedEdges
        .mockResolvedValueOnce([edgeA])
        .mockResolvedValueOnce([]);
      mockEdgeRepo.create.mockImplementation(async (edge) => edge);

      const result = await service.mergeNodes({
        entityIdA: 'e-001',
        entityIdB: 'e-002',
        mergeReason: 'Test',
        mergedBy: 'user'
      });

      expect(result.migratedEdges).toBe(1);
      expect(mockEdgeRepo.updateStatus).toHaveBeenCalledWith('ev-001', EdgeStatus.SUPERSEDED);
    });
  });

  describe('createEdge', () => {
    it('should create edge between existing nodes', async () => {
      const sourceNode = createMockNode({ entityId: 'e-001' });
      const targetNode = createMockNode({ entityId: 'e-002', versionId: 'v-002' });
      const expectedEdge = createMockEdge();

      mockNodeRepo.findActiveByEntityId
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(targetNode);
      mockNamespaceService.getNextVersion.mockResolvedValue({
        versionName: 'PRJ-9000-Genesis-edge-001',
        epoch: 9000,
        sequence: BigInt(1)
      });
      mockEdgeRepo.create.mockResolvedValue(expectedEdge);

      const result = await service.createEdge({
        sourceEntityId: 'e-001',
        targetEntityId: 'e-002',
        edgeType: 'CALLS',
        namespace: Namespace.PROJECT,
        properties: {},
        changeReason: 'Test edge',
        changedBy: 'test-user'
      });

      expect(result.status).toBe(EdgeStatus.ACTIVE);
      expect(result.sourceEntityId).toBe('e-001');
      expect(result.targetEntityId).toBe('e-002');
      expect(mockEdgeRepo.createConnectsRelationship).toHaveBeenCalledTimes(2);
    });

    it('should reject edge to non-existent source', async () => {
      mockNodeRepo.findActiveByEntityId.mockResolvedValue(null);

      await expect(service.createEdge({
        sourceEntityId: 'non-existent',
        targetEntityId: 'e-002',
        edgeType: 'CALLS',
        namespace: Namespace.PROJECT,
        properties: {},
        changeReason: 'Test',
        changedBy: 'user'
      })).rejects.toThrow(EntityNotFoundError);
    });

    it('should reject edge to non-existent target', async () => {
      const sourceNode = createMockNode();
      mockNodeRepo.findActiveByEntityId
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(null);

      await expect(service.createEdge({
        sourceEntityId: 'e-001',
        targetEntityId: 'non-existent',
        edgeType: 'CALLS',
        namespace: Namespace.PROJECT,
        properties: {},
        changeReason: 'Test',
        changedBy: 'user'
      })).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('deprecateEdge', () => {
    it('should deprecate edge', async () => {
      const edge = createMockEdge();
      const deprecatedEdge = { ...edge, status: EdgeStatus.DEPRECATED };

      mockEdgeRepo.findActiveByEdgeId.mockResolvedValue(edge);
      mockEdgeRepo.updateStatus.mockResolvedValue(deprecatedEdge);

      const result = await service.deprecateEdge('edge-001', 'No longer needed', 'user');

      expect(result.status).toBe(EdgeStatus.DEPRECATED);
    });

    it('should throw for non-existent edge', async () => {
      mockEdgeRepo.findActiveByEdgeId.mockResolvedValue(null);

      await expect(service.deprecateEdge('non-existent', 'Test', 'user'))
        .rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('queryNodes', () => {
    it('should query nodes by namespace and status', async () => {
      const nodes = [
        createMockNode({ entityId: 'e-001' }),
        createMockNode({ entityId: 'e-002', versionId: 'v-002' })
      ];

      mockNodeRepo.findByNamespace.mockResolvedValue(nodes);

      const result = await service.queryNodes({
        namespace: Namespace.PROJECT
      });

      expect(result).toHaveLength(2);
      expect(mockNodeRepo.findByNamespace).toHaveBeenCalledWith(Namespace.PROJECT, NodeStatus.ACTIVE);
    });

    it('should query at valid time', async () => {
      const validTime = new Date('2024-06-15');
      const nodes = [createMockNode()];

      mockNodeRepo.queryAtValidTime.mockResolvedValue(nodes);

      const result = await service.queryNodes({
        namespace: Namespace.PROJECT,
        validTime
      });

      expect(result).toHaveLength(1);
      expect(mockNodeRepo.queryAtValidTime).toHaveBeenCalledWith(
        Namespace.PROJECT,
        validTime,
        undefined
      );
    });

    it('should query at transaction time', async () => {
      const transactionTime = new Date('2024-06-15');
      const nodes = [createMockNode()];

      mockNodeRepo.queryAtTransactionTime.mockResolvedValue(nodes);

      const result = await service.queryNodes({
        namespace: Namespace.PROJECT,
        transactionTime
      });

      expect(result).toHaveLength(1);
      expect(mockNodeRepo.queryAtTransactionTime).toHaveBeenCalledWith(
        Namespace.PROJECT,
        transactionTime
      );
    });

    it('should query at both times', async () => {
      const validTime = new Date('2024-06-15');
      const transactionTime = new Date('2024-06-20');
      const nodes = [createMockNode()];

      mockNodeRepo.queryAtBothTimes.mockResolvedValue(nodes);

      const result = await service.queryNodes({
        namespace: Namespace.PROJECT,
        validTime,
        transactionTime
      });

      expect(result).toHaveLength(1);
      expect(mockNodeRepo.queryAtBothTimes).toHaveBeenCalledWith(
        Namespace.PROJECT,
        validTime,
        transactionTime
      );
    });
  });

  describe('getNodeLineage', () => {
    it('should return version history', async () => {
      const versions = [
        createMockNode({ sequenceNumber: BigInt(1), status: NodeStatus.SUPERSEDED }),
        createMockNode({ versionId: 'v-002', sequenceNumber: BigInt(2) })
      ];

      mockNodeRepo.getLineage.mockResolvedValue(versions);

      const result = await service.getNodeLineage('e-001');

      expect(result).toHaveLength(2);
      expect(mockNodeRepo.getLineage).toHaveBeenCalledWith('e-001');
    });
  });

  describe('verifyNodeChain', () => {
    it('should verify intact chain', async () => {
      const version1 = createMockNode({
        sequenceNumber: BigInt(1),
        contentHash: 'hash1',
        chainHash: 'chain1',
        previousHash: null
      });
      const version2 = createMockNode({
        versionId: 'v-002',
        sequenceNumber: BigInt(2),
        contentHash: 'hash2',
        chainHash: 'chain2',
        previousHash: 'hash1',
        previousVersionId: 'v-001'
      });

      mockNodeRepo.findAllVersionsByEntityId.mockResolvedValue([version1, version2]);

      const result = await service.verifyNodeChain('e-001');

      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeUndefined();
    });
  });

  describe('getConnectedEdges', () => {
    it('should return connected edges', async () => {
      const edges = [
        createMockEdge({ sourceEntityId: 'e-001', targetEntityId: 'e-002' }),
        createMockEdge({ edgeId: 'edge-002', sourceEntityId: 'e-003', targetEntityId: 'e-001' })
      ];

      mockEdgeRepo.findConnectedEdges.mockResolvedValue(edges);

      const result = await service.getConnectedEdges('e-001');

      expect(result).toHaveLength(2);
      expect(mockEdgeRepo.findConnectedEdges).toHaveBeenCalledWith('e-001', undefined);
    });

    it('should filter by status', async () => {
      const edges = [createMockEdge()];

      mockEdgeRepo.findConnectedEdges.mockResolvedValue(edges);

      await service.getConnectedEdges('e-001', EdgeStatus.ACTIVE);

      expect(mockEdgeRepo.findConnectedEdges).toHaveBeenCalledWith('e-001', EdgeStatus.ACTIVE);
    });
  });
});
