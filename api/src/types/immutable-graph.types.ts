/**
 * Immutable Graph Architecture Types
 * UN ProjectAdvisor - Bi-temporal versioned graph system
 *
 * Core types for append-only graph operations with God Mode support
 */

// === ENUMS ===

export enum NodeStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  DEPRECATED = 'DEPRECATED',
  MERGED = 'MERGED',
  DELETED = 'DELETED'
}

export enum EdgeStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  ORPHANED = 'ORPHANED',
  DEPRECATED = 'DEPRECATED',
  DELETED = 'DELETED'
}

export enum OrphanedReason {
  SOURCE_DEPRECATED = 'SOURCE_DEPRECATED',
  TARGET_DEPRECATED = 'TARGET_DEPRECATED',
  BOTH = 'BOTH'
}

export enum ChangeType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DEPRECATE = 'DEPRECATE',
  MERGE = 'MERGE',
  SPLIT = 'SPLIT',
  RESTORE = 'RESTORE'
}

export enum GodModeActionType {
  DELETE = 'DELETE',
  PHYSICAL_DELETE = 'PHYSICAL_DELETE',
  MUTATE = 'MUTATE',
  PURGE_HISTORY = 'PURGE_HISTORY',
  MODIFY_TIMESTAMP = 'MODIFY_TIMESTAMP',
  RESTORE = 'RESTORE'
}

export enum Namespace {
  CORE = 'CORE',
  PROJECT = 'PROJECT',
  META = 'META',
  COMMON = 'COMMON'
}

export enum VersionCodename {
  Genesis = 'Genesis',
  FastForward = 'FastForward',
  Refinement = 'Refinement',
  Correction = 'Correction',
  Enrichment = 'Enrichment',
  Consolidation = 'Consolidation',
  Extraction = 'Extraction',
  Learning = 'Learning'
}

// === CORE INTERFACES ===

export interface NodeVersion {
  versionId: string;
  entityId: string;
  namespace: Namespace;
  sequenceNumber: bigint;
  versionName: string;
  status: NodeStatus;
  ttStart: Date;
  ttEnd: Date | null;
  vtStart: Date;
  vtEnd: Date | null;
  previousVersionId: string | null;
  supersededById: string | null;
  mergedFromIds: string[];
  splitIntoIds: string[];
  changeType: ChangeType;
  changeReason: string;
  changedBy: string;
  changeSource: string;
  extractionCycleId: string | null;
  contentHash: string;
  previousHash: string | null;
  chainHash: string;
  signature: string | null;
  properties: Record<string, unknown>;
  nodeType: string;
}

export interface EdgeVersion {
  versionId: string;
  edgeId: string;
  sourceEntityId: string;
  targetEntityId: string;
  edgeType: string;
  namespace: Namespace;
  sequenceNumber: bigint;
  versionName: string;
  status: EdgeStatus;
  orphanedReason: OrphanedReason | null;
  orphanedAt: Date | null;
  orphanedByNodeId: string | null;
  originalStatus: EdgeStatus | null;
  ttStart: Date;
  ttEnd: Date | null;
  vtStart: Date;
  vtEnd: Date | null;
  previousVersionId: string | null;
  supersededById: string | null;
  changeType: ChangeType;
  changeReason: string;
  changedBy: string;
  contentHash: string;
  previousHash: string | null;
  chainHash: string;
  properties: Record<string, unknown>;
}

export interface NamespaceConfig {
  namespaceId: Namespace;
  projectId?: string;
  currentEpoch: number;
  currentSequence: bigint;
  lastVersionName: string;
  godModeAllowed: boolean;
  description: string;
  createdAt: Date;
}

export interface GodModeSession {
  sessionId: string;
  userId: string;
  namespace: Namespace;
  projectId?: string;
  reason: string;
  approvedBy: string | null;
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  isActive: boolean;
  actionsPerformed: number;
}

export interface GodModeAuditRecord {
  auditId: string;
  sessionId: string;
  actionType: GodModeActionType;
  targetType: 'NODE' | 'EDGE';
  targetVersionId: string;
  targetEntityId: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown> | null;
  reason: string;
  performedAt: Date;
  performedBy: string;
  reversible: boolean;
  reversedAt: Date | null;
  reversedBy: string | null;
}

export interface Tombstone {
  tombstoneId: string;
  entityType: 'NODE' | 'EDGE';
  entityId: string;
  lastVersionId: string;
  namespace: Namespace;
  deletedAt: Date;
  deletedBy: string;
  godModeSessionId: string;
  reason: string;
  finalContentHash: string;
  finalChainHash: string;
  metadata: Record<string, unknown>;
}

export interface PendingDeletion {
  pendingId: string;
  entityType: 'NODE' | 'EDGE';
  entityId: string;
  versionId: string;
  namespace: Namespace;
  scheduledAt: Date;
  scheduledBy: string;
  godModeSessionId: string;
  executeAfter: Date;
  reason: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  executed: boolean;
  executedAt: Date | null;
  cancelled: boolean;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
}

