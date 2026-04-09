/**
 * Graph Catalog Routes
 * API endpoints for GXE graph catalog CRUD operations
 */

const express = require('express');
const router = express.Router();
const { graphCatalogService, GRAPH_TYPES } = require('../services/graphCatalog.service');
const redisService = require('../services/redis.service');

// Cache TTL for labels (5 minutes)
const LABELS_CACHE_TTL = 300;
const LABELS_CACHE_KEY = 'graph-catalog:labels';

/**
 * Helper to check Memgraph/Neo4j connection and return appropriate error
 */
function isGraphDbError(error) {
  return error.message?.includes('Neo4j') ||
         error.message?.includes('Memgraph') ||
         error.message?.includes('Authentication') ||
         error.message?.includes('connection') ||
         error.code === 'Neo.ClientError.Security.Unauthorized';
}

/**
 * GET /api/v1/graph-catalog/status
 * Get Neo4j connection status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await graphCatalogService.verifyConnection();
    res.json({
      success: true,
      connected: status.connected,
      error: status.error || null
    });
  } catch (error) {
    res.json({
      success: false,
      connected: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/graph-catalog
 * List graphs with filtering
 * Query params: namespace, type, search, tags, parentId, rootOnly, page, limit
 */
router.get('/', async (req, res) => {
  try {
    const {
      namespace,
      type,
      search,
      tags,
      parentId,
      rootOnly,
      page = 1,
      limit = 50
    } = req.query;

    const result = await graphCatalogService.listGraphs({
      namespace,
      type,
      search,
      tags: tags ? tags.split(',') : undefined,
      parentId,
      rootOnly: rootOnly === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[GraphCatalog] List error:', error);
    // Graceful degradation on DB connection errors
    if (isGraphDbError(error)) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        warning: 'Memgraph not connected: ' + error.message
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/tree
 * Get graph tree structure grouped by type
 * Query params: namespace, search, type
 */
router.get('/tree', async (req, res) => {
  try {
    const { namespace, search, type } = req.query;
    const tree = await graphCatalogService.getGraphTree({ namespace, search, type });
    res.json({ success: true, data: tree });
  } catch (error) {
    console.error('[GraphCatalog] Tree error:', error.message);
    // Return empty tree on connection error (graceful degradation)
    if (isGraphDbError(error)) {
      return res.json({
        success: true,
        data: { atomic: [], tool: [], business: [], composite: [], template: [] },
        warning: 'Memgraph not connected: ' + error.message
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/namespaces
 * Get all namespaces with graph counts
 */
router.get('/namespaces', async (req, res) => {
  try {
    const namespaces = await graphCatalogService.getNamespaces();
    res.json({ success: true, data: namespaces });
  } catch (error) {
    console.error('[GraphCatalog] Namespaces error:', error.message);
    if (isGraphDbError(error)) {
      return res.json({ success: true, data: [], warning: 'Memgraph not connected' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/labels
 * Get all unique labels (tags) with counts
 * Uses Redis caching with 5-minute TTL
 */
router.get('/labels', async (req, res) => {
  try {
    // Check Redis cache first
    const cached = await redisService.get(LABELS_CACHE_KEY);
    if (cached !== null) {
      return res.json({ success: true, data: cached, cached: true });
    }

    // Fetch from database
    const labels = await graphCatalogService.getLabels();

    // Cache the result
    await redisService.set(LABELS_CACHE_KEY, labels, LABELS_CACHE_TTL);

    res.json({ success: true, data: labels, cached: false });
  } catch (error) {
    console.error('[GraphCatalog] Labels error:', error.message);
    if (isGraphDbError(error)) {
      return res.json({ success: true, data: [], warning: 'Memgraph not connected' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/types
 * Get all graph types with counts
 */
router.get('/types', async (req, res) => {
  try {
    const types = await graphCatalogService.getTypes();
    res.json({
      success: true,
      data: types,
      available: Object.values(GRAPH_TYPES)
    });
  } catch (error) {
    console.error('[GraphCatalog] Types error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/:id
 * Get graph by ID with optional sub-graphs
 * Query params: includeSubGraphs (default: true)
 */
router.get('/:id', async (req, res) => {
  try {
    const includeSubGraphs = req.query.includeSubGraphs !== 'false';
    const graph = await graphCatalogService.getGraphById(req.params.id, includeSubGraphs);
    if (!graph) {
      return res.status(404).json({ success: false, error: 'Graph not found' });
    }
    res.json({ success: true, data: graph });
  } catch (error) {
    console.error('[GraphCatalog] Get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/:id/subgraphs
 * Get all sub-graphs for a graph (nodes that have been decomposed)
 */
router.get('/:id/subgraphs', async (req, res) => {
  try {
    const subGraphs = await graphCatalogService.getSubGraphs(req.params.id);
    res.json({ success: true, data: subGraphs });
  } catch (error) {
    console.error('[GraphCatalog] SubGraphs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/:id/subgraphs/:nodeId
 * Get sub-graph for a specific node in a graph
 */
router.get('/:id/subgraphs/:nodeId', async (req, res) => {
  try {
    const subGraphs = await graphCatalogService.getSubGraphs(req.params.id);
    const nodeId = req.params.nodeId;

    if (subGraphs && subGraphs[nodeId]) {
      res.json({ success: true, data: subGraphs[nodeId] });
    } else {
      res.status(404).json({ success: false, error: 'Subgraph not found for this node' });
    }
  } catch (error) {
    console.error('[GraphCatalog] SubGraph for node error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/graph-catalog
 * Create new graph
 * Supports sub-graph creation with parentGraphId and parentNodeId
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      namespace,
      type,
      description,
      version,
      tags,
      isPublic,
      parentId,
      parentGraphId,  // For sub-graphs: the parent graph this decomposes from
      parentNodeId,   // For sub-graphs: the node ID in parent graph this implements
      nodes,
      edges,
      requiredParams,
      createdBy
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const graph = await graphCatalogService.createGraph({
      name,
      namespace,
      type,
      description,
      version,
      tags,
      isPublic,
      parentId,
      parentGraphId,
      parentNodeId,
      nodes,
      edges,
      requiredParams,
      createdBy
    });

    // Invalidate labels cache when new graph is created (may have new tags)
    await redisService.del(LABELS_CACHE_KEY);

    res.status(201).json({ success: true, data: graph });
  } catch (error) {
    console.error('[GraphCatalog] Create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v1/graph-catalog/:id
 * Update graph
 */
router.put('/:id', async (req, res) => {
  try {
    const updates = req.body;
    const graph = await graphCatalogService.updateGraph(req.params.id, updates);

    if (!graph) {
      return res.status(404).json({ success: false, error: 'Graph not found' });
    }

    // Invalidate labels cache when graph tags are updated
    if (updates.tags) {
      await redisService.del(LABELS_CACHE_KEY);
    }

    res.json({ success: true, data: graph });
  } catch (error) {
    console.error('[GraphCatalog] Update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/graph-catalog/:id
 * Delete graph
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await graphCatalogService.deleteGraph(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Graph not found' });
    }

    // Invalidate labels cache when graph is deleted
    await redisService.del(LABELS_CACHE_KEY);

    res.json({ success: true, message: 'Graph deleted' });
  } catch (error) {
    console.error('[GraphCatalog] Delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/:id/versions
 * Get all versions of a graph
 */
router.get('/:id/versions', async (req, res) => {
  try {
    const versions = await graphCatalogService.getVersions(req.params.id);
    res.json({ success: true, data: versions });
  } catch (error) {
    console.error('[GraphCatalog] Versions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/:id/version/:num
 * Get a specific version of a graph
 */
router.get('/:id/version/:num', async (req, res) => {
  try {
    const graph = await graphCatalogService.getVersion(req.params.id, req.params.num);
    if (!graph) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }
    res.json({ success: true, data: graph });
  } catch (error) {
    console.error('[GraphCatalog] Get version error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/graph-catalog/:id/version
 * Create a new version of a graph
 */
router.post('/:id/version', async (req, res) => {
  try {
    const result = await graphCatalogService.createNewVersion(req.params.id, req.body);
    await redisService.del(LABELS_CACHE_KEY);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('[GraphCatalog] Create version error:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v1/graph-catalog/:id/version/:num/promote
 * Promote a version to Production
 */
router.put('/:id/version/:num/promote', async (req, res) => {
  try {
    const result = await graphCatalogService.promoteVersion(req.params.id, req.params.num);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[GraphCatalog] Promote version error:', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/graph-catalog/:id/clone
 * Clone a graph
 */
router.post('/:id/clone', async (req, res) => {
  try {
    const overrides = req.body;
    const graph = await graphCatalogService.cloneGraph(req.params.id, overrides);
    res.status(201).json({ success: true, data: graph });
  } catch (error) {
    console.error('[GraphCatalog] Clone error:', error);
    if (error.message === 'Graph not found') {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/graph-catalog/:id/paths
 * Generate all possible execution paths for a graph
 */
router.get('/:id/paths', async (req, res) => {
  try {
    const { generatePathsForGraph } = require('../services/graph/graph-path-generator');
    const result = await generatePathsForGraph(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// CATALOG AI ASSISTANT (UTC-002)
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/v1/graph-catalog/assistant/chat (SSE stream)
 * Body: {
 *   query: string,
 *   sessionHistory?: [{role, content}],
 *   workspaceId?: string,
 *   workspaceName?: string,
 *   currentSelection?: [{id, name, type}],
 *   mode?: 'tool_selection' | 'pattern_analysis' | 'graph_design' | 'general',
 *   language?: string
 * }
 */
router.post('/assistant/chat', async (req, res) => {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ success: false, error: 'query (string) is required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let clientClosed = false;
  req.on('close', () => { clientClosed = true; });

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 15000);

  try {
    const catalogAssistant = require('../services/catalog/catalog-assistant.service');
    sendEvent('start', { mode: req.body.mode || 'general' });

    for await (const event of catalogAssistant.chat(req.body)) {
      if (clientClosed) break;
      sendEvent(event.type || 'message', event);
      if (event.type === 'done' || event.type === 'error' || event.type === 'max_iterations') {
        break;
      }
    }
    sendEvent('end', { ok: true });
  } catch (err) {
    sendEvent('error', { error: err.message });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

// ═══════════════════════════════════════════════════════════════
// PATTERN MATCHING (UTC-001)
// ═══════════════════════════════════════════════════════════════

/**
 * POST /api/v1/graph-catalog/patterns/analyze
 * Full workspace pattern analysis — extracts subgraphs, finds catalog matches.
 * Body: { workspaceId, threshold?, minNodes?, maxNodes?, matchLimit? }
 */
router.post('/patterns/analyze', async (req, res) => {
  try {
    const patternMatcher = require('../services/catalog/pattern-matcher.service');
    const { workspaceId, threshold, minNodes, maxNodes, matchLimit } = req.body;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'workspaceId is required' });
    }
    const result = await patternMatcher.analyzeWorkspacePatterns(workspaceId, {
      threshold, minNodes, maxNodes, matchLimit
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/graph-catalog/patterns/match
 * Match a single subgraph against the catalog.
 * Body: { subgraph: { nodes, edges, textSummary, features }, threshold?, limit? }
 */
router.post('/patterns/match', async (req, res) => {
  try {
    const patternMatcher = require('../services/catalog/pattern-matcher.service');
    const { subgraph, threshold, limit } = req.body;
    if (!subgraph) {
      return res.status(400).json({ success: false, error: 'subgraph is required' });
    }
    const matches = await patternMatcher.findMatches(subgraph, { threshold, limit });
    res.json({ success: true, data: { matches } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/graph-catalog/patterns/preview-replacement
 * Preview what would change if a subgraph is replaced.
 * Body: { workspaceId, subgraphId, catalogEntryId }
 */
router.post('/patterns/preview-replacement', async (req, res) => {
  try {
    const patternMatcher = require('../services/catalog/pattern-matcher.service');
    const { workspaceId, subgraphId, catalogEntryId } = req.body;
    if (!workspaceId || !subgraphId || !catalogEntryId) {
      return res.status(400).json({ success: false, error: 'workspaceId, subgraphId, and catalogEntryId are required' });
    }
    const result = await patternMatcher.previewReplacement(workspaceId, subgraphId, catalogEntryId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/graph-catalog/patterns/execute-replacement
 * Execute a pattern replacement (destructive — requires confirm: true).
 * Body: { workspaceId, subgraphId, catalogEntryId, confirm: true }
 */
router.post('/patterns/execute-replacement', async (req, res) => {
  try {
    const patternMatcher = require('../services/catalog/pattern-matcher.service');
    const { workspaceId, subgraphId, catalogEntryId, confirm } = req.body;
    if (!workspaceId || !subgraphId || !catalogEntryId) {
      return res.status(400).json({ success: false, error: 'workspaceId, subgraphId, and catalogEntryId are required' });
    }
    const result = await patternMatcher.executeReplacement(workspaceId, subgraphId, catalogEntryId, {
      confirm: confirm === true
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
