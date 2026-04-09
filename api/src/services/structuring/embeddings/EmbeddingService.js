/**
 * EmbeddingService - Unified сервис для генерации embeddings
 *
 * Работает с:
 * - TEI (Text Embeddings Inference) для генерации векторов
 * - Qdrant для хранения и поиска
 *
 * Функции:
 * - Batch processing с chunking
 * - Retry logic для надёжности
 * - Опциональное кэширование
 * - Преобразование ID для Qdrant
 */

const { QdrantClient } = require('@qdrant/js-client-rest');

/**
 * Конфигурация различных моделей embeddings
 */
const EmbeddingModels = {
    'bge-large': { dimension: 1024, maxTokens: 512 },
    'bge-base': { dimension: 768, maxTokens: 512 },
    'e5-large': { dimension: 1024, maxTokens: 512 },
    'nomic-embed': { dimension: 768, maxTokens: 8192 },
    'multilingual-e5': { dimension: 1024, maxTokens: 512 },
};

class EmbeddingService {
    /**
     * @param {Object} config
     * @param {string} config.teiUrl - TEI server URL
     * @param {string} config.qdrantUrl - Qdrant server URL
     * @param {string} config.modelName - Model name
     * @param {number} config.dimension - Vector dimension (default: 1024)
     * @param {number} config.batchSize - Batch size for TEI requests
     * @param {boolean} config.enableCache - Enable in-memory cache
     */
    constructor(config = {}) {
        this.teiUrl = config.teiUrl || process.env.TEI_URL || 'http://localhost:8081';
        this.qdrantUrl = config.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333';
        this.modelName = config.modelName || 'BAAI/bge-large-en-v1.5';
        this.dimension = config.dimension || 1024;
        this.batchSize = config.batchSize || 32;
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 1000;

        this.qdrant = new QdrantClient({ url: this.qdrantUrl });

        // Simple in-memory cache (optional)
        this.cache = config.enableCache ? new Map() : null;
        this.cacheMaxSize = config.cacheMaxSize || 1000;
    }

    // ============ Embedding Generation ============

