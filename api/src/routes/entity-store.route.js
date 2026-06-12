'use strict';
const express = require('express');
const { entityStoreService }    = require('../services/knowledge/entity-store.service');
const { clusterPyramidService } = require('../services/knowledge/cluster-pyramid.service');
const { viewportService }       = require('../services/knowledge/viewport.service');
const router = express.Router();

// GET /api/v1/entity-store/namespaces
router.get('/namespaces', async (req, res) => {
  try {
    res.json({ success: true, data: await entityStoreService.listNamespaces() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/graph?namespace=X
router.get('/graph', async (req, res) => {
  try {
    const { namespace } = req.query;
    res.json({ success: true, data: await entityStoreService.getEntityGraph({ namespace: namespace || null }) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/stats
router.get('/stats', async (req, res) => {
  try {
    res.json({ success: true, data: await entityStoreService.getStats() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/layout — save layout snapshot for a namespace
router.post('/layout', async (req, res) => {
  try {
    const { namespace, algorithm, positions, config, label } = req.body;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const result = await entityStoreService.saveLayout(namespace, { algorithm, positions, config, label });
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/layout?namespace=X — load saved layout
router.get('/layout', async (req, res) => {
  try {
    const { namespace } = req.query;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const layout = await entityStoreService.getLayout(namespace);
    res.json({ success: true, data: layout });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/pyramid/build — build cluster pyramid for a namespace
router.post('/pyramid/build', async (req, res) => {
  try {
    const { namespace, minCommunitySize = 2, resolution = 1.0 } = req.body;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const result = await clusterPyramidService.buildPyramid(namespace, { minCommunitySize, resolution });
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/pyramid/status?namespace=X
router.get('/pyramid/status', async (req, res) => {
  try {
    const { namespace } = req.query;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const status = await clusterPyramidService.getStatus(namespace);
    res.json({ success: true, data: status });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/pyramid/layout — layout existing pyramid (write x/y into graph)
router.post('/pyramid/layout', async (req, res) => {
  try {
    const { namespace, canvasWidth = 10000, canvasHeight = 10000 } = req.body;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const start = Date.now();
    await clusterPyramidService.layoutPyramid(namespace, { canvasWidth, canvasHeight });
    const status = await clusterPyramidService.getStatus(namespace);
    res.json({ success: true, data: { ...status, elapsed: Date.now() - start } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/pyramid/build-and-layout — full pipeline in one call
router.post('/pyramid/build-and-layout', async (req, res) => {
  try {
    const { namespace, minCommunitySize = 2, resolution = 1.0, canvasWidth = 10000, canvasHeight = 10000 } = req.body;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const result = await clusterPyramidService.buildAndLayout(namespace, { minCommunitySize, resolution, canvasWidth, canvasHeight });
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/viewport?namespace=X&minX=&minY=&maxX=&maxY=&level=0&budget=400
router.get('/viewport', async (req, res) => {
  try {
    const { namespace, minX, minY, maxX, maxY, level = '0', budget = '400' } = req.query;
    if (!namespace) return res.status(400).json({ success: false, error: 'namespace required' });
    const result = await viewportService.getViewport({
      namespace,
      bbox:   { minX: +minX || 0, minY: +minY || 0, maxX: +maxX || 10000, maxY: +maxY || 10000 },
      level:  parseInt(level),
      budget: parseInt(budget),
    });
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/viewport/expand — get children of a cluster
router.post('/viewport/expand', async (req, res) => {
  try {
    const { clusterId } = req.body;
    if (!clusterId) return res.status(400).json({ success: false, error: 'clusterId required' });
    const result = await viewportService.expandCluster(clusterId);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/import/:docId
router.post('/import/:docId', async (req, res) => {
  try {
    const { entityIds, namespace } = req.body;
    const result = await entityStoreService.importFromDocument(req.params.docId, { entityIds, namespace });
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store
router.post('/', async (req, res) => {
  try {
    const entity = await entityStoreService.createEntity(req.body);
    res.status(201).json({ success: true, data: entity });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store?namespace=X&type=Y&search=Z
router.get('/', async (req, res) => {
  try {
    const { namespace, type, search } = req.query;
    const data = await entityStoreService.listEntities({
      namespace: namespace || null,
      type:      type      || null,
      search:    search    || null,
    });
    res.json({ success: true, count: data.length, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /api/v1/entity-store/namespace/:ns  (must be before /:id)
router.delete('/namespace/:ns', async (req, res) => {
  try {
    res.json({ success: true, data: await entityStoreService.deleteNamespace(req.params.ns) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/:id
router.get('/:id', async (req, res) => {
  try {
    const entity = await entityStoreService.getEntity(req.params.id);
    if (!entity) return res.status(404).json({ success: false, error: 'Entity not found' });
    res.json({ success: true, data: entity });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /api/v1/entity-store/:id
router.put('/:id', async (req, res) => {
  try {
    const entity = await entityStoreService.updateEntity(req.params.id, req.body);
    if (!entity) return res.status(404).json({ success: false, error: 'Entity not found' });
    res.json({ success: true, data: entity });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /api/v1/entity-store/:id
router.delete('/:id', async (req, res) => {
  try {
    res.json({ success: true, data: await entityStoreService.deleteEntity(req.params.id) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
