/**
 * Pattern Library API Routes
 * REST endpoints for managing extraction patterns
 *
 * Endpoints:
 *   GET    /api/v1/patterns/entity          - List entity patterns
 *   GET    /api/v1/patterns/entity/:id      - Get entity pattern
 *   POST   /api/v1/patterns/entity          - Create entity pattern
 *   PUT    /api/v1/patterns/entity/:id      - Update entity pattern
 *   DELETE /api/v1/patterns/entity/:id      - Delete entity pattern
 *   GET    /api/v1/patterns/relation        - List relation patterns
 *   GET    /api/v1/patterns/relation/:id    - Get relation pattern
 *   POST   /api/v1/patterns/relation        - Create relation pattern
 *   DELETE /api/v1/patterns/relation/:id    - Delete relation pattern
 *   GET    /api/v1/patterns/subgraph        - List subgraph patterns
 *   POST   /api/v1/patterns/subgraph        - Create subgraph pattern
 *   POST   /api/v1/patterns/match           - Match patterns against text
 *   POST   /api/v1/patterns/extract         - Pattern-based extraction
 *   POST   /api/v1/patterns/learn           - Learn from feedback
 *   GET    /api/v1/patterns/export          - Export all patterns
 *   POST   /api/v1/patterns/import          - Import patterns
 *   GET    /api/v1/patterns/stats           - Statistics
 *   GET    /api/v1/patterns/recommendations - Pattern recommendations
 *   POST   /api/v1/patterns/clear           - Clear all patterns
 *
 * @module routes/pattern.routes
 */

const express = require('express');
const router = express.Router();
const { patternLibrary } = require('../services/patterns');

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /entity
 * List all entity patterns
 * Query: { domain?, type?, limit? }
 */
