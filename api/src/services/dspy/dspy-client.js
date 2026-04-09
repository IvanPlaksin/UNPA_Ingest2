/**
 * DSPy Client — JavaScript interface to Python DSPy service
 *
 * Provides:
 * - Entity extraction with optimized prompts
 * - Relation extraction with constraint validation
 * - Knowledge graph extraction (combined)
 * - Graph verification and correction
 * - Task planning
 * - Prompt optimization management
 *
 * @module services/dspy/dspy-client
 */

'use strict';

const axios = require('axios');

// ═══════════════════════════════════════════════════════════════════════════════
// DSPY CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class DSPyClient {
    constructor(options = {}) {
        this.options = {
            baseUrl: options.baseUrl || process.env.DSPY_SERVICE_URL || 'http://localhost:5001',
            timeout: options.timeout || 30000,
            retries: options.retries || 3,
            retryDelay: options.retryDelay || 1000,
            ...options
        };

        this.client = axios.create({
            baseURL: this.options.baseUrl,
            timeout: this.options.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalLatency: 0
        };

        this._setupInterceptors();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities from text
     * @param {string} text - Source text
     * @param {object} options - Extraction options
     * @returns {Promise<EntityExtractionResult>}
     */
    async extractEntities(text, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/extract/entities', {
            text,
            context: options.context || '',
            use_cot: options.useCoT || false,
            use_ontology: options.useOntology !== false
        });

        return {
            entities: response.entities || [],
            entityCount: response.entity_count || response.entities?.length || 0,
            rawOutput: response.raw_output,
            metadata: {
                duration: response.duration,
                source: 'dspy'
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RELATION EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract relations between entities
     * @param {string} text - Source text
     * @param {Array} entities - Already extracted entities
     * @param {object} options - Extraction options
     * @returns {Promise<RelationExtractionResult>}
     */
    async extractRelations(text, entities, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/extract/relations', {
            text,
            entities,
            use_cot: options.useCoT || false
        });

        return {
            relations: response.relations || [],
            validRelations: response.valid_relations || [],
            invalidRelations: response.invalid_relations || [],
            relationCount: response.relation_count || response.relations?.length || 0,
            metadata: {
                duration: response.duration,
                source: 'dspy'
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // KNOWLEDGE GRAPH EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract full knowledge graph (entities + relations)
     * @param {string} text - Source text
     * @param {object} options - Extraction options
     * @returns {Promise<KnowledgeGraphExtractionResult>}
     */
    async extractKnowledgeGraph(text, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/extract/kg', {
            text,
            context: options.context || '',
            use_cot: options.useCoT || false,
            verify: options.verify !== false,
            auto_correct: options.autoCorrect || false
        });

        return {
            entities: response.entities || [],
            relations: response.relations || [],
            triples: this._convertToTriples(response.entities, response.relations),
            entityCount: response.entity_count || response.entities?.length || 0,
            relationCount: response.relation_count || response.relations?.length || 0,
            verification: response.verification || null,
            correctionsApplied: response.corrections_applied || 0,
            metadata: {
                duration: response.duration,
                source: 'dspy'
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Verify extraction result for hallucinations and issues
     * @param {Array} entities - Extracted entities
     * @param {Array} relations - Extracted relations
     * @param {string} sourceText - Original source text
     * @param {object} options - Verification options
     * @returns {Promise<VerificationResult>}
     */
    async verifyGraph(entities, relations, sourceText, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/verify', {
            entities,
            relations,
            source_text: sourceText,
            verify_claims: options.verifyClaims !== false
        });

        return {
            score: response.score,
            grade: response.grade,
            issueCount: response.issue_count,
            issues: response.issues || [],
            validEntities: response.valid_entities || [],
            validRelations: response.valid_relations || [],
            metadata: {
                duration: response.duration,
                source: 'dspy'
            }
        };
    }

    /**
     * Verify and correct extraction result (PiVe cycle)
     * @param {Array} entities - Extracted entities
     * @param {Array} relations - Extracted relations
     * @param {string} sourceText - Original source text
     * @param {object} options - Correction options
     * @returns {Promise<CorrectionResult>}
     */
    async verifyAndCorrect(entities, relations, sourceText, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/verify/correct', {
            entities,
            relations,
            source_text: sourceText
        });

        return {
            entities: response.entities || [],
            relations: response.relations || [],
            initialEntities: response.initial_entities || entities,
            initialRelations: response.initial_relations || relations,
            finalScore: response.final_score,
            finalGrade: response.final_grade,
            iterations: response.iterations || [],
            improvement: response.improvement || 0,
            metadata: {
                duration: response.duration,
                source: 'dspy'
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PLANNING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Plan extraction pipeline for text
     * @param {string} text - Source text
     * @param {object} options - Planning options
     * @returns {Promise<PlanningResult>}
     */
    async planExtraction(text, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/plan', {
            text,
            text_type: options.textType || 'auto'
        });

        return {
            textType: response.text_type,
            complexity: response.complexity,
            steps: response.steps || [],
            estimatedEntities: response.estimated_entities,
            estimatedRelations: response.estimated_relations,
            chunkingNeeded: response.chunking_needed,
            metadata: {
                duration: response.duration,
                source: 'dspy'
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Start prompt optimization job
     * @param {string} moduleType - Module to optimize (entity, relation, kg, verifier)
     * @param {Array} trainingData - Training examples
     * @param {object} options - Optimization options
     * @returns {Promise<OptimizationJobInfo>}
     */
    async startOptimization(moduleType, trainingData, options = {}) {
        const response = await this._request('POST', '/api/v1/dspy/optimize', {
            module_type: moduleType,
            training_data: trainingData,
            optimizer: options.optimizer || 'miprov2',
            num_trials: options.numTrials || 30
        });

        return {
            jobId: response.job_id,
            status: response.status,
            message: response.message
        };
    }

    /**
     * Get optimization job status
     * @param {string} jobId - Job ID
     * @returns {Promise<OptimizationJobStatus>}
     */
    async getOptimizationStatus(jobId) {
        const response = await this._request('GET', `/api/v1/dspy/optimize/${jobId}`);

        return {
            jobId: response.job_id || jobId,
            status: response.status,
            moduleType: response.module_type,
            progress: response.progress,
            result: response.result,
            error: response.error
        };
    }

    /**
     * Get optimization history
     * @returns {Promise<Array>}
     */
    async getOptimizationHistory() {
        const response = await this._request('GET', '/api/v1/dspy/optimize/history');
        return response.history || [];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATUS & HEALTH
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get DSPy service status
     * @returns {Promise<ServiceStatus>}
     */
    async getStatus() {
        const response = await this._request('GET', '/api/v1/dspy/status');

        return {
            loadedModules: response.loaded_modules || [],
            optimizationJobs: response.optimization_jobs || {},
            availableModules: response.available_modules || [],
            availableOptimizers: response.available_optimizers || []
        };
    }

    /**
     * Health check
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        try {
            const response = await this._request('GET', '/health', {}, { timeout: 5000 });
            return response.status === 'healthy';
        } catch (error) {
            return false;
        }
    }

    /**
     * Clear module cache on server
     * @returns {Promise<object>}
     */
    async clearModuleCache() {
        return this._request('DELETE', '/api/v1/dspy/modules/cache');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities from multiple texts
     * @param {Array<string>} texts - Source texts
     * @param {object} options - Extraction options
     * @param {function} onProgress - Progress callback
     * @returns {Promise<Array<EntityExtractionResult>>}
     */
    async extractEntitiesBatch(texts, options = {}, onProgress = null) {
        const results = [];
        const batchSize = options.batchSize || 10;

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(text =>
                    this.extractEntities(text, options).catch(err => ({
                        entities: [],
                        entityCount: 0,
                        error: err.message
                    }))
                )
            );

            results.push(...batchResults);

            if (onProgress) {
                onProgress(Math.min(i + batchSize, texts.length), texts.length);
            }
        }

        return results;
    }

    /**
     * Extract knowledge graphs from multiple texts
     * @param {Array<string>} texts - Source texts
     * @param {object} options - Extraction options
     * @param {function} onProgress - Progress callback
     * @returns {Promise<Array<KnowledgeGraphExtractionResult>>}
     */
    async extractKnowledgeGraphBatch(texts, options = {}, onProgress = null) {
        const results = [];
        const batchSize = options.batchSize || 5;

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(text =>
                    this.extractKnowledgeGraph(text, options).catch(err => ({
                        entities: [],
                        relations: [],
                        triples: [],
                        error: err.message
                    }))
                )
            );

            results.push(...batchResults);

            if (onProgress) {
                onProgress(Math.min(i + batchSize, texts.length), texts.length);
            }
        }

        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Convert entities and relations to triples format
     * @private
     */
    _convertToTriples(entities, relations) {
        if (!relations) return [];

        const entityMap = new Map();
        for (const entity of (entities || [])) {
            entityMap.set(entity.name?.toLowerCase(), entity);
        }

        return relations.map(rel => ({
            subject: entityMap.get(rel.source?.toLowerCase()) || { name: rel.source },
            predicate: rel.relation_type || rel.type,
            object: entityMap.get(rel.target?.toLowerCase()) || { name: rel.target },
            confidence: rel.confidence
        }));
    }

    /**
     * Make HTTP request with retry logic
     * @private
     */
    async _request(method, path, data = {}, options = {}) {
        const startTime = Date.now();
        this.stats.totalRequests++;

        let lastError;

        for (let attempt = 0; attempt < this.options.retries; attempt++) {
            try {
                const response = await this.client.request({
                    method,
                    url: path,
                    data: method !== 'GET' ? data : undefined,
                    params: method === 'GET' ? data : undefined,
                    ...options
                });

                this.stats.successfulRequests++;
                this.stats.totalLatency += Date.now() - startTime;

                return response.data;
            } catch (error) {
                lastError = error;

                // Don't retry on client errors (4xx)
                if (error.response?.status >= 400 && error.response?.status < 500) {
                    break;
                }

                // Wait before retry
                if (attempt < this.options.retries - 1) {
                    await this._sleep(this.options.retryDelay * Math.pow(2, attempt));
                }
            }
        }

        this.stats.failedRequests++;

        const errorMessage = lastError.response?.data?.detail ||
            lastError.response?.data?.error ||
            lastError.message;

        console.error(`[DSPyClient] Request failed: ${method} ${path}`, errorMessage);

        throw new Error(`DSPy request failed: ${errorMessage}`);
    }

    /**
     * Setup axios interceptors
     * @private
     */
    _setupInterceptors() {
        // Request interceptor
        this.client.interceptors.request.use(
            config => {
                config.metadata = { startTime: Date.now() };
                return config;
            },
            error => Promise.reject(error)
        );

        // Response interceptor
        this.client.interceptors.response.use(
            response => {
                const duration = Date.now() - response.config.metadata.startTime;
                if (!response.data) response.data = {};
                response.data.duration = duration;
                return response;
            },
            error => Promise.reject(error)
        );
    }

    /**
     * Sleep helper
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get client statistics
     * @returns {object}
     */
    getStats() {
        return {
            ...this.stats,
            avgLatency: this.stats.successfulRequests > 0
                ? Math.round(this.stats.totalLatency / this.stats.successfulRequests)
                : 0,
            successRate: this.stats.totalRequests > 0
                ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalLatency: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 * @param {object} options - Client options
 * @returns {DSPyClient}
 */
function createDSPyClient(options) {
    return new DSPyClient(options);
}

// Singleton instance
const dspyClient = new DSPyClient();

module.exports = {
    DSPyClient,
    createDSPyClient,
    dspyClient
};
