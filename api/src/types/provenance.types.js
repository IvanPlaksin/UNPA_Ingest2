/**
 * @fileoverview Provenance types for Incremental Knowledge Graph Pipeline
 * @module types/provenance
 * @version 1.0.0
 *
 * Types for tracking extraction rounds, source information, and weight evolution
 * in the knowledge graph construction process.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of sources from which entities can be extracted
 * @enum {string}
 */
const SOURCE_TYPES = {
  WORK_ITEM: 'WORK_ITEM',
  CODE: 'CODE',
  DOCUMENT: 'DOCUMENT',
  EMAIL: 'EMAIL',
  WIKI: 'WIKI',
  CHAT: 'CHAT',
  API_RESPONSE: 'API_RESPONSE',
  MANUAL: 'MANUAL'
};

/**
 * Types of extractors used
 * @enum {string}
 */
const EXTRACTOR_TYPES = {
  REGEX: 'regex',
  LLM: 'llm',
  HYBRID: 'hybrid',
  AST: 'ast',
  MANUAL: 'manual'
};

/**
 * Entity lifecycle states
 * @enum {string}
 */
const LIFECYCLE_STATES = {
  ACTIVE: 'active',
  MERGED: 'merged',
  DEPRECATED: 'deprecated',
  PENDING_REVIEW: 'pending_review'
};

/**
 * Weight change reasons
 * @enum {string}
 */
const WEIGHT_CHANGE_REASONS = {
  INITIAL: 'initial',
  REINFORCED: 'reinforced',
  CONTRADICTED: 'contradicted',
  GNN_INFERRED: 'gnn_inferred',
  AI_VALIDATED: 'ai_validated',
  TEMPORAL_DECAY: 'temporal_decay',
  MANUAL_OVERRIDE: 'manual_override'
};

// ═══════════════════════════════════════════════════════════════════════════════
// JSDOC TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Source information for provenance tracking
 * @typedef {Object} SourceInfo
 * @property {string} sourceId - Unique identifier of the source (file path, work item ID, etc.)
 * @property {string} sourceType - Type of source (WORK_ITEM, CODE, DOCUMENT, etc.)
 * @property {string} sourceHash - SHA-256 hash of source content
 * @property {string} [sourceName] - Human-readable name of source
 * @property {string} [sourceUrl] - URL to source if available
 * @property {Date} [sourceCreatedAt] - When the source was created
 * @property {Date} [sourceModifiedAt] - When the source was last modified
 * @property {Object} [sourceMetadata] - Additional source-specific metadata
 */

/**
 * Provenance information for tracking entity/relationship origin
 * @typedef {Object} Provenance
 * @property {number} extractionRound - Sequential number of extraction round
 * @property {string} sourceHash - SHA-256 hash of the source content
 * @property {string} sourceId - Identifier of the source
 * @property {string} sourceType - Type of source (WORK_ITEM, CODE, DOCUMENT, etc.)
 * @property {Date} [sourceCreatedAt] - When the source was created
 * @property {Date} [sourceModifiedAt] - When the source was last modified
 * @property {Date} extractedAt - Timestamp when extraction occurred
 * @property {number} confidence - Extraction confidence score (0.0 - 1.0)
 * @property {string} extractorVersion - Version of the extraction pipeline
 * @property {string} extractorType - Type of extractor used (regex, llm, hybrid)
 * @property {string} [extractorModel] - LLM model used if applicable
 * @property {string[]} [extractionContext] - Context snippets used for extraction
 */

/**
 * Weight change record for relationship evolution tracking
 * @typedef {Object} WeightChange
 * @property {number} round - Extraction round when change occurred
 * @property {number} weight - New weight value
 * @property {number} previousWeight - Weight before change
 * @property {string} reason - Reason for weight change (WEIGHT_CHANGE_REASONS)
 * @property {Date} timestamp - When change occurred
 * @property {string} [sourceHash] - Source that triggered the change
 * @property {string} [evidence] - Evidence supporting the change
 */

/**
 * Entity with full provenance information
 * @typedef {Object} EntityWithProvenance
 * @property {string} id - Unique entity identifier
 * @property {string} name - Entity name
 * @property {string} normalizedForm - Normalized form for deduplication
 * @property {string} type - Entity type (SYSTEM, PERSON, PROCESS, etc.)
 * @property {Object} properties - Additional entity properties
 * @property {number[]} [embedding] - Vector embedding for similarity search
 * @property {Provenance} provenance - Provenance information
 * @property {string} lifecycleState - Current lifecycle state (active, merged, deprecated)
 * @property {string[]} [mergedFrom] - IDs of entities merged into this one
 * @property {string} [supersedes] - ID of entity this one supersedes
 * @property {Date} createdAt - When entity was first created
 * @property {Date} updatedAt - When entity was last updated
 * @property {string} graphLabel - Label for graph visualization
 */

