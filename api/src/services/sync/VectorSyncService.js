/**
 * VectorSyncService - Сервис синхронизации между Graph (Memgraph) и Vector (Qdrant)
 *
 * Решаемые проблемы:
 * 1. Orphan vectors — векторы в Qdrant без соответствующих узлов в графе
 * 2. Missing embeddings — узлы в графе без эмбеддингов
 * 3. Stale embeddings — устаревшие эмбеддинги (контент изменился)
 * 4. Cross-store consistency — id mapping между системами
 */

/**
 * Статусы синхронизации для отчётности
 */
const SyncStatus = {
    SYNCED: 'synced',
    MISSING_EMBEDDING: 'missing_embedding',
    ORPHAN_VECTOR: 'orphan_vector',
    STALE: 'stale',
    ERROR: 'error',
};

/**
 * Типы операций синхронизации
 */
const SyncOperation = {
    CREATE_EMBEDDING: 'create_embedding',
    UPDATE_EMBEDDING: 'update_embedding',
    DELETE_VECTOR: 'delete_vector',
    MARK_SYNCED: 'mark_synced',
};

class VectorSyncService {
    /**
     * @param {Object} graphService - Memgraph service instance
     * @param {Object} embeddingService - EmbeddingService instance
     * @param {Object} config - Configuration options
     */
    constructor(graphService, embeddingService, config = {}) {
        this.graph = graphService;
        this.embeddings = embeddingService;

        this.config = {
            // Batch sizes
            batchSize: 50,
            embeddingBatchSize: 20,

            // Sync options
            syncIntervalMs: 60000, // 1 minute
            staleThresholdMs: 24 * 60 * 60 * 1000, // 24 hours

            // Collections to sync
            collections: [
                'embeddings_code',
                'embeddings_docs',
                'embeddings_workitems',
                'embeddings_unified',
            ],

            // Retry
            maxRetries: 3,
            retryDelayMs: 1000,

            ...config,
        };

        this.syncInterval = null;
        this.isSyncing = false;
        this.lastSyncResult = null;
    }

    // ============ Main Sync Operations ============

    /**
     * Sync graph nodes to vector store
     * Creates embeddings for nodes that don't have them
     * @param {Object} options - Sync options
     * @returns {Promise<SyncResult>}
     */
    async syncGraphToVector(options = {}) {
        const {
            projectId = null,
            limit = 500,
            forceUpdate = false,
            nodeLabels = null,
        } = options;

        const result = {
            operation: 'graph_to_vector',
            startedAt: new Date().toISOString(),
            processed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
        };

        try {
            // Find nodes missing embeddings
            const query = this._buildMissingEmbeddingsQuery(projectId, nodeLabels, forceUpdate);
            const nodes = await this._queryGraph(query, { projectId, limit });

            console.log(`📊 Found ${nodes.length} nodes to sync`);

            // Process in batches
            const batches = this._chunkArray(nodes, this.config.embeddingBatchSize);

            for (const batch of batches) {
                try {
                    await this._syncBatchToVector(batch, result);
                } catch (error) {
                    result.errors.push({
                        batch: batch.map(n => n.quantumId),
                        error: error.message,
                    });
                }
            }

            result.completedAt = new Date().toISOString();
            result.durationMs = new Date(result.completedAt) - new Date(result.startedAt);

        } catch (error) {
            result.error = error.message;
            result.completedAt = new Date().toISOString();
        }

        this.lastSyncResult = result;
        return result;
    }

    /**
     * Clean orphan vectors (vectors without corresponding graph nodes)
     * @param {Object} options - Clean options
     * @returns {Promise<CleanResult>}
     */
    async cleanOrphanVectors(options = {}) {
        const {
            collection = 'embeddings_unified',
            dryRun = false,
            limit = 1000,
        } = options;

        const result = {
            operation: 'clean_orphans',
            collection,
            dryRun,
            startedAt: new Date().toISOString(),
            scanned: 0,
            orphansFound: 0,
            deleted: 0,
            errors: [],
        };

        try {
            // Scroll through all vectors in collection
            let offset = null;
            let hasMore = true;

            while (hasMore) {
                const scrollResult = await this.embeddings.qdrant.scroll(collection, {
                    limit: this.config.batchSize,
                    offset,
                    with_payload: true,
                    with_vector: false,
                });

                const points = scrollResult.points || [];
                result.scanned += points.length;

                if (points.length === 0) {
                    hasMore = false;
                    break;
                }

                // Check each point against graph
                const orphanIds = [];

                for (const point of points) {
                    const quantumId = point.payload?._originalId || point.payload?.quantum_id;

                    if (quantumId) {
                        const exists = await this._nodeExists(quantumId);
                        if (!exists) {
                            orphanIds.push(point.id);
                            result.orphansFound++;
                        }
                    }
                }

                // Delete orphans
                if (orphanIds.length > 0 && !dryRun) {
                    await this.embeddings.qdrant.delete(collection, {
                        wait: true,
                        points: orphanIds,
                    });
                    result.deleted += orphanIds.length;
                }

                // Continue scrolling
                offset = scrollResult.next_page_offset;
                hasMore = offset !== null && result.scanned < limit;
            }

            result.completedAt = new Date().toISOString();

        } catch (error) {
            result.error = error.message;
            result.completedAt = new Date().toISOString();
        }

        return result;
    }

