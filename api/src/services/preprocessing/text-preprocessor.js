/**
 * Text Preprocessor - Unified preprocessing pipeline
 *
 * Orchestrates the complete text preprocessing flow:
 * 1. Sanitization (PII removal, HTML cleanup)
 * 2. Sentence splitting
 * 3. Coreference resolution
 * 4. Sentence decomposition
 *
 * Based on EDC (Extract-Define-Canonicalize) pattern from EMNLP 2024.
 *
 * @module services/preprocessing/text-preprocessor
 */

'use strict';

const { createSanitizer } = require('./sanitizer.service');
const { createSentenceDecomposer } = require('./sentence-decomposer');
const { createCoreferenceResolver } = require('./coreference-resolver');

/**
 * TextPreprocessor class
 */
class TextPreprocessor {
    constructor(options = {}) {
        this.options = {
            sanitize: options.sanitize ?? true,
            resolveCoreferences: options.resolveCoreferences ?? true,
            decomposeSentences: options.decomposeSentences ?? true,
            useLLM: options.useLLM ?? true,
            ...options
        };

        // Initialize sub-services
        this.sanitizer = options.sanitizer || createSanitizer();
        this.decomposer = options.decomposer || createSentenceDecomposer({
            useLLM: this.options.useLLM
        });
        this.coreferenceResolver = options.coreferenceResolver || createCoreferenceResolver({
            useLLM: this.options.useLLM
        });
    }

