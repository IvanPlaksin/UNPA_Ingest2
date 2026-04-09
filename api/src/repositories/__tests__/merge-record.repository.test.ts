/**
 * Unit tests for MergeRecordRepository
 */

import { MergeRecordRepository } from '../merge-record.repository';
import { MemgraphClient } from '../../db/memgraph.client';
import { MergeRecord, Namespace } from '../../types/immutable-graph.types';

jest.mock('../../db/memgraph.client');

describe('MergeRecordRepository', () => {
  let repository: MergeRecordRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const sampleMerge: MergeRecord = {
    mergeId: 'merge-001',
    namespace: Namespace.CORE,
    sourceEntityIds: ['e-001', 'e-002'],
    sourceVersionIds: ['v-001', 'v-002'],
    resultEntityId: 'e-003',
    resultVersionId: 'v-003',
    mergedAt: new Date('2024-01-01T00:00:00Z'),
    mergedBy: 'user-001',
    mergeReason: 'Duplicate entities consolidated',
    mergeStrategy: 'UNION',
    conflictResolutions: { name: 'used_first' },
    contributionWeights: { 'e-001': 0.6, 'e-002': 0.4 }
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new MergeRecordRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a merge record', async () => {
      const mockRecord = {
        m: {
          mergeId: sampleMerge.mergeId,
          namespace: sampleMerge.namespace,
          sourceEntityIds: sampleMerge.sourceEntityIds,
          sourceVersionIds: sampleMerge.sourceVersionIds,
          resultEntityId: sampleMerge.resultEntityId,
          resultVersionId: sampleMerge.resultVersionId,
          mergedAt: sampleMerge.mergedAt.toISOString(),
          mergedBy: sampleMerge.mergedBy,
          mergeReason: sampleMerge.mergeReason,
          mergeStrategy: sampleMerge.mergeStrategy,
          conflictResolutions: JSON.stringify(sampleMerge.conflictResolutions),
          contributionWeights: JSON.stringify(sampleMerge.contributionWeights)
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(sampleMerge);

      expect(mockClient.executeWrite).toHaveBeenCalledTimes(1);
      expect(result.mergeId).toBe(sampleMerge.mergeId);
      expect(result.sourceEntityIds).toEqual(['e-001', 'e-002']);
      expect(result.mergeStrategy).toBe('UNION');
    });
  });

  describe('findByMergeId', () => {
    it('should find merge by ID', async () => {
      // Note: findByMergeId uses base repository's findById which returns { n: {...} }
      const mockRecord = {
        n: {
          mergeId: 'merge-001',
          namespace: Namespace.CORE,
          sourceEntityIds: ['e-001', 'e-002'],
          sourceVersionIds: ['v-001', 'v-002'],
          resultEntityId: 'e-003',
          resultVersionId: 'v-003',
          mergedAt: new Date().toISOString(),
          mergedBy: 'user-001',
          mergeReason: 'Test merge',
          mergeStrategy: 'UNION',
          conflictResolutions: '{}',
          contributionWeights: '{}'
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findByMergeId('merge-001');

      expect(result).not.toBeNull();
      expect(result!.mergeId).toBe('merge-001');
    });

    it('should return null when not found', async () => {
      mockClient.executeQuery.mockResolvedValue([]);

      const result = await repository.findByMergeId('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByResultEntityId', () => {
    it('should find merge by result entity ID', async () => {
      const mockRecord = {
        m: {
          mergeId: 'merge-001',
          namespace: Namespace.CORE,
          sourceEntityIds: ['e-001', 'e-002'],
          sourceVersionIds: ['v-001', 'v-002'],
          resultEntityId: 'e-003',
          resultVersionId: 'v-003',
          mergedAt: new Date().toISOString(),
          mergedBy: 'user-001',
          mergeReason: 'Test merge',
          mergeStrategy: 'INTERSECTION',
          conflictResolutions: '{}',
          contributionWeights: '{}'
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findByResultEntityId('e-003');

      expect(result).not.toBeNull();
      expect(result!.resultEntityId).toBe('e-003');
    });
  });

  describe('findBySourceEntityId', () => {
    it('should find merges containing a source entity', async () => {
      const mockRecords = [
        {
          m: {
            mergeId: 'merge-001',
            namespace: Namespace.CORE,
            sourceEntityIds: ['e-001', 'e-002'],
            sourceVersionIds: ['v-001', 'v-002'],
            resultEntityId: 'e-003',
            resultVersionId: 'v-003',
            mergedAt: new Date().toISOString(),
            mergedBy: 'user-001',
            mergeReason: 'Test merge',
            mergeStrategy: 'UNION',
            conflictResolutions: '{}',
            contributionWeights: '{}'
          }
        },
        {
          m: {
            mergeId: 'merge-002',
            namespace: Namespace.CORE,
            sourceEntityIds: ['e-001', 'e-004'],
            sourceVersionIds: ['v-001', 'v-004'],
            resultEntityId: 'e-005',
            resultVersionId: 'v-005',
            mergedAt: new Date().toISOString(),
            mergedBy: 'user-001',
            mergeReason: 'Another merge',
            mergeStrategy: 'CUSTOM',
            conflictResolutions: '{}',
            contributionWeights: '{}'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findBySourceEntityId('e-001');

      expect(results).toHaveLength(2);
      expect(results[0].sourceEntityIds).toContain('e-001');
      expect(results[1].sourceEntityIds).toContain('e-001');
    });
  });

  describe('findByNamespace', () => {
    it('should find merges by namespace', async () => {
      const mockRecords = [
        {
          m: {
            mergeId: 'merge-001',
            namespace: Namespace.CORE,
            sourceEntityIds: ['e-001', 'e-002'],
            sourceVersionIds: ['v-001', 'v-002'],
            resultEntityId: 'e-003',
            resultVersionId: 'v-003',
            mergedAt: new Date().toISOString(),
            mergedBy: 'user-001',
            mergeReason: 'Test',
            mergeStrategy: 'UNION',
            conflictResolutions: '{}',
            contributionWeights: '{}'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findByNamespace(Namespace.CORE);

      expect(results).toHaveLength(1);
      expect(results[0].namespace).toBe(Namespace.CORE);
    });
  });

  describe('findMergesInRange', () => {
    it('should find merges within date range', async () => {
      const mockRecords = [
        {
          m: {
            mergeId: 'merge-001',
            namespace: Namespace.CORE,
            sourceEntityIds: ['e-001', 'e-002'],
            sourceVersionIds: ['v-001', 'v-002'],
            resultEntityId: 'e-003',
            resultVersionId: 'v-003',
            mergedAt: new Date('2024-06-15').toISOString(),
            mergedBy: 'user-001',
            mergeReason: 'Test',
            mergeStrategy: 'UNION',
            conflictResolutions: '{}',
            contributionWeights: '{}'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      const results = await repository.findMergesInRange(startDate, endDate);

      expect(mockClient.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('mergedAt'),
        expect.objectContaining({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
      );
      expect(results).toHaveLength(1);
    });
  });

  describe('countMergesByStrategy', () => {
    it('should count merges by strategy', async () => {
      const mockRecords = [
        { strategy: 'UNION', count: 15 },
        { strategy: 'INTERSECTION', count: 8 },
        { strategy: 'CUSTOM', count: 3 }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const counts = await repository.countMergesByStrategy(Namespace.CORE);

      expect(counts['UNION']).toBe(15);
      expect(counts['INTERSECTION']).toBe(8);
      expect(counts['CUSTOM']).toBe(3);
    });
  });

  describe('createMergedIntoRelationship', () => {
    it('should create MERGED_INTO relationship', async () => {
      mockClient.executeWrite.mockResolvedValue([]);

      await repository.createMergedIntoRelationship('merge-001', 'merge-002');

      expect(mockClient.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MERGED_INTO'),
        { sourceMergeId: 'merge-001', targetMergeId: 'merge-002' }
      );
    });
  });

  describe('getMergeLineage', () => {
    it('should get merge lineage for an entity', async () => {
      const mockRecords = [
        {
          m: {
            mergeId: 'merge-001',
            namespace: Namespace.CORE,
            sourceEntityIds: ['e-001', 'e-002'],
            sourceVersionIds: ['v-001', 'v-002'],
            resultEntityId: 'e-003',
            resultVersionId: 'v-003',
            mergedAt: new Date('2024-01-01').toISOString(),
            mergedBy: 'user-001',
            mergeReason: 'First merge',
            mergeStrategy: 'UNION',
            conflictResolutions: '{}',
            contributionWeights: '{}'
          }
        },
        {
          m: {
            mergeId: 'merge-002',
            namespace: Namespace.CORE,
            sourceEntityIds: ['e-003', 'e-004'],
            sourceVersionIds: ['v-003', 'v-004'],
            resultEntityId: 'e-005',
            resultVersionId: 'v-005',
            mergedAt: new Date('2024-02-01').toISOString(),
            mergedBy: 'user-001',
            mergeReason: 'Second merge',
            mergeStrategy: 'UNION',
            conflictResolutions: '{}',
            contributionWeights: '{}'
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const lineage = await repository.getMergeLineage('e-005');

      expect(lineage).toHaveLength(2);
    });
  });

  describe('contribution weights', () => {
    it('should properly parse contribution weights', async () => {
      // Note: findByMergeId uses base repository's findById which returns { n: {...} }
      const mockRecord = {
        n: {
          mergeId: 'merge-001',
          namespace: Namespace.CORE,
          sourceEntityIds: ['e-001', 'e-002', 'e-003'],
          sourceVersionIds: ['v-001', 'v-002', 'v-003'],
          resultEntityId: 'e-004',
          resultVersionId: 'v-004',
          mergedAt: new Date().toISOString(),
          mergedBy: 'user-001',
          mergeReason: 'Multi-source merge',
          mergeStrategy: 'CUSTOM',
          conflictResolutions: '{"field1": "used_first", "field2": "used_last"}',
          contributionWeights: '{"e-001": 0.5, "e-002": 0.3, "e-003": 0.2}'
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findByMergeId('merge-001');

      expect(result).not.toBeNull();
      expect(result!.contributionWeights['e-001']).toBe(0.5);
      expect(result!.contributionWeights['e-002']).toBe(0.3);
      expect(result!.contributionWeights['e-003']).toBe(0.2);
      expect(result!.conflictResolutions['field1']).toBe('used_first');
    });
  });
});