    /**
     * Full resync - sync all nodes and clean orphans
     * @param {Object} options - Resync options
     * @returns {Promise<ResyncResult>}
     */
    async fullResync(options = {}) {
        const {
            projectId = null,
            cleanOrphans = true,
        } = options;

        const result = {
            operation: 'full_resync',
            startedAt: new Date().toISOString(),
            graphToVector: null,
            orphanCleanup: null,
        };

        console.log('🔄 Starting full resync...');

        // 1. Sync graph to vector
        result.graphToVector = await this.syncGraphToVector({
            projectId,
            forceUpdate: true,
        });

        // 2. Clean orphans (if enabled)
        if (cleanOrphans) {
            result.orphanCleanup = {};

            for (const collection of this.config.collections) {
                result.orphanCleanup[collection] = await this.cleanOrphanVectors({
                    collection,
                    dryRun: false,
                });
            }
        }

        result.completedAt = new Date().toISOString();
        console.log('✅ Full resync completed');

        return result;
    }

    /**
     * Sync a specific entity
     * @param {string} quantumId - Entity ID
     * @param {Object} options - Sync options
     */
    async syncEntity(quantumId, options = {}) {
        const { forceUpdate = false } = options;

        // Get entity from graph
        const entity = await this._getEntity(quantumId);
        if (!entity) {
            throw new Error(`Entity not found: ${quantumId}`);
        }

        // Check if needs update
        const needsUpdate = forceUpdate ||
            !entity.hasEmbedding ||
            this._isStale(entity.embeddingUpdatedAt);

        if (!needsUpdate) {
            return { status: SyncStatus.SYNCED, updated: false };
        }

        // Generate and store embedding
        const text = this._entityToText(entity);
        const vector = await this.embeddings.generateEmbedding(text);

        const collection = this._selectCollection(entity);
        await this.embeddings.storeEmbedding(collection, quantumId, vector, {
            quantum_id: quantumId,
            entity_type: entity.label,
            name: entity.name,
            project_id: entity.projectId,
        });

        // Also store in unified
        await this.embeddings.storeEmbedding('embeddings_unified', quantumId, vector, {
            quantum_id: quantumId,
            entity_type: entity.label,
            name: entity.name,
            project_id: entity.projectId,
        });

        // Mark as synced in graph
        await this._markAsSynced(quantumId);

        return { status: SyncStatus.SYNCED, updated: true };
    }

    /**
     * Delete entity from vector stores
     * @param {string} quantumId - Entity ID
     */
    async deleteEntityVectors(quantumId) {
        for (const collection of this.config.collections) {
            try {
                await this.embeddings.deleteVector(collection, quantumId);
            } catch (error) {
                // Ignore not found errors
                if (!error.message?.includes('not found')) {
                    console.warn(`Failed to delete from ${collection}:`, error.message);
                }
            }
        }
    }

    // ============ Consistency Checks ============

