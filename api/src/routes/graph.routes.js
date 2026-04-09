/**
 * Graph & GNN-RAG API Routes
 * REST endpoints for graph management, GNN-enhanced retrieval, and extraction
 *
 * Endpoints:
 *   GET    /api/v1/graph-rag/stats              - Graph statistics
 *   GET    /api/v1/graph-rag/nodes              - List nodes
 *   GET    /api/v1/graph-rag/nodes/:id          - Get node + edges
 *   POST   /api/v1/graph-rag/nodes              - Add nodes
 *   DELETE /api/v1/graph-rag/nodes/:id          - Delete node
 *   GET    /api/v1/graph-rag/edges              - List edges
 *   POST   /api/v1/graph-rag/edges              - Add edges
 *   POST   /api/v1/graph-rag/initialize         - Initialize graph
 *   POST   /api/v1/graph-rag/clear              - Clear graph
 *   POST   /api/v1/graph-rag/retrieve           - GNN-RAG retrieval
 *   POST   /api/v1/graph-rag/retrieve/multihop  - Multi-hop query
 *   POST   /api/v1/graph-rag/retrieve/hybrid    - Hybrid retrieval
 *   POST   /api/v1/graph-rag/extract            - Unified extraction
 *   POST   /api/v1/graph-rag/extract/gnn        - GNN-enhanced extraction
 *   POST   /api/v1/graph-rag/extract/batch      - Batch extraction
 *   GET    /api/v1/graph-rag/extract/stats      - Extraction stats
 *   GET    /api/v1/graph-rag/export             - Export graph
 *
 * @module routes/graph.routes
 */