/**
 * Relationship with full provenance and weight history
 * @typedef {Object} RelationshipWithProvenance
 * @property {string} id - Unique relationship identifier
 * @property {string} sourceId - Source entity ID
 * @property {string} targetId - Target entity ID
 * @property {string} type - Relationship type (DEPENDS_ON, IMPLEMENTS, etc.)
 * @property {number} weight - Current relationship weight (0.0 - 1.0)
 * @property {number} confidence - Extraction confidence (0.0 - 1.0)
 * @property {string[]} evidence - Supporting evidence (text snippets)
 * @property {Provenance} provenance - Provenance information
 * @property {WeightChange[]} weightHistory - History of weight changes (limited)
 * @property {number} weightHistoryLimit - Max history entries to keep
 * @property {number} totalWeightUpdates - Total number of weight updates
 * @property {boolean} isInferred - Whether relationship was inferred (not explicit)
 * @property {Date} createdAt - When relationship was first created
 * @property {Date} updatedAt - When relationship was last updated
 */

/**
 * Extraction round metadata
 * @typedef {Object} ExtractionRound
 * @property {number} roundNumber - Sequential round number
 * @property {Date} startedAt - When round started
 * @property {Date} [completedAt] - When round completed
 * @property {string} status - 'running' | 'completed' | 'failed' | 'cancelled'
 * @property {number} documentsProcessed - Number of documents processed
 * @property {number} entitiesExtracted - Number of entities extracted
 * @property {number} entitiesMerged - Number of entities merged with existing
 * @property {number} entitiesNew - Number of new entities created
 * @property {number} relationshipsExtracted - Number of relationships extracted
 * @property {number} relationshipsNew - Number of new relationships
 * @property {number} relationshipsUpdated - Number of relationships with updated weights
 * @property {Object} extractorConfig - Configuration used for extraction
 * @property {string[]} sourceHashes - Hashes of sources processed
 * @property {Object} [error] - Error information if failed
 */

/**
 * Entity resolution result
 * @typedef {Object} EntityResolutionResult
 * @property {string} action - 'created' | 'merged' | 'skipped'
 * @property {string} entityId - ID of the resulting entity
 * @property {string} [mergedWithId] - ID of entity merged with (if merged)
 * @property {number} [similarityScore] - Similarity score if merged
 * @property {string} [reason] - Reason for the action
 */

/**
 * Graph storage result
 * @typedef {Object} GraphStorageResult
 * @property {boolean} success - Whether operation succeeded
 * @property {string} nodeId - ID of stored/updated node
 * @property {string} action - 'created' | 'updated' | 'merged'
 * @property {Provenance} provenance - Provenance information attached
 * @property {Object} [previousState] - Previous state if updated
 */

