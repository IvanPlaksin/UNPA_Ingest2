/**
 * Unit tests for God Mode Repositories
 */

import {
  GodModeSessionRepository,
  GodModeAuditRepository,
  TombstoneRepository,
  PendingDeletionRepository
} from '../god-mode.repository';
import { MemgraphClient } from '../../db/memgraph.client';
import {
  GodModeSession,
  GodModeAuditRecord,
  Tombstone,
  PendingDeletion,
  GodModeActionType,
  Namespace
} from '../../types/immutable-graph.types';

jest.mock('../../db/memgraph.client');

describe('GodModeSessionRepository', () => {
  let repository: GodModeSessionRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const sampleSession: GodModeSession = {
    sessionId: 'session-001',
    userId: 'user-001',
    namespace: Namespace.CORE,
    reason: 'Critical data correction',
    approvedBy: 'admin-001',
    startedAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2024-01-01T01:00:00Z'),
    endedAt: null,
    isActive: true,
    actionsPerformed: 0
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new GodModeSessionRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a god mode session', async () => {
      const mockRecord = {
        s: {
          sessionId: sampleSession.sessionId,
          userId: sampleSession.userId,
          namespace: sampleSession.namespace,
          projectId: null,
          reason: sampleSession.reason,
          approvedBy: sampleSession.approvedBy,
          startedAt: sampleSession.startedAt.toISOString(),
          expiresAt: sampleSession.expiresAt.toISOString(),
          endedAt: null,
          isActive: true,
          actionsPerformed: 0
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(sampleSession);

      expect(result.sessionId).toBe(sampleSession.sessionId);
      expect(result.isActive).toBe(true);
    });
  });

  describe('findActiveSession', () => {
    it('should find active session for user', async () => {
      const mockRecord = {
        s: {
          sessionId: 'session-001',
          userId: 'user-001',
          namespace: Namespace.CORE,
          projectId: null,
          reason: 'Test',
          approvedBy: 'admin',
          startedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          endedAt: null,
          isActive: true,
          actionsPerformed: 5
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findActiveSession('user-001', Namespace.CORE);

      expect(result).not.toBeNull();
      expect(result!.isActive).toBe(true);
    });
  });

  describe('endSession', () => {
    it('should end a session', async () => {
      const mockRecord = {
        s: {
          sessionId: 'session-001',
          userId: 'user-001',
          namespace: Namespace.CORE,
          projectId: null,
          reason: 'Test',
          approvedBy: 'admin',
          startedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          isActive: false,
          actionsPerformed: 10
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.endSession('session-001');

      expect(result.isActive).toBe(false);
      expect(result.endedAt).not.toBeNull();
    });
  });

  describe('incrementActionsCount', () => {
    it('should increment actions count', async () => {
      mockClient.executeWrite.mockResolvedValue([{ count: 6 }]);

      const count = await repository.incrementActionsCount('session-001');

      expect(count).toBe(6);
    });
  });
});

describe('GodModeAuditRepository', () => {
  let repository: GodModeAuditRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const sampleAudit: GodModeAuditRecord = {
    auditId: 'audit-001',
    sessionId: 'session-001',
    actionType: GodModeActionType.PHYSICAL_DELETE,
    targetType: 'NODE',
    targetVersionId: 'v-001',
    targetEntityId: 'e-001',
    previousState: { status: 'ACTIVE', properties: { name: 'Test' } },
    newState: null,
    reason: 'Data cleanup',
    performedAt: new Date('2024-01-01T00:00:00Z'),
    performedBy: 'user-001',
    reversible: false,
    reversedAt: null,
    reversedBy: null
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new GodModeAuditRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an audit record', async () => {
      const mockRecord = {
        a: {
          auditId: sampleAudit.auditId,
          sessionId: sampleAudit.sessionId,
          actionType: sampleAudit.actionType,
          targetType: sampleAudit.targetType,
          targetVersionId: sampleAudit.targetVersionId,
          targetEntityId: sampleAudit.targetEntityId,
          previousState: JSON.stringify(sampleAudit.previousState),
          newState: null,
          reason: sampleAudit.reason,
          performedAt: sampleAudit.performedAt.toISOString(),
          performedBy: sampleAudit.performedBy,
          reversible: false,
          reversedAt: null,
          reversedBy: null
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(sampleAudit);

      expect(result.auditId).toBe(sampleAudit.auditId);
      expect(result.actionType).toBe(GodModeActionType.PHYSICAL_DELETE);
    });
  });

  describe('findBySessionId', () => {
    it('should find audits by session ID', async () => {
      const mockRecords = [
        {
          a: {
            auditId: 'audit-001',
            sessionId: 'session-001',
            actionType: 'PHYSICAL_DELETE',
            targetType: 'NODE',
            targetVersionId: 'v-001',
            targetEntityId: 'e-001',
            previousState: '{}',
            newState: null,
            reason: 'Test',
            performedAt: new Date().toISOString(),
            performedBy: 'user',
            reversible: false,
            reversedAt: null,
            reversedBy: null
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findBySessionId('session-001');

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-001');
    });
  });

  describe('markReversed', () => {
    it('should mark audit as reversed', async () => {
      const mockRecord = {
        a: {
          auditId: 'audit-001',
          sessionId: 'session-001',
          actionType: 'RESTORE',
          targetType: 'NODE',
          targetVersionId: 'v-001',
          targetEntityId: 'e-001',
          previousState: '{}',
          newState: '{}',
          reason: 'Test',
          performedAt: new Date().toISOString(),
          performedBy: 'user',
          reversible: true,
          reversedAt: new Date().toISOString(),
          reversedBy: 'admin'
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.markReversed('audit-001', 'admin');

      expect(result.reversedAt).not.toBeNull();
      expect(result.reversedBy).toBe('admin');
    });
  });
});

describe('TombstoneRepository', () => {
  let repository: TombstoneRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const sampleTombstone: Tombstone = {
    tombstoneId: 'tomb-001',
    entityType: 'NODE',
    entityId: 'e-001',
    lastVersionId: 'v-005',
    namespace: Namespace.CORE,
    deletedAt: new Date('2024-01-01T00:00:00Z'),
    deletedBy: 'user-001',
    godModeSessionId: 'session-001',
    reason: 'Duplicate entity',
    finalContentHash: 'finalhash123',
    finalChainHash: 'finalchain123',
    metadata: { originalName: 'Test Entity' }
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new TombstoneRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a tombstone', async () => {
      const mockRecord = {
        t: {
          tombstoneId: sampleTombstone.tombstoneId,
          entityType: sampleTombstone.entityType,
          entityId: sampleTombstone.entityId,
          lastVersionId: sampleTombstone.lastVersionId,
          namespace: sampleTombstone.namespace,
          deletedAt: sampleTombstone.deletedAt.toISOString(),
          deletedBy: sampleTombstone.deletedBy,
          godModeSessionId: sampleTombstone.godModeSessionId,
          reason: sampleTombstone.reason,
          finalContentHash: sampleTombstone.finalContentHash,
          finalChainHash: sampleTombstone.finalChainHash,
          metadata: JSON.stringify(sampleTombstone.metadata)
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(sampleTombstone);

      expect(result.tombstoneId).toBe(sampleTombstone.tombstoneId);
      expect(result.entityType).toBe('NODE');
    });
  });

  describe('findByEntityId', () => {
    it('should find tombstone by entity ID', async () => {
      const mockRecord = {
        t: {
          tombstoneId: 'tomb-001',
          entityType: 'NODE',
          entityId: 'e-001',
          lastVersionId: 'v-005',
          namespace: Namespace.CORE,
          deletedAt: new Date().toISOString(),
          deletedBy: 'user',
          godModeSessionId: 'session-001',
          reason: 'Test',
          finalContentHash: 'hash',
          finalChainHash: 'chain',
          metadata: '{}'
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const result = await repository.findByEntityId('e-001');

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe('e-001');
    });
  });

  describe('isDeleted', () => {
    it('should return true when tombstone exists', async () => {
      const mockRecord = {
        t: {
          tombstoneId: 'tomb-001',
          entityType: 'NODE',
          entityId: 'e-001',
          lastVersionId: 'v-005',
          namespace: Namespace.CORE,
          deletedAt: new Date().toISOString(),
          deletedBy: 'user',
          godModeSessionId: 'session-001',
          reason: 'Test',
          finalContentHash: 'hash',
          finalChainHash: 'chain',
          metadata: '{}'
        }
      };

      mockClient.executeQuery.mockResolvedValue([mockRecord]);

      const isDeleted = await repository.isDeleted('e-001');

      expect(isDeleted).toBe(true);
    });

    it('should return false when no tombstone', async () => {
      mockClient.executeQuery.mockResolvedValue([]);

      const isDeleted = await repository.isDeleted('e-001');

      expect(isDeleted).toBe(false);
    });
  });
});

describe('PendingDeletionRepository', () => {
  let repository: PendingDeletionRepository;
  let mockClient: jest.Mocked<MemgraphClient>;

  const samplePending: PendingDeletion = {
    pendingId: 'pend-001',
    entityType: 'NODE',
    entityId: 'e-001',
    versionId: 'v-001',
    namespace: Namespace.CORE,
    scheduledAt: new Date('2024-01-01T00:00:00Z'),
    scheduledBy: 'user-001',
    godModeSessionId: 'session-001',
    executeAfter: new Date('2024-01-02T00:00:00Z'),
    reason: 'Scheduled cleanup',
    approved: false,
    approvedBy: null,
    approvedAt: null,
    executed: false,
    executedAt: null,
    cancelled: false,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null
  };

  beforeEach(() => {
    mockClient = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn()
    } as unknown as jest.Mocked<MemgraphClient>;

    repository = new PendingDeletionRepository(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a pending deletion', async () => {
      const mockRecord = {
        p: {
          pendingId: samplePending.pendingId,
          entityType: samplePending.entityType,
          entityId: samplePending.entityId,
          versionId: samplePending.versionId,
          namespace: samplePending.namespace,
          scheduledAt: samplePending.scheduledAt.toISOString(),
          scheduledBy: samplePending.scheduledBy,
          godModeSessionId: samplePending.godModeSessionId,
          executeAfter: samplePending.executeAfter.toISOString(),
          reason: samplePending.reason,
          approved: false,
          approvedBy: null,
          approvedAt: null,
          executed: false,
          executedAt: null,
          cancelled: false,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.create(samplePending);

      expect(result.pendingId).toBe(samplePending.pendingId);
      expect(result.approved).toBe(false);
    });
  });

  describe('findPendingForExecution', () => {
    it('should find pending deletions ready for execution', async () => {
      const mockRecords = [
        {
          p: {
            pendingId: 'pend-001',
            entityType: 'NODE',
            entityId: 'e-001',
            versionId: 'v-001',
            namespace: Namespace.CORE,
            scheduledAt: new Date().toISOString(),
            scheduledBy: 'user',
            godModeSessionId: 'session-001',
            executeAfter: new Date(Date.now() - 3600000).toISOString(),
            reason: 'Test',
            approved: true,
            approvedBy: 'admin',
            approvedAt: new Date().toISOString(),
            executed: false,
            executedAt: null,
            cancelled: false,
            cancelledAt: null,
            cancelledBy: null,
            cancellationReason: null
          }
        }
      ];

      mockClient.executeQuery.mockResolvedValue(mockRecords);

      const results = await repository.findPendingForExecution();

      expect(results).toHaveLength(1);
      expect(results[0].approved).toBe(true);
      expect(results[0].executed).toBe(false);
    });
  });

  describe('approve', () => {
    it('should approve a pending deletion', async () => {
      const mockRecord = {
        p: {
          pendingId: 'pend-001',
          entityType: 'NODE',
          entityId: 'e-001',
          versionId: 'v-001',
          namespace: Namespace.CORE,
          scheduledAt: new Date().toISOString(),
          scheduledBy: 'user',
          godModeSessionId: 'session-001',
          executeAfter: new Date().toISOString(),
          reason: 'Test',
          approved: true,
          approvedBy: 'admin-001',
          approvedAt: new Date().toISOString(),
          executed: false,
          executedAt: null,
          cancelled: false,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.approve('pend-001', 'admin-001');

      expect(result.approved).toBe(true);
      expect(result.approvedBy).toBe('admin-001');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending deletion', async () => {
      const mockRecord = {
        p: {
          pendingId: 'pend-001',
          entityType: 'NODE',
          entityId: 'e-001',
          versionId: 'v-001',
          namespace: Namespace.CORE,
          scheduledAt: new Date().toISOString(),
          scheduledBy: 'user',
          godModeSessionId: 'session-001',
          executeAfter: new Date().toISOString(),
          reason: 'Test',
          approved: false,
          approvedBy: null,
          approvedAt: null,
          executed: false,
          executedAt: null,
          cancelled: true,
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'admin-001',
          cancellationReason: 'No longer needed'
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.cancel('pend-001', 'admin-001', 'No longer needed');

      expect(result.cancelled).toBe(true);
      expect(result.cancelledBy).toBe('admin-001');
      expect(result.cancellationReason).toBe('No longer needed');
    });
  });

  describe('markExecuted', () => {
    it('should mark pending deletion as executed', async () => {
      const mockRecord = {
        p: {
          pendingId: 'pend-001',
          entityType: 'NODE',
          entityId: 'e-001',
          versionId: 'v-001',
          namespace: Namespace.CORE,
          scheduledAt: new Date().toISOString(),
          scheduledBy: 'user',
          godModeSessionId: 'session-001',
          executeAfter: new Date().toISOString(),
          reason: 'Test',
          approved: true,
          approvedBy: 'admin',
          approvedAt: new Date().toISOString(),
          executed: true,
          executedAt: new Date().toISOString(),
          cancelled: false,
          cancelledAt: null,
          cancelledBy: null,
          cancellationReason: null
        }
      };

      mockClient.executeWrite.mockResolvedValue([mockRecord]);

      const result = await repository.markExecuted('pend-001');

      expect(result.executed).toBe(true);
      expect(result.executedAt).not.toBeNull();
    });
  });
});