    /**
     * Generate embedding for a single text
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} - Embedding vector
     */
    async generateEmbedding(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text must be a non-empty string');
        }

        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
            throw new Error('Text must be a non-empty string');
        }

        // Check cache
        if (this.cache) {
            const cacheKey = this._hashText(trimmedText);
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
        }

        const embeddings = await this._callTEIWithRetry([trimmedText]);
        const vector = embeddings[0];

        // Store in cache
        if (this.cache && vector) {
            this._addToCache(trimmedText, vector);
        }

        return vector;
    }

    /**
     * Generate embeddings for multiple texts (with batching)
     * @param {string[]} texts - Array of texts
     * @returns {Promise<number[][]>} - Array of embedding vectors
     */
    async generateBatchEmbeddings(texts) {
        if (!Array.isArray(texts) || texts.length === 0) {
            return [];
        }

        // Filter valid texts and track indices
        const validItems = texts.map((text, index) => ({
            index,
            text: typeof text === 'string' ? text.trim() : '',
        })).filter(item => item.text.length > 0);

        if (validItems.length === 0) {
            return texts.map(() => null);
        }

        // Check cache for existing embeddings
        const results = new Array(texts.length).fill(null);
        const toEmbed = [];

        for (const item of validItems) {
            if (this.cache) {
                const cacheKey = this._hashText(item.text);
                if (this.cache.has(cacheKey)) {
                    results[item.index] = this.cache.get(cacheKey);
                    continue;
                }
            }
            toEmbed.push(item);
        }

        // Batch process remaining texts
        if (toEmbed.length > 0) {
            const batches = this._chunkArray(toEmbed, this.batchSize);

            for (const batch of batches) {
                const batchTexts = batch.map(item => item.text);
                const embeddings = await this._callTEIWithRetry(batchTexts);

                for (let i = 0; i < batch.length; i++) {
                    const item = batch[i];
                    const vector = embeddings[i];

                    results[item.index] = vector;

                    if (this.cache && vector) {
                        this._addToCache(item.text, vector);
                    }
                }
            }
        }

        return results;
    }

    /**
     * Generate embedding for a code entity
     * Optimized text representation for code
     * @param {Object} entity - Entity with properties
     * @returns {Promise<number[]>}
     */
    async generateEntityEmbedding(entity) {
        const text = this._entityToEmbeddingText(entity);
        return this.generateEmbedding(text);
    }

    // ============ Qdrant Operations ============

    /**
     * Store embedding in Qdrant
     * @param {string} collection - Collection name
     * @param {string} id - Point ID
     * @param {number[]} vector - Embedding vector
     * @param {Object} payload - Metadata payload
     */
    async storeEmbedding(collection, id, vector, payload = {}) {
        await this.qdrant.upsert(collection, {
            wait: true,
            points: [{
                id: this._toQdrantId(id),
                vector,
                payload: {
                    ...payload,
                    _originalId: id,
                    _storedAt: new Date().toISOString(),
                },
            }],
        });
    }

    /**
     * Store multiple embeddings in Qdrant (batched)
     * @param {string} collection - Collection name
     * @param {Array<{id: string, vector: number[], payload: Object}>} points
     */
    async storeBatchEmbeddings(collection, points) {
        if (!points || points.length === 0) return;

        const BATCH_SIZE = 100;
        const batches = this._chunkArray(points, BATCH_SIZE);

        for (const batch of batches) {
            const qdrantPoints = batch
                .filter(p => p.vector && Array.isArray(p.vector))
                .map(p => ({
                    id: this._toQdrantId(p.id),
                    vector: p.vector,
                    payload: {
                        ...p.payload,
                        _originalId: p.id,
                        _storedAt: new Date().toISOString(),
                    },
                }));

            if (qdrantPoints.length > 0) {
                await this.qdrant.upsert(collection, {
                    wait: true,
                    points: qdrantPoints,
                });
            }
        }
    }

    /**
     * Search for similar vectors
     * @param {string} collection - Collection name
     * @param {number[]} vector - Query vector
     * @param {Object} options - Search options
     * @returns {Promise<Array<{id: string, score: number, payload: Object}>>}
     */
    async searchSimilar(collection, vector, options = {}) {
        const {
            limit = 10,
            scoreThreshold = 0,
            filter = null,
            excludeIds = [],
        } = options;

        // Build filter
        let qdrantFilter = filter;
        if (excludeIds.length > 0) {
            const excludeCondition = {
                must_not: [{
                    has_id: excludeIds.map(id => this._toQdrantId(id)),
                }],
            };

            qdrantFilter = filter
                ? { must: [filter, excludeCondition] }
                : excludeCondition;
        }

        const searchParams = {
            vector,
            limit,
            with_payload: true,
        };

        if (scoreThreshold > 0) {
            searchParams.score_threshold = scoreThreshold;
        }

        if (qdrantFilter) {
            searchParams.filter = qdrantFilter;
        }

        const results = await this.qdrant.search(collection, searchParams);

        return results.map(r => ({
            id: r.payload?._originalId || r.id,
            score: r.score,
            payload: r.payload,
        }));
    }

    /**
     * Search by text (generates embedding first)
     * @param {string} collection - Collection name
     * @param {string} text - Query text
     * @param {Object} options - Search options
     */
    async searchByText(collection, text, options = {}) {
        const vector = await this.generateEmbedding(text);
        return this.searchSimilar(collection, vector, options);
    }

    /**
     * Get vector by ID
     * @param {string} collection - Collection name
     * @param {string} id - Point ID
     * @returns {Promise<number[]|null>}
     */
    async getVector(collection, id) {
        try {
            const result = await this.qdrant.retrieve(collection, {
                ids: [this._toQdrantId(id)],
                with_vector: true,
            });

            if (result.length === 0) return null;
            return result[0].vector;
        } catch (error) {
            if (error.message?.includes('Not found')) return null;
            throw error;
        }
    }

    /**
     * Delete vector by ID
     * @param {string} collection - Collection name
     * @param {string} id - Point ID
     */
    async deleteVector(collection, id) {
        await this.qdrant.delete(collection, {
            wait: true,
            points: [this._toQdrantId(id)],
        });
    }

    /**
     * Delete multiple vectors
     * @param {string} collection - Collection name
     * @param {string[]} ids - Point IDs
     */
    async deleteBatchVectors(collection, ids) {
        if (!ids || ids.length === 0) return;

        await this.qdrant.delete(collection, {
            wait: true,
            points: ids.map(id => this._toQdrantId(id)),
        });
    }

    // ============ Utility Methods ============

    /**
     * Calculate cosine similarity between two vectors
     * @param {number[]} vec1
     * @param {number[]} vec2
     * @returns {number}
     */
    cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }

    /**
     * Health check
     * @returns {Promise<{tei: boolean, qdrant: boolean}>}
     */
    async healthCheck() {
        const status = { tei: false, qdrant: false };

        try {
            const teiResponse = await fetch(`${this.teiUrl}/health`);
            status.tei = teiResponse.ok;
        } catch (e) {
            status.tei = false;
        }

        try {
            await this.qdrant.getCollections();
            status.qdrant = true;
        } catch (e) {
            status.qdrant = false;
        }

        return status;
    }

    /**
     * Get service info
     */
    getInfo() {
        return {
            teiUrl: this.teiUrl,
            qdrantUrl: this.qdrantUrl,
            modelName: this.modelName,
            dimension: this.dimension,
            batchSize: this.batchSize,
            cacheEnabled: this.cache !== null,
            cacheSize: this.cache?.size || 0,
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        if (this.cache) {
            this.cache.clear();
        }
    }

    // ============ Private Methods ============

    async _callTEI(texts) {
        const response = await fetch(`${this.teiUrl}/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: texts }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`TEI embedding failed: ${response.status} - ${error}`);
        }

        return response.json();
    }

    async _callTEIWithRetry(texts) {
        let lastError;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this._callTEI(texts);
            } catch (error) {
                lastError = error;
                console.warn(`TEI call failed (attempt ${attempt}/${this.maxRetries}):`, error.message);

                if (attempt < this.maxRetries) {
                    await this._sleep(this.retryDelay * attempt);
                }
            }
        }

        throw lastError;
    }

    _entityToEmbeddingText(entity) {
        const props = entity?.properties || {};
        const parts = [];

        // Type context
        if (entity?.label) {
            parts.push(`[${entity.label}]`);
        }

        // Name
        if (props.name) {
            parts.push(props.name);
        }

        // Description/definition
        if (props.description) {
            parts.push(props.description);
        } else if (props.definition) {
            parts.push(props.definition);
        }

        // Documentation
        if (props.documentation) {
            parts.push(props.documentation);
        }

        // For code entities, add signature info
        if (props.parameters && Array.isArray(props.parameters)) {
            const params = props.parameters.map(p => `${p.name}: ${p.type || 'any'}`).join(', ');
            parts.push(`Parameters: ${params}`);
        }

        if (props.returnType) {
            parts.push(`Returns: ${props.returnType}`);
        }

        // Synonyms
        if (props.synonyms && props.synonyms.length > 0) {
            parts.push(`Also known as: ${props.synonyms.join(', ')}`);
        }

        return parts.join(' ').substring(0, 2000); // Truncate for model limits
    }

    _toQdrantId(id) {
        // Qdrant requires either integer or UUID
        if (typeof id === 'number') return id;
        if (typeof id === 'string') {
            // Check if already UUID format
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                return id;
            }
            // Create deterministic UUID-like ID from string
            return this._stringToUUID(id);
        }
        return String(id);
    }

    _stringToUUID(str) {
        // Create a deterministic UUID v4-like ID from string
        const hex1 = Math.abs(this._hashCode(str)).toString(16).padStart(8, '0');
        const hex2 = Math.abs(this._hashCode(str + 'salt1')).toString(16).padStart(8, '0');
        const hex3 = Math.abs(this._hashCode(str + 'salt2')).toString(16).padStart(8, '0');
        const hex4 = Math.abs(this._hashCode(str + 'salt3')).toString(16).padStart(8, '0');

        return `${hex1.slice(0, 8)}-${hex2.slice(0, 4)}-4${hex2.slice(4, 7)}-${hex3.slice(0, 4)}-${hex4.slice(0, 12).padEnd(12, '0')}`;
    }

    _hashCode(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return hash;
    }

    _hashText(text) {
        // Simple hash for cache key
        return Math.abs(this._hashCode(text.substring(0, 500))).toString(36);
    }

    _addToCache(text, vector) {
        if (!this.cache) return;

        const key = this._hashText(text);

        // Evict oldest if at capacity
        if (this.cache.size >= this.cacheMaxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, vector);
    }

    _chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { EmbeddingService, EmbeddingModels };
