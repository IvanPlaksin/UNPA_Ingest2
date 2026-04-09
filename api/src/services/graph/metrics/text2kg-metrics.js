/**
 * Text2KGBench Metrics Implementation
 *
 * Based on ISWC 2023 benchmark for text-to-knowledge-graph evaluation.
 *
 * Metrics:
 * - Hallucination Rate - % of triples not grounded in source text
 * - Ontology Conformance - % of triples conforming to schema
 * - Faithfulness Score - semantic similarity between triples and source
 * - Entity Precision/Recall/F1 - standard IR metrics for entity extraction
 * - Relation Precision/Recall/F1 - F1 for relation extraction
 * - Graph Edit Distance (GED) - structural similarity to reference graphs
 *
 * @module services/graph/metrics/text2kg-metrics
 */

'use strict';

const logger = console; // Replace with actual logger

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
    faithfulnessThreshold: 0.7,
    similarityModel: 'cosine',
    useSemanticMatching: true,
    embeddingFallback: true
};

// Weights for summary score computation
const METRIC_WEIGHTS = {
    hallucination: 0.20,      // Lower is better (inverted)
    ontologyConformance: 0.15,
    faithfulness: 0.20,
    entityF1: 0.20,
    relationF1: 0.15,
    gedSimilarity: 0.10
};

