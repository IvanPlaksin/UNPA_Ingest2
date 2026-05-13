/**
 * Sentence Decomposer Service
 *
 * Classifies sentence complexity and decomposes complex sentences into simple ones.
 * This improves entity extraction recall by 15%+ (arXiv 2509.17289).
 *
 * Features:
 * - Fast heuristic-based complexity classification (no LLM needed)
 * - LLM-powered decomposition for complex sentences
 * - Provenance tracking (original → decomposed mapping)
 * - Batch processing with progress tracking
 *
 * @module services/preprocessing/sentence-decomposer
 */

'use strict';

const { getInstance: getLLMProvider } = require('../llm/LLMProviderService');

/**
 * Sentence complexity levels
 */
const ComplexityLevel = {
    SIMPLE: 'simple',
    COMPOUND: 'compound',
    COMPLEX: 'complex'
};

/**
 * Patterns for complexity detection
 */
const COMPLEXITY_PATTERNS = {
    // Coordinating conjunctions (compound sentences)
    CONJUNCTIONS: /\b(and|or|but|so|yet|for|nor)\b/gi,

    // Subordinating conjunctions (complex sentences)
    SUBORDINATING: /\b(because|since|although|though|while|whereas|when|whenever|if|unless|until|after|before|as|once|than|that|whether|even if|even though|in order that|provided that|so that)\b/gi,

    // Relative pronouns (relative clauses)
    RELATIVE: /\b(who|whom|whose|which|that|where|when|whereby)\b/gi,

    // Multiple clauses indicators
    CLAUSE_SEPARATORS: /[,;]/g
};

/**
 * SentenceDecomposer class
 */
class SentenceDecomposer {
    constructor(options = {}) {
        this.options = {
            useLLM: options.useLLM ?? true,
            minWordsForComplex: options.minWordsForComplex ?? 15,
            maxDecomposedSentences: options.maxDecomposedSentences ?? 5,
            llmTemperature: options.llmTemperature ?? 0.1,
            llmMaxTokens: options.llmMaxTokens ?? 500,
            ...options
        };
    }

    /**
     * Classify sentence complexity using heuristics (no LLM needed)
     * @param {string} sentence - Sentence to classify
     * @returns {string} Complexity level: 'simple', 'compound', or 'complex'
     */
    classifyComplexity(sentence) {
        if (!sentence || typeof sentence !== 'string') {
            return ComplexityLevel.SIMPLE;
        }

        const wordCount = sentence.split(/\s+/).filter(w => w.length > 0).length;
        const conjunctionMatches = sentence.match(COMPLEXITY_PATTERNS.CONJUNCTIONS) || [];
        const subordinatingMatches = sentence.match(COMPLEXITY_PATTERNS.SUBORDINATING) || [];
        const relativeMatches = sentence.match(COMPLEXITY_PATTERNS.RELATIVE) || [];
        const clauseSeparators = sentence.match(COMPLEXITY_PATTERNS.CLAUSE_SEPARATORS) || [];

        // Simple: short sentences without complex structures
        if (wordCount < 10 &&
            conjunctionMatches.length === 0 &&
            subordinatingMatches.length === 0 &&
            relativeMatches.length === 0) {
            return ComplexityLevel.SIMPLE;
        }

        // Complex: has subordinating conjunctions or relative clauses
        if (subordinatingMatches.length > 0 ||
            (relativeMatches.length > 0 && clauseSeparators.length >= 1)) {
            return ComplexityLevel.COMPLEX;
        }

        // Compound: has coordinating conjunctions with multiple clauses
        if (conjunctionMatches.length > 0 && clauseSeparators.length >= 1) {
            return ComplexityLevel.COMPOUND;
        }

        // Long sentences are likely complex
        if (wordCount > this.options.minWordsForComplex &&
            clauseSeparators.length >= 2) {
            return ComplexityLevel.COMPLEX;
        }

        // Default: compound if has conjunctions, simple otherwise
        return conjunctionMatches.length > 0 ? ComplexityLevel.COMPOUND : ComplexityLevel.SIMPLE;
    }

    /**
     * Decompose a sentence into simpler sentences
     * @param {string} sentence - Sentence to decompose
     * @param {Object} options - Decomposition options
     * @returns {Promise<Object>} Decomposition result
     */
    async decompose(sentence, options = {}) {
        if (!sentence || typeof sentence !== 'string') {
            return this._createResult(sentence, ComplexityLevel.SIMPLE, [sentence || ''], false);
        }

        const trimmedSentence = sentence.trim();
        const complexity = this.classifyComplexity(trimmedSentence);

        // Simple sentences don't need decomposition
        if (complexity === ComplexityLevel.SIMPLE) {
            return this._createResult(trimmedSentence, complexity, [trimmedSentence], false);
        }

        // Try heuristic decomposition first
        const heuristicResult = this._heuristicDecompose(trimmedSentence, complexity);
        if (heuristicResult.length > 1) {
            return this._createResult(trimmedSentence, complexity, heuristicResult, true, 'heuristic');
        }

        // Use LLM for complex sentences if enabled
        if (this.options.useLLM && complexity === ComplexityLevel.COMPLEX) {
            try {
                const llmResult = await this._llmDecompose(trimmedSentence);
                if (llmResult.length > 1) {
                    return this._createResult(trimmedSentence, complexity, llmResult, true, 'llm');
                }
            } catch (error) {
                console.warn('[SentenceDecomposer] LLM decomposition failed:', error.message);
            }
        }

        // Fallback: return original
        return this._createResult(trimmedSentence, complexity, [trimmedSentence], false);
    }

