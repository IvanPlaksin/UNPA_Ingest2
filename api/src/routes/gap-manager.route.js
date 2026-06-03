'use strict';
/**
 * Gap Manager Routes
 *
 *   GET  /api/v1/gaps/dashboard         — summary stats + aging + by-type
 *   GET  /api/v1/gaps/list              — paginated gap list with filters
 *   GET  /api/v1/gaps/export            — download CSV or JSON
 *   GET  /api/v1/gaps/:gapId/escalation — escalation history + timeline
 *   POST /api/v1/gaps/:gapId/escalate   — record escalation event
 *   POST /api/v1/gaps/:gapId/snooze     — snooze gap
 *   POST /api/v1/gaps/bulk              — bulk status operations
 *
 * Note: Single-gap status update uses PATCH /api/v1/explorer/gaps/:gapId/status (triangle-explorer.route.js)
 */

const express = require('express');
const router  = express.Router();
const { gapManagerService } = require('../services/knowledge/gap-manager.service');

// ─── Static routes MUST come before :gapId routes ──────────────────────────

// GET /api/v1/gaps/dashboard?namespace=KM
router.get('/dashboard', async (req, res) => {
    try {
        const data = await gapManagerService.getDashboard(req.query.namespace || null);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/gaps/list?status=OPEN&severity=HIGH&minAgeDays=30&search=travel&limit=50&offset=0
router.get('/list', async (req, res) => {
    try {
        const { namespace, status, severity, minAgeDays, maxAgeDays, search, sortBy, sortDir, limit, offset } = req.query;
        const gaps = await gapManagerService.listGaps({
            namespace:   namespace   || null,
            status:      status      || null,
            severity:    severity    || null,
            minAgeDays:  minAgeDays  ? parseInt(minAgeDays, 10)  : null,
            maxAgeDays:  maxAgeDays  ? parseInt(maxAgeDays, 10)  : null,
            search:      search      || null,
            sortBy:      sortBy      || 'age',
            sortDir:     sortDir     || 'desc',
            limit:       limit  ? parseInt(limit, 10)  : 50,
            offset:      offset ? parseInt(offset, 10) : 0
        });
        res.json({ success: true, count: gaps.length, data: gaps });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/v1/gaps/export?format=csv&status=OPEN
router.get('/export', async (req, res) => {
    try {
        const { format = 'json', namespace, status, severity } = req.query;
        const data = await gapManagerService.exportGaps({ namespace, status, severity }, format);
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="gaps-export-${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(data);
        } else {
            res.json({ success: true, count: data.length, data });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/gaps/bulk
// Body: { gapIds: [], action: 'acknowledge'|'address'|'close'|'snooze'|'escalate', params: {} }
router.post('/bulk', async (req, res) => {
    try {
        const { gapIds, action, params: actionParams } = req.body;
        if (!gapIds?.length) return res.status(400).json({ success: false, error: 'gapIds is required' });
        if (!action) return res.status(400).json({ success: false, error: 'action is required' });

        const result = await gapManagerService.bulkUpdate(gapIds, action, actionParams || {});
        res.json({ success: true, data: result });
    } catch (err) {
        const code = err.message.includes('must be') ? 400 : 500;
        res.status(code).json({ success: false, error: err.message });
    }
});

// ─── Per-gap routes ─────────────────────────────────────────────────────────

// GET /api/v1/gaps/:gapId/escalation
router.get('/:gapId/escalation', async (req, res) => {
    try {
        const data = await gapManagerService.getEscalation(req.params.gapId);
        if (!data) return res.status(404).json({ success: false, error: 'Gap not found' });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/v1/gaps/:gapId/escalate
// Body: { escalateTo, notes }
router.post('/:gapId/escalate', async (req, res) => {
    try {
        const { escalateTo, notes } = req.body;
        const result = await gapManagerService.recordEscalation(req.params.gapId, { escalateTo, notes });
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        const code = err.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: err.message });
    }
});

// POST /api/v1/gaps/:gapId/snooze
// Body: { days }
router.post('/:gapId/snooze', async (req, res) => {
    try {
        const days = parseInt(req.body.days, 10) || 7;
        if (days < 1 || days > 365) {
            return res.status(400).json({ success: false, error: 'days must be between 1 and 365' });
        }
        const result = await gapManagerService.snoozeGap(req.params.gapId, days);
        res.json({ success: true, data: result });
    } catch (err) {
        const code = err.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: err.message });
    }
});

module.exports = router;
