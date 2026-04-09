/**
 * TransactionManager - Unit of Work pattern for pipeline operations
 *
 * Provides distributed transaction-like behavior for coordinating writes to
 * Qdrant (vectors) and Memgraph (graph) with rollback capability.
 *
 * Features:
 * - Compensating transactions for each operation
 * - Checkpoint system for long-running pipelines
 * - Rollback to checkpoint or full rollback
 * - Detailed logging and status tracking
 *
 * @module services/pipeline/TransactionManager
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Operation status enum
 */
const OperationStatus = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    ROLLED_BACK: 'rolled_back',
    ROLLBACK_FAILED: 'rollback_failed'
};

/**
 * Transaction status enum
 */
const TransactionStatus = {
    ACTIVE: 'active',
    COMMITTED: 'committed',
    ROLLING_BACK: 'rolling_back',
    ROLLED_BACK: 'rolled_back',
    FAILED: 'failed'
};

/**
 * TransactionManager class
 * Implements Unit of Work pattern with compensating transactions
 */
class TransactionManager {
    /**
     * Create TransactionManager instance
     * @param {Object} options - Configuration options
     * @param {boolean} options.autoRollbackOnError - Auto rollback on operation error
     * @param {number} options.operationTimeout - Timeout for single operation (ms)
     */
    constructor(options = {}) {
        this.options = {
            autoRollbackOnError: options.autoRollbackOnError ?? false,
            operationTimeout: options.operationTimeout ?? 30000,
            ...options
        };

        this.transactionId = null;
        this.status = null;
        this.operations = [];
        this.checkpoints = [];
        this.currentCheckpoint = null;
        this.startTime = null;
        this.endTime = null;
        this.metadata = {};
    }

    /**
     * Begin a new transaction
     * @param {string} transactionId - Optional custom transaction ID
     * @param {Object} metadata - Optional metadata for the transaction
     * @returns {string} Transaction ID
     */
    begin(transactionId = null, metadata = {}) {
        if (this.status === TransactionStatus.ACTIVE) {
            throw new Error('Transaction already active. Commit or rollback first.');
        }

        this.transactionId = transactionId || `txn_${uuidv4().slice(0, 8)}_${Date.now()}`;
        this.status = TransactionStatus.ACTIVE;
        this.operations = [];
        this.checkpoints = [];
        this.currentCheckpoint = null;
        this.startTime = Date.now();
        this.endTime = null;
        this.metadata = { ...metadata };

        console.log(`[TransactionManager] Transaction ${this.transactionId} started`);

        return this.transactionId;
    }

    /**
     * Register an operation with its compensating action
     * @param {string} type - Operation type (e.g., 'qdrant_upsert', 'memgraph_create')
     * @param {Object} data - Operation data (for logging and compensation)
     * @param {Function} compensate - Async function to undo the operation
     * @returns {string} Operation ID
     */
    registerOperation(type, data, compensate) {
        if (this.status !== TransactionStatus.ACTIVE) {
            throw new Error('Cannot register operation: transaction not active');
        }

        const operation = {
            id: `op_${this.operations.length}_${Date.now()}`,
            type,
            data,
            compensate,
            timestamp: Date.now(),
            status: OperationStatus.PENDING,
            completedAt: null,
            error: null
        };

        this.operations.push(operation);

        console.log(`[TransactionManager] Registered operation ${operation.id} (${type})`);

        return operation.id;
    }

    /**
     * Execute an operation with automatic registration and completion tracking
     * @param {string} type - Operation type
     * @param {Function} execute - Async function that performs the operation
     * @param {Function} compensate - Async function to undo the operation
     * @param {Object} metadata - Additional operation metadata
     * @returns {Promise<any>} Result of the execute function
     */
    async executeOperation(type, execute, compensate, metadata = {}) {
        const operationId = this.registerOperation(type, metadata, compensate);

        try {
            const result = await execute();
            this.markCompleted(operationId);
            return result;
        } catch (error) {
            this.markFailed(operationId, error);

            if (this.options.autoRollbackOnError) {
                console.log(`[TransactionManager] Auto-rollback triggered by operation failure`);
                await this.rollback();
            }

            throw error;
        }
    }

    /**
     * Mark an operation as completed
     * @param {string} operationId - Operation ID
     */
    markCompleted(operationId) {
        const operation = this.operations.find(op => op.id === operationId);
        if (operation) {
            operation.status = OperationStatus.COMPLETED;
            operation.completedAt = Date.now();
            console.log(`[TransactionManager] Operation ${operationId} completed`);
        }
    }

    /**
     * Mark an operation as failed
     * @param {string} operationId - Operation ID
     * @param {Error} error - Error that caused the failure
     */
    markFailed(operationId, error) {
        const operation = this.operations.find(op => op.id === operationId);
        if (operation) {
            operation.status = OperationStatus.FAILED;
            operation.error = error?.message || String(error);
            console.error(`[TransactionManager] Operation ${operationId} failed:`, error?.message);
        }
    }

    /**
     * Create a checkpoint for partial rollback
     * @param {string} name - Checkpoint name
     * @param {Object} state - Optional state to preserve
     * @returns {string} Checkpoint ID
     */
    createCheckpoint(name, state = {}) {
        if (this.status !== TransactionStatus.ACTIVE) {
            throw new Error('Cannot create checkpoint: transaction not active');
        }

        const checkpoint = {
            id: `cp_${this.checkpoints.length}_${Date.now()}`,
            name,
            state,
            operationIndex: this.operations.length,
            timestamp: Date.now()
        };

        this.checkpoints.push(checkpoint);
        this.currentCheckpoint = checkpoint;

        console.log(`[TransactionManager] Checkpoint created: ${name} (${checkpoint.id})`);

        return checkpoint.id;
    }

