const { QdrantClient } = require('@qdrant/js-client-rest');
const { v4: uuidv4 } = require('uuid');
const { getQdrantCollectionName, getStoragePaths, NAMESPACE_CONFIGS } = require('../config/namespace.config');
const { KnowledgeNamespace } = require('../config/enums');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const DEFAULT_COLLECTION_NAME = 'ado_knowledge_base'; // Legacy collection
const VECTOR_SIZE = 1024; // multilingual-e5-large

class QdrantService {
    constructor() {
        this.client = new QdrantClient({ url: QDRANT_URL });
        this._collectionsCache = new Map();
    }

    /**
     * Get collection name for a namespace
     * @param {string} fullNamespace - e.g., "core", "project:imis"
     * @returns {string} Collection name
     */
    getCollectionName(fullNamespace = null) {
        if (!fullNamespace) {
            return DEFAULT_COLLECTION_NAME;
        }
        return getQdrantCollectionName(fullNamespace) || DEFAULT_COLLECTION_NAME;
    }

    /**
     * Initializes the default collection if it doesn't exist.
     */
    async initCollection() {
        return this.initCollectionForNamespace(null);
    }

    /**
     * Initialize collection for a specific namespace
     * @param {string} fullNamespace - Namespace identifier
     */
    async initCollectionForNamespace(fullNamespace = null) {
        const collectionName = this.getCollectionName(fullNamespace);

        try {
            const result = await this.client.getCollections();
            const exists = result.collections.some((c) => c.name === collectionName);

            if (!exists) {
                await this.client.createCollection(collectionName, {
                    vectors: {
                        size: VECTOR_SIZE,
                        distance: 'Cosine',
                    },
                    // Add payload indexes for namespace filtering
                    ...(fullNamespace && {
                        optimizers_config: {
                            indexing_threshold: 10000
                        }
                    })
                });

                // Create payload indexes for namespace filtering
                if (fullNamespace) {
                    await this._createNamespaceIndexes(collectionName);
                }

                console.log(`Collection '${collectionName}' created for namespace '${fullNamespace || 'default'}'.`);
            } else {
                console.log(`Collection '${collectionName}' already exists.`);
            }

            this._collectionsCache.set(collectionName, true);
        } catch (error) {
            console.error('Error initializing collection:', error);
            throw error;
        }
    }

    /**
     * Initialize all namespace collections
     */
    async initAllNamespaceCollections() {
        const results = {};

        for (const [ns, config] of Object.entries(NAMESPACE_CONFIGS)) {
            if (!config.enabled) continue;

            try {
                await this.initCollectionForNamespace(ns);
                results[ns] = { success: true };
            } catch (error) {
                results[ns] = { success: false, error: error.message };
            }
        }

        return results;
    }

    /**
     * Create payload indexes for namespace-based filtering
     * @private
     */
    async _createNamespaceIndexes(collectionName) {
        try {
            // Create index on namespace field
            await this.client.createPayloadIndex(collectionName, {
                field_name: 'namespace',
                field_schema: 'keyword'
            });

            await this.client.createPayloadIndex(collectionName, {
                field_name: 'fullNamespace',
                field_schema: 'keyword'
            });

            await this.client.createPayloadIndex(collectionName, {
                field_name: 'projectId',
                field_schema: 'keyword'
            });

            console.log(`Created namespace indexes for collection '${collectionName}'.`);
        } catch (error) {
            // Indexes might already exist
            if (!error.message?.includes('already exists')) {
                console.warn(`Warning creating indexes: ${error.message}`);
            }
        }
    }

