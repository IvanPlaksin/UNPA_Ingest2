/**
 * GxeManager Signal Types
 *
 * Defines signal structures for inter-execution communication,
 * external callbacks, human input, and trigger events.
 *
 * @module gxe-manager/types/signals
 */

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'HUMAN_INPUT'|'APPROVAL_RESPONSE'|'EXTERNAL_CALLBACK'|'TIMEOUT_EXPIRED'|'CHAIN_COMPLETE'|'CANCELLATION'|'SENSOR_TRIGGER'} SignalType
 */
const SignalType = {
  HUMAN_INPUT: 'HUMAN_INPUT',
  APPROVAL_RESPONSE: 'APPROVAL_RESPONSE',
  EXTERNAL_CALLBACK: 'EXTERNAL_CALLBACK',
  TIMEOUT_EXPIRED: 'TIMEOUT_EXPIRED',
  CHAIN_COMPLETE: 'CHAIN_COMPLETE',
  CANCELLATION: 'CANCELLATION',
  SENSOR_TRIGGER: 'SENSOR_TRIGGER'
};

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL ACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {'START'|'RESUME'|'CANCEL'|'ROLLBACK'} SignalAction
 */
const SignalAction = {
  START: 'START',
  RESUME: 'RESUME',
  CANCEL: 'CANCEL',
  ROLLBACK: 'ROLLBACK'
};

// ═══════════════════════════════════════════════════════════════════════════
// INCOMING SIGNAL STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} IncomingSignal
 * @property {SignalType} signalType - Type of signal
 * @property {SignalAction} action - What to do (START new or RESUME existing)
 * @property {string|null} executionId - Target execution (for RESUME/CANCEL)
 * @property {string|null} resumeToken - Opaque token to resolve paused node
 * @property {Object} payload - Signal data (human input, callback response, etc.)
 * @property {string} idempotencyKey - Dedup key (prevents double-processing)
 * @property {number} timestamp - Epoch ms
 * @property {string} source - Origin identifier (e.g. 'webhook:123', 'ui:user@example.com')
 */

/**
 * Create a new IncomingSignal with defaults
 * @param {Partial<IncomingSignal>} overrides
 * @returns {IncomingSignal}
 */
function createSignal(overrides = {}) {
  const { randomUUID } = require('node:crypto');
  return {
    signalType: overrides.signalType || SignalType.EXTERNAL_CALLBACK,
    action: overrides.action || SignalAction.RESUME,
    executionId: overrides.executionId || null,
    resumeToken: overrides.resumeToken || null,
    payload: overrides.payload || {},
    idempotencyKey: overrides.idempotencyKey || randomUUID(),
    timestamp: overrides.timestamp || Date.now(),
    source: overrides.source || 'unknown'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIGGER DEFINITION (for CRON / SENSOR triggers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TriggerDefinition
 * @property {string} triggerId - Unique trigger ID
 * @property {string} graphId - Graph to execute
 * @property {import('./execution.types').TriggerType} triggerType
 * @property {boolean} enabled
 * @property {string|null} cronExpression - For CRON type (e.g. '0 * * * *')
 * @property {number|null} intervalMs - For INTERVAL type
 * @property {string|null} signalFilter - For SIGNAL type (pattern to match)
 * @property {Object} defaultPayload - Default input payload
 * @property {Object} metadata
 * @property {number} createdAt
 * @property {number|null} lastFiredAt
 * @property {number} fireCount
 */

/**
 * Create a new TriggerDefinition with defaults
 * @param {Partial<TriggerDefinition>} overrides
 * @returns {TriggerDefinition}
 */
function createTriggerDefinition(overrides = {}) {
  const { randomUUID } = require('node:crypto');
  return {
    triggerId: overrides.triggerId || randomUUID(),
    graphId: overrides.graphId || null,
    triggerType: overrides.triggerType || 'MANUAL',
    enabled: overrides.enabled !== undefined ? overrides.enabled : true,
    cronExpression: overrides.cronExpression || null,
    intervalMs: overrides.intervalMs || null,
    signalFilter: overrides.signalFilter || null,
    defaultPayload: overrides.defaultPayload || {},
    metadata: overrides.metadata || {},
    createdAt: overrides.createdAt || Date.now(),
    lastFiredAt: overrides.lastFiredAt || null,
    fireCount: overrides.fireCount || 0
  };
}

module.exports = {
  SignalType,
  SignalAction,
  createSignal,
  createTriggerDefinition
};
