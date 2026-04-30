/**
 * Cross-Source Entity Resolver
 *
 * Three-level entity resolution for unifying entities across different sources
 * (Work Items ↔ Documents ↔ Code) into a single canonical EntityId.
 *
 * Resolution Levels:
 * 1. Vector Similarity via Qdrant (threshold 0.85)
 * 2. Fuzzy matching via Levenshtein distance (threshold 0.80)
 * 3. GNN-enhanced scoring (optional, via gnn-service)
 *
 * Based on CORE-KG (2025) patterns for reducing node duplication by ~28%.
 *
 * @module services/extraction/cross-source-resolver
 */

'use strict';

const qdrantService = require('../qdrant.service');
const teiService = require('../tei.service');
const { v4: uuidv4 } = require('uuid');

// Default configuration
const DEFAULT_CONFIG = {
    // Vector similarity threshold (Level 1)
    vectorThreshold: 0.85,

    // Levenshtein fuzzy matching threshold (Level 2)
    fuzzyThreshold: 0.80,

    // GNN enhancement threshold (Level 3)
    gnnThreshold: 0.75,

    // Combined scoring weights
    weights: {
        vector: 0.50,
        fuzzy: 0.30,
        gnn: 0.20
    },

    // Collection name for entity index
    entityCollection: 'entity_resolution_index',

    // Maximum candidates to consider
    maxCandidates: 10,

    // Enable GNN service (optional)
    useGNN: false,
    gnnServiceUrl: process.env.GNN_SERVICE_URL || 'http://localhost:5001'
};

/**
 * Levenshtein distance calculation
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(a, b) {
    if (!a || !b) return Math.max((a || '').length, (b || '').length);

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate Levenshtein similarity (0-1)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Similarity score (0-1)
 */
function levenshteinSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;

    const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - (distance / maxLen);
}

/**
 * Normalize entity name for comparison
 * @param {string} name - Entity name
 * @returns {string} - Normalized name
 */
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim();
}

/**
 * CrossSourceResolver class
 */
class CrossSourceResolver {
    constructor(options = {}) {
        this.config = { ...DEFAULT_CONFIG, ...options };

        // Statistics tracking
        this.stats = {
            totalResolutions: 0,
            mergedEntities: 0,
            newEntities: 0,
            vectorMatches: 0,
            fuzzyMatches: 0,
            gnnMatches: 0,
            avgConfidence: 0,
            totalConfidence: 0
        };

        // In-memory entity cache for fast lookups
        this._entityCache = new Map();

        // GNN service client (lazy initialized)
        this._gnnClient = null;
    }

    /**
     * Initialize the resolver (create Qdrant collection if needed)
     */
    async initialize() {
        try {
            const exists = await qdrantService.collectionExists(this.config.entityCollection);
            if (!exists) {
                await qdrantService.initCollectionForNamespace(this.config.entityCollection);
                console.log(`[CrossSourceResolver] Created entity collection: ${this.config.entityCollection}`);
            }
            return true;
        } catch (error) {
            console.error('[CrossSourceResolver] Initialization failed:', error.message);
            return false;
        }
    }

    /**
     * Resolve an entity against the index
     *
     * @param {Object} entity - Entity to resolve
     * @param {string} entity.name - Entity name
     * @param {string} entity.type - Entity type
     * @param {string} entity.source - Source type (workitem, document, code)
     * @param {Object} entity.metadata - Additional metadata
     * @returns {Promise<Object>} Resolution result
     */
    async resolve(entity) {
        const startTime = Date.now();

        if (!entity || !entity.name) {
            return {
                resolved: false,
                error: 'Entity name is required',
                entity
            };
        }

        const normalizedName = normalizeName(entity.name);
        const cacheKey = `${entity.type || 'unknown'}:${normalizedName}`;

        // Check in-memory cache first
        if (this._entityCache.has(cacheKey)) {
            const cached = this._entityCache.get(cacheKey);
            this.stats.totalResolutions++;
            return {
                resolved: true,
                isNew: false,
                canonicalId: cached.id,
                confidence: 1.0,
                matchLevel: 'cache',
                entity: cached,
                duration: Date.now() - startTime
            };
        }

        // Get candidates using three-level resolution
        const candidates = await this._findCandidates(entity);

        if (candidates.length === 0) {
            // No matches - create new canonical entity
            const newEntity = await this._createCanonicalEntity(entity);
            this.stats.totalResolutions++;
            this.stats.newEntities++;

            return {
                resolved: true,
                isNew: true,
                canonicalId: newEntity.id,
                confidence: 1.0,
                matchLevel: 'new',
                entity: newEntity,
                duration: Date.now() - startTime
            };
        }

        // Find best match
        const bestMatch = candidates[0];

        if (bestMatch.combinedScore >= this.config.vectorThreshold) {
            // Merge with existing entity
            const mergedEntity = await this._mergeWithCanonical(entity, bestMatch);
            this.stats.totalResolutions++;
            this.stats.mergedEntities++;
            this._updateConfidenceStats(bestMatch.combinedScore);

            return {
                resolved: true,
                isNew: false,
                canonicalId: bestMatch.id,
                confidence: bestMatch.combinedScore,
                matchLevel: bestMatch.matchLevel,
                matchDetails: {
                    vectorScore: bestMatch.vectorScore,
                    fuzzyScore: bestMatch.fuzzyScore,
                    gnnScore: bestMatch.gnnScore
                },
                entity: mergedEntity,
                duration: Date.now() - startTime
            };
        }

        // Score too low - create new entity
        const newEntity = await this._createCanonicalEntity(entity);
        this.stats.totalResolutions++;
        this.stats.newEntities++;

        return {
            resolved: true,
            isNew: true,
            canonicalId: newEntity.id,
            confidence: 1.0,
            matchLevel: 'new',
            nearMiss: {
                candidate: bestMatch.name,
                score: bestMatch.combinedScore
            },
            entity: newEntity,
            duration: Date.now() - startTime
        };
    }

