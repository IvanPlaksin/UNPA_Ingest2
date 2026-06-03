'use strict';
/**
 * Triangle Explorer Routes
 *
 *   GET  /api/v1/explorer/processes                              — paginated process list with triangle summary
 *   GET  /api/v1/explorer/processes/:processId/triangle          — full triangle data for one process
 *   GET  /api/v1/explorer/processes/:processId/documents/:vertex — documents for a triangle vertex
 *   POST /api/v1/explorer/processes/:processId/link              — manually link document to process
 *   DELETE /api/v1/explorer/processes/:processId/link/:docId     — remove link
 */

const express = require('express');
const router  = express.Router();
const { triangleExplorerService } = require('../services/knowledge/triangle-explorer.service');
const { knowledgeTriangleService } = require('../services/knowledge/knowledge-triangle.service');

// ─── Process list ──────────────────────────────────────────────────────────────

// GET /api/v1/explorer/processes?namespace=KM&search=travel&completeness=partial&hasGaps=true&limit=50&offset=0
router.get('/processes', async (req, res) => {
    try {
        const { namespace, search, completeness, hasGaps, sortBy, limit, offset } = req.query;
        const results = await triangleExplorerService.listProcesses({
            namespace:   namespace   || null,
            search:      search      || null,
            completeness: completeness || null,
            hasGaps:     hasGaps === 'true',
            sortBy:      sortBy      || 'completeness',
            limit:       limit  ? parseInt(limit, 10)  : 50,
            offset:      offset ? parseInt(offset, 10) : 0
        });
        res.json({ success: true, count: results.length, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Triangle detail ───────────────────────────────────────────────────────────

// GET /api/v1/explorer/processes/:processId/triangle
router.get('/processes/:processId/triangle', async (req, res) => {
    try {
        const result = await triangleExplorerService.getProcessTriangle(req.params.processId);
        if (!result) return res.status(404).json({ success: false, error: 'Process not found' });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Documents by vertex ───────────────────────────────────────────────────────

// GET /api/v1/explorer/processes/:processId/documents/:vertexType
// vertexType: normative | operational | empirical
router.get('/processes/:processId/documents/:vertexType', async (req, res) => {
    try {
        const { processId, vertexType } = req.params;
        const allowed = ['normative', 'operational', 'empirical'];
        if (!allowed.includes(vertexType)) {
            return res.status(400).json({ success: false, error: `vertexType must be one of: ${allowed.join(', ')}` });
        }

        // Re-use triangle data, return only the requested vertex
        const triangle = await triangleExplorerService.getProcessTriangle(processId);
        if (!triangle) return res.status(404).json({ success: false, error: 'Process not found' });

        res.json({ success: true, data: triangle[vertexType] || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Link / Unlink ─────────────────────────────────────────────────────────────

// POST /api/v1/explorer/processes/:processId/link
// Body: { documentId, edgeType }
router.post('/processes/:processId/link', async (req, res) => {
    try {
        const { documentId, edgeType } = req.body;
        if (!documentId) return res.status(400).json({ success: false, error: 'documentId is required' });
        if (!edgeType)   return res.status(400).json({ success: false, error: 'edgeType is required (GOVERNS|OPERATIONALIZES|REVEALS_GAP_IN)' });

        const result = await triangleExplorerService.linkDocumentToProcess(
            req.params.processId, documentId, edgeType
        );
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        const code = err.message.includes('not found') ? 404
                   : err.message.includes('must be')   ? 400 : 500;
        res.status(code).json({ success: false, error: err.message });
    }
});

// DELETE /api/v1/explorer/processes/:processId/link/:docId
router.delete('/processes/:processId/link/:docId', async (req, res) => {
    try {
        const result = await triangleExplorerService.unlinkDocumentFromProcess(
            req.params.processId, req.params.docId
        );
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Gap management ─────────────────────────────────────────────────────────────

// PATCH /api/v1/explorer/gaps/:gapId/status
// Body: { status, resolution }
router.patch('/gaps/:gapId/status', async (req, res) => {
    try {
        const { status, resolution } = req.body;
        const allowed = ['OPEN', 'ACKNOWLEDGED', 'ADDRESSED', 'CLOSED'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, error: `status must be one of: ${allowed.join(', ')}` });
        }
        const result = await knowledgeTriangleService.updateGapStatus(
            req.params.gapId, status, resolution
        );
        res.json({ success: true, data: result });
    } catch (err) {
        const code = err.message.includes('not found') ? 404 : 500;
        res.status(code).json({ success: false, error: err.message });
    }
});

module.exports = router;
