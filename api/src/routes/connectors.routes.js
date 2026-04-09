/**
 * Connectors API Routes
 * Source connector management and data access
 *
 * Endpoints:
 *   POST   /api/v1/connectors/register        - Register a new connector
 *   GET    /api/v1/connectors                  - List all connectors
 *   GET    /api/v1/connectors/stats            - Source manager statistics
 *   GET    /api/v1/connectors/:name/status     - Get connector status
 *   POST   /api/v1/connectors/:name/connect    - Connect a connector
 *   POST   /api/v1/connectors/:name/disconnect - Disconnect a connector
 *   GET    /api/v1/connectors/:name/list       - List items from connector
 *   GET    /api/v1/connectors/:name/fetch      - Fetch item from connector
 *   POST   /api/v1/connectors/:name/ingest     - Fetch and ingest item
 *   POST   /api/v1/connectors/search           - Search across sources
 *   DELETE /api/v1/connectors/:name            - Unregister connector
 *   POST   /api/v1/connectors/:name/test       - Test connection
 *
 * @module routes/connectors.routes
 */

const express = require('express');
const { sourceManager } = require('../services/connectors');

const router = express.Router();

/**
 * POST /register
 * Register a new connector
 * Body: { name: string, type: 'filesystem'|'tfs'|'sharepoint', config?: object }
 */
router.post('/register', (req, res) => {
  try {
    const { name, type, config } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'name and type are required' });
    }

    sourceManager.register(name, type, config || {});

    res.status(201).json({
      success: true,
      message: `Connector ${name} registered`,
      connector: { name, type }
    });
  } catch (error) {
    console.error('[ConnectorsRoute] Register error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /
 * List all connectors
 */
router.get('/', (req, res) => {
  try {
    const connectors = sourceManager.listConnectors();
    res.json({ success: true, connectors });
  } catch (error) {
    console.error('[ConnectorsRoute] List error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /stats
 * Get source manager statistics
 */
router.get('/stats', (req, res) => {
  try {
    res.json({ success: true, stats: sourceManager.getStats() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /search
 * Search across sources
 * Body: { query: string, sources?: string[], limit?: number }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, sources, limit } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const result = await sourceManager.searchAll(query, { sources, limit });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ConnectorsRoute] Search error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /:name/status
 * Get connector status
 */
router.get('/:name/status', (req, res) => {
  try {
    const connector = sourceManager.get(req.params.name);

    if (!connector) {
      return res.status(404).json({ success: false, error: 'Connector not found' });
    }

    res.json({ success: true, status: connector.getInfo() });
  } catch (error) {
    console.error('[ConnectorsRoute] Status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:name/connect
 * Connect a connector
 */
router.post('/:name/connect', async (req, res) => {
  try {
    const result = await sourceManager.connect(req.params.name);
    res.json({ success: true, result });
  } catch (error) {
    console.error('[ConnectorsRoute] Connect error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:name/disconnect
 * Disconnect a connector
 */
router.post('/:name/disconnect', async (req, res) => {
  try {
    await sourceManager.disconnect(req.params.name);
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    console.error('[ConnectorsRoute] Disconnect error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:name/test
 * Test connection
 */
router.post('/:name/test', async (req, res) => {
  try {
    const connector = sourceManager.get(req.params.name);
    if (!connector) {
      return res.status(404).json({ success: false, error: 'Connector not found' });
    }

    const result = await connector.testConnection();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ConnectorsRoute] Test error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /:name/list
 * List items from connector
 * Query: ?path=&depth=1&recursive=false
 */
router.get('/:name/list', async (req, res) => {
  try {
    const { path, depth, recursive } = req.query;

    const result = await sourceManager.list(req.params.name, path || '', {
      depth: depth ? parseInt(depth) : 1,
      recursive: recursive === 'true'
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ConnectorsRoute] List items error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /:name/fetch
 * Fetch item from connector
 * Query: ?path=&parse=true
 */
router.get('/:name/fetch', async (req, res) => {
  try {
    const { path, parse } = req.query;

    if (!path) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }

    const result = await sourceManager.fetch(req.params.name, path, {
      parse: parse !== 'false'
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ConnectorsRoute] Fetch error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:name/ingest
 * Fetch and ingest item
 * Body: { path: string, domain?: string, clientId?: string }
 */
router.post('/:name/ingest', async (req, res) => {
  try {
    const { path, domain, clientId } = req.body;

    if (!path) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }

    const result = await sourceManager.fetchAndIngest(req.params.name, path, {
      domain,
      clientId
    });

    res.json(result);
  } catch (error) {
    console.error('[ConnectorsRoute] Ingest error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /:name
 * Unregister connector
 */
router.delete('/:name', async (req, res) => {
  try {
    const removed = await sourceManager.unregister(req.params.name);

    res.json({
      success: removed,
      message: removed ? 'Connector removed' : 'Connector not found'
    });
  } catch (error) {
    console.error('[ConnectorsRoute] Unregister error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