    /**
     * Rollback operations
     * @param {string} toCheckpointId - Optional checkpoint ID to rollback to
     * @returns {Promise<Object>} Rollback result
     */
    async rollback(toCheckpointId = null) {
        if (this.status !== TransactionStatus.ACTIVE && this.status !== TransactionStatus.FAILED) {
            throw new Error(`Cannot rollback: transaction status is ${this.status}`);
        }

        this.status = TransactionStatus.ROLLING_BACK;
        console.log(`[TransactionManager] Rolling back transaction ${this.transactionId}`);

        const rollbackResult = {
            success: true,
            operationsRolledBack: 0,
            operationsFailed: 0,
            toCheckpoint: null,
            errors: []
        };

        let operationsToRollback;

        if (toCheckpointId) {
            // Rollback to specific checkpoint
            const checkpoint = this.checkpoints.find(cp => cp.id === toCheckpointId);
            if (!checkpoint) {
                throw new Error(`Checkpoint ${toCheckpointId} not found`);
            }

            rollbackResult.toCheckpoint = checkpoint.name;
            operationsToRollback = this.operations
                .slice(checkpoint.operationIndex)
                .filter(op => op.status === OperationStatus.COMPLETED)
                .reverse();

            console.log(`[TransactionManager] Rolling back to checkpoint: ${checkpoint.name}`);
        } else {
            // Full rollback
            operationsToRollback = this.operations
                .filter(op => op.status === OperationStatus.COMPLETED)
                .reverse();

            console.log(`[TransactionManager] Full rollback: ${operationsToRollback.length} operations`);
        }

        // Execute compensating actions in reverse order
        for (const operation of operationsToRollback) {
            if (!operation.compensate) {
                console.warn(`[TransactionManager] No compensate function for ${operation.id}`);
                continue;
            }

            try {
                console.log(`[TransactionManager] Compensating ${operation.type}: ${operation.id}`);
                await operation.compensate(operation.data);
                operation.status = OperationStatus.ROLLED_BACK;
                rollbackResult.operationsRolledBack++;
            } catch (error) {
                console.error(`[TransactionManager] Compensation failed for ${operation.id}:`, error.message);
                operation.status = OperationStatus.ROLLBACK_FAILED;
                operation.rollbackError = error.message;
                rollbackResult.operationsFailed++;
                rollbackResult.errors.push({
                    operationId: operation.id,
                    type: operation.type,
                    error: error.message
                });
                // Continue with other operations
            }
        }

        // Update transaction status
        this.status = rollbackResult.operationsFailed === 0
            ? TransactionStatus.ROLLED_BACK
            : TransactionStatus.FAILED;

        this.endTime = Date.now();

        rollbackResult.success = rollbackResult.operationsFailed === 0;

        console.log(`[TransactionManager] Rollback completed:`, {
            success: rollbackResult.success,
            rolledBack: rollbackResult.operationsRolledBack,
            failed: rollbackResult.operationsFailed
        });

        return rollbackResult;
    }

    /**
     * Commit the transaction (mark as complete, no actual commit needed)
     * @returns {Object} Transaction result
     */
    commit() {
        if (this.status !== TransactionStatus.ACTIVE) {
            throw new Error(`Cannot commit: transaction status is ${this.status}`);
        }

        this.status = TransactionStatus.COMMITTED;
        this.endTime = Date.now();
        const duration = this.endTime - this.startTime;

        const completedOps = this.operations.filter(op => op.status === OperationStatus.COMPLETED).length;
        const failedOps = this.operations.filter(op => op.status === OperationStatus.FAILED).length;

        const result = {
            transactionId: this.transactionId,
            status: this.status,
            duration,
            operations: {
                total: this.operations.length,
                completed: completedOps,
                failed: failedOps
            },
            checkpoints: this.checkpoints.length,
            metadata: this.metadata
        };

        console.log(`[TransactionManager] Transaction ${this.transactionId} committed`, {
            duration: `${duration}ms`,
            operations: result.operations
        });

        return result;
    }

    /**
     * Get current transaction status
     * @returns {Object} Transaction status
     */
    getStatus() {
        return {
            transactionId: this.transactionId,
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.endTime ? this.endTime - this.startTime : Date.now() - this.startTime,
            operations: this.operations.map(op => ({
                id: op.id,
                type: op.type,
                status: op.status,
                error: op.error
            })),
            checkpoints: this.checkpoints.map(cp => ({
                id: cp.id,
                name: cp.name,
                operationIndex: cp.operationIndex
            })),
            currentCheckpoint: this.currentCheckpoint?.name || null,
            metadata: this.metadata
        };
    }

    /**
     * Check if transaction is active
     * @returns {boolean}
     */
    isActive() {
        return this.status === TransactionStatus.ACTIVE;
    }

    /**
     * Get failed operations
     * @returns {Array} Failed operations
     */
    getFailedOperations() {
        return this.operations.filter(op =>
            op.status === OperationStatus.FAILED ||
            op.status === OperationStatus.ROLLBACK_FAILED
        );
    }
}

/**
 * Factory function to create TransactionManager
 * @param {Object} options - Configuration options
 * @returns {TransactionManager}
 */
function createTransactionManager(options = {}) {
    return new TransactionManager(options);
}

module.exports = {
    TransactionManager,
    createTransactionManager,
    OperationStatus,
    TransactionStatus
};
