/**
 * GXE Runtime Persistence
 *
 * Checkpoint and recovery components for workflow state management.
 *
 * @module runtime/persistence
 */

const {
  CheckpointManager,
  MemoryStorage,
  DEFAULT_CONFIG
} = require('./CheckpointManager');

const {
  RecoveryManager,
  RecoveryStrategy,
  NodeRecoveryStatus
} = require('./RecoveryManager');

module.exports = {
  // Checkpoint management
  CheckpointManager,
  MemoryStorage,
  DEFAULT_CONFIG,

  // Recovery
  RecoveryManager,
  RecoveryStrategy,
  NodeRecoveryStatus
};
