/**
 * GxeManager — Module Index
 *
 * Central exports for the GxeManager execution orchestrator.
 *
 * @module gxe-manager
 */

const { GxeManagerService } = require('./GxeManagerService');
const { ExecutionRegistry } = require('./ExecutionRegistry');
const { QueueManager, QUEUE_NAMES } = require('./QueueManager');
const { TriggerEngine } = require('./TriggerEngine');
const { ConcurrencyGovernor } = require('./ConcurrencyGovernor');
const { SignalRouter } = require('./SignalRouter');
const { AuditLogger } = require('./AuditLogger');
const { TransactionCoordinator } = require('./TransactionCoordinator');
const executionTypes = require('./types/execution.types');
const signalTypes = require('./types/signals.types');

module.exports = {
  GxeManagerService,
  ExecutionRegistry,
  QueueManager,
  QUEUE_NAMES,
  TriggerEngine,
  ConcurrencyGovernor,
  SignalRouter,
  AuditLogger,
  TransactionCoordinator,
  ...executionTypes,
  ...signalTypes
};
