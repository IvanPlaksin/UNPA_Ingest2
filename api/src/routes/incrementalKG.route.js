/**
 * @fileoverview REST API Routes for Incremental Knowledge Graph Pipeline
 * @module routes/incrementalKG
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getExtractionOrchestrator } = require('../services/pipeline/ExtractionOrchestrator');
const { getProvenanceService } = require('../services/provenance.service');
const { getGraphStorageService } = require('../services/graph/GraphStorageService');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUND MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route POST /api/incremental-kg/rounds/start
 * @description Start a new extraction round
 */
router.post('/rounds/start', async (req, res) => {
  try {
    const { config = {} } = req.body;
    const orchestrator = getExtractionOrchestrator();
    const result = await orchestrator.startRound({ extractorConfig: config });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/rounds/:runId/stop
 * @description Stop an active extraction round
 */
router.post('/rounds/:runId/stop', async (req, res) => {
  try {
    const { runId } = req.params;
    const orchestrator = getExtractionOrchestrator();
    const result = await orchestrator.stopRound(runId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/rounds/:runId/status
 * @description Get status of an extraction run
 */
router.get('/rounds/:runId/status', async (req, res) => {
  try {
    const { runId } = req.params;
    const orchestrator = getExtractionOrchestrator();
    const status = orchestrator.getRunStatus(runId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Run not found'
      });
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/rounds
 * @description Get all extraction rounds
 */
router.get('/rounds', async (req, res) => {
  try {
    const provenanceService = getProvenanceService();
    const rounds = provenanceService.getAllRounds();

    res.json({
      success: true,
      data: {
        rounds: rounds.map(r => provenanceService.getRoundStatistics(r.roundNumber)),
        total: rounds.length,
        currentRound: provenanceService.getCurrentRound()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/rounds/:roundNumber/stats
 * @description Get statistics for a specific round
 */
router.get('/rounds/:roundNumber/stats', async (req, res) => {
  try {
    const roundNumber = parseInt(req.params.roundNumber, 10);
    const provenanceService = getProvenanceService();
    const stats = provenanceService.getRoundStatistics(roundNumber);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Round not found'
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route POST /api/incremental-kg/process/text
 * @description Process text and extract entities
 * @body {string} text - Text to process
 * @body {string} [sourceId] - Source identifier
 * @body {string} [sourceType] - Source type
 * @body {string} [namespace] - Optional namespace
 * @body {string} [model] - AI model to use
 * @body {string} [provider] - AI provider (ollama, gemini, anthropic)
 * @body {boolean} [useLLM] - Use LLM for extraction
 * @body {boolean} [useRegex] - Use regex patterns
 * @body {number} [minConfidence] - Minimum confidence threshold
 */
router.post('/process/text', async (req, res) => {
  try {
    const {
      text, sourceId, sourceType, namespace, runId,
      model, provider, useLLM, useRegex, minConfidence, autoMerge
    } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Text is required and must be at least 10 characters'
      });
    }

    const orchestrator = getExtractionOrchestrator();
    const result = await orchestrator.processText(text, {
      sourceId,
      sourceType,
      namespace,
      runId,
      // AI model configuration
      model,
      provider,
      useLLM,
      useRegex,
      minConfidence,
      autoMerge
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/process/document
 * @description Process a document within an active run
 * @body {string} runId - Active run ID
 * @body {Object} document - Document to process
 */
router.post('/process/document', async (req, res) => {
  try {
    const { runId, document, options = {} } = req.body;

    if (!runId) {
      return res.status(400).json({
        success: false,
        error: 'runId is required'
      });
    }

    if (!document || !document.content) {
      return res.status(400).json({
        success: false,
        error: 'document.content is required'
      });
    }

    const orchestrator = getExtractionOrchestrator();
    const result = await orchestrator.processDocument(runId, document, options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/process/batch
 * @description Process multiple documents in batch
 */
router.post('/process/batch', async (req, res) => {
  try {
    const { runId, documents, options = {} } = req.body;

    if (!runId) {
      return res.status(400).json({
        success: false,
        error: 'runId is required'
      });
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'documents array is required'
      });
    }

    const orchestrator = getExtractionOrchestrator();
    const result = await orchestrator.processBatch(runId, documents, options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP-BY-STEP PROCESSING (for interactive mode)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route POST /api/incremental-kg/process/extract-only
 * @description Extract entities only (step 1 of pipeline)
 */
router.post('/process/extract-only', async (req, res) => {
  try {
    const { text, model, provider, useLLM = true, useRegex = true, minConfidence = 0.6 } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Text is required and must be at least 10 characters'
      });
    }

    const { createEntityExtractor } = require('../services/extraction/entity-extractor');
    const extractor = createEntityExtractor({ useLLM, useRegex, minConfidence, model, provider });

    const result = await extractor.extract(text, {
      sourceType: 'text',
      language: 'en'
    });

    res.json({
      success: true,
      data: {
        entities: result.entities,
        relationships: result.relationships,
        stats: result.stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/process/resolve
 * @description Resolve entities against existing (step 2 of pipeline)
 */
router.post('/process/resolve', async (req, res) => {
  try {
    const { entities, autoMerge = true, threshold = 0.7, namespace } = req.body;

    if (!entities || !Array.isArray(entities)) {
      return res.status(400).json({
        success: false,
        error: 'entities array is required'
      });
    }

    const { getEntityResolver } = require('../services/extraction/EntityResolver');
    const resolver = getEntityResolver();

    const results = await resolver.resolveEntities(entities, {
      namespace,
      autoMerge,
      threshold
    });

    // Count results
    const resolution = {
      new: results.filter(r => r.action === 'created').length,
      merged: results.filter(r => r.action === 'merged').length,
      skipped: results.filter(r => r.action === 'skipped').length
    };

    res.json({
      success: true,
      data: {
        resolution,
        entities: entities.map((e, i) => ({
          ...e,
          resolution: results[i]
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/process/relationships
 * @description Extract relationships between entities (step 3 of pipeline)
 */
router.post('/process/relationships', async (req, res) => {
  try {
    const { text, entities, model, provider } = req.body;

    if (!text || !entities || !Array.isArray(entities)) {
      return res.status(400).json({
        success: false,
        error: 'text and entities array are required'
      });
    }

    const { createEntityExtractor } = require('../services/extraction/entity-extractor');
    const extractor = createEntityExtractor({ useLLM: true, model, provider });

    // Extract relationships using the same extractor
    const result = await extractor.extract(text, {
      sourceType: 'text',
      existingEntities: entities,
      focusOnRelationships: true
    });

    res.json({
      success: true,
      data: {
        relationships: result.relationships || []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/process/store
 * @description Store entities and relationships to graph (step 4 of pipeline)
 */
router.post('/process/store', async (req, res) => {
  try {
    const { entities, relationships, runId, namespace, sourceType = 'DOCUMENT', extractorType = 'hybrid' } = req.body;
    const startTime = Date.now();
    const crypto = require('crypto');

    if (!entities || !Array.isArray(entities)) {
      return res.status(400).json({
        success: false,
        error: 'entities array is required'
      });
    }

    const graphStorage = getGraphStorageService();
    const provenanceService = getProvenanceService();

    // Get or create round
    let roundNumber = provenanceService.getCurrentRound();
    if (!roundNumber) {
      const round = provenanceService.startRound({});
      roundNumber = round.roundNumber;
    }

    // Helper to generate sourceHash from entity content
    const generateSourceHash = (content) => {
      return crypto.createHash('sha256').update(content || `entity-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 16);
    };

    // Helper to determine extractor type from entity source
    const getExtractorType = (entity) => {
      if (entity.source) {
        if (entity.source.includes('llm')) return 'llm';
        if (entity.source.includes('regex')) return 'regex';
      }
      return extractorType || 'hybrid';
    };

    // Build map from entity names to IDs for relationship resolution
    const entityNameToId = new Map();

    // Store entities
    let entitiesStored = 0;
    for (const entity of entities) {
      try {
        // Generate ID if missing
        if (!entity.id) {
          entity.id = `entity_${crypto.randomBytes(8).toString('hex')}`;
        }

        // Generate normalizedForm if missing
        if (!entity.normalizedForm && entity.name) {
          entity.normalizedForm = entity.name.toLowerCase().replace(/\s+/g, '_');
        }

        // Track entity name to ID mapping for relationships
        if (entity.name) {
          entityNameToId.set(entity.name, entity.id);
          entityNameToId.set(entity.name.toLowerCase(), entity.id);
          entityNameToId.set(entity.normalizedForm, entity.id);
        }

        // Ensure complete provenance with all required fields
        const existingProv = entity.provenance || {};
        entity.provenance = {
          extractionRound: existingProv.extractionRound || roundNumber,
          extractedAt: existingProv.extractedAt ? new Date(existingProv.extractedAt) : new Date(),
          confidence: existingProv.confidence ?? entity.confidence ?? 0.8,
          sourceHash: existingProv.sourceHash || generateSourceHash(entity.name + entity.type),
          sourceType: existingProv.sourceType || sourceType,
          extractorType: existingProv.extractorType || getExtractorType(entity),
          sourceId: existingProv.sourceId || entity.sourceId || '',
          extractorVersion: existingProv.extractorVersion || '1.0.0'
        };
        await graphStorage.saveEntityWithProvenance(entity);
        entitiesStored++;
      } catch (err) {
        console.error('[Store] Error storing entity:', err.message);
      }
    }

    // Store relationships
    let relationshipsStored = 0;
    if (relationships && Array.isArray(relationships)) {
      for (const rel of relationships) {
        try {
          // Resolve source and target entity names to IDs
          const sourceId = rel.sourceId || entityNameToId.get(rel.source) || entityNameToId.get(rel.source?.toLowerCase());
          const targetId = rel.targetId || entityNameToId.get(rel.target) || entityNameToId.get(rel.target?.toLowerCase());

          if (!sourceId || !targetId) {
            console.warn(`[Store] Skipping relationship: could not resolve entities - source: "${rel.source}" -> target: "${rel.target}"`);
            continue;
          }

          const existingRelProv = rel.provenance || {};
          const relWithProvenance = {
            ...rel,
            // Generate ID if missing
            id: rel.id || `rel_${crypto.randomBytes(8).toString('hex')}`,
            // Set resolved entity IDs
            sourceId,
            targetId,
            provenance: {
              extractionRound: existingRelProv.extractionRound || roundNumber,
              extractedAt: existingRelProv.extractedAt ? new Date(existingRelProv.extractedAt) : new Date(),
              confidence: existingRelProv.confidence ?? rel.confidence ?? 0.5,
              sourceHash: existingRelProv.sourceHash || generateSourceHash(rel.source + rel.target + rel.type),
              sourceType: existingRelProv.sourceType || sourceType,
              extractorType: existingRelProv.extractorType || extractorType || 'hybrid',
              sourceId: existingRelProv.sourceId || '',
              extractorVersion: existingRelProv.extractorVersion || '1.0.0'
            }
          };
          await graphStorage.saveRelationshipWithProvenance(relWithProvenance);
          relationshipsStored++;
        } catch (err) {
          console.error('[Store] Error storing relationship:', err.message);
        }
      }
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        entities: { stored: entitiesStored, total: entities.length },
        relationships: { stored: relationshipsStored, total: relationships?.length || 0 },
        roundNumber,
        duration
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/incremental-kg/entities
 * @description Get entities from the knowledge graph
 * @query {number} [round] - Filter by extraction round
 * @query {string} [type] - Filter by entity type
 * @query {number} [limit=50] - Results limit
 * @query {number} [offset=0] - Results offset
 */
router.get('/entities', async (req, res) => {
  try {
    const { round, type, limit = 50, offset = 0 } = req.query;
    const graphStorage = getGraphStorageService();

    const entities = await graphStorage.getEntitiesByRound(
      round ? parseInt(round, 10) : null,
      {
        type,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    );

    res.json({
      success: true,
      data: {
        entities,
        count: entities.length,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/relationships
 * @description Get relationships from the knowledge graph
 * @query {number} [round] - Filter by extraction round
 * @query {number} [limit=50] - Results limit
 */
router.get('/relationships', async (req, res) => {
  try {
    const { round, limit = 50 } = req.query;
    const graphStorage = getGraphStorageService();

    const relationships = await graphStorage.getRelationshipsByRound(
      round ? parseInt(round, 10) : null,
      { limit: parseInt(limit, 10) }
    );

    res.json({
      success: true,
      data: {
        relationships,
        count: relationships.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/graph/stats
 * @description Get overall graph statistics
 */
router.get('/graph/stats', async (req, res) => {
  try {
    const graphStorage = getGraphStorageService();
    const stats = await graphStorage.getGraphStatistics();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/graph/context
 * @description Get existing graph context for new entities (for incremental visualization)
 * @body {Array} entityNames - Names of new entities to find connections for
 * @body {number} [depth=1] - How many hops to traverse
 * @body {number} [limit=100] - Max nodes to return
 */
router.post('/graph/context', async (req, res) => {
  try {
    const { entityNames = [], depth = 1, limit = 100 } = req.body;
    const graphStorage = getGraphStorageService();

    if (!entityNames || !Array.isArray(entityNames) || entityNames.length === 0) {
      return res.json({
        success: true,
        data: {
          existingNodes: [],
          existingRelationships: [],
          connections: []
        }
      });
    }

    // Normalize entity names for matching
    const normalizedNames = entityNames.map(n => n.toLowerCase().replace(/\s+/g, '_'));
    const originalNames = entityNames.map(n => n.toLowerCase());

    // Query for existing entities that match or are connected to the new ones
    const session = graphStorage.memgraph.driver.session();

    try {
      // Find existing entities by name (exact or normalized match)
      const matchQuery = `
        MATCH (n)
        WHERE toLower(n.name) IN $originalNames
           OR n.normalizedForm IN $normalizedNames
        RETURN n
        LIMIT $limit
      `;

      const matchResult = await session.run(matchQuery, {
        originalNames,
        normalizedNames,
        limit: require('neo4j-driver').int(limit)
      });

      const existingNodes = matchResult.records.map(r => {
        const node = r.get('n');
        return {
          id: node.properties.id,
          name: node.properties.name,
          type: node.properties.type,
          normalizedForm: node.properties.normalizedForm,
          confidence: node.properties.confidence,
          extractionRound: node.properties.extractionRound,
          isExisting: true
        };
      });

      const existingNodeIds = existingNodes.map(n => n.id);

      // Find relationships connected to these existing nodes
      let existingRelationships = [];
      let connectedNodes = [];

      if (existingNodeIds.length > 0 && depth > 0) {
        const relQuery = `
          MATCH (a)-[r]->(b)
          WHERE a.id IN $nodeIds OR b.id IN $nodeIds
          RETURN a, r, b
          LIMIT $limit
        `;

        const relResult = await session.run(relQuery, {
          nodeIds: existingNodeIds,
          limit: require('neo4j-driver').int(limit)
        });

        const seenNodeIds = new Set(existingNodeIds);
        const seenRelIds = new Set();

        for (const record of relResult.records) {
          const sourceNode = record.get('a');
          const rel = record.get('r');
          const targetNode = record.get('b');

          // Add relationship if not seen
          const relId = rel.properties.id || `${sourceNode.properties.id}-${rel.type}-${targetNode.properties.id}`;
          if (!seenRelIds.has(relId)) {
            seenRelIds.add(relId);
            existingRelationships.push({
              id: relId,
              sourceId: sourceNode.properties.id,
              targetId: targetNode.properties.id,
              sourceName: sourceNode.properties.name,
              targetName: targetNode.properties.name,
              type: rel.type,
              weight: rel.properties.weight,
              confidence: rel.properties.confidence,
              isExisting: true
            });
          }

          // Add connected nodes if not seen
          for (const node of [sourceNode, targetNode]) {
            if (!seenNodeIds.has(node.properties.id)) {
              seenNodeIds.add(node.properties.id);
              connectedNodes.push({
                id: node.properties.id,
                name: node.properties.name,
                type: node.properties.type,
                normalizedForm: node.properties.normalizedForm,
                confidence: node.properties.confidence,
                extractionRound: node.properties.extractionRound,
                isExisting: true,
                isConnected: true
              });
            }
          }
        }
      }

      // Combine all existing and connected nodes
      const allExistingNodes = [...existingNodes, ...connectedNodes];

      // Find which new entities have matches in existing graph
      const connections = entityNames.map(name => {
        const normalized = name.toLowerCase().replace(/\s+/g, '_');
        const match = existingNodes.find(n =>
          n.name?.toLowerCase() === name.toLowerCase() ||
          n.normalizedForm === normalized
        );
        return {
          newEntityName: name,
          existingEntityId: match?.id || null,
          existingEntityName: match?.name || null,
          hasMatch: !!match
        };
      });

      res.json({
        success: true,
        data: {
          existingNodes: allExistingNodes,
          existingRelationships,
          connections,
          stats: {
            matchedEntities: connections.filter(c => c.hasMatch).length,
            totalExistingNodes: allExistingNodes.length,
            totalExistingRelationships: existingRelationships.length
          }
        }
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('[Graph Context] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/graph/existing
 * @description Get all existing graph data for visualization
 * @query {number} [limit=200] - Max nodes to return
 * @query {number} [currentRound] - Current round to mark as "new"
 */
router.get('/graph/existing', async (req, res) => {
  try {
    const { limit = 200, currentRound } = req.query;
    const graphStorage = getGraphStorageService();
    const session = graphStorage.memgraph.driver.session();

    try {
      // Get all nodes
      const nodesQuery = `
        MATCH (n)
        WHERE n.id IS NOT NULL
        RETURN n
        ORDER BY n.extractionRound DESC, n.createdAt DESC
        LIMIT $limit
      `;

      const nodesResult = await session.run(nodesQuery, {
        limit: require('neo4j-driver').int(parseInt(limit, 10))
      });

      const nodes = nodesResult.records.map(r => {
        const node = r.get('n');
        const round = node.properties.extractionRound;
        return {
          id: node.properties.id,
          name: node.properties.name,
          type: node.properties.type,
          normalizedForm: node.properties.normalizedForm,
          confidence: node.properties.confidence,
          extractionRound: round,
          isNew: currentRound ? round === parseInt(currentRound, 10) : false,
          isExisting: currentRound ? round !== parseInt(currentRound, 10) : true
        };
      });

      const nodeIds = nodes.map(n => n.id);

      // Get relationships between these nodes
      let relationships = [];
      if (nodeIds.length > 0) {
        const relsQuery = `
          MATCH (a)-[r]->(b)
          WHERE a.id IN $nodeIds AND b.id IN $nodeIds
          RETURN a.id as sourceId, b.id as targetId, type(r) as type, r.weight as weight, r.confidence as confidence, r.extractionRound as round
          LIMIT $limit
        `;

        const relsResult = await session.run(relsQuery, {
          nodeIds,
          limit: require('neo4j-driver').int(parseInt(limit, 10) * 2)
        });

        relationships = relsResult.records.map(r => ({
          sourceId: r.get('sourceId'),
          targetId: r.get('targetId'),
          type: r.get('type'),
          weight: r.get('weight'),
          confidence: r.get('confidence'),
          extractionRound: r.get('round'),
          isNew: currentRound ? r.get('round') === parseInt(currentRound, 10) : false,
          isExisting: currentRound ? r.get('round') !== parseInt(currentRound, 10) : true
        }));
      }

      res.json({
        success: true,
        data: {
          nodes,
          relationships,
          stats: {
            totalNodes: nodes.length,
            totalRelationships: relationships.length,
            newNodes: nodes.filter(n => n.isNew).length,
            existingNodes: nodes.filter(n => n.isExisting).length
          }
        }
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('[Graph Existing] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OVERALL STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/incremental-kg/stats
 * @description Get overall pipeline statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const orchestrator = getExtractionOrchestrator();
    const stats = orchestrator.getStatistics();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/incremental-kg/provenance/export
 * @description Export provenance state for persistence
 */
router.get('/provenance/export', async (req, res) => {
  try {
    const provenanceService = getProvenanceService();
    const state = provenanceService.exportState();

    res.json({
      success: true,
      data: state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/incremental-kg/provenance/import
 * @description Import provenance state from persistence
 */
router.post('/provenance/import', async (req, res) => {
  try {
    const { state } = req.body;

    if (!state) {
      return res.status(400).json({
        success: false,
        error: 'state is required'
      });
    }

    const provenanceService = getProvenanceService();
    provenanceService.importState(state);

    res.json({
      success: true,
      message: 'State imported successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SSE STREAMING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/incremental-kg/stream/:runId
 * @description Stream extraction events for a run
 */
router.get('/stream/:runId', (req, res) => {
  const { runId } = req.params;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const orchestrator = getExtractionOrchestrator();

  // Send initial status
  const status = orchestrator.getRunStatus(runId);
  if (status) {
    res.write(`data: ${JSON.stringify({ type: 'status', data: status })}\n\n`);
  }

  // Event handlers
  const onDocumentStarted = (data) => {
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify({ type: 'documentStarted', data })}\n\n`);
    }
  };

  const onDocumentCompleted = (data) => {
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify({ type: 'documentCompleted', data })}\n\n`);
    }
  };

  const onDocumentError = (data) => {
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify({ type: 'documentError', data })}\n\n`);
    }
  };

  const onBatchProgress = (data) => {
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify({ type: 'batchProgress', data })}\n\n`);
    }
  };

  const onRoundCompleted = (data) => {
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify({ type: 'roundCompleted', data })}\n\n`);
      cleanup();
    }
  };

  // Subscribe to events
  orchestrator.on('documentStarted', onDocumentStarted);
  orchestrator.on('documentCompleted', onDocumentCompleted);
  orchestrator.on('documentError', onDocumentError);
  orchestrator.on('batchProgress', onBatchProgress);
  orchestrator.on('roundCompleted', onRoundCompleted);

  // Cleanup on disconnect
  const cleanup = () => {
    orchestrator.off('documentStarted', onDocumentStarted);
    orchestrator.off('documentCompleted', onDocumentCompleted);
    orchestrator.off('documentError', onDocumentError);
    orchestrator.off('batchProgress', onBatchProgress);
    orchestrator.off('roundCompleted', onRoundCompleted);
  };

  req.on('close', cleanup);

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

module.exports = router;
