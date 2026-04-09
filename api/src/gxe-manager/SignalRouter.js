/**
 * SignalRouter
 *
 * Routes incoming signals (resume tokens, webhooks, timeouts, cancellations)
 * to the correct execution with idempotency checks and dead-letter queue.
 *
 * @module gxe-manager/SignalRouter
 */

const { EventEmitter } = require('node:events');
const { ExecutionStatus } = require('./types/execution.types');
const { SignalAction } = require('./types/signals.types');

const LOG_TAG = '[SignalRouter]';

class SignalRouter extends EventEmitter {
  /**
   * @param {Object} deps
   * @param {import('./ExecutionRegistry').ExecutionRegistry} deps.registry
   * @param {import('./GxeManagerService').GxeManagerService} deps.gxeManager
   * @param {import('./TriggerEngine').TriggerEngine} deps.triggerEngine
   * @param {import('ioredis').Redis} deps.redis
   */
  constructor(deps) {
    super();
    this.registry = deps.registry;
    this.gxeManager = deps.gxeManager;
    this.triggerEngine = deps.triggerEngine;
    this.redis = deps.redis;

    this.DLQ_KEY = 'gxe:signal-dlq';
    this.IDEMPOTENCY_TTL = 300; // 5 minutes
  }

  /**
   * Route an incoming signal through idempotency check → action resolution → execution
   * @param {import('./types/signals.types').IncomingSignal} signal
   * @returns {Promise<Object>}
   */
  async routeIncomingSignal(signal) {
    // 1. Idempotency check
    if (signal.idempotencyKey) {
      const isDuplicate = await this._checkIdempotency(signal.idempotencyKey);
      if (isDuplicate) {
        this.emit('signal.duplicate', { idempotencyKey: signal.idempotencyKey });
        return { status: 'duplicate', idempotencyKey: signal.idempotencyKey };
      }
      await this._recordIdempotency(signal.idempotencyKey);
    }

    // 2. Route
    try {
      const result = await this._route(signal);
      this.emit('signal.routed', { signalType: signal.signalType, action: signal.action, result });
      return result;
    } catch (error) {
      await this._sendToDLQ(signal, error);
      this.emit('signal.dlq', { signal, error: error.message });
      throw error;
    }
  }

  /** @private */
  async _route(signal) {
    const action = signal.action || this._inferAction(signal);

    switch (action) {
      case SignalAction.RESUME:
      case 'RESUME':
        return await this._handleResume(signal);

      case SignalAction.START:
      case 'START':
        return await this._handleStart(signal);

      case SignalAction.CANCEL:
      case 'CANCEL':
        return await this._handleCancel(signal);

      case SignalAction.ROLLBACK:
      case 'ROLLBACK':
        return await this._handleRollback(signal);

      default:
        // Try to route via TriggerEngine
        if (this.triggerEngine) {
          await this.triggerEngine.handleIncomingSignal(signal);
          return { status: 'forwarded_to_trigger_engine' };
        }
        throw new Error(`Unknown signal action: ${action}`);
    }
  }

  /** @private */
  _inferAction(signal) {
    if (signal.resumeToken) return 'RESUME';
    if (signal.executionId) return 'RESUME';
    return 'START';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  async _handleResume(signal) {
    let targetExecutionId = signal.executionId;
    let targetNodeId = signal.nodeId || null;

    // Resolve via resume token
    if (signal.resumeToken && !targetExecutionId) {
      const tokenData = await this.registry.getByResumeToken(signal.resumeToken);
      if (!tokenData) {
        throw new Error(`Resume token not found or expired: ${signal.resumeToken}`);
      }
      targetExecutionId = tokenData.executionId;
      targetNodeId = tokenData.nodeId;
    }

    if (!targetExecutionId) {
      throw new Error('executionId or resumeToken required for RESUME');
    }

    // Verify execution exists and is paused/waiting
    const record = await this.registry.get(targetExecutionId);
    if (!record) {
      throw new Error(`Execution not found: ${targetExecutionId}`);
    }
    if (record.status !== ExecutionStatus.PAUSED && record.status !== ExecutionStatus.WAITING) {
      throw new Error(`Execution ${targetExecutionId} is not paused (status: ${record.status})`);
    }

    // Resume
    await this.gxeManager.resume(targetExecutionId, {
      nodeId: targetNodeId,
      payload: signal.payload,
      signalType: signal.signalType,
      resumeToken: signal.resumeToken
    });

    // Consume one-time token
    if (signal.resumeToken) {
      await this.registry.consumeResumeToken(signal.resumeToken);
    }

    return { status: 'resumed', executionId: targetExecutionId, nodeId: targetNodeId };
  }

  /** @private */
  async _handleStart(signal) {
    if (this.triggerEngine) {
      await this.triggerEngine.handleIncomingSignal(signal);
    }
    return { status: 'processed', signalType: signal.signalType };
  }

  /** @private */
  async _handleCancel(signal) {
    if (!signal.executionId) {
      throw new Error('executionId required for CANCEL');
    }
    await this.gxeManager.cancel(signal.executionId, signal.payload?.reason || 'Cancelled via signal');
    return { status: 'cancelled', executionId: signal.executionId };
  }

  /** @private */
  async _handleRollback(signal) {
    if (!signal.executionId) {
      throw new Error('executionId required for ROLLBACK');
    }
    // Rollback will be handled by GxeManagerService
    return { status: 'rollback_requested', executionId: signal.executionId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IDEMPOTENCY
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  async _checkIdempotency(key) {
    if (!key) return false;
    try {
      const exists = await this.redis.get(`gxe:idempotency:${key}`);
      return !!exists;
    } catch { return false; }
  }

  /** @private */
  async _recordIdempotency(key) {
    if (!key) return;
    try {
      await this.redis.set(`gxe:idempotency:${key}`, String(Date.now()), 'EX', this.IDEMPOTENCY_TTL);
    } catch (err) {
      console.warn(`${LOG_TAG} Idempotency record failed:`, err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEAD LETTER QUEUE
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  async _sendToDLQ(signal, error) {
    try {
      const entry = JSON.stringify({
        signal,
        error: error.message,
        timestamp: Date.now()
      });
      await this.redis.lpush(this.DLQ_KEY, entry);
      await this.redis.ltrim(this.DLQ_KEY, 0, 999);
    } catch (err) {
      console.error(`${LOG_TAG} DLQ write failed:`, err.message);
    }
  }

  /**
   * Get DLQ entries
   * @param {number} [limit=50]
   * @returns {Promise<Object[]>}
   */
  async getDLQEntries(limit = 50) {
    try {
      const entries = await this.redis.lrange(this.DLQ_KEY, 0, limit - 1);
      return entries.map(e => JSON.parse(e));
    } catch { return []; }
  }

  /**
   * Retry a DLQ entry
   * @param {number} index
   */
  async retryDLQEntry(index) {
    const entries = await this.redis.lrange(this.DLQ_KEY, index, index);
    if (entries.length === 0) throw new Error('DLQ entry not found');

    const entry = JSON.parse(entries[0]);
    await this.redis.lset(this.DLQ_KEY, index, '__DELETED__');
    await this.redis.lrem(this.DLQ_KEY, 1, '__DELETED__');

    return await this.routeIncomingSignal({
      ...entry.signal,
      idempotencyKey: `retry-${Date.now()}-${entry.signal.idempotencyKey || 'none'}`
    });
  }
}

module.exports = { SignalRouter };