    /**
     * Check sync status for an entity
     * @param {string} quantumId - Entity ID
     * @returns {Promise<SyncStatusResult>}
     */
    async checkSyncStatus(quantumId) {
        const result = {
            quantumId,
            graphExists: false,
            vectorExists: {},
            status: SyncStatus.ERROR,
            details: {},
        };

        // Check graph
        const entity = await this._getEntity(quantumId);
        result.graphExists = !!entity;

        if (entity) {
            result.details.label = entity.label;
            result.details.hasEmbeddingFlag = entity.hasEmbedding;
            result.details.embeddingUpdatedAt = entity.embeddingUpdatedAt;
        }

        // Check each collection
        for (const collection of this.config.collections) {
            try {
                const vector = await this.embeddings.getVector(collection, quantumId);
                result.vectorExists[collection] = !!vector;
            } catch (error) {
                result.vectorExists[collection] = false;
            }
        }

        // Determine status
        if (!result.graphExists && Object.values(result.vectorExists).some(v => v)) {
            result.status = SyncStatus.ORPHAN_VECTOR;
        } else if (result.graphExists && !Object.values(result.vectorExists).some(v => v)) {
            result.status = SyncStatus.MISSING_EMBEDDING;
        } else if (result.graphExists && entity?.embeddingUpdatedAt && this._isStale(entity.embeddingUpdatedAt)) {
            result.status = SyncStatus.STALE;
        } else if (result.graphExists) {
            result.status = SyncStatus.SYNCED;
        }

        return result;
    }

    /**
     * Get overall sync health report
     * @param {Object} options - Report options
     * @returns {Promise<HealthReport>}
     */
    async getHealthReport(options = {}) {
        const { projectId = null, sampleSize = 100 } = options;

        const report = {
            timestamp: new Date().toISOString(),
            projectId,
            graph: {
                totalNodes: 0,
                withEmbedding: 0,
                withoutEmbedding: 0,
                stale: 0,
            },
            vector: {},
            syncHealth: 'unknown',
        };

        try {
            // Graph stats
            const graphStats = await this._queryGraph(`
                MATCH (n:KnowledgeQuantum)
                ${projectId ? 'WHERE n.projectId = $projectId' : ''}
                RETURN
                    count(n) as total,
                    count(CASE WHEN n.hasEmbedding = true THEN 1 END) as withEmbedding,
                    count(CASE WHEN n.hasEmbedding IS NULL OR n.hasEmbedding = false THEN 1 END) as withoutEmbedding
            `, { projectId });

            if (graphStats[0]) {
                report.graph.totalNodes = graphStats[0].total;
                report.graph.withEmbedding = graphStats[0].withEmbedding;
                report.graph.withoutEmbedding = graphStats[0].withoutEmbedding;
            }

            // Vector stats per collection
            for (const collection of this.config.collections) {
                try {
                    const info = await this.embeddings.qdrant.getCollection(collection);
                    report.vector[collection] = {
                        pointsCount: info.points_count,
                        vectorsCount: info.vectors_count,
                        status: info.status,
                    };
                } catch (error) {
                    report.vector[collection] = { error: error.message };
                }
            }

            // Calculate sync health
            const syncPercentage = report.graph.totalNodes > 0
                ? (report.graph.withEmbedding / report.graph.totalNodes) * 100
                : 100;

            if (syncPercentage >= 95) {
                report.syncHealth = 'healthy';
            } else if (syncPercentage >= 80) {
                report.syncHealth = 'degraded';
            } else {
                report.syncHealth = 'unhealthy';
            }

            report.syncPercentage = syncPercentage.toFixed(2);

        } catch (error) {
            report.error = error.message;
            report.syncHealth = 'error';
        }

        return report;
    }

    // ============ Automatic Sync ============

    /**
     * Start automatic sync interval
     */
    startAutoSync() {
        if (this.syncInterval) {
            console.warn('Auto sync already running');
            return;
        }

        console.log(`🔄 Starting auto sync (interval: ${this.config.syncIntervalMs}ms)`);

        this.syncInterval = setInterval(async () => {
            if (this.isSyncing) {
                console.log('⏳ Sync already in progress, skipping...');
                return;
            }

            this.isSyncing = true;
            try {
                await this.syncGraphToVector({ limit: 100 });
            } catch (error) {
                console.error('Auto sync failed:', error.message);
            } finally {
                this.isSyncing = false;
            }
        }, this.config.syncIntervalMs);
    }

