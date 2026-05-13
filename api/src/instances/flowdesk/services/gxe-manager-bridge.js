'use strict';

/**
 * Bridge to GxeManager — registers FlowDesk executions for real-time monitoring.
 *
 * Each dialog turn creates an execution record visible in /gxe-manager.
 * Updates status as graph progresses: QUEUED → RUNNING → WAITING/COMPLETED/FAILED.
 */

const { createExecutionRecord, ExecutionStatus } = require('../../../gxe-manager/types/execution.types');

let _registry = null;
let _initPromise = null;

async function getRegistry() {
  if (_registry) return _registry;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const { ExecutionRegistry } = require('../../../gxe-manager/ExecutionRegistry');
      const redisService = require('../../../services/redis.service');
      const redisClient = redisService.getClient();
      _registry = new ExecutionRegistry(redisClient);
      return _registry;
    } catch (err) {
      console.warn('[GxeManager Bridge] Not available:', err.message);
      return null;
    }
  })();

  return _initPromise;
}

/**
 * Register a new FlowDesk execution in GxeManager.
 * Called at the start of each dialog turn.
 */
async function registerExecution(executionId, graphId, inputPayload, metadata = {}) {
  const registry = await getRegistry();
  if (!registry) return null;

  try {
    const record = createExecutionRecord({
      executionId,
      graphId,
      graphVersion: 'latest',
      triggerType: 'MANUAL',
      status: ExecutionStatus.RUNNING,
      inputPayload,
      metadata: { source: 'FlowDesk', ...metadata },
      createdAt: Date.now(),
      startedAt: Date.now(),
    });

    await registry.register(record);
    return record;
  } catch (err) {
    console.warn('[GxeManager Bridge] Register failed:', err.message);
    return null;
  }
}

/**
 * Update execution status and node states after RuntimeEngine completes.
 */
async function updateExecution(executionId, result, nodeResults = {}) {
  const registry = await getRegistry();
  if (!registry) return;

  try {
    // Map RuntimeEngine status to GxeManager status
    let status;
    switch (result.status) {
      case 'WAITING_FOR_INPUT': status = ExecutionStatus.WAITING; break;
      case 'COMPLETED': status = ExecutionStatus.COMPLETED; break;
      case 'FAILED': status = ExecutionStatus.FAILED; break;
      default: status = ExecutionStatus.RUNNING;
    }

    // Build node states for monitoring
    const nodeStates = {};
    for (const [nodeId, nr] of Object.entries(nodeResults)) {
      switch (nr.status) {
        case 'SUCCEEDED': nodeStates[nodeId] = 'COMPLETED'; break;
        case 'FAILED': nodeStates[nodeId] = 'FAILED'; break;
        case 'WAITING_INPUT': nodeStates[nodeId] = 'WAITING'; break;
        case 'SKIPPED': nodeStates[nodeId] = 'SKIPPED'; break;
        case 'CANCELLED': nodeStates[nodeId] = 'SKIPPED'; break;
        default: nodeStates[nodeId] = 'PENDING';
      }
    }

    // Find current node (waiting or last executed)
    const waitingNodes = result.waitingNodes ? Object.keys(result.waitingNodes) : [];
    const currentNodeId = waitingNodes[0] || null;

    await registry.updateStatus(executionId, status, {
      nodeStates,
      currentNodeId,
      completedAt: status === 'COMPLETED' ? Date.now() : null,
      error: result.error || null,
    });
  } catch (err) {
    console.warn('[GxeManager Bridge] Update failed:', err.message);
  }
}

module.exports = { registerExecution, updateExecution };