    /**
     * Upserts points into the collection.
     * @param {Array<{id: string|number, vector: number[], payload: object}>} points
     * @param {string} fullNamespace - Optional namespace for the points
     */
    async upsertPoints(points, fullNamespace = null) {
        const collectionName = this.getCollectionName(fullNamespace);

        try {
            // Ensure collection exists
            if (!this._collectionsCache.has(collectionName)) {
                await this.initCollectionForNamespace(fullNamespace);
            }

            // Ensure IDs are present and add namespace to payload
            const pointsWithIds = points.map(p => {
                const payload = { ...p.payload };

                // Add namespace info to payload if provided
                if (fullNamespace) {
                    const paths = getStoragePaths(fullNamespace);
                    if (paths) {
                        payload.namespace = fullNamespace.startsWith('project:') ? 'project' : fullNamespace;
                        payload.fullNamespace = fullNamespace;
                        if (fullNamespace.startsWith('project:')) {
                            payload.projectId = fullNamespace.slice(8);
                        }
                    }
                }

                return {
                    ...p,
                    id: p.id || uuidv4(),
                    payload
                };
            });

            await this.client.upsert(collectionName, {
                wait: true,
                points: pointsWithIds,
            });
            console.log(`Upserted ${points.length} points to '${collectionName}'.`);
        } catch (error) {
            console.error('Error upserting points:', error);
            throw error;
        }
    }

    /**
     * Checks if the collection exists
     * @param {string} fullNamespace - Optional namespace
     * @returns {Promise<boolean>}
     */
    async collectionExists(fullNamespace = null) {
        const collectionName = this.getCollectionName(fullNamespace);

        try {
            const result = await this.client.getCollections();
            return result.collections.some((c) => c.name === collectionName);
        } catch (error) {
            console.warn('Error checking collection existence:', error.message);
            return false;
        }
    }

    /**
     * Searches for similar vectors.
     * @param {number[]} vector - Query vector.
     * @param {number} limit - Number of results to return.
     * @param {object} filter - Qdrant filter object.
     * @param {string} fullNamespace - Optional namespace to search in
     * @returns {Promise<Array>} - Array of search results.
     */
    async searchSimilar(vector, limit = 5, filter = null, fullNamespace = null) {
        const collectionName = this.getCollectionName(fullNamespace);

        try {
            // Check if collection exists first
            const exists = await this.collectionExists(fullNamespace);
            if (!exists) {
                console.warn(`Collection '${collectionName}' does not exist. Returning empty results.`);
                return [];
            }

            const searchParams = {
                vector: vector,
                limit: limit,
                with_payload: true
            };

            if (filter) {
                searchParams.filter = filter;
            }

            const result = await this.client.search(collectionName, searchParams);
            return result;
        } catch (error) {
            // Handle 404 specifically - collection doesn't exist
            if (error.status === 404) {
                console.warn(`Collection '${collectionName}' not found. Returning empty results.`);
                return [];
            }
            console.error('Error searching similar vectors:', error);
            throw error;
        }
    }

    /**
     * Search across multiple namespaces
     * @param {number[]} vector - Query vector
     * @param {string[]} namespaces - List of namespaces to search
     * @param {number} limit - Results per namespace
     * @param {object} filter - Additional filter
     * @returns {Promise<Object>} Results grouped by namespace
     */
    async searchAcrossNamespaces(vector, namespaces, limit = 5, filter = null) {
        const results = {};

        const searchPromises = namespaces.map(async (ns) => {
            try {
                const nsResults = await this.searchSimilar(vector, limit, filter, ns);
                return { namespace: ns, results: nsResults, error: null };
            } catch (error) {
                return { namespace: ns, results: [], error: error.message };
            }
        });

        const searchResults = await Promise.all(searchPromises);

        for (const { namespace, results: nsResults, error } of searchResults) {
            results[namespace] = {
                results: nsResults,
                count: nsResults.length,
                error
            };
        }

        return results;
    }

