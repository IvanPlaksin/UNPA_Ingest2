/**
 * God Mode Repositories
 * Manages God Mode sessions, auditing, tombstones, and pending deletions
 */

import { BaseRepository } from './base.repository';
import { MemgraphClient } from '../db/memgraph.client';
import {
  GodModeSession,
  GodModeAuditRecord,
  Tombstone,
  PendingDeletion,
  GodModeActionType,
  Namespace,
  EntityNotFoundError
} from '../types/immutable-graph.types';

// ============================================================================
// God Mode Session Repository
// ============================================================================

export class GodModeSessionRepository extends BaseRepository<GodModeSession> {
  protected label = 'GodModeSession';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): GodModeSession {
    return {
      sessionId: record.sessionId as string,
      userId: record.userId as string,
      namespace: record.namespace as Namespace,
      projectId: record.projectId as string | undefined,
      reason: record.reason as string,
      approvedBy: record.approvedBy as string | null,
      startedAt: new Date(record.startedAt as string),
      expiresAt: new Date(record.expiresAt as string),
      endedAt: record.endedAt ? new Date(record.endedAt as string) : null,
      isActive: record.isActive as boolean,
      actionsPerformed: record.actionsPerformed as number
    };
  }

  protected mapToParams(entity: Partial<GodModeSession>): Record<string, unknown> {
    return {
      sessionId: entity.sessionId,
      userId: entity.userId,
      namespace: entity.namespace,
      projectId: entity.projectId || null,
      reason: entity.reason,
      approvedBy: entity.approvedBy || null,
      startedAt: entity.startedAt?.toISOString(),
      expiresAt: entity.expiresAt?.toISOString(),
      endedAt: entity.endedAt?.toISOString() || null,
      isActive: entity.isActive ?? true,
      actionsPerformed: entity.actionsPerformed ?? 0
    };
  }

  async create(session: GodModeSession): Promise<GodModeSession> {
    const params = this.mapToParams(session);

    const cypher = `
      CREATE (s:GodModeSession {
        sessionId: $sessionId,
        userId: $userId,
        namespace: $namespace,
        projectId: $projectId,
        reason: $reason,
        approvedBy: $approvedBy,
        startedAt: $startedAt,
        expiresAt: $expiresAt,
        endedAt: $endedAt,
        isActive: $isActive,
        actionsPerformed: $actionsPerformed
      })
      RETURN s
    `;

    const results = await this.client.executeWrite<{ s: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].s);
  }

  async findBySessionId(sessionId: string): Promise<GodModeSession | null> {
    return this.findById(sessionId, 'sessionId');
  }

  async findActiveSession(userId: string, namespace: Namespace, projectId?: string): Promise<GodModeSession | null> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (projectId) {
      cypher = `
        MATCH (s:GodModeSession {userId: $userId, namespace: $namespace, projectId: $projectId, isActive: true})
        WHERE datetime(s.expiresAt) > datetime()
        RETURN s
      `;
      params = { userId, namespace, projectId };
    } else {
      cypher = `
        MATCH (s:GodModeSession {userId: $userId, namespace: $namespace, isActive: true})
        WHERE s.projectId IS NULL AND datetime(s.expiresAt) > datetime()
        RETURN s
      `;
      params = { userId, namespace };
    }

    const results = await this.client.executeQuery<{ s: Record<string, unknown> }>(cypher, params);
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].s);
  }

  async endSession(sessionId: string): Promise<GodModeSession> {
    const cypher = `
      MATCH (s:GodModeSession {sessionId: $sessionId})
      SET s.isActive = false, s.endedAt = datetime()
      RETURN s
    `;

    const results = await this.client.executeWrite<{ s: Record<string, unknown> }>(cypher, { sessionId });
    if (results.length === 0) {
      throw new EntityNotFoundError(sessionId, 'GodModeSession');
    }
    return this.mapToEntity(results[0].s);
  }

  async incrementActionsCount(sessionId: string): Promise<number> {
    const cypher = `
      MATCH (s:GodModeSession {sessionId: $sessionId})
      SET s.actionsPerformed = s.actionsPerformed + 1
      RETURN s.actionsPerformed as count
    `;

    const results = await this.client.executeWrite<{ count: number }>(cypher, { sessionId });
    return results[0]?.count || 0;
  }

  async expireOldSessions(): Promise<number> {
    const cypher = `
      MATCH (s:GodModeSession {isActive: true})
      WHERE datetime(s.expiresAt) <= datetime()
      SET s.isActive = false, s.endedAt = datetime()
      RETURN count(s) as expiredCount
    `;

    const results = await this.client.executeWrite<{ expiredCount: number }>(cypher, {});
    return results[0]?.expiredCount || 0;
  }

  async getSessionHistory(userId: string, limit: number = 50): Promise<GodModeSession[]> {
    const cypher = `
      MATCH (s:GodModeSession {userId: $userId})
      RETURN s
      ORDER BY s.startedAt DESC
      LIMIT $limit
    `;

    const results = await this.client.executeQuery<{ s: Record<string, unknown> }>(cypher, { userId, limit });
    return results.map(r => this.mapToEntity(r.s));
  }
}

