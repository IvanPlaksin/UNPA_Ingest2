/**
 * @fileoverview Entity Resolution Service for Knowledge Graph Pipeline
 * @module services/extraction/EntityResolver
 * @version 1.0.0
 *
 * Resolves extracted entities against existing entities in the knowledge graph
 * using vector similarity search (Qdrant) and fuzzy matching.
 */

'use strict';

const qdrantService = require('../qdrant.service');
const { getGraphStorageService } = require('../graph/GraphStorageService');
const { getProvenanceService } = require('../provenance.service');
const { LIFECYCLE_STATES } = require('../../types/provenance.types');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default resolution configuration
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  // Similarity thresholds
  exactMatchThreshold: 0.95,      // Above this = exact match, auto-merge
  highSimilarityThreshold: 0.85,  // Above this = likely same entity
  lowSimilarityThreshold: 0.70,   // Below this = different entity

  // Search limits
  maxCandidates: 10,              // Max candidates to consider
  minConfidenceForMerge: 0.80,    // Min confidence to auto-merge

  // Entity collection name in Qdrant
  entityCollectionName: 'kg_entities',

  // Vector dimension
  vectorSize: 1024
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY RESOLVER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service for resolving entities and deduplication
 * @class
 */
class EntityResolver {
  /**
   * Create EntityResolver instance
   * @param {Object} [config={}] - Configuration options
   * @param {Object} [embeddingService=null] - Embedding service for vector generation
   */
  constructor(config = {}, embeddingService = null) {
    /** @type {Object} */
    this.config = { ...DEFAULT_CONFIG, ...config };

    /** @type {Object|null} */
    this.embeddingService = embeddingService;

    /** @type {GraphStorageService} */
    this.graphStorage = getGraphStorageService();

    /** @type {ProvenanceService} */
    this.provenanceService = getProvenanceService();

    /** @type {boolean} */
    this.initialized = false;
  }

  /**
   * Set embedding service (for dependency injection)
   * @param {Object} service - Embedding service with generateEmbedding method
   */
  setEmbeddingService(service) {
    this.embeddingService = service;
  }

  /**
   * Initialize entity collection in Qdrant
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await qdrantService.initCollectionForNamespace(this.config.entityCollectionName);
      this.initialized = true;
      console.log('[EntityResolver] Initialized entity collection');
    } catch (error) {
      console.error('[EntityResolver] Failed to initialize:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RESOLUTION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve a single entity against existing entities
   * @param {EntityWithProvenance} entity - Entity to resolve
   * @param {Object} [options={}] - Resolution options
   * @returns {Promise<EntityResolutionResult>}
   */
  async resolveEntity(entity, options = {}) {
    const { namespace = null, autoMerge = true } = options;

    // Step 1: Check exact match by normalized form
    const exactMatch = await this.findExactMatch(entity, namespace);
    if (exactMatch) {
      if (autoMerge) {
        await this.mergeIntoExisting(entity, exactMatch);
      }
      return {
        action: 'merged',
        entityId: exactMatch.id,
        mergedWithId: exactMatch.id,
        similarityScore: 1.0,
        reason: 'Exact normalized form match'
      };
    }

    // Step 2: Vector similarity search
    if (entity.embedding && entity.embedding.length > 0) {
      const candidates = await this.findSimilarByVector(entity, namespace);

      for (const candidate of candidates) {
        if (candidate.score >= this.config.exactMatchThreshold) {
          // High confidence match
          if (autoMerge) {
            await this.mergeIntoExisting(entity, candidate.entity);
          }
          return {
            action: 'merged',
            entityId: candidate.entity.id,
            mergedWithId: candidate.entity.id,
            similarityScore: candidate.score,
            reason: `High vector similarity (${(candidate.score * 100).toFixed(1)}%)`
          };
        }

        if (candidate.score >= this.config.highSimilarityThreshold) {
          // Likely match - needs validation
          const isMatch = await this.validateMatch(entity, candidate.entity);
          if (isMatch && autoMerge) {
            await this.mergeIntoExisting(entity, candidate.entity);
            return {
              action: 'merged',
              entityId: candidate.entity.id,
              mergedWithId: candidate.entity.id,
              similarityScore: candidate.score,
              reason: `Validated vector similarity (${(candidate.score * 100).toFixed(1)}%)`
            };
          }
        }
      }
    }

    // Step 3: Fuzzy name matching in graph
    const fuzzyMatches = await this.findFuzzyMatches(entity, namespace);
    for (const match of fuzzyMatches) {
      if (match.confidence >= this.config.minConfidenceForMerge) {
        const isMatch = await this.validateMatch(entity, match.entity);
        if (isMatch && autoMerge) {
          await this.mergeIntoExisting(entity, match.entity);
          return {
            action: 'merged',
            entityId: match.entity.id,
            mergedWithId: match.entity.id,
            similarityScore: match.confidence,
            reason: `Fuzzy name match (${(match.confidence * 100).toFixed(1)}%)`
          };
        }
      }
    }

    // Step 4: No match found - create new entity
    return {
      action: 'created',
      entityId: entity.id,
      mergedWithId: null,
      similarityScore: 0,
      reason: 'No matching entity found'
    };
  }

