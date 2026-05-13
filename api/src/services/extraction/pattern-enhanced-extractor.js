/**
 * Pattern-Enhanced Extractor
 * Combines pattern-based extraction with LLM extraction
 *
 * Workflow:
 * 1. Pre-extraction: Pattern Library extracts high-confidence entities/relations
 * 2. LLM Extraction: LLM extracts remaining entities/relations with pattern hints
 * 3. Post-validation: Validate LLM results against patterns
 * 4. Merge & Deduplicate: Combine results with confidence scoring
 * 5. Learn: Feed successful extractions back to Pattern Library
 *
 * @module services/extraction/pattern-enhanced-extractor
 */

'use strict';

const { patternLibrary } = require('../patterns');
const { getInstance: getLLMProvider } = require('../llm/LLMProviderService');

// Lazy load structured output for Gemini fallback
let _structuredOutput = null;
function getStructuredOutputLazy() {
    if (!_structuredOutput) {
        try {
            const { structuredOutput } = require('../ai/structured-output');
            _structuredOutput = structuredOutput;
        } catch (e) { /* not available */ }
    }
    return _structuredOutput;
}

// Simple logger (uses console)
const logger = {
    debug: (...args) => console.debug('[PatternEnhancedExtractor]', ...args),
    info: (...args) => console.log('[PatternEnhancedExtractor]', ...args),
    warn: (...args) => console.warn('[PatternEnhancedExtractor]', ...args),
    error: (...args) => console.error('[PatternEnhancedExtractor]', ...args)
};

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN-ENHANCED EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class PatternEnhancedExtractor {
    constructor(options = {}) {
        this.options = {
            // Extraction modes
            mode: options.mode || 'hybrid', // 'pattern_only', 'llm_only', 'hybrid'

            // Pattern settings
            patternConfidenceThreshold: options.patternConfidenceThreshold || 0.7,
            usePatternHints: options.usePatternHints !== false,

            // Merge settings
            preferPatternEntities: options.preferPatternEntities !== false,
            mergeConfidenceBoost: options.mergeConfidenceBoost || 0.1,

            // Learning
            enableLearning: options.enableLearning !== false,
            learningMinConfidence: options.learningMinConfidence || 0.8,

            ...options
        };

        this.patternLibrary = options.patternLibrary || patternLibrary;

        this.stats = {
            totalExtractions: 0,
            patternOnlyExtractions: 0,
            llmOnlyExtractions: 0,
            hybridExtractions: 0,
            entitiesFromPatterns: 0,
            entitiesFromLLM: 0,
            relationsFromPatterns: 0,
            relationsFromLLM: 0,
            learnedPatterns: 0
        };
    }

    /**
     * Main extraction method
     */
    async extract(text, context = {}) {
        this.stats.totalExtractions++;
        const startTime = Date.now();

        const result = {
            entities: [],
            relations: [],
            metadata: {
                mode: this.options.mode,
                domain: context.domain || 'general',
                duration: 0
            }
        };

        try {
            let extractionResult;

            switch (this.options.mode) {
                case 'pattern_only':
                    extractionResult = await this._patternOnlyExtraction(text, context);
                    break;

                case 'llm_only':
                    extractionResult = await this._llmOnlyExtraction(text, context);
                    break;

                case 'hybrid':
                default:
                    extractionResult = await this._hybridExtraction(text, context);
                    break;
            }

            extractionResult.metadata.duration = Date.now() - startTime;
            return extractionResult;

        } catch (error) {
            logger.error('Extraction failed:', error);
            result.metadata.error = error.message;
            result.metadata.duration = Date.now() - startTime;
            return result;
        }
    }

    /**
     * Pattern-only extraction
     */
    async _patternOnlyExtraction(text, context) {
        this.stats.patternOnlyExtractions++;

        const patternResult = this.patternLibrary.extract(text, context);

        this.stats.entitiesFromPatterns += patternResult.entities.length;
        this.stats.relationsFromPatterns += patternResult.relations.length;

        return {
            entities: patternResult.entities,
            relations: patternResult.relations,
            metadata: {
                mode: 'pattern_only',
                patternsUsed: patternResult.metadata.totalPatternMatches,
                entityPatterns: patternResult.metadata.entityPatternsUsed,
                relationPatterns: patternResult.metadata.relationPatternsUsed,
                subgraphPatterns: patternResult.subgraphPatterns
            }
        };
    }

    /**
     * LLM-only extraction
     */
    async _llmOnlyExtraction(text, context) {
        this.stats.llmOnlyExtractions++;

        const llmResult = await this._callLLMExtraction(text, context, []);

        this.stats.entitiesFromLLM += llmResult.entities.length;
        this.stats.relationsFromLLM += llmResult.relations.length;

        return {
            entities: llmResult.entities,
            relations: llmResult.relations,
            metadata: {
                mode: 'llm_only'
            }
        };
    }

    /**
     * Hybrid extraction (pattern + LLM)
     */
    async _hybridExtraction(text, context) {
        this.stats.hybridExtractions++;

        // Step 1: Pattern-based extraction
        const patternResult = this.patternLibrary.extract(text, context);
        const patternEntities = patternResult.entities;
        const patternRelations = patternResult.relations;

        this.stats.entitiesFromPatterns += patternEntities.length;
        this.stats.relationsFromPatterns += patternRelations.length;

        // Step 2: Prepare hints for LLM
        const hints = this.options.usePatternHints
            ? this._preparePatternHints(patternEntities, patternRelations)
            : [];

        // Step 3: LLM extraction with hints
        const llmResult = await this._callLLMExtraction(text, context, hints);

        this.stats.entitiesFromLLM += llmResult.entities.length;
        this.stats.relationsFromLLM += llmResult.relations.length;

        // Step 4: Merge results
        const mergedEntities = this._mergeEntities(patternEntities, llmResult.entities);
        const mergedRelations = this._mergeRelations(patternRelations, llmResult.relations, mergedEntities);

        // Step 5: Post-validation with subgraph patterns
        const subgraphMatches = this.patternLibrary.matchSubgraphPatterns(
            mergedEntities, mergedRelations, context
        );

        // Step 6: Learn from successful extraction
        if (this.options.enableLearning) {
            await this._learnFromExtraction(text, { entities: mergedEntities, relations: mergedRelations });
        }

        return {
            entities: mergedEntities,
            relations: mergedRelations,
            metadata: {
                mode: 'hybrid',
                sources: {
                    pattern: { entities: patternEntities.length, relations: patternRelations.length },
                    llm: { entities: llmResult.entities.length, relations: llmResult.relations.length },
                    merged: { entities: mergedEntities.length, relations: mergedRelations.length }
                },
                patternsUsed: patternResult.metadata.totalPatternMatches,
                subgraphPatterns: subgraphMatches.map(m => ({
                    name: m.pattern.name,
                    structure: m.pattern.structure,
                    score: m.score
                })),
                hintsProvided: hints.length
            }
        };
    }

    /**
     * Prepare hints from pattern extraction for LLM
     */
    _preparePatternHints(entities, relations) {
        const hints = [];

        // High-confidence entity hints
        const highConfEntities = entities.filter(e => e.confidence >= this.options.patternConfidenceThreshold);
        if (highConfEntities.length > 0) {
            hints.push({
                type: 'known_entities',
                message: `Already identified entities: ${highConfEntities.map(e => `${e.name} (${e.type})`).join(', ')}`,
                entities: highConfEntities
            });
        }

        // Relation hints
        const highConfRelations = relations.filter(r => r.confidence >= this.options.patternConfidenceThreshold);
        if (highConfRelations.length > 0) {
            hints.push({
                type: 'known_relations',
                message: `Already identified relations: ${highConfRelations.map(r => `${r.subject} ${r.predicate} ${r.object}`).join('; ')}`,
                relations: highConfRelations
            });
        }

        // Pattern recommendations
        const recommendations = this.patternLibrary.getRecommendations({ domain: 'general' });
        if (recommendations.length > 0) {
            const topRecs = recommendations.slice(0, 5);
            const entityTypes = topRecs.filter(r => r.type === 'entity').map(r => r.entityType);
            if (entityTypes.length > 0) {
                hints.push({
                    type: 'recommended_types',
                    message: `Common entity types: ${entityTypes.join(', ')}`,
                    recommendations: topRecs
                });
            }
        }

        return hints;
    }

    /**
     * Call LLM for extraction
     */
    _buildExtractionPrompts(text, context, hints) {
        const hintsText = hints.length > 0
            ? `\n\nHINTS:\n${hints.map(h => `- ${h.message}`).join('\n')}`
            : '';

        const systemPrompt = `You are a knowledge extraction expert. Extract entities AND their relationships from text.
Return a valid JSON object with "entities" and "relations" arrays.

Entity format: {"name": "...", "type": "...", "attributes": {...}}
Entity types: Person, Organization, Location, Event, System, Document, WorkItem, Process, Technology, API, Database, Module, Concept

Relation format: {"subject": "entity_name", "predicate": "RELATION_TYPE", "object": "entity_name"}
The subject and object MUST be exact entity names from the entities array.
Relation types: CONTAINS, DEPENDS_ON, USES, IMPLEMENTS, ASSIGNED_TO, AUTHORED_BY, PART_OF, REFERENCES, RELATED_TO, LOCATED_IN, HAS, AFFECTS, CAUSES, PRODUCES

IMPORTANT: You MUST extract at least one relation for every pair of entities that are mentioned together or are semantically related. Every entity should participate in at least one relation. If the text describes any connection between entities, create a relation for it.`;

        const userPrompt = `Extract all entities and their relationships from the following text.
Domain: ${context.domain || 'general'}

TEXT:
"""
${text}
"""
${hintsText}

Extract every entity mentioned and all relationships between them. Return JSON:`;

        return { systemPrompt, userPrompt };
    }

    /**
     * Extraction JSON Schema for structured output providers
     */
    _getExtractionSchema() {
        return {
            type: 'object',
            description: 'Knowledge graph extraction result with entities and relations',
            properties: {
                entities: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string' },
                            attributes: { type: 'object' }
                        },
                        required: ['name', 'type']
                    }
                },
                relations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            subject: { type: 'string' },
                            predicate: { type: 'string' },
                            object: { type: 'string' }
                        },
                        required: ['subject', 'predicate', 'object']
                    }
                }
            },
            required: ['entities', 'relations']
        };
    }

    /**
     * Try structured output extraction with a given provider
     */
    async _tryStructuredExtraction(prompt, provider, modelId) {
        const structuredOutput = getStructuredOutputLazy();
        if (!structuredOutput) return null;

        const result = await structuredOutput.generate(
            prompt,
            this._getExtractionSchema(),
            { provider, modelId }
        );

        if (result.success && result.data) {
            logger.info(`${provider} extraction: ${result.data.entities?.length || 0} entities, ${result.data.relations?.length || 0} relations`);
            return {
                entities: result.data.entities || [],
                relations: result.data.relations || []
            };
        }

        logger.warn(`${provider} extraction returned no data:`, result.error);
        return null;
    }

    async _callLLMExtraction(text, context, hints) {
        const { systemPrompt, userPrompt } = this._buildExtractionPrompts(text, context, hints);
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        // Provider chain: Claude Sonnet (primary) → Gemini (fallback) → Ollama (last resort)
        const providers = [
            { provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet' },
            { provider: 'gemini', modelId: 'gemini-2.0-flash', label: 'Gemini Flash' },
        ];

        for (const { provider, modelId, label } of providers) {
            try {
                logger.info(`Trying ${label} for extraction...`);
                const result = await this._tryStructuredExtraction(fullPrompt, provider, modelId);
                if (result && (result.entities.length > 0 || result.relations.length > 0)) {
                    return result;
                }
                if (result) {
                    logger.warn(`${label} returned 0 entities, trying next provider...`);
                }
            } catch (error) {
                logger.warn(`${label} extraction failed:`, error.message);
            }
        }

        // Last resort: Ollama via llmService.chat
        try {
            logger.info('Trying Ollama (local) for extraction...');
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];
            const response = await getLLMProvider().chat(messages);
            return this._parseLLMResponse(response);
        } catch (ollamaError) {
            logger.warn('Ollama extraction failed:', ollamaError.message);
        }

        logger.error('All LLM extraction methods failed — returning empty results');
        return { entities: [], relations: [] };
    }

    /**
     * Parse LLM response
     */
    _parseLLMResponse(response) {
        try {
            // Get text content from response
            const rawContent = response?.content;
            const text = typeof response === 'string'
                ? response
                : Array.isArray(rawContent)
                    ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
                    : (rawContent || response?.text || '');

            // Find JSON in response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { entities: [], relations: [] };
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Normalize entities
            const entities = (parsed.entities || []).map(e => ({
                name: e.name || '',
                type: e.type || 'Unknown',
                confidence: 0.7, // Default LLM confidence
                attributes: e.attributes || {},
                source: 'llm'
            })).filter(e => e.name);

            // Normalize relations
            const relations = (parsed.relations || []).map(r => ({
                subject: r.subject || r.source || '',
                predicate: (r.predicate || r.relation || r.type || 'RELATED_TO').toUpperCase(),
                object: r.object || r.target || '',
                confidence: 0.7,
                source: 'llm'
            })).filter(r => r.subject && r.object);

            return { entities, relations };
        } catch (error) {
            logger.warn('Failed to parse LLM response:', error.message);
            return { entities: [], relations: [] };
        }
    }

    /**
     * Merge entities from pattern and LLM
     */
    _mergeEntities(patternEntities, llmEntities) {
        const merged = new Map();

        // Add pattern entities first (higher priority)
        for (const entity of patternEntities) {
            const key = entity.name.toLowerCase();
            merged.set(key, {
                ...entity,
                source: 'pattern',
                confidence: entity.confidence
            });
        }

        // Add/merge LLM entities
        for (const entity of llmEntities) {
            const key = entity.name.toLowerCase();

            if (merged.has(key)) {
                // Entity exists from pattern - boost confidence
                const existing = merged.get(key);
                existing.confidence = Math.min(1, existing.confidence + this.options.mergeConfidenceBoost);
                existing.source = 'both';

                // Merge attributes
                existing.attributes = { ...entity.attributes, ...existing.attributes };

                // Use LLM type if pattern didn't have one
                if (!existing.type || existing.type === 'Unknown') {
                    existing.type = entity.type;
                }
            } else {
                // New entity from LLM
                merged.set(key, {
                    ...entity,
                    source: 'llm'
                });
            }
        }

        return [...merged.values()];
    }

    /**
     * Merge relations from pattern and LLM
     */
    _mergeRelations(patternRelations, llmRelations, entities) {
        const merged = new Map();
        const entityNames = new Set(entities.map(e => e.name.toLowerCase()));

        // Helper to create relation key
        const relKey = (r) => `${r.subject}|${r.predicate}|${r.object}`.toLowerCase();

        // Add pattern relations first
        for (const relation of patternRelations) {
            const key = relKey(relation);
            merged.set(key, {
                ...relation,
                source: 'pattern'
            });
        }

        // Add/merge LLM relations
        for (const relation of llmRelations) {
            // Validate that subject and object exist in entities
            if (!entityNames.has(relation.subject.toLowerCase()) ||
                !entityNames.has(relation.object.toLowerCase())) {
                continue; // Skip relations with unknown entities
            }

            const key = relKey(relation);

            if (merged.has(key)) {
                const existing = merged.get(key);
                existing.confidence = Math.min(1, existing.confidence + this.options.mergeConfidenceBoost);
                existing.source = 'both';
            } else {
                merged.set(key, {
                    ...relation,
                    source: 'llm'
                });
            }
        }

        return [...merged.values()];
    }

    /**
     * Learn from successful extraction
     */
    async _learnFromExtraction(text, extraction) {
        // Only learn from high-confidence extractions
        const highConfEntities = extraction.entities.filter(e =>
            e.confidence >= this.options.learningMinConfidence
        );

        const highConfRelations = extraction.relations.filter(r =>
            r.confidence >= this.options.learningMinConfidence
        );

        if (highConfEntities.length > 0 || highConfRelations.length > 0) {
            const result = this.patternLibrary.learnFromExtraction(text, {
                entities: highConfEntities,
                relations: highConfRelations
            });

            if (result.learned) {
                this.stats.learnedPatterns += result.entities + result.relations + result.subgraphs;
                logger.debug(`Learned ${result.entities} entity, ${result.relations} relation patterns`);
            }
        }
    }

    /**
     * Get extraction statistics
     */
    getStats() {
        const patternStats = this.patternLibrary.getStats();

        return {
            ...this.stats,
            patternLibrary: patternStats,
            averagePerExtraction: this.stats.totalExtractions > 0 ? {
                entities: ((this.stats.entitiesFromPatterns + this.stats.entitiesFromLLM) / this.stats.totalExtractions).toFixed(2),
                relations: ((this.stats.relationsFromPatterns + this.stats.relationsFromLLM) / this.stats.totalExtractions).toFixed(2)
            } : { entities: 0, relations: 0 }
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalExtractions: 0,
            patternOnlyExtractions: 0,
            llmOnlyExtractions: 0,
            hybridExtractions: 0,
            entitiesFromPatterns: 0,
            entitiesFromLLM: 0,
            relationsFromPatterns: 0,
            relationsFromLLM: 0,
            learnedPatterns: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function
 */
function createPatternEnhancedExtractor(options) {
    return new PatternEnhancedExtractor(options);
}

// Singleton with default options
const patternEnhancedExtractor = new PatternEnhancedExtractor();

module.exports = {
    PatternEnhancedExtractor,
    createPatternEnhancedExtractor,
    patternEnhancedExtractor
};