const express = require('express');
const router = express.Router();
const { gnnRAGService, hybridRetriever, createHybridRetriever } = require('../services/gnn');
const { gnnEnhancedExtractor, unifiedExtractor } = require('../services/extraction');

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stats
 * Graph statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = gnnRAGService.getStats();
    res.json({
      success: true,
      stats: {
        nodes: stats.graphSize?.nodes || 0,
        edges: stats.graphSize?.edges || 0,
        cacheSize: stats.cacheSize || 0,
        cacheHitRate: stats.cacheHitRate,
        totalQueries: stats.totalQueries,
        avgRetrievalTime: stats.avgRetrievalTime
      }
    });
  } catch (error) {
    console.error('[GraphRoute] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /nodes
 * List graph nodes with optional filtering and pagination
 * Query: { type?, limit?, offset? }
 */
router.get('/nodes', (req, res) => {
  try {
    const { type, limit = 100, offset = 0 } = req.query;
    let nodes = [...gnnRAGService.graphCache.nodes.entries()].map(([id, node]) => ({ id, ...node }));

    if (type) {
      nodes = nodes.filter(n => n.type === type);
    }

    const total = nodes.length;
    nodes = nodes.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({ success: true, total, offset: parseInt(offset), limit: parseInt(limit), nodes });
  } catch (error) {
    console.error('[GraphRoute] List nodes error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /nodes/:id
 * Get a specific node with its edges
 */
router.get('/nodes/:id', (req, res) => {
  try {
    const nodeId = req.params.id;
    const node = gnnRAGService.graphCache.nodes.get(nodeId);

    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const edges = [];
    for (const [, edge] of gnnRAGService.graphCache.edges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        edges.push(edge);
      }
    }

    res.json({ success: true, node: { id: nodeId, ...node }, edges });
  } catch (error) {
    console.error('[GraphRoute] Get node error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /nodes
 * Add nodes to the graph
 * Body: { nodes: [{ id?, name, type, attributes? }] }
 */
router.post('/nodes', (req, res) => {
  try {
    const { nodes } = req.body;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ success: false, error: 'nodes array is required and must not be empty' });
    }

    for (const node of nodes) {
      if (!node.name) {
        return res.status(400).json({ success: false, error: 'Each node must have a name' });
      }
    }

    const nodesWithIds = nodes.map(node => ({
      id: node.id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...node
    }));

    gnnRAGService.addNodes(nodesWithIds);

    res.status(201).json({ success: true, added: nodesWithIds.length, nodes: nodesWithIds });
  } catch (error) {
    console.error('[GraphRoute] Add nodes error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /nodes/:id
 * Delete a node and its associated edges
 */
router.delete('/nodes/:id', (req, res) => {
  try {
    const nodeId = req.params.id;

    if (!gnnRAGService.graphCache.nodes.has(nodeId)) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    gnnRAGService.graphCache.nodes.delete(nodeId);

    // Remove associated edges
    const edgesToDelete = [];
    for (const [key, edge] of gnnRAGService.graphCache.edges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        edgesToDelete.push(key);
      }
    }
    for (const key of edgesToDelete) {
      gnnRAGService.graphCache.edges.delete(key);
    }

    // Remove from adjacency
    gnnRAGService.graphCache.adjacency.delete(nodeId);
    for (const [, neighbors] of gnnRAGService.graphCache.adjacency) {
      neighbors.delete(nodeId);
    }

    res.json({ success: true, message: 'Node deleted', edgesRemoved: edgesToDelete.length });
  } catch (error) {
    console.error('[GraphRoute] Delete node error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /edges
 * List graph edges
 * Query: { type?, limit? }
 */
router.get('/edges', (req, res) => {
  try {
    const { type, limit = 100 } = req.query;
    let edges = [...gnnRAGService.graphCache.edges.values()];

    if (type) {
      edges = edges.filter(e => e.type === type);
    }

    const total = edges.length;
    edges = edges.slice(0, parseInt(limit));

    res.json({ success: true, total, edges });
  } catch (error) {
    console.error('[GraphRoute] List edges error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /edges
 * Add edges to the graph
 * Body: { edges: [{ source, target, type }] }
 */
router.post('/edges', (req, res) => {
  try {
    const { edges } = req.body;

    if (!Array.isArray(edges) || edges.length === 0) {
      return res.status(400).json({ success: false, error: 'edges array is required and must not be empty' });
    }

    for (const edge of edges) {
      if (!edge.source || !edge.target) {
        return res.status(400).json({ success: false, error: 'Each edge must have source and target' });
      }
    }

    gnnRAGService.addEdges(edges);

    res.status(201).json({ success: true, added: edges.length });
  } catch (error) {
    console.error('[GraphRoute] Add edges error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /initialize
 * Initialize the graph with data
 * Body: { nodes: [], edges: [] }
 */
router.post('/initialize', async (req, res) => {
  try {
    const { nodes, edges } = req.body;

    if (!nodes && !edges) {
      return res.status(400).json({ success: false, error: 'nodes or edges are required' });
    }

    await gnnRAGService.initialize({ nodes: nodes || [], edges: edges || [] });

    res.json({
      success: true,
      message: 'Graph initialized',
      stats: {
        nodes: gnnRAGService.graphCache.nodes.size,
        edges: gnnRAGService.graphCache.edges.size
      }
    });
  } catch (error) {
    console.error('[GraphRoute] Initialize error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /clear
 * Clear the entire graph (requires confirmation)
 * Body: { confirm: true }
 */
router.post('/clear', (req, res) => {
  try {
    if (!req.body.confirm) {
      return res.status(400).json({ success: false, error: 'Must confirm with { confirm: true }' });
    }

    gnnRAGService.graphCache.nodes.clear();
    gnnRAGService.graphCache.edges.clear();
    gnnRAGService.graphCache.adjacency.clear();
    gnnRAGService.clearCache();

    res.json({ success: true, message: 'Graph cleared' });
  } catch (error) {
    console.error('[GraphRoute] Clear error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /retrieve
 * Retrieve relevant nodes using GNN-RAG
 * Body: { query: string, topK?: number, maxHops?: number }
 */
router.post('/retrieve', async (req, res) => {
  try {
    const { query, topK = 10, maxHops = 2 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required and must be a string' });
    }

    const result = await gnnRAGService.retrieve(query, { topK, maxHops });

    res.json({
      success: true,
      query,
      results: result.results,
      context: result.context,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('[GraphRoute] Retrieve error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /retrieve/multihop
 * Multi-hop query for complex reasoning
 * Body: { query: string, maxHops?: number }
 */
router.post('/retrieve/multihop', async (req, res) => {
  try {
    const { query, maxHops = 3 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required and must be a string' });
    }

    const result = await gnnRAGService.multiHopQuery(query, { maxHops });

    res.json({
      success: true,
      query,
      hops: result.hops,
      results: result.results,
      context: result.context,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('[GraphRoute] Multi-hop retrieve error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /retrieve/hybrid
 * Hybrid retrieval using multiple strategies
 * Body: { query: string, topK?: number, strategies?: string[], fusionMethod?: string }
 */
router.post('/retrieve/hybrid', async (req, res) => {
  try {
    const { query, topK = 10, strategies, fusionMethod } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required and must be a string' });
    }

    const retriever = (strategies || fusionMethod)
      ? createHybridRetriever({
          strategies: strategies || ['semantic', 'structural', 'gnn'],
          fusionMethod: fusionMethod || 'rrf'
        })
      : hybridRetriever;

    const result = await retriever.retrieve(query, { topK });

    res.json({
      success: true,
      query,
      results: result.results,
      byStrategy: result.byStrategy,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('[GraphRoute] Hybrid retrieve error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /extract
 * Extract entities and relations from text
 * Body: { text: string, method?: 'pattern'|'hybrid'|'dspy', domain?: string }
 */
router.post('/extract', async (req, res) => {
  try {
    const { text, method = 'hybrid', domain } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required and must be a string' });
    }

    if (text.length > 10000) {
      return res.status(400).json({ success: false, error: 'text exceeds maximum length of 10000 characters' });
    }

    const result = await unifiedExtractor.extract(text, { method, domain, verify: false });

    res.json({
      success: true,
      method,
      entities: result.entities,
      relations: result.relations,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('[GraphRoute] Extract error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /extract/gnn
 * GNN-enhanced extraction with graph context
 * Body: { text: string, domain?: string, updateGraph?: boolean }
 */
router.post('/extract/gnn', async (req, res) => {
  try {
    const { text, domain, updateGraph = false } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required and must be a string' });
    }

    const result = updateGraph
      ? await gnnEnhancedExtractor.incrementalExtract(text, { domain })
      : await gnnEnhancedExtractor.extract(text, { domain });

    res.json({
      success: true,
      entities: result.entities,
      relations: result.relations,
      metadata: result.metadata,
      graphUpdated: updateGraph
    });
  } catch (error) {
    console.error('[GraphRoute] GNN extract error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /extract/batch
 * Batch extraction from multiple texts
 * Body: { texts: string[], method?: string, domain?: string }
 */
router.post('/extract/batch', async (req, res) => {
  try {
    const { texts, method = 'hybrid', domain } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, error: 'texts array is required and must not be empty' });
    }

    if (texts.length > 20) {
      return res.status(400).json({ success: false, error: 'Maximum 20 texts per batch' });
    }

    const results = await gnnEnhancedExtractor.extractBatch(texts, { domain, extractionMode: method });

    res.json({
      success: true,
      results: results.results,
      summary: results.summary
    });
  } catch (error) {
    console.error('[GraphRoute] Batch extract error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /extract/stats
 * Get extraction statistics
 */
router.get('/extract/stats', (req, res) => {
  try {
    const stats = gnnEnhancedExtractor.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[GraphRoute] Extract stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /export
 * Export the current graph
 */
router.get('/export', (req, res) => {
  try {
    const data = gnnEnhancedExtractor.exportGraph();
    res.json({ success: true, data });
  } catch (error) {
    console.error('[GraphRoute] Export error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
