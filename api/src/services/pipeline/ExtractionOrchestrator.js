/**
 * @fileoverview Extraction Orchestrator for Incremental Knowledge Graph Pipeline
 * @module services/pipeline/ExtractionOrchestrator
 * @version 1.0.0
 *
 * Orchestrates the extraction process across multiple documents/sources,
 * managing rounds, entity resolution, and graph construction.
 */

'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { EntityExtractor, createEntityExtractor } = require('../extraction/entity-extractor');
const { getEntityResolver } = require('../extraction/EntityResolver');
const { getGraphStorageService } = require('../graph/GraphStorageService');
const { getProvenanceService, SOURCE_TYPES } = require('../provenance.service');
const { createProvenance, LIFECYCLE_STATES } = require('../../types/provenance.types');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default orchestrator configuration
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  // Batch processing
  batchSize: 10,
  maxConcurrent: 3,

  // Entity extraction
  useLLM: true,
  useRegex: true,
  minConfidence: 0.6,

  // Entity resolution
  autoMerge: true,
  resolutionThreshold: 0.7,

  // Stop criteria
  maxDocumentsPerRound: 1000,
  maxEntitiesPerRound: 10000,

  // Timeouts
  documentTimeout: 30000,
  roundTimeout: 600000
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION ORCHESTRATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Orchestrates the extraction pipeline
 * @class
 * @extends EventEmitter
 */
