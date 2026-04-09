/**
 * @fileoverview Provenance Service for Incremental Knowledge Graph Pipeline
 * @module services/provenance
 * @version 1.0.0
 *
 * Manages extraction rounds, provenance tracking, and weight evolution
 * for the knowledge graph construction process.
 */

'use strict';

const crypto = require('crypto');
const {
  SOURCE_TYPES,
  EXTRACTOR_TYPES,
  WEIGHT_CHANGE_REASONS,
  createProvenance,
  createWeightChange,
  createExtractionRound,
  validateProvenance,
  DEFAULT_WEIGHT_CONFIG
} = require('../types/provenance.types');

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service for managing provenance and extraction rounds
 * @class
 */
class ProvenanceService {
  constructor() {
    /** @type {Map<number, ExtractionRound>} */
    this.rounds = new Map();

    /** @type {number} */
    this.currentRound = 0;

    /** @type {WeightUpdateConfig} */
    this.weightConfig = { ...DEFAULT_WEIGHT_CONFIG };

    /** @type {string} */
    this.extractorVersion = '1.0.0';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new extraction round
   * @param {Object} [config={}] - Extractor configuration for this round
   * @returns {ExtractionRound} The new round
   */
  startRound(config = {}) {
    this.currentRound++;
    const round = createExtractionRound(this.currentRound, config);
    this.rounds.set(this.currentRound, round);
    console.log(`[ProvenanceService] Started extraction round ${this.currentRound}`);
    return round;
  }

  /**
   * Get current round number
   * @returns {number}
   */
  getCurrentRound() {
    return this.currentRound;
  }

  /**
   * Get round by number
   * @param {number} roundNumber
   * @returns {ExtractionRound|null}
   */
  getRound(roundNumber) {
    return this.rounds.get(roundNumber) || null;
  }

  /**
   * Get all rounds
   * @returns {ExtractionRound[]}
   */
  getAllRounds() {
    return Array.from(this.rounds.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }

  /**
   * Update round statistics
   * @param {number} roundNumber
   * @param {Object} stats - Statistics to update
   */
  updateRoundStats(roundNumber, stats) {
    const round = this.rounds.get(roundNumber);
    if (!round) {
      console.warn(`[ProvenanceService] Round ${roundNumber} not found`);
      return;
    }

    Object.assign(round, stats);
  }

  /**
   * Complete a round
   * @param {number} roundNumber
   * @param {string} [status='completed']
   * @param {Object} [error=null]
   */
  completeRound(roundNumber, status = 'completed', error = null) {
    const round = this.rounds.get(roundNumber);
    if (!round) {
      console.warn(`[ProvenanceService] Round ${roundNumber} not found`);
      return;
    }

    round.completedAt = new Date();
    round.status = status;
    if (error) {
      round.error = error;
    }

    console.log(`[ProvenanceService] Round ${roundNumber} ${status}:`, {
      documents: round.documentsProcessed,
      entities: round.entitiesExtracted,
      merged: round.entitiesMerged,
      relationships: round.relationshipsExtracted
    });
  }

  /**
   * Add source hash to round
   * @param {number} roundNumber
   * @param {string} sourceHash
   */
  addSourceToRound(roundNumber, sourceHash) {
    const round = this.rounds.get(roundNumber);
    if (round && !round.sourceHashes.includes(sourceHash)) {
      round.sourceHashes.push(sourceHash);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVENANCE CREATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate hash for source content
   * @param {string|Buffer} content - Content to hash
   * @returns {string} SHA-256 hash
   */
  generateSourceHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Create provenance for an extraction
   * @param {Object} sourceInfo - Source information
   * @param {string} sourceInfo.sourceId - Source identifier
   * @param {string} sourceInfo.sourceType - Source type
   * @param {string} sourceInfo.content - Source content (for hashing)
   * @param {Date} [sourceInfo.sourceCreatedAt] - Source creation date
   * @param {Date} [sourceInfo.sourceModifiedAt] - Source modification date
   * @param {Object} extractorInfo - Extractor information
   * @param {string} extractorInfo.type - Extractor type
   * @param {number} extractorInfo.confidence - Confidence score
   * @param {string} [extractorInfo.model] - LLM model if applicable
   * @param {string[]} [extractorInfo.context] - Context snippets
   * @returns {Provenance}
   */
  createProvenanceForExtraction(sourceInfo, extractorInfo) {
    const sourceHash = this.generateSourceHash(sourceInfo.content || sourceInfo.sourceId);

    // Add to current round's sources
    this.addSourceToRound(this.currentRound, sourceHash);

    return createProvenance({
      extractionRound: this.currentRound,
      sourceHash,
      sourceId: sourceInfo.sourceId,
      sourceType: sourceInfo.sourceType || SOURCE_TYPES.DOCUMENT,
      sourceCreatedAt: sourceInfo.sourceCreatedAt,
      sourceModifiedAt: sourceInfo.sourceModifiedAt,
      confidence: extractorInfo.confidence || 0.5,
      extractorVersion: this.extractorVersion,
      extractorType: extractorInfo.type || EXTRACTOR_TYPES.HYBRID,
      extractorModel: extractorInfo.model,
      extractionContext: extractorInfo.context || []
    });
  }

  /**
   * Create provenance from existing entity extraction result
   * @param {Object} entity - Extracted entity
   * @param {Object} sourceInfo - Source information
   * @returns {Provenance}
   */
  attachProvenanceToEntity(entity, sourceInfo) {
    const provenance = this.createProvenanceForExtraction(sourceInfo, {
      type: entity.source || EXTRACTOR_TYPES.HYBRID,
      confidence: entity.confidence || 0.5,
      context: entity.context ? [entity.context] : []
    });

    return {
      ...entity,
      provenance
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEIGHT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update weight configuration
   * @param {Partial<WeightUpdateConfig>} config
   */
  setWeightConfig(config) {
    this.weightConfig = { ...this.weightConfig, ...config };
  }

  /**
   * Calculate new weight for reinforcement
   * @param {number} currentWeight
   * @param {number} newConfidence
   * @returns {number}
   */
  calculateReinforcedWeight(currentWeight, newConfidence) {
    const boost = this.weightConfig.reinforcementBoost * newConfidence;
    return Math.min(this.weightConfig.maxWeight, currentWeight + boost);
  }

  /**
   * Calculate new weight for contradiction
   * @param {number} currentWeight
   * @returns {number}
   */
  calculateContradictedWeight(currentWeight) {
    return Math.max(this.weightConfig.minWeight, currentWeight - this.weightConfig.contradictionPenalty);
  }

  /**
   * Calculate weight for GNN-inferred relationship
   * @param {number} gnnProbability - GNN prediction probability
   * @param {number} aiConfidence - AI validation confidence
   * @returns {number}
   */
  calculateGNNInferredWeight(gnnProbability, aiConfidence) {
    return Math.min(this.weightConfig.maxWeight, gnnProbability * aiConfidence);
  }

  /**
   * Apply temporal decay to weight
   * @param {number} currentWeight
   * @param {Date} lastUpdated
   * @returns {number}
   */
  applyTemporalDecay(currentWeight, lastUpdated) {
    const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.exp(-daysSince / this.weightConfig.decayConstant);
    return Math.max(this.weightConfig.minWeight, currentWeight * decayFactor);
  }

  /**
   * Create weight change record
   * @param {number} previousWeight
   * @param {number} newWeight
   * @param {string} reason
   * @param {Object} [metadata={}]
   * @returns {WeightChange}
   */
  recordWeightChange(previousWeight, newWeight, reason, metadata = {}) {
    return createWeightChange({
      round: this.currentRound,
      weight: newWeight,
      previousWeight,
      reason,
      sourceHash: metadata.sourceHash,
      evidence: metadata.evidence
    });
  }

  /**
   * Update relationship with new weight and maintain history
   * @param {RelationshipWithProvenance} relationship
   * @param {number} newWeight
   * @param {string} reason
   * @param {Object} [metadata={}]
   * @returns {RelationshipWithProvenance}
   */
  updateRelationshipWeight(relationship, newWeight, reason, metadata = {}) {
    const previousWeight = relationship.weight;

    // Create weight change record
    const weightChange = this.recordWeightChange(previousWeight, newWeight, reason, metadata);

    // Update history (maintain limit)
    const weightHistory = [...(relationship.weightHistory || [])];
    weightHistory.push(weightChange);

    // Trim history if exceeds limit
    while (weightHistory.length > this.weightConfig.historyLimit) {
      weightHistory.shift();
    }

    return {
      ...relationship,
      weight: newWeight,
      weightHistory,
      totalWeightUpdates: (relationship.totalWeightUpdates || 0) + 1,
      updatedAt: new Date()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get statistics for a specific round
   * @param {number} roundNumber
   * @returns {Object|null}
   */
  getRoundStatistics(roundNumber) {
    const round = this.rounds.get(roundNumber);
    if (!round) return null;

    const duration = round.completedAt
      ? (new Date(round.completedAt) - new Date(round.startedAt)) / 1000
      : null;

    return {
      roundNumber: round.roundNumber,
      status: round.status,
      duration: duration ? `${duration.toFixed(1)}s` : 'in progress',
      documentsProcessed: round.documentsProcessed,
      entities: {
        total: round.entitiesExtracted,
        new: round.entitiesNew,
        merged: round.entitiesMerged,
        mergeRate: round.entitiesExtracted > 0
          ? ((round.entitiesMerged / round.entitiesExtracted) * 100).toFixed(1) + '%'
          : '0%'
      },
      relationships: {
        total: round.relationshipsExtracted,
        new: round.relationshipsNew,
        updated: round.relationshipsUpdated
      },
      sources: round.sourceHashes.length
    };
  }

  /**
   * Get overall pipeline statistics
   * @returns {Object}
   */
  getOverallStatistics() {
    const rounds = this.getAllRounds();

    const totals = rounds.reduce((acc, round) => {
      acc.documents += round.documentsProcessed;
      acc.entities += round.entitiesExtracted;
      acc.merged += round.entitiesMerged;
      acc.relationships += round.relationshipsExtracted;
      return acc;
    }, { documents: 0, entities: 0, merged: 0, relationships: 0 });

    const completedRounds = rounds.filter(r => r.status === 'completed').length;
    const failedRounds = rounds.filter(r => r.status === 'failed').length;

    return {
      totalRounds: rounds.length,
      completedRounds,
      failedRounds,
      currentRound: this.currentRound,
      totals,
      averageEntitiesPerRound: rounds.length > 0
        ? (totals.entities / rounds.length).toFixed(1)
        : 0,
      overallMergeRate: totals.entities > 0
        ? ((totals.merged / totals.entities) * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Check if source was already processed
   * @param {string} sourceHash
   * @returns {{processed: boolean, round: number|null}}
   */
  wasSourceProcessed(sourceHash) {
    for (const [roundNumber, round] of this.rounds) {
      if (round.sourceHashes.includes(sourceHash)) {
        return { processed: true, round: roundNumber };
      }
    }
    return { processed: false, round: null };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE (hooks for external storage)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export all rounds for persistence
   * @returns {Object}
   */
  exportState() {
    return {
      currentRound: this.currentRound,
      rounds: Array.from(this.rounds.entries()),
      weightConfig: this.weightConfig,
      extractorVersion: this.extractorVersion,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Import state from persistence
   * @param {Object} state
   */
  importState(state) {
    if (state.currentRound) {
      this.currentRound = state.currentRound;
    }
    if (state.rounds) {
      this.rounds = new Map(state.rounds);
    }
    if (state.weightConfig) {
      this.weightConfig = { ...DEFAULT_WEIGHT_CONFIG, ...state.weightConfig };
    }
    if (state.extractorVersion) {
      this.extractorVersion = state.extractorVersion;
    }
    console.log(`[ProvenanceService] Imported state: ${this.rounds.size} rounds, current: ${this.currentRound}`);
  }

  /**
   * Reset service state (for testing)
   */
  reset() {
    this.rounds.clear();
    this.currentRound = 0;
    this.weightConfig = { ...DEFAULT_WEIGHT_CONFIG };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {ProvenanceService} */
let instance = null;

/**
 * Get ProvenanceService singleton instance
 * @returns {ProvenanceService}
 */
function getProvenanceService() {
  if (!instance) {
    instance = new ProvenanceService();
  }
  return instance;
}

/**
 * Create new ProvenanceService instance (for testing)
 * @returns {ProvenanceService}
 */
function createProvenanceService() {
  return new ProvenanceService();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  ProvenanceService,
  getProvenanceService,
  createProvenanceService,

  // Re-export types for convenience
  SOURCE_TYPES,
  EXTRACTOR_TYPES,
  WEIGHT_CHANGE_REASONS
};
