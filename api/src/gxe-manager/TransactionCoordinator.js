const EventEmitter = require('events');
const Redlock = require('redlock').default || require('redlock');

/**
 * TransactionCoordinator manages distributed transactions across multiple graph executions.
 * Implements SAGA pattern with compensation support.
 */
class TransactionCoordinator extends EventEmitter {
  constructor(gxeManagerService, executionRegistry, redisClient, memgraphService) {
    super();
    this.gxeManager = gxeManagerService;
    this.registry = executionRegistry;
    this.redis = redisClient;
    this.memgraph = memgraphService;

    // Distributed lock for critical sections
    this.redlock = new Redlock([redisClient], {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 100
    });

    // Transaction TTL (24 hours default)
    this.TRANSACTION_TTL = 86400;

    this._subscribeToEvents();
  }

  /**
   * Start a new SAGA transaction
   * @param {Object} sagaDefinition
   * @returns {Object} Transaction record
   */
  async startTransaction(sagaDefinition) {
    const transactionId = sagaDefinition.transactionId ||
      `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const transaction = {
      transactionId,
      name: sagaDefinition.name,
      status: 'PENDING',
      steps: sagaDefinition.steps.map((step, index) => ({
        stepIndex: index,
        graphId: step.graphId,
        inputPayload: step.inputPayload || {},
        compensationGraphId: step.compensationGraphId || null,
        timeout: step.timeout || null,
        status: 'PENDING',
        executionId: null,
        compensationExecutionId: null,
        startedAt: null,
        completedAt: null,
        error: null
      })),
      concurrencyMode: sagaDefinition.concurrencyMode || 'SEQUENTIAL',
      onFailure: sagaDefinition.onFailure || 'COMPENSATE',
      currentStepIndex: 0,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      metadata: sagaDefinition.metadata || {}
    };

    await this._saveTransaction(transaction);
    await this._persistTransactionToMemgraph(transaction);

    this.emit('transaction.created', { transactionId, name: transaction.name });

    return transaction;
  }

  /**
   * Execute a SAGA transaction
   */
  async executeTransaction(transactionId) {
    const lock = await this.redlock.acquire([`lock:txn:${transactionId}`], 30000);

    try {
      const transaction = await this._getTransaction(transactionId);
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      if (transaction.status !== 'PENDING') {
        throw new Error(`Transaction already started: ${transaction.status}`);
      }

      transaction.status = 'RUNNING';
      transaction.startedAt = Date.now();
      await this._saveTransaction(transaction);

      this.emit('transaction.started', { transactionId });

      if (transaction.concurrencyMode === 'PARALLEL') {
        await this._executeParallel(transaction);
      } else {
        await this._executeSequential(transaction);
      }

    } finally {
      await lock.release();
    }
  }

  async _executeSequential(transaction) {
    for (let i = transaction.currentStepIndex; i < transaction.steps.length; i++) {
      const step = transaction.steps[i];

      try {
        step.status = 'RUNNING';
        step.startedAt = Date.now();
        transaction.currentStepIndex = i;
        await this._saveTransaction(transaction);

        const execution = await this.gxeManager.launch(step.graphId, {
          ...step.inputPayload,
          _transactionId: transaction.transactionId,
          _stepIndex: i
        }, {
          transactionId: transaction.transactionId,
          priority: 'HIGH',
          timeoutSeconds: step.timeout,
          metadata: { sagaStep: i, sagaName: transaction.name }
        });

        step.executionId = execution.executionId;
        await this._saveTransaction(transaction);

        await this._waitForExecution(execution.executionId, step.timeout);

        const result = await this.registry.get(execution.executionId);

        if (result.status === 'COMPLETED') {
          step.status = 'COMPLETED';
          step.completedAt = Date.now();
          step.result = result.result;
          await this._saveTransaction(transaction);

          this.emit('transaction.step_completed', {
            transactionId: transaction.transactionId,
            stepIndex: i,
            executionId: execution.executionId
          });

        } else {
          step.status = 'FAILED';
          step.completedAt = Date.now();
          step.error = result.error || { message: `Execution ended with status: ${result.status}` };
          await this._saveTransaction(transaction);

          this.emit('transaction.step_failed', {
            transactionId: transaction.transactionId,
            stepIndex: i,
            error: step.error
          });

          await this._handleStepFailure(transaction, i);
          return;
        }

      } catch (error) {
        step.status = 'FAILED';
        step.completedAt = Date.now();
        step.error = { message: error.message, stack: error.stack };
        await this._saveTransaction(transaction);

        await this._handleStepFailure(transaction, i);
        return;
      }
    }

    transaction.status = 'COMPLETED';
    transaction.completedAt = Date.now();
    await this._saveTransaction(transaction);
    await this._updateTransactionInMemgraph(transaction);

    this.emit('transaction.completed', { transactionId: transaction.transactionId });
  }

  async _executeParallel(transaction) {
    const promises = transaction.steps.map(async (step, i) => {
      try {
        step.status = 'RUNNING';
        step.startedAt = Date.now();

        const execution = await this.gxeManager.launch(step.graphId, {
          ...step.inputPayload,
          _transactionId: transaction.transactionId,
          _stepIndex: i
        }, {
          transactionId: transaction.transactionId,
          priority: 'HIGH',
          timeoutSeconds: step.timeout
        });

        step.executionId = execution.executionId;

        await this._waitForExecution(execution.executionId, step.timeout);

        const result = await this.registry.get(execution.executionId);

        if (result.status === 'COMPLETED') {
          step.status = 'COMPLETED';
          step.completedAt = Date.now();
          step.result = result.result;
          return { success: true, stepIndex: i };
        } else {
          step.status = 'FAILED';
          step.completedAt = Date.now();
          step.error = result.error;
          return { success: false, stepIndex: i, error: step.error };
        }

      } catch (error) {
        step.status = 'FAILED';
        step.completedAt = Date.now();
        step.error = { message: error.message };
        return { success: false, stepIndex: i, error: step.error };
      }
    });

    await this._saveTransaction(transaction);

    const results = await Promise.all(promises);
    await this._saveTransaction(transaction);

    const failures = results.filter(r => !r.success);

    if (failures.length > 0) {
      if (transaction.onFailure === 'COMPENSATE') {
        await this._runCompensation(transaction);
      } else if (transaction.onFailure === 'PAUSE') {
        transaction.status = 'PAUSED';
        await this._saveTransaction(transaction);
      } else {
        transaction.status = 'FAILED';
        transaction.completedAt = Date.now();
        await this._saveTransaction(transaction);
      }
    } else {
      transaction.status = 'COMPLETED';
      transaction.completedAt = Date.now();
      await this._saveTransaction(transaction);

      this.emit('transaction.completed', { transactionId: transaction.transactionId });
    }

    await this._updateTransactionInMemgraph(transaction);
  }

  async _handleStepFailure(transaction, failedStepIndex) {
    switch (transaction.onFailure) {
      case 'COMPENSATE':
        await this._runCompensation(transaction, failedStepIndex);
        break;

      case 'PAUSE':
        transaction.status = 'PAUSED';
        await this._saveTransaction(transaction);
        this.emit('transaction.paused', {
          transactionId: transaction.transactionId,
          failedStep: failedStepIndex
        });
        break;

      case 'IGNORE':
      default:
        transaction.status = 'FAILED';
        transaction.completedAt = Date.now();
        await this._saveTransaction(transaction);
        this.emit('transaction.failed', {
          transactionId: transaction.transactionId,
          failedStep: failedStepIndex
        });
        break;
    }

    await this._updateTransactionInMemgraph(transaction);
  }

  async _runCompensation(transaction, fromStepIndex = null) {
    transaction.status = 'COMPENSATING';
    await this._saveTransaction(transaction);

    this.emit('transaction.compensating', { transactionId: transaction.transactionId });

    const stepsToCompensate = transaction.steps
      .filter((step, i) => {
        if (fromStepIndex !== null && i >= fromStepIndex) return false;
        return step.status === 'COMPLETED' && step.compensationGraphId;
      })
      .reverse();

    for (const step of stepsToCompensate) {
      try {
        const compensationExecution = await this.gxeManager.launch(
          step.compensationGraphId,
          {
            _originalInput: step.inputPayload,
            _originalResult: step.result,
            _transactionId: transaction.transactionId,
            _stepIndex: step.stepIndex
          },
          {
            transactionId: transaction.transactionId,
            priority: 'CRITICAL',
            metadata: {
              compensationFor: step.executionId,
              sagaName: transaction.name
            }
          }
        );

        step.compensationExecutionId = compensationExecution.executionId;
        await this._saveTransaction(transaction);

        await this._waitForExecution(compensationExecution.executionId);

        step.status = 'COMPENSATED';
        await this._saveTransaction(transaction);

        this.emit('transaction.step_compensated', {
          transactionId: transaction.transactionId,
          stepIndex: step.stepIndex
        });

      } catch (error) {
        console.error(`Compensation failed for step ${step.stepIndex}:`, error);
      }
    }

    transaction.status = 'COMPENSATED';
    transaction.completedAt = Date.now();
    await this._saveTransaction(transaction);
    await this._updateTransactionInMemgraph(transaction);

    this.emit('transaction.compensated', { transactionId: transaction.transactionId });
  }

  async _waitForExecution(executionId, timeoutMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.registry.get(executionId);

      if (!execution) {
        throw new Error(`Execution not found: ${executionId}`);
      }

      const terminalStatuses = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'];
      if (terminalStatuses.includes(execution.status)) {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Execution timeout: ${executionId}`);
  }

  async getTransaction(transactionId) {
    return this._getTransaction(transactionId);
  }

  async listTransactions(filters = {}) {
    let whereClause = '';
    const conditions = [];

    if (filters.status) {
      conditions.push('t.status = $status');
    }
    if (filters.name) {
      conditions.push('t.name CONTAINS $name');
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const cypher = `
      MATCH (t:SagaTransaction:META)
      ${whereClause}
      RETURN t
      ORDER BY t.createdAt DESC
      LIMIT $limit
    `;

    const results = await this.memgraph.query(cypher, {
      status: filters.status,
      name: filters.name,
      limit: filters.limit || 50
    });

    return results.map(row => ({
      ...row.t.properties,
      steps: JSON.parse(row.t.properties.steps || '[]')
    }));
  }

  async resumeTransaction(transactionId) {
    const transaction = await this._getTransaction(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (transaction.status !== 'PAUSED') {
      throw new Error(`Transaction is not paused: ${transaction.status}`);
    }

    const failedStepIndex = transaction.steps.findIndex(s => s.status === 'FAILED');
    if (failedStepIndex === -1) {
      throw new Error('No failed step found to resume from');
    }

    transaction.steps[failedStepIndex].status = 'PENDING';
    transaction.steps[failedStepIndex].error = null;
    transaction.currentStepIndex = failedStepIndex;
    transaction.status = 'RUNNING';
    await this._saveTransaction(transaction);

    if (transaction.concurrencyMode === 'SEQUENTIAL') {
      await this._executeSequential(transaction);
    }

    return transaction;
  }

  async cancelTransaction(transactionId, options = {}) {
    const lock = await this.redlock.acquire([`lock:txn:${transactionId}`], 30000);

    try {
      const transaction = await this._getTransaction(transactionId);
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }

      for (const step of transaction.steps) {
        if (step.status === 'RUNNING' && step.executionId) {
          try {
            await this.gxeManager.cancel(step.executionId, {
              reason: 'Transaction cancelled'
            });
          } catch (e) {
            console.warn(`Failed to cancel step execution: ${step.executionId}`);
          }
        }
      }

      if (options.runCompensation) {
        await this._runCompensation(transaction);
      } else {
        transaction.status = 'CANCELLED';
        transaction.completedAt = Date.now();
        await this._saveTransaction(transaction);
        await this._updateTransactionInMemgraph(transaction);
      }

      this.emit('transaction.cancelled', { transactionId });

      return transaction;

    } finally {
      await lock.release();
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  async _saveTransaction(transaction) {
    const key = `gxe:transaction:${transaction.transactionId}`;
    await this.redis.set(key, JSON.stringify(transaction), 'EX', this.TRANSACTION_TTL);
  }

  async _getTransaction(transactionId) {
    const key = `gxe:transaction:${transactionId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async _persistTransactionToMemgraph(transaction) {
    try {
      const cypher = `
        CREATE (t:SagaTransaction:META {
          transactionId: $transactionId,
          name: $name,
          status: $status,
          steps: $steps,
          concurrencyMode: $concurrencyMode,
          onFailure: $onFailure,
          createdAt: $createdAt,
          metadata: $metadata
        })
        RETURN t
      `;

      await this.memgraph.query(cypher, {
        transactionId: transaction.transactionId,
        name: transaction.name,
        status: transaction.status,
        steps: JSON.stringify(transaction.steps),
        concurrencyMode: transaction.concurrencyMode,
        onFailure: transaction.onFailure,
        createdAt: transaction.createdAt,
        metadata: JSON.stringify(transaction.metadata)
      });
    } catch (err) {
      console.warn('[TransactionCoordinator] Memgraph persist failed:', err.message);
    }
  }

  async _updateTransactionInMemgraph(transaction) {
    try {
      const cypher = `
        MATCH (t:SagaTransaction:META {transactionId: $transactionId})
        SET t.status = $status,
            t.steps = $steps,
            t.completedAt = $completedAt
        RETURN t
      `;

      await this.memgraph.query(cypher, {
        transactionId: transaction.transactionId,
        status: transaction.status,
        steps: JSON.stringify(transaction.steps),
        completedAt: transaction.completedAt || null
      });
    } catch (err) {
      console.warn('[TransactionCoordinator] Memgraph update failed:', err.message);
    }
  }

  _subscribeToEvents() {
    this.gxeManager.on('execution.completed', async (data) => {
      // Transaction step completed — handled by _waitForExecution polling
    });

    this.gxeManager.on('execution.failed', async (data) => {
      // Transaction step failed — handled by _waitForExecution polling
    });
  }
}

module.exports = { TransactionCoordinator };
