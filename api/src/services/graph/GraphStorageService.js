/**
 * @fileoverview Graph Storage Service for Incremental Knowledge Graph Pipeline
 * @module services/graph/GraphStorageService
 * @version 1.0.0
 *
 * Extends MemgraphService with provenance tracking, entity resolution,
 * and weight management for the incremental knowledge graph construction.
 */

'use strict';

const neo4j = require('neo4j-driver');
const memgraphService = require('../memgraph.service');
const {
  getProvenanceService,
  SOURCE_TYPES,
  WEIGHT_CHANGE_REASONS
} = require('../provenance.service');

const {
  LIFECYCLE_STATES,
  validateProvenance,
  DEFAULT_WEIGHT_CONFIG
} = require('../../types/provenance.types');

/**
 * Helper to convert value to neo4j integer
 * @param {*} value
 * @returns {neo4j.Integer}
 */
function toInt(value) {
  return neo4j.int(parseInt(value, 10) || 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH STORAGE SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service for storing entities and relationships with provenance tracking
 * @class
 */
class GraphStorageService {
  constructor() {
    /** @type {MemgraphService} */
    this.memgraph = memgraphService;

    /** @type {ProvenanceService} */
    this.provenanceService = getProvenanceService();

    /** @type {WeightUpdateConfig} */
    this.weightConfig = { ...DEFAULT_WEIGHT_CONFIG };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save entity with provenance to graph
   * @param {EntityWithProvenance} entity - Entity with provenance
   * @param {Object} [options={}] - Storage options
   * @param {string} [options.namespace] - Namespace context
   * @returns {Promise<GraphStorageResult>}
   */
  async saveEntityWithProvenance(entity, options = {}) {
    // Validate provenance
    const { valid, errors } = validateProvenance(entity.provenance);
    if (!valid) {
      console.error('[GraphStorageService] Invalid provenance:', errors);
      throw new Error(`Invalid provenance: ${errors.join(', ')}`);
    }

    const label = entity.graphLabel || this.getLabelForType(entity.type);
    const now = new Date().toISOString();

    // Prepare properties with provenance
    const properties = {
      id: entity.id,
      name: entity.name,
      normalizedForm: entity.normalizedForm || entity.name.toLowerCase(),
      type: entity.type,
      confidence: entity.provenance.confidence,

      // Provenance fields
      extractionRound: entity.provenance.extractionRound,
      sourceHash: entity.provenance.sourceHash,
      sourceId: entity.provenance.sourceId,
      sourceType: entity.provenance.sourceType,
      extractorType: entity.provenance.extractorType,
      extractorVersion: entity.provenance.extractorVersion,
      extractedAt: entity.provenance.extractedAt.toISOString(),

      // Lifecycle
      lifecycleState: entity.lifecycleState || LIFECYCLE_STATES.ACTIVE,
      createdAt: now,
      updatedAt: now,

      // Additional properties
      ...entity.properties
    };

    // Add optional provenance fields
    if (entity.provenance.sourceCreatedAt) {
      properties.sourceCreatedAt = entity.provenance.sourceCreatedAt.toISOString();
    }
    if (entity.provenance.sourceModifiedAt) {
      properties.sourceModifiedAt = entity.provenance.sourceModifiedAt.toISOString();
    }
    if (entity.provenance.extractorModel) {
      properties.extractorModel = entity.provenance.extractorModel;
    }
    if (entity.mergedFrom && entity.mergedFrom.length > 0) {
      properties.mergedFrom = entity.mergedFrom;
    }

    try {
      await this.memgraph.mergeNode(label, properties, options.namespace ? { fullNamespace: options.namespace } : null);

      return {
        success: true,
        nodeId: entity.id,
        action: 'created',
        provenance: entity.provenance
      };
    } catch (error) {
      console.error('[GraphStorageService] Error saving entity:', error);
      throw error;
    }
  }

  /**
   * Update existing entity with new extraction data
   * @param {string} entityId - Entity ID
   * @param {Object} updateData - Data to update
   * @param {Provenance} provenance - New provenance
   * @returns {Promise<GraphStorageResult>}
   */
  async updateEntityWithProvenance(entityId, updateData, provenance) {
    const session = this.memgraph.driver.session();

    try {
      const now = new Date().toISOString();

      // Safely extract provenance values with defaults
      const confidence = provenance?.confidence ?? updateData?.confidence ?? 0;
      const extractionRound = provenance?.extractionRound ?? 0;
      const sourceHash = provenance?.sourceHash ?? '';

      // Get current state first
      const getQuery = `
        MATCH (n {id: $entityId})
        RETURN n
        LIMIT 1
      `;

      const currentResult = await session.run(getQuery, { entityId });
      const previousState = currentResult.records[0]?.get('n')?.properties;

      // Update with new provenance
      const updateQuery = `
        MATCH (n {id: $entityId})
        SET n.confidence = CASE
              WHEN $confidence > coalesce(n.confidence, 0) THEN $confidence
              ELSE coalesce(n.confidence, 0)
            END,
            n.extractionRound = $extractionRound,
            n.sourceHash = $sourceHash,
            n.lastSeenInRound = $extractionRound,
            n.updatedAt = $updatedAt
        RETURN n
      `;

      await session.run(updateQuery, {
        entityId,
        confidence,
        extractionRound,
        sourceHash,
        updatedAt: now
      });

      return {
        success: true,
        nodeId: entityId,
        action: 'updated',
        provenance,
        previousState
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Merge two entities (entity resolution result)
   * @param {string} sourceId - Entity to merge from
   * @param {string} targetId - Entity to merge into
   * @param {Provenance} provenance - Provenance of merge operation
   * @returns {Promise<GraphStorageResult>}
   */
  async mergeEntities(sourceId, targetId, provenance) {
    const session = this.memgraph.driver.session();

    try {
      const now = new Date().toISOString();

      // Transfer relationships from source to target
      const transferQuery = `
        MATCH (source {id: $sourceId})-[r]->(other)
        MATCH (target {id: $targetId})
        WHERE NOT (target)-[:SAME_AS]-(other)
        CREATE (target)-[newR:MERGED_REL]->(other)
        SET newR = properties(r),
            newR.mergedFromEntity = $sourceId,
            newR.mergedAt = $mergedAt
        RETURN count(newR) as transferred
      `;

      const transferResult = await session.run(transferQuery, {
        sourceId,
        targetId,
        mergedAt: now
      });

      // Mark source as merged
      const markMergedQuery = `
        MATCH (source {id: $sourceId}), (target {id: $targetId})
        SET source.lifecycleState = 'merged',
            source.mergedIntoId = $targetId,
            source.mergedAt = $mergedAt,
            target.mergedFrom = coalesce(target.mergedFrom, []) + [$sourceId],
            target.updatedAt = $mergedAt
        CREATE (source)-[:MERGED_INTO {
          mergedAt: $mergedAt,
          extractionRound: $extractionRound
        }]->(target)
        RETURN source.id, target.id
      `;

      await session.run(markMergedQuery, {
        sourceId,
        targetId,
        mergedAt: now,
        extractionRound: provenance.extractionRound
      });

      const transferred = transferResult.records[0]?.get('transferred')?.toNumber?.() || 0;

      return {
        success: true,
        nodeId: targetId,
        action: 'merged',
        provenance,
        metadata: {
          mergedEntityId: sourceId,
          relationshipsTransferred: transferred
        }
      };
    } finally {
      await session.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIP STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save relationship with provenance and weight history
   * @param {RelationshipWithProvenance} relationship - Relationship with provenance
   * @returns {Promise<Object>}
   */
  async saveRelationshipWithProvenance(relationship) {
    const session = this.memgraph.driver.session();
    const now = new Date().toISOString();

    try {
      // Check if relationship already exists
      const existsQuery = `
        MATCH (a {id: $sourceId})-[r:${relationship.type}]->(b {id: $targetId})
        RETURN r
        LIMIT 1
      `;

      const existsResult = await session.run(existsQuery, {
        sourceId: relationship.sourceId,
        targetId: relationship.targetId
      });

      if (existsResult.records.length > 0) {
        // Update existing relationship
        return await this.updateRelationshipWeight(relationship, WEIGHT_CHANGE_REASONS.REINFORCED);
      }

      // Create new relationship with provenance
      const createQuery = `
        MATCH (a {id: $sourceId}), (b {id: $targetId})
        CREATE (a)-[r:${relationship.type}]->(b)
        SET r.id = $id,
            r.weight = $weight,
            r.confidence = $confidence,
            r.evidence = $evidence,
            r.isInferred = $isInferred,
            r.extractionRound = $extractionRound,
            r.sourceHash = $sourceHash,
            r.extractorType = $extractorType,
            r.weightHistory = $weightHistory,
            r.weightHistoryLimit = $weightHistoryLimit,
            r.totalWeightUpdates = 1,
            r.createdAt = $createdAt,
            r.updatedAt = $createdAt
        RETURN r
      `;

      // Create initial weight history entry
      const initialWeightChange = {
        round: relationship.provenance.extractionRound,
        weight: relationship.weight,
        previousWeight: 0,
        reason: WEIGHT_CHANGE_REASONS.INITIAL,
        timestamp: now
      };

      await session.run(createQuery, {
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        id: relationship.id,
        weight: relationship.weight,
        confidence: relationship.provenance.confidence,
        evidence: JSON.stringify(relationship.evidence || []),
        isInferred: relationship.isInferred || false,
        extractionRound: relationship.provenance.extractionRound,
        sourceHash: relationship.provenance.sourceHash,
        extractorType: relationship.provenance.extractorType,
        weightHistory: JSON.stringify([initialWeightChange]),
        weightHistoryLimit: this.weightConfig.historyLimit,
        createdAt: now
      });

      return {
        success: true,
        relationshipId: relationship.id,
        action: 'created',
        weight: relationship.weight
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Update relationship weight with history tracking
   * @param {RelationshipWithProvenance} relationship - Relationship to update
   * @param {string} reason - Reason for weight change
   * @returns {Promise<Object>}
   */
  async updateRelationshipWeight(relationship, reason) {
    const session = this.memgraph.driver.session();
    const now = new Date().toISOString();

    try {
      // Get current relationship state
      const getQuery = `
        MATCH (a {id: $sourceId})-[r:${relationship.type}]->(b {id: $targetId})
        RETURN r
        LIMIT 1
      `;

      const result = await session.run(getQuery, {
        sourceId: relationship.sourceId,
        targetId: relationship.targetId
      });

      if (result.records.length === 0) {
        throw new Error(`Relationship not found: ${relationship.sourceId} -> ${relationship.targetId}`);
      }

      const currentRel = result.records[0].get('r').properties;
      const currentWeight = currentRel.weight;

      // Calculate new weight based on reason
      let newWeight;
      switch (reason) {
        case WEIGHT_CHANGE_REASONS.REINFORCED:
          newWeight = this.provenanceService.calculateReinforcedWeight(
            currentWeight,
            relationship.provenance.confidence
          );
          break;
        case WEIGHT_CHANGE_REASONS.CONTRADICTED:
          newWeight = this.provenanceService.calculateContradictedWeight(currentWeight);
          break;
        case WEIGHT_CHANGE_REASONS.GNN_INFERRED:
          newWeight = relationship.weight; // Use provided weight
          break;
        default:
          newWeight = Math.max(currentWeight, relationship.weight);
      }

      // Parse current weight history
      let weightHistory = [];
      try {
        weightHistory = JSON.parse(currentRel.weightHistory || '[]');
      } catch (e) {
        weightHistory = [];
      }

      // Add new weight change
      const weightChange = {
        round: relationship.provenance.extractionRound,
        weight: newWeight,
        previousWeight: currentWeight,
        reason,
        timestamp: now,
        sourceHash: relationship.provenance.sourceHash
      };

      weightHistory.push(weightChange);

      // Trim history if needed
      const historyLimit = currentRel.weightHistoryLimit || this.weightConfig.historyLimit;
      while (weightHistory.length > historyLimit) {
        weightHistory.shift();
      }

      // Update relationship
      const updateQuery = `
        MATCH (a {id: $sourceId})-[r:${relationship.type}]->(b {id: $targetId})
        SET r.weight = $newWeight,
            r.confidence = CASE
              WHEN $confidence > r.confidence THEN $confidence
              ELSE r.confidence
            END,
            r.weightHistory = $weightHistory,
            r.totalWeightUpdates = coalesce(r.totalWeightUpdates, 0) + 1,
            r.lastSeenInRound = $extractionRound,
            r.updatedAt = $updatedAt
        RETURN r
      `;

      await session.run(updateQuery, {
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        newWeight,
        confidence: relationship.provenance.confidence,
        weightHistory: JSON.stringify(weightHistory),
        extractionRound: relationship.provenance.extractionRound,
        updatedAt: now
      });

      return {
        success: true,
        relationshipId: relationship.id,
        action: 'updated',
        previousWeight: currentWeight,
        newWeight,
        reason
      };
    } finally {
      await session.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY RESOLUTION (finding existing entities)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find existing entity by normalized form
   * @param {string} normalizedForm - Normalized entity name
   * @param {string} type - Entity type
   * @param {string} [namespace] - Optional namespace filter
   * @returns {Promise<Object|null>}
   */
  async findExistingEntity(normalizedForm, type, namespace = null) {
    const session = this.memgraph.driver.session();

    try {
      let query = `
        MATCH (n {normalizedForm: $normalizedForm, type: $type})
        WHERE n.lifecycleState = 'active' OR n.lifecycleState IS NULL
      `;

      if (namespace) {
        query += ` AND n.fullNamespace = $namespace`;
      }

      query += `
        RETURN n
        ORDER BY n.confidence DESC
        LIMIT 1
      `;

      const result = await session.run(query, {
        normalizedForm: normalizedForm.toLowerCase(),
        type,
        namespace
      });

      if (result.records.length > 0) {
        return result.records[0].get('n').properties;
      }

      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Find similar entities by name (fuzzy matching in graph)
   * @param {string} name - Entity name to search for
   * @param {string} type - Entity type
   * @param {number} [limit=5] - Max results
   * @returns {Promise<Object[]>}
   */
  async findSimilarEntities(name, type, limit = 5) {
    const session = this.memgraph.driver.session();
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
      // Use contains for fuzzy matching (Memgraph doesn't have native fuzzy)
      const query = `
        MATCH (n {type: $type})
        WHERE n.lifecycleState = 'active' OR n.lifecycleState IS NULL
        WITH n, n.normalizedForm as nf
        WHERE nf CONTAINS $searchTerm OR $searchTerm CONTAINS nf
        RETURN n
        ORDER BY n.confidence DESC
        LIMIT $limit
      `;

      const result = await session.run(query, {
        type,
        searchTerm: normalizedName,
        limit: toInt(limit)
      });

      return result.records.map(r => r.get('n').properties);
    } finally {
      await session.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get entities by extraction round
   * @param {number} roundNumber
   * @param {Object} [options={}]
   * @returns {Promise<Object[]>}
   */
  async getEntitiesByRound(roundNumber, options = {}) {
    const { limit = 100, offset = 0, type = null } = options;
    const session = this.memgraph.driver.session();

    try {
      let query = `MATCH (n)`;
      const params = {
        offset: toInt(offset),
        limit: toInt(limit)
      };

      // Build WHERE clause
      const conditions = [];

      if (roundNumber !== null && roundNumber !== undefined) {
        conditions.push('n.extractionRound = $roundNumber');
        params.roundNumber = toInt(roundNumber);
      }

      if (type) {
        conditions.push('n.type = $type');
        params.type = type;
      }

      // Always filter for active entities
      conditions.push('(n.lifecycleState = "active" OR n.lifecycleState IS NULL)');

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += `
        RETURN n
        ORDER BY n.extractionRound DESC, n.confidence DESC
        SKIP $offset
        LIMIT $limit
      `;

      const result = await session.run(query, params);

      return result.records.map(r => r.get('n').properties);
    } finally {
      await session.close();
    }
  }

  /**
   * Get relationships by extraction round
   * @param {number} roundNumber
   * @param {Object} [options={}]
   * @returns {Promise<Object[]>}
   */
  async getRelationshipsByRound(roundNumber, options = {}) {
    const { limit = 100 } = options;
    const session = this.memgraph.driver.session();

    try {
      let query = `MATCH (a)-[r]->(b)`;
      const params = { limit: toInt(limit) };

      if (roundNumber !== null && roundNumber !== undefined) {
        query += ` WHERE r.extractionRound = $roundNumber`;
        params.roundNumber = toInt(roundNumber);
      }

      query += `
        RETURN a.id as sourceId, a.name as sourceName,
               type(r) as relationType, r as relationship,
               b.id as targetId, b.name as targetName
        ORDER BY r.extractionRound DESC, r.weight DESC
        LIMIT $limit
      `;

      const result = await session.run(query, params);

      return result.records.map(r => ({
        sourceId: r.get('sourceId'),
        sourceName: r.get('sourceName'),
        type: r.get('relationType'),
        properties: r.get('relationship').properties,
        targetId: r.get('targetId'),
        targetName: r.get('targetName')
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph statistics
   * @returns {Promise<Object>}
   */
  async getGraphStatistics() {
    const session = this.memgraph.driver.session();

    try {
      // Node count by type
      const nodeQuery = `
        MATCH (n)
        WHERE n.lifecycleState = 'active' OR n.lifecycleState IS NULL
        WITH n.type as type, count(*) as count
        RETURN type, count
        ORDER BY count DESC
      `;

      const nodeResult = await session.run(nodeQuery);
      const nodesByType = {};
      let totalNodes = 0;

      for (const record of nodeResult.records) {
        const type = record.get('type') || 'Unknown';
        const count = record.get('count').toNumber ? record.get('count').toNumber() : record.get('count');
        nodesByType[type] = count;
        totalNodes += count;
      }

      // Relationship count by type
      const relQuery = `
        MATCH ()-[r]->()
        WITH type(r) as type, count(*) as count
        RETURN type, count
        ORDER BY count DESC
      `;

      const relResult = await session.run(relQuery);
      const relationshipsByType = {};
      let totalRelationships = 0;

      for (const record of relResult.records) {
        const type = record.get('type');
        const count = record.get('count').toNumber ? record.get('count').toNumber() : record.get('count');
        relationshipsByType[type] = count;
        totalRelationships += count;
      }

      // Average weights
      const weightQuery = `
        MATCH ()-[r]->()
        WHERE r.weight IS NOT NULL
        RETURN avg(r.weight) as avgWeight, min(r.weight) as minWeight, max(r.weight) as maxWeight
      `;

      const weightResult = await session.run(weightQuery);
      const weightStats = weightResult.records[0];

      return {
        nodes: {
          total: totalNodes,
          byType: nodesByType
        },
        relationships: {
          total: totalRelationships,
          byType: relationshipsByType,
          avgWeight: weightStats?.get('avgWeight') || 0,
          minWeight: weightStats?.get('minWeight') || 0,
          maxWeight: weightStats?.get('maxWeight') || 0
        },
        timestamp: new Date().toISOString()
      };
    } finally {
      await session.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get graph label for entity type
   * @param {string} type - Entity type
   * @returns {string}
   */
  getLabelForType(type) {
    const labelMap = {
      'PERSON': 'Person',
      'TEAM': 'Team',
      'ORGANIZATION': 'Organization',
      'SYSTEM': 'System',
      'MODULE': 'Module',
      'API': 'API',
      'DATABASE': 'Database',
      'TABLE': 'Table',
      'PROCESS': 'Process',
      'BUSINESS_RULE': 'BusinessRule',
      'CONCEPT': 'Concept',
      'TECHNOLOGY': 'Technology',
      'DOCUMENT': 'Document',
      'PROJECT': 'Project',
      'WORK_ITEM_REF': 'WorkItem',
      'FILE_PATH': 'File'
    };

    return labelMap[type] || 'Entity';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {GraphStorageService} */
let instance = null;

/**
 * Get GraphStorageService singleton
 * @returns {GraphStorageService}
 */
function getGraphStorageService() {
  if (!instance) {
    instance = new GraphStorageService();
  }
  return instance;
}

module.exports = {
  GraphStorageService,
  getGraphStorageService
};
