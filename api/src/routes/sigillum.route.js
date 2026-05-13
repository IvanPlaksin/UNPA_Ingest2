'use strict';

/**
 * Sigillum REST API — Git-like versioning for the Knowledge Graph
 *
 * Base path: /api/v1/sigillum
 *
 * Branches:
 *   GET    /branches                    — list branches
 *   POST   /branches                    — create branch
 *   GET    /branches/:branchId          — get branch
 *   GET    /branches/name/:name         — find branch by name
 *   POST   /branches/ensure-main        — ensure main branch exists
 *
 * Snapshots:
 *   GET    /snapshots/:snapshotId       — get snapshot
 *   POST   /snapshots                   — create snapshot (namespace-wide)
 *   POST   /snapshots/partial           — create snapshot (specific entityIds)
 *   GET    /branches/:branchId/snapshots — list snapshots on branch
 *
 * Seals:
 *   POST   /seals                       — create seal
 *   GET    /seals/:sealId               — get seal
 *   GET    /seals/:sealId/verify        — verify seal integrity
 *   GET    /branches/:branchId/seals    — list seals on branch
 *
 * Queries:
 *   GET    /diff?from=:id&to=:id        — diff two snapshots
 *   GET    /snapshots/:snapshotId/query — read graph as of snapshot
 *   GET    /snapshots/:snapshotId/entity/:entityId — get entity at snapshot
 */

const express = require('express');
const router = express.Router();

function getSigillum() {
  return require('../services/sigillum/sigillum.service').getSigillumService();
}

// ─── Branches ──────────────────────────────────────────────────────────────

router.get('/branches', async (req, res) => {
  try {
    const { namespace, limit = 50 } = req.query;
    const branches = await getSigillum().listBranches(namespace || null, Number(limit));
    res.json({ success: true, branches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/branches', async (req, res) => {
  try {
    const { name, namespace, fromBranchId, fromSnapshotId, createdBy } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const branch = await getSigillum().createBranch({ name, namespace, fromBranchId, fromSnapshotId, createdBy });
    res.status(201).json({ success: true, branch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/branches/ensure-main', async (req, res) => {
  try {
    const { namespace } = req.body;
    const branch = await getSigillum().ensureMainBranch(namespace || null);
    res.json({ success: true, branch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/branches/name/:name', async (req, res) => {
  try {
    const { namespace } = req.query;
    const branch = await getSigillum().getBranchByName(req.params.name, namespace || null);
    if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });
    res.json({ success: true, branch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/branches/:branchId', async (req, res) => {
  try {
    const branch = await getSigillum().getBranch(req.params.branchId);
    res.json({ success: true, branch });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/branches/:branchId/snapshots', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const snapshots = await getSigillum().listSnapshots(req.params.branchId, Number(limit), Number(offset));
    res.json({ success: true, snapshots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/branches/:branchId/seals', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const seals = await getSigillum().listSeals(req.params.branchId, null, Number(limit));
    res.json({ success: true, seals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Snapshots ─────────────────────────────────────────────────────────────

router.post('/snapshots', async (req, res) => {
  try {
    const { branchId, namespace, message, createdBy } = req.body;
    if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });
    const result = await getSigillum().createSnapshot({ branchId, namespace, message, createdBy });
    res.status(result.changed ? 201 : 200).json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.post('/snapshots/partial', async (req, res) => {
  try {
    const { branchId, entityIds, message, createdBy } = req.body;
    if (!branchId) return res.status(400).json({ success: false, error: 'branchId is required' });
    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return res.status(400).json({ success: false, error: 'entityIds must be a non-empty array' });
    }
    const result = await getSigillum().createPartialSnapshot({ branchId, entityIds, message, createdBy });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/snapshots/:snapshotId', async (req, res) => {
  try {
    const snapshot = await getSigillum().getSnapshot(req.params.snapshotId);
    res.json({ success: true, snapshot });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/snapshots/:snapshotId/query', async (req, res) => {
  try {
    const { namespace } = req.query;
    const result = await getSigillum().queryAsOfSnapshot(req.params.snapshotId, namespace || null);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/snapshots/:snapshotId/entity/:entityId', async (req, res) => {
  try {
    const result = await getSigillum().getEntityAtSnapshot(
      req.params.snapshotId,
      req.params.entityId
    );
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ─── Seals ─────────────────────────────────────────────────────────────────

router.post('/seals', async (req, res) => {
  try {
    const { snapshotId, sealType, certifiedBy, metadata } = req.body;
    if (!snapshotId) return res.status(400).json({ success: false, error: 'snapshotId is required' });
    const seal = await getSigillum().createSeal({ snapshotId, sealType, certifiedBy, metadata });
    res.status(201).json({ success: true, seal });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/seals/:sealId', async (req, res) => {
  try {
    const seal = await getSigillum().getSeal(req.params.sealId);
    res.json({ success: true, seal });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

router.get('/seals/:sealId/verify', async (req, res) => {
  try {
    const result = await getSigillum().verifySeal(req.params.sealId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ─── Queries ───────────────────────────────────────────────────────────────

router.get('/diff', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, error: '"from" and "to" snapshot IDs are required' });
    const result = await getSigillum().diffSnapshots(from, to);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

module.exports = router;
