'use strict';
const express = require('express');
const router  = express.Router();
const svc     = require('../services/vectors.service');

const ok  = (res, data)       => res.json({ success: true, data });
const err = (res, e, code=500) => res.status(code).json({ success: false, error: e.message });

// ── Collections ──────────────────────────────────────────────────────

// GET /api/v1/vectors/collections
router.get('/collections', async (_req, res) => {
  try { ok(res, await svc.listCollections()); }
  catch (e) { err(res, e); }
});

// GET /api/v1/vectors/collections/:name
router.get('/collections/:name', async (req, res) => {
  try { ok(res, await svc.getCollectionInfo(req.params.name)); }
  catch (e) { err(res, e); }
});

// GET /api/v1/vectors/collections/:name/count
router.get('/collections/:name/count', async (req, res) => {
  try {
    const filter = svc.buildFilter(req.query);
    ok(res, { count: await svc.countPoints(req.params.name, filter) });
  } catch (e) { err(res, e); }
});

// ── Browse / scroll ──────────────────────────────────────────────────

// GET /api/v1/vectors/collections/:name/points
// Query: limit, offset, entityType, epistemicLayer, sourceDocumentId, methodologyId
router.get('/collections/:name/points', async (req, res) => {
  try {
    const { limit = 50, offset, ...filterParams } = req.query;
    const filter = svc.buildFilter(filterParams);
    ok(res, await svc.browsePoints(req.params.name, {
      limit:      Math.min(Number(limit), 200),
      offset:     offset || null,
      filter,
      withVector: req.query.withVector === 'true',
    }));
  } catch (e) { err(res, e); }
});

// GET /api/v1/vectors/collections/:name/points/:id
router.get('/collections/:name/points/:id', async (req, res) => {
  try {
    const c      = require('../services/qdrant.service');
    const client = c.client || c;
    const result = await client.retrieve(req.params.name, {
      ids: [req.params.id], with_vector: true, with_payload: true,
    });
    const pt = (result?.result ?? result ?? [])[0];
    if (!pt) return res.status(404).json({ success: false, error: 'Point not found' });
    ok(res, pt);
  } catch (e) { err(res, e); }
});

// ── Semantic search ───────────────────────────────────────────────────

// POST /api/v1/vectors/collections/:name/search
// Body: { text, limit, filter: {entityType, epistemicLayer, ...}, scoreThreshold }
router.post('/collections/:name/search', async (req, res) => {
  try {
    const { text, limit = 20, scoreThreshold = 0.1, ...filterParams } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'text required' });
    const filter = svc.buildFilter(filterParams);
    ok(res, await svc.semanticSearch(req.params.name, { text, limit, filter, scoreThreshold }));
  } catch (e) { err(res, e); }
});

// ── k-NN ──────────────────────────────────────────────────────────────

// POST /api/v1/vectors/collections/:name/knn
// Body: { pointId, k }
router.post('/collections/:name/knn', async (req, res) => {
  try {
    const { pointId, k = 10, ...filterParams } = req.body;
    if (!pointId) return res.status(400).json({ success: false, error: 'pointId required' });
    const filter = svc.buildFilter(filterParams);
    ok(res, await svc.getKNN(req.params.name, pointId, { k, filter }));
  } catch (e) { err(res, e); }
});

// POST /api/v1/vectors/collections/:name/knn-graph
// Body: { pointIds?, k, limit, force, ...filterParams }
router.post('/collections/:name/knn-graph', async (req, res) => {
  try {
    const { pointIds, k = 5, limit = 100, force = false, ...filterParams } = req.body;
    const filter = svc.buildFilter(filterParams);
    ok(res, await svc.buildKNNGraph(req.params.name, {
      pointIds, k,
      limit: Math.min(Math.max(Number(limit), 10), 500),
      filter,
      force: Boolean(force),
    }));
  } catch (e) { err(res, e); }
});

// DELETE /api/v1/vectors/collections/:name/knn-graph/cache
router.delete('/collections/:name/knn-graph/cache', (req, res) => {
  svc.invalidateKNNCache(req.params.name);
  ok(res, { invalidated: true, collection: req.params.name });
});

// GET /api/v1/vectors/knn-cache/stats
router.get('/knn-cache/stats', (req, res) => {
  ok(res, svc.knnCacheStats());
});

// ── Projection (PCA) ──────────────────────────────────────────────────

// POST /api/v1/vectors/collections/:name/projection
// Body: { limit, dims, filter }
router.post('/collections/:name/projection', async (req, res) => {
  try {
    const { limit = 500, dims = 2, ...filterParams } = req.body;
    const filter = svc.buildFilter(filterParams);
    ok(res, await svc.computeProjection(req.params.name, {
      limit: Math.min(Number(limit), 2000),
      dims:  Number(dims),
      filter,
    }));
  } catch (e) { err(res, e); }
});

// ── Collection statistics ─────────────────────────────────────────────

// GET /api/v1/vectors/collections/:name/stats
router.get('/collections/:name/stats', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 1500), 5000);
    ok(res, await svc.getCollectionStats(req.params.name, { sampleLimit: limit }));
  } catch (e) { err(res, e); }
});

// ── Radius (Semantic Lens) search ────────────────────────────────────

// POST /api/v1/vectors/collections/:name/radius-search
// Body: { vectorId, radius (0-1), limit }
router.post('/collections/:name/radius-search', async (req, res) => {
  try {
    const { vectorId, radius = 0.7, limit = 100 } = req.body;
    if (!vectorId) return res.status(400).json({ success: false, error: 'vectorId required' });
    ok(res, await svc.radiusSearch(req.params.name, {
      vectorId, radius: parseFloat(radius), limit: Math.min(parseInt(limit), 500),
    }));
  } catch (e) { err(res, e); }
});

// ── Similarity matrix ─────────────────────────────────────────────────

// POST /api/v1/vectors/collections/:name/similarity
// Body: { pointIds: string[] }
router.post('/collections/:name/similarity', async (req, res) => {
  try {
    const { pointIds } = req.body;
    if (!Array.isArray(pointIds) || pointIds.length === 0)
      return res.status(400).json({ success: false, error: 'pointIds array required' });
    ok(res, await svc.computeSimilarityMatrix(req.params.name, pointIds));
  } catch (e) { err(res, e); }
});

module.exports = router;