    /**
     * Stop automatic sync
     */
    stopAutoSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 Auto sync stopped');
        }
    }

    // ============ Private Methods ============

    async _syncBatchToVector(batch, result) {
        // Generate embeddings
        const texts = batch.map(node => this._entityToText(node));
        const vectors = await this.embeddings.generateBatchEmbeddings(texts);

        // Prepare points
        const points = batch.map((node, idx) => {
            if (!vectors[idx]) return null;

            return {
                id: node.quantumId,
                vector: vectors[idx],
                payload: {
                    quantum_id: node.quantumId,
                    entity_type: node.label,
                    name: node.name,
                    project_id: node.projectId,
                },
            };
        }).filter(Boolean);

        // Store in collections
        for (const collection of this.config.collections) {
            const relevantPoints = points.filter(p =>
                this._shouldStoreIn(collection, p.payload.entity_type)
            );

            if (relevantPoints.length > 0) {
                await this.embeddings.storeBatchEmbeddings(collection, relevantPoints);
            }
        }

        // Also store all in unified
        await this.embeddings.storeBatchEmbeddings('embeddings_unified', points);

        // Mark as synced in graph
        for (const node of batch) {
            if (vectors[batch.indexOf(node)]) {
                await this._markAsSynced(node.quantumId);
                result.created++;
            } else {
                result.skipped++;
            }
        }

        result.processed += batch.length;
    }

    _buildMissingEmbeddingsQuery(projectId, nodeLabels, forceUpdate) {
        const labelFilter = nodeLabels
            ? `AND any(label IN labels(n) WHERE label IN [${nodeLabels.map(l => `'${l}'`).join(',')}])`
            : '';

        const embeddingFilter = forceUpdate
            ? ''
            : 'AND (n.hasEmbedding IS NULL OR n.hasEmbedding = false)';

        return `
            MATCH (n:KnowledgeQuantum)
            WHERE true
                ${projectId ? 'AND n.projectId = $projectId' : ''}
                ${labelFilter}
                ${embeddingFilter}
            RETURN
                n.quantumId as quantumId,
                n.name as name,
                n.description as description,
                n.definition as definition,
                n.documentation as documentation,
                n.projectId as projectId,
                n.hasEmbedding as hasEmbedding,
                n.embeddingUpdatedAt as embeddingUpdatedAt,
                labels(n)[0] as label
            LIMIT $limit
        `;
    }

    async _queryGraph(query, params = {}) {
        try {
            return await this.graph.query(query, params);
        } catch (error) {
            console.error('Graph query failed:', error.message);
            return [];
        }
    }

    async _getEntity(quantumId) {
        const results = await this._queryGraph(`
            MATCH (n:KnowledgeQuantum {quantumId: $quantumId})
            RETURN n, labels(n) as labels
        `, { quantumId });

        if (results.length === 0) return null;

        const node = results[0].n?.properties || results[0].n;
        return {
            ...node,
            label: results[0].labels?.[0] || 'KnowledgeQuantum',
        };
    }

    async _nodeExists(quantumId) {
        const results = await this._queryGraph(`
            MATCH (n:KnowledgeQuantum {quantumId: $quantumId})
            RETURN count(n) as count
        `, { quantumId });

        return results[0]?.count > 0;
    }

    async _markAsSynced(quantumId) {
        await this._queryGraph(`
            MATCH (n:KnowledgeQuantum {quantumId: $quantumId})
            SET n.hasEmbedding = true,
                n.embeddingUpdatedAt = $now
        `, { quantumId, now: new Date().toISOString() });
    }

    _entityToText(entity) {
        const parts = [
            entity.label && `[${entity.label}]`,
            entity.name,
            entity.description,
            entity.definition,
            entity.documentation,
        ].filter(Boolean);

        return parts.join(' ').substring(0, 2000);
    }

    _selectCollection(entity) {
        const label = (entity.label || '').toLowerCase();

        if (['file', 'function', 'class', 'method', 'interface'].includes(label)) {
            return 'embeddings_code';
        }
        if (['workitem', 'task', 'bug', 'feature'].includes(label)) {
            return 'embeddings_workitems';
        }
        if (['document'].includes(label)) {
            return 'embeddings_docs';
        }
        return 'embeddings_unified';
    }

    _shouldStoreIn(collection, entityType) {
        const type = (entityType || '').toLowerCase();

        switch (collection) {
            case 'embeddings_code':
                return ['file', 'function', 'class', 'method', 'interface', 'enum'].includes(type);
            case 'embeddings_workitems':
                return ['workitem', 'task', 'bug', 'feature', 'userstory'].includes(type);
            case 'embeddings_docs':
                return ['document'].includes(type);
            case 'embeddings_unified':
                return true; // All types go to unified
            default:
                return false;
        }
    }

    _isStale(embeddingUpdatedAt) {
        if (!embeddingUpdatedAt) return true;

        const updatedAt = new Date(embeddingUpdatedAt);
        const age = Date.now() - updatedAt.getTime();

        return age > this.config.staleThresholdMs;
    }

    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

module.exports = {
    VectorSyncService,
    SyncStatus,
    SyncOperation,
};
