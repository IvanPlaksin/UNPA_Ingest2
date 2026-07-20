'use strict';

/**
 * Knowledge Dashboard API — aggregated composition of the knowledge base
 * (graph + vector parts) for the /knowledge-dashboard page.
 *
 *   GET /api/v1/knowledge-dashboard/graph-stats   (TASK-GT-010)
 *   GET /api/v1/knowledge-dashboard/vector-stats  (TASK-GT-011)
 */

const express = require('express');
const router = express.Router();

const { getGraphStatsService } = require('../services/knowledge-dashboard/graph-stats.service');
const { getVectorStatsService } = require('../services/knowledge-dashboard/vector-stats.service');

// GET /graph-stats — node/relationship/namespace aggregations. ?heavy=true adds maxDegree (slow).
router.get('/graph-stats', async (req, res) => {
    try {
        const stats = await getGraphStatsService().getGraphStats({ heavy: req.query.heavy === 'true' });
        res.json({ success: true, ...stats });
    } catch (e) {
        console.error('[KnowledgeDashboard] graph-stats error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /vector-stats — Qdrant collections composition (points, config, linkage, payload, storage).
router.get('/vector-stats', async (req, res) => {
    try {
        const stats = await getVectorStatsService().getVectorStats();
        res.json({ success: true, ...stats });
    } catch (e) {
        console.error('[KnowledgeDashboard] vector-stats error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