class ExtractionOrchestrator extends EventEmitter {
  /**
   * Create ExtractionOrchestrator instance
   * @param {Object} [config={}] - Configuration options
   */
  constructor(config = {}) {
    super();

    /** @type {Object} */
    this.config = { ...DEFAULT_CONFIG, ...config };

    /** @type {ProvenanceService} */
    this.provenanceService = getProvenanceService();

    /** @type {GraphStorageService} */
    this.graphStorage = getGraphStorageService();

    /** @type {EntityResolver} */
    this.entityResolver = getEntityResolver();

    /** @type {EntityExtractor} */
    this.entityExtractor = createEntityExtractor({
      useLLM: this.config.useLLM,
      useRegex: this.config.useRegex,
      minConfidence: this.config.minConfidence
    });

    /** @type {Map<string, Object>} Active runs */
    this.activeRuns = new Map();

    /** @type {boolean} */
    this.isRunning = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a new extraction round
   * @param {Object} [options={}] - Round options
   * @returns {Promise<Object>} Round information
   */
  async startRound(options = {}) {
    if (this.isRunning) {
      throw new Error('An extraction round is already running');
    }

    const round = this.provenanceService.startRound({
      ...this.config,
      ...options.extractorConfig
    });

    const runId = `run_${round.roundNumber}_${Date.now()}`;

    this.activeRuns.set(runId, {
      runId,
      roundNumber: round.roundNumber,
      startedAt: new Date(),
      status: 'running',
      documentsQueue: [],
      documentsProcessed: 0,
      entitiesExtracted: 0,
      errors: []
    });

    this.isRunning = true;

    this.emit('roundStarted', {
      runId,
      roundNumber: round.roundNumber
    });

    console.log(`[Orchestrator] Started round ${round.roundNumber} (runId: ${runId})`);

    return {
      runId,
      roundNumber: round.roundNumber,
      status: 'running'
    };
  }

  /**
   * Stop current round
   * @param {string} runId - Run identifier
   * @returns {Promise<Object>} Round result
   */
  async stopRound(runId) {
    const run = this.activeRuns.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    run.status = 'stopping';
    this.isRunning = false;

    this.provenanceService.completeRound(run.roundNumber, 'completed');

    const stats = this.provenanceService.getRoundStatistics(run.roundNumber);

    run.status = 'completed';
    run.completedAt = new Date();

    this.emit('roundCompleted', {
      runId,
      roundNumber: run.roundNumber,
      stats
    });

    console.log(`[Orchestrator] Completed round ${run.roundNumber}`);

    return {
      runId,
      roundNumber: run.roundNumber,
      status: 'completed',
      stats
    };
  }

  /**
   * Get current run status
   * @param {string} runId - Run identifier
   * @returns {Object|null}
   */
  getRunStatus(runId) {
    const run = this.activeRuns.get(runId);
    if (!run) return null;

    const stats = this.provenanceService.getRoundStatistics(run.roundNumber);

    return {
      ...run,
      stats
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process a single document
   * @param {string} runId - Run identifier
   * @param {Object} document - Document to process
   * @param {string} document.content - Document content
   * @param {string} document.sourceId - Source identifier
   * @param {string} [document.sourceType] - Source type
   * @param {Object} [options={}] - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processDocument(runId, document, options = {}) {
    const run = this.activeRuns.get(runId);
    if (!run || run.status !== 'running') {
      throw new Error(`Run ${runId} is not active`);
    }

    const startTime = Date.now();
    const sourceHash = this.provenanceService.generateSourceHash(document.content);

    // Check if already processed
    const processed = this.provenanceService.wasSourceProcessed(sourceHash);
    if (processed.processed && !options.reprocess) {
      return {
        skipped: true,
        reason: `Already processed in round ${processed.round}`,
        sourceHash
      };
    }

    try {
      this.emit('documentStarted', { runId, sourceId: document.sourceId });

      // Step 1: Extract entities and relationships
      // Create extractor with model from options if specified
      let extractor = this.entityExtractor;
      if (options.model || options.provider) {
        extractor = createEntityExtractor({
          useLLM: options.useLLM !== undefined ? options.useLLM : this.config.useLLM,
          useRegex: options.useRegex !== undefined ? options.useRegex : this.config.useRegex,
          minConfidence: options.minConfidence || this.config.minConfidence,
          model: options.model,
          provider: options.provider
        });
      }

      const extractionResult = await extractor.extract(
        document.content,
        {
          sourceType: document.sourceType || 'text',
          filePath: document.sourceId,
          language: options.language || 'en',
          isCode: options.isCode || false
        }
      );

      // Step 2: Create provenance for each entity
      const entitiesWithProvenance = extractionResult.entities.map(entity => {
        const provenance = this.provenanceService.createProvenanceForExtraction(
          {
            sourceId: document.sourceId,
            sourceType: document.sourceType || SOURCE_TYPES.DOCUMENT,
            content: document.content,
            sourceCreatedAt: document.sourceCreatedAt,
            sourceModifiedAt: document.sourceModifiedAt
          },
          {
            type: entity.source,
            confidence: entity.confidence,
            model: extractionResult.stats?.provider,
            context: entity.context ? [entity.context] : []
          }
        );

        return {
          id: `entity_${crypto.randomBytes(8).toString('hex')}`,
          name: entity.name,
          normalizedForm: entity.normalizedForm || entity.name.toLowerCase(),
          type: entity.type,
          properties: entity.properties || {},
          provenance,
          lifecycleState: LIFECYCLE_STATES.ACTIVE,
          graphLabel: entity.graphLabel || 'Entity'
        };
      });

      // Step 3: Resolve and store entities
      const resolutionResults = await this.entityResolver.resolveEntities(
        entitiesWithProvenance,
        {
          namespace: options.namespace,
          autoMerge: this.config.autoMerge
        }
      );

      // Step 4: Store new entities
      const newEntities = [];
      for (let i = 0; i < entitiesWithProvenance.length; i++) {
        if (resolutionResults[i].action === 'created') {
          await this.entityResolver.storeNewEntity(entitiesWithProvenance[i], {
            namespace: options.namespace
          });
          newEntities.push(entitiesWithProvenance[i]);
        }
      }

      // Step 5: Store relationships
      const relationshipsStored = await this.storeRelationships(
        extractionResult.relationships,
        entitiesWithProvenance,
        resolutionResults,
        run.roundNumber
      );

      // Update run statistics
      run.documentsProcessed++;
      run.entitiesExtracted += extractionResult.entities.length;

      // Update round statistics
      this.provenanceService.updateRoundStats(run.roundNumber, {
        documentsProcessed: run.documentsProcessed,
        entitiesExtracted: run.entitiesExtracted,
        entitiesNew: resolutionResults.filter(r => r.action === 'created').length,
        entitiesMerged: resolutionResults.filter(r => r.action === 'merged').length,
        relationshipsExtracted: extractionResult.relationships.length,
        relationshipsNew: relationshipsStored.new,
        relationshipsUpdated: relationshipsStored.updated
      });

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        sourceId: document.sourceId,
        sourceHash,
        entities: {
          total: extractionResult.entities.length,
          new: resolutionResults.filter(r => r.action === 'created').length,
          merged: resolutionResults.filter(r => r.action === 'merged').length
        },
        relationships: {
          total: extractionResult.relationships.length,
          new: relationshipsStored.new,
          updated: relationshipsStored.updated
        },
        duration,
        stats: extractionResult.stats
      };

      this.emit('documentCompleted', { runId, result });

      return result;
    } catch (error) {
      run.errors.push({
        sourceId: document.sourceId,
        error: error.message,
        timestamp: new Date()
      });

      this.emit('documentError', {
        runId,
        sourceId: document.sourceId,
        error: error.message
      });

      return {
        success: false,
        sourceId: document.sourceId,
        sourceHash,
        error: error.message
      };
    }
  }

  /**
   * Process multiple documents in batch
   * @param {string} runId - Run identifier
   * @param {Object[]} documents - Documents to process
   * @param {Object} [options={}] - Processing options
   * @returns {Promise<Object>} Batch result
   */
  async processBatch(runId, documents, options = {}) {
    const results = [];
    const batchSize = options.batchSize || this.config.batchSize;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      // Process batch with limited concurrency
      const batchResults = await Promise.all(
        batch.map(doc => this.processDocument(runId, doc, options))
      );

      results.push(...batchResults);

      this.emit('batchProgress', {
        runId,
        processed: i + batch.length,
        total: documents.length
      });
    }

    return {
      total: documents.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      skipped: results.filter(r => r.skipped).length,
      results
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIP STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store relationships with provenance
   * @param {Object[]} relationships - Extracted relationships
   * @param {Object[]} entities - Entities with provenance
   * @param {Object[]} resolutionResults - Resolution results for entities
   * @param {number} roundNumber - Current round number
   * @returns {Promise<Object>}
   */
  async storeRelationships(relationships, entities, resolutionResults, roundNumber) {
    let newCount = 0;
    let updatedCount = 0;

    // Build entity map (name -> resolved id)
    const entityMap = new Map();
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const resolution = resolutionResults[i];
      const resolvedId = resolution.entityId || entity.id;
      entityMap.set(entity.name.toLowerCase(), resolvedId);
      entityMap.set((entity.normalizedForm || '').toLowerCase(), resolvedId);
    }

    for (const rel of relationships) {
      try {
        const sourceId = entityMap.get(rel.source?.toLowerCase()) ||
                         entityMap.get(rel.sourceNorm?.toLowerCase());
        const targetId = entityMap.get(rel.target?.toLowerCase()) ||
                         entityMap.get(rel.targetNorm?.toLowerCase());

        if (!sourceId || !targetId) {
          continue; // Skip if entities not found
        }

        const relationshipWithProvenance = {
          id: `rel_${crypto.randomBytes(8).toString('hex')}`,
          sourceId,
          targetId,
          type: rel.type || 'RELATED_TO',
          weight: rel.confidence || 0.5,
          confidence: rel.confidence || 0.5,
          evidence: rel.evidence ? [rel.evidence] : [],
          isInferred: false,
          provenance: {
            extractionRound: roundNumber,
            sourceHash: '', // Will be set by storage service
            confidence: rel.confidence || 0.5,
            extractorType: 'hybrid',
            extractedAt: new Date()
          }
        };

        const result = await this.graphStorage.saveRelationshipWithProvenance(
          relationshipWithProvenance
        );

        if (result.action === 'created') {
          newCount++;
        } else if (result.action === 'updated') {
          updatedCount++;
        }
      } catch (error) {
        console.error('[Orchestrator] Error storing relationship:', error);
      }
    }

    return { new: newCount, updated: updatedCount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process text directly (convenience method)
   * @param {string} text - Text to process
   * @param {Object} [options={}] - Processing options
   * @returns {Promise<Object>}
   */
  async processText(text, options = {}) {
    // Start round if not running
    let runId = options.runId;
    let shouldStopRound = false;

    if (!runId) {
      const round = await this.startRound(options);
      runId = round.runId;
      shouldStopRound = true;
    }

    const document = {
      content: text,
      sourceId: options.sourceId || `text_${Date.now()}`,
      sourceType: options.sourceType || SOURCE_TYPES.DOCUMENT
    };

    const result = await this.processDocument(runId, document, options);

    if (shouldStopRound) {
      await this.stopRound(runId);
    }

    return result;
  }

  /**
   * Get overall statistics
   * @returns {Object}
   */
  getStatistics() {
    const provenanceStats = this.provenanceService.getOverallStatistics();
    const activeRuns = Array.from(this.activeRuns.values()).map(run => ({
      runId: run.runId,
      roundNumber: run.roundNumber,
      status: run.status,
      documentsProcessed: run.documentsProcessed
    }));

    return {
      provenance: provenanceStats,
      activeRuns,
      config: this.config
    };
  }

  /**
   * Get all rounds
   * @returns {Object[]}
   */
  getAllRounds() {
    return this.provenanceService.getAllRounds();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/** @type {ExtractionOrchestrator} */
let instance = null;

/**
 * Get ExtractionOrchestrator singleton
 * @param {Object} [config] - Configuration
 * @returns {ExtractionOrchestrator}
 */
function getExtractionOrchestrator(config = {}) {
  if (!instance) {
    instance = new ExtractionOrchestrator(config);
  }
  return instance;
}

/**
 * Create new ExtractionOrchestrator instance
 * @param {Object} [config] - Configuration
 * @returns {ExtractionOrchestrator}
 */
function createExtractionOrchestrator(config = {}) {
  return new ExtractionOrchestrator(config);
}

module.exports = {
  ExtractionOrchestrator,
  getExtractionOrchestrator,
  createExtractionOrchestrator,
  DEFAULT_CONFIG
};