  /**
   * Resolve multiple entities in batch
   * @param {EntityWithProvenance[]} entities - Entities to resolve
   * @param {Object} [options={}] - Resolution options
   * @returns {Promise<EntityResolutionResult[]>}
   */
  async resolveEntities(entities, options = {}) {
    const results = [];
    const stats = { created: 0, merged: 0, skipped: 0 };

    for (const entity of entities) {
      try {
        const result = await this.resolveEntity(entity, options);
        results.push(result);

        if (result.action === 'created') stats.created++;
        else if (result.action === 'merged') stats.merged++;
        else stats.skipped++;
      } catch (error) {
        console.error(`[EntityResolver] Error resolving entity ${entity.name}:`, error);
        results.push({
          action: 'skipped',
          entityId: entity.id,
          mergedWithId: null,
          similarityScore: 0,
          reason: `Error: ${error.message}`
        });
        stats.skipped++;
      }
    }

    console.log(`[EntityResolver] Resolved ${entities.length} entities:`, stats);
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find exact match by normalized form
   * @param {EntityWithProvenance} entity
   * @param {string} [namespace]
   * @returns {Promise<Object|null>}
   */
  async findExactMatch(entity, namespace = null) {
    const normalizedForm = (entity.normalizedForm || entity.name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    return await this.graphStorage.findExistingEntity(
      normalizedForm,
      entity.type,
      namespace
    );
  }

  /**
   * Find similar entities by vector similarity
   * @param {EntityWithProvenance} entity
   * @param {string} [namespace]
   * @returns {Promise<Array<{entity: Object, score: number}>>}
   */
  async findSimilarByVector(entity, namespace = null) {
    if (!entity.embedding || entity.embedding.length === 0) {
      return [];
    }

    try {
      // Build filter for entity type
      const filter = {
        must: [
          {
            key: 'type',
            match: { value: entity.type }
          },
          {
            key: 'lifecycleState',
            match: { value: LIFECYCLE_STATES.ACTIVE }
          }
        ]
      };

      if (namespace) {
        filter.must.push({
          key: 'fullNamespace',
          match: { value: namespace }
        });
      }

      const results = await qdrantService.searchSimilar(
        entity.embedding,
        this.config.maxCandidates,
        filter,
        this.config.entityCollectionName
      );

      return results
        .filter(r => r.score >= this.config.lowSimilarityThreshold)
        .map(r => ({
          entity: r.payload,
          score: r.score
        }));
    } catch (error) {
      console.error('[EntityResolver] Vector search error:', error);
      return [];
    }
  }

  /**
   * Find fuzzy matches by name
   * @param {EntityWithProvenance} entity
   * @param {string} [namespace]
   * @returns {Promise<Array<{entity: Object, confidence: number}>>}
   */
  async findFuzzyMatches(entity, namespace = null) {
    try {
      const matches = await this.graphStorage.findSimilarEntities(
        entity.name,
        entity.type,
        this.config.maxCandidates
      );

      return matches.map(match => ({
        entity: match,
        confidence: this.calculateNameSimilarity(entity.name, match.name)
      })).filter(m => m.confidence >= this.config.lowSimilarityThreshold);
    } catch (error) {
      console.error('[EntityResolver] Fuzzy search error:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MERGE & STORAGE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Merge new entity into existing one
   * @param {EntityWithProvenance} newEntity
   * @param {Object} existingEntity
   * @returns {Promise<void>}
   */
  async mergeIntoExisting(newEntity, existingEntity) {
    // Safely extract confidence from provenance or entity itself
    const newConfidence = newEntity.provenance?.confidence ?? newEntity.confidence ?? 0;
    const existingConfidence = existingEntity.confidence ?? 0;
    const crypto = require('crypto');

    // Helper to generate sourceHash
    const generateSourceHash = (content) => {
      return crypto.createHash('sha256').update(content || `merge-${Date.now()}`).digest('hex').substring(0, 16);
    };

    // Build complete provenance object with all required fields
    const existingProv = newEntity.provenance || {};
    const provenance = {
      extractionRound: existingProv.extractionRound || this.provenanceService.getCurrentRound() || 1,
      confidence: newConfidence,
      extractedAt: existingProv.extractedAt || new Date(),
      sourceHash: existingProv.sourceHash || generateSourceHash(newEntity.name + existingEntity.id),
      sourceType: existingProv.sourceType || 'DOCUMENT',
      extractorType: existingProv.extractorType || 'hybrid',
      sourceId: existingProv.sourceId || '',
      extractorVersion: existingProv.extractorVersion || '1.0.0'
    };

    // Update provenance on existing entity
    await this.graphStorage.updateEntityWithProvenance(
      existingEntity.id,
      {
        // Keep higher confidence
        confidence: Math.max(existingConfidence, newConfidence)
      },
      provenance
    );

    // Update round statistics
    const currentRound = this.provenanceService.getCurrentRound();
    const round = this.provenanceService.getRound(currentRound);
    if (round) {
      round.entitiesMerged = (round.entitiesMerged || 0) + 1;
    }
  }

  /**
   * Store new entity in graph and vector store
   * @param {EntityWithProvenance} entity
   * @param {Object} [options={}]
   * @returns {Promise<GraphStorageResult>}
   */
  async storeNewEntity(entity, options = {}) {
    // Store in graph
    const graphResult = await this.graphStorage.saveEntityWithProvenance(entity, options);

    // Store embedding in Qdrant if available
    if (entity.embedding && entity.embedding.length > 0) {
      try {
        await qdrantService.upsertPoints([{
          id: entity.id,
          vector: entity.embedding,
          payload: {
            id: entity.id,
            name: entity.name,
            normalizedForm: entity.normalizedForm,
            type: entity.type,
            lifecycleState: LIFECYCLE_STATES.ACTIVE,
            extractionRound: entity.provenance?.extractionRound ?? this.provenanceService.getCurrentRound(),
            confidence: entity.provenance?.confidence ?? entity.confidence ?? 0,
            ...(options.namespace && { fullNamespace: options.namespace })
          }
        }], this.config.entityCollectionName);
      } catch (error) {
        console.error('[EntityResolver] Failed to store entity embedding:', error);
        // Continue - graph storage succeeded
      }
    }

    // Update round statistics
    const currentRound = this.provenanceService.getCurrentRound();
    const round = this.provenanceService.getRound(currentRound);
    if (round) {
      round.entitiesNew = (round.entitiesNew || 0) + 1;
    }

    return graphResult;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION & SIMILARITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate if two entities should be merged
   * @param {EntityWithProvenance} entity1
   * @param {Object} entity2
   * @returns {Promise<boolean>}
   */
  async validateMatch(entity1, entity2) {
    // Same type check
    if (entity1.type !== entity2.type) {
      return false;
    }

    // Name similarity check
    const nameSimilarity = this.calculateNameSimilarity(entity1.name, entity2.name);
    if (nameSimilarity < this.config.lowSimilarityThreshold) {
      return false;
    }

    // Context overlap check (if available)
    if (entity1.provenance?.extractionContext && entity2.extractionContext) {
      const contextOverlap = this.calculateContextOverlap(
        entity1.provenance.extractionContext,
        entity2.extractionContext
      );
      if (contextOverlap < 0.3) {
        return false; // Very different contexts
      }
    }

    return true;
  }

  /**
   * Calculate similarity between two names
   * @param {string} name1
   * @param {string} name2
   * @returns {number} Similarity score 0-1
   */
  calculateNameSimilarity(name1, name2) {
    const norm1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (norm1 === norm2) return 1.0;

    // Levenshtein distance based similarity
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLen = Math.max(norm1.length, norm2.length);

    if (maxLen === 0) return 1.0;

    return 1 - (distance / maxLen);
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} s1
   * @param {string} s2
   * @returns {number}
   */
  levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return dp[m][n];
  }

  /**
   * Calculate overlap between context snippets
   * @param {string[]} context1
   * @param {string[]} context2
   * @returns {number} Overlap score 0-1
   */
  calculateContextOverlap(context1, context2) {
    if (!context1 || !context2 || context1.length === 0 || context2.length === 0) {
      return 0;
    }

    const words1 = new Set(context1.join(' ').toLowerCase().split(/\W+/));
    const words2 = new Set(context2.join(' ').toLowerCase().split(/\W+/));

    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;

    return union > 0 ? intersection / union : 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMBEDDING GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate embedding for entity
   * @param {EntityWithProvenance} entity
   * @returns {Promise<number[]|null>}
   */
  async generateEntityEmbedding(entity) {
    if (!this.embeddingService) {
      console.warn('[EntityResolver] No embedding service configured');
      return null;
    }

    try {
      // Create text representation for embedding
      const text = this.createEntityText(entity);
      const embedding = await this.embeddingService.generateEmbedding(text);
      return embedding;
    } catch (error) {
      console.error('[EntityResolver] Embedding generation failed:', error);
      return null;
    }
  }

  /**
   * Create text representation of entity for embedding
   * @param {EntityWithProvenance} entity
   * @returns {string}
   */
  createEntityText(entity) {
    const parts = [
      entity.name,
      entity.type,
      entity.normalizedForm || ''
    ];

    // Add context if available
    if (entity.provenance?.extractionContext) {
      parts.push(...entity.provenance.extractionContext.slice(0, 2));
    }

    // Add properties
    if (entity.properties) {
      const propValues = Object.values(entity.properties)
        .filter(v => typeof v === 'string')
        .slice(0, 3);
      parts.push(...propValues);
    }

    return parts.filter(Boolean).join(' ').substring(0, 500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get resolution statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    try {
      const qdrantStats = await qdrantService.getNamespaceStats(this.config.entityCollectionName);
      const graphStats = await this.graphStorage.getGraphStatistics();

      return {
        vectorStore: {
          collection: this.config.entityCollectionName,
          ...qdrantStats
        },
        graph: graphStats,
        config: {
          exactMatchThreshold: this.config.exactMatchThreshold,
          highSimilarityThreshold: this.config.highSimilarityThreshold,
          lowSimilarityThreshold: this.config.lowSimilarityThreshold
        }
      };
    } catch (error) {
      console.error('[EntityResolver] Error getting statistics:', error);
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {EntityResolver} */
let instance = null;

/**
 * Get EntityResolver singleton
 * @param {Object} [config] - Configuration
 * @returns {EntityResolver}
 */
function getEntityResolver(config = {}) {
  if (!instance) {
    instance = new EntityResolver(config);
  }
  return instance;
}

/**
 * Create new EntityResolver instance
 * @param {Object} [config] - Configuration
 * @param {Object} [embeddingService] - Embedding service
 * @returns {EntityResolver}
 */
function createEntityResolver(config = {}, embeddingService = null) {
  return new EntityResolver(config, embeddingService);
}

module.exports = {
  EntityResolver,
  getEntityResolver,
  createEntityResolver,
  DEFAULT_CONFIG
};
