'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CC-018: Polystore Saga — CODEX-POLY §7.2
// Saga pattern for coordinated writes across Memgraph, Qdrant, and Redis.
// If a later step fails, earlier steps are compensated (rolled back) in LIFO
// order, preventing partial writes from corrupting the polystore.
// ════════════════════════════════════════════════════════════════════════════

const COMPENSATION_TIMEOUT_MS = 5000;

/**
 * Error thrown when a saga execution fails.
 * Carries the original error, which steps completed, and the compensation result.
 */
class SagaFailedError extends Error {
    /**
     * @param {string} message - Human-readable description
     * @param {Error} originalError - The error that caused the saga to fail
     * @param {string[]} completedSteps - Names of operations that succeeded before failure
     * @param {{ compensated: string[], failed: Array<{ name: string, error: string }> }} compensationResult
     */
    constructor(message, originalError, completedSteps, compensationResult) {
        super(message);
        this.name = 'SagaFailedError';
        this.originalError = originalError;
        this.completedSteps = completedSteps;
        this.compensationResult = compensationResult;
    }
}

/**
 * PolystoreSaga coordinates writes across multiple stores using the Saga
 * pattern. Operations execute in sequence; if any operation fails, all
 * previously completed operations are compensated in reverse order (LIFO).
 *
 * Usage:
 *   const saga = new PolystoreSaga();
 *   const result = await saga.execute([
 *       { name: 'CreateNode', execute: () => ..., compensate: (res) => ... },
 *       { name: 'UpsertVector', execute: () => ..., compensate: (res) => ... },
 *   ]);
 */
class PolystoreSaga {
    constructor() {
        /** @type {Array<{ name: string, fn: () => Promise<void> }>} */
        this.compensations = [];
        /** @type {Array<{ ts: string, event: string, detail?: any }>} */
        this.log = [];
    }

    /**
     * Append an entry to the internal execution log.
     * @param {string} event
     * @param {any} [detail]
     */
    _log(event, detail) {
        this.log.push({ ts: new Date().toISOString(), event, detail });
    }

    /**
     * Execute a list of operations in sequence. On failure, compensate all
     * previously completed steps and throw SagaFailedError.
     *
     * @param {Array<{ name: string, execute: () => Promise<any>, compensate: (result: any) => Promise<void> }>} operations
     * @returns {Promise<{ success: true, results: any[] }>}
     * @throws {SagaFailedError}
     */
    async execute(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('PolystoreSaga.execute requires a non-empty array of operations');
        }

        const results = [];
        const completedSteps = [];

        for (const op of operations) {
            this._log('step:start', { name: op.name });

            try {
                const result = await op.execute();
                results.push(result);
                completedSteps.push(op.name);

                // Push compensation to the front so compensations run LIFO
                this.compensations.unshift({
                    name: op.name,
                    fn: () => op.compensate(result),
                });

                this._log('step:success', { name: op.name });
            } catch (error) {
                this._log('step:failed', { name: op.name, error: error.message });

                // Compensate all previously completed steps
                const compensationResult = await this.rollback();

                throw new SagaFailedError(
                    `Saga failed at step "${op.name}": ${error.message}`,
                    error,
                    completedSteps,
                    compensationResult,
                );
            }
        }