const GRADE_THRESHOLDS = [
    { min: 0.95, grade: 'A+' },
    { min: 0.90, grade: 'A' },
    { min: 0.85, grade: 'A-' },
    { min: 0.80, grade: 'B+' },
    { min: 0.75, grade: 'B' },
    { min: 0.70, grade: 'B-' },
    { min: 0.65, grade: 'C+' },
    { min: 0.60, grade: 'C' },
    { min: 0.55, grade: 'C-' },
    { min: 0.50, grade: 'D' },
    { min: 0.00, grade: 'F' }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEXT2KG METRICS CLASS
// ═══════════════════════════════════════════════════════════════════════════

class Text2KGMetrics {
    /**
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.options = { ...DEFAULT_CONFIG, ...options };

        // Embedding cache to avoid redundant computations
        this.embeddingCache = new Map();
        this.cacheMaxSize = options.cacheMaxSize || 500;

        // Embedding service (optional, falls back to simple BOW)
        this.embeddingService = options.embeddingService || null;

        // Statistics
        this.stats = {
            totalEvaluations: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Compute all Text2KGBench metrics
     * @param {Object} extractionResult - Result from extraction pipeline
     * @param {string} sourceText - Original source text
     * @param {Object} ontology - Ontology schema for conformance checking
     * @param {Object} referenceGraph - Reference graph for comparison (optional)
     * @returns {Promise<MetricsReport>} Complete metrics report
     */
    async computeAll(extractionResult, sourceText, ontology, referenceGraph = null) {
        const startTime = Date.now();
        this.stats.totalEvaluations++;

        // Normalize input
        const { entities, relations, triples } = this._normalizeInput(extractionResult);

        // Compute all metrics in parallel where possible
        const [
            hallucinationMetrics,
            ontologyMetrics,
            faithfulnessMetrics
        ] = await Promise.all([
            this.computeHallucinationRate(triples, sourceText),
            this.computeOntologyConformance(triples, ontology),
            this.computeFaithfulness(triples, sourceText)
        ]);

        // Reference-dependent metrics
        let entityMetrics = null;
        let relationMetrics = null;
        let gedMetrics = null;

        if (referenceGraph) {
            [entityMetrics, relationMetrics, gedMetrics] = await Promise.all([
                this.computeEntityMetrics(entities, referenceGraph.entities),
                this.computeRelationMetrics(relations, referenceGraph.relations),
                this.computeGED(extractionResult, referenceGraph)
            ]);
        }

        const duration = Date.now() - startTime;

        // Build summary
        const summary = this._computeSummary({
            hallucinationMetrics,
            ontologyMetrics,
            faithfulnessMetrics,
            entityMetrics,
            relationMetrics,
            gedMetrics
        });

        return {
            timestamp: new Date().toISOString(),
            duration,
            metrics: {
                hallucination: hallucinationMetrics,
                ontologyConformance: ontologyMetrics,
                faithfulness: faithfulnessMetrics,
                entity: entityMetrics,
                relation: relationMetrics,
                graphEditDistance: gedMetrics
            },
            summary,
            config: this.options,
            stats: {
                entitiesExtracted: entities.length,
                relationsExtracted: relations.length,
                triplesEvaluated: triples.length,
                hasReference: !!referenceGraph
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HALLUCINATION RATE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compute hallucination rate - % of triples not grounded in source text
     * Method: verbalize triple -> embed -> compare similarity with source
     * @param {Array} triples - Extracted triples
     * @param {string} sourceText - Original source text
     * @returns {Promise<Object>} Hallucination metrics
     */
    async computeHallucinationRate(triples, sourceText) {
        if (!triples || triples.length === 0) {
            return {
                rate: 0,
                hallucinated: 0,
                grounded: 0,
                total: 0,
                details: []
            };
        }

        const sourceEmbedding = await this._getEmbedding(sourceText);
        const details = [];
        let hallucinatedCount = 0;

        for (const triple of triples) {
            // Verbalize the triple
            const verbalized = this._verbalizeTriple(triple);

            // Get embedding
            const tripleEmbedding = await this._getEmbedding(verbalized);

            // Compute similarity
            const similarity = this._cosineSimilarity(tripleEmbedding, sourceEmbedding);

            // Check if grounded
            const isHallucinated = similarity < this.options.faithfulnessThreshold;

            if (isHallucinated) {
                hallucinatedCount++;
                details.push({
                    triple: verbalized,
                    similarity: Math.round(similarity * 1000) / 1000,
                    subject: this._getEntityName(triple.subject),
                    predicate: triple.predicate || triple.relation,
                    object: this._getEntityName(triple.object)
                });
            }
        }

        return {
            rate: hallucinatedCount / triples.length,
            hallucinated: hallucinatedCount,
            grounded: triples.length - hallucinatedCount,
            total: triples.length,
            threshold: this.options.faithfulnessThreshold,
            // Only return hallucinated details for brevity
            details: details.slice(0, 10)
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ONTOLOGY CONFORMANCE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compute ontology conformance - % of triples conforming to schema
     * @param {Array} triples - Extracted triples
     * @param {Object} ontology - Ontology schema
     * @returns {Object} Conformance metrics
     */
    computeOntologyConformance(triples, ontology) {
        if (!triples || triples.length === 0) {
            return {
                conformanceRate: 1,
                conforming: 0,
                nonConforming: 0,
                total: 0,
                violations: []
            };
        }

        if (!ontology) {
            return {
                conformanceRate: null,
                message: 'No ontology provided for conformance checking'
            };
        }

        const violations = [];
        let conformingCount = 0;

        for (const triple of triples) {
            const result = this._validateTripleAgainstOntology(triple, ontology);

            if (result.valid) {
                conformingCount++;
            } else {
                violations.push({
                    triple: this._verbalizeTriple(triple),
                    errors: result.errors,
                    warnings: result.warnings
                });
            }
        }

        return {
            conformanceRate: conformingCount / triples.length,
            conforming: conformingCount,
            nonConforming: triples.length - conformingCount,
            total: triples.length,
            violations: violations.slice(0, 10) // Limit for brevity
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FAITHFULNESS SCORE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compute faithfulness score - semantic similarity with source
     * @param {Array} triples - Extracted triples
     * @param {string} sourceText - Source text
     * @returns {Promise<Object>} Faithfulness metrics
     */
    async computeFaithfulness(triples, sourceText) {
        if (!triples || triples.length === 0) {
            return {
                score: 0,
                min: 0,
                max: 0,
                distribution: {}
            };
        }

        const sourceEmbedding = await this._getEmbedding(sourceText);
        const scores = [];

        for (const triple of triples) {
            const verbalized = this._verbalizeTriple(triple);
            const tripleEmbedding = await this._getEmbedding(verbalized);
            const similarity = this._cosineSimilarity(tripleEmbedding, sourceEmbedding);
            scores.push(similarity);
        }

        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);

        return {
            score: Math.round(avgScore * 1000) / 1000,
            min: Math.round(minScore * 1000) / 1000,
            max: Math.round(maxScore * 1000) / 1000,
            distribution: this._computeDistribution(scores),
            threshold: this.options.faithfulnessThreshold
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY METRICS (P/R/F1)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compute entity precision, recall, F1
     * @param {Array} extractedEntities - Extracted entities
     * @param {Array} referenceEntities - Reference entities
     * @returns {Object} Entity metrics
     */
    computeEntityMetrics(extractedEntities, referenceEntities) {
        if (!referenceEntities || referenceEntities.length === 0) {
            return {
                precision: null,
                recall: null,
                f1: null,
                message: 'No reference entities provided'
            };
        }

        const extracted = new Set(
            (extractedEntities || []).map(e => this._normalizeEntityName(e))
        );
        const reference = new Set(
            referenceEntities.map(e => this._normalizeEntityName(e))
        );

        const truePositives = [...extracted].filter(e => reference.has(e)).length;
        const falsePositives = extracted.size - truePositives;
        const falseNegatives = reference.size - truePositives;

        const precision = extracted.size > 0 ? truePositives / extracted.size : 0;
        const recall = reference.size > 0 ? truePositives / reference.size : 0;
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

        return {
            precision: Math.round(precision * 1000) / 1000,
            recall: Math.round(recall * 1000) / 1000,
            f1: Math.round(f1 * 1000) / 1000,
            truePositives,
            falsePositives,
            falseNegatives,
            extractedCount: extracted.size,
            referenceCount: reference.size,
            // Details for debugging (limited)
            missed: [...reference].filter(e => !extracted.has(e)).slice(0, 5),
            extra: [...extracted].filter(e => !reference.has(e)).slice(0, 5)
        };
    }

    /**
     * Compute semantic entity metrics using embeddings for fuzzy matching
     * @param {Array} extractedEntities - Extracted entities
     * @param {Array} referenceEntities - Reference entities
     * @param {number} threshold - Similarity threshold for matching
     * @returns {Promise<Object>} Semantic entity metrics
     */
    async computeSemanticEntityMetrics(extractedEntities, referenceEntities, threshold = 0.85) {
        if (!this.options.useSemanticMatching) {
            return this.computeEntityMetrics(extractedEntities, referenceEntities);
        }

        if (!referenceEntities || referenceEntities.length === 0) {
            return {
                precision: null,
                recall: null,
                f1: null,
                message: 'No reference entities provided'
            };
        }

        // Get embeddings for all entities
        const extractedTexts = (extractedEntities || []).map(e => this._getEntityText(e));
        const referenceTexts = referenceEntities.map(e => this._getEntityText(e));

        const extractedEmbeddings = await Promise.all(
            extractedTexts.map(t => this._getEmbedding(t))
        );
        const referenceEmbeddings = await Promise.all(
            referenceTexts.map(t => this._getEmbedding(t))
        );

        // Find best matches
        let truePositives = 0;
        const matched = new Set();

        for (let i = 0; i < extractedEmbeddings.length; i++) {
            let bestMatch = -1;
            let bestScore = 0;

            for (let j = 0; j < referenceEmbeddings.length; j++) {
                if (matched.has(j)) continue;

                const score = this._cosineSimilarity(extractedEmbeddings[i], referenceEmbeddings[j]);
                if (score > bestScore && score >= threshold) {
                    bestScore = score;
                    bestMatch = j;
                }
            }

            if (bestMatch >= 0) {
                truePositives++;
                matched.add(bestMatch);
            }
        }

        const precision = extractedEntities.length > 0 ? truePositives / extractedEntities.length : 0;
        const recall = referenceEntities.length > 0 ? truePositives / referenceEntities.length : 0;
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

        return {
            precision: Math.round(precision * 1000) / 1000,
            recall: Math.round(recall * 1000) / 1000,
            f1: Math.round(f1 * 1000) / 1000,
            truePositives,
            matchingMethod: 'semantic',
            threshold
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RELATION METRICS (P/R/F1)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compute relation precision, recall, F1
     * @param {Array} extractedRelations - Extracted relations
     * @param {Array} referenceRelations - Reference relations
     * @returns {Object} Relation metrics
     */
    computeRelationMetrics(extractedRelations, referenceRelations) {
        if (!referenceRelations || referenceRelations.length === 0) {
            return {
                precision: null,
                recall: null,
                f1: null,
                message: 'No reference relations provided'
            };
        }

        const extracted = new Set(
            (extractedRelations || []).map(r => this._normalizeRelation(r))
        );
        const reference = new Set(
            referenceRelations.map(r => this._normalizeRelation(r))
        );

        const truePositives = [...extracted].filter(r => reference.has(r)).length;
        const falsePositives = extracted.size - truePositives;
        const falseNegatives = reference.size - truePositives;

        const precision = extracted.size > 0 ? truePositives / extracted.size : 0;
        const recall = reference.size > 0 ? truePositives / reference.size : 0;
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

        return {
            precision: Math.round(precision * 1000) / 1000,
            recall: Math.round(recall * 1000) / 1000,
            f1: Math.round(f1 * 1000) / 1000,
            truePositives,
            falsePositives,
            falseNegatives,
            extractedCount: extracted.size,
            referenceCount: reference.size
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GRAPH EDIT DISTANCE (GED)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Compute Graph Edit Distance - structural similarity
     * Simplified version: node/edge additions + deletions
     * @param {Object} extractedGraph - Extracted graph
     * @param {Object} referenceGraph - Reference graph
     * @returns {Object} GED metrics
     */
    computeGED(extractedGraph, referenceGraph) {
        // Normalize nodes
        const extractedNodes = new Set(
            (extractedGraph.entities || extractedGraph.nodes || [])
                .map(n => this._normalizeEntityName(n))
        );
        const referenceNodes = new Set(
            (referenceGraph.entities || referenceGraph.nodes || [])
                .map(n => this._normalizeEntityName(n))
        );

        // Normalize edges
        const extractedEdges = new Set(
            (extractedGraph.relations || extractedGraph.edges || [])
                .map(e => this._normalizeRelation(e))
        );
        const referenceEdges = new Set(
            (referenceGraph.relations || referenceGraph.edges || [])
                .map(e => this._normalizeRelation(e))
        );

        // Node operations
        const nodeAdditions = [...extractedNodes].filter(n => !referenceNodes.has(n)).length;
        const nodeDeletions = [...referenceNodes].filter(n => !extractedNodes.has(n)).length;

        // Edge operations
        const edgeAdditions = [...extractedEdges].filter(e => !referenceEdges.has(e)).length;
        const edgeDeletions = [...referenceEdges].filter(e => !extractedEdges.has(e)).length;

        const totalOperations = nodeAdditions + nodeDeletions + edgeAdditions + edgeDeletions;
        const maxOperations = extractedNodes.size + referenceNodes.size +
                              extractedEdges.size + referenceEdges.size;

        // Normalized GED (0 = identical, 1 = completely different)
        const normalizedGED = maxOperations > 0 ? totalOperations / maxOperations : 0;

        // Similarity (inverse of GED)
        const similarity = 1 - normalizedGED;

        return {
            distance: totalOperations,
            normalizedDistance: Math.round(normalizedGED * 1000) / 1000,
            similarity: Math.round(similarity * 1000) / 1000,
            operations: {
                nodeAdditions,
                nodeDeletions,
                edgeAdditions,
                edgeDeletions
            },
            sizes: {
                extractedNodes: extractedNodes.size,
                referenceNodes: referenceNodes.size,
                extractedEdges: extractedEdges.size,
                referenceEdges: referenceEdges.size
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Normalize extraction result into standard format
     * @private
     */
    _normalizeInput(extractionResult) {
        let entities = [];
        let relations = [];
        let triples = [];

        if (extractionResult.entities) {
            entities = extractionResult.entities;
        }

        if (extractionResult.relations) {
            relations = extractionResult.relations;
        }

        if (extractionResult.triples) {
            triples = extractionResult.triples;
        } else if (relations.length > 0) {
            // Convert relations to triples format
            triples = relations.map(r => ({
                subject: r.subject || r.source,
                predicate: r.predicate || r.relation || r.type,
                object: r.object || r.target
            }));
        }

        return { entities, relations, triples };
    }

    /**
     * Verbalize a triple into natural language
     * @private
     */
    _verbalizeTriple(triple) {
        const subject = this._getEntityName(triple.subject);
        const object = this._getEntityName(triple.object);
        const predicate = triple.predicate || triple.relation || 'relates to';

        return `${subject} ${predicate.replace(/_/g, ' ')} ${object}`;
    }

    /**
     * Get entity name from entity object or string
     * @private
     */
    _getEntityName(entity) {
        if (!entity) return '';
        if (typeof entity === 'string') return entity;
        return entity.name || entity.label || entity.id || '';
    }

    /**
     * Get entity text for embedding
     * @private
     */
    _getEntityText(entity) {
        if (typeof entity === 'string') return entity;
        // Combine name and type for better semantic matching
        const name = entity.name || entity.label || entity.id || '';
        const type = entity.type || '';
        return type ? `${name} (${type})` : name;
    }

    /**
     * Normalize entity name for comparison
     * @private
     */
    _normalizeEntityName(entity) {
        const name = this._getEntityName(entity);
        return name.toLowerCase().trim().replace(/\s+/g, '_');
    }

    /**
     * Normalize relation for comparison
     * @private
     */
    _normalizeRelation(relation) {
        const subject = this._normalizeEntityName(relation.subject || relation.source);
        const predicate = (relation.predicate || relation.relation || relation.type || '')
            .toLowerCase().replace(/\s+/g, '_');
        const object = this._normalizeEntityName(relation.object || relation.target);
        return `${subject}|${predicate}|${object}`;
    }

    /**
     * Validate triple against ontology schema
     * @private
     */
    _validateTripleAgainstOntology(triple, ontology) {
        const errors = [];
        const warnings = [];

        const subjectType = typeof triple.subject === 'object' ? triple.subject.type : null;
        const objectType = typeof triple.object === 'object' ? triple.object.type : null;
        const predicate = triple.predicate || triple.relation;

        // Check entity types
        if (ontology.entityTypes) {
            if (subjectType && !ontology.entityTypes.includes(subjectType)) {
                warnings.push(`Unknown subject type: ${subjectType}`);
            }
            if (objectType && !ontology.entityTypes.includes(objectType)) {
                warnings.push(`Unknown object type: ${objectType}`);
            }
        }

        // Check relation type
        if (ontology.relationTypes) {
            if (predicate && !ontology.relationTypes.includes(predicate)) {
                errors.push(`Unknown relation type: ${predicate}`);
            }
        }

        // Check domain/range constraints
        if (ontology.constraints && predicate) {
            const constraint = ontology.constraints[predicate];

            if (constraint) {
                if (subjectType && constraint.domain &&
                    !constraint.domain.includes('*') &&
                    !constraint.domain.includes(subjectType)) {
                    errors.push(`Domain violation: ${subjectType} cannot be subject of ${predicate}`);
                }

                if (objectType && constraint.range &&
                    !constraint.range.includes('*') &&
                    !constraint.range.includes(objectType)) {
                    errors.push(`Range violation: ${objectType} cannot be object of ${predicate}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get embedding for text (with caching)
     * @private
     */
    async _getEmbedding(text) {
        if (!text) return new Array(128).fill(0);

        const cacheKey = text.slice(0, 200);

        if (this.embeddingCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.embeddingCache.get(cacheKey);
        }

        this.stats.cacheMisses++;
        let embedding;

        // Try embedding service first
        if (this.embeddingService) {
            try {
                embedding = await this.embeddingService.embed(text);
            } catch (error) {
                logger.warn('[Text2KGMetrics] Embedding service failed, using fallback:', error.message);
            }
        }

        // Fallback to simple BOW
        if (!embedding && this.options.embeddingFallback) {
            embedding = this._simpleBOWEmbedding(text);
        }

        // Cache the result
        if (embedding && this.embeddingCache.size < this.cacheMaxSize) {
            this.embeddingCache.set(cacheKey, embedding);
        }

        return embedding || new Array(128).fill(0);
    }

    /**
     * Simple bag-of-words embedding fallback
     * @private
     */
    _simpleBOWEmbedding(text) {
        const words = text.toLowerCase().split(/\s+/);
        const vector = new Array(128).fill(0);

        for (const word of words) {
            const hash = this._simpleHash(word) % 128;
            vector[hash] += 1;
        }

        // Normalize
        const norm = Math.sqrt(vector.reduce((a, b) => a + b * b, 0));
        return norm > 0 ? vector.map(v => v / norm) : vector;
    }

    /**
     * Simple hash function for BOW
     * @private
     */
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    /**
     * Cosine similarity between two vectors
     * @private
     */
    _cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
        return denominator > 0 ? dotProduct / denominator : 0;
    }

    /**
     * Compute score distribution buckets
     * @private
     */
    _computeDistribution(scores) {
        const buckets = {
            'excellent (>0.9)': 0,
            'good (0.7-0.9)': 0,
            'fair (0.5-0.7)': 0,
            'poor (<0.5)': 0
        };

        for (const score of scores) {
            if (score > 0.9) buckets['excellent (>0.9)']++;
            else if (score > 0.7) buckets['good (0.7-0.9)']++;
            else if (score > 0.5) buckets['fair (0.5-0.7)']++;
            else buckets['poor (<0.5)']++;
        }

        return buckets;
    }

    /**
     * Compute summary score from all metrics
     * @private
     */
    _computeSummary(metrics) {
        const components = [];
        let totalWeight = 0;
        let weightedSum = 0;

        // Hallucination (inverted - lower is better)
        if (metrics.hallucinationMetrics?.rate !== undefined) {
            const score = 1 - metrics.hallucinationMetrics.rate;
            components.push({
                name: 'hallucination',
                score: Math.round(score * 1000) / 1000,
                weight: METRIC_WEIGHTS.hallucination
            });
            weightedSum += score * METRIC_WEIGHTS.hallucination;
            totalWeight += METRIC_WEIGHTS.hallucination;
        }

        // Ontology conformance
        if (metrics.ontologyMetrics?.conformanceRate !== undefined) {
            const score = metrics.ontologyMetrics.conformanceRate;
            components.push({
                name: 'ontologyConformance',
                score: Math.round(score * 1000) / 1000,
                weight: METRIC_WEIGHTS.ontologyConformance
            });
            weightedSum += score * METRIC_WEIGHTS.ontologyConformance;
            totalWeight += METRIC_WEIGHTS.ontologyConformance;
        }

        // Faithfulness
        if (metrics.faithfulnessMetrics?.score !== undefined) {
            const score = metrics.faithfulnessMetrics.score;
            components.push({
                name: 'faithfulness',
                score: Math.round(score * 1000) / 1000,
                weight: METRIC_WEIGHTS.faithfulness
            });
            weightedSum += score * METRIC_WEIGHTS.faithfulness;
            totalWeight += METRIC_WEIGHTS.faithfulness;
        }

        // Entity F1
        if (metrics.entityMetrics?.f1 !== undefined && metrics.entityMetrics.f1 !== null) {
            const score = metrics.entityMetrics.f1;
            components.push({
                name: 'entityF1',
                score: Math.round(score * 1000) / 1000,
                weight: METRIC_WEIGHTS.entityF1
            });
            weightedSum += score * METRIC_WEIGHTS.entityF1;
            totalWeight += METRIC_WEIGHTS.entityF1;
        }

        // Relation F1
        if (metrics.relationMetrics?.f1 !== undefined && metrics.relationMetrics.f1 !== null) {
            const score = metrics.relationMetrics.f1;
            components.push({
                name: 'relationF1',
                score: Math.round(score * 1000) / 1000,
                weight: METRIC_WEIGHTS.relationF1
            });
            weightedSum += score * METRIC_WEIGHTS.relationF1;
            totalWeight += METRIC_WEIGHTS.relationF1;
        }

        // GED similarity
        if (metrics.gedMetrics?.similarity !== undefined) {
            const score = metrics.gedMetrics.similarity;
            components.push({
                name: 'gedSimilarity',
                score: Math.round(score * 1000) / 1000,
                weight: METRIC_WEIGHTS.gedSimilarity
            });
            weightedSum += score * METRIC_WEIGHTS.gedSimilarity;
            totalWeight += METRIC_WEIGHTS.gedSimilarity;
        }

        const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

        return {
            overallScore: Math.round(overallScore * 1000) / 1000,
            grade: this._scoreToGrade(overallScore),
            components,
            weightsUsed: totalWeight
        };
    }

    /**
     * Convert score to letter grade
     * @private
     */
    _scoreToGrade(score) {
        for (const { min, grade } of GRADE_THRESHOLDS) {
            if (score >= min) return grade;
        }
        return 'F';
    }

    /**
     * Clear embedding cache
     */
    clearCache() {
        this.embeddingCache.clear();
    }

    /**
     * Get metrics statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.embeddingCache.size,
            cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
                ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100).toFixed(1) + '%'
                : '0%'
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY AND EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Text2KGMetrics instance
 * @param {Object} options - Configuration options
 * @returns {Text2KGMetrics}
 */
function createText2KGMetrics(options = {}) {
    return new Text2KGMetrics(options);
}

// Singleton instance
const text2kgMetrics = new Text2KGMetrics();

module.exports = {
    Text2KGMetrics,
    createText2KGMetrics,
    text2kgMetrics,
    METRIC_WEIGHTS,
    GRADE_THRESHOLDS
};