    /**
     * Search with namespace filter in payload
     * @param {number[]} vector - Query vector
     * @param {number} limit - Results limit
     * @param {string|string[]} namespaceFilter - Namespace(s) to filter by
     * @param {object} additionalFilter - Additional Qdrant filter
     * @returns {Promise<Array>}
     */
    async searchWithNamespaceFilter(vector, limit = 5, namespaceFilter = null, additionalFilter = null) {
        let filter = additionalFilter ? { ...additionalFilter } : {};

        if (namespaceFilter) {
            const namespaces = Array.isArray(namespaceFilter) ? namespaceFilter : [namespaceFilter];

            // Build namespace filter
            const nsConditions = namespaces.map(ns => {
                if (ns === 'project:*') {
                    // Match all project namespaces
                    return {
                        key: 'namespace',
                        match: { value: 'project' }
                    };
                }
                return {
                    key: 'fullNamespace',
                    match: { value: ns }
                };
            });

            if (nsConditions.length === 1) {
                filter.must = [...(filter.must || []), nsConditions[0]];
            } else {
                filter.should = [...(filter.should || []), ...nsConditions];
            }
        }

        return this.searchSimilar(vector, limit, Object.keys(filter).length > 0 ? filter : null);
    }

    /**
     * Get collection statistics for a namespace
     * @param {string} fullNamespace
     * @returns {Promise<Object>}
     */
    async getNamespaceStats(fullNamespace = null) {
        const collectionName = this.getCollectionName(fullNamespace);

        try {
            const exists = await this.collectionExists(fullNamespace);
            if (!exists) {
                return {
                    exists: false,
                    pointsCount: 0,
                    segmentsCount: 0
                };
            }

            const info = await this.client.getCollection(collectionName);

            return {
                exists: true,
                pointsCount: info.points_count || 0,
                segmentsCount: info.segments_count || 0,
                vectorsCount: info.vectors_count || 0,
                indexedVectorsCount: info.indexed_vectors_count || 0,
                status: info.status
            };
        } catch (error) {
            console.error('Error getting namespace stats:', error);
            return {
                exists: false,
                error: error.message
            };
        }
    }

    /**
     * Delete points by namespace filter
     * @param {string} fullNamespace - Namespace to delete from
     * @param {object} additionalFilter - Additional filter conditions
     */
    async deleteByNamespace(fullNamespace, additionalFilter = null) {
        const collectionName = this.getCollectionName(fullNamespace);

        try {
            const filter = {
                must: [
                    {
                        key: 'fullNamespace',
                        match: { value: fullNamespace }
                    }
                ]
            };

            if (additionalFilter) {
                filter.must.push(...(additionalFilter.must || []));
            }

            const result = await this.client.delete(collectionName, {
                filter,
                wait: true
            });

            console.log(`Deleted points from namespace '${fullNamespace}' in collection '${collectionName}'.`);
            return result;
        } catch (error) {
            console.error('Error deleting by namespace:', error);
            throw error;
        }
    }

    /**
     * Migrate points from one namespace to another
     * @param {string} sourceNamespace
     * @param {string} targetNamespace
     * @param {number} batchSize
     * @param {number} maxIterations - Safety limit to prevent infinite loops
     */
    async migrateNamespace(sourceNamespace, targetNamespace, batchSize = 100, maxIterations = 10000) {
        const sourceCollection = this.getCollectionName(sourceNamespace);
        const targetCollection = this.getCollectionName(targetNamespace);

        let offset = null;
        let totalMigrated = 0;
        let iteration = 0;

        try {
            while (iteration < maxIterations) {
                iteration++;

                // Scroll through source collection
                const scrollResult = await this.client.scroll(sourceCollection, {
                    filter: {
                        must: [{
                            key: 'fullNamespace',
                            match: { value: sourceNamespace }
                        }]
                    },
                    limit: batchSize,
                    offset,
                    with_payload: true,
                    with_vector: true
                });

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                // Update namespace in payload and upsert to target
                const migratedPoints = scrollResult.points.map(point => ({
                    id: point.id,
                    vector: point.vector,
                    payload: {
                        ...point.payload,
                        namespace: targetNamespace.startsWith('project:') ? 'project' : targetNamespace,
                        fullNamespace: targetNamespace,
                        projectId: targetNamespace.startsWith('project:') ? targetNamespace.slice(8) : null,
                        migratedAt: new Date().toISOString(),
                        previousNamespace: sourceNamespace
                    }
                }));

                await this.upsertPoints(migratedPoints, targetNamespace);
                totalMigrated += migratedPoints.length;

                offset = scrollResult.next_page_offset;
                if (!offset) break;
            }

            if (iteration >= maxIterations) {
                console.warn(`[QdrantService] Migration stopped: reached max iterations (${maxIterations}). Migrated ${totalMigrated} points.`);
            }

            console.log(`Migrated ${totalMigrated} points from '${sourceNamespace}' to '${targetNamespace}'.`);
            return { migrated: totalMigrated, iterations: iteration, reachedLimit: iteration >= maxIterations };
        } catch (error) {
            console.error('Error migrating namespace:', error);
            throw error;
        }
    }
    // ==================== WORKSPACE COLLECTION MANAGEMENT ====================

