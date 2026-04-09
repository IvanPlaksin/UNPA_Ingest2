/**
 * RecoveryManager
 *
 * Handles recovery of execution state from checkpoints.
 * Coordinates with RuntimeEngine to restore and resume execution.
 *
 * Features:
 * - Restore execution state from checkpoint
 * - Resume execution from specific node
 * - Rollback to previous checkpoint
 * - Validate checkpoint integrity
 * - Handle partial recovery
 *
 * Part of GXE Runtime Environment P2.
 *
 * @module runtime/persistence/RecoveryManager
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recovery result
 * @typedef {Object} RecoveryResult
 * @property {boolean} success - Whether recovery succeeded
 * @property {string} executionId - Execution ID
 * @property {string} checkpointId - Checkpoint used
 * @property {Object} restoredState - Restored execution state
 * @property {string[]} restoredNodes - List of nodes with restored state
 * @property {string[]} errors - Any errors encountered
 * @property {number} durationMs - Recovery duration
 */

/**
 * Recovery strategy
 */
const RecoveryStrategy = {
  FULL: 'full',           // Restore all state completely
  PARTIAL: 'partial',     // Restore only completed nodes, re-run pending
  SELECTIVE: 'selective'  // Restore specific nodes only
};

/**
 * Node recovery status
 */
const NodeRecoveryStatus = {
  RESTORED: 'restored',
  SKIPPED: 'skipped',
  FAILED: 'failed',
  RESET: 'reset'
};

// ═══════════════════════════════════════════════════════════════════════════
// RECOVERY MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages recovery from checkpoints
 */
