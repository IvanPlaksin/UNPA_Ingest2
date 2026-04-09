/**
 * Immutable Graph Architecture Services
 * UN ProjectAdvisor - Bi-temporal versioned graph system
 *
 * Exports all services for working with immutable graphs
 */

// Phase 1 Services
export { HashService } from './hash.service';
export { VersionNamingService, VersionNameComponents } from './version-naming.service';
export { StateMachineService, TransitionResult, TransitionInfo } from './state-machine.service';

// Phase 3 Services
export { NamespaceService } from './namespace.service';
export {
  GodModeService,
  GodModeContext,
  ActivateGodModeInput,
  AuditInput
} from './god-mode.service';
export {
  ImmutableGraphService,
  OperationResult,
  MergeResult,
  DeprecationResult,
  GodModeOperationContext
} from './immutable-graph.service';

// Re-export types for convenience
export {
  // Enums
  NodeStatus,
  EdgeStatus,
  OrphanedReason,
  ChangeType,
  GodModeActionType,
  Namespace,
  VersionCodename,

  // Core interfaces
  NodeVersion,
  EdgeVersion,
  NamespaceConfig,
  GodModeSession,
  GodModeAuditRecord,
  Tombstone,
  PendingDeletion,
  MergeRecord,

  // Operation interfaces
  CreateNodeInput,
  UpdateNodeInput,
  CreateEdgeInput,
  MergeNodesInput,
  TemporalQueryParams,

  // State machine
  StateTransition,
  NODE_TRANSITIONS,
  EDGE_TRANSITIONS,

  // Errors
  ImmutableGraphError,
  InvalidStateTransitionError,
  ChainIntegrityViolationError,
  GodModeRequiredError,
  TwoPhaseTimeoutError,
  EntityNotFoundError
} from '../../types/immutable-graph.types';
