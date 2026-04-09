// api/src/routes/pipelineAnalysis.route.js
// Роуты для AI-анализа результатов pipeline

const express = require('express');
const router = express.Router();
const controller = require('../controllers/pipelineAnalysis.controller');

// Start analysis session
router.post('/:sessionId/start', controller.startAnalysis);

// Stream initial analysis
router.get('/:sessionId/stream', controller.streamAnalysis);

// Chat with follow-up questions
router.post('/:sessionId/chat', controller.chat);

// Get conversation history
router.get('/:sessionId/history', controller.getHistory);

module.exports = router;
