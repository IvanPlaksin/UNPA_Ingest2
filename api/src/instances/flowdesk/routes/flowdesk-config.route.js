/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLOWDESK CONFIG API ROUTES
 *
 * GET    /api/v1/flowdesk/config/:type          - Read configs
 * POST   /api/v1/flowdesk/config/:type          - Create config node
 * PATCH  /api/v1/flowdesk/config/:type/:id      - Update config node
 * DELETE /api/v1/flowdesk/config/:type/:id      - Delete config node
 * POST   /api/v1/flowdesk/config/invalidate     - Invalidate cache
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const VALID_TYPES = ['sla', 'queues', 'keywords', 'categories', 'domains', 'thresholds', 'scopes'];

const LABEL_MAP = {
  sla: 'SLAConfig',
  queues: 'QueueMapping',
  keywords: 'KeywordRule',
  categories: 'ServiceCategory',
  domains: 'DomainCode',
  thresholds: 'ConfidenceThreshold',
  scopes: 'ScopeRule',
};

function getLoader() {
  const { getFlowDeskConfigLoader } = require('../services/config-loader.service.js');
  return getFlowDeskConfigLoader();
}

function getMemgraph() {
  return require('../../../services/memgraph.service');
}

// ── READ ──
router.get('/:type', async (req, res) => {
  const { type } = req.params;
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` });
  }

  try {
    const loader = getLoader();
    let data;
    switch (type) {
      case 'sla':        data = await loader.getSLAConfig(); break;
      case 'queues':     data = await loader.getQueueMapping(); break;
      case 'keywords':   data = await loader.getKeywordRules(req.query.language || 'en'); break;
      case 'categories': data = await loader.getServiceCategories(req.query.level ? parseInt(req.query.level) : null); break;
      case 'domains':    data = await loader.getDomainCodes(); break;
      case 'thresholds': data = await loader.getConfidenceThresholds(); break;
      case 'scopes':     data = await loader.getScopeRules(); break;
    }
    res.json({ success: true, type, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── CREATE ──
router.post('/:type', async (req, res) => {
  const { type } = req.params;
  const label = LABEL_MAP[type];
  if (!label) return res.status(400).json({ success: false, error: 'Invalid type' });

  try {
    const memgraph = getMemgraph();
    const id = req.body.id || `${type}-${Date.now()}`;
    const props = { ...req.body, id, namespace: 'CORE' };
    delete props._id;

    const setClause = Object.keys(props).map(k => `n.${k} = $${k}`).join(', ');
    await memgraph.executeQuery(
      `CREATE (n:${label} {id: $id}) SET ${setClause}, n.createdAt = datetime()`,
      props
    );

    await getLoader().invalidateCache(type);
    res.status(201).json({ success: true, id, type });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── UPDATE ──
router.patch('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const label = LABEL_MAP[type];
  if (!label) return res.status(400).json({ success: false, error: 'Invalid type' });

  try {
    const memgraph = getMemgraph();
    const updates = { ...req.body };
    delete updates.id;
    delete updates._id;

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, message: 'No updates' });
    }

    const setClause = Object.keys(updates).map(k => `n.${k} = $${k}`).join(', ');
    const result = await memgraph.executeQuery(
      `MATCH (n:${label} {id: $id}) SET ${setClause}, n.updatedAt = datetime() RETURN n`,
      { id, ...updates }
    );

    if (!result.records?.length) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    await getLoader().invalidateCache(type);
    res.json({ success: true, id, type });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE ──
router.delete('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const label = LABEL_MAP[type];
  if (!label) return res.status(400).json({ success: false, error: 'Invalid type' });

  try {
    const memgraph = getMemgraph();
    await memgraph.executeQuery(`MATCH (n:${label} {id: $id}) DETACH DELETE n`, { id });
    await getLoader().invalidateCache(type);
    res.json({ success: true, deleted: true, id, type });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── INVALIDATE CACHE ──
router.post('/invalidate', async (req, res) => {
  try {
    const type = req.body.type || 'all';
    await getLoader().invalidateCache(type);
    res.json({ success: true, invalidated: type });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
