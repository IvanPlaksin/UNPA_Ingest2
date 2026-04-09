/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI AGENT ROUTES
 * REST API routes for AI Graph Builder Agent
 * Base path: /api/v1/ai-agent
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ai-agent.controller');

// ────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ────────────────────────────────────────────────────────────────────────────

router.get('/health', controller.healthCheck);

// ────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

// Start a new session
router.post('/sessions', controller.startSession);

// Get session state
router.get('/sessions/:sessionId', controller.getSession);

// End session and get final graph
router.delete('/sessions/:sessionId', controller.endSession);

// ────────────────────────────────────────────────────────────────────────────
// CHAT ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

// Send message (non-streaming)
router.post('/sessions/:sessionId/chat', controller.chat);

// Send message (streaming via SSE)
router.post('/sessions/:sessionId/chat/stream', controller.chatStream);

// ────────────────────────────────────────────────────────────────────────────
// GRAPH OPERATIONS
// ────────────────────────────────────────────────────────────────────────────

// Import graph into session
router.post('/sessions/:sessionId/graph/import', controller.importGraph);

// Export current graph from session
router.get('/sessions/:sessionId/graph', controller.exportGraph);

// ────────────────────────────────────────────────────────────────────────────
// CONVERSATION HISTORY
// ────────────────────────────────────────────────────────────────────────────

// Get conversation history
router.get('/sessions/:sessionId/history', controller.getHistory);

// Clear conversation history
router.delete('/sessions/:sessionId/history', controller.clearHistory);

// ────────────────────────────────────────────────────────────────────────────
// TOOL OPERATIONS
// ────────────────────────────────────────────────────────────────────────────

// List available tools
router.get('/tools', controller.listTools);

// Execute a tool directly
router.post('/sessions/:sessionId/tools/:toolName', controller.executeTool);

// ────────────────────────────────────────────────────────────────────────────
// MODEL OPERATIONS
// ────────────────────────────────────────────────────────────────────────────

// List available AI models
router.get('/models', controller.listModels);

// Change session model
router.put('/sessions/:sessionId/model', controller.setSessionModel);

// ────────────────────────────────────────────────────────────────────────────
// USAGE MONITORING
// ────────────────────────────────────────────────────────────────────────────

// Get API usage statistics
router.get('/usage', controller.getUsageStats);

// Get formatted usage summary
router.get('/usage/summary', controller.getUsageSummary);

module.exports = router;
