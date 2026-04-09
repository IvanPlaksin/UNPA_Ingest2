/**
 * GxeManager Execution Types
 *
 * Core type definitions for execution records managed by GxeManager.
 * These extend (but do not duplicate) the existing ExecutionState from
 * runtime/state/ExecutionStateMachine — GxeManager adds QUEUED, COMPENSATING
 * for multi-execution orchestration.
 *
 * @module gxe-manager/types/execution
 */

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION STATUS (GxeManager-level, superset of RuntimeEngine states)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'QUEUED'|'INITIALIZING'|'RUNNING'|'PAUSED'|'WAITING'|'COMPLETING'|'COMPLETED'|'FAILED'|'CANCELLED'|'TIMED_OUT'|'COMPENSATING'} ExecutionStatus
 */
const ExecutionStatus = {
  QUEUED: 'QUEUED',
  INITIALIZING: 'INITIALIZING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  WAITING: 'WAITING',
  COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT',
  COMPENSATING: 'COMPENSATING'
};

const TERMINAL_STATUSES = new Set([
  ExecutionStatus.COMPLETED,
  ExecutionStatus.FAILED,
  ExecutionStatus.CANCELLED,
  ExecutionStatus.TIMED_OUT
]);

const ACTIVE_STATUSES = new Set([
  ExecutionStatus.RUNNING,
  ExecutionStatus.WAITING,
  ExecutionStatus.PAUSED,
  ExecutionStatus.COMPENSATING
]);

// ═══════════════════════════════════════════════════════════════════════════
// TRIGGER TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'MANUAL'|'CRON'|'INTERVAL'|'ONCE'|'SIGNAL'|'DEPENDENCY'|'SENSOR'} TriggerType
 */
const TriggerType = {
  MANUAL: 'MANUAL',
  CRON: 'CRON',
  INTERVAL: 'INTERVAL',
  ONCE: 'ONCE',
  SIGNAL: 'SIGNAL',
  DEPENDENCY: 'DEPENDENCY',
  SENSOR: 'SENSOR'
};

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'CRITICAL'|'HIGH'|'NORMAL'|'LOW'|'BACKGROUND'} Priority
 */
const Priority = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  LOW: 'LOW',
  BACKGROUND: 'BACKGROUND'
};

/** BullMQ priority mapping (lower = higher priority) */
const PRIORITY_WEIGHT = {
  [Priority.CRITICAL]: 1,
  [Priority.HIGH]: 2,
  [Priority.NORMAL]: 3,
  [Priority.LOW]: 4,
  [Priority.BACKGROUND]: 5
};

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION RECORD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ExecutionRecord
 * @property {string} executionId - UUID
 * @property {string} graphId - Graph (CatalogEntry) ID
 * @property {string|number} graphVersion - Version number or 'latest'
 * @property {TriggerType} triggerType
 * @property {string|null} triggerId - Trigger definition ID (for CRON/SENSOR)
 * @property {ExecutionStatus} status
 * @property {Priority} priority
 * @property {Object} inputPayload - Initial input data
 * @property {string|null} parentExecutionId - For chained executions
 * @property {string|null} transactionId - SAGA transaction grouping
 * @property {string|null} checkpointRef - Redis key for checkpoint data
 * @property {number} createdAt - Epoch ms
 * @property {number|null} startedAt - Epoch ms
 * @property {number|null} pausedAt - Epoch ms
 * @property {number|null} completedAt - Epoch ms
 * @property {number|null} timeoutAt - Epoch ms deadline
 * @property {Object} metadata - Arbitrary user-defined metadata
 * @property {Object} nodeStates - Map<nodeId, NodeExecutionState>
 * @property {string|null} currentNodeId - Currently executing or paused node
 * @property {number} retryCount - Number of retries so far
 * @property {string|null} error - Error message if FAILED
 */

/**
 * Create a new ExecutionRecord with defaults
 * @param {Partial<ExecutionRecord>} overrides
 * @returns {ExecutionRecord}
 */
function createExecutionRecord(overrides = {}) {
  const { randomUUID } = require('node:crypto');
  return {
    executionId: overrides.executionId || randomUUID(),
    graphId: overrides.graphId || null,
    graphVersion: overrides.graphVersion || 'latest',
    triggerType: overrides.triggerType || TriggerType.MANUAL,
    triggerId: overrides.triggerId || null,
    status: overrides.status || ExecutionStatus.QUEUED,
    priority: overrides.priority || Priority.NORMAL,
    inputPayload: overrides.inputPayload || {},
    parentExecutionId: overrides.parentExecutionId || null,
    transactionId: overrides.transactionId || null,
    checkpointRef: overrides.checkpointRef || null,
    createdAt: overrides.createdAt || Date.now(),
    startedAt: overrides.startedAt || null,
    pausedAt: overrides.pausedAt || null,
    completedAt: overrides.completedAt || null,
    timeoutAt: overrides.timeoutAt || null,
    metadata: overrides.metadata || {},
    nodeStates: overrides.nodeStates || {},
    currentNodeId: overrides.currentNodeId || null,
    retryCount: overrides.retryCount || 0,
    error: overrides.error || null
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE EXECUTION STATE (per-node tracking within an execution)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'PENDING'|'RUNNING'|'COMPLETED'|'FAILED'|'SKIPPED'|'WAITING'} NodeExecStatus
 */
const NodeExecStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  WAITING: 'WAITING'
};

/**
 * @typedef {Object} NodeExecutionState
 * @property {string} nodeId
 * @property {NodeExecStatus} status
 * @property {number|null} startedAt
 * @property {number|null} completedAt
 * @property {number|null} durationMs
 * @property {string|null} error
 * @property {number} retryCount
 */

module.exports = {
  ExecutionStatus,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
  TriggerType,
  Priority,
  PRIORITY_WEIGHT,
  NodeExecStatus,
  createExecutionRecord
};
