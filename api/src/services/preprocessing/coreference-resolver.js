/**
 * Coreference Resolver Service
 *
 * Resolves pronouns and anaphoric references to their full entity names.
 * This reduces duplicate nodes in the knowledge graph by 28% (CORE-KG 2025).
 *
 * Features:
 * - Fast heuristic pronoun detection (no LLM for simple checks)
 * - LLM-powered resolution for complex cases
 * - Context accumulation across sentence sequence
 * - Support for English and Russian pronouns
 *
 * @module services/preprocessing/coreference-resolver
 */

'use strict';

const llmService = require('../llm.service');

/**
 * Pronoun patterns for detection
 */
const PRONOUN_PATTERNS = {
    // English pronouns
    EN_PERSONAL: /\b(he|she|it|they|him|her|them)\b/gi,
    EN_POSSESSIVE: /\b(his|her|hers|its|their|theirs)\b/gi,
    EN_DEMONSTRATIVE: /\b(this|that|these|those)\b/gi,
    EN_RELATIVE: /\b(who|whom|whose|which)\b/gi,
    EN_ANAPHORIC: /\b(the former|the latter|the same|such)\b/gi,

    // Russian pronouns
    RU_PERSONAL: /\b([Oo]\u043d|[Oo]\u043d\u0430|[Oo]\u043d\u043e|[Oo]\u043d\u0438|\u0435\u0433\u043e|\u0435\u0451|\u0438\u0445|\u0435\u043c\u0443|\u0435\u0439|\u0438\u043c)\b/g,
    RU_DEMONSTRATIVE: /\b(\u044d\u0442\u043e\u0442|\u044d\u0442\u0430|\u044d\u0442\u043e|\u044d\u0442\u0438|\u0442\u043e\u0442|\u0442\u0430|\u0442\u043e|\u0442\u0435)\b/gi,
    RU_RELATIVE: /\b(\u043a\u043e\u0442\u043e\u0440\u044b\u0439|\u043a\u043e\u0442\u043e\u0440\u0430\u044f|\u043a\u043e\u0442\u043e\u0440\u043e\u0435|\u043a\u043e\u0442\u043e\u0440\u044b\u0435|\u0447\u0435\u0439|\u0447\u044c\u044f|\u0447\u044c\u0451)\b/gi
};

/**
 * CoreferenceResolver class
 */
class CoreferenceResolver {
    constructor(options = {}) {
        this.options = {
            useLLM: options.useLLM ?? true,
            maxContextEntities: options.maxContextEntities ?? 20,
            llmTemperature: options.llmTemperature ?? 0.1,
            llmMaxTokens: options.llmMaxTokens ?? 1000,
            detectLanguage: options.detectLanguage ?? true,
            ...options
        };
    }

    /**
     * Check if text contains potential coreferences
     * @param {string} text - Text to check
     * @returns {Object} Detection result with pronoun counts
     */
    detectCoreferences(text) {
        if (!text || typeof text !== 'string') {
            return { hasCoreferences: false, pronounCounts: {} };
        }

        const pronounCounts = {};
        let totalPronouns = 0;

        for (const [name, pattern] of Object.entries(PRONOUN_PATTERNS)) {
            const matches = text.match(pattern) || [];
            if (matches.length > 0) {
                pronounCounts[name] = matches.length;
                totalPronouns += matches.length;
            }
        }

        return {
            hasCoreferences: totalPronouns > 0,
            pronounCounts,
            totalPronouns
        };
    }

    /**
     * Resolve coreferences in text
     * @param {string} text - Text with pronouns
     * @param {Object} context - Context with known entities
     * @returns {Promise<Object>} Resolution result
     */
    async resolve(text, context = {}) {
        if (!text || typeof text !== 'string') {
            return this._createResult(text, text, [], false);
        }

        const trimmedText = text.trim();
        const detection = this.detectCoreferences(trimmedText);

        // No coreferences detected
        if (!detection.hasCoreferences) {
            return this._createResult(trimmedText, trimmedText, [], false);
        }

        // Try LLM resolution if enabled
        if (this.options.useLLM) {
            try {
                const result = await this._llmResolve(trimmedText, context);
                return result;
            } catch (error) {
                console.warn('[CoreferenceResolver] LLM resolution failed:', error.message);
            }
        }

        // Fallback: return original with detection info
        return this._createResult(trimmedText, trimmedText, [], false, detection);
    }