class RecoveryManager {
  /**
   * @param {Object} params
   * @param {CheckpointManager} params.checkpointManager
   * @param {Object} [params.config]
   */
  constructor(params) {
    this._checkpointManager = params.checkpointManager;
    this._config = {
      validateIntegrity: true,
      defaultStrategy: RecoveryStrategy.FULL,
      ...params.config
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE RECOVERY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Recover execution state from a checkpoint
   * @param {Object} params
   * @param {string} params.checkpointId - Checkpoint to recover from
   * @param {string} [params.strategy='full'] - Recovery strategy
   * @param {string[]} [params.nodeIds] - Specific nodes (for selective strategy)
   * @returns {Promise<RecoveryResult>}
   */
  async recover(params) {
    const startTime = Date.now();
    const { checkpointId, strategy = this._config.defaultStrategy, nodeIds = [] } = params;

    const result = {
      success: false,
      executionId: null,
      checkpointId,
      restoredState: null,
      restoredNodes: [],
      nodeStatuses: {},
      errors: [],
      durationMs: 0
    };

    try {
      // Load checkpoint
      const checkpoint = await this._checkpointManager.loadCheckpoint(checkpointId);
      if (!checkpoint) {
        result.errors.push(`Checkpoint not found: ${checkpointId}`);
        return this._finalize(result, startTime);
      }

      result.executionId = checkpoint.executionId;

      // Validate integrity if enabled
      if (this._config.validateIntegrity) {
        const validation = this._validateCheckpoint(checkpoint);
        if (!validation.valid) {
          result.errors.push(...validation.errors);
          return this._finalize(result, startTime);
        }
      }

      // Apply recovery strategy
      switch (strategy) {
        case RecoveryStrategy.FULL:
          this._applyFullRecovery(checkpoint, result);
          break;
        case RecoveryStrategy.PARTIAL:
          this._applyPartialRecovery(checkpoint, result);
          break;
        case RecoveryStrategy.SELECTIVE:
          this._applySelectiveRecovery(checkpoint, result, nodeIds);
          break;
        default:
          result.errors.push(`Unknown strategy: ${strategy}`);
          return this._finalize(result, startTime);
      }

      result.success = result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Recovery error: ${error.message}`);
    }

    return this._finalize(result, startTime);
  }

  /**
   * Recover from the latest checkpoint for an execution
   * @param {string} executionId
   * @param {Object} [options]
   * @returns {Promise<RecoveryResult>}
   */
  async recoverLatest(executionId, options = {}) {
    const checkpoint = await this._checkpointManager.loadLatest(executionId);
    if (!checkpoint) {
      return {
        success: false,
        executionId,
        checkpointId: null,
        restoredState: null,
        restoredNodes: [],
        nodeStatuses: {},
        errors: [`No checkpoints found for execution: ${executionId}`],
        durationMs: 0
      };
    }

    return this.recover({
      checkpointId: checkpoint.id,
      ...options
    });
  }

  /**
   * Recover from checkpoint with specific tag
   * @param {string} executionId
   * @param {string} tag
   * @param {Object} [options]
   * @returns {Promise<RecoveryResult>}
   */
  async recoverByTag(executionId, tag, options = {}) {
    const checkpoint = await this._checkpointManager.loadByTag(executionId, tag);
    if (!checkpoint) {
      return {
        success: false,
        executionId,
        checkpointId: null,
        restoredState: null,
        restoredNodes: [],
        nodeStatuses: {},
        errors: [`No checkpoint found with tag '${tag}' for execution: ${executionId}`],
        durationMs: 0
      };
    }

    return this.recover({
      checkpointId: checkpoint.id,
      ...options
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROLLBACK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rollback to a specific checkpoint version
   * @param {string} executionId
   * @param {number} version
   * @returns {Promise<RecoveryResult>}
   */
  async rollbackToVersion(executionId, version) {
    const checkpoints = await this._checkpointManager.listCheckpoints(executionId);
    const target = checkpoints.find(cp => cp.version === version);

    if (!target) {
      return {
        success: false,
        executionId,
        checkpointId: null,
        restoredState: null,
        restoredNodes: [],
        nodeStatuses: {},
        errors: [`No checkpoint found at version ${version}`],
        durationMs: 0
      };
    }

    return this.recover({ checkpointId: target.id });
  }

  /**
   * Rollback N versions back
   * @param {string} executionId
   * @param {number} stepsBack
   * @returns {Promise<RecoveryResult>}
   */
  async rollbackSteps(executionId, stepsBack = 1) {
    const checkpoints = await this._checkpointManager.listCheckpoints(executionId);

    if (checkpoints.length === 0) {
      return {
        success: false,
        executionId,
        checkpointId: null,
        restoredState: null,
        restoredNodes: [],
        nodeStatuses: {},
        errors: ['No checkpoints available'],
        durationMs: 0
      };
    }

    // Sort by version descending
    checkpoints.sort((a, b) => b.version - a.version);

    const targetIndex = Math.min(stepsBack, checkpoints.length - 1);
    const target = checkpoints[targetIndex];

    return this.recover({ checkpointId: target.id });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate checkpoint can be used for recovery
   * @param {string} checkpointId
   * @returns {Promise<{valid: boolean, errors: string[]}>}
   */
  async validateCheckpoint(checkpointId) {
    const checkpoint = await this._checkpointManager.loadCheckpoint(checkpointId);
    if (!checkpoint) {
      return { valid: false, errors: ['Checkpoint not found'] };
    }
    return this._validateCheckpoint(checkpoint);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOVERY STATE BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build runtime-compatible state from recovery result
   * @param {RecoveryResult} recoveryResult
   * @returns {Object}
   */
  buildRuntimeState(recoveryResult) {
    if (!recoveryResult.success || !recoveryResult.restoredState) {
      return null;
    }

    return {
      executionState: recoveryResult.restoredState.executionState,
      nodeStates: new Map(Object.entries(recoveryResult.restoredState.nodeStates || {})),
      portData: new Map(Object.entries(recoveryResult.restoredState.portData || {})),
      variables: recoveryResult.restoredState.variables || {},
      metadata: {
        recoveredFrom: recoveryResult.checkpointId,
        recoveredAt: Date.now()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _validateCheckpoint(checkpoint) {
    const errors = [];

    if (!checkpoint.id) {
      errors.push('Missing checkpoint ID');
    }
    if (!checkpoint.executionId) {
      errors.push('Missing execution ID');
    }
    if (!checkpoint.state) {
      errors.push('Missing execution state');
    }
    if (!checkpoint.nodeStates || typeof checkpoint.nodeStates !== 'object') {
      errors.push('Invalid node states');
    }
    if (typeof checkpoint.version !== 'number') {
      errors.push('Invalid version number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _applyFullRecovery(checkpoint, result) {
    // Restore everything
    result.restoredState = {
      executionState: checkpoint.state.current,
      nodeStates: { ...checkpoint.nodeStates },
      portData: { ...checkpoint.portData },
      variables: { ...checkpoint.variables }
    };

    // Mark all nodes as restored
    for (const nodeId of Object.keys(checkpoint.nodeStates)) {
      result.restoredNodes.push(nodeId);
      result.nodeStatuses[nodeId] = NodeRecoveryStatus.RESTORED;
    }
  }

  _applyPartialRecovery(checkpoint, result) {
    // Restore only completed nodes
    result.restoredState = {
      executionState: checkpoint.state.current,
      nodeStates: {},
      portData: {},
      variables: { ...checkpoint.variables }
    };

    for (const [nodeId, nodeState] of Object.entries(checkpoint.nodeStates)) {
      // Check if node was completed
      if (nodeState === 'COMPLETED' || nodeState.current === 'COMPLETED') {
        result.restoredState.nodeStates[nodeId] = nodeState;
        result.restoredNodes.push(nodeId);
        result.nodeStatuses[nodeId] = NodeRecoveryStatus.RESTORED;

        // Restore port data for completed nodes
        for (const [portKey, portValue] of Object.entries(checkpoint.portData)) {
          if (portKey.startsWith(nodeId + ':')) {
            result.restoredState.portData[portKey] = portValue;
          }
        }
      } else {
        // Reset non-completed nodes to IDLE
        result.restoredState.nodeStates[nodeId] = 'IDLE';
        result.nodeStatuses[nodeId] = NodeRecoveryStatus.RESET;
      }
    }
  }

  _applySelectiveRecovery(checkpoint, result, nodeIds) {
    result.restoredState = {
      executionState: checkpoint.state.current,
      nodeStates: {},
      portData: {},
      variables: { ...checkpoint.variables }
    };

    const targetSet = new Set(nodeIds);

    for (const [nodeId, nodeState] of Object.entries(checkpoint.nodeStates)) {
      if (targetSet.has(nodeId)) {
        result.restoredState.nodeStates[nodeId] = nodeState;
        result.restoredNodes.push(nodeId);
        result.nodeStatuses[nodeId] = NodeRecoveryStatus.RESTORED;

        // Restore port data for selected nodes
        for (const [portKey, portValue] of Object.entries(checkpoint.portData)) {
          if (portKey.startsWith(nodeId + ':')) {
            result.restoredState.portData[portKey] = portValue;
          }
        }
      } else {
        result.nodeStatuses[nodeId] = NodeRecoveryStatus.SKIPPED;
      }
    }
  }

  _finalize(result, startTime) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  get config() {
    return { ...this._config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  RecoveryManager,
  RecoveryStrategy,
  NodeRecoveryStatus
};
