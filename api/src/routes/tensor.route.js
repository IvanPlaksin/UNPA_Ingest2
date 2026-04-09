/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENSOR MONITORING API ROUTES
 *
 * Real-time performance monitoring endpoints
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { getTensorService } = require('../services/tensor.service');
const memgraphService = require('../services/memgraph.service');

// ────────────────────────────────────────────────────────────────────────────
// TENSOR ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/tensors/status
 * Get full tensor monitoring status
 */
router.get('/status', (req, res) => {
  try {
    const tensorService = getTensorService();
    const status = tensorService.getStatus();

    // Add database connection info
    status.database = {
      ...memgraphService.getConnectionInfo(),
      stats: memgraphService.getStats()
    };

    res.json(status);
  } catch (error) {
    console.error('[Tensor API] Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/metrics
 * Get all metrics grouped by tensor name
 */
router.get('/metrics', (req, res) => {
  try {
    const tensorService = getTensorService();
    res.json(tensorService.getAllMetrics());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/metrics/:name
 * Get metrics for specific tensor type
 */
router.get('/metrics/:name', (req, res) => {
  try {
    const tensorService = getTensorService();
    const name = decodeURIComponent(req.params.name);
    res.json(tensorService.getMetrics(name));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/active
 * Get currently active tensors
 */
router.get('/active', (req, res) => {
  try {
    const tensorService = getTensorService();
    res.json(tensorService.getActive());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/recent
 * Get recent tensors
 */
router.get('/recent', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const tensorService = getTensorService();
    res.json(tensorService.getRecent(parseInt(limit)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/alerts
 * Get recent alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const tensorService = getTensorService();
    res.json(tensorService.getAlerts(parseInt(limit)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/graph
 * Get causal graph for visualization
 */
router.get('/graph', (req, res) => {
  try {
    const tensorService = getTensorService();
    res.json(tensorService.getCausalGraph());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/tensors/threshold
 * Set performance threshold for tensor type
 */
router.post('/threshold', (req, res) => {
  try {
    const { name, thresholdMs } = req.body;
    if (!name || typeof thresholdMs !== 'number') {
      return res.status(400).json({ error: 'name and thresholdMs required' });
    }
    const tensorService = getTensorService();
    tensorService.setThreshold(name, thresholdMs);
    res.json({ success: true, name, thresholdMs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/tensors/toggle
 * Toggle tensor monitoring on/off
 */
router.post('/toggle', (req, res) => {
  try {
    const tensorService = getTensorService();
    const newState = tensorService.toggle();
    res.json({ success: true, enabled: newState });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/tensors/enable
 * Enable tensor monitoring
 */
router.post('/enable', (req, res) => {
  try {
    const tensorService = getTensorService();
    tensorService.enable();
    res.json({ success: true, enabled: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/tensors/disable
 * Disable tensor monitoring
 */
router.post('/disable', (req, res) => {
  try {
    const tensorService = getTensorService();
    tensorService.disable();
    res.json({ success: true, enabled: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/connections
 * Get detailed active connection information
 */
router.get('/connections', (req, res) => {
  try {
    const tensorService = getTensorService();
    res.json({
      connections: tensorService.getActiveConnections(),
      stats: tensorService.getConnectionStats()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tensors/stream
 * SSE endpoint for real-time tensor updates
 */
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const tensorService = getTensorService();

  // Send initial status
  res.write(`data: ${JSON.stringify(tensorService.getStatus())}\n\n`);

  // Send updates every 2 seconds
  const interval = setInterval(() => {
    try {
      const status = tensorService.getStatus();
      status.database = {
        ...memgraphService.getConnectionInfo(),
        stats: memgraphService.getStats()
      };
      res.write(`data: ${JSON.stringify(status)}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
  }, 2000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(interval);
  });
});

module.exports = router;
