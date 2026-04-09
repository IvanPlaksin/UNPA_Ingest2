/**
 * Unit tests for GodModeService
 */

// Mock uuid before imports
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-v4'
}));

import { GodModeService } from '../god-mode.service';
import { NamespaceService } from '../namespace.service';
import {
  GodModeSessionRepository,
  GodModeAuditRepository,
  TombstoneRepository,
  PendingDeletionRepository
} from '../../../repositories/god-mode.repository';
import {
  GodModeSession,
  GodModeAuditRecord,
  Tombstone,
  PendingDeletion,
  GodModeActionType,
  Namespace,
  GodModeRequiredError,
  TwoPhaseTimeoutError
} from '../../../types/immutable-graph.types';

// Mock all repositories
jest.mock('../../../repositories/god-mode.repository');
jest.mock('../namespace.service');

describe('GodModeService', () => {
  let service: GodModeService;
  let mockSessionRepo: jest.Mocked<GodModeSessionRepository>;
  let mockAuditRepo: jest.Mocked<GodModeAuditRepository>;
  let mockTombstoneRepo: jest.Mocked<TombstoneRepository>;
  let mockPendingDeletionRepo: jest.Mocked<PendingDeletionRepository>;
  let mockNamespaceService: jest.Mocked<NamespaceService>;

  const createMockSession = (overrides: Partial<GodModeSession> = {}): GodModeSession => ({
    sessionId: 'session-001',
    userId: 'user-001',
    namespace: Namespace.PROJECT,
    projectId: undefined,
    reason: 'Test session',
    approvedBy: null,
    startedAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2024-01-01T01:00:00Z'),
    endedAt: null,
    isActive: true,
    actionsPerformed: 0,
    ...overrides
  });

  const createMockPendingDeletion = (overrides: Partial<PendingDeletion> = {}): PendingDeletion => ({
    pendingId: 'pending-001',
    entityType: 'NODE',
    entityId: 'e-001',
    versionId: 'v-001',
    namespace: Namespace.PROJECT,
    scheduledAt: new Date('2024-01-01T00:00:00Z'),
    scheduledBy: 'user-001',
    godModeSessionId: 'session-001',
    executeAfter: new Date('2024-01-01T00:00:05Z'),
    reason: 'Test deletion',
    approved: false,
    approvedBy: null,
    approvedAt: null,
    executed: false,
    executedAt: null,
    cancelled: false,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    ...overrides
  });

  beforeEach(() => {
    mockSessionRepo = {
      create: jest.fn(),
      findBySessionId: jest.fn(),
      findActiveSession: jest.fn(),
      endSession: jest.fn(),
      incrementActionsCount: jest.fn(),
      expireOldSessions: jest.fn(),
      getSessionHistory: jest.fn()
    } as unknown as jest.Mocked<GodModeSessionRepository>;

    mockAuditRepo = {
      create: jest.fn(),
      findByAuditId: jest.fn(),
      findBySessionId: jest.fn(),
      findByTargetEntityId: jest.fn(),
      markReversed: jest.fn(),
      getAuditsByActionType: jest.fn(),
      getReversibleAudits: jest.fn()
    } as unknown as jest.Mocked<GodModeAuditRepository>;

    mockTombstoneRepo = {
      create: jest.fn(),
      findByTombstoneId: jest.fn(),
      findByEntityId: jest.fn(),
      findByNamespace: jest.fn(),
      findByGodModeSession: jest.fn(),
      isDeleted: jest.fn(),
      getDeletedEntitiesInRange: jest.fn()
    } as unknown as jest.Mocked<TombstoneRepository>;

    mockPendingDeletionRepo = {
      create: jest.fn(),
      findByPendingId: jest.fn(),
      findByEntityId: jest.fn(),
      findPendingForExecution: jest.fn(),
      findAwaitingApproval: jest.fn(),
      approve: jest.fn(),
      markExecuted: jest.fn(),
      cancel: jest.fn(),
      findByGodModeSession: jest.fn()
    } as unknown as jest.Mocked<PendingDeletionRepository>;

    mockNamespaceService = {
      getOrCreate: jest.fn(),
      getNextVersion: jest.fn(),
      isGodModeAllowed: jest.fn()
    } as unknown as jest.Mocked<NamespaceService>;

    service = new GodModeService(
      mockSessionRepo,
      mockAuditRepo,
      mockTombstoneRepo,
      mockPendingDeletionRepo,
      mockNamespaceService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('activate', () => {
    it('should create a new god mode session', async () => {
      const expectedSession = createMockSession();

      mockSessionRepo.findActiveSession.mockResolvedValue(null);
      mockSessionRepo.create.mockResolvedValue(expectedSession);

      const result = await service.activate({
        userId: 'user-001',
        namespace: Namespace.PROJECT,
        reason: 'Test session'
      });

      expect(result.sessionId).toBeDefined();
      expect(result.isActive).toBe(true);
      expect(mockSessionRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should return existing active session for same user and namespace', async () => {
      const existingSession = createMockSession();

      mockSessionRepo.findActiveSession.mockResolvedValue(existingSession);

      const result = await service.activate({
        userId: 'user-001',
        namespace: Namespace.PROJECT,
        reason: 'New session'
      });

      expect(result.sessionId).toBe('session-001');
      expect(mockSessionRepo.create).not.toHaveBeenCalled();
    });

    it('should allow custom duration', async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(null);
      mockSessionRepo.create.mockImplementation(async (session) => session);

      const result = await service.activate({
        userId: 'user-001',
        namespace: Namespace.PROJECT,
        reason: 'Short session',
        durationMinutes: 10
      });

      const expectedDuration = 10 * 60 * 1000;
      const actualDuration = result.expiresAt.getTime() - result.startedAt.getTime();
      expect(Math.abs(actualDuration - expectedDuration)).toBeLessThan(1000);
    });
  });

  describe('deactivate', () => {
    it('should deactivate session', async () => {
      const deactivatedSession = createMockSession({
        isActive: false,
        endedAt: new Date()
      });

      mockSessionRepo.endSession.mockResolvedValue(deactivatedSession);

      const result = await service.deactivate('session-001');

      expect(result.isActive).toBe(false);
      expect(result.endedAt).not.toBeNull();
      expect(mockSessionRepo.endSession).toHaveBeenCalledWith('session-001');
    });
  });

  describe('requireActiveSession', () => {
    it('should return session when active', async () => {
      const session = createMockSession();
      mockSessionRepo.findActiveSession.mockResolvedValue(session);

      const result = await service.requireActiveSession('user-001', Namespace.PROJECT);

      expect(result.isActive).toBe(true);
    });

    it('should throw GodModeRequiredError when no active session', async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(null);

      await expect(service.requireActiveSession('user-001', Namespace.PROJECT))
        .rejects.toThrow(GodModeRequiredError);
    });
  });

  describe('verifyGodModeForNamespace', () => {
    it('should verify god mode is allowed for namespace', async () => {
      const session = createMockSession();
      mockSessionRepo.findActiveSession.mockResolvedValue(session);
      mockNamespaceService.isGodModeAllowed.mockResolvedValue(true);

      const result = await service.verifyGodModeForNamespace('user-001', Namespace.PROJECT);

      expect(result.sessionId).toBe('session-001');
    });

    it('should throw when god mode not allowed for namespace', async () => {
      const session = createMockSession();
      mockSessionRepo.findActiveSession.mockResolvedValue(session);
      mockNamespaceService.isGodModeAllowed.mockResolvedValue(false);

      await expect(service.verifyGodModeForNamespace('user-001', Namespace.CORE))
        .rejects.toThrow(GodModeRequiredError);
    });
  });

  describe('createAuditRecord', () => {
    it('should create audit record', async () => {
      const expectedAudit: GodModeAuditRecord = {
        auditId: 'audit-001',
        sessionId: 'session-001',
        actionType: GodModeActionType.MUTATE,
        targetType: 'NODE',
        targetVersionId: 'v-001',
        targetEntityId: 'e-001',
        previousState: { name: 'old' },
        newState: { name: 'new' },
        reason: 'Test mutation',
        performedAt: new Date(),
        performedBy: 'user-001',
        reversible: true,
        reversedAt: null,
        reversedBy: null
      };

      mockSessionRepo.incrementActionsCount.mockResolvedValue(1);
      mockAuditRepo.create.mockResolvedValue(expectedAudit);

      const result = await service.createAuditRecord('session-001', 'user-001', {
        actionType: GodModeActionType.MUTATE,
        targetType: 'NODE',
        targetVersionId: 'v-001',
        targetEntityId: 'e-001',
        previousState: { name: 'old' },
        newState: { name: 'new' },
        reason: 'Test mutation'
      });

      expect(result.auditId).toBeDefined();
      expect(result.reversible).toBe(true);
      expect(mockSessionRepo.incrementActionsCount).toHaveBeenCalledWith('session-001');
    });

    it('should mark PHYSICAL_DELETE as non-reversible', async () => {
      mockSessionRepo.incrementActionsCount.mockResolvedValue(1);
      mockAuditRepo.create.mockImplementation(async (record) => record);

      const result = await service.createAuditRecord('session-001', 'user-001', {
        actionType: GodModeActionType.PHYSICAL_DELETE,
        targetType: 'NODE',
        targetVersionId: 'v-001',
        targetEntityId: 'e-001',
        previousState: { name: 'deleted' },
        newState: null,
        reason: 'Test deletion'
      });

      expect(result.reversible).toBe(false);
    });
  });

  describe('markForDeletion', () => {
    it('should create pending deletion with 5 second delay', async () => {
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(null);
      mockPendingDeletionRepo.create.mockImplementation(async (pending) => pending);

      const result = await service.markForDeletion(
        'e-001',
        'NODE',
        'v-001',
        Namespace.PROJECT,
        'user-001',
        'session-001',
        'Test deletion'
      );

      expect(result.entityId).toBe('e-001');
      expect(result.approved).toBe(false);

      const delayMs = result.executeAfter.getTime() - result.scheduledAt.getTime();
      expect(delayMs).toBe(5000);
    });

    it('should return existing pending deletion', async () => {
      const existingPending = createMockPendingDeletion();
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(existingPending);

      const result = await service.markForDeletion(
        'e-001',
        'NODE',
        'v-001',
        Namespace.PROJECT,
        'user-001',
        'session-001',
        'New reason'
      );

      expect(result.pendingId).toBe('pending-001');
      expect(mockPendingDeletionRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('canConfirmDeletion', () => {
    it('should return false when no pending deletion', async () => {
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(null);

      const result = await service.canConfirmDeletion('e-001', 'user-001');

      expect(result.canConfirm).toBe(false);
      expect(result.pending).toBeNull();
    });

    it('should return false when different user', async () => {
      const pending = createMockPendingDeletion({ scheduledBy: 'other-user' });
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(pending);

      const result = await service.canConfirmDeletion('e-001', 'user-001');

      expect(result.canConfirm).toBe(false);
      expect(result.pending).not.toBeNull();
    });

    it('should return false with waitMs when delay not passed', async () => {
      const now = new Date();
      const pending = createMockPendingDeletion({
        scheduledAt: now,
        executeAfter: new Date(now.getTime() + 5000)
      });
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(pending);

      const result = await service.canConfirmDeletion('e-001', 'user-001');

      expect(result.canConfirm).toBe(false);
      expect(result.waitMs).toBeGreaterThan(0);
      expect(result.waitMs).toBeLessThanOrEqual(5000);
    });

    it('should return true when delay passed', async () => {
      const pastTime = new Date(Date.now() - 10000);
      const pending = createMockPendingDeletion({
        scheduledAt: pastTime,
        executeAfter: new Date(pastTime.getTime() + 5000)
      });
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(pending);

      const result = await service.canConfirmDeletion('e-001', 'user-001');

      expect(result.canConfirm).toBe(true);
    });
  });

  describe('confirmDeletion', () => {
    it('should confirm deletion when allowed', async () => {
      const pastTime = new Date(Date.now() - 10000);
      const pending = createMockPendingDeletion({
        scheduledAt: pastTime,
        executeAfter: new Date(pastTime.getTime() + 5000)
      });
      const confirmedPending = { ...pending, approved: true, approvedBy: 'user-001' };

      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(pending);
      mockPendingDeletionRepo.approve.mockResolvedValue(confirmedPending);

      const result = await service.confirmDeletion('e-001', 'user-001', 'user-001');

      expect(result.approved).toBe(true);
      expect(mockPendingDeletionRepo.approve).toHaveBeenCalled();
    });

    it('should throw TwoPhaseTimeoutError when no pending deletion', async () => {
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(null);

      await expect(service.confirmDeletion('e-001', 'user-001', 'user-001'))
        .rejects.toThrow(TwoPhaseTimeoutError);
    });

    it('should throw when delay not passed', async () => {
      const now = new Date();
      const pending = createMockPendingDeletion({
        scheduledAt: now,
        executeAfter: new Date(now.getTime() + 5000)
      });
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(pending);

      await expect(service.confirmDeletion('e-001', 'user-001', 'user-001'))
        .rejects.toThrow('Must wait');
    });
  });

  describe('cancelPendingDeletion', () => {
    it('should cancel pending deletion', async () => {
      const pending = createMockPendingDeletion();
      const cancelledPending = {
        ...pending,
        cancelled: true,
        cancelledBy: 'user-001',
        cancellationReason: 'Changed mind'
      };

      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(pending);
      mockPendingDeletionRepo.cancel.mockResolvedValue(cancelledPending);

      const result = await service.cancelPendingDeletion('e-001', 'user-001', 'Changed mind');

      expect(result.cancelled).toBe(true);
      expect(result.cancellationReason).toBe('Changed mind');
    });

    it('should throw when no pending deletion', async () => {
      mockPendingDeletionRepo.findByEntityId.mockResolvedValue(null);

      await expect(service.cancelPendingDeletion('e-001', 'user-001', 'Test'))
        .rejects.toThrow('No pending deletion found');
    });
  });

  describe('createTombstone', () => {
    it('should create tombstone', async () => {
      const expectedTombstone: Tombstone = {
        tombstoneId: 'tomb-001',
        entityType: 'NODE',
        entityId: 'e-001',
        lastVersionId: 'v-001',
        namespace: Namespace.PROJECT,
        deletedAt: new Date(),
        deletedBy: 'user-001',
        godModeSessionId: 'session-001',
        reason: 'Test deletion',
        finalContentHash: 'hash123',
        finalChainHash: 'chain123',
        metadata: { snapshot: { name: 'test' } }
      };

      mockTombstoneRepo.create.mockResolvedValue(expectedTombstone);

      const result = await service.createTombstone(
        'e-001',
        'NODE',
        'v-001',
        Namespace.PROJECT,
        'user-001',
        'session-001',
        'Test deletion',
        'hash123',
        'chain123',
        { snapshot: { name: 'test' } }
      );

      expect(result.tombstoneId).toBeDefined();
      expect(result.entityId).toBe('e-001');
    });
  });

  describe('findTombstone', () => {
    it('should find tombstone by entity ID', async () => {
      const tombstone: Tombstone = {
        tombstoneId: 'tomb-001',
        entityType: 'NODE',
        entityId: 'e-001',
        lastVersionId: 'v-001',
        namespace: Namespace.PROJECT,
        deletedAt: new Date(),
        deletedBy: 'user-001',
        godModeSessionId: 'session-001',
        reason: 'Test',
        finalContentHash: 'hash',
        finalChainHash: 'chain',
        metadata: {}
      };

      mockTombstoneRepo.findByEntityId.mockResolvedValue(tombstone);

      const result = await service.findTombstone('e-001');

      expect(result).not.toBeNull();
      expect(result!.entityId).toBe('e-001');
    });

    it('should return null when not found', async () => {
      mockTombstoneRepo.findByEntityId.mockResolvedValue(null);

      const result = await service.findTombstone('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('isDeleted', () => {
    it('should return true when tombstone exists', async () => {
      mockTombstoneRepo.isDeleted.mockResolvedValue(true);

      const result = await service.isDeleted('e-001');

      expect(result).toBe(true);
    });

    it('should return false when no tombstone', async () => {
      mockTombstoneRepo.isDeleted.mockResolvedValue(false);

      const result = await service.isDeleted('e-001');

      expect(result).toBe(false);
    });
  });

  describe('getAuditTrail', () => {
    it('should return audit records for entity', async () => {
      const audits: GodModeAuditRecord[] = [
        {
          auditId: 'audit-001',
          sessionId: 'session-001',
          actionType: GodModeActionType.MUTATE,
          targetType: 'NODE',
          targetVersionId: 'v-001',
          targetEntityId: 'e-001',
          previousState: {},
          newState: {},
          reason: 'Test',
          performedAt: new Date(),
          performedBy: 'user-001',
          reversible: true,
          reversedAt: null,
          reversedBy: null
        }
      ];

      mockAuditRepo.findByTargetEntityId.mockResolvedValue(audits);

      const result = await service.getAuditTrail('e-001');

      expect(result).toHaveLength(1);
      expect(result[0].targetEntityId).toBe('e-001');
    });
  });

  describe('getSessionAuditTrail', () => {
    it('should return audit records for session', async () => {
      const audits: GodModeAuditRecord[] = [
        {
          auditId: 'audit-001',
          sessionId: 'session-001',
          actionType: GodModeActionType.MUTATE,
          targetType: 'NODE',
          targetVersionId: 'v-001',
          targetEntityId: 'e-001',
          previousState: {},
          newState: {},
          reason: 'Test 1',
          performedAt: new Date(),
          performedBy: 'user-001',
          reversible: true,
          reversedAt: null,
          reversedBy: null
        },
        {
          auditId: 'audit-002',
          sessionId: 'session-001',
          actionType: GodModeActionType.DELETE,
          targetType: 'NODE',
          targetVersionId: 'v-002',
          targetEntityId: 'e-002',
          previousState: {},
          newState: null,
          reason: 'Test 2',
          performedAt: new Date(),
          performedBy: 'user-001',
          reversible: false,
          reversedAt: null,
          reversedBy: null
        }
      ];

      mockAuditRepo.findBySessionId.mockResolvedValue(audits);

      const result = await service.getSessionAuditTrail('session-001');

      expect(result).toHaveLength(2);
    });
  });

  describe('getPendingDeletions', () => {
    it('should return pending deletions for execution', async () => {
      const pendings = [createMockPendingDeletion({ approved: true })];
      mockPendingDeletionRepo.findPendingForExecution.mockResolvedValue(pendings);

      const result = await service.getPendingDeletions();

      expect(result).toHaveLength(1);
      expect(result[0].approved).toBe(true);
    });
  });

  describe('getSessionHistory', () => {
    it('should return session history for user', async () => {
      const sessions = [
        createMockSession({ isActive: false, endedAt: new Date() }),
        createMockSession({ sessionId: 'session-002' })
      ];

      mockSessionRepo.getSessionHistory.mockResolvedValue(sessions);

      const result = await service.getSessionHistory('user-001');

      expect(result).toHaveLength(2);
    });
  });
});
