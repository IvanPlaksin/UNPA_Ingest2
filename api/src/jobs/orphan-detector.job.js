'use strict';

/**
 * CC-017: Orphan Vector Detector
 *
 * Detects and cleans up vectors in Qdrant whose referenced Memgraph nodes
 * no longer exist. Designed to be called from a setInterval or external
 * scheduler (recommended interval: every 6 hours).
 */

const COLLECTION_NAME = 'knowledge_vectors';
const SCROLL_BATCH_SIZE = 1000;
const EXISTENCE_CHECK_BATCH_SIZE = 50;

class OrphanDetector {
    /**
     * @param {object} memgraphService - Memgraph service with runQuery(cypher, params)
     * @param {object} qdrantService   - Qdrant service (singleton) with client property
     * @param {object} redisService    - Redis service with set(key, value, ttl)
     * @param {object} [logger]        - Optional logger (defaults to console)
     */
    constructor(memgraphService, qdrantService, redisService, logger) {
        this.memgraph = memgraphService;
        this.qdrant = qdrantService;
        this.redis = redisService;
        this.log = logger || console;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Find orphaned vectors
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Scrolls through the Qdrant collection and identifies vectors whose
     * nodeId payload no longer corresponds to an existing Memgraph node.
     *
     * @returns {Promise<Array<{vectorId: string, nodeId: string, orphanedSince: string}>>}
     */
    async findOrphanedVectors() {
        const orphans = [];
        let offset = null;
        let totalScanned = 0;
        let iteration = 0;
        const maxIterations = 100_000; // safety cap

        // Verify the collection exists before scrolling
        const exists = await this.qdrant.collectionExists();
        if (!exists) {
            // Try the specific collection name directly
            try {
                const cols = await this.qdrant.client.getCollections();
                const hasCollection = cols.collections.some(c => c.name === COLLECTION_NAME);
                if (!hasCollection) {
                    this.log.info
                        ? this.log.info(`[OrphanDetector] Collection '${COLLECTION_NAME}' does not exist — nothing to scan.`)
                        : this.log.log(`[OrphanDetector] Collection '${COLLECTION_NAME}' does not exist — nothing to scan.`);
                    return orphans;
                }
            } catch (err) {
                this.log.warn
                    ? this.log.warn(`[OrphanDetector] Qdrant unreachable: ${err.message}`)
                    : this.log.error(`[OrphanDetector] Qdrant unreachable: ${err.message}`);
                return orphans;
            }
        }

        while (iteration < maxIterations) {
            iteration++;

            let scrollResult;
            try {
                const scrollParams = {
                    limit: SCROLL_BATCH_SIZE,
                    with_payload: true,
                    with_vector: false,
                };
                if (offset !== null && offset !== undefined) {
                    scrollParams.offset = offset;
                }
                scrollResult = await this.qdrant.client.scroll(COLLECTION_NAME, scrollParams);
            } catch (err) {
                this.log.error(`[OrphanDetector] Qdrant scroll error: ${err.message}`);
                break;
            }

            const points = scrollResult?.points;
            if (!points || points.length === 0) {
                break;
            }

            totalScanned += points.length;

            // Collect points that carry a nodeId
            const pointsWithNodeId = points
                .filter(p => p.payload && p.payload.nodeId)
                .map(p => ({ vectorId: p.id, nodeId: p.payload.nodeId }));

            // Batch existence checks against Memgraph
            for (let i = 0; i < pointsWithNodeId.length; i += EXISTENCE_CHECK_BATCH_SIZE) {
                const batch = pointsWithNodeId.slice(i, i + EXISTENCE_CHECK_BATCH_SIZE);
                const nodeIds = batch.map(b => b.nodeId);

                let existingIds;
                try {
                    existingIds = await this._checkNodesExist(nodeIds);
                } catch (err) {
                    this.log.error(`[OrphanDetector] Memgraph batch check error: ${err.message}`);
                    // Skip this batch rather than aborting entirely
                    continue;
                }

                const now = new Date().toISOString();
                for (const entry of batch) {
                    if (!existingIds.has(entry.nodeId)) {
                        orphans.push({
                            vectorId: entry.vectorId,
                            nodeId: entry.nodeId,
                            orphanedSince: now,
                        });
                    }
                }
            }

            offset = scrollResult.next_page_offset;
            if (offset === null || offset === undefined) {
                break;
            }
        }

        if (iteration >= maxIterations) {
            this.log.warn
                ? this.log.warn(`[OrphanDetector] Reached max iterations (${maxIterations}). Scanned ${totalScanned} points.`)
                : this.log.error(`[OrphanDetector] Reached max iterations (${maxIterations}). Scanned ${totalScanned} points.`);
        }

        this.log.info
            ? this.log.info(`[OrphanDetector] Scanned ${totalScanned} vectors, found ${orphans.length} orphans.`)
            : this.log.log(`[OrphanDetector] Scanned ${totalScanned} vectors, found ${orphans.length} orphans.`);

        return orphans;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Cleanup orphans
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Deletes orphaned vectors from Qdrant and records metrics in Redis.
     *
     * @param {Array<{vectorId: string, nodeId: string, orphanedSince: string}>} orphans
     * @returns {Promise<number>} count of deleted vectors
     */
    async cleanup(orphans) {
        if (!orphans || orphans.length === 0) {
            return 0;
        }

        const vectorIds = orphans.map(o => o.vectorId);

        try {
            await this.qdrant.client.delete(COLLECTION_NAME, {
                points: vectorIds,
                wait: true,
            });

            this.log.info
                ? this.log.info(`[OrphanDetector] Deleted ${vectorIds.length} orphan vectors from Qdrant.`)
                : this.log.log(`[OrphanDetector] Deleted ${vectorIds.length} orphan vectors from Qdrant.`);
        } catch (err) {
            this.log.error(`[OrphanDetector] Qdrant delete error: ${err.message}`);
            throw err;
        }

        // Store metrics in Redis (no TTL — these are persistent metrics)
        try {
            await this.redis.set('metrics:orphans:last_run', new Date().toISOString(), 0);
            await this.redis.set('metrics:orphans:last_count', orphans.length, 0);
        } catch (err) {
            // Non-fatal: log but don't fail the cleanup
            this.log.warn
                ? this.log.warn(`[OrphanDetector] Redis metrics write failed: ${err.message}`)
                : this.log.error(`[OrphanDetector] Redis metrics write failed: ${err.message}`);
        }

        return vectorIds.length;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Combined run
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Full cycle: find orphans then clean them up.
     *
     * @returns {Promise<{orphansFound: number, orphansCleaned: number, duration: number}>}
     */
    async run() {
        const start = Date.now();

        try {
            const orphans = await this.findOrphanedVectors();
            let cleaned = 0;

            if (orphans.length > 0) {
                cleaned = await this.cleanup(orphans);
            }

            const duration = Date.now() - start;

            this.log.info
                ? this.log.info(`[OrphanDetector] Run complete in ${duration}ms — found ${orphans.length}, cleaned ${cleaned}.`)
                : this.log.log(`[OrphanDetector] Run complete in ${duration}ms — found ${orphans.length}, cleaned ${cleaned}.`);

            return {
                orphansFound: orphans.length,
                orphansCleaned: cleaned,
                duration,
            };
        } catch (err) {
            const duration = Date.now() - start;
            this.log.error(`[OrphanDetector] Run failed after ${duration}ms: ${err.message}`);
            return {
                orphansFound: 0,
                orphansCleaned: 0,
                duration,
                error: err.message,
            };
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Schedule hint
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Starts a repeating timer that calls run() at the given interval.
     * Returns the timer handle so the caller can clearInterval() if needed.
     *
     * Recommended: every 6 hours (6 * 60 * 60 * 1000 = 21_600_000 ms).
     *
     * @param {number} [intervalMs=21600000] - Interval in milliseconds
     * @returns {NodeJS.Timeout}
     */
    schedule(intervalMs = 6 * 60 * 60 * 1000) {
        this.log.info
            ? this.log.info(`[OrphanDetector] Scheduled every ${intervalMs / 1000}s.`)
            : this.log.log(`[OrphanDetector] Scheduled every ${intervalMs / 1000}s.`);

        return setInterval(() => this.run(), intervalMs);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Checks which nodeIds exist in Memgraph using a batched UNWIND query.
     *
     * @param {string[]} nodeIds
     * @returns {Promise<Set<string>>} Set of nodeIds that DO exist
     * @private
     */
    async _checkNodesExist(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) {
            return new Set();
        }

        const cypher = `
            UNWIND $nodeIds AS nid
            MATCH (n {id: nid})
            RETURN n.id AS existingId
            LIMIT ${nodeIds.length}
        `;

        const result = await this.memgraph.runQuery(cypher, { nodeIds });

        const existing = new Set();
        if (result && result.records) {
            for (const record of result.records) {
                const id = record.get('existingId');
                if (id) existing.add(id);
            }
        }

        return existing;
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Factory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Creates an OrphanDetector wired to the default singleton services.
 *
 * @param {object} [logger] - Optional custom logger (defaults to console)
 * @returns {OrphanDetector}
 */
function createOrphanDetector(logger) {
    const memgraphService = require('../services/memgraph.service');
    const qdrantService = require('../services/qdrant.service');
    const redisService = require('../services/redis.service');

    return new OrphanDetector(memgraphService, qdrantService, redisService, logger);
}

module.exports = { OrphanDetector, createOrphanDetector };
