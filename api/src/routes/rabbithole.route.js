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