// ============================================================================
// God Mode Audit Repository
// ============================================================================

export class GodModeAuditRepository extends BaseRepository<GodModeAuditRecord> {
  protected label = 'GodModeAudit';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): GodModeAuditRecord {
    return {
      auditId: record.auditId as string,
      sessionId: record.sessionId as string,
      actionType: record.actionType as GodModeActionType,
      targetType: record.targetType as 'NODE' | 'EDGE',
      targetVersionId: record.targetVersionId as string,
      targetEntityId: record.targetEntityId as string,
      previousState: typeof record.previousState === 'string'
        ? JSON.parse(record.previousState)
        : (record.previousState as Record<string, unknown>),
      newState: typeof record.newState === 'string'
        ? JSON.parse(record.newState)
        : (record.newState as Record<string, unknown> | null),
      reason: record.reason as string,
      performedAt: new Date(record.performedAt as string),
      performedBy: record.performedBy as string,
      reversible: record.reversible as boolean,
      reversedAt: record.reversedAt ? new Date(record.reversedAt as string) : null,
      reversedBy: record.reversedBy as string | null
    };
  }

  protected mapToParams(entity: Partial<GodModeAuditRecord>): Record<string, unknown> {
    return {
      auditId: entity.auditId,
      sessionId: entity.sessionId,
      actionType: entity.actionType,
      targetType: entity.targetType,
      targetVersionId: entity.targetVersionId,
      targetEntityId: entity.targetEntityId,
      previousState: JSON.stringify(entity.previousState || {}),
      newState: entity.newState ? JSON.stringify(entity.newState) : null,
      reason: entity.reason,
      performedAt: entity.performedAt?.toISOString(),
      performedBy: entity.performedBy,
      reversible: entity.reversible ?? true,
      reversedAt: entity.reversedAt?.toISOString() || null,
      reversedBy: entity.reversedBy || null
    };
  }

  async create(audit: GodModeAuditRecord): Promise<GodModeAuditRecord> {
    const params = this.mapToParams(audit);

    const cypher = `
      CREATE (a:GodModeAudit {
        auditId: $auditId,
        sessionId: $sessionId,
        actionType: $actionType,
        targetType: $targetType,
        targetVersionId: $targetVersionId,
        targetEntityId: $targetEntityId,
        previousState: $previousState,
        newState: $newState,
        reason: $reason,
        performedAt: $performedAt,
        performedBy: $performedBy,
        reversible: $reversible,
        reversedAt: $reversedAt,
        reversedBy: $reversedBy
      })
      RETURN a
    `;

    const results = await this.client.executeWrite<{ a: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].a);
  }

  async findByAuditId(auditId: string): Promise<GodModeAuditRecord | null> {
    return this.findById(auditId, 'auditId');
  }

  async findBySessionId(sessionId: string): Promise<GodModeAuditRecord[]> {
    const cypher = `
      MATCH (a:GodModeAudit {sessionId: $sessionId})
      RETURN a
      ORDER BY a.performedAt ASC
    `;

    const results = await this.client.executeQuery<{ a: Record<string, unknown> }>(cypher, { sessionId });
    return results.map(r => this.mapToEntity(r.a));
  }

  async findByTargetEntityId(entityId: string): Promise<GodModeAuditRecord[]> {
    const cypher = `
      MATCH (a:GodModeAudit {targetEntityId: $entityId})
      RETURN a
      ORDER BY a.performedAt DESC
    `;

    const results = await this.client.executeQuery<{ a: Record<string, unknown> }>(cypher, { entityId });
    return results.map(r => this.mapToEntity(r.a));
  }

  async markReversed(auditId: string, reversedBy: string): Promise<GodModeAuditRecord> {
    const cypher = `
      MATCH (a:GodModeAudit {auditId: $auditId})
      SET a.reversedAt = datetime(), a.reversedBy = $reversedBy
      RETURN a
    `;

    const results = await this.client.executeWrite<{ a: Record<string, unknown> }>(cypher, { auditId, reversedBy });
    if (results.length === 0) {
      throw new EntityNotFoundError(auditId, 'GodModeAudit');
    }
    return this.mapToEntity(results[0].a);
  }

  async getAuditsByActionType(actionType: GodModeActionType, limit: number = 100): Promise<GodModeAuditRecord[]> {
    const cypher = `
      MATCH (a:GodModeAudit {actionType: $actionType})
      RETURN a
      ORDER BY a.performedAt DESC
      LIMIT $limit
    `;

    const results = await this.client.executeQuery<{ a: Record<string, unknown> }>(cypher, { actionType, limit });
    return results.map(r => this.mapToEntity(r.a));
  }

  async getReversibleAudits(sessionId: string): Promise<GodModeAuditRecord[]> {
    const cypher = `
      MATCH (a:GodModeAudit {sessionId: $sessionId, reversible: true})
      WHERE a.reversedAt IS NULL
      RETURN a
      ORDER BY a.performedAt DESC
    `;

    const results = await this.client.executeQuery<{ a: Record<string, unknown> }>(cypher, { sessionId });
    return results.map(r => this.mapToEntity(r.a));
  }
}

