/**
 * God Mode Service
 * Manages God Mode sessions, auditing, tombstones, and pending deletions
 */

import { v4 as uuidv4 } from 'uuid';
import {
  GodModeSessionRepository,
  GodModeAuditRepository,
  TombstoneRepository,
  PendingDeletionRepository
} from '../../repositories/god-mode.repository';
import {
  GodModeSession,
  GodModeAuditRecord,
  GodModeActionType,
  Tombstone,
  PendingDeletion,
  GodModeRequiredError,
  TwoPhaseTimeoutError,
  Namespace
} from '../../types/immutable-graph.types';
import { NamespaceService } from './namespace.service';

export interface GodModeContext {
  session: GodModeSession;
  userId: string;
}

export interface ActivateGodModeInput {
  userId: string;
  namespace: Namespace;
  projectId?: string;
  reason: string;
  approvedBy?: string;
  durationMinutes?: number;
}

export interface AuditInput {
  actionType: GodModeActionType;
  targetType: 'NODE' | 'EDGE';
  targetVersionId: string;
  targetEntityId: string;
  previousState: Record<string, unknown>;
  newState?: Record<string, unknown> | null;
  reason: string;
}

const DELETION_CONFIRM_DELAY_MS = 5000;

export class GodModeService {
  constructor(
    private sessionRepo: GodModeSessionRepository,
    private auditRepo: GodModeAuditRepository,
    private tombstoneRepo: TombstoneRepository,
    private pendingDeletionRepo: PendingDeletionRepository,
    private namespaceService: NamespaceService
  ) {}

  async activate(input: ActivateGodModeInput): Promise<GodModeSession> {
    const existingSession = await this.sessionRepo.findActiveSession(
      input.userId,
      input.namespace,
      input.projectId
    );
    if (existingSession) {
      return existingSession;
    }

    const durationMs = (input.durationMinutes || 30) * 60 * 1000;
    const now = new Date();

    const session: GodModeSession = {
      sessionId: uuidv4(),
      userId: input.userId,
      namespace: input.namespace,
      projectId: input.projectId,
      reason: input.reason,
      approvedBy: input.approvedBy || null,
      startedAt: now,
      expiresAt: new Date(now.getTime() + durationMs),
      endedAt: null,
      isActive: true,
      actionsPerformed: 0
    };

    return this.sessionRepo.create(session);
  }

  async deactivate(sessionId: string): Promise<GodModeSession> {
    return this.sessionRepo.endSession(sessionId);
  }

  async deactivateExpired(): Promise<number> {
    return this.sessionRepo.expireOldSessions();
  }

  async getActiveSession(userId: string, namespace: Namespace, projectId?: string): Promise<GodModeSession | null> {
    return this.sessionRepo.findActiveSession(userId, namespace, projectId);
  }

  async requireActiveSession(userId: string, namespace: Namespace, projectId?: string): Promise<GodModeSession> {
    const session = await this.getActiveSession(userId, namespace, projectId);
    if (!session) {
      throw new GodModeRequiredError('Active God Mode session required');
    }
    return session;
  }

  async verifyGodModeForNamespace(userId: string, namespace: Namespace, projectId?: string): Promise<GodModeSession> {
    const session = await this.requireActiveSession(userId, namespace, projectId);
    const allowed = await this.namespaceService.isGodModeAllowed(namespace, projectId);
    if (!allowed) {
      throw new GodModeRequiredError(`God Mode not allowed for namespace ${namespace}`);
    }
    return session;
  }

  async createAuditRecord(sessionId: string, performedBy: string, input: AuditInput): Promise<GodModeAuditRecord> {
    const now = new Date();

    const record: GodModeAuditRecord = {
      auditId: uuidv4(),
      sessionId,
      actionType: input.actionType,
      targetType: input.targetType,
      targetVersionId: input.targetVersionId,
      targetEntityId: input.targetEntityId,
      previousState: input.previousState,
      newState: input.newState || null,
      reason: input.reason,
      performedAt: now,
      performedBy,
      reversible: input.actionType !== GodModeActionType.PHYSICAL_DELETE,
      reversedAt: null,
      reversedBy: null
    };

    await this.sessionRepo.incrementActionsCount(sessionId);
    return this.auditRepo.create(record);
  }