    /**
     * Resolve multiple entities in batch
     * @param {Object[]} entities - Entities to resolve
     * @param {Object} options - Resolution options
     * @returns {Promise<Object[]>} Resolution results
     */
    async resolveAll(entities, options = {}) {
        const { onProgress = null, batchSize = 10 } = options;
        const results = [];

        if (!Array.isArray(entities) || entities.length === 0) {
            return results;
        }

        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(entity => this.resolve(entity))
            );

            results.push(...batchResults);

            if (onProgress) {
                const progress = Math.round(((i + batch.length) / entities.length) * 100);
                onProgress(i + batch.length, entities.length, progress);
            }
        }

        return results;
    }

    /**
     * Index an entity for future resolution
     * @param {Object} entity - Entity to index
     * @returns {Promise<Object>} Indexed entity
     */
    async indexEntity(entity) {
        if (!entity || !entity.name) {
            throw new Error('Entity name is required for indexing');
        }

        const normalizedName = normalizeName(entity.name);
        const id = entity.id || uuidv4();

        // Generate embedding
        const embedding = await teiService.getEmbedding(
            this._buildEmbeddingText(entity)
        );

        if (!embedding) {
            throw new Error('Failed to generate embedding for entity');
        }

        // Store in Qdrant
        await qdrantService.upsertPoints([{
            id,
            vector: embedding,
            payload: {
                name: entity.name,
                normalizedName,
                type: entity.type || 'unknown',
                sources: [entity.source || 'unknown'],
                aliases: entity.aliases || [],
                metadata: entity.metadata || {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        }], this.config.entityCollection);

        // Update cache
        const cached = {
            id,
            name: entity.name,
            normalizedName,
            type: entity.type,
            sources: [entity.source]
        };

        const cacheKey = `${entity.type || 'unknown'}:${normalizedName}`;
        this._entityCache.set(cacheKey, cached);

        return {
            id,
            indexed: true,
            name: entity.name,
            type: entity.type
        };
    }

    /**
     * Index multiple entities
     * @param {Object[]} entities - Entities to index
     * @param {Object} options - Indexing options
     * @returns {Promise<Object>} Indexing results
     */
    async indexEntities(entities, options = {}) {
        const { onProgress = null, batchSize = 20 } = options;
        const results = {
            total: entities.length,
            indexed: 0,
            failed: 0,
            errors: []
        };

        if (!Array.isArray(entities) || entities.length === 0) {
            return results;
        }

        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);

            const batchResults = await Promise.allSettled(
                batch.map(entity => this.indexEntity(entity))
            );

            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.indexed++;
                } else {
                    results.failed++;
                    results.errors.push(result.reason?.message || 'Unknown error');
                }
            }

            if (onProgress) {
                const progress = Math.round(((i + batch.length) / entities.length) * 100);
                onProgress(i + batch.length, entities.length, progress);
            }
        }

        return results;
    }

    /**
     * Find candidate matches using three-level resolution
     * @private
     */
    async _findCandidates(entity) {
        const candidates = [];

        // Level 1: Vector similarity search
        const vectorCandidates = await this._vectorSearch(entity);

        for (const vc of vectorCandidates) {
            // Level 2: Fuzzy matching
            const fuzzyScore = levenshteinSimilarity(
                normalizeName(entity.name),
                vc.payload?.normalizedName || ''
            );

            // Level 3: GNN enhancement (if enabled)
            let gnnScore = 0;
            if (this.config.useGNN) {
                gnnScore = await this._getGNNScore(entity, vc);
            }

            // Calculate combined score
            const combinedScore = this._calculateCombinedScore(
                vc.score,
                fuzzyScore,
                gnnScore
            );

            // Determine primary match level
            let matchLevel = 'combined';
            if (vc.score >= this.config.vectorThreshold) {
                matchLevel = 'vector';
                this.stats.vectorMatches++;
            } else if (fuzzyScore >= this.config.fuzzyThreshold) {
                matchLevel = 'fuzzy';
                this.stats.fuzzyMatches++;
            } else if (gnnScore >= this.config.gnnThreshold) {
                matchLevel = 'gnn';
                this.stats.gnnMatches++;
            }

            candidates.push({
                id: vc.id,
                name: vc.payload?.name,
                type: vc.payload?.type,
                vectorScore: vc.score,
                fuzzyScore,
                gnnScore,
                combinedScore,
                matchLevel,
                payload: vc.payload
            });
        }

        // Sort by combined score descending
        candidates.sort((a, b) => b.combinedScore - a.combinedScore);

        return candidates.slice(0, this.config.maxCandidates);
    }

    /**
     * Vector similarity search via Qdrant
     * @private
     */
    async _vectorSearch(entity) {
        try {
            // Generate embedding for query entity
            const embedding = await teiService.getEmbedding(
                this._buildEmbeddingText(entity)
            );

            if (!embedding) {
                console.warn('[CrossSourceResolver] Failed to generate embedding for search');
                return [];
            }

            // Build filter for type matching (optional)
            let filter = null;
            if (entity.type) {
                filter = {
                    must: [{
                        key: 'type',
                        match: { value: entity.type }
                    }]
                };
            }

            // Search Qdrant
            const results = await qdrantService.searchSimilar(
                embedding,
                this.config.maxCandidates,
                filter,
                this.config.entityCollection
            );

            return results;
        } catch (error) {
            console.error('[CrossSourceResolver] Vector search failed:', error.message);
            return [];
        }
    }

    /**
     * Get GNN-enhanced similarity score
     * @private
     */
    async _getGNNScore(entity, candidate) {
        if (!this.config.useGNN) {
            return 0;
        }

        try {
            // Lazy initialize GNN client
            if (!this._gnnClient) {
                const axios = require('axios');
                this._gnnClient = axios.create({
                    baseURL: this.config.gnnServiceUrl,
                    timeout: 5000
                });
            }

            // Call GNN service for similarity scoring
            const response = await this._gnnClient.post('/similarity', {
                source: {
                    name: entity.name,
                    type: entity.type,
                    metadata: entity.metadata
                },
                target: {
                    name: candidate.payload?.name,
                    type: candidate.payload?.type,
                    metadata: candidate.payload?.metadata
                }
            });

            return response.data?.similarity || 0;
        } catch (error) {
            // GNN service unavailable - return 0
            console.warn('[CrossSourceResolver] GNN scoring failed:', error.message);
            return 0;
        }
    }

    /**
     * Calculate combined score from all levels
     * @private
     */
    _calculateCombinedScore(vectorScore, fuzzyScore, gnnScore) {
        const { weights } = this.config;

        // If GNN is disabled, redistribute weight
        if (!this.config.useGNN) {
            const adjustedVectorWeight = weights.vector + (weights.gnn * 0.6);
            const adjustedFuzzyWeight = weights.fuzzy + (weights.gnn * 0.4);

            return (vectorScore * adjustedVectorWeight) + (fuzzyScore * adjustedFuzzyWeight);
        }

        return (vectorScore * weights.vector) +
               (fuzzyScore * weights.fuzzy) +
               (gnnScore * weights.gnn);
    }

    /**
     * Create a new canonical entity
     * @private
     */
    async _createCanonicalEntity(entity) {
        const id = uuidv4();
        const normalizedName = normalizeName(entity.name);

        const canonicalEntity = {
            id,
            name: entity.name,
            normalizedName,
            type: entity.type || 'unknown',
            sources: [entity.source || 'unknown'],
            aliases: [],
            mergedFrom: [{
                source: entity.source || 'unknown',
                originalName: entity.name,
                timestamp: new Date().toISOString(),
                metadata: entity.metadata || {}
            }],
            metadata: entity.metadata || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Generate embedding
        const embedding = await teiService.getEmbedding(
            this._buildEmbeddingText(entity)
        );

        if (embedding) {
            // Store in Qdrant
            await qdrantService.upsertPoints([{
                id,
                vector: embedding,
                payload: canonicalEntity
            }], this.config.entityCollection);
        }

        // Update cache
        const cacheKey = `${entity.type || 'unknown'}:${normalizedName}`;
        this._entityCache.set(cacheKey, canonicalEntity);

        return canonicalEntity;
    }

    /**
     * Merge entity with existing canonical entity
     * @private
     */
    async _mergeWithCanonical(entity, match) {
        const payload = match.payload || {};

        // Update sources list
        const sources = new Set(payload.sources || []);
        if (entity.source) {
            sources.add(entity.source);
        }

        // Add to mergedFrom history
        const mergedFrom = payload.mergedFrom || [];
        mergedFrom.push({
            source: entity.source || 'unknown',
            originalName: entity.name,
            timestamp: new Date().toISOString(),
            confidence: match.combinedScore,
            matchLevel: match.matchLevel,
            metadata: entity.metadata || {}
        });

        // Add alias if name differs
        const aliases = new Set(payload.aliases || []);
        if (entity.name !== payload.name) {
            aliases.add(entity.name);
        }

        const updatedEntity = {
            ...payload,
            sources: Array.from(sources),
            aliases: Array.from(aliases),
            mergedFrom,
            updatedAt: new Date().toISOString()
        };

        // Regenerate embedding with enriched context
        const embedding = await teiService.getEmbedding(
            this._buildMergedEmbeddingText(updatedEntity)
        );

        if (embedding) {
            // Update in Qdrant
            await qdrantService.upsertPoints([{
                id: match.id,
                vector: embedding,
                payload: updatedEntity
            }], this.config.entityCollection);
        }

        // Update cache
        const cacheKey = `${entity.type || 'unknown'}:${normalizeName(entity.name)}`;
        this._entityCache.set(cacheKey, updatedEntity);

        return updatedEntity;
    }

    /**
     * Build embedding text from entity
     * @private
     */
    _buildEmbeddingText(entity) {
        const parts = [entity.name];

        if (entity.type) {
            parts.push(`[${entity.type}]`);
        }

        if (entity.description) {
            parts.push(entity.description);
        }

        if (entity.metadata?.context) {
            parts.push(entity.metadata.context);
        }

        return parts.join(' ');
    }

    /**
     * Build embedding text from merged entity
     * @private
     */
    _buildMergedEmbeddingText(entity) {
        const parts = [entity.name];

        if (entity.type) {
            parts.push(`[${entity.type}]`);
        }

        // Include aliases for richer embedding
        if (entity.aliases && entity.aliases.length > 0) {
            parts.push(`aka: ${entity.aliases.join(', ')}`);
        }

        // Include source types
        if (entity.sources && entity.sources.length > 0) {
            parts.push(`sources: ${entity.sources.join(', ')}`);
        }

        return parts.join(' ');
    }

    /**
     * Update confidence statistics
     * @private
     */
    _updateConfidenceStats(confidence) {
        this.stats.totalConfidence += confidence;
        this.stats.avgConfidence = this.stats.totalConfidence / this.stats.mergedEntities;
    }

    /**
     * Get resolution statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const resolutionRate = this.stats.totalResolutions > 0
            ? (this.stats.mergedEntities / this.stats.totalResolutions) * 100
            : 0;

        const deduplicationRatio = this.stats.totalResolutions > 0
            ? ((this.stats.totalResolutions - this.stats.newEntities) / this.stats.totalResolutions) * 100
            : 0;

        return {
            ...this.stats,
            resolutionRate: parseFloat(resolutionRate.toFixed(2)),
            deduplicationRatio: parseFloat(deduplicationRatio.toFixed(2)),
            avgConfidence: parseFloat((this.stats.avgConfidence || 0).toFixed(4)),
            cacheSize: this._entityCache.size
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalResolutions: 0,
            mergedEntities: 0,
            newEntities: 0,
            vectorMatches: 0,
            fuzzyMatches: 0,
            gnnMatches: 0,
            avgConfidence: 0,
            totalConfidence: 0
        };
    }

    /**
     * Clear entity cache
     */
    clearCache() {
        this._entityCache.clear();
    }

    /**
     * Get configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Update configuration
     * @param {Object} updates - Configuration updates
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
}

/**
 * Factory function
 * @param {Object} options - Configuration options
 * @returns {CrossSourceResolver}
 */
function createCrossSourceResolver(options = {}) {
    return new CrossSourceResolver(options);
}

/**
 * Default singleton instance
 */
const defaultInstance = new CrossSourceResolver();

module.exports = {
    CrossSourceResolver,
    createCrossSourceResolver,
    levenshteinDistance,
    levenshteinSimilarity,
    normalizeName,
    default: defaultInstance
};