// ============================================================================
// Tombstone Repository
// ============================================================================

export class TombstoneRepository extends BaseRepository<Tombstone> {
  protected label = 'Tombstone';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): Tombstone {
    return {
      tombstoneId: record.tombstoneId as string,
      entityType: record.entityType as 'NODE' | 'EDGE',
      entityId: record.entityId as string,
      lastVersionId: record.lastVersionId as string,
      namespace: record.namespace as Namespace,
      deletedAt: new Date(record.deletedAt as string),
      deletedBy: record.deletedBy as string,
      godModeSessionId: record.godModeSessionId as string,
      reason: record.reason as string,
      finalContentHash: record.finalContentHash as string,
      finalChainHash: record.finalChainHash as string,
      metadata: typeof record.metadata === 'string'
        ? JSON.parse(record.metadata)
        : (record.metadata as Record<string, unknown>) || {}
    };
  }

  protected mapToParams(entity: Partial<Tombstone>): Record<string, unknown> {
    return {
      tombstoneId: entity.tombstoneId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      lastVersionId: entity.lastVersionId,
      namespace: entity.namespace,
      deletedAt: entity.deletedAt?.toISOString(),
      deletedBy: entity.deletedBy,
      godModeSessionId: entity.godModeSessionId,
      reason: entity.reason,
      finalContentHash: entity.finalContentHash,
      finalChainHash: entity.finalChainHash,
      metadata: JSON.stringify(entity.metadata || {})
    };
  }

  async create(tombstone: Tombstone): Promise<Tombstone> {
    const params = this.mapToParams(tombstone);

    const cypher = `
      CREATE (t:Tombstone {
        tombstoneId: $tombstoneId,
        entityType: $entityType,
        entityId: $entityId,
        lastVersionId: $lastVersionId,
        namespace: $namespace,
        deletedAt: $deletedAt,
        deletedBy: $deletedBy,
        godModeSessionId: $godModeSessionId,
        reason: $reason,
        finalContentHash: $finalContentHash,
        finalChainHash: $finalChainHash,
        metadata: $metadata
      })
      RETURN t
    `;

    const results = await this.client.executeWrite<{ t: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].t);
  }

  async findByTombstoneId(tombstoneId: string): Promise<Tombstone | null> {
    return this.findById(tombstoneId, 'tombstoneId');
  }

  async findByEntityId(entityId: string): Promise<Tombstone | null> {
    const cypher = `
      MATCH (t:Tombstone {entityId: $entityId})
      RETURN t
    `;

    const results = await this.client.executeQuery<{ t: Record<string, unknown> }>(cypher, { entityId });
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].t);
  }

  async findByNamespace(namespace: Namespace, limit: number = 100): Promise<Tombstone[]> {
    const cypher = `
      MATCH (t:Tombstone {namespace: $namespace})
      RETURN t
      ORDER BY t.deletedAt DESC
      LIMIT $limit
    `;

    const results = await this.client.executeQuery<{ t: Record<string, unknown> }>(cypher, { namespace, limit });
    return results.map(r => this.mapToEntity(r.t));
  }

  async findByGodModeSession(sessionId: string): Promise<Tombstone[]> {
    const cypher = `
      MATCH (t:Tombstone {godModeSessionId: $sessionId})
      RETURN t
      ORDER BY t.deletedAt ASC
    `;

    const results = await this.client.executeQuery<{ t: Record<string, unknown> }>(cypher, { sessionId });
    return results.map(r => this.mapToEntity(r.t));
  }

  async isDeleted(entityId: string): Promise<boolean> {
    const tombstone = await this.findByEntityId(entityId);
    return tombstone !== null;
  }

  async getDeletedEntitiesInRange(startDate: Date, endDate: Date): Promise<Tombstone[]> {
    const cypher = `
      MATCH (t:Tombstone)
      WHERE datetime(t.deletedAt) >= datetime($startDate)
        AND datetime(t.deletedAt) <= datetime($endDate)
      RETURN t
      ORDER BY t.deletedAt DESC
    `;

    const results = await this.client.executeQuery<{ t: Record<string, unknown> }>(cypher, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    return results.map(r => this.mapToEntity(r.t));
  }
}

