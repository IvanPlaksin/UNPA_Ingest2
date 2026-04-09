/**
 * Visualization API Routes
 * Graph data for frontend visualization (D3, Three.js, Cytoscape, vis.js)
 *
 * Endpoints:
 *   GET    /api/v1/visualization/graph       - Full graph
 *   POST   /api/v1/visualization/subgraph    - Subgraph around nodes
 *   POST   /api/v1/visualization/filter      - Filtered graph
 *   GET    /api/v1/visualization/clusters     - Graph clusters
 *   GET    /api/v1/visualization/node-types   - Node types summary
 *   GET    /api/v1/visualization/edge-types   - Edge types summary
 *   GET    /api/v1/visualization/stats        - Visualization statistics
 *
 * @module routes/visualization.routes
 */

const express = require('express');
const { graphVizService } = require('../services/visualization');

const router = express.Router();

/**
 * GET /graph
 * Get full graph for visualization
 * Query: ?format=d3&layout=force&limit=500&computeLayout=true
 */
router.get('/graph', (req, res) => {
  try {
    const { format, layout, limit, computeLayout } = req.query;

    const result = graphVizService.getGraph({
      format: format || 'd3',
      layout: layout || 'force',
      limit: limit ? parseInt(limit) : undefined,
      computeLayout: computeLayout !== 'false'
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[VizRoute] Get graph error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /subgraph
 * Get subgraph around specific nodes
 * Body: { nodeIds: string[], depth?: number, format?: string, layout?: string }
 */
router.post('/subgraph', (req, res) => {
  try {
    const { nodeIds, depth, format, layout } = req.body;

    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      return res.status(400).json({ success: false, error: 'nodeIds array is required' });
    }

    const result = graphVizService.getSubgraph(nodeIds, {
      depth: depth || 1,
      format: format || 'd3',
      layout: layout || 'force'
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[VizRoute] Get subgraph error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /filter
 * Get filtered graph
 * Body: { nodeTypes?, edgeTypes?, search?, limit?, format?, layout? }
 */
router.post('/filter', (req, res) => {
  try {
    const { nodeTypes, edgeTypes, search, limit, format, layout } = req.body;

    const result = graphVizService.getFilteredGraph(
      { nodeTypes, edgeTypes, search },
      { limit, format, layout }
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[VizRoute] Filter graph error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /clusters
 * Get graph clusters
 * Query: ?method=type&format=d3
 */
router.get('/clusters', (req, res) => {
  try {
    const { method, format } = req.query;

    const result = graphVizService.getClusters({
      method: method || 'type',
      format: format || 'd3'
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[VizRoute] Get clusters error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /node-types
 * Get node types summary
 */
router.get('/node-types', (req, res) => {
  try {
    const result = graphVizService.getNodeTypes();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[VizRoute] Get node types error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /edge-types
 * Get edge types summary
 */
router.get('/edge-types', (req, res) => {
  try {
    const result = graphVizService.getEdgeTypes();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[VizRoute] Get edge types error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /stats
 * Get visualization statistics
 */
router.get('/stats', (req, res) => {
  try {
    res.json({ success: true, stats: graphVizService.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
