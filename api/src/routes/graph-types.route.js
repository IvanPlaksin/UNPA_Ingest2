/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH TYPES API ROUTES
 * REST API for accessing node types, edge types, and domains from Core KB
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { getGraphTypeService } = require('../services/graph/GraphTypeService');

// ────────────────────────────────────────────────────────────────────────────
// NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /node-types
 * List all node types from Core KB
 * Query params: domain, category
 */
router.get('/node-types', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const { domain, category } = req.query;
    const types = await typeService.listNodeTypes({
      domain: domain || undefined,
      category: category || undefined,
    });

    res.json({
      success: true,
      data: types,
      total: types.length,
    });
  } catch (error) {
    console.error('[GraphTypes] List node types error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /node-types/:fullName
 * Get detailed node type by full name (e.g., "ingestion.parse_document")
 */
router.get('/node-types/:fullName', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const nodeType = await typeService.getNodeType(req.params.fullName);

    if (!nodeType) {
      return res.status(404).json({
        success: false,
        error: `Node type not found: ${req.params.fullName}`,
      });
    }

    res.json({
      success: true,
      data: nodeType,
    });
  } catch (error) {
    console.error('[GraphTypes] Get node type error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /node-types
 * Create a new custom node type
 */
router.post('/node-types', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const newType = await typeService.createNodeType(req.body);

    res.status(201).json({
      success: true,
      data: newType,
    });
  } catch (error) {
    console.error('[GraphTypes] Create node type error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /node-types/:fullName
 * Update an existing node type
 */
router.put('/node-types/:fullName', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const updated = await typeService.updateNodeType(req.params.fullName, req.body);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: `Node type not found: ${req.params.fullName}`,
      });
    }

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('[GraphTypes] Update node type error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /node-types/:fullName
 * Delete a node type
 */
router.delete('/node-types/:fullName', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const deleted = await typeService.deleteNodeType(req.params.fullName);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Node type not found: ${req.params.fullName}`,
      });
    }

    res.json({
      success: true,
      message: `Deleted node type: ${req.params.fullName}`,
    });
  } catch (error) {
    console.error('[GraphTypes] Delete node type error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// EDGE TYPES
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /edge-types
 * List all edge types from Core KB
 */
router.get('/edge-types', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const types = await typeService.listEdgeTypes();

    res.json({
      success: true,
      data: types,
      total: types.length,
    });
  } catch (error) {
    console.error('[GraphTypes] List edge types error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /edge-types/:name
 * Get edge type by name
 */
router.get('/edge-types/:name', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const edgeType = await typeService.getEdgeType(req.params.name);

    if (!edgeType) {
      return res.status(404).json({
        success: false,
        error: `Edge type not found: ${req.params.name}`,
      });
    }

    res.json({
      success: true,
      data: edgeType,
    });
  } catch (error) {
    console.error('[GraphTypes] Get edge type error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// DOMAINS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /domains
 * List all domains from Core KB
 */
router.get('/domains', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const domains = await typeService.listDomains();

    res.json({
      success: true,
      data: domains,
      total: domains.length,
    });
  } catch (error) {
    console.error('[GraphTypes] List domains error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// COMPATIBILITY
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /compatibility/:sourceType
 * Find compatible node types for a source type
 */
router.get('/compatibility/:sourceType', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const { edgeType } = req.query;
    const compatible = await typeService.findCompatibleNodeTypes({
      sourceType: req.params.sourceType,
      edgeType: edgeType || undefined,
    });

    res.json({
      success: true,
      data: compatible,
      total: compatible.length,
    });
  } catch (error) {
    console.error('[GraphTypes] Find compatible error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// CATALOG (Combined response for UI)
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /catalog
 * Get complete type catalog for UI (domains, node types grouped by domain)
 */
router.get('/catalog', async (req, res) => {
  try {
    const typeService = getGraphTypeService();
    await typeService.initialize();

    const [domains, nodeTypes, edgeTypes] = await Promise.all([
      typeService.listDomains(),
      typeService.listNodeTypes(),
      typeService.listEdgeTypes(),
    ]);

    // Group node types by domain
    const byDomain = {};
    for (const type of nodeTypes) {
      if (!byDomain[type.domain]) {
        byDomain[type.domain] = [];
      }
      byDomain[type.domain].push(type);
    }

    res.json({
      success: true,
      data: {
        domains,
        nodeTypes,
        edgeTypes,
        byDomain,
        stats: {
          domainCount: domains.length,
          nodeTypeCount: nodeTypes.length,
          edgeTypeCount: edgeTypes.length,
        },
      },
    });
  } catch (error) {
    console.error('[GraphTypes] Get catalog error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
