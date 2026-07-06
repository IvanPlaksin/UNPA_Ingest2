'use strict';

const { Router } = require('express');
const router = Router();

let _mg;
function mg() { if (!_mg) _mg = require('../services/memgraph.service'); return _mg; }

function es() { return require('../services/knowledge/entity-store.service').entityStoreService; }
function esSync() { return require('../services/extraction/es-sync.worker'); }

// GET /api/v1/es-sync/status
router.get('/status', async (req, res) => {
  try {
    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.aiExtractedAt IS NOT NULL
       RETURN COALESCE(d.esSyncStatus, 'PENDING') AS status, count(d) AS cnt`
    );
    const byStatus = {};
    for (const r of rows) {
      const key = r.status || 'PENDING';
      byStatus[key] = typeof r.cnt === 'object' ? (r.cnt?.low ?? 0) : (r.cnt || 0);
    }

    const unsynced = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.aiExtractedAt IS NOT NULL AND (d.esSyncStatus IS NULL OR d.esSyncStatus <> 'COMPLETED')
       RETURN count(d) AS cnt`
    );
    const unsyncedCount = unsynced[0]?.cnt;
    const unsyncedNum = typeof unsyncedCount === 'object' ? (unsyncedCount?.low ?? 0) : (unsyncedCount || 0);

    const esStats = await es().getStats();

    res.json({ ok: true, data: { documentsByStatus: byStatus, unsyncedDocuments: unsyncedNum, entityStore: esStats } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/v1/es-sync/unsynced
router.get('/unsynced', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.aiExtractedAt IS NOT NULL AND (d.esSyncStatus IS NULL OR d.esSyncStatus <> 'COMPLETED')
       RETURN d.id AS id, d.documentTitle AS title, d.unSymbol AS symbol,
              d.aiExtractedAt AS extractedAt, d.esSyncStatus AS syncStatus
       ORDER BY d.aiExtractedAt DESC
       LIMIT ${limit}`
    );
    res.json({ ok: true, data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/v1/es-sync/document/:id
router.post('/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { namespace = 'DEFAULT' } = req.body || {};

    // Reset sync status so importFromDocument re-processes all mentions
    await mg().runQuery(
      `MATCH (d:Document {id: $id}) SET d.esSyncStatus = 'PENDING'`,
      { id }
    ).catch(() => {});

    const result = await esSync().syncDocument(id, { namespace });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/v1/es-sync/batch
router.post('/batch', async (req, res) => {
  try {
    const { documentIds, namespace = 'DEFAULT', recalcEdgeCosts = true } = req.body || {};
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'documentIds array required' });
    }

    const result = await esSync().syncBatch(documentIds, { namespace, recalcEdgeCosts });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/v1/es-sync/sync-all-unsynced
router.post('/sync-all-unsynced', async (req, res) => {
  try {
    const { namespace = 'DEFAULT', limit = 50 } = req.body || {};
    const safeLimit = Math.min(parseInt(limit) || 50, 200);

    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.aiExtractedAt IS NOT NULL AND (d.esSyncStatus IS NULL OR d.esSyncStatus <> 'COMPLETED')
       RETURN d.id AS id
       ORDER BY d.aiExtractedAt ASC
       LIMIT ${safeLimit}`
    );
    const docIds = rows.map(r => r.id);

    if (docIds.length === 0) {
      return res.json({ ok: true, data: { message: 'No unsynced documents found', totalDocs: 0 } });
    }

    const result = await esSync().syncBatch(docIds, { namespace, recalcEdgeCosts: true });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