    /**
     * LLM-based coreference resolution
     * @private
     */
    async _llmResolve(text, context) {
        const entitiesContext = context.entities && context.entities.length > 0
            ? `\nKnown entities from previous sentences: ${context.entities.slice(0, this.options.maxContextEntities).join(', ')}`
            : '';

        const prompt = `Replace all pronouns and anaphoric references in the text with the full names of entities they refer to. Preserve the original meaning and grammar.

Text: "${text}"${entitiesContext}

Return ONLY valid JSON in this format:
{
  "resolved": "text with pronouns replaced",
  "replacements": [{"from": "he", "to": "John Smith", "position": 15}]
}`;

        const response = await llmService.chat([
            { role: 'system', content: 'You are a linguistic expert specializing in coreference resolution. Replace pronouns with their referents. Return only valid JSON.' },
            { role: 'user', content: prompt }
        ]);

        const content = response.content || '';
        const parsed = this._parseJsonResponse(content);

        if (parsed.resolved && parsed.resolved !== text) {
            return this._createResult(
                text,
                parsed.resolved,
                parsed.replacements || [],
                true
            );
        }

        return this._createResult(text, text, [], false);
    }

    /**
     * Process multiple texts with context accumulation
     * @param {string[]} texts - Array of texts
     * @param {Object} options - Processing options
     * @returns {Promise<Object[]>} Array of resolution results
     */
    async resolveAll(texts, options = {}) {
        const { onProgress = null, accumulateContext = true } = options;
        const results = [];
        let accumulatedEntities = options.initialEntities || [];

        if (!Array.isArray(texts) || texts.length === 0) {
            return results;
        }

        for (let i = 0; i < texts.length; i++) {
            const context = accumulateContext
                ? { entities: accumulatedEntities }
                : {};

            const result = await this.resolve(texts[i], context);
            results.push(result);

            // Accumulate entities from replacements for context
            if (accumulateContext && result.replacements.length > 0) {
                const newEntities = result.replacements
                    .map(r => r.to)
                    .filter(e => e && !accumulatedEntities.includes(e));

                accumulatedEntities = [
                    ...accumulatedEntities,
                    ...newEntities
                ].slice(-this.options.maxContextEntities);
            }

            if (onProgress && typeof onProgress === 'function') {
                onProgress(i + 1, texts.length, Math.round(((i + 1) / texts.length) * 100));
            }
        }

        return results;
    }

    /**
     * Extract entity names from resolved texts
     * @param {Object[]} results - Resolution results
     * @returns {string[]} Unique entity names
     */
    extractEntities(results) {
        const entities = new Set();

        for (const result of results) {
            if (result.replacements) {
                for (const replacement of result.replacements) {
                    if (replacement.to) {
                        entities.add(replacement.to);
                    }
                }
            }
        }

        return Array.from(entities);
    }

    /**
     * Get statistics from resolution results
     * @param {Object[]} results - Array of resolution results
     * @returns {Object} Statistics
     */
    getStats(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return {
                totalTexts: 0,
                textsWithCoreferences: 0,
                textsResolved: 0,
                totalReplacements: 0,
                averageReplacementsPerText: 0,
                uniqueEntitiesFound: 0
            };
        }

        const textsWithCoreferences = results.filter(r =>
            r.detection?.hasCoreferences || r.replacements?.length > 0
        ).length;

        const textsResolved = results.filter(r => r.wasResolved).length;

        const totalReplacements = results.reduce(
            (sum, r) => sum + (r.replacements?.length || 0), 0
        );

        const entities = this.extractEntities(results);

        return {
            totalTexts: results.length,
            textsWithCoreferences,
            textsResolved,
            totalReplacements,
            averageReplacementsPerText: parseFloat((totalReplacements / results.length).toFixed(2)),
            uniqueEntitiesFound: entities.length
        };
    }

    /**
     * Create result object
     * @private
     */
    _createResult(original, resolved, replacements, wasResolved, detection = null) {
        return {
            original,
            resolved,
            replacements,
            wasResolved,
            detection,
            timestamp: Date.now()
        };
    }

    /**
     * Parse JSON response from LLM
     * @private
     */
    _parseJsonResponse(text) {
        try {
            // Find JSON object in response
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
        } catch (error) {
            console.warn('[CoreferenceResolver] JSON parse error:', error.message);
        }
        return {};
    }
}

/**
 * Factory function
 */
function createCoreferenceResolver(options = {}) {
    return new CoreferenceResolver(options);
}

/**
 * Default singleton instance
 */
const defaultInstance = new CoreferenceResolver();

module.exports = {
    CoreferenceResolver,
    createCoreferenceResolver,
    PRONOUN_PATTERNS,
    default: defaultInstance
};