        this._log('saga:complete', { steps: completedSteps.length });
        return { success: true, results };
    }

    /**
     * Execute all queued compensations in LIFO order. Each compensation is
     * given a 5-second timeout. Failures are collected but do not stop
     * remaining compensations from running.
     *
     * @returns {Promise<{ compensated: string[], failed: Array<{ name: string, error: string }> }>}
     */
    async rollback() {
        const compensated = [];
        const failed = [];

        this._log('rollback:start', { count: this.compensations.length });

        for (const comp of this.compensations) {
            try {
                await Promise.race([
                    comp.fn(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`Compensation "${comp.name}" timed out after ${COMPENSATION_TIMEOUT_MS}ms`)),
                            COMPENSATION_TIMEOUT_MS,
                        ),
                    ),
                ]);
                compensated.push(comp.name);
                this._log('compensate:success', { name: comp.name });
            } catch (error) {
                failed.push({ name: comp.name, error: error.message });
                this._log('compensate:failed', { name: comp.name, error: error.message });
                console.error(`[PolystoreSaga] CRITICAL — compensation failed for "${comp.name}": ${error.message}`);
            }
        }

        // Clear compensations after rollback attempt
        this.compensations = [];

        this._log('rollback:complete', { compensated: compensated.length, failed: failed.length });

        return { compensated, failed };
    }

    // ────────────────────────────────────────────────────────────────────────
    // Static factory for the standard 3-store write pattern
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Build the standard trio of write operations for a polystore node upsert:
     *   1. CreateNode   — Memgraph MERGE
     *   2. UpsertVector — Qdrant point upsert (with 5s timeout)
     *   3. InvalidateCache — Redis DEL (best-effort, noop compensate)
     *
     * @param {{ id: string, label: string, [key: string]: any }} nodeData
     * @param {number[]} embedding - Vector embedding for the node
     * @param {import('./memgraph.service')} memgraphService - Memgraph singleton
     * @param {import('./qdrant.service')} qdrantService - Qdrant singleton
     * @param {import('./redis.service')} redisService - Redis module
     * @returns {Array<{ name: string, execute: () => Promise<any>, compensate: (result: any) => Promise<void> }>}
     */
    static createWriteOperations(nodeData, embedding, memgraphService, qdrantService, redisService) {
        if (!nodeData || !nodeData.id || !nodeData.label) {
            throw new Error('nodeData must contain at least "id" and "label" properties');
        }

        return [
            // ── Step 1: Memgraph ──────────────────────────────────────────
            {
                name: 'CreateNode',
                execute: async () => {
                    await memgraphService.mergeNode(nodeData.label, nodeData);
                    return { id: nodeData.id, label: nodeData.label };
                },
                compensate: async (_result) => {
                    // DETACH DELETE removes the node and all its relationships
                    await memgraphService.executeQuery(
                        'MATCH (n {id: $id}) DETACH DELETE n',
                        { id: nodeData.id },
                    );
                },
            },

            // ── Step 2: Qdrant ────────────────────────────────────────────
            {
                name: 'UpsertVector',
                execute: async () => {
                    const point = {
                        id: nodeData.id,
                        vector: embedding,
                        payload: {
                            label: nodeData.label,
                            nodeId: nodeData.id,
                            name: nodeData.name || nodeData.id,
                        },
                    };

                    // Qdrant upsert with 5s timeout
                    await Promise.race([
                        qdrantService.upsertPoints([point]),
                        new Promise((_, reject) =>
                            setTimeout(
                                () => reject(new Error('Qdrant upsert timed out after 5000ms')),
                                5000,
                            ),
                        ),
                    ]);

                    return { pointId: nodeData.id };
                },
                compensate: async (_result) => {
                    // Delete the point from the default collection
                    const collectionName = qdrantService.getCollectionName();
                    await qdrantService.client.delete(collectionName, {
                        points: [nodeData.id],
                        wait: true,
                    });
                },
            },

            // ── Step 3: Redis ─────────────────────────────────────────────
            {
                name: 'InvalidateCache',
                execute: async () => {
                    const cacheKey = 'node:' + nodeData.id;
                    await redisService.del(cacheKey);
                    return { cacheKey };
                },
                compensate: async (_result) => {
                    // Cache invalidation is idempotent; nothing meaningful to undo
                },
            },
        ];
    }
}

// ════════════════════════════════════════════════════════════════════════════
// Convenience helper — single-call polystore write with saga protection
// ════════════════════════════════════════════════════════════════════════════

/**
 * Merge a node across all three stores (Memgraph, Qdrant, Redis) with saga
 * protection. If any store write fails, earlier writes are compensated.
 *
 * @param {{ id: string, label: string, [key: string]: any }} nodeData
 * @param {number[]} embedding
 * @param {import('./memgraph.service')} memgraphService
 * @param {import('./qdrant.service')} qdrantService
 * @param {import('./redis.service')} redisService
 * @returns {Promise<{ success: true, results: any[] }>}
 * @throws {SagaFailedError}
 */
async function mergeNodeWithSaga(nodeData, embedding, memgraphService, qdrantService, redisService) {
    const saga = new PolystoreSaga();
    const operations = PolystoreSaga.createWriteOperations(
        nodeData,
        embedding,
        memgraphService,
        qdrantService,
        redisService,
    );
    return saga.execute(operations);
}

module.exports = {
    PolystoreSaga,
    SagaFailedError,
    mergeNodeWithSaga,
};
