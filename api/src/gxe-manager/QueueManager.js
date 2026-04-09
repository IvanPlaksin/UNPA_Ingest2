/**
 * GxeManager QueueManager
 *
 * BullMQ-based job queue infrastructure for GxeManager.
 * Manages 4 queues: execution, trigger, signal, timeout.
 *
 * @module gxe-manager/QueueManager
 */

const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { ExecutionStatus, PRIORITY_WEIGHT } = require('./types/execution.types');

const LOG_TAG = '[GxeManager:Queue]';

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null
};

const QUEUE_NAMES = {
  EXECUTION: 'gxe:execution-queue',
  TRIGGER: 'gxe:trigger-queue',
  SIGNAL: 'gxe:signal-queue',
  TIMEOUT: 'gxe:timeout-queue'
};

class QueueManager {
  /**
   * @param {Object} deps
   * @param {import('./GxeManagerService').GxeManagerService} deps.manager
   * @param {Object} [deps.redisConfig] - Override Redis connection config
   */
  constructor(deps) {
    this.manager = deps.manager;
    this.connection = new IORedis(deps.redisConfig || REDIS_CONFIG);

    this.queues = {};
    this.workers = {};
    this._started = false;
  }

  async start() {
    if (this._started) return;

    // Create queues
    this.queues.execution = new Queue(QUEUE_NAMES.EXECUTION, {
      connection: this.connection.duplicate(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500
      }
    });

    this.queues.trigger = new Queue(QUEUE_NAMES.TRIGGER, {
      connection: this.connection.duplicate()
    });

    this.queues.signal = new Queue(QUEUE_NAMES.SIGNAL, {
      connection: this.connection.duplicate()
    });

    this.queues.timeout = new Queue(QUEUE_NAMES.TIMEOUT, {
      connection: this.connection.duplicate()
    });

    // Create workers
    this.workers.execution = new Worker(
      QUEUE_NAMES.EXECUTION,
      async (job) => this._processExecution(job),
      { connection: this.connection.duplicate(), concurrency: 5 }
    );

    this.workers.signal = new Worker(
      QUEUE_NAMES.SIGNAL,
      async (job) => this._processSignal(job),
      { connection: this.connection.duplicate(), concurrency: 10 }
    );

    this.workers.timeout = new Worker(
      QUEUE_NAMES.TIMEOUT,
      async (job) => this._processTimeout(job),
      { connection: this.connection.duplicate(), concurrency: 3 }
    );

    // Error handlers
    for (const [name, worker] of Object.entries(this.workers)) {
      worker.on('failed', (job, err) => {
        console.error(`${LOG_TAG} ${name} job ${job?.id} failed:`, err.message);
      });
    }

    this._started = true;
    console.log(`${LOG_TAG} Started (4 queues, 3 workers)`);
  }

  async stop() {
    if (!this._started) return;

    // Close workers first (drain)
    for (const worker of Object.values(this.workers)) {
      await worker.close();
    }
    // Close queues
    for (const queue of Object.values(this.queues)) {
      await queue.close();
    }
    // Close connection
    this.connection.disconnect();

    this._started = false;
    console.log(`${LOG_TAG} Stopped`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENQUEUE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enqueue a graph execution
   * @param {string} executionId
   * @param {string} [priority='NORMAL']
   */
  async enqueueExecution(executionId, priority = 'NORMAL') {
    const bullPriority = PRIORITY_WEIGHT[priority] || 3;
    await this.queues.execution.add('execute', { executionId }, {
      priority: bullPriority,
      jobId: `exec-${executionId}`
    });
  }

  /**
   * Enqueue a signal for processing
   * @param {import('./types/signals.types').IncomingSignal} signal
   */
  async enqueueSignal(signal) {
    await this.queues.signal.add('signal', signal, {
      jobId: `sig-${signal.idempotencyKey}`
    });
  }

  /**
   * Schedule a timeout check
   * @param {string} executionId
   * @param {string} nodeId
   * @param {number} delayMs
   * @param {string} [timeoutAction='FAIL']
   */
  async scheduleTimeout(executionId, nodeId, delayMs, timeoutAction = 'FAIL') {
    await this.queues.timeout.add('timeout', {
      executionId,
      nodeId,
      timeoutAction
    }, {
      delay: delayMs,
      jobId: `timeout-${executionId}-${nodeId}`
    });
  }

  /**
   * Cancel a scheduled timeout
   * @param {string} executionId
   * @param {string} nodeId
   */
  async cancelTimeout(executionId, nodeId) {
    const jobId = `timeout-${executionId}-${nodeId}`;
    const job = await this.queues.timeout.getJob(jobId);
    if (job) await job.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKERS (job processors)
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  async _processExecution(job) {
    const { executionId } = job.data;
    console.log(`${LOG_TAG} Processing execution job: ${executionId}`);

    const record = await this.manager.registry.get(executionId);
    if (!record) {
      console.warn(`${LOG_TAG} Execution ${executionId} not found, skipping`);
      return;
    }
    if (record.status !== ExecutionStatus.QUEUED) {
      console.warn(`${LOG_TAG} Execution ${executionId} is ${record.status}, not QUEUED`);
      return;
    }

    await this.manager._startExecution(record);
  }

  /** @private */
  async _processSignal(job) {
    const signal = job.data;
    console.log(`${LOG_TAG} Processing signal: ${signal.signalType} for ${signal.executionId || 'new'}`);

    // Phase 2 will implement full signal routing
    // For now, handle basic RESUME
    if (signal.action === 'RESUME' && signal.executionId) {
      await this.manager.resume(signal.executionId, signal.payload);
    }
  }

  /** @private */
  async _processTimeout(job) {
    const { executionId, nodeId, timeoutAction } = job.data;
    console.log(`${LOG_TAG} Timeout for ${executionId} node ${nodeId}: ${timeoutAction}`);

    const record = await this.manager.registry.get(executionId);
    if (!record) return;

    // Only act if still in WAITING or PAUSED
    if (record.status === ExecutionStatus.WAITING || record.status === ExecutionStatus.PAUSED) {
      if (timeoutAction === 'FAIL') {
        await this.manager.cancel(executionId, `Timeout on node ${nodeId}`);
      } else if (timeoutAction === 'SKIP') {
        // Phase 2: skip node and continue
        console.log(`${LOG_TAG} Skip-timeout not yet implemented for ${executionId}`);
      }
    }
  }
}

module.exports = { QueueManager, QUEUE_NAMES };
