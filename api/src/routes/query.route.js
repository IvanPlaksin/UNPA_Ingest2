/**
 * Query API Routes
 * REST endpoints for the Query Engine
 *
 * Endpoints:
 *   POST /api/v1/query           - Execute NL query (full pipeline)
 *   POST /api/v1/query/quick     - Quick entity lookup
 *   POST /api/v1/query/explain   - Query with step-by-step explanation
 *   POST /api/v1/query/batch     - Execute multiple queries
 *   GET  /api/v1/query/lookup/:entity   - Lookup entity by name
 *   GET  /api/v1/query/path             - Find path between entities
 *   GET  /api/v1/query/count/:type      - Count entities of type
 *   GET  /api/v1/query/list/:type       - List entities of type
 *   GET  /api/v1/query/relations/:entity - Get entity relationships
 *   GET  /api/v1/query/compare          - Compare two entities
 *   GET  /api/v1/query/stats            - Query engine statistics
 *   POST /api/v1/query/cache/clear      - Clear query cache
 *   GET  /api/v1/query/graph/stats      - Graph statistics
 *
 * @module routes/query.route
 */

const express = require('express');
const router = express.Router();
const { createQueryEngine } = require('../services/query');

// Singleton engine — can be re-initialized via setGraphService
let engine = createQueryEngine();

/**
 * Allow external code (e.g. startup) to inject a graph service
 */
function setGraphService(graphService) {
  engine.setGraphService(graphService);
}

function getEngine() {
  return engine;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /
 * Execute a natural language query
 * Body: { query: string, mode?: 'quick'|'full'|'explain', format?: 'brief'|'detailed'|'structured', noCache?: boolean }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, mode, format, noCache } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    if (query.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Query exceeds maximum length of 1000 characters'
      });
    }

    const result = await engine.query(query, {
      mode: mode || 'full',
      format: format || 'detailed',
      noCache: noCache || false
    });

    res.json({
      success: result.success,
      query: result.query,
      intent: result.intent,
      answer: result.answer,
      data: result.data,
      paths: result.paths,
      aggregations: result.aggregations,
      citations: result.citations,
      confidence: result.confidence,
      fromCache: result.fromCache || false,
      explanation: result.explanation || undefined,
      metadata: {
        ...result.metadata,
        apiTime: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('[QueryRoute] Query error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      metadata: { apiTime: Date.now() - startTime }
    });
  }
});

/**
 * POST /quick
 * Quick entity lookup (pattern-based, no full pipeline)
 * Body: { query: string }
 */
router.post('/quick', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    const result = await engine.query(query, { mode: 'quick' });

    res.json({
      success: result.success,
      query: result.query,
      answer: result.answer,
      data: result.data,
      confidence: result.confidence,
      metadata: {
        mode: 'quick',
        apiTime: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('[QueryRoute] Quick query error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /explain
 * Execute query with step-by-step explanation
 * Body: { query: string, format?: string }
 */
router.post('/explain', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, format } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string'
      });
    }

    const result = await engine.query(query, {
      mode: 'explain',
      format: format || 'detailed'
    });

    res.json({
      success: result.success,
      query: result.query,
      intent: result.intent,
      answer: result.answer,
      explanation: result.explanation,
      data: result.data,
      citations: result.citations,
      confidence: result.confidence,
      metadata: {
        mode: 'explain',
        apiTime: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('[QueryRoute] Explain query error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /batch
 * Execute multiple queries in parallel
 * Body: { queries: string[], mode?: string, format?: string }
 */
router.post('/batch', async (req, res) => {
  const startTime = Date.now();

  try {
    const { queries, mode, format } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Queries must be a non-empty array'
      });
    }

    if (queries.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 queries per batch'
      });
    }

    const results = await Promise.all(
      queries.map(q => engine.query(q, { mode, format }))
    );

    res.json({
      success: true,
      results,
      metadata: {
        count: results.length,
        successful: results.filter(r => r.success).length,
        apiTime: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error('[QueryRoute] Batch query error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /lookup/:entity
 * Quick lookup for a specific entity
 */
router.get('/lookup/:entity', async (req, res) => {
  try {
    const { entity } = req.params;
    const result = await engine.lookup(decodeURIComponent(entity));

    res.json({
      success: result.success,
      entity,
      answer: result.answer,
      data: result.data,
      confidence: result.confidence
    });

  } catch (error) {
    console.error('[QueryRoute] Lookup error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /path?from=X&to=Y
 * Find path between two entities
 */
router.get('/path', async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Both "from" and "to" query parameters are required'
      });
    }

    const result = await engine.findPath(from, to);

    res.json({
      success: result.success,
      from,
      to,
      answer: result.answer,
      paths: result.paths,
      confidence: result.confidence
    });

  } catch (error) {
    console.error('[QueryRoute] Path query error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /count/:type
 * Count entities of a specific type
 */
router.get('/count/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const result = await engine.count(type);

    res.json({
      success: result.success,
      type,
      answer: result.answer,
      count: result.aggregations?.count || 0
    });

  } catch (error) {
    console.error('[QueryRoute] Count error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /list/:type?limit=N
 * List entities of a specific type
 */
router.get('/list/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const result = await engine.list(type);

    res.json({
      success: result.success,
      type,
      items: result.data,
      count: result.data?.length || 0
    });

  } catch (error) {
    console.error('[QueryRoute] List error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /relations/:entity
 * Get relationships of an entity
 */
router.get('/relations/:entity', async (req, res) => {
  try {
    const { entity } = req.params;
    const result = await engine.getRelations(decodeURIComponent(entity));

    res.json({
      success: result.success,
      entity,
      answer: result.answer,
      relations: result.data || [],
      confidence: result.confidence
    });

  } catch (error) {
    console.error('[QueryRoute] Relations error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /compare?entity1=X&entity2=Y
 * Compare two entities
 */
router.get('/compare', async (req, res) => {
  try {
    const { entity1, entity2 } = req.query;

    if (!entity1 || !entity2) {
      return res.status(400).json({
        success: false,
        error: 'Both "entity1" and "entity2" query parameters are required'
      });
    }

    const result = await engine.compare(entity1, entity2);

    res.json({
      success: result.success,
      entity1,
      entity2,
      answer: result.answer,
      data: result.data,
      confidence: result.confidence
    });

  } catch (error) {
    console.error('[QueryRoute] Compare error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN / STATS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stats
 * Get query engine statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = engine.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[QueryRoute] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /cache/clear
 * Clear the query cache
 */
router.post('/cache/clear', (req, res) => {
  try {
    engine.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    console.error('[QueryRoute] Cache clear error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /graph/stats
 * Get graph statistics
 */
router.get('/graph/stats', (req, res) => {
  try {
    const stats = engine.getGraphStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[QueryRoute] Graph stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.setGraphService = setGraphService;
module.exports.getEngine = getEngine;
