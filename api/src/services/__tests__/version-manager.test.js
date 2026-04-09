'use strict';

// Mock the memgraph singleton to avoid loading neo4j-driver
jest.mock('../memgraph.service', () => ({
  runQuery: jest.fn(),
}));

// Mock uuid to avoid ESM issues
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));

const { VersionManager } = require('../version-manager');

// Mock memgraph service
function createMockMemgraph() {
  return {
    runQuery: jest.fn(),
  };
}

describe('VersionManager', () => {
  let vm;
  let mockMg;

  beforeEach(() => {
    mockMg = createMockMemgraph();
    vm = new VersionManager(mockMg);
  });

  // -------------------------------------------------------------------------
  // getActiveVersion
  // -------------------------------------------------------------------------

  describe('getActiveVersion', () => {
    test('returns active version properties', async () => {
      mockMg.runQuery.mockResolvedValue([{
        v: { properties: { versionId: 'v1', entityId: 'e1', status: 'ACTIVE' } },
      }]);

      const result = await vm.getActiveVersion('e1');
      expect(result).toEqual({ versionId: 'v1', entityId: 'e1', status: 'ACTIVE' });
      expect(mockMg.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('ACTIVE'),
        { entityId: 'e1' }
      );
    });

    test('returns null when no active version', async () => {
      mockMg.runQuery.mockResolvedValue([]);
      const result = await vm.getActiveVersion('nonexistent');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getPreviousVersion
  // -------------------------------------------------------------------------

  describe('getPreviousVersion', () => {
    test('returns most recent superseded version', async () => {
      mockMg.runQuery.mockResolvedValue([{
        v: { properties: { versionId: 'v0', status: 'SUPERSEDED', sequenceNumber: 1 } },
      }]);

      const result = await vm.getPreviousVersion('e1');
      expect(result.versionId).toBe('v0');
    });

    test('returns null when no previous version', async () => {
      mockMg.runQuery.mockResolvedValue([]);
      expect(await vm.getPreviousVersion('e1')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createRelationToVersioned
  // -------------------------------------------------------------------------

  describe('createRelationToVersioned', () => {
    test('creates edge to active version with targetEntityId', async () => {
      // First call: getActiveVersion
      mockMg.runQuery
        .mockResolvedValueOnce([{
          v: { properties: { versionId: 'v1', entityId: 'e-target' } },
        }])
        // Second call: MERGE relationship
        .mockResolvedValueOnce([{ r: {} }]);

      const result = await vm.createRelationToVersioned('from-1', 'e-target', 'IMPLEMENTS', { weight: 0.9 });

      expect(result.fromId).toBe('from-1');
      expect(result.toVersionId).toBe('v1');
      expect(result.toEntityId).toBe('e-target');
      expect(result.relType).toBe('IMPLEMENTS');

      // Second call should have targetEntityId in params
      const secondCall = mockMg.runQuery.mock.calls[1];
      expect(secondCall[1].toEntityId).toBe('e-target');
    });

    test('throws when no active version exists', async () => {
      mockMg.runQuery.mockResolvedValue([]);

      await expect(
        vm.createRelationToVersioned('from-1', 'nonexistent', 'IMPLEMENTS')
      ).rejects.toThrow('No ACTIVE version found');
    });
  });

  // -------------------------------------------------------------------------
  // relinkOnSupersede
  // -------------------------------------------------------------------------

  describe('relinkOnSupersede', () => {
    test('relinks incoming edges to new version', async () => {
      // First call: find incoming edges
      mockMg.runQuery
        .mockResolvedValueOnce([
          { sourceId: 's1', relType: 'IMPLEMENTS', props: { weight: 0.9, targetEntityId: 'e1' } },
          { sourceId: 's2', relType: 'DEPENDS_ON', props: { targetEntityId: 'e1' } },
        ])
        // Remaining calls: create new edge + delete old edge (x2)
        .mockResolvedValue([]);

      const count = await vm.relinkOnSupersede('old-v', 'new-v', 'e1');
      expect(count).toBe(2);
      // 1 find + 2*(create+delete) = 5 calls
      expect(mockMg.runQuery).toHaveBeenCalledTimes(5);
    });

    test('returns 0 when no incoming edges', async () => {
      mockMg.runQuery.mockResolvedValue([]);
      const count = await vm.relinkOnSupersede('old-v', 'new-v', 'e1');
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getLineage
  // -------------------------------------------------------------------------

  describe('getLineage', () => {
    test('returns ordered version history', async () => {
      mockMg.runQuery.mockResolvedValue([
        { v: { properties: { versionId: 'v1', sequenceNumber: 1 } } },
        { v: { properties: { versionId: 'v2', sequenceNumber: 2 } } },
      ]);

      const lineage = await vm.getLineage('e1');
      expect(lineage).toHaveLength(2);
      expect(lineage[0].sequenceNumber).toBe(1);
      expect(lineage[1].sequenceNumber).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Tombstones (CC-021)
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    test('creates tombstone and marks version as DELETED', async () => {
      // getActiveVersion
      mockMg.runQuery
        .mockResolvedValueOnce([{
          v: { properties: { versionId: 'v1', entityId: 'e1', namespace: 'CORE' } },
        }])
        // CREATE Tombstone
        .mockResolvedValueOnce([])
        // SET status = DELETED
        .mockResolvedValueOnce([])
        // Orphan edges
        .mockResolvedValueOnce([]);

      const tombstone = await vm.softDelete('e1', 'No longer needed', 'admin');
      expect(tombstone.entityId).toBe('e1');
      expect(tombstone.lastVersionId).toBe('v1');
      expect(tombstone.restorable).toBe(true);
      expect(tombstone.reason).toBe('No longer needed');
      expect(tombstone.deletedBy).toBe('admin');
      expect(tombstone.restoreDeadline).toBeDefined();
      // 4 queries: getActive + create tombstone + mark deleted + orphan edges
      expect(mockMg.runQuery).toHaveBeenCalledTimes(4);
    });

    test('throws when no active version', async () => {
      mockMg.runQuery.mockResolvedValue([]);
      await expect(vm.softDelete('bad', 'reason')).rejects.toThrow('No ACTIVE version');
    });
  });

  describe('restore', () => {
    test('restores entity within deadline', async () => {
      const future = new Date(Date.now() + 86400000).toISOString(); // +1 day
      // _getTombstone
      mockMg.runQuery
        .mockResolvedValueOnce([{
          t: { properties: {
            tombstoneId: 't1', entityId: 'e1', lastVersionId: 'v1',
            restorable: true, restoreDeadline: future,
          }},
        }])
        // Restore version
        .mockResolvedValueOnce([])
        // Restore edges
        .mockResolvedValueOnce([])
        // Mark tombstone consumed
        .mockResolvedValueOnce([]);

      const result = await vm.restore('t1', 'admin');
      expect(result.restored).toBe(true);
      expect(result.entityId).toBe('e1');
    });

    test('throws when tombstone not found', async () => {
      mockMg.runQuery.mockResolvedValue([]);
      await expect(vm.restore('bad')).rejects.toThrow('not found');
    });

    test('throws when not restorable', async () => {
      mockMg.runQuery.mockResolvedValueOnce([{
        t: { properties: { tombstoneId: 't1', restorable: false, restoreDeadline: '2099-01-01' }},
      }]);
      await expect(vm.restore('t1')).rejects.toThrow('not restorable');
    });

    test('throws when deadline passed', async () => {
      const past = new Date(Date.now() - 86400000).toISOString(); // -1 day
      mockMg.runQuery.mockResolvedValueOnce([{
        t: { properties: { tombstoneId: 't1', restorable: true, restoreDeadline: past }},
      }]);
      await expect(vm.restore('t1')).rejects.toThrow('deadline passed');
    });
  });

  describe('expireTombstones', () => {
    test('returns count of expired tombstones', async () => {
      mockMg.runQuery.mockResolvedValue([{ count: 3 }]);
      const count = await vm.expireTombstones();
      expect(count).toBe(3);
    });
  });
});
