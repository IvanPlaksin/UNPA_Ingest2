'use strict';
/**
 * Knowledge Health Dashboard Routes
 *
 * GET  /api/v1/knowledge-health/system              — system-wide health score
 * GET  /api/v1/knowledge-health/namespaces          — all namespaces summary
 * GET  /api/v1/knowledge-health/namespaces/:ns      — namespace detail
 * GET  /api/v1/knowledge-health/namespaces/:ns/activity — activity feed
 * GET  /api/v1/knowledge-health/namespaces/:ns/export   — CSV/JSON export
 */

const express = require('express');
const { knowledgeHealthService } = require('../services/knowledge/knowledge-health.service');

const router = express.Router();

function wrap(fn) {
    return async (req, res) => {
        try {
            const result = await fn(req, res);
            if (result !== undefined) res.json({ success: true, data: result });
        } catch (e) {
            console.error('[KnowledgeHealthRoute]', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    };
}

router.get('/system', wrap(async () => knowledgeHealthService.getSystemHealth()));

router.get('/namespaces', wrap(async () => knowledgeHealthService.getNamespaces()));

router.get('/namespaces/:ns/activity', wrap(async (req) => {
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    return knowledgeHealthService.getActivity(req.params.ns, limit);
}));

router.get('/namespaces/:ns/export', async (req, res) => {
    try {
        const { ns } = req.params;
        const fmt = req.query.format || 'json';
        const result = await knowledgeHealthService.exportNamespace(ns, fmt);
        if (fmt === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="knowledge-health-${ns}.csv"`);
            return res.send(result);
        }
        res.json({ success: true, data: result });
    } catch (e) {
        console.error('[KnowledgeHealthRoute] export error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/namespaces/:ns', wrap(async (req) => knowledgeHealthService.getNamespaceDetail(req.params.ns)));

module.exports = router;
