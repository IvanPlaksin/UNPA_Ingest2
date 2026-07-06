'use strict';
const express = require('express');
const { entityStoreService }    = require('../services/knowledge/entity-store.service');
const { supersessionService }   = require('../services/knowledge/supersession.service');
const { impactAnalysisService } = require('../services/knowledge/impact-analysis.service');
const { clusterPyramidService } = require('../services/knowledge/cluster-pyramid.service');
const { viewportService }       = require('../services/knowledge/viewport.service');
const edgeWeightService         = require('../services/knowledge/edge-weight.service');
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

// GET /api/v1/entity-store/rel-weights
router.get('/rel-weights', async (req, res) => {
  try {
    const data = await edgeWeightService.getWeightsWithEdgeCounts();
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/rel-weights/recalculate?includeDegree=true
router.post('/rel-weights/recalculate', async (req, res) => {
  try {
    const includeDegree = req.query.includeDegree === 'true';
    const stats = await edgeWeightService.recalculateAllEdgeCosts(includeDegree);
    res.json({ success: true, data: { ...stats, includeDegree } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/rel-weights/unknown — relTypes not in weight table
router.get('/rel-weights/unknown', async (req, res) => {
  try {
    const mg = require('../services/memgraph.service');
    // Get all known relTypes from weight table
    const knownRows = await mg.runQuery(
      `MATCH (w:RelTypeWeight) RETURN w.relType AS relType`, {}
    );
    const known = new Set(knownRows.map(r => r.relType));

    const allRows = await mg.runQuery(
      `MATCH ()-[r:ES_RELATED_TO]->()
       WHERE r.relType IS NOT NULL
       RETURN r.relType AS relType, count(*) AS cnt
       ORDER BY cnt DESC`,
      {}
    );
    const rows = allRows
      .filter(r => !known.has(r.relType))
      .slice(0, 20)
      .map(r => ({
        relType: r.relType,
        count: typeof r.cnt === 'object' ? (r.cnt?.low ?? 0) : (r.cnt || 0),
      }));
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /api/v1/entity-store/rel-weights/:relType
router.put('/rel-weights/:relType', async (req, res) => {
  try {
    const { relType } = req.params;
    const { strength, description } = req.body;
    if (strength == null || typeof strength !== 'number' || strength <= 0 || strength > 1) {
      return res.status(400).json({ success: false, error: 'strength must be a number in (0, 1]' });
    }
    const stats = await edgeWeightService.updateWeight(relType, strength, description);
    res.json({ success: true, data: stats });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/paths/interpret
router.post('/paths/interpret', async (req, res) => {
  try {
    const { fromEntity, toEntity, paths, structuralAnalysis } = req.body;
    if (!fromEntity || !toEntity) {
      return res.status(400).json({ success: false, error: 'fromEntity and toEntity are required' });
    }
    const pathInterpreter = require('../services/knowledge/path-interpreter.service');
    const result = await pathInterpreter.interpretPathConnection(fromEntity, toEntity, paths, structuralAnalysis);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/paths?from=<id>&to=<id>&k=5
router.get('/paths', async (req, res) => {
  try {
    const { from, to, k = '5' } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, error: 'from and to entity ids are required' });
    if (from === to) return res.status(400).json({ success: false, error: 'from and to must be different entities' });
    const data = await entityStoreService.findKShortestPaths(from, to, parseInt(k) || 5);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/docrefs?namespace=X
router.get('/docrefs', async (req, res) => {
  try {
    const data = await entityStoreService.getDocumentRefs({ namespace: req.query.namespace || null });
    res.json({ success: true, count: data.length, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Impact Analysis endpoints ─────────────────────────────────────────────────

// GET /api/v1/entity-store/:id/impact?maxDepth=5&includeStructural=true
router.get('/:id/impact', async (req, res) => {
  try {
    const { maxDepth = '5', includeStructural = 'true' } = req.query;
    const data = await impactAnalysisService.analyzeImpact(req.params.id, {
      maxDepth:          Math.min(parseInt(maxDepth) || 5, 8),
      includeStructural: includeStructural !== 'false',
    });
    res.json({ success: true, data });
  } catch (e) { res.status(e.message.includes('not found') ? 404 : 500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/:id/impact-summary — lightweight count + risk level
router.get('/:id/impact-summary', async (req, res) => {
  try {
    const data = await impactAnalysisService.quickSummary(req.params.id);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── RelationshipEvidence endpoints ────────────────────────────────────────────

// GET /api/v1/entity-store/evidence?sourceId=X&targetId=Y&relType=Z
router.get('/evidence', async (req, res) => {
  try {
    const { sourceId, targetId, relType } = req.query;
    if (!sourceId || !targetId) return res.status(400).json({ success: false, error: 'sourceId and targetId are required' });
    const data = await entityStoreService.getRelationshipEvidence(sourceId, targetId, relType || null);
    res.json({ success: true, count: data.length, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/evidence — add a relationship evidence node manually
router.post('/evidence', async (req, res) => {
  try {
    const { sourceId, targetId, relType, documentId, context, confidence } = req.body;
    if (!sourceId || !targetId || !relType) return res.status(400).json({ success: false, error: 'sourceId, targetId and relType are required' });
    const id = await entityStoreService.addRelationshipEvidence(sourceId, targetId, relType, { documentId, context, confidence });
    res.status(201).json({ success: true, data: { id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Supersession endpoints ─────────────────────────────────────────────────────

// GET /api/v1/entity-store/:id/supersession-chain
router.get('/:id/supersession-chain', async (req, res) => {
  try {
    const data = await supersessionService.getSupersessionChain(req.params.id);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/:id/is-in-force
router.get('/:id/is-in-force', async (req, res) => {
  try {
    const data = await supersessionService.isInForce(req.params.id);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/:id/current-version
router.get('/:id/current-version', async (req, res) => {
  try {
    const data = await supersessionService.findCurrentVersion(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'No current version found' });
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/:id/supersession-family
router.get('/:id/supersession-family', async (req, res) => {
  try {
    const data = await supersessionService.getSupersessionFamily(req.params.id);
    res.json({ success: true, count: data.length, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/:id/supersedes/:olderId — create supersession link
router.post('/:id/supersedes/:olderId', async (req, res) => {
  try {
    const { reason, effectiveDate } = req.body;
    const data = await supersessionService.createSupersession(req.params.id, req.params.olderId, { reason, effectiveDate });
    res.status(201).json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// DELETE /api/v1/entity-store/:id/supersedes/:olderId — remove supersession link
router.delete('/:id/supersedes/:olderId', async (req, res) => {
  try {
    const data = await supersessionService.removeSupersession(req.params.id, req.params.olderId);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/v1/entity-store/:id/document-attrs — set document metadata attributes
router.patch('/:id/document-attrs', async (req, res) => {
  try {
    const data = await supersessionService.updateDocumentAttributes(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/v1/entity-store/backfill-mentions — create MENTIONS edges for existing data
router.post('/backfill-mentions', async (req, res) => {
  try {
    const { namespace } = req.body;
    const result = await entityStoreService.backfillMentionsEdges(namespace || null);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/v1/entity-store/:id/subgraph?depth=2  (must be before /:id)
router.get('/:id/subgraph', async (req, res) => {
  try {
    const data = await entityStoreService.getEntitySubgraph(req.params.id, parseInt(req.query.depth) || 2);
    res.json({ success: true, data });
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
