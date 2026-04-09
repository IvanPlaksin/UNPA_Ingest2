/**
 * Repository Layer Exports
 * Immutable Graph Architecture - Phase 2
 */

// Base repository
export { BaseRepository } from './base.repository';

// Entity repositories
export { NamespaceConfigRepository } from './namespace-config.repository';
export { NodeVersionRepository } from './node-version.repository';
export { EdgeVersionRepository } from './edge-version.repository';

// God Mode repositories
export {
  GodModeSessionRepository,
  GodModeAuditRepository,
  TombstoneRepository,
  PendingDeletionRepository
} from './god-mode.repository';

// Merge repository
export { MergeRecordRepository } from './merge-record.repository';

// Re-export types for convenience
export type {
  NodeVersion,
  EdgeVersion,
  NamespaceConfig,
  GodModeSession,
  GodModeAuditRecord,
  Tombstone,
  PendingDeletion,
  MergeRecord
} from '../types/immutable-graph.types';
