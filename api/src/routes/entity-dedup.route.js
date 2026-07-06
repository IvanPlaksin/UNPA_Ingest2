'use strict';

const { Router } = require('express');
const router = Router();

function dedup() { return require('../services/entity-store/entity-dedup.service'); }

// GET /api/v1/entity-dedup/stats
router.get('/stats', async (req, res) => {
  try {
    res.json({ ok: true, data: await dedup().getDedupStats() });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// GET /api/v1/entity-dedup/duplicates
router.get('/duplicates', async (req, res) => {
  try {
    const { namespace, limit = 100 } = req.query;
    const candidates = await dedup().findDuplicateCandidates({ namespace, limit: parseInt(limit) });
    res.json({ ok: true, count: candidates.length, data: candidates });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// POST /api/v1/entity-dedup/merge
router.post('/merge', async (req, res) => {
  try {
    const { sourceId, targetId, reason, canonicalType } = req.body || {};
    if (!sourceId || !targetId) return res.status(400).json({ ok: false, error: 'sourceId and targetId required' });
    const result = await dedup().mergeEntities(sourceId, targetId, { reason, canonicalType });
    res.json({ ok: true, data: result });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// POST /api/v1/entity-dedup/auto-merge
router.post('/auto-merge', async (req, res) => {
  try {
    const { confidenceThreshold = 1.0, maxMerges = 50, dryRun = false } = req.body || {};
    const result = await dedup().batchAutoMerge({
      confidenceThreshold: parseFloat(confidenceThreshold),
      maxMerges: parseInt(maxMerges),
      dryRun: dryRun === true || dryRun === 'true',
    });
    res.json({ ok: true, data: result });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// GET /api/v1/entity-dedup/history
router.get('/history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const history = await dedup().getMergeHistory({ limit: parseInt(limit) });
    res.json({ ok: true, count: history.length, data: history });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