    /**
     * Create isolated Qdrant collection for WorkSpace
     * @param {string} workspaceId
     * @returns {Promise<void>}
     */
    async createWorkspaceCollection(workspaceId) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;

        try {
            const result = await this.client.getCollections();
            const exists = result.collections.some(c => c.name === collectionName);

            if (exists) {
                console.log(`[QdrantService] Workspace collection ${collectionName} already exists`);
                this._collectionsCache.set(collectionName, true);
                return;
            }

            await this.client.createCollection(collectionName, {
                vectors: {
                    size: VECTOR_SIZE,
                    distance: 'Cosine',
                    on_disk: true
                },
                optimizers_config: {
                    default_segment_number: 2,
                    memmap_threshold: 10000
                },
                replication_factor: 1,
                write_consistency_factor: 1
            });

            // Create payload indexes for workspace-specific filtering
            const indexes = ['type', 'status', 'sourceId', 'draftNodeId', 'knowledgeFamily'];
            for (const field of indexes) {
                try {
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: field,
                        field_schema: 'keyword'
                    });
                } catch (err) {
                    console.warn(`[QdrantService] Index ${field} on ${collectionName}: ${err.message}`);
                }
            }

            this._collectionsCache.set(collectionName, true);
            console.log(`[QdrantService] Created workspace collection: ${collectionName}`);
        } catch (error) {
            console.error(`[QdrantService] Error creating workspace collection ${collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete WorkSpace collection
     * @param {string} workspaceIdOrCollectionName - workspace ID or full collection name
     * @returns {Promise<void>}
     */
    async deleteWorkspaceCollection(workspaceIdOrCollectionName) {
        const collectionName = workspaceIdOrCollectionName.startsWith('workspace_')
            ? workspaceIdOrCollectionName
            : `workspace_${workspaceIdOrCollectionName.replace(/-/g, '_')}`;

        try {
            const result = await this.client.getCollections();
            const exists = result.collections.some(c => c.name === collectionName);

            if (!exists) {
                console.log(`[QdrantService] Workspace collection ${collectionName} does not exist`);
                return;
            }

            await this.client.deleteCollection(collectionName);
            this._collectionsCache.delete(collectionName);
            console.log(`[QdrantService] Deleted workspace collection: ${collectionName}`);
        } catch (error) {
            console.error(`[QdrantService] Error deleting workspace collection ${collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Upsert vectors to WorkSpace collection
     * @param {string} workspaceId
     * @param {Array<{id: string, vector: number[], payload: object}>} points
     * @returns {Promise<void>}
     */
    async workspaceUpsert(workspaceId, points) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;

        await this._ensureWorkspaceCollection(workspaceId);

        await this.client.upsert(collectionName, {
            wait: true,
            points: points.map(p => ({
                id: p.id,
                vector: p.vector,
                payload: {
                    ...p.payload,
                    workspaceId,
                    indexedAt: new Date().toISOString()
                }
            }))
        });
    }

    /**
     * Search within WorkSpace collection only (isolated search)
     * @param {string} workspaceId
     * @param {number[]} vector - Query embedding
     * @param {Object} options
     * @param {number} [options.limit=10]
     * @param {string} [options.type] - Filter by knowledge type
     * @param {string} [options.status] - Filter by draft status
     * @param {number} [options.scoreThreshold=0.7]
     * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
     */
    async workspaceSearch(workspaceId, vector, { limit = 10, type, status, scoreThreshold = 0.7 } = {}) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;

        // Check collection exists
        const exists = await this.workspaceCollectionExists(workspaceId);
        if (!exists) return [];

        const must = [];
        if (type) must.push({ key: 'type', match: { value: type } });
        if (status) must.push({ key: 'status', match: { value: status } });
        const filter = must.length > 0 ? { must } : undefined;

        try {
            const results = await this.client.search(collectionName, {
                vector,
                limit,
                filter,
                score_threshold: scoreThreshold,
                with_payload: true
            });

            return results.map(r => ({
                id: r.id,
                score: r.score,
                payload: r.payload
            }));
        } catch (error) {
            console.error(`[QdrantService] Workspace search error (${collectionName}):`, error.message);
            return [];
        }
    }

    /**
     * Retrieve vectors for a list of point IDs from a WorkSpace collection.
     * Returns Map<id, number[]>. Missing IDs are simply absent from the map.
     * @param {string} workspaceId
     * @param {string[]} pointIds
     * @returns {Promise<Map<string, number[]>>}
     */
    async workspaceGetVectors(workspaceId, pointIds) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;
        const result = new Map();
        if (!pointIds || pointIds.length === 0) return result;

        const exists = await this.workspaceCollectionExists(workspaceId);
        if (!exists) return result;

        try {
            const points = await this.client.retrieve(collectionName, {
                ids: pointIds,
                with_payload: false,
                with_vector: true
            });
            for (const p of (points || [])) {
                if (p.id != null && Array.isArray(p.vector)) {
                    result.set(String(p.id), p.vector);
                }
            }
        } catch (err) {
            console.warn(`[QdrantService] workspaceGetVectors failed (${collectionName}): ${err.message}`);
        }
        return result;
    }

    /**
     * Delete vectors from WorkSpace collection
     * @param {string} workspaceId
     * @param {string[]} pointIds
     * @returns {Promise<void>}
     */
    async workspaceDeletePoints(workspaceId, pointIds) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;

        await this.client.delete(collectionName, {
            wait: true,
            points: pointIds
        });
    }

    /**
     * Get WorkSpace collection info
     * @param {string} workspaceId
     * @returns {Promise<{exists: boolean, pointsCount: number, status: string}|null>}
     */
    async getWorkspaceCollectionInfo(workspaceId) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;

        try {
            const result = await this.client.getCollections();
            const exists = result.collections.some(c => c.name === collectionName);
            if (!exists) return null;

            const info = await this.client.getCollection(collectionName);
            return {
                exists: true,
                collectionName,
                pointsCount: info.points_count || 0,
                status: info.status
            };
        } catch (error) {
            console.error(`[QdrantService] Error getting workspace info (${collectionName}):`, error.message);
            return null;
        }
    }

    /**
     * Check if WorkSpace collection exists
     * @param {string} workspaceId
     * @returns {Promise<boolean>}
     */
    async workspaceCollectionExists(workspaceId) {
        const collectionName = `workspace_${workspaceId.replace(/-/g, '_')}`;

        if (this._collectionsCache.has(collectionName)) return true;

        try {
            const result = await this.client.getCollections();
            const exists = result.collections.some(c => c.name === collectionName);
            if (exists) this._collectionsCache.set(collectionName, true);
            return exists;
        } catch {
            return false;
        }
    }

    /**
     * Ensure workspace collection exists, create if needed
     * @private
     */
    async _ensureWorkspaceCollection(workspaceId) {
        const exists = await this.workspaceCollectionExists(workspaceId);
        if (!exists) {
            await this.createWorkspaceCollection(workspaceId);
        }
    }
}

// Facade: when VECTOR_DB_BACKEND=pgvector, export PgvectorAdapter instead.
// All 34+ consumers of this module work transparently with either backend.
if (process.env.VECTOR_DB_BACKEND === 'pgvector') {
  const { PgvectorAdapter } = require('./storage/adapters/PgvectorAdapter');
  module.exports = new PgvectorAdapter();
} else {
  module.exports = new QdrantService();
}