export interface MergeRecord {
  mergeId: string;
  namespace: Namespace;
  sourceEntityIds: string[];
  sourceVersionIds: string[];
  resultEntityId: string;
  resultVersionId: string;
  mergedAt: Date;
  mergedBy: string;
  mergeReason: string;
  mergeStrategy: 'UNION' | 'INTERSECTION' | 'CUSTOM';
  conflictResolutions: Record<string, unknown>;
  contributionWeights: Record<string, number>;
}

// === OPERATION INTERFACES ===

export interface CreateNodeInput {
  namespace: Namespace;
  projectId?: string;
  nodeType: string;
  properties: Record<string, unknown>;
  validTimeStart?: Date;
  changeReason: string;
  changedBy: string;
  changeSource: string;
}

export interface UpdateNodeInput {
  entityId: string;
  newProperties: Record<string, unknown>;
  changeReason: string;
  changedBy: string;
  validTimeStart?: Date;
}

export interface CreateEdgeInput {
  sourceEntityId: string;
  targetEntityId: string;
  edgeType: string;
  namespace: Namespace;
  properties: Record<string, unknown>;
  changeReason: string;
  changedBy: string;
}

export interface MergeNodesInput {
  entityIdA: string;
  entityIdB: string;
  mergeReason: string;
  mergedBy: string;
}

export interface TemporalQueryParams {
  namespace: Namespace;
  projectId?: string;
  validTime?: Date;
  transactionTime?: Date;
  versionName?: string;
  filters?: Record<string, unknown>;
}

// === STATE MACHINE TYPES ===

export interface StateTransition {
  from: NodeStatus | EdgeStatus;
  to: NodeStatus | EdgeStatus;
  action: string;
  requiresGodMode: boolean;
}

export const NODE_TRANSITIONS: StateTransition[] = [
  { from: NodeStatus.DRAFT, to: NodeStatus.ACTIVE, action: 'validate_and_publish', requiresGodMode: false },
  { from: NodeStatus.ACTIVE, to: NodeStatus.SUPERSEDED, action: 'create_new_version', requiresGodMode: false },
  { from: NodeStatus.ACTIVE, to: NodeStatus.DEPRECATED, action: 'deprecate', requiresGodMode: false },
  { from: NodeStatus.ACTIVE, to: NodeStatus.MERGED, action: 'merge_nodes', requiresGodMode: false },
  { from: NodeStatus.DRAFT, to: NodeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: NodeStatus.ACTIVE, to: NodeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: NodeStatus.SUPERSEDED, to: NodeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: NodeStatus.DEPRECATED, to: NodeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: NodeStatus.MERGED, to: NodeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: NodeStatus.DEPRECATED, to: NodeStatus.ACTIVE, action: 'restore', requiresGodMode: true },
  { from: NodeStatus.SUPERSEDED, to: NodeStatus.ACTIVE, action: 'restore', requiresGodMode: true }
];

export const EDGE_TRANSITIONS: StateTransition[] = [
  { from: EdgeStatus.ACTIVE, to: EdgeStatus.SUPERSEDED, action: 'create_new_version', requiresGodMode: false },
  { from: EdgeStatus.ACTIVE, to: EdgeStatus.DEPRECATED, action: 'deprecate', requiresGodMode: false },
  { from: EdgeStatus.ACTIVE, to: EdgeStatus.ORPHANED, action: 'cascade_orphan', requiresGodMode: false },
  { from: EdgeStatus.ACTIVE, to: EdgeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: EdgeStatus.SUPERSEDED, to: EdgeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: EdgeStatus.ORPHANED, to: EdgeStatus.DELETED, action: 'physical_delete', requiresGodMode: true },
  { from: EdgeStatus.DEPRECATED, to: EdgeStatus.DELETED, action: 'physical_delete', requiresGodMode: true }
];

// === ERROR TYPES ===

export class ImmutableGraphError extends Error {
  constructor(message: string, public code: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ImmutableGraphError';
  }
}

export class InvalidStateTransitionError extends ImmutableGraphError {
  constructor(currentState: string, targetState: string, allowedTransitions: string[]) {
    super(
      `Invalid state transition from ${currentState} to ${targetState}`,
      'INVALID_STATE_TRANSITION',
      { currentState, targetState, allowedTransitions }
    );
  }
}

export class ChainIntegrityViolationError extends ImmutableGraphError {
  constructor(versionId: string, expected: string, actual: string) {
    super(
      `Chain integrity violation for version ${versionId}`,
      'CHAIN_INTEGRITY_VIOLATION',
      { versionId, expected, actual }
    );
  }
}

export class GodModeRequiredError extends ImmutableGraphError {
  constructor(operation: string) {
    super(
      `Operation ${operation} requires God Mode to be active`,
      'GOD_MODE_REQUIRED',
      { operation }
    );
  }
}

export class TwoPhaseTimeoutError extends ImmutableGraphError {
  constructor(entityId: string) {
    super(
      `Two-phase deletion timeout for entity ${entityId}`,
      'TWO_PHASE_TIMEOUT',
      { entityId }
    );
  }
}

export class EntityNotFoundError extends ImmutableGraphError {
  constructor(entityId: string, entityType: string) {
    super(
      `Entity ${entityId} of type ${entityType} not found`,
      'ENTITY_NOT_FOUND',
      { entityId, entityType }
    );
  }
}
