/**
 * Unified Extractor - Single entry point for all extraction methods
 *
 * Supports:
 * - Pattern-based extraction
 * - LLM-based extraction
 * - Hybrid extraction
 * - DSPy-optimized extraction
 *
 * @module services/extraction/unified-extractor
 */

'use strict';

const { patternEnhancedExtractor, createPatternEnhancedExtractor } = require('./pattern-enhanced-extractor');

// Lazy load optional services
let _dspyService = null;
function getDspyServiceLazy() {
    if (_dspyService === null) {
        try {
            const { dspyService } = require('../dspy');
            _dspyService = dspyService;
        } catch (e) {
            _dspyService = false; // Mark as unavailable
        }
    }
    return _dspyService || null;
}

let _graphVerifier = null;
function getGraphVerifierLazy() {
    if (_graphVerifier === null) {
        try {
            const { graphVerifier } = require('../graph/metrics/graph-verifier');
            _graphVerifier = graphVerifier;
        } catch (e) {
            _graphVerifier = false; // Mark as unavailable
        }
    }
    return _graphVerifier || null;
}

// Simple logger (uses console)
const logger = {
    debug: (...args) => console.debug('[UnifiedExtractor]', ...args),
    info: (...args) => console.log('[UnifiedExtractor]', ...args),
    warn: (...args) => console.warn('[UnifiedExtractor]', ...args),
    error: (...args) => console.error('[UnifiedExtractor]', ...args)
};

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class UnifiedExtractor {
    constructor(options = {}) {
        this.options = {
            defaultMethod: options.defaultMethod || 'hybrid',
            enableVerification: options.enableVerification !== false,
            enableDSPy: options.enableDSPy || false,
            verificationThreshold: options.verificationThreshold || 0.6,
            ...options
        };

        // Create dedicated pattern extractor for this instance
        this.patternExtractor = options.patternExtractor || patternEnhancedExtractor;

        this.stats = {
            totalExtractions: 0,
            byMethod: {},
            verified: 0,
            verificationPassed: 0,
            errors: 0
        };
    }

    /**
     * Extract entities and relations from text
     */
    async extract(text, options = {}) {
        this.stats.totalExtractions++;
        const method = options.method || this.options.defaultMethod;
        const startTime = Date.now();

        // Track by method
        this.stats.byMethod[method] = (this.stats.byMethod[method] || 0) + 1;

        let result;

        try {
            switch (method) {
                case 'pattern':
                    result = await this._extractWithPatterns(text, options);
                    break;

                case 'dspy':
                    result = await this._extractWithDSPy(text, options);
                    break;

                case 'hybrid':
                default:
                    result = await this._extractHybrid(text, options);
                    break;
            }

            // Verification if enabled
            if (this.options.enableVerification && options.verify !== false) {
                result = await this._verifyExtraction(result, text, options);
            }

            result.metadata = {
                ...result.metadata,
                method,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

            return result;

        } catch (error) {
            this.stats.errors++;
            logger.error(`Extraction failed (${method}):`, error);
            return {
                entities: [],
                relations: [],
                metadata: {
                    method,
                    error: error.message,
                    duration: Date.now() - startTime
                }
            };
        }
    }

    /**
     * Pattern-only extraction
     */
    async _extractWithPatterns(text, options) {
        const extractor = this.patternExtractor;
        const originalMode = extractor.options.mode;

        extractor.options.mode = 'pattern_only';
        const result = await extractor.extract(text, options);
        extractor.options.mode = originalMode;

        return result;
    }

    /**
     * Hybrid extraction (pattern + LLM)
     */
    async _extractHybrid(text, options) {
        const extractor = this.patternExtractor;
        const originalMode = extractor.options.mode;

        extractor.options.mode = 'hybrid';
        const result = await extractor.extract(text, options);
        extractor.options.mode = originalMode;

        return result;
    }

    /**
     * DSPy-based extraction
     */
    async _extractWithDSPy(text, options) {
        const dspyService = getDspyServiceLazy();

        if (!this.options.enableDSPy || !dspyService) {
            logger.warn('DSPy extraction requested but not available, falling back to hybrid');
            return this._extractHybrid(text, options);
        }

        try {
            const result = await dspyService.extractKnowledgeGraph(text, {
                domain: options.domain,
                useCoT: true,
                verify: false // We'll verify separately
            });

            return {
                entities: result.entities || [],
                relations: result.relations || [],
                metadata: {
                    source: result.source,
                    confidence: result.confidence
                }
            };
        } catch (error) {
            logger.warn('DSPy extraction failed, falling back to hybrid:', error.message);
            return this._extractHybrid(text, options);
        }
    }

    /**
     * Verify extraction results
     */
    async _verifyExtraction(result, text, options) {
        const graphVerifier = getGraphVerifierLazy();

        if (!graphVerifier) {
            logger.debug('Graph verifier not available, skipping verification');
            return result;
        }

        this.stats.verified++;

        try {
            const verification = await graphVerifier.verify(result, text);

            result.verification = {
                score: verification.overallScore,
                grade: verification.grade,
                issues: verification.issues?.length || 0,
                issuesBySeverity: verification.issuesBySeverity
            };

            if (verification.overallScore >= this.options.verificationThreshold) {
                this.stats.verificationPassed++;
            }

            // Filter low-confidence entities/relations if verification found issues
            if (verification.issues && verification.issues.length > 0) {
                const issueEntities = new Set(
                    verification.issues
                        .filter(i => i.type === 'hallucination')
                        .map(i => i.source?.entity?.toLowerCase())
                        .filter(Boolean)
                );

                if (issueEntities.size > 0) {
                    result.entities = result.entities.filter(e =>
                        !issueEntities.has(e.name.toLowerCase())
                    );
                }
            }

        } catch (error) {
            logger.warn('Verification failed:', error.message);
            result.verification = { error: error.message };
        }

        return result;
    }

    /**
     * Batch extraction
     */
    async extractBatch(texts, options = {}) {
        const results = [];
        const batchSize = options.batchSize || 5;
        const onProgress = options.onProgress;

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);

            const batchResults = await Promise.all(
                batch.map(text => this.extract(text, options))
            );

            results.push(...batchResults);

            if (onProgress) {
                onProgress(Math.min(i + batchSize, texts.length), texts.length);
            }
        }

        return results;
    }

    /**
     * Get available methods
     */
    getAvailableMethods() {
        const methods = ['pattern', 'hybrid'];

        const dspyService = getDspyServiceLazy();
        if (dspyService && this.options.enableDSPy) {
            methods.push('dspy');
        }

        return methods;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            verificationPassRate: this.stats.verified > 0
                ? ((this.stats.verificationPassed / this.stats.verified) * 100).toFixed(1) + '%'
                : 'N/A',
            patternExtractorStats: this.patternExtractor.getStats()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalExtractions: 0,
            byMethod: {},
            verified: 0,
            verificationPassed: 0,
            errors: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 */
function createUnifiedExtractor(options) {
    return new UnifiedExtractor(options);
}

const unifiedExtractor = new UnifiedExtractor();

module.exports = {
    UnifiedExtractor,
    createUnifiedExtractor,
    unifiedExtractor
};
