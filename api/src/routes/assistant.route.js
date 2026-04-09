/**
 * GXE AI Assistant Routes
 *
 * GET  /session/:graphId — Load existing session by graph ID
 * POST /chat             — Chat with assistant (SSE streaming)
 * POST /execute          — Execute canvas graph via RuntimeEngine (SSE)
 * POST /undo             — Undo last graph action
 * POST /reset            — Reset session
 */

const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistant.controller');

router.get('/session/:graphId', assistantController.getSessionByGraph);
router.post('/chat', assistantController.chat);
router.post('/execute', assistantController.executeGraph);
router.post('/undo', assistantController.undo);
router.post('/reset', assistantController.resetSession);

module.exports = router;