/**
 * Weight update configuration
 * @typedef {Object} WeightUpdateConfig
 * @property {number} reinforcementBoost - Weight boost for reinforcement (default: 0.1)
 * @property {number} contradictionPenalty - Weight penalty for contradiction (default: 0.2)
 * @property {number} gnnInferenceBase - Base weight for GNN inferred (default: 0.5)
 * @property {number} decayConstant - Decay constant for temporal decay (default: 30 days)
 * @property {number} maxWeight - Maximum weight value (default: 1.0)
 * @property {number} minWeight - Minimum weight value (default: 0.1)
 * @property {number} historyLimit - Max weight history entries (default: 10)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate provenance object
 * @param {Provenance} provenance - Provenance to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateProvenance(provenance) {
  const errors = [];

  if (!provenance) {
    return { valid: false, errors: ['Provenance is required'] };
  }

  if (typeof provenance.extractionRound !== 'number' || provenance.extractionRound < 1) {
    errors.push('extractionRound must be a positive number');
  }

  if (!provenance.sourceHash || typeof provenance.sourceHash !== 'string') {
    errors.push('sourceHash is required and must be a string');
  }

  if (!provenance.sourceType || !Object.values(SOURCE_TYPES).includes(provenance.sourceType)) {
    errors.push(`sourceType must be one of: ${Object.values(SOURCE_TYPES).join(', ')}`);
  }

  if (typeof provenance.confidence !== 'number' || provenance.confidence < 0 || provenance.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  if (!provenance.extractorType || !Object.values(EXTRACTOR_TYPES).includes(provenance.extractorType)) {
    errors.push(`extractorType must be one of: ${Object.values(EXTRACTOR_TYPES).join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate weight change object
 * @param {WeightChange} change - Weight change to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateWeightChange(change) {
  const errors = [];

  if (!change) {
    return { valid: false, errors: ['Weight change is required'] };
  }

  if (typeof change.round !== 'number' || change.round < 1) {
    errors.push('round must be a positive number');
  }

  if (typeof change.weight !== 'number' || change.weight < 0 || change.weight > 1) {
    errors.push('weight must be a number between 0 and 1');
  }

  if (typeof change.previousWeight !== 'number' || change.previousWeight < 0 || change.previousWeight > 1) {
    errors.push('previousWeight must be a number between 0 and 1');
  }

  if (!change.reason || !Object.values(WEIGHT_CHANGE_REASONS).includes(change.reason)) {
    errors.push(`reason must be one of: ${Object.values(WEIGHT_CHANGE_REASONS).join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new provenance object
 * @param {Object} params - Provenance parameters
 * @param {number} params.extractionRound - Round number
 * @param {string} params.sourceHash - Source hash
 * @param {string} params.sourceId - Source identifier
 * @param {string} params.sourceType - Source type
 * @param {number} params.confidence - Confidence score
 * @param {string} params.extractorType - Extractor type
 * @param {string} [params.extractorVersion] - Extractor version
 * @param {string} [params.extractorModel] - LLM model if applicable
 * @returns {Provenance}
 */
function createProvenance(params) {
  const now = new Date();

  return {
    extractionRound: params.extractionRound,
    sourceHash: params.sourceHash,
    sourceId: params.sourceId || '',
    sourceType: params.sourceType || SOURCE_TYPES.DOCUMENT,
    sourceCreatedAt: params.sourceCreatedAt || null,
    sourceModifiedAt: params.sourceModifiedAt || null,
    extractedAt: now,
    confidence: params.confidence || 0.5,
    extractorVersion: params.extractorVersion || '1.0.0',
    extractorType: params.extractorType || EXTRACTOR_TYPES.HYBRID,
    extractorModel: params.extractorModel || null,
    extractionContext: params.extractionContext || []
  };
}

/**
 * Create a weight change record
 * @param {Object} params - Weight change parameters
 * @param {number} params.round - Round number
 * @param {number} params.weight - New weight
 * @param {number} params.previousWeight - Previous weight
 * @param {string} params.reason - Change reason
 * @param {string} [params.sourceHash] - Source hash
 * @param {string} [params.evidence] - Evidence text
 * @returns {WeightChange}
 */
function createWeightChange(params) {
  return {
    round: params.round,
    weight: params.weight,
    previousWeight: params.previousWeight,
    reason: params.reason || WEIGHT_CHANGE_REASONS.INITIAL,
    timestamp: new Date(),
    sourceHash: params.sourceHash || null,
    evidence: params.evidence || null
  };
}

/**
 * Create an extraction round record
 * @param {number} roundNumber - Round number
 * @param {Object} [config] - Extractor configuration
 * @returns {ExtractionRound}
 */
function createExtractionRound(roundNumber, config = {}) {
  return {
    roundNumber,
    startedAt: new Date(),
    completedAt: null,
    status: 'running',
    documentsProcessed: 0,
    entitiesExtracted: 0,
    entitiesMerged: 0,
    entitiesNew: 0,
    relationshipsExtracted: 0,
    relationshipsNew: 0,
    relationshipsUpdated: 0,
    extractorConfig: config,
    sourceHashes: [],
    error: null
  };
}

/**
 * Default weight update configuration
 * @type {WeightUpdateConfig}
 */
const DEFAULT_WEIGHT_CONFIG = {
  reinforcementBoost: 0.1,
  contradictionPenalty: 0.2,
  gnnInferenceBase: 0.5,
  decayConstant: 30, // days
  maxWeight: 1.0,
  minWeight: 0.1,
  historyLimit: 10
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Enums
  SOURCE_TYPES,
  EXTRACTOR_TYPES,
  LIFECYCLE_STATES,
  WEIGHT_CHANGE_REASONS,

  // Validation
  validateProvenance,
  validateWeightChange,

  // Factory functions
  createProvenance,
  createWeightChange,
  createExtractionRound,

  // Defaults
  DEFAULT_WEIGHT_CONFIG
};
