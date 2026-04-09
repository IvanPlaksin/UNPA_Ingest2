/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG ROUTES
 * REST API routes for AOPEG graph and execution management
 * Base path: /api/v1/aopeg
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/aopeg.controller');

// ────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ────────────────────────────────────────────────────────────────────────────

router.get('/health', controller.healthCheck);

// ────────────────────────────────────────────────────────────────────────────
// GRAPH ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

// List all graphs
router.get('/graphs', controller.listGraphs);

// Get specific graph
router.get('/graphs/:graphId', controller.getGraph);

// Create new graph
router.post('/graphs', controller.createGraph);

// Update graph
router.put('/graphs/:graphId', controller.updateGraph);

// Delete graph
router.delete('/graphs/:graphId', controller.deleteGraph);

// Activate graph (DRAFT -> ACTIVE)
router.post('/graphs/:graphId/activate', controller.activateGraph);

// Validate graph
router.post('/graphs/:graphId/validate', controller.validateGraph);

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

// Execute a graph
router.post('/execute/:graphId', controller.executeGraph);

// List executions
router.get('/executions', controller.listExecutions);

// Get active executions
router.get('/executions/active', controller.getActiveExecutions);

// Get specific execution
router.get('/executions/:executionId', controller.getExecution);

// Cancel execution
router.post('/executions/:executionId/cancel', controller.cancelExecution);

// SSE stream for execution updates
router.get('/stream/:executionId', controller.streamExecution);

// ────────────────────────────────────────────────────────────────────────────
// REGISTRY ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

// List registered executors
router.get('/registry/executors', controller.listExecutors);

// List registered conditions
router.get('/registry/conditions', controller.listConditions);

// List registered transformers
router.get('/registry/transformers', controller.listTransformers);

// ────────────────────────────────────────────────────────────────────────────
// STATISTICS
// ────────────────────────────────────────────────────────────────────────────

// Get AOPEG statistics
router.get('/stats', controller.getStats);

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLES
// ────────────────────────────────────────────────────────────────────────────

// Get example graphs
router.get('/examples', controller.getExamples);

// Import an example graph
router.post('/examples/:exampleId/import', controller.importExample);

// ────────────────────────────────────────────────────────────────────────────
// PATTERN LIBRARY (Feedback Loop)
// ────────────────────────────────────────────────────────────────────────────

// Get pattern library stats
router.get('/patterns/stats', controller.getPatternStats);

// Warmup pattern cache
router.post('/patterns/warmup', controller.warmupPatterns);

// Get best pattern for category
router.get('/patterns/:category', controller.getPattern);

module.exports = router;