    /**
     * Split text into sentences
     * @param {string} text - Text to split
     * @returns {string[]} Array of sentences
     */
    splitIntoSentences(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        // Handle common abbreviations to avoid false splits
        const protectedText = text
            .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Inc|Ltd|Corp|etc|vs|viz|i\.e|e\.g)\./gi, '$1\u0000')
            .replace(/\b([A-Z])\./g, '$1\u0000') // Single letter abbreviations
            .replace(/(\d)\./g, '$1\u0000'); // Numbers with periods

        // Split on sentence boundaries
        const sentences = protectedText
            .split(/(?<=[.!?])\s+(?=[A-Z\u0410-\u042F\u0401])/)
            .map(s => s.replace(/\u0000/g, '.').trim())
            .filter(s => s.length > 0);

        return sentences;
    }

    /**
     * Process text through the complete preprocessing pipeline
     * @param {string} text - Raw text
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Preprocessed result
     */
    async process(text, options = {}) {
        const startTime = Date.now();
        const { onProgress = null, context = {} } = options;

        const result = {
            original: text,
            sentences: [],
            stats: {
                sanitization: null,
                coreference: null,
                decomposition: null
            },
            pipeline: [],
            duration: 0
        };

        if (!text || typeof text !== 'string') {
            result.duration = Date.now() - startTime;
            return result;
        }

        let currentText = text;
        let currentSentences = [];

        // Step 1: Sanitization
        if (this.options.sanitize) {
            try {
                const sanitizeResult = this.sanitizer.sanitize(currentText, {
                    removeHtml: true,
                    removePii: true,
                    normalizeWhitespace: true
                });
                currentText = sanitizeResult.text;
                result.stats.sanitization = sanitizeResult.stats;
                result.pipeline.push({
                    step: 'sanitize',
                    success: true,
                    changes: sanitizeResult.stats?.piiRemoved || 0
                });
            } catch (error) {
                console.warn('[TextPreprocessor] Sanitization failed:', error.message);
                result.pipeline.push({
                    step: 'sanitize',
                    success: false,
                    error: error.message
                });
            }
        }

        // Step 2: Sentence splitting
        currentSentences = this.splitIntoSentences(currentText);
        result.pipeline.push({
            step: 'sentence_split',
            success: true,
            count: currentSentences.length
        });

        if (onProgress) onProgress('sentence_split', 1, 3);

        // Step 3: Coreference resolution
        if (this.options.resolveCoreferences && currentSentences.length > 0) {
            try {
                const corefResults = await this.coreferenceResolver.resolveAll(
                    currentSentences,
                    {
                        accumulateContext: true,
                        initialEntities: context.entities || []
                    }
                );

                currentSentences = corefResults.map(r => r.resolved);
                result.stats.coreference = this.coreferenceResolver.getStats(corefResults);
                result.pipeline.push({
                    step: 'coreference',
                    success: true,
                    resolved: result.stats.coreference.textsResolved,
                    replacements: result.stats.coreference.totalReplacements
                });
            } catch (error) {
                console.warn('[TextPreprocessor] Coreference resolution failed:', error.message);
                result.pipeline.push({
                    step: 'coreference',
                    success: false,
                    error: error.message
                });
            }
        }

        if (onProgress) onProgress('coreference', 2, 3);

        // Step 4: Sentence decomposition
        if (this.options.decomposeSentences && currentSentences.length > 0) {
            try {
                const decomposeResults = await this.decomposer.decomposeAll(currentSentences);

                // Flatten decomposed sentences
                currentSentences = decomposeResults.flatMap(r => r.decomposed);
                result.stats.decomposition = this.decomposer.getStats(decomposeResults);
                result.pipeline.push({
                    step: 'decomposition',
                    success: true,
                    originalCount: decomposeResults.length,
                    resultCount: currentSentences.length,
                    expansionRatio: result.stats.decomposition.expansionRatio
                });
            } catch (error) {
                console.warn('[TextPreprocessor] Sentence decomposition failed:', error.message);
                result.pipeline.push({
                    step: 'decomposition',
                    success: false,
                    error: error.message
                });
            }
        }

        if (onProgress) onProgress('decomposition', 3, 3);

        result.sentences = currentSentences;
        result.duration = Date.now() - startTime;

        return result;
    }

    /**
     * Process multiple texts
     * @param {string[]} texts - Array of texts
     * @param {Object} options - Processing options
     * @returns {Promise<Object[]>} Array of results
     */
    async processAll(texts, options = {}) {
        const { onProgress = null } = options;
        const results = [];

        if (!Array.isArray(texts) || texts.length === 0) {
            return results;
        }

        for (let i = 0; i < texts.length; i++) {
            const result = await this.process(texts[i], options);
            results.push(result);

            if (onProgress) {
                onProgress(i + 1, texts.length, Math.round(((i + 1) / texts.length) * 100));
            }
        }

        return results;
    }

    /**
     * Get aggregated statistics from multiple results
     * @param {Object[]} results - Array of processing results
     * @returns {Object} Aggregated statistics
     */
    getAggregatedStats(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return {
                documentsProcessed: 0,
                totalSentences: 0,
                averageSentencesPerDoc: 0,
                totalDuration: 0,
                averageDuration: 0
            };
        }

        const totalSentences = results.reduce((sum, r) => sum + (r.sentences?.length || 0), 0);
        const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

        // Aggregate coreference stats
        const corefStats = results
            .filter(r => r.stats?.coreference)
            .map(r => r.stats.coreference);

        const totalReplacements = corefStats.reduce((sum, s) => sum + (s.totalReplacements || 0), 0);

        // Aggregate decomposition stats
        const decompStats = results
            .filter(r => r.stats?.decomposition)
            .map(r => r.stats.decomposition);

        const avgExpansion = decompStats.length > 0
            ? decompStats.reduce((sum, s) => sum + s.expansionRatio, 0) / decompStats.length
            : 1;

        return {
            documentsProcessed: results.length,
            totalSentences,
            averageSentencesPerDoc: parseFloat((totalSentences / results.length).toFixed(2)),
            totalDuration,
            averageDuration: parseFloat((totalDuration / results.length).toFixed(2)),
            coreference: {
                totalReplacements,
                documentsWithCoreferences: corefStats.filter(s => s.textsResolved > 0).length
            },
            decomposition: {
                averageExpansionRatio: parseFloat(avgExpansion.toFixed(2)),
                documentsDecomposed: decompStats.filter(s => s.decomposedCount > 0).length
            }
        };
    }
}

/**
 * Factory function
 */
function createTextPreprocessor(options = {}) {
    return new TextPreprocessor(options);
}

/**
 * Default singleton instance
 */
const defaultInstance = new TextPreprocessor();

module.exports = {
    TextPreprocessor,
    createTextPreprocessor,
    default: defaultInstance
};