router.get('/entity', (req, res) => {
  try {
    const { domain, type, limit } = req.query;
    let patterns = [...patternLibrary.entityPatterns.values()];

    if (domain) {
      patterns = patterns.filter(p => p.domain === domain || p.domain === 'general');
    }
    if (type) {
      patterns = patterns.filter(p => p.entityType === type);
    }
    if (limit) {
      patterns = patterns.slice(0, parseInt(limit));
    }

    res.json({
      success: true,
      count: patterns.length,
      patterns: patterns.map(p => p.toJSON())
    });
  } catch (error) {
    console.error('[PatternRoute] List entity patterns error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /entity/:id
 * Get a specific entity pattern
 */
router.get('/entity/:id', (req, res) => {
  try {
    const pattern = patternLibrary.entityPatterns.get(req.params.id);
    if (!pattern) {
      return res.status(404).json({ success: false, error: 'Entity pattern not found' });
    }
    res.json({ success: true, pattern: pattern.toJSON() });
  } catch (error) {
    console.error('[PatternRoute] Get entity pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /entity
 * Create a new entity pattern
 * Body: { name, entityType, namePatterns[], contextKeywords[], domain?, priority?, confidence? }
 */
router.post('/entity', (req, res) => {
  try {
    const { name, entityType, namePatterns, contextKeywords, domain, priority, confidence, examples } = req.body;

    if (!name || !entityType) {
      return res.status(400).json({ success: false, error: 'name and entityType are required' });
    }
    if (!namePatterns || !Array.isArray(namePatterns) || namePatterns.length === 0) {
      return res.status(400).json({ success: false, error: 'namePatterns array is required and must not be empty' });
    }

    // Validate regex patterns
    for (const p of namePatterns) {
      try { new RegExp(p); } catch (e) {
        return res.status(400).json({ success: false, error: `Invalid regex pattern: ${p}` });
      }
    }

    const pattern = patternLibrary.registerEntityPattern({
      name,
      entityType,
      namePatterns,
      contextKeywords: contextKeywords || [],
      domain: domain || 'general',
      priority: priority || 5,
      confidence: confidence || 0.8,
      examples: examples || [],
      source: 'api'
    });

    res.status(201).json({ success: true, pattern: pattern.toJSON() });
  } catch (error) {
    console.error('[PatternRoute] Create entity pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /entity/:id
 * Update an entity pattern
 */
router.put('/entity/:id', (req, res) => {
  try {
    const existing = patternLibrary.entityPatterns.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Entity pattern not found' });
    }

    const updates = req.body;
    if (updates.name) existing.name = updates.name;
    if (updates.entityType) existing.entityType = updates.entityType;
    if (updates.namePatterns) existing.namePatterns = updates.namePatterns;
    if (updates.contextKeywords) existing.contextKeywords = updates.contextKeywords;
    if (updates.domain) existing.domain = updates.domain;
    if (updates.priority !== undefined) existing.priority = updates.priority;
    if (updates.confidence !== undefined) existing.confidence = updates.confidence;

    res.json({ success: true, pattern: existing.toJSON() });
  } catch (error) {
    console.error('[PatternRoute] Update entity pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /entity/:id
 * Delete an entity pattern
 */
router.delete('/entity/:id', (req, res) => {
  try {
    if (!patternLibrary.entityPatterns.has(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Entity pattern not found' });
    }
    patternLibrary.entityPatterns.delete(req.params.id);
    res.json({ success: true, message: 'Entity pattern deleted' });
  } catch (error) {
    console.error('[PatternRoute] Delete entity pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RELATION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /relation
 * List all relation patterns
 * Query: { domain?, type?, limit? }
 */
router.get('/relation', (req, res) => {
  try {
    const { domain, type, limit } = req.query;
    let patterns = [...patternLibrary.relationPatterns.values()];

    if (domain) {
      patterns = patterns.filter(p => p.domain === domain || p.domain === 'general');
    }
    if (type) {
      patterns = patterns.filter(p => p.relationType === type);
    }
    if (limit) {
      patterns = patterns.slice(0, parseInt(limit));
    }

    res.json({
      success: true,
      count: patterns.length,
      patterns: patterns.map(p => p.toJSON())
    });
  } catch (error) {
    console.error('[PatternRoute] List relation patterns error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /relation/:id
 * Get a specific relation pattern
 */
router.get('/relation/:id', (req, res) => {
  try {
    const pattern = patternLibrary.relationPatterns.get(req.params.id);
    if (!pattern) {
      return res.status(404).json({ success: false, error: 'Relation pattern not found' });
    }
    res.json({ success: true, pattern: pattern.toJSON() });
  } catch (error) {
    console.error('[PatternRoute] Get relation pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /relation
 * Create a new relation pattern
 * Body: { name, relationType, subjectTypes[], objectTypes[], verbPatterns[], domain?, priority?, confidence? }
 */
router.post('/relation', (req, res) => {
  try {
    const { name, relationType, subjectTypes, objectTypes, verbPatterns, domain, priority, confidence } = req.body;

    if (!name || !relationType) {
      return res.status(400).json({ success: false, error: 'name and relationType are required' });
    }
    if (!verbPatterns || !Array.isArray(verbPatterns) || verbPatterns.length === 0) {
      return res.status(400).json({ success: false, error: 'verbPatterns array is required and must not be empty' });
    }

    const pattern = patternLibrary.registerRelationPattern({
      name,
      relationType,
      subjectTypes: subjectTypes || [],
      objectTypes: objectTypes || [],
      verbPatterns,
      domain: domain || 'general',
      priority: priority || 5,
      confidence: confidence || 0.8,
      source: 'api'
    });

    res.status(201).json({ success: true, pattern: pattern.toJSON() });
  } catch (error) {
    console.error('[PatternRoute] Create relation pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /relation/:id
 * Delete a relation pattern
 */
router.delete('/relation/:id', (req, res) => {
  try {
    if (!patternLibrary.relationPatterns.has(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Relation pattern not found' });
    }
    patternLibrary.relationPatterns.delete(req.params.id);
    res.json({ success: true, message: 'Relation pattern deleted' });
  } catch (error) {
    console.error('[PatternRoute] Delete relation pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBGRAPH PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /subgraph
 * List all subgraph patterns
 * Query: { domain?, structure?, limit? }
 */
router.get('/subgraph', (req, res) => {
  try {
    const { domain, structure, limit } = req.query;
    let patterns = [...patternLibrary.subgraphPatterns.values()];

    if (domain) {
      patterns = patterns.filter(p => p.domain === domain || p.domain === 'general');
    }
    if (structure) {
      patterns = patterns.filter(p => p.structure === structure);
    }
    if (limit) {
      patterns = patterns.slice(0, parseInt(limit));
    }

    res.json({
      success: true,
      count: patterns.length,
      patterns: patterns.map(p => p.toJSON())
    });
  } catch (error) {
    console.error('[PatternRoute] List subgraph patterns error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /subgraph
 * Create a new subgraph pattern
 * Body: { name, description?, structure?, nodeTypes[], edgeTypes[], template?, domain?, priority? }
 */
router.post('/subgraph', (req, res) => {
  try {
    const { name, description, structure, nodeTypes, edgeTypes, template, domain, priority } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const pattern = patternLibrary.registerSubgraphPattern({
      name,
      description: description || '',
      structure: structure || 'custom',
      nodeTypes: nodeTypes || [],
      edgeTypes: edgeTypes || [],
      template,
      domain: domain || 'general',
      priority: priority || 5,
      source: 'api'
    });

    res.status(201).json({ success: true, pattern: pattern.toJSON() });
  } catch (error) {
    console.error('[PatternRoute] Create subgraph pattern error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MATCHING & EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /match
 * Match patterns against text
 * Body: { text: string, domain?: string, types?: ['entity'|'relation'] }
 */
router.post('/match', (req, res) => {
  try {
    const { text, domain, types } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required and must be a string' });
    }

    const context = { domain };
    const results = { entityMatches: [], relationMatches: [] };
    const includeTypes = types || ['entity', 'relation'];

    if (includeTypes.includes('entity')) {
      results.entityMatches = patternLibrary.matchEntityPatterns(text, context)
        .map(m => ({
          patternId: m.pattern.id,
          patternName: m.pattern.name,
          entityType: m.pattern.entityType,
          score: m.score,
          details: m.details
        }));
    }

    if (includeTypes.includes('relation')) {
      const entities = patternLibrary.extractEntities(text, context).entities;
      results.relationMatches = patternLibrary.matchRelationPatterns(text, entities, context)
        .map(m => ({
          patternId: m.pattern.id,
          patternName: m.pattern.name,
          relationType: m.pattern.relationType,
          score: m.score
        }));
    }

    res.json({
      success: true,
      text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
      ...results,
      totalMatches: results.entityMatches.length + results.relationMatches.length
    });
  } catch (error) {
    console.error('[PatternRoute] Pattern match error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /extract
 * Extract entities and relations using patterns
 * Body: { text: string, domain?: string }
 */
router.post('/extract', (req, res) => {
  try {
    const { text, domain } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required and must be a string' });
    }

    const result = patternLibrary.extract(text, { domain });

    res.json({
      success: true,
      entities: result.entities,
      relations: result.relations,
      subgraphPatterns: result.subgraphPatterns,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('[PatternRoute] Pattern extract error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /learn
 * Learn patterns from extraction feedback
 * Body: { text: string, extraction: { entities: [], relations: [] } }
 */
router.post('/learn', (req, res) => {
  try {
    const { text, extraction } = req.body;

    if (!text || !extraction) {
      return res.status(400).json({ success: false, error: 'text and extraction are required' });
    }

    const result = patternLibrary.learnFromExtraction(text, extraction);

    res.json({
      success: true,
      learned: result.learned,
      details: {
        entities: result.entities || 0,
        relations: result.relations || 0,
        subgraphs: result.subgraphs || 0
      }
    });
  } catch (error) {
    console.error('[PatternRoute] Pattern learn error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /export
 * Export all patterns
 */
router.get('/export', (req, res) => {
  try {
    const data = patternLibrary.export();
    res.json({ success: true, data });
  } catch (error) {
    console.error('[PatternRoute] Export error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /import
 * Import patterns
 * Body: { data: exportedData, merge?: boolean }
 */
router.post('/import', (req, res) => {
  try {
    const { data, merge } = req.body;

    if (!data) {
      return res.status(400).json({ success: false, error: 'data is required' });
    }

    const result = patternLibrary.import(data, merge !== false);

    res.json({ success: true, imported: result });
  } catch (error) {
    console.error('[PatternRoute] Import error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS & MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stats
 * Get pattern library statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = patternLibrary.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[PatternRoute] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /recommendations
 * Get pattern recommendations
 * Query: { domain?: string }
 */
router.get('/recommendations', (req, res) => {
  try {
    const { domain } = req.query;
    const recommendations = patternLibrary.getRecommendations({ domain });
    res.json({ success: true, recommendations });
  } catch (error) {
    console.error('[PatternRoute] Recommendations error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /clear
 * Clear all patterns (requires confirmation)
 * Body: { confirm: true }
 */
router.post('/clear', (req, res) => {
  try {
    if (!req.body.confirm) {
      return res.status(400).json({ success: false, error: 'Must confirm with { confirm: true }' });
    }

    patternLibrary.clear();

    res.json({ success: true, message: 'All patterns cleared' });
  } catch (error) {
    console.error('[PatternRoute] Clear error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
