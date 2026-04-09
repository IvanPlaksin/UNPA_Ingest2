/**
 * DSPy Service — high-level service for DSPy integration
 *
 * Provides:
 * - Caching with TTL
 * - Fallback to local extraction
 * - Automatic health checks
 * - Integration with existing services
 *
 * @module services/dspy/dspy.service
 */

'use strict';

const { dspyClient, createDSPyClient } = require('./dspy-client');

// ═══════════════════════════════════════════════════════════════════════════════
// DSPY SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class DSPyService {
    constructor(options = {}) {
        this.options = {
            useDSPy: options.useDSPy !== false,
            fallbackToLocal: options.fallbackToLocal !== false,
            cacheResults: options.cacheResults !== false,
            cacheTTL: options.cacheTTL || 3600000, // 1 hour
            healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
            ...options
        };

        this.client = options.client || dspyClient;
        this.cache = new Map();
        this.isAvailable = null; // Will be set on first health check
        this._lastHealthCheck = 0;

        // Check availability on startup (async)
        this._checkAvailability();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract entities with DSPy (with fallback)
     * @param {string} text - Source text
     * @param {object} options - Extraction options
     * @returns {Promise<EntityExtractionResult>}
     */
    async extractEntities(text, options = {}) {
        // Check cache
        const cacheKey = this._getCacheKey('entities', text, options);
        if (this.options.cacheResults && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.options.cacheTTL) {
                return { ...cached.data, fromCache: true };
            }
        }

        // Try DSPy
        if (this.options.useDSPy && await this._ensureAvailable()) {
            try {
                const result = await this.client.extractEntities(text, options);
                this._cacheResult(cacheKey, result);
                return { ...result, source: 'dspy' };
            } catch (error) {
                console.warn('[DSPyService] Entity extraction failed, using fallback:', error.message);
            }
        }

        // Fallback to local extraction
        if (this.options.fallbackToLocal) {
            return this._localEntityExtraction(text, options);
        }

        throw new Error('DSPy service unavailable and no fallback configured');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RELATION EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract relations with DSPy (with fallback)
     * @param {string} text - Source text
     * @param {Array} entities - Pre-extracted entities
     * @param {object} options - Extraction options
     * @returns {Promise<RelationExtractionResult>}
     */
    async extractRelations(text, entities, options = {}) {
        const cacheKey = this._getCacheKey('relations', text, { entities, ...options });
        if (this.options.cacheResults && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.options.cacheTTL) {
                return { ...cached.data, fromCache: true };
            }
        }

        if (this.options.useDSPy && await this._ensureAvailable()) {
            try {
                const result = await this.client.extractRelations(text, entities, options);
                this._cacheResult(cacheKey, result);
                return { ...result, source: 'dspy' };
            } catch (error) {
                console.warn('[DSPyService] Relation extraction failed, using fallback:', error.message);
            }
        }

        if (this.options.fallbackToLocal) {
            return this._localRelationExtraction(text, entities, options);
        }

        throw new Error('DSPy service unavailable and no fallback configured');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // KNOWLEDGE GRAPH EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Extract full knowledge graph with DSPy
     * @param {string} text - Source text
     * @param {object} options - Extraction options
     * @returns {Promise<KnowledgeGraphExtractionResult>}
     */
    async extractKnowledgeGraph(text, options = {}) {
        const cacheKey = this._getCacheKey('kg', text, options);
        if (this.options.cacheResults && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.options.cacheTTL) {
                return { ...cached.data, fromCache: true };
            }
        }

        if (this.options.useDSPy && await this._ensureAvailable()) {
            try {
                const result = await this.client.extractKnowledgeGraph(text, options);
                this._cacheResult(cacheKey, result);
                return { ...result, source: 'dspy' };
            } catch (error) {
                console.warn('[DSPyService] KG extraction failed, using fallback:', error.message);
            }
        }

        // Fallback: extract entities then relations
        if (this.options.fallbackToLocal) {
            const entityResult = await this._localEntityExtraction(text, options);
            const relationResult = await this._localRelationExtraction(
                text,
                entityResult.entities,
                options
            );

            return {
                entities: entityResult.entities,
                relations: relationResult.relations,
                triples: this._buildTriples(entityResult.entities, relationResult.relations),
                entityCount: entityResult.entities.length,
                relationCount: relationResult.relations.length,
                source: 'local_fallback'
            };
        }

        throw new Error('DSPy service unavailable and no fallback configured');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Verify extraction result
     * @param {Array} entities - Extracted entities
     * @param {Array} relations - Extracted relations
     * @param {string} sourceText - Original source text
     * @param {object} options - Verification options
     * @returns {Promise<VerificationResult>}
     */
    async verifyGraph(entities, relations, sourceText, options = {}) {
        if (!await this._ensureAvailable()) {
            // Return local verification
            return this._localVerification(entities, relations, sourceText);
        }

        return this.client.verifyGraph(entities, relations, sourceText, options);
    }

    /**
     * Verify and optionally correct extraction
     * @param {Array} entities - Extracted entities
     * @param {Array} relations - Extracted relations
     * @param {string} sourceText - Original source text
     * @param {object} options - Correction options
     * @returns {Promise<CorrectionResult>}
     */
    async verifyAndCorrect(entities, relations, sourceText, options = {}) {
        if (!await this._ensureAvailable()) {
            throw new Error('DSPy service unavailable for verification/correction');
        }

        return this.client.verifyAndCorrect(entities, relations, sourceText, options);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PLANNING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get extraction plan for text
     * @param {string} text - Source text
     * @param {object} options - Planning options
     * @returns {Promise<PlanningResult>}
     */
    async planExtraction(text, options = {}) {
        if (await this._ensureAvailable()) {
            try {
                return await this.client.planExtraction(text, options);
            } catch (error) {
                console.warn('[DSPyService] Planning failed:', error.message);
            }
        }

        // Simple heuristic fallback
        return this._localPlanExtraction(text);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Start optimization job
     * @param {string} moduleType - Module to optimize
     * @param {Array} trainingData - Training examples
     * @param {object} options - Optimization options
     * @returns {Promise<OptimizationJobInfo>}
     */
    async startOptimization(moduleType, trainingData, options = {}) {
        if (!await this._ensureAvailable()) {
            throw new Error('DSPy service unavailable for optimization');
        }

        return this.client.startOptimization(moduleType, trainingData, options);
    }

    /**
     * Get optimization status
     * @param {string} jobId - Job ID
     * @returns {Promise<OptimizationJobStatus>}
     */
    async getOptimizationStatus(jobId) {
        return this.client.getOptimizationStatus(jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATUS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Check if DSPy service is available
     * @returns {Promise<boolean>}
     */
    async isServiceAvailable() {
        return this._ensureAvailable();
    }

    /**
     * Get service status
     * @returns {Promise<object>}
     */
    async getStatus() {
        const available = await this._ensureAvailable();

        if (available) {
            const status = await this.client.getStatus();
            return {
                ...status,
                available: true,
                cacheSize: this.cache.size,
                fallbackEnabled: this.options.fallbackToLocal
            };
        }

        return {
            available: false,
            loadedModules: [],
            cacheSize: this.cache.size,
            fallbackEnabled: this.options.fallbackToLocal
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LOCAL FALLBACK METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Local entity extraction fallback
     * @private
     */
    async _localEntityExtraction(text, options = {}) {
        try {
            // Try to use existing extraction service
            const { entityExtractionService } = require('../extraction/entity-extraction.service');

            if (entityExtractionService && typeof entityExtractionService.extract === 'function') {
                const result = await entityExtractionService.extract(text, options);
                return {
                    entities: result.entities || [],
                    entityCount: result.entities?.length || 0,
                    source: 'local'
                };
            }
        } catch (error) {
            // Service not available, use simple extraction
        }

        // Simple pattern-based fallback
        const entities = this._simpleEntityExtraction(text);
        return {
            entities,
            entityCount: entities.length,
            source: 'local_simple'
        };
    }

    /**
     * Local relation extraction fallback
     * @private
     */
    async _localRelationExtraction(text, entities, options = {}) {
        try {
            const { relationExtractionService } = require('../extraction/relation-extraction.service');

            if (relationExtractionService && typeof relationExtractionService.extract === 'function') {
                const result = await relationExtractionService.extract(text, entities, options);
                return {
                    relations: result.relations || [],
                    relationCount: result.relations?.length || 0,
                    source: 'local'
                };
            }
        } catch (error) {
            // Service not available
        }

        // Simple pattern-based fallback
        const relations = this._simpleRelationExtraction(text, entities);
        return {
            relations,
            relationCount: relations.length,
            source: 'local_simple'
        };
    }

    /**
     * Local verification fallback
     * @private
     */
    _localVerification(entities, relations, sourceText) {
        // Simple verification: check if entity names appear in text
        const textLower = sourceText.toLowerCase();
        let validEntities = 0;
        let validRelations = 0;

        for (const entity of entities) {
            if (textLower.includes(entity.name?.toLowerCase() || '')) {
                validEntities++;
            }
        }

        for (const rel of relations) {
            const sourceInText = textLower.includes(rel.source?.toLowerCase() || '');
            const targetInText = textLower.includes(rel.target?.toLowerCase() || '');
            if (sourceInText && targetInText) {
                validRelations++;
            }
        }

        const totalElements = entities.length + relations.length;
        const validElements = validEntities + validRelations;
        const score = totalElements > 0 ? validElements / totalElements : 1.0;

        return {
            score,
            grade: this._scoreToGrade(score),
            issueCount: totalElements - validElements,
            issues: [],
            validEntities: entities.slice(0, validEntities),
            validRelations: relations.slice(0, validRelations),
            source: 'local_verification'
        };
    }

    /**
     * Local planning fallback
     * @private
     */
    _localPlanExtraction(text) {
        const wordCount = text.split(/\s+/).length;
        const hasCode = /```|function|class|def |const |let |var /.test(text);
        const hasStructure = /#{1,6}\s|^\d+\.\s|^-\s/m.test(text);

        let textType = 'document';
        let complexity = 'medium';

        if (hasCode) {
            textType = 'code';
            complexity = 'high';
        } else if (hasStructure) {
            // Structured document takes precedence over short text
            textType = 'structured_document';
            complexity = wordCount < 100 ? 'low' : 'medium';
        } else if (wordCount < 100) {
            textType = 'short_text';
            complexity = 'low';
        }

        return {
            textType,
            complexity,
            estimatedEntities: Math.max(1, Math.floor(wordCount / 20)),
            estimatedRelations: Math.max(1, Math.floor(wordCount / 40)),
            steps: [
                { module: 'entity_extraction', config: {}, reason: 'Extract entities first' },
                { module: 'relation_extraction', config: {}, reason: 'Extract relations between entities' },
                { module: 'validation', config: {}, reason: 'Validate against ontology' }
            ],
            chunkingNeeded: wordCount > 2000,
            source: 'local_heuristic'
        };
    }

    /**
     * Simple pattern-based entity extraction
     * @private
     */
    _simpleEntityExtraction(text) {
        const entities = [];

        // Work item patterns (Bug, Task, Feature, etc.)
        const workItemPattern = /(Bug|Task|Feature|UserStory|Epic|Story)\s*#?(\d+)/gi;
        let match;
        while ((match = workItemPattern.exec(text)) !== null) {
            entities.push({
                name: `${match[1]}${match[2]}`,
                type: match[1].replace(/\s+/g, ''),
                confidence: 0.7
            });
        }

        // User patterns (@username or "assigned to X")
        const userPattern = /@(\w+)|assigned\s+to\s+(\w+)/gi;
        while ((match = userPattern.exec(text)) !== null) {
            const name = match[1] || match[2];
            if (name && !entities.find(e => e.name.toLowerCase() === name.toLowerCase())) {
                entities.push({
                    name,
                    type: 'User',
                    confidence: 0.6
                });
            }
        }

        // File patterns
        const filePattern = /(\w+\.\w{2,4})/g;
        while ((match = filePattern.exec(text)) !== null) {
            const ext = match[1].split('.').pop().toLowerCase();
            if (['js', 'ts', 'py', 'java', 'cs', 'go', 'rs', 'cpp', 'c', 'h', 'jsx', 'tsx', 'md', 'json', 'yaml', 'yml'].includes(ext)) {
                if (!entities.find(e => e.name === match[1])) {
                    entities.push({
                        name: match[1],
                        type: 'File',
                        confidence: 0.6
                    });
                }
            }
        }

        return entities;
    }

    /**
     * Simple pattern-based relation extraction
     * @private
     */
    _simpleRelationExtraction(text, entities) {
        const relations = [];
        const textLower = text.toLowerCase();

        // Build entity lookup
        const entityNames = entities.map(e => e.name.toLowerCase());

        // Simple relation patterns
        const patterns = [
            { regex: /(\w+)\s+assigned\s+to\s+(\w+)/gi, type: 'ASSIGNED_TO' },
            { regex: /(\w+)\s+depends\s+on\s+(\w+)/gi, type: 'DEPENDS_ON' },
            { regex: /(\w+)\s+references?\s+(\w+)/gi, type: 'REFERENCES' },
            { regex: /(\w+)\s+modifies?\s+(\w+)/gi, type: 'MODIFIES' },
            { regex: /(\w+)\s+fixes?\s+(\w+)/gi, type: 'FIXES' }
        ];

        for (const { regex, type } of patterns) {
            let match;
            while ((match = regex.exec(text)) !== null) {
                const source = match[1].toLowerCase();
                const target = match[2].toLowerCase();

                // Check if both are known entities
                if (entityNames.includes(source) || entityNames.includes(target)) {
                    relations.push({
                        source: match[1],
                        target: match[2],
                        relation_type: type,
                        confidence: 0.5
                    });
                }
            }
        }

        return relations;
    }

    /**
     * Build triples from entities and relations
     * @private
     */
    _buildTriples(entities, relations) {
        const entityMap = new Map();
        for (const entity of entities) {
            entityMap.set(entity.name?.toLowerCase(), entity);
        }

        return relations.map(rel => ({
            subject: entityMap.get(rel.source?.toLowerCase()) || { name: rel.source },
            predicate: rel.relation_type || rel.type,
            object: entityMap.get(rel.target?.toLowerCase()) || { name: rel.target }
        }));
    }

    /**
     * Convert score to letter grade
     * @private
     */
    _scoreToGrade(score) {
        if (score >= 0.9) return 'A';
        if (score >= 0.8) return 'B';
        if (score >= 0.7) return 'C';
        if (score >= 0.6) return 'D';
        return 'F';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Check DSPy service availability
     * @private
     */
    async _checkAvailability() {
        try {
            this.isAvailable = await this.client.healthCheck();
        } catch (error) {
            this.isAvailable = false;
        }

        console.log(`[DSPyService] Service availability: ${this.isAvailable}`);
        return this.isAvailable;
    }

    /**
     * Ensure service is available (with periodic recheck)
     * @private
     */
    async _ensureAvailable() {
        const now = Date.now();

        // First check
        if (this.isAvailable === null) {
            await this._checkAvailability();
        }
        // Periodic recheck if unavailable
        else if (!this.isAvailable && now - this._lastHealthCheck > this.options.healthCheckInterval) {
            await this._checkAvailability();
            this._lastHealthCheck = now;
        }

        return this.isAvailable;
    }

    /**
     * Generate cache key
     * @private
     */
    _getCacheKey(type, text, options) {
        const optionsStr = JSON.stringify(options);
        const textHash = this._hashString(text.slice(0, 500));
        return `${type}:${textHash}:${this._hashString(optionsStr)}`;
    }

    /**
     * Simple string hash
     * @private
     */
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Cache result
     * @private
     */
    _cacheResult(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });

        // Limit cache size
        if (this.cache.size > 1000) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get service statistics
     * @returns {object}
     */
    getStats() {
        return {
            clientStats: this.client.getStats(),
            cacheSize: this.cache.size,
            isAvailable: this.isAvailable
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 * @param {object} options - Service options
 * @returns {DSPyService}
 */
function createDSPyService(options) {
    return new DSPyService(options);
}

// Singleton instance
const dspyService = new DSPyService();

module.exports = {
    DSPyService,
    createDSPyService,
    dspyService
};