  async markForDeletion(
    entityId: string,
    entityType: 'NODE' | 'EDGE',
    versionId: string,
    namespace: Namespace,
    userId: string,
    godModeSessionId: string,
    reason: string
  ): Promise<PendingDeletion> {
    const existing = await this.pendingDeletionRepo.findByEntityId(entityId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const pending: PendingDeletion = {
      pendingId: uuidv4(),
      entityType,
      entityId,
      versionId,
      namespace,
      scheduledAt: now,
      scheduledBy: userId,
      godModeSessionId,
      executeAfter: new Date(now.getTime() + DELETION_CONFIRM_DELAY_MS),
      reason,
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

    return this.pendingDeletionRepo.create(pending);
  }

  async canConfirmDeletion(entityId: string, userId: string): Promise<{
    canConfirm: boolean;
    pending: PendingDeletion | null;
    waitMs?: number;
  }> {
    const pending = await this.pendingDeletionRepo.findByEntityId(entityId);
    if (!pending) {
      return { canConfirm: false, pending: null };
    }

    if (pending.scheduledBy !== userId) {
      return { canConfirm: false, pending };
    }

    const now = new Date();
    if (now < pending.executeAfter) {
      const waitMs = pending.executeAfter.getTime() - now.getTime();
      return { canConfirm: false, pending, waitMs };
    }

    return { canConfirm: true, pending };
  }

  async confirmDeletion(entityId: string, userId: string, approvedBy: string): Promise<PendingDeletion> {
    const { canConfirm, pending, waitMs } = await this.canConfirmDeletion(entityId, userId);

    if (!pending) {
      throw new TwoPhaseTimeoutError(entityId);
    }

    if (!canConfirm) {
      if (waitMs) {
        throw new Error(`Must wait ${Math.ceil(waitMs / 1000)} more seconds before confirming deletion`);
      }
      throw new Error('Cannot confirm deletion: not authorized');
    }

    return this.pendingDeletionRepo.approve(pending.pendingId, approvedBy);
  }

  async cancelPendingDeletion(entityId: string, userId: string, reason: string): Promise<PendingDeletion> {
    const pending = await this.pendingDeletionRepo.findByEntityId(entityId);
    if (!pending) {
      throw new Error(`No pending deletion found for entity ${entityId}`);
    }
    return this.pendingDeletionRepo.cancel(pending.pendingId, userId, reason);
  }

  async createTombstone(
    entityId: string,
    entityType: 'NODE' | 'EDGE',
    lastVersionId: string,
    namespace: Namespace,
    deletedBy: string,
    godModeSessionId: string,
    reason: string,
    finalContentHash: string,
    finalChainHash: string,
    metadata: Record<string, unknown> = {}
  ): Promise<Tombstone> {
    const tombstone: Tombstone = {
      tombstoneId: uuidv4(),
      entityType,
      entityId,
      lastVersionId,
      namespace,
      deletedAt: new Date(),
      deletedBy,
      godModeSessionId,
      reason,
      finalContentHash,
      finalChainHash,
      metadata
    };

    return this.tombstoneRepo.create(tombstone);
  }

  async findTombstone(entityId: string): Promise<Tombstone | null> {
    return this.tombstoneRepo.findByEntityId(entityId);
  }

  async isDeleted(entityId: string): Promise<boolean> {
    return this.tombstoneRepo.isDeleted(entityId);
  }

  async getAuditTrail(entityId: string): Promise<GodModeAuditRecord[]> {
    return this.auditRepo.findByTargetEntityId(entityId);
  }

  async getSessionAuditTrail(sessionId: string): Promise<GodModeAuditRecord[]> {
    return this.auditRepo.findBySessionId(sessionId);
  }

  async getReversibleAudits(sessionId: string): Promise<GodModeAuditRecord[]> {
    return this.auditRepo.getReversibleAudits(sessionId);
  }

  async markAuditReversed(auditId: string, reversedBy: string): Promise<GodModeAuditRecord> {
    return this.auditRepo.markReversed(auditId, reversedBy);
  }

  async getPendingDeletions(): Promise<PendingDeletion[]> {
    return this.pendingDeletionRepo.findPendingForExecution();
  }

  async getAwaitingApproval(): Promise<PendingDeletion[]> {
    return this.pendingDeletionRepo.findAwaitingApproval();
  }

  async markDeletionExecuted(pendingId: string): Promise<PendingDeletion> {
    return this.pendingDeletionRepo.markExecuted(pendingId);
  }

  async getSessionHistory(userId: string): Promise<GodModeSession[]> {
    return this.sessionRepo.getSessionHistory(userId);
  }
}
