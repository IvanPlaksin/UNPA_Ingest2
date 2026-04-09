// src/routes/rabbithole.route.js
const express = require('express');
const router = express.Router();
const adoService = require('../services/ado.service');
const rabbitholeService = require('../services/rabbithole.service');

// POST /api/v1/rabbithole/search
router.post('/search', async (req, res) => {
    try {
        const filters = req.body.filters || {};
        const page = req.body.page || 1;
        const limit = req.body.limit || 20;
        console.log(`[RabbitHole] Search filters: ${JSON.stringify(filters)}, page: ${page}, limit: ${limit}`);

        const result = await adoService.searchWorkItems(filters, page, limit);

        if (result.error) {
            return res.status(500).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error("[RabbitHole] Search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST /api/v1/rabbithole/chat
router.post('/chat', async (req, res) => {
    try {
        const { message, filters, visibleItems } = req.body;
        console.log("[RabbitHole] Chat message:", message);

        const response = await rabbitholeService.chat(message, filters, visibleItems);

        res.json(response);
    } catch (error) {
        console.error("[RabbitHole] Chat error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// MSSQL INGESTION (SSE)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/rabbithole/ingest/mssql
 * Start MSSQL ingestion pipeline with SSE progress.
 * Body: { domainId, connectionName, schema?, skipLLM? }
 *
 * Returns Server-Sent Events:
 *   data: { phase, message, progress }
 *   ...
 *   data: { phase: "done"|"error", summary: {...} }
 */
router.post('/ingest/mssql', async (req, res) => {
    const { domainId, connectionName, schema, skipLLM } = req.body;

    if (!domainId || !connectionName) {
        return res.status(400).json({
            success: false,
            error: 'domainId and connectionName are required'
        });
    }

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    const sendSSE = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let clientDisconnected = false;
    req.on('close', () => { clientDisconnected = true; });

    console.log(`[RabbitHole] MSSQL ingestion started: domain=${domainId}, source=${connectionName}`);

    try {
        const summary = await rabbitholeService.ingestFromMSSQL(
            { domainId, connectionName, schema, skipLLM },
            (phase, message, progress) => {
                if (!clientDisconnected) {
                    sendSSE({ phase, message, progress });
                }
            }
        );

        if (!clientDisconnected) {
            sendSSE({ phase: summary.success ? 'done' : 'error', message: 'Pipeline finished', progress: 100, summary });
        }
    } catch (error) {
        console.error('[RabbitHole] MSSQL ingestion fatal:', error);
        if (!clientDisconnected) {
            sendSSE({ phase: 'error', message: error.message, progress: -1 });
        }
    } finally {
        if (!clientDisconnected) {
            res.end();
        }
    }
});

/**
 * DELETE /api/v1/rabbithole/ingest/mssql/:cycleId
 * Rollback an extraction cycle
 */
router.delete('/ingest/mssql/:cycleId', async (req, res) => {
    try {
        const { cycleId } = req.params;
        const { MSSQLGraphGenerator } = require('../services/connectors');
        const memgraphService = require('../services/memgraph.service');
        const qdrantService = require('../services/qdrant.service');

        const generator = new MSSQLGraphGenerator(memgraphService, qdrantService);
        const result = await generator.deleteExtractionCycle(cycleId);

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[RabbitHole] Rollback error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/rabbithole/ingest/mssql/:cycleId/stats
 * Get extraction cycle statistics
 */
router.get('/ingest/mssql/:cycleId/stats', async (req, res) => {
    try {
        const { cycleId } = req.params;
        const { MSSQLGraphGenerator } = require('../services/connectors');
        const memgraphService = require('../services/memgraph.service');
        const qdrantService = require('../services/qdrant.service');

        const generator = new MSSQLGraphGenerator(memgraphService, qdrantService);
        const stats = await generator.getExtractionStats(cycleId);

        res.json({ success: true, stats });
    } catch (error) {
        console.error('[RabbitHole] Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/v1/rabbithole/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[RabbitHole] Get Work Item: ${id}`);

        const result = await adoService.getWorkItemById(id);

        if (!result) {
            return res.status(404).json({ error: "Work Item not found" });
        }

        res.json(result);
    } catch (error) {
        console.error("[RabbitHole] Get Work Item error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
