'use strict';

/**
 * Export Assistant API (/api/v1/export-assistant).
 *   GET  /tools          — list tool definitions
 *   POST /tools/:name    — execute a tool directly (used for testing + by the agent loop)
 *   POST /chat           — natural-language export assistant (TASK-GT-UI-005)
 */

const express = require('express');
const router = express.Router();
const { TOOLS, executeTool } = require('../services/export-assistant/tools');
const { ExportAssistantAgent } = require('../services/export-assistant/agent');

// GET /tools — the tool catalog
router.get('/tools', (req, res) => {
    res.json({ success: true, tools: TOOLS });
});

// POST /tools/:name — run one tool
router.post('/tools/:name', async (req, res) => {
    try {
        const result = await executeTool(req.params.name, req.body || {});
        res.json({ success: true, result });
    } catch (e) {
        if (/^Unknown tool/.test(e.message)) return res.status(404).json({ success: false, error: e.message });
        console.error('[ExportAssistant] tool error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /chat — natural-language export assistant (non-streaming)
router.post('/chat', async (req, res) => {
    try {
        const { messages } = req.body || {};
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, error: 'messages[] required' });
        }
        const result = await new ExportAssistantAgent().run(messages);
        res.json({ success: !result.error, ...result });
    } catch (e) {
        console.error('[ExportAssistant] chat error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /chat/stream — SSE streaming version
router.post('/chat/stream', async (req, res) => {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ success: false, error: 'messages[] required' });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
    try {
        for await (const event of new ExportAssistantAgent().chat(messages)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', content: e.message })}\n\n`);
    } finally {
        clearInterval(heartbeat);
        res.end();
    }
});

module.exports = router;