    /**
     * Heuristic-based decomposition (fast, no LLM)
     * @private
     */
    _heuristicDecompose(sentence, complexity) {
        const results = [];

        if (complexity === ComplexityLevel.COMPOUND) {
            // Split on coordinating conjunctions with commas
            const parts = sentence.split(/,\s*(?:and|but|or|so)\s+/i)
                .filter(p => p.trim().length > 0);

            if (parts.length > 1) {
                return parts.map(p => this._capitalizeFirst(p.trim()));
            }
        }

        // Split on semicolons
        const semicolonParts = sentence.split(/;\s*/)
            .filter(p => p.trim().length > 0);

        if (semicolonParts.length > 1) {
            return semicolonParts.map(p => this._capitalizeFirst(p.trim()));
        }

        return [sentence];
    }

    /**
     * LLM-based decomposition for complex sentences
     * @private
     */
    async _llmDecompose(sentence) {
        const prompt = `Decompose the following complex sentence into simple sentences. Each simple sentence should contain one main fact or idea. Preserve all information from the original.

Sentence: "${sentence}"

Return ONLY a JSON array of strings, no explanation:`;

        const response = await getLLMProvider().chat([
            { role: 'user', content: prompt }
        ], {
            system: 'You are a linguistic expert. Decompose complex sentences into simple ones. Return only valid JSON arrays.',
        });

        const rawContent = response.content;
        const content = Array.isArray(rawContent)
            ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
            : (rawContent || '');
        return this._parseJsonArray(content);
    }

    /**
     * Process multiple sentences
     * @param {string[]} sentences - Array of sentences
     * @param {Object} options - Processing options
     * @returns {Promise<Object[]>} Array of decomposition results
     */
    async decomposeAll(sentences, options = {}) {
        const { parallel = false, onProgress = null, batchSize = 10 } = options;
        const results = [];

        if (!Array.isArray(sentences) || sentences.length === 0) {
            return results;
        }

        if (parallel && !this.options.useLLM) {
            // Parallel processing (only for heuristic mode to avoid rate limits)
            const promises = sentences.map(s => this.decompose(s));
            return Promise.all(promises);
        }

        // Sequential processing with progress
        for (let i = 0; i < sentences.length; i++) {
            const result = await this.decompose(sentences[i]);
            results.push(result);

            if (onProgress && typeof onProgress === 'function') {
                onProgress(i + 1, sentences.length, Math.round(((i + 1) / sentences.length) * 100));
            }
        }

        return results;
    }

    /**
     * Get statistics from decomposition results
     * @param {Object[]} results - Array of decomposition results
     * @returns {Object} Statistics
     */
    getStats(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return {
                originalSentences: 0,
                decomposedCount: 0,
                resultingSentences: 0,
                expansionRatio: 1,
                complexityDistribution: { simple: 0, compound: 0, complex: 0 },
                methodDistribution: { none: 0, heuristic: 0, llm: 0 }
            };
        }

        const decomposedCount = results.filter(r => r.wasDecomposed).length;
        const resultingSentences = results.reduce((sum, r) => sum + r.decomposed.length, 0);

        const complexityDist = {
            simple: results.filter(r => r.complexity === ComplexityLevel.SIMPLE).length,
            compound: results.filter(r => r.complexity === ComplexityLevel.COMPOUND).length,
            complex: results.filter(r => r.complexity === ComplexityLevel.COMPLEX).length
        };

        const methodDist = {
            none: results.filter(r => !r.wasDecomposed).length,
            heuristic: results.filter(r => r.method === 'heuristic').length,
            llm: results.filter(r => r.method === 'llm').length
        };

        return {
            originalSentences: results.length,
            decomposedCount,
            resultingSentences,
            expansionRatio: parseFloat((resultingSentences / results.length).toFixed(2)),
            complexityDistribution: complexityDist,
            methodDistribution: methodDist
        };
    }

    /**
     * Create result object
     * @private
     */
    _createResult(original, complexity, decomposed, wasDecomposed, method = null) {
        return {
            original,
            complexity,
            decomposed: decomposed.slice(0, this.options.maxDecomposedSentences),
            wasDecomposed,
            method,
            timestamp: Date.now()
        };
    }

    /**
     * Parse JSON array from LLM response
     * @private
     */
    _parseJsonArray(text) {
        try {
            // Find JSON array in response
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (Array.isArray(parsed)) {
                    return parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
                }
            }
        } catch (error) {
            console.warn('[SentenceDecomposer] JSON parse error:', error.message);
        }
        return [];
    }

    /**
     * Capitalize first letter
     * @private
     */
    _capitalizeFirst(str) {
        if (!str || str.length === 0) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

/**
 * Factory function
 */
function createSentenceDecomposer(options = {}) {
    return new SentenceDecomposer(options);
}

/**
 * Default singleton instance
 */
const defaultInstance = new SentenceDecomposer();

module.exports = {
    SentenceDecomposer,
    createSentenceDecomposer,
    ComplexityLevel,
    default: defaultInstance
};