// ============================================================================
// Pending Deletion Repository
// ============================================================================

export class PendingDeletionRepository extends BaseRepository<PendingDeletion> {
  protected label = 'PendingDeletion';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): PendingDeletion {
    return {
      pendingId: record.pendingId as string,
      entityType: record.entityType as 'NODE' | 'EDGE',
      entityId: record.entityId as string,
      versionId: record.versionId as string,
      namespace: record.namespace as Namespace,
      scheduledAt: new Date(record.scheduledAt as string),
      scheduledBy: record.scheduledBy as string,
      godModeSessionId: record.godModeSessionId as string,
      executeAfter: new Date(record.executeAfter as string),
      reason: record.reason as string,
      approved: record.approved as boolean,
      approvedBy: record.approvedBy as string | null,
      approvedAt: record.approvedAt ? new Date(record.approvedAt as string) : null,
      executed: record.executed as boolean,
      executedAt: record.executedAt ? new Date(record.executedAt as string) : null,
      cancelled: record.cancelled as boolean,
      cancelledAt: record.cancelledAt ? new Date(record.cancelledAt as string) : null,
      cancelledBy: record.cancelledBy as string | null,
      cancellationReason: record.cancellationReason as string | null
    };
  }

  protected mapToParams(entity: Partial<PendingDeletion>): Record<string, unknown> {
    return {
      pendingId: entity.pendingId,
      entityType: entity.entityType,
      entityId: entity.entityId,
      versionId: entity.versionId,
      namespace: entity.namespace,
      scheduledAt: entity.scheduledAt?.toISOString(),
      scheduledBy: entity.scheduledBy,
      godModeSessionId: entity.godModeSessionId,
      executeAfter: entity.executeAfter?.toISOString(),
      reason: entity.reason,
      approved: entity.approved ?? false,
      approvedBy: entity.approvedBy || null,
      approvedAt: entity.approvedAt?.toISOString() || null,
      executed: entity.executed ?? false,
      executedAt: entity.executedAt?.toISOString() || null,
      cancelled: entity.cancelled ?? false,
      cancelledAt: entity.cancelledAt?.toISOString() || null,
      cancelledBy: entity.cancelledBy || null,
      cancellationReason: entity.cancellationReason || null
    };
  }

  async create(pending: PendingDeletion): Promise<PendingDeletion> {
    const params = this.mapToParams(pending);

    const cypher = `
      CREATE (p:PendingDeletion {
        pendingId: $pendingId,
        entityType: $entityType,
        entityId: $entityId,
        versionId: $versionId,
        namespace: $namespace,
        scheduledAt: $scheduledAt,
        scheduledBy: $scheduledBy,
        godModeSessionId: $godModeSessionId,
        executeAfter: $executeAfter,
        reason: $reason,
        approved: $approved,
        approvedBy: $approvedBy,
        approvedAt: $approvedAt,
        executed: $executed,
        executedAt: $executedAt,
        cancelled: $cancelled,
        cancelledAt: $cancelledAt,
        cancelledBy: $cancelledBy,
        cancellationReason: $cancellationReason
      })
      RETURN p
    `;

    const results = await this.client.executeWrite<{ p: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].p);
  }

  async findByPendingId(pendingId: string): Promise<PendingDeletion | null> {
    return this.findById(pendingId, 'pendingId');
  }

  async findByEntityId(entityId: string): Promise<PendingDeletion | null> {
    const cypher = `
      MATCH (p:PendingDeletion {entityId: $entityId, executed: false, cancelled: false})
      RETURN p
    `;

    const results = await this.client.executeQuery<{ p: Record<string, unknown> }>(cypher, { entityId });
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].p);
  }

  async findPendingForExecution(): Promise<PendingDeletion[]> {
    const cypher = `
      MATCH (p:PendingDeletion {approved: true, executed: false, cancelled: false})
      WHERE datetime(p.executeAfter) <= datetime()
      RETURN p
      ORDER BY p.executeAfter ASC
    `;

    const results = await this.client.executeQuery<{ p: Record<string, unknown> }>(cypher, {});
    return results.map(r => this.mapToEntity(r.p));
  }

  async findAwaitingApproval(): Promise<PendingDeletion[]> {
    const cypher = `
      MATCH (p:PendingDeletion {approved: false, executed: false, cancelled: false})
      RETURN p
      ORDER BY p.scheduledAt ASC
    `;

    const results = await this.client.executeQuery<{ p: Record<string, unknown> }>(cypher, {});
    return results.map(r => this.mapToEntity(r.p));
  }

  async approve(pendingId: string, approvedBy: string): Promise<PendingDeletion> {
    const cypher = `
      MATCH (p:PendingDeletion {pendingId: $pendingId})
      SET p.approved = true, p.approvedBy = $approvedBy, p.approvedAt = datetime()
      RETURN p
    `;

    const results = await this.client.executeWrite<{ p: Record<string, unknown> }>(cypher, { pendingId, approvedBy });
    if (results.length === 0) {
      throw new EntityNotFoundError(pendingId, 'PendingDeletion');
    }
    return this.mapToEntity(results[0].p);
  }

  async markExecuted(pendingId: string): Promise<PendingDeletion> {
    const cypher = `
      MATCH (p:PendingDeletion {pendingId: $pendingId})
      SET p.executed = true, p.executedAt = datetime()
      RETURN p
    `;

    const results = await this.client.executeWrite<{ p: Record<string, unknown> }>(cypher, { pendingId });
    if (results.length === 0) {
      throw new EntityNotFoundError(pendingId, 'PendingDeletion');
    }
    return this.mapToEntity(results[0].p);
  }

  async cancel(pendingId: string, cancelledBy: string, reason: string): Promise<PendingDeletion> {
    const cypher = `
      MATCH (p:PendingDeletion {pendingId: $pendingId})
      SET p.cancelled = true,
          p.cancelledAt = datetime(),
          p.cancelledBy = $cancelledBy,
          p.cancellationReason = $reason
      RETURN p
    `;

    const results = await this.client.executeWrite<{ p: Record<string, unknown> }>(cypher, {
      pendingId,
      cancelledBy,
      reason
    });
    if (results.length === 0) {
      throw new EntityNotFoundError(pendingId, 'PendingDeletion');
    }
    return this.mapToEntity(results[0].p);
  }

  async findByGodModeSession(sessionId: string): Promise<PendingDeletion[]> {
    const cypher = `
      MATCH (p:PendingDeletion {godModeSessionId: $sessionId})
      RETURN p
      ORDER BY p.scheduledAt ASC
    `;

    const results = await this.client.executeQuery<{ p: Record<string, unknown> }>(cypher, { sessionId });
    return results.map(r => this.mapToEntity(r.p));
  }
}
